import json, subprocess, shutil, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CLI = ROOT / "scripts" / "orchestrator_cli.js"


def orchestrator_analyze(text: str, lang: str = "sv", dialog=None) -> dict:
    if not shutil.which("node"):
        raise RuntimeError("Node saknas i PATH")
    if not CLI.exists():
        raise FileNotFoundError(f"Saknar CLI: {CLI}")
    payload = {"text": text, "lang": lang}
    if dialog:
        payload["dialog"] = dialog
    p = subprocess.run(
        ["node", str(CLI)],
        input=json.dumps(payload).encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if p.returncode != 0:
        err = p.stderr.decode("utf-8", "ignore")
        raise RuntimeError(f"orchestrator_cli fail: {err}")
    return json.loads(p.stdout.decode("utf-8"))


