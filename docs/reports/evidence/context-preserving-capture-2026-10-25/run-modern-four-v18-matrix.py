"""Run each modern local model through all four demos and both runtimes.

No model downloads occur. Every app/backend flow gets its own receipt directory;
unsupported streaming remains visible as an unsupported/failed receipt.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT_BASE = Path("tmp/real-e2e/remaining-models-20261025/modern-four-v18")
JFK = Path("../speech-recognition/tests/fixtures/jfk2.en.wav")
JFK_SHA = "59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e"
JFK_ORACLE = "And so my fellow Americans ask not what your country can do for you ask what you can do for your country"
RUSSIAN_FIXTURE = Path("N:/models/gigaam/official-cache/example.wav")
RUSSIAN_SHA = "d8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69"
RUSSIAN_ORACLE = (
    "Ничьих не требуя похвал, Счастлив уж я надеждой сладкой, "
    "Что дева с трепетом любви Посмотрит, может быть, украдкой "
    "На песни грешные мои. У лукоморья дуб зелёный."
)
APPS = ("showcase", "realtime", "playground", "benchmark")
MODELS = {
    "sensevoice": {
        "id": "FunAudioLLM/SenseVoiceSmall",
        "dir": Path("N:/models/onnx/sensevoice/small"),
        "components": "single",
    },
    "gigaam-ctc": {
        "id": "gigaam-multilingual-ctc",
        "dir": Path("N:/models/onnx/gigaam/multilingual-ctc"),
        "components": "single",
    },
    "gigaam-rnnt": {
        "id": "gigaam-v3-e2e-rnnt",
        "dir": Path("N:/models/onnx/gigaam/v3-e2e-rnnt"),
        "components": "split",
        "fixture": RUSSIAN_FIXTURE,
        "sha": RUSSIAN_SHA,
        "oracle": RUSSIAN_ORACLE,
    },
    "x-asr": {
        "id": "x-asr-zh-en-160ms",
        "dir": Path("N:/models/x-asr/zh-en/chunk-160ms-model"),
        "components": "single",
    },
}


def run(args: argparse.Namespace) -> int:
    if args.model and args.model not in MODELS:
        raise SystemExit(f"Unknown --model {args.model!r}; choose from {', '.join(MODELS)}")
    root = ROOT_BASE if args.model is None else ROOT_BASE.with_name(ROOT_BASE.name + "-" + args.model)
    root.mkdir(parents=True, exist_ok=False)
    subprocess.run(
        [sys.executable, "tmp/real-e2e/capture-served-provenance.py", "--version", "v18", "--output-root", str(root)],
        check=True,
    )
    results: list[dict] = []
    selected = {args.model: MODELS[args.model]} if args.model else MODELS
    for key, model in selected.items():
        fixture = model.get("fixture", JFK)
        oracle = model.get("oracle", JFK_ORACLE)
        expected_sha = model.get("sha", JFK_SHA)
        for backend in ("webgpu", "wasm"):
            for app in APPS:
                output = root / key / backend / app
                profile = Path(f"C:/Users/steam/AppData/Local/Temp/asrjs-modern-v18-{key}-{backend}-{app}")
                command = [
                    sys.executable,
                    "scripts/e2e/remaining-model-flows.py",
                    "--app", app,
                    "--model-id", model["id"],
                    "--source", "local",
                    "--descriptor-sources", "local",
                    "--model-dir", str(model["dir"]),
                    "--backend", backend,
                    "--fixture", str(fixture),
                    "--oracle", oracle,
                    "--expected-fixture-sha256", expected_sha,
                    "--output-dir", str(output),
                    "--profile-dir", str(profile),
                    "--load-timeout-ms", "300000",
                    "--flow-timeout-ms", "300000",
                ]
                if app in ("showcase", "realtime"):
                    decoder_backend = backend if model["components"] == "split" else "wasm"
                    command += ["--encoder-backend", backend, "--decoder-backend", decoder_backend]
                if app == "realtime":
                    command += [
                        "--capture-mic-pcm",
                        "--mic-flow", "manual",
                        "--mic-flow", "speech-detect:vad-only:ten-vad",
                        "--mic-flow", "speech-detect:vad-only:firered-vad",
                    ]
                if app == "playground":
                    command += ["--record-mic", "--run-streaming"]
                log_path = root / key / f"{backend}-{app}.log"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                with log_path.open("w", encoding="utf-8") as log:
                    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
                item = {
                    "model": key,
                    "app": app,
                    "backend": backend,
                    "exitCode": result.returncode,
                    "command": command,
                    "log": str(log_path),
                }
                results.append(item)
                (root / "parent-run-matrix.json").write_text(
                    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                print(json.dumps(item, ensure_ascii=True), flush=True)
    return 0 if all(item["exitCode"] == 0 for item in results) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=tuple(MODELS), help="Run one model family only")
    raise SystemExit(run(parser.parse_args()))
