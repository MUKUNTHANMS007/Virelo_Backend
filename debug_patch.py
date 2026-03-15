import modal
app = modal.App("anidoc-debug")
image = (
    modal.Image.debian_slim()
    .run_commands("git clone https://github.com/yihao-meng/AniDoc.git /workspace/AniDoc")
    .run_commands(
        "python -c \"import os; p='/workspace/AniDoc/scripts_infer/anidoc_inference.py'; c=open(p).read(); c=c.replace('from diffusers.utils import', 'import diffusers.utils; diffusers.utils.DIFFUSERS_CACHE = \\\"/tmp\\\"; from diffusers.utils import'); open(p,'w').write(c)\"",
        "python -c \"p='/workspace/AniDoc/scripts_infer/anidoc_inference.py'; l=open(p).readlines(); n=[]; [ (n.append(f'{l[i][:len(l[i])-len(l[i].lstrip())]}if \\\"control_images\\\" not in locals(): control_images = [load_image(each_sample)]\\n') if 'for j, each in enumerate(control_images):' in l[i] else None, n.append(l[i])) for i in range(len(l)) ]; open(p,'w').writelines(n)\""
    )
)
@app.function(image=image)
def check_file():
    p = "/workspace/AniDoc/scripts_infer/anidoc_inference.py"
    lines = open(p).readlines()
    for i, line in enumerate(lines):
        if "control_images" in line:
            print(f"{i+1:4}: {line}", end="")
@app.local_entrypoint()
def main():
    check_file.remote()
