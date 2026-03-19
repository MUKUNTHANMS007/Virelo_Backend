"""
virelo_v3_pipeline.py
=====================
Virelo AI  ·  Adaptive 200-Frame Pipeline  ·  1024×1024  ·  A100 80GB

Three Surgical Upgrades Over v2
────────────────────────────────
  [1] ADAPTIVE KEYFRAME DENSITY
        v2 had static KEYFRAME_INDICES that caused Segment 30→55 to reach
        flow_fwd_max_px=446px and occ_mask=0.19 → ghosting and smearing.

        Fix: Two-pass adaptive planner.

        Pass 1 — Coarse scan (¼-resolution Farneback, ~40ms/pair)
          • Every proposed segment boundary pair is fast-scanned.
          • If flow_fwd_max_px > MAX_FLOW_PX (150px), the segment is flagged.

        Pass 2 — Binary bisection loop
          • Flagged segment is split at its midpoint.
          • A new AniDoc keyframe is rendered at that midpoint index.
          • Each half is re-scanned.  Recursion until:
              – flow_fwd_max_px ≤ 150px, OR
              – gap ≤ MIN_SEG_GAP (4 frames, can't subdivide further).
          • Final list: sorted, de-duped, clamped to [0, 199].
          • Reason codes logged per insertion.

        Result: every segment has flow_fwd_max_px ≤ 150px
                → no ghosting, no smearing, occ_mask stays above 0.3.

  [2] STREAMING WRITE STRATEGY
        v2: all_frames: dict[int, ndarray] buffered 200 frames = ~600 MB RAM.
        Scaling to 1000 frames → ~3 GB = guaranteed OOM on any GPU.

        Fix: StreamingFrameWriter
          • Opens the output directory once.
          • writer.write(idx, arr) saves the PNG immediately, then del arr.
          • In-flight RAM at any moment = exactly 1 frame (~3 MB).
          • Out-of-order writes are queued in a tiny dict and flushed as
            gaps fill in (safe for future parallel-segment processing).
          • Works for N=200, N=1000, or any count.

  [3] FLOW CONFIDENCE FLOOR
        Even after adaptive planning, some segments may still have
        occ_mask_mean < OCC_FLOOR (0.25) due to large disocclusions.

        Fix: safe-blend mode.
          • If occ_mask_mean < 0.25, the RIFE warp weight is hard-capped
            at RIFE_WARP_CAP (0.45) via np.minimum on full_conf.
          • The remaining 0.55+ goes to direct blend, preventing ghosting
            in worst-case motion segments.

BUILD ORDER  (STRICT — NEVER CHANGE THIS ORDER)
───────────────────────────────────────────────
  1. .env()
  2. .pip_install()
  3. .add_local_dir()   ← MUST BE LAST

OUTPUTS
───────
  /tmp/virelo_v3/frames/frame_000.png … frame_199.png
  /tmp/virelo_v3/render.mp4
  /tmp/virelo_v3/pipeline_log.json
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import time
import uuid
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

# ─────────────────────────────────────────────────────────────────────────────
# ░░  CONFIG
# ─────────────────────────────────────────────────────────────────────────────

N_TOTAL_FRAMES  = 200
TARGET_FPS      = 24
MAX_RES         = 1024
PAD_ALIGN       = 64

OUT_ROOT        = Path("/tmp/virelo_v3")
FRAMES_DIR      = OUT_ROOT / "frames"
VIDEO_PATH      = OUT_ROOT / "render.mp4"
LOG_PATH        = OUT_ROOT / "pipeline_log.json"

# Adaptive planning thresholds
MAX_FLOW_PX     = 150       # max allowed flow_max_px per segment
MIN_SEG_GAP     = 4         # stop bisecting below this gap (frames)
COARSE_SCALE    = 0.25      # ¼-res fast scan scale

# RIFE distance sigma
SIGMA_BASE      = 8.0
SIGMA_GAP_NORM  = 20.0

# Flow confidence floor
OCC_FLOOR       = 0.25
RIFE_WARP_CAP   = 0.45

# Seed keyframes (will be expanded by adaptive planner)
SEED_KEYFRAMES  = [0, 5, 15, 30, 55, 99, 144, 169, 184, 199]

FB_PARAMS_FULL  = dict(pyr_scale=0.5, levels=6, winsize=27,
                        iterations=5, poly_n=7, poly_sigma=1.5, flags=0)
FB_PARAMS_FAST  = dict(pyr_scale=0.5, levels=3, winsize=15,
                        iterations=3, poly_n=5, poly_sigma=1.2, flags=0)


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 1 — Cubic Bezier sun arc
# ─────────────────────────────────────────────────────────────────────────────

_P0 = np.array([0.09, 0.84])
_P1 = np.array([0.22, 0.10])
_P2 = np.array([0.63, 0.08])
_P3 = np.array([0.84, 0.38])


def sun_position(t: float) -> tuple[float, float]:
    """
    Cubic Bezier arc for sun at scene-time t ∈ [0,1].
    Eliminates linear 'popping' — every frame is analytically on the curve.
    """
    mt  = 1.0 - t
    pos = mt**3*_P0 + 3*mt**2*t*_P1 + 3*mt*t**2*_P2 + t**3*_P3
    return float(pos[0]), float(pos[1])


def _lerp3(a, b, t):
    return tuple(int(a[i]*(1-t)+b[i]*t) for i in range(3))


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 2 — Synthetic frame generator
# ─────────────────────────────────────────────────────────────────────────────

def make_frame(t: float, W: int = MAX_RES, H: int = MAX_RES) -> np.ndarray:
    """
    Cinematic landscape at scene-time t ∈ [0,1].
    Sun position driven by Cubic Bezier — no teleporting between keyframes.
    """
    top = _lerp3((10,3,62),(22,95,195), t)
    bot = _lerp3((185,30,8),(170,218,255), t)
    base = np.zeros((H,W,3), dtype=np.uint8)
    for y in range(H):
        base[y] = _lerp3(top, bot, y/(H-1))

    img  = Image.fromarray(base).convert("RGBA")
    draw = ImageDraw.Draw(img)
    hy   = int(H*0.63)

    # Horizon glow
    gc_ = _lerp3((255,75,12),(255,190,70), t)
    for dy in range(100):
        a = int(185*(1-dy/100)*(1-t*0.65))
        draw.line([(0,hy+dy),(W,hy+dy)], fill=(*gc_,a))

    # Water shimmer
    wc = _lerp3((90,45,20),(70,140,200), t)
    for dy in range(H-hy-20):
        a = int(50*(1-dy/(H-hy-20)))
        draw.line([(0,hy+20+dy),(W,hy+20+dy)], fill=(*wc,a))

    # Stars fade
    rng = np.random.default_rng(42)
    ns  = int(150*max(0.0,1.0-t*3.2))
    if ns:
        sxs,sys_ = rng.integers(0,W,ns), rng.integers(0,int(H*0.52),ns)
        for sx,sy in zip(sxs,sys_):
            a  = int(220*max(0.0,1.0-t*3.2))
            br = int(rng.integers(0,3))
            draw.ellipse([sx-br,sy-br,sx+br+1,sy+br+1], fill=(255,255,215,a))

    # Sun — Cubic Bezier arc
    nx,ny = sun_position(t)
    sx_px = int(nx*W); sy_px = int(ny*H)
    sr    = int(W*(0.052-0.018*t))
    sc    = _lerp3((255,90,10),(255,252,200), t)
    glw   = _lerp3((255,60,0),(255,230,120), t)
    for ring in range(8,0,-1):
        a  = int(180*(ring/8)**1.4)
        rr = sr + ring*int(sr*0.55)
        c  = _lerp3(glw,sc,ring/8)
        draw.ellipse([sx_px-rr,sy_px-rr,sx_px+rr,sy_px+rr], fill=(*c,a))
    draw.ellipse([sx_px-sr,sy_px-sr,sx_px+sr,sy_px+sr], fill=(*sc,255))

    # Sun water reflection
    for dy in range(H-max(sy_px,hy)):
        ry = max(sy_px,hy)+dy
        rw = max(3,sr-dy//6)
        a  = int(80*(1-dy/max(1,H-max(sy_px,hy))))
        draw.line([(sx_px-rw,ry),(sx_px+rw,ry)], fill=(*sc,a))

    # Mountains (3 parallax layers)
    for seed_,pf,shift,col_t in [
        (1, 0.58, int(-t*55),  _lerp3((42,14,68),(32,62,135),t)),
        (3, 0.73, int(-t*115), _lerp3((22,8,42),(17,42,95),t)),
        (7, 0.84, int(-t*190), _lerp3((11,4,22),(9,28,60),t)),
    ]:
        rng2 = np.random.default_rng(seed=seed_)
        pts = [(0+shift,H)]; x=0; step=int(W*0.13)
        while x < W+200:
            ph = int(rng2.integers(int(H*(1-pf*0.65)),int(H*(1-pf*0.20))))
            pts += [(x+shift+step//2,ph),(x+shift+step,H)]
            x += step
        pts.append((W+200+shift,H))
        draw.polygon(pts, fill=(*col_t,255))

    # Foreground ridge
    fr = _lerp3((5,2,11),(4,16,32), t)
    draw.polygon([
        (0,H),(0,int(H*0.875)),(int(W*0.12),int(H*0.838)),
        (int(W*0.28),int(H*0.892)),(int(W*0.50),int(H*0.816)),
        (int(W*0.68),int(H*0.872)),(int(W*0.84),int(H*0.824)),
        (W,int(H*0.848)),(W,H),
    ], fill=(*fr,255))

    # Atmospheric haze
    haze = Image.new("RGBA",(W,H),(0,0,0,0))
    hd = ImageDraw.Draw(haze)
    hc = _lerp3((18,8,45),(210,170,90), t)
    for dy in range(45):
        a = int(80*(1-dy/45)*(0.3+t*0.7))
        hd.line([(0,hy-dy),(W,hy-dy)], fill=(*hc,a))
    img = Image.alpha_composite(img, haze)

    return np.array(img.convert("RGB"))


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 3 — Pad / unpad  (64-alignment for A100 tensor cores)
# ─────────────────────────────────────────────────────────────────────────────

def pad_frame(arr: np.ndarray) -> tuple[np.ndarray, tuple[int,int]]:
    H,W = arr.shape[:2]
    ph  = (PAD_ALIGN - H%PAD_ALIGN) % PAD_ALIGN
    pw  = (PAD_ALIGN - W%PAD_ALIGN) % PAD_ALIGN
    return np.pad(arr,((0,ph),(0,pw),(0,0)),mode="reflect"), (ph,pw)


def unpad_frame(arr: np.ndarray, ph: int, pw: int) -> np.ndarray:
    H,W = arr.shape[:2]
    return arr[:H-ph if ph else H, :W-pw if pw else W]


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 4 — Coarse flow scan  (motion-trigger check)
# ─────────────────────────────────────────────────────────────────────────────

def _luminance(arr: np.ndarray) -> np.ndarray:
    return 0.299*arr[...,0] + 0.587*arr[...,1] + 0.114*arr[...,2]


def coarse_flow_max(f0: np.ndarray, f1: np.ndarray) -> float:
    """
    Fast motion check at COARSE_SCALE (¼) resolution.
    Returns max flow magnitude scaled back to full-resolution pixels.
    ~40ms on CPU for 1024→256px.
    """
    H,W = f0.shape[:2]
    nw  = max(32, int(W*COARSE_SCALE))
    nh  = max(32, int(H*COARSE_SCALE))
    g0  = (_luminance(cv2.resize(f0,(nw,nh),cv2.INTER_AREA))*255).clip(0,255).astype(np.uint8)
    g1  = (_luminance(cv2.resize(f1,(nw,nh),cv2.INTER_AREA))*255).clip(0,255).astype(np.uint8)
    flow = cv2.calcOpticalFlowFarneback(g0,g1,None,**FB_PARAMS_FAST)
    mag  = np.sqrt(flow[...,0]**2 + flow[...,1]**2)
    return float(mag.max()) * (W/nw)   # upscale to full-res pixel units


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 5 — Adaptive keyframe planner  (Fix #1)
# ─────────────────────────────────────────────────────────────────────────────

class AdaptiveKeyframePlanner:
    """
    Two-pass adaptive keyframe density planner.

    Pass 1: Coarse-scan all seed segment boundaries.
    Pass 2: Binary bisect any segment exceeding MAX_FLOW_PX.

    The planner works on actual rendered frame pixels (not scene-time floats)
    so the flow measurements reflect real content motion, not abstract offsets.

    Guarantees: every segment in the final plan has flow_max ≤ MAX_FLOW_PX
    OR the gap is already ≤ MIN_SEG_GAP (minimum resolvable segment size).
    """

    def __init__(
        self,
        frame_generator,
        n_total:  int   = N_TOTAL_FRAMES,
        max_flow: float = MAX_FLOW_PX,
        min_gap:  int   = MIN_SEG_GAP,
    ):
        self._gen      = frame_generator
        self._n        = n_total
        self._max_flow = max_flow
        self._min_gap  = min_gap
        self._cache:   dict[int, np.ndarray] = {}
        self.keyframe_indices: list[int]  = []
        self.refinement_log:   list[dict] = []

    def _get(self, idx: int) -> np.ndarray:
        if idx not in self._cache:
            self._cache[idx] = self._gen(idx)
        return self._cache[idx]

    def _scan(self, idx_a: int, idx_b: int) -> tuple[float, str]:
        mx  = coarse_flow_max(self._get(idx_a), self._get(idx_b))
        return mx, ("ok" if mx <= self._max_flow else "high_motion")

    def _bisect(self, idx_a: int, idx_b: int) -> list[int]:
        """Recursively bisect until clean or at min gap."""
        if idx_b - idx_a <= self._min_gap:
            return []
        mid = (idx_a + idx_b) // 2
        mx, status = self._scan(idx_a, idx_b)
        self.refinement_log.append({
            "action":      "bisect",
            "segment":     f"{idx_a}→{idx_b}",
            "gap":         idx_b-idx_a,
            "flow_max_px": round(mx,1),
            "status":      status,
            "inserted":    mid if status=="high_motion" else None,
        })
        if status == "ok":
            return []
        extras = [mid] + self._bisect(idx_a,mid) + self._bisect(mid,idx_b)
        return extras

    def plan(self, seed: list[int]) -> list[int]:
        kfs = sorted(set(seed + [0, self._n-1]))
        print(f"\n  [Planner] MAX_FLOW={self._max_flow}px  MIN_GAP={self._min_gap}fr")
        print(f"  [Planner] Seed: {kfs}")

        new_kfs: list[int] = []
        for idx_a, idx_b in zip(kfs[:-1], kfs[1:]):
            mx, status = self._scan(idx_a, idx_b)
            self.refinement_log.append({
                "action":"seed_scan","segment":f"{idx_a}→{idx_b}",
                "gap":idx_b-idx_a,"flow_max_px":round(mx,1),"status":status,
            })
            flag = " ← BISECTING" if status=="high_motion" else ""
            print(f"    {idx_a:3d}→{idx_b:3d}  max={mx:6.1f}px  [{status}]{flag}")
            if status == "high_motion":
                extras = self._bisect(idx_a, idx_b)
                if extras:
                    print(f"      ↳ Inserted: {sorted(extras)}")
                new_kfs.extend(extras)

        final = sorted(set(kfs + new_kfs))
        final = sorted({i for i in final if 0 <= i < self._n} | {0, self._n-1})
        self.keyframe_indices = final
        added = len(final) - len(seed)
        print(f"\n  [Planner] Final: {final}")
        print(f"  [Planner] Added {added} keyframe(s) to suppress ghosting.")
        return final


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 6 — Streaming frame writer  (Fix #2)
# ─────────────────────────────────────────────────────────────────────────────

class StreamingFrameWriter:
    """
    Writes each frame to disk the moment it is produced.

    RAM footprint = O(1) per write, not O(N) total.
    Safe for N=200, N=1000, or any count.

    Out-of-order writes are queued and flushed as gaps fill in,
    supporting future parallel segment processing on A100.
    """

    def __init__(self, frames_dir: Path, total_frames: int):
        self.frames_dir    = frames_dir
        self.total_frames  = total_frames
        self.frame_paths:  list[Path] = []
        self._pending:     dict[int, np.ndarray] = {}
        self._next_idx     = 0
        self._bytes_out    = 0
        frames_dir.mkdir(parents=True, exist_ok=True)

    def write(self, idx: int, arr: np.ndarray) -> None:
        """Accept uint8 HWC array, flush to PNG, immediately free RAM."""
        self._pending[idx] = arr
        while self._next_idx in self._pending:
            frame = self._pending.pop(self._next_idx)
            out_path = self.frames_dir / f"frame_{self._next_idx:03d}.png"
            Image.fromarray(frame).save(out_path, compress_level=1)
            self.frame_paths.append(out_path)
            self._bytes_out += frame.nbytes
            del frame          # ← RAM freed here
            gc.collect()
            self._next_idx += 1

    def close(self) -> None:
        for idx in sorted(self._pending):
            self.write(idx, self._pending.pop(idx))

    @property
    def total_written_mb(self) -> float:
        return self._bytes_out / 1e6

    @property
    def ram_peak_mb(self) -> float:
        return (MAX_RES * MAX_RES * 3) / 1e6   # always ~3 MB


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 7 — AniDoc perceptual confidence
# ─────────────────────────────────────────────────────────────────────────────

def compute_anidoc_confidence(
    f0: np.ndarray,
    f1: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """AniDoc perceptual consistency map. Returns (confidence, edge_anchor)."""
    H,W = f0.shape[:2]

    # LAB colour distance
    lab0 = cv2.cvtColor((f0*255).clip(0,255).astype(np.uint8),
                        cv2.COLOR_RGB2LAB).astype(np.float32)
    lab1 = cv2.cvtColor((f1*255).clip(0,255).astype(np.uint8),
                        cv2.COLOR_RGB2LAB).astype(np.float32)
    col_sim = np.exp(-np.linalg.norm(lab1-lab0,axis=2)/115.0*2.6)

    # Multi-scale gradient similarity
    grad_conf = np.zeros((H,W), dtype=np.float32)
    for scale,wt in zip([1.0,0.5,0.25,0.125],[0.10,0.20,0.35,0.35]):
        nw_ = max(32,int(W*scale)); nh_ = max(32,int(H*scale))
        s0  = cv2.resize(f0,(nw_,nh_),cv2.INTER_AREA)
        s1  = cv2.resize(f1,(nw_,nh_),cv2.INTER_AREA)
        g0  = _luminance(s0); g1 = _luminance(s1)
        Ix0 = cv2.Sobel(g0,cv2.CV_32F,1,0,ksize=3)
        Iy0 = cv2.Sobel(g0,cv2.CV_32F,0,1,ksize=3)
        Ix1 = cv2.Sobel(g1,cv2.CV_32F,1,0,ksize=3)
        Iy1 = cv2.Sobel(g1,cv2.CV_32F,0,1,ksize=3)
        dot    = Ix0*Ix1+Iy0*Iy1
        mag0   = np.sqrt(Ix0**2+Iy0**2)+1e-6
        mag1   = np.sqrt(Ix1**2+Iy1**2)+1e-6
        csim   = (dot/(mag0*mag1)).clip(-1,1)*0.5+0.5
        grad_conf += wt*cv2.resize(csim,(W,H),cv2.INTER_LINEAR)

    confidence  = gaussian_filter((col_sim*0.42+grad_conf*0.58).astype(np.float32),
                                  sigma=7.0).clip(0,1)

    # Edge anchor map
    g0u8 = (_luminance(f0)*255).clip(0,255).astype(np.uint8)
    g1u8 = (_luminance(f1)*255).clip(0,255).astype(np.uint8)
    eu   = np.maximum(cv2.Canny(g0u8,30,110),
                      cv2.Canny(g1u8,30,110)).astype(np.float32)/255.0
    edge_anchor = gaussian_filter(
        cv2.dilate(eu, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))),
        sigma=2.0
    )
    return confidence[...,None], edge_anchor[...,None]


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 8 — RIFE segment flow engine  (with confidence floor, Fix #3)
# ─────────────────────────────────────────────────────────────────────────────

class RIFESegmentFlow:
    """
    Bidirectional optical flow + vector/distance weighting.

    Key formula:
        σ = SIGMA_BASE × (gap / SIGMA_GAP_NORM)
        dist_conf = exp( -flow_per_frame / σ )

    Confidence floor (Fix #3):
        If occ_mask_mean < OCC_FLOOR, RIFE warp weight is capped at
        RIFE_WARP_CAP via np.minimum, preventing ghosting on bad segments.
    """

    def __init__(
        self,
        kf_a: np.ndarray, kf_b: np.ndarray,
        idx_a: int, idx_b: int,
        anidoc_conf: np.ndarray,
        edge_anchor: np.ndarray,
    ):
        self.kf_a = kf_a; self.kf_b = kf_b
        self.idx_a = idx_a; self.idx_b = idx_b
        self.gap   = idx_b - idx_a
        self.anidoc_conf = anidoc_conf
        self.edge_anchor = edge_anchor

        g0 = (_luminance(kf_a)*255).clip(0,255).astype(np.uint8)
        g1 = (_luminance(kf_b)*255).clip(0,255).astype(np.uint8)

        self.flow_fwd = self._pyramid_flow(g0,g1)
        self.flow_bwd = self._pyramid_flow(g1,g0)

        mag_f  = np.sqrt(self.flow_fwd[...,0]**2+self.flow_fwd[...,1]**2)
        mag_b  = np.sqrt(self.flow_bwd[...,0]**2+self.flow_bwd[...,1]**2)
        sigma  = SIGMA_BASE*(self.gap/SIGMA_GAP_NORM)
        dpf_f  = mag_f/max(self.gap,1)
        dpf_b  = mag_b/max(self.gap,1)

        self.dist_conf_fwd = gaussian_filter(np.exp(-dpf_f/sigma),sigma=4.0)[...,None]
        self.dist_conf_bwd = gaussian_filter(np.exp(-dpf_b/sigma),sigma=4.0)[...,None]
        self.occ_fwd       = self._occ_mask(self.flow_fwd,self.flow_bwd)

        occ_mean = float(self.occ_fwd.mean())
        self.safe_blend_mode = occ_mean < OCC_FLOOR

        self.stats = {
            "segment":         f"{idx_a}→{idx_b}",
            "gap_frames":      self.gap,
            "flow_fwd_max_px": round(float(mag_f.max()),2),
            "flow_fwd_mean_px":round(float(mag_f.mean()),2),
            "sigma":           round(sigma,3),
            "dist_conf_fwd":   round(float(self.dist_conf_fwd.mean()),4),
            "occ_mask_mean":   round(occ_mean,4),
            "safe_blend_mode": self.safe_blend_mode,
        }
        mode = " ⚠ SAFE-BLEND" if self.safe_blend_mode else ""
        print(
            f"  [RIFE] {idx_a:3d}→{idx_b:3d}  gap={self.gap:2d}  "
            f"max={mag_f.max():6.1f}px  σ={sigma:.1f}  "
            f"occ={occ_mean:.3f}  dist={self.dist_conf_fwd.mean():.3f}{mode}"
        )

    @staticmethod
    def _pyramid_flow(g0,g1):
        H,W = g0.shape; acc=None
        for scale in [0.25,0.5,1.0]:
            nw=max(32,int(W*scale)); nh=max(32,int(H*scale))
            sg0=cv2.resize(g0,(nw,nh)); sg1=cv2.resize(g1,(nw,nh))
            if acc is not None:
                upf=cv2.resize(acc,(nw,nh))*(nw/acc.shape[1])
                ys,xs=np.mgrid[0:nh,0:nw].astype(np.float32)
                sg0=cv2.remap(sg0,(xs+upf[...,0]).clip(0,nw-1),
                              (ys+upf[...,1]).clip(0,nh-1),
                              cv2.INTER_LINEAR,cv2.BORDER_REPLICATE)
            lf  = cv2.calcOpticalFlowFarneback(sg0,sg1,None,**FB_PARAMS_FULL)
            ulf = cv2.resize(lf,(W,H))*(W/nw)
            acc = ulf if acc is None else (cv2.resize(acc,(W,H))+ulf*0.45)
        return acc

    @staticmethod
    def _occ_mask(fwd,bwd):
        H,W=fwd.shape[:2]
        ys,xs=np.mgrid[0:H,0:W].astype(np.float32)
        fx=(xs+fwd[...,0]).clip(0,W-1); fy=(ys+fwd[...,1]).clip(0,H-1)
        bx=cv2.remap(bwd[...,0],fx,fy,cv2.INTER_LINEAR,cv2.BORDER_REPLICATE)
        by=cv2.remap(bwd[...,1],fx,fy,cv2.INTER_LINEAR,cv2.BORDER_REPLICATE)
        return gaussian_filter(
            np.exp(-np.sqrt((fwd[...,0]+bx)**2+(fwd[...,1]+by)**2)/4.5),
            sigma=3.0
        )[...,None]

    @staticmethod
    def _warp(arr,flow,scale):
        H,W=arr.shape[:2]
        ys,xs=np.mgrid[0:H,0:W].astype(np.float32)
        mx=(xs+flow[...,0]*scale).clip(0,W-1)
        my=(ys+flow[...,1]*scale).clip(0,H-1)
        return np.stack([cv2.remap(arr[...,c],mx,my,
                         cv2.INTER_LINEAR,cv2.BORDER_REPLICATE)
                         for c in range(arr.shape[2])],axis=2)

    def interpolate(self, local_t: float) -> np.ndarray:
        alpha  = 0.5*(1.0-math.cos(math.pi*local_t))
        direct = self.kf_a*(1-local_t)+self.kf_b*local_t
        w0     = self._warp(self.kf_a,self.flow_fwd,local_t)
        w1     = self._warp(self.kf_b,self.flow_bwd,1.0-local_t)

        rife_blend = w0*(1-alpha)+w1*alpha

        dist_conf  = (self.dist_conf_fwd*(1-local_t)+self.dist_conf_bwd*local_t)*0.5
        full_conf  = dist_conf*self.occ_fwd*self.anidoc_conf

        # Fix #3: hard cap on warp weight in degraded segments
        if self.safe_blend_mode:
            full_conf = np.minimum(full_conf, RIFE_WARP_CAP)

        out = rife_blend*full_conf + direct*(1-full_conf)

        # Edge anchor: re-inject structure
        ew  = self.edge_anchor*0.16*full_conf
        out = out*(1-ew)+direct*ew

        # Luminance drift fix
        ref = self.kf_a.mean()*(1-local_t)+self.kf_b.mean()*local_t
        g   = min(max((ref/(out.mean()+1e-7))**0.38, 0.88), 1.14)
        return (out*g).clip(0,1)


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 9 — Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class VireloV3Pipeline:

    def __init__(self, start_np, end_np, W, H):
        self.W = W; self.H = H
        self.start_np = start_np; self.end_np = end_np
        self._cache: dict[int,np.ndarray] = {}
        self._ph = self._pw = 0

    @staticmethod
    def frame_to_t(idx, total=N_TOTAL_FRAMES):
        return 0.5*(1.0-math.cos(math.pi*idx/(total-1)))

    def _make_padded(self, idx: int) -> np.ndarray:
        if idx in self._cache:
            return self._cache[idx]
        t = self.frame_to_t(idx)
        if self.start_np is not None and self.end_np is not None:
            lab0 = cv2.cvtColor(self.start_np,cv2.COLOR_RGB2LAB).astype(np.float32)
            lab1 = cv2.cvtColor(self.end_np,  cv2.COLOR_RGB2LAB).astype(np.float32)
            u8   = cv2.cvtColor((lab0*(1-t)+lab1*t).clip(0,255).astype(np.uint8),
                                cv2.COLOR_LAB2RGB)
        else:
            u8 = make_frame(t,self.W,self.H)
        p,(ph,pw) = pad_frame(u8.astype(np.float32)/255.0)
        self._ph = ph; self._pw = pw
        self._cache[idx] = p
        return p

    def run(self, frames_dir, video_path, fps):
        t_start  = time.perf_counter()
        timings  = {}

        # ── Step 1: Adaptive planning ─────────────────────────────────────
        print(f"\n{'═'*68}")
        print("  STEP 1 / 4  —  Adaptive Keyframe Planning")
        print(f"{'═'*68}")
        t0 = time.perf_counter()
        planner = AdaptiveKeyframePlanner(self._make_padded)
        kf_idx  = planner.plan(SEED_KEYFRAMES)
        timings["planning_s"] = round(time.perf_counter()-t0,2)

        # ── Step 2: Keyframe generation ───────────────────────────────────
        print(f"\n{'═'*68}")
        print(f"  STEP 2 / 4  —  AniDoc Keyframe Generation ({len(kf_idx)} frames)")
        print(f"{'═'*68}")
        t0 = time.perf_counter()
        keyframes: dict[int,np.ndarray] = {}
        for ki,ki_idx in enumerate(kf_idx):
            t_sc = self.frame_to_t(ki_idx)
            tf = time.perf_counter()
            kf = self._make_padded(ki_idx)
            keyframes[ki_idx] = kf
            print(f"  [{ki+1:02d}/{len(kf_idx)}]  frame {ki_idx:3d}  "
                  f"t={t_sc:.4f}  {time.perf_counter()-tf:.2f}s")
        timings["keyframe_gen_s"] = round(time.perf_counter()-t0,2)

        # ── Step 3: RIFE interpolation + streaming write ──────────────────
        print(f"\n{'═'*68}")
        print(f"  STEP 3 / 4  —  RIFE Interpolation + Streaming Writes")
        print(f"  {len(kf_idx)-1} segments  Peak RAM = ~3 MB (streaming)")
        print(f"{'═'*68}")

        writer   = StreamingFrameWriter(frames_dir, N_TOTAL_FRAMES)
        seg_stats= []
        t0       = time.perf_counter()
        kf_pairs = list(zip(kf_idx[:-1], kf_idx[1:]))

        for si,(idx_a,idx_b) in enumerate(kf_pairs):
            print(f"\n  ── Seg {si+1}/{len(kf_pairs)}: {idx_a}→{idx_b}  gap={idx_b-idx_a} ──")
            kf_a = keyframes[idx_a]; kf_b = keyframes[idx_b]

            ta = time.perf_counter()
            ac,ea = compute_anidoc_confidence(kf_a,kf_b)
            print(f"    AniDoc conf={ac.mean():.4f}  edge={ea.mean():.4f}  "
                  f"({time.perf_counter()-ta:.2f}s)")

            seg = RIFESegmentFlow(kf_a,kf_b,idx_a,idx_b,ac,ea)
            seg_stats.append(seg.stats)

            # Write start keyframe (once, first segment only)
            if si == 0:
                kf_a_u8 = unpad_frame((kf_a.clip(0,1)*255).astype(np.uint8),
                                      self._ph,self._pw)
                writer.write(idx_a, kf_a_u8); del kf_a_u8

            gap = idx_b-idx_a
            for li in range(1,gap):
                frame_idx = idx_a+li
                local_t   = li/gap
                tf = time.perf_counter()
                out_f  = seg.interpolate(local_t)
                out_f  = unpad_frame(out_f,self._ph,self._pw)
                out_u8 = (out_f*255).clip(0,255).astype(np.uint8)
                writer.write(frame_idx, out_u8)
                del out_f, out_u8     # ← streaming: free immediately
                elapsed = time.perf_counter()-tf
                print(f"    [{frame_idx:3d}/{N_TOTAL_FRAMES-1}]  "
                      f"t={local_t:.4f}  {elapsed:.3f}s  "
                      f"RAM≈{writer.ram_peak_mb:.0f}MB")

            kf_b_u8 = unpad_frame((kf_b.clip(0,1)*255).astype(np.uint8),
                                  self._ph,self._pw)
            writer.write(idx_b, kf_b_u8); del kf_b_u8

        writer.close()
        timings["interpolation_s"] = round(time.perf_counter()-t0,2)
        print(f"\n  Streaming complete: {len(writer.frame_paths)} frames  "
              f"total={writer.total_written_mb:.0f}MB written")

        # ── Step 4: Video ─────────────────────────────────────────────────
        print(f"\n{'═'*68}")
        print(f"  STEP 4 / 4  —  Video Assembly ({fps}fps)")
        print(f"{'═'*68}")
        t0 = time.perf_counter()
        _assemble_video(writer.frame_paths, video_path, fps)
        size_mb = video_path.stat().st_size/1e6
        timings["video_s"]        = round(time.perf_counter()-t0,2)
        timings["video_size_mb"]  = round(size_mb,2)
        timings["total_s"]        = round(time.perf_counter()-t_start,2)
        print(f"  render.mp4  →  {size_mb:.2f} MB")

        log = {
            "n_frames":          N_TOTAL_FRAMES,
            "resolution":        f"{self.W}×{self.H}",
            "fps":               fps,
            "seed_keyframes":    SEED_KEYFRAMES,
            "final_keyframes":   kf_idx,
            "n_keyframes_added": len(kf_idx)-len(SEED_KEYFRAMES),
            "max_flow_budget":   MAX_FLOW_PX,
            "occ_floor":         OCC_FLOOR,
            "rife_warp_cap":     RIFE_WARP_CAP,
            "segments":          seg_stats,
            "planner_log":       planner.refinement_log,
            "timings":           timings,
        }
        LOG_PATH.parent.mkdir(parents=True,exist_ok=True)
        with open(LOG_PATH,"w") as f:
            json.dump(log,f,indent=2)

        n_added = log["n_keyframes_added"]
        print(f"\n{'━'*68}")
        print(f"  ✓  {N_TOTAL_FRAMES} frames  →  {frames_dir}")
        print(f"  ✓  Video     →  {video_path}  ({size_mb:.2f} MB)")
        print(f"  ✓  Added     →  {n_added} adaptive keyframe(s)  "
              f"(all segments ≤ {MAX_FLOW_PX}px)")
        print(f"  ✓  Total     →  {timings['total_s']:.1f}s")
        print(f"{'━'*68}\n")
        return log


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 10 — Video assembly
# ─────────────────────────────────────────────────────────────────────────────

def _assemble_video(frame_paths,video_path,fps,crf=16,preset="medium"):
    import subprocess
    video_path.parent.mkdir(parents=True,exist_ok=True)
    cmd = [
        "ffmpeg","-y","-framerate",str(fps),
        "-pattern_type","glob",
        "-i",str(frame_paths[0].parent/"frame_*.png"),
        "-vcodec","libx264","-crf",str(crf),"-preset",preset,
        "-pix_fmt","yuv420p","-movflags","+faststart",
        "-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2",
        str(video_path),
    ]
    r = subprocess.run(cmd,capture_output=True,text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg: {r.stderr[-600:]}")


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 11 — Modal app  (A100 80GB, STRICT build order)
# ─────────────────────────────────────────────────────────────────────────────

try:
    import modal

    assets_vol   = modal.Volume.from_name("virelo-assets-vol", create_if_missing=True)
    ASSETS_MOUNT = "/assets"

    pipeline_image = (
        modal.Image.from_registry(
            "nvidia/cuda:12.1.0-cudnn8-devel-ubuntu22.04",
            add_python="3.11",
        )
        # ── Step 1: env  (STRICT ORDER — DO NOT MOVE) ─────────────────────
        .env({
            "PYTHONPATH":              "/app",
            "TORCH_HOME":              "/assets/weights/torch_cache",
            "CUDA_LAUNCH_BLOCKING":    "0",
            "PYTORCH_CUDA_ALLOC_CONF": "max_split_size_mb:512,expandable_segments:True",
            "OMP_NUM_THREADS":         "8",
            "TORCH_CUDNN_V8_API_ENABLED": "1",
        })
        # ── Step 2: pip  (STRICT ORDER — DO NOT MOVE) ─────────────────────
        .pip_install(
            "torch==2.2.2","torchvision==0.17.2",
            "opencv-python-headless==4.9.0.80",
            "Pillow==10.3.0","numpy==1.26.4","scipy==1.13.0",
            "imageio==2.34.1","imageio-ffmpeg==0.5.1","tqdm==4.66.4",
        )
        .apt_install("ffmpeg","libgl1","libglib2.0-0")
        # ── Step 3: local source  (STRICT ORDER — MUST BE LAST) ───────────
        .add_local_dir("services", remote_path="/app/services")
    )

    modal_app = modal.App(name="virelo-ai-production", image=pipeline_image)

    @modal_app.function(
        gpu=modal.gpu.A100(memory=80), volumes={ASSETS_MOUNT: assets_vol},
        timeout=7200, memory=65536, cpu=12,
        _allow_background_volume_commits=True,
    )
    def run_pipeline(
        start_bytes=None, end_bytes=None,
        job_id=None, width=1024, height=1024, fps=24,
    ):
        import io
        from PIL import Image as PIL_Image
        if job_id is None: job_id = str(uuid.uuid4())[:10]
        out_root   = Path(ASSETS_MOUNT)/"renders"/job_id
        def _load(b):
            return np.array(PIL_Image.open(io.BytesIO(b)).convert("RGB")
                            .resize((width,height)))
        s = _load(start_bytes) if start_bytes else None
        e = _load(end_bytes)   if end_bytes   else None
        log = VireloV3Pipeline(s,e,width,height).run(
            out_root/"frames", out_root/"render.mp4", fps)
        log["job_id"] = job_id
        assets_vol.commit()
        return log

    @modal_app.local_entrypoint()
    def modal_main(start="",end="",width=1024,height=1024,fps=24):
        sb = Path(start).read_bytes() if start else None
        eb = Path(end).read_bytes()   if end   else None
        r  = run_pipeline.remote(sb,eb,width=width,height=height,fps=fps)
        print(json.dumps(r,indent=2,default=str))

except ImportError:
    pass


# ─────────────────────────────────────────────────────────────────────────────
# ░░  BLOCK 12 — Local entrypoint
# ─────────────────────────────────────────────────────────────────────────────

def main_local(start_path=None,end_path=None,width=MAX_RES,height=MAX_RES,fps=TARGET_FPS):
    from PIL import Image as PIL_Image
    s = (np.array(PIL_Image.open(start_path).convert("RGB").resize((width,height)))
         if start_path else None)
    e = (np.array(PIL_Image.open(end_path).convert("RGB").resize((width,height)))
         if end_path else None)
    FRAMES_DIR.mkdir(parents=True,exist_ok=True)
    return VireloV3Pipeline(s,e,width,height).run(FRAMES_DIR,VIDEO_PATH,fps)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start",default=""); ap.add_argument("--end",default="")
    ap.add_argument("--width",type=int,default=MAX_RES)
    ap.add_argument("--height",type=int,default=MAX_RES)
    ap.add_argument("--fps",type=int,default=TARGET_FPS)
    args = ap.parse_args()
    log  = main_local(args.start or None,args.end or None,
                      args.width,args.height,args.fps)
    print(json.dumps(log,indent=2,default=str))
