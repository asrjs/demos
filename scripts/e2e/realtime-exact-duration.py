"""Exercise real-model realtime transcription with a controlled PCM boundary.

The browser receives fake audio from ``--fixture``. After capture, this harness
intercepts the app's worker message and submits exactly ``--samples`` at 16 kHz.
Inference still runs through the app's real model and worker. This does not test
a physical microphone; ``physicalMicrophone`` therefore remains UNVERIFIED.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


DEMO_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = DEMO_ROOT.parent
DEFAULT_FIXTURE = (
    REPOSITORY_ROOT
    / "speech-recognition"
    / "tests"
    / "fixtures"
    / "jfk2.en.wav"
)
DEFAULT_OUTPUT_DIR = DEMO_ROOT / "tmp" / "real-e2e"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the realtime demo with a real local model and fixture audio, "
            "then submit an exact PCM sample count to its real inference worker."
        ),
    )
    parser.add_argument("--model-dir", type=Path, required=True, help="Local Parakeet v3 ONNX model directory.")
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE,
        help=f"Fake capture audio fixture (default: {DEFAULT_FIXTURE}).",
    )
    parser.add_argument("--browser-executable", type=Path, help="Browser executable; defaults to Playwright Chromium.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:4190/realtime/",
        help="Realtime app URL (default: %(default)s).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Receipt and screenshot directory (default: {DEFAULT_OUTPUT_DIR}).",
    )
    parser.add_argument("--samples", type=int, default=192000, help="Exact 16 kHz PCM samples submitted (default: %(default)s).")
    parser.add_argument("--phase", default="exact12", help="Receipt filename phase label (default: %(default)s).")
    args = parser.parse_args()
    if args.samples <= 0:
        parser.error("--samples must be positive")
    return args


def main() -> int:
    if not __debug__:
        raise RuntimeError("Run without -O: assertion checks must remain enabled")
    args = parse_args()
    fixture = args.fixture.resolve()
    model_dir = args.model_dir.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    stamp = f"{args.phase}-{int(time.time())}"
    receipt_path = output_dir / f"realtime-{stamp}.json"
    screenshot_path = output_dir / f"realtime-{stamp}.png"
    receipt = {
        "app": "realtime",
        "phase": args.phase,
        "requestedSamples": args.samples,
        "load": "UNVERIFIED",
        "file": "UNVERIFIED",
        "microphoneControlled": "UNVERIFIED",
        "physicalMicrophone": "UNVERIFIED",
        "console": [],
        "pageErrors": [],
        "requests": [],
    }
    browser = None
    try:
        with sync_playwright() as playwright:
            launch_options = {
                "headless": True,
                "args": [
                    "--use-fake-device-for-media-stream",
                    "--use-fake-ui-for-media-stream",
                    f"--use-file-for-fake-audio-capture={fixture}",
                ],
            }
            if args.browser_executable:
                launch_options["executable_path"] = str(args.browser_executable.resolve())
            browser = playwright.chromium.launch(**launch_options)
            context = browser.new_context(permissions=["microphone"])
            context.route("https://cdn.jsdelivr.net/**", lambda route: route.abort())
            page = context.new_page()
            page.set_default_timeout(45000)
            page.add_init_script(
                f"""(() => {{
                  window.__exactCapture = [];
                  const post = Worker.prototype.postMessage;
                  Worker.prototype.postMessage = function(message, transfers) {{
                    if (message?.type === 'TRANSCRIBE_MONO_PCM') {{
                      const payload = message.payload;
                      const requested = {args.samples};
                      if (payload.sampleRate !== 16000 || payload.pcm.length < requested) {{
                        throw new Error('Insufficient capture for exact sample-count test');
                      }}
                      const pcm = payload.pcm.slice(0, requested);
                      window.__exactCapture.push({{
                        inputSamples: payload.pcm.length,
                        submittedSamples: pcm.length,
                        sampleRate: payload.sampleRate
                      }});
                      message = {{ ...message, payload: {{ ...payload, pcm }} }};
                      transfers = [pcm.buffer];
                    }}
                    return post.call(this, message, transfers);
                  }};
                }})();""",
            )
            page.on(
                "console",
                lambda message: receipt["console"].append(
                    {"type": message.type, "text": message.text}
                )
                if len(receipt["console"]) < 500
                else None,
            )
            page.on("pageerror", lambda error: receipt["pageErrors"].append(str(error)))
            page.on(
                "request",
                lambda request: receipt["requests"].append(request.url)
                if ".mjs" in request.url or ".wasm" in request.url
                else None,
            )

            page.goto(args.base_url)
            page.wait_for_selector(".asr-suite")
            page.locator("select").nth(2).select_option("parakeet-tdt-0.6b-v3")
            page.locator("select").nth(1).select_option("local")
            page.locator('input[webkitdirectory]').set_input_files(str(model_dir))
            page.locator("#profiling").uncheck()
            quantizers = page.locator("select").filter(
                has=page.locator("option[value=fp32]")
            )
            quantizers.nth(0).select_option("fp16")
            quantizers.nth(1).select_option("fp32")
            page.get_by_role("button", name="Load Model", exact=False).click()
            for _ in range(150):
                page.wait_for_timeout(1000)
                body = page.locator("body").inner_text()
                if "Model ready" in body:
                    receipt["load"] = "PASS"
                    break
                if "Verification failed" in body or "Failed:" in body:
                    receipt["load"] = "FAIL"
                    break
            receipt["loadBody"] = body
            assert receipt["load"] == "PASS", body
            print("load PASS", flush=True)

            page.locator('input[accept="audio/*"]').set_input_files(str(fixture))
            for _ in range(90):
                page.wait_for_timeout(1000)
                body = page.locator("body").inner_text()
                if "ask not what your country" in body.lower():
                    receipt["file"] = "PASS"
                    break
            receipt["fileBody"] = body
            assert receipt["file"] == "PASS", body
            print("file PASS", flush=True)

            page.get_by_role("button", name="Start Mic", exact=True).click()
            page.get_by_role("button", name="Stop Mic", exact=True).wait_for()
            page.wait_for_timeout(12500)
            page.get_by_role("button", name="Stop Mic", exact=True).click()
            page.wait_for_timeout(15000)
            receipt["captureBoundary"] = page.evaluate("window.__exactCapture")
            receipt["microphoneBody"] = page.locator("body").inner_text()
            receipt["buttons"] = page.locator("button").all_text_contents()
            assert (
                "microphone-stop-" in receipt["microphoneBody"]
                and receipt["microphoneBody"].lower().count("ask not what your country") >= 2
            )
            assert len(receipt["captureBoundary"]) == 1
            assert receipt["captureBoundary"][0]["submittedSamples"] == args.samples
            assert any("[MicQueue] complete" in item["text"] for item in receipt["console"])
            assert any("[MicWorker] Ready" in item["text"] for item in receipt["console"])
            assert not any("cdn.jsdelivr.net" in url for url in receipt["requests"])
            assert not receipt["pageErrors"], receipt["pageErrors"]
            receipt["microphoneControlled"] = "PASS"
            page.screenshot(path=str(screenshot_path), full_page=True)
            browser.close()
            browser = None
    except Exception as error:  # Keep a failure receipt instead of losing evidence.
        receipt["exception"] = repr(error)
        if any("[MicQueue] failed" in item["text"] for item in receipt["console"]):
            receipt["microphoneControlled"] = "FAIL"
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass  # Playwright may already be stopped; preserve the failure receipt.

    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in receipt.items() if key not in {
        "console", "loadBody", "fileBody", "microphoneBody", "buttons"
    }}, indent=2), flush=True)
    print(f"receipt: {receipt_path}", flush=True)
    return 0 if receipt["microphoneControlled"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
