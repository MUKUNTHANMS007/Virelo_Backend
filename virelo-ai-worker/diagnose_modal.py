import os
import subprocess
import modal

app = modal.App("anidoc-diagnostic")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6", "libgl1")
    .pip_install(
        "numpy<2.0.0",
        "torch==2.1.2",
        "torchvision==0.16.2",
        "diffusers==0.24.0",
        "transformers==4.27.0"
    )
    .run_commands("git clone https://github.com/yihao-meng/AniDoc.git /workspace/AniDoc")
)

@app.function(image=image)
def diagnostic():
    import sys
    sys.path.append("/workspace/AniDoc")
    
    print("--- Directory Listing ---")
    for root, dirs, files in os.walk("/workspace/AniDoc"):
        print(f"Root: {root}")
        print(f"Dirs: {dirs}")
        # print(f"Files: {files}")
        break  # Just top level for now
    
    print("\n--- sys.path ---")
    print(sys.path)
    
    print("\n--- Trying imports ---")
    try:
        import diffusers
        print(f"Diffusers: {diffusers.__version__}")
        import transformers
        print(f"Transformers: {transformers.__version__}")
        
        # Try importing from the repo
        os.chdir("/workspace/AniDoc")
        sys.path.insert(0, ".")
        from models_diffusers.unet_spatio_temporal_condition import UNetSpatioTemporalConditionModel
        print("✅ Successfully imported UNetSpatioTemporalConditionModel")
    except Exception as e:
        print(f"❌ Import failed: {str(e)}")
        import traceback
        traceback.print_exc()

@app.local_entrypoint()
def main():
    diagnostic.remote()
