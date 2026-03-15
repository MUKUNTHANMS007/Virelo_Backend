import os
import subprocess
import modal
import sys

print("[TOP-LEVEL] Script started", flush=True)

app = modal.App("anidoc-stable-rollback")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6", "libgl1")
    .pip_install(
        "numpy<2.0.0", "torch==2.1.2", "torchvision==0.16.2", "diffusers==0.24.0",
        "transformers==4.27.0", "huggingface-hub==0.19.4", "xformers==0.0.23.post1",
        "accelerate==0.27.2", "colorlog", "gradio==3.50.2", "pyparsing==3.0.9",
        "moviepy==1.0.3", "decorator<5.0.0", "einops", "omegaconf", "timm",
        "safetensors", "hf-transfer", "opencv-python", "matplotlib", "scipy",
        "scikit-image", "av", "decord", "imageio", "kornia", "pyyaml", "basicsr"
    )
    .run_commands("pip install --no-deps xformers==0.0.23.post1")
    .run_commands("git clone https://github.com/yihao-meng/AniDoc.git /workspace/AniDoc")
    .run_commands("pip install -e /workspace/AniDoc/cotracker")
    .run_commands(
        # Patch anidoc_inference.py for Stable Master Copy settings
        "python -c \"import os; p='/workspace/AniDoc/scripts_infer/anidoc_inference.py'; c=open(p).read(); c=c.replace('from diffusers.utils import', 'import diffusers.utils; diffusers.utils.DIFFUSERS_CACHE = \\\"/tmp\\\"; from diffusers.utils import'); c=c.replace('parser.add_argument(\\\"--noise_aug\\\", type=float, default=0.02)', 'parser.add_argument(\\\"--noise_aug\\\", type=float, default=0.02); parser.add_argument(\\\"--motion_bucket_id\\\", type=int, default=127); parser.add_argument(\\\"--fps\\\", type=int, default=7); parser.add_argument(\\\"--controlnet_cond_scale\\\", type=float, default=1.0); parser.add_argument(\\\"--max_guidance_scale\\\", type=float, default=5.5); parser.add_argument(\\\"--min_guidance_scale\\\", type=float, default=1.5); parser.add_argument(\\\"--guidance_rescale\\\", type=float, default=0.0)'); c=c.replace('conditional_pixel_values.repeat(1,14,1,1,1)', 'conditional_pixel_values.repeat(1,args.num_frames,1,1,1)'); c=c.replace('num_frames=14,', 'num_frames=args.num_frames,'); c=c.replace('motion_bucket_id=127,', 'motion_bucket_id=args.motion_bucket_id,'); c=c.replace('fps=7,', 'fps=args.fps,'); c=c.replace('generator=generator,', 'max_guidance_scale=args.max_guidance_scale, min_guidance_scale=args.min_guidance_scale, controlnet_cond_scale=args.controlnet_cond_scale, guidance_rescale=args.guidance_rescale, generator=generator,'); open(p,'w').write(c)\"",
        # Patch AniDoc.py for standard deviation normalization (Secret Sauce)
        "python -c \"import os; p='/workspace/AniDoc/pipelines/AniDoc.py'; c=open(p).read(); c=c.replace('batch_size=1,', 'batch_size=1, guidance_rescale=0.0,'); c=c.replace('noise_pred = noise_pred_uncond + self.guidance_scale * (noise_pred_cond - noise_pred_uncond)', 'noise_pred = noise_pred_uncond + self.guidance_scale * (noise_pred_cond - noise_pred_uncond)\\n                if guidance_rescale > 0.0:\\n                    std_text = noise_pred_cond.std(dim=list(range(1, noise_pred_cond.ndim)), keepdim=True)\\n                    std_cfg = noise_pred.std(dim=list(range(1, noise_pred.ndim)), keepdim=True)\\n                    noise_pred_rescaled = noise_pred * (std_text / std_cfg)\\n                    noise_pred = guidance_rescale * noise_pred_rescaled + (1.0 - guidance_rescale) * noise_pred'); open(p,'w').write(c)\""
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "TRANSFORMERS_NO_ADVISORY_WARNINGS": "1", "PYTHONUNBUFFERED": "1"})
    .run_commands(
        "huggingface-cli download Yhmeng1106/anidoc --local-dir /workspace/AniDoc/pretrained_weights/anidoc --exclude '*.bin' '*.ckpt'",
        "if [ -d /workspace/AniDoc/pretrained_weights/anidoc/anidoc ]; then mv /workspace/AniDoc/pretrained_weights/anidoc/anidoc/* /workspace/AniDoc/pretrained_weights/anidoc/ && rm -rf /workspace/AniDoc/pretrained_weights/anidoc/anidoc; fi",
        "huggingface-cli download stabilityai/stable-video-diffusion-img2vid-xt --local-dir /workspace/AniDoc/pretrained_weights/stable-video-diffusion-img2vid-xt --exclude '*.bin' '*.ckpt' '*.pt' 'svd_xt.safetensors' 'svd_xt_image_decoder.safetensors'",
        "huggingface-cli download facebook/cotracker cotracker2.pth --local-dir /workspace/AniDoc/pretrained_weights"
    )
)

