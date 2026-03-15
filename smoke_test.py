import modal
app = modal.App("smoke-test")
@app.function()
def test_remote():
    return "REMOTE_OK"
@app.local_entrypoint()
def main():
    print("ENTRYPOINT_START", flush=True)
    res = test_remote.remote()
    print(f"ENTRYPOINT_END: {res}", flush=True)
