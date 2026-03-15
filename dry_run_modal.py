import os
import subprocess
import modal
import sys

app = modal.App("anidoc-deployment")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6", "libgl1")
    .pip_install(
        "numpy<2.0.0",
        "torch==2.1.2",
        "torchvision==0.16.2",
        "diffusers==0.24.0",
        "transformers==4.27.0",
        "huggingface-hub==0.19.4",
        "xformers==0.0.23.post1",
        "accelerate==0.27.2",
        "triton==2.1.0",
        "colorlog",
        "gradio==3.50.2",
        "pyparsing==3.0.9",
        "einops",
        "omegaconf",
        "timm",
        "safetensors",
        "hf-transfer",
        "opencv-python",
        "matplotlib",
        "scipy",
        "scikit-image",
        "av",
        "decord",
        "imageio",
        "kornia",
        "pyparsing",
        "moviepy",
        "pyyaml",
        "basicsr"
    )
    .run_commands("pip install --no-deps xformers==0.0.23.post1")
    .run_commands("git clone https://github.com/yihao-meng/AniDoc.git /workspace/AniDoc")
    .run_commands("pip install -e /workspace/AniDoc/cotracker")
    .run_commands(
        "find /workspace/AniDoc -name '*.py' -exec sed -i 's/from diffusers.utils import/import diffusers.utils; diffusers.utils.DIFFUSERS_CACHE = \"\"; from diffusers.utils import/g' {} +"
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1", 
        "TRANSFORMERS_NO_ADVISORY_WARNINGS": "1", 
        "HF_HUB_DISABLE_SYMLINKS_WARNING": "1",
        "PYTHONUNBUFFERED": "1"
    })
    .run_commands(
        "huggingface-cli download Yhmeng1106/anidoc --local-dir /workspace/AniDoc/pretrained_weights/anidoc --exclude '*.bin' '*.ckpt'",
        "mv /workspace/AniDoc/pretrained_weights/anidoc/anidoc/* /workspace/AniDoc/pretrained_weights/anidoc/",
        "rm -rf /workspace/AniDoc/pretrained_weights/anidoc/anidoc"
    )
    .run_commands(
        "huggingface-cli download stabilityai/stable-video-diffusion-img2vid-xt --local-dir /workspace/AniDoc/pretrained_weights/stable-video-diffusion-img2vid-xt --exclude '*.bin' '*.ckpt' '*.pt' 'svd_xt.safetensors' 'svd_xt_image_decoder.safetensors'"
    )
)

@app.function(image=image, gpu="A100")
def dry_run():
    import os
    import sys
    import subprocess
    sys.path.append("/workspace/AniDoc")
    sys.path.append("/workspace/AniDoc/cotracker")
    os.chdir("/workspace/AniDoc")
    env = os.environ.copy()
    env["PYTHONPATH"] = "/workspace/AniDoc:/workspace/AniDoc/cotracker"
    print("--- Dry Run Start ---")
    res = subprocess.run(["python", "scripts_infer/anidoc_inference.py", "--help"], capture_output=True, text=True, env=env)
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
    return res.returncode

@app.local_entrypoint()
def main():
    code = dry_run.remote()
    print(f"Dry run exit code: {code}")