@app.function(image=image, gpu="A100", timeout=7200)
def run_custom_animation(ref_image_bytes: bytes, control_image_bytes: bytes, num_frames: int = 24):
    import os, sys, subprocess
    import io
    from PIL import Image
    import numpy as np
    
    sys.path.append("/workspace/AniDoc")
    sys.path.append("/workspace/AniDoc/cotracker")
    
    os.makedirs("/workspace/inputs/sequence", exist_ok=True)
    os.makedirs("/workspace/AniDoc/outputs", exist_ok=True)
    
    with open("/workspace/inputs/ref.png", "wb") as f: f.write(ref_image_bytes)
    
    img1 = Image.open(io.BytesIO(ref_image_bytes)).convert("RGB")
    img2 = Image.open(io.BytesIO(control_image_bytes)).convert("RGB")
    
    # Stable 512x512 alignment
    img1_512 = img1.resize((512, 512), Image.LANCZOS)
    img2_512 = img2.resize((512, 512), Image.LANCZOS)
    
    for i in range(num_frames):
        alpha = i / (num_frames - 1)
        blended = Image.blend(img1_512, img2_512, alpha)
        blended.save(f"/workspace/inputs/sequence/frame_{i:02d}.png")
    
    os.chdir("/workspace/AniDoc")
    env = os.environ.copy()
    env["PYTHONPATH"] = "/workspace/AniDoc:/workspace/AniDoc/cotracker"
    
    # Reverting to the high-fidelity 512x512 Master Copy settings
    cmd = [
        "python", "-u", "scripts_infer/anidoc_inference.py",
        "--all_sketch", "--tracking",
        "--width", "512", "--height", "512",
        "--ref_image", "/workspace/inputs/ref.png",
        "--control_image", "/workspace/inputs/sequence",
        "--output_dir", "outputs",
        "--num_frames", str(num_frames),
        "--motion_bucket_id", "60",
        "--controlnet_cond_scale", "1.3",
        "--fps", "24",
        "--max_points", "50",
        "--noise_aug", "0.01",
        "--max_guidance_scale", "6.0",
        "--min_guidance_scale", "1.5",
        "--guidance_rescale", "0.7",
        "--seed", "42"
    ]
    
    print(f"[REMOTE] Starting Stable 512x512 Rollback Run...", flush=True)
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, text=True)
    out = ""
    for line in process.stdout:
        print(line, end="", flush=True)
        out += line
    process.wait()
    
    if process.returncode != 0: return {"error": f"Failed {process.returncode}", "log": out}
    
    for root, _, files in os.walk("/workspace/AniDoc/outputs"):
        for file in files:
            if file.endswith(".mp4"):
                with open(os.path.join(root, file), "rb") as f: return {"video": f.read(), "log": out}
    return {"error": "no_mp4", "log": out}

if __name__ == "__main__":
    local_ref = "virelo-ai-worker/inputs/Test_01.jpeg"
    local_ctrl = "virelo-ai-worker/inputs/Test02.jpeg"
    
    with app.run():
        print("[ORCHESTRATOR] Rolling back to stable 512x512 Master Copy...", flush=True)
        with open(local_ref, "rb") as r, open(local_ctrl, "rb") as c:
            res = run_custom_animation.remote(r.read(), c.read())
        
        if "video" in res:
            with open("nefra_animation_result.mp4", "wb") as f: f.write(res["video"])
            print("[SUCCESS] Stable 512x512 result saved to nefra_animation_result.mp4")
        else:
            print(f"[ERROR] {res.get('error')}")
            print("--- LOG ---")
            print(res.get("log", "N/A"))
