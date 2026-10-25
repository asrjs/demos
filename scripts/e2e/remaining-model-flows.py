"""Run evidence-oriented model flows against the four local ASR demos.

The harness never downloads models: local runs pass --model-dir to the demo's
local-folder picker. Each operation writes a JSON receipt immediately
after that flow. Controlled Chromium audio is not a physical-microphone test.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import math
import re
import shutil
import sys
import time
import unicodedata
import wave
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


APPS = ("showcase", "realtime", "playground", "benchmark")
DEFAULT_URLS = {
    "showcase": "http://127.0.0.1:4190/showcase/",
    "realtime": "http://127.0.0.1:4190/realtime/",
    "playground": "http://127.0.0.1:4190/playground/",
    "benchmark": "http://127.0.0.1:4190/benchmark/",
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", str(text or "")).casefold()
    return " ".join("".join(c for c in text if c.isalnum() or c.isspace()).split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_console_error(kind: str, text: str) -> bool:
    # ORT's Emscripten stderr transport uses console.error even for [W:] records.
    # Keep these records in the raw log; their native severity is a warning.
    native_text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    native_warning = re.match(
        r"^(?:\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\s+)?\[W:onnxruntime[:,]",
        native_text,
    )
    return kind == "error" and native_warning is None


def component_requested(args: argparse.Namespace) -> list[str]:
    return [x for x in (args.encoder_backend, args.decoder_backend) if x]


def is_transcription_worker_url(url: str) -> bool:
    return "browser-transcription-worker-thread-" in url or url.endswith("browser-transcription-worker-thread.js")


def fake_audio_capture_flag(path: Path) -> str:
    # Chromium loops plain file paths; short fixtures must play exactly once.
    return f"--use-file-for-fake-audio-capture={path}%noloop"


def new_receipt(args: argparse.Namespace, fixture: Path, flow: str) -> dict:
    return {
        "schemaVersion": 1,
        "app": args.app,
        "modelId": args.model_id,
        "source": args.source,
        "descriptorSources": args.descriptor_sources,
        "sourceSelectionStatus": "UNVERIFIED",
        "flow": flow,
        "requestedBackend": args.backend,
        "requestedEncoderBackend": args.encoder_backend,
        "requestedDecoderBackend": args.decoder_backend,
        "requestedEncoderQuant": args.encoder_quant,
        "requestedDecoderQuant": args.decoder_quant,
        "requestedComponentBackends": component_requested(args),
        "modelDir": str(args.model_dir.resolve()) if args.model_dir else None,
        "fixture": str(fixture.resolve()),
        "fixtureSha256": sha256(fixture),
        "expectedFixtureSha256": args.expected_fixture_sha256.lower() if args.expected_fixture_sha256 else None,
        "fixtureBytes": fixture.stat().st_size,
        "oracle": args.oracle,
        "status": "UNVERIFIED",
        "loadStatus": "UNVERIFIED",
        "runtimeStatus": "UNVERIFIED",
        "transcriptStatus": "UNVERIFIED",
        "streamingStatus": "NOT_REQUESTED",
        "pageErrors": [],
        "console": [],
        "consoleErrors": [],
        "artifactRequests": [],
        "actualGpuDispatches": {"load": 0, "file": 0, "mic": 0, "stream": 0},
        "physicalMicrophone": "UNVERIFIED",
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }


def ensure_fresh_output_dir(path: Path) -> None:
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise ValueError("--output-dir must be new or empty; use a new directory to preserve prior evidence")
    path.mkdir(parents=True, exist_ok=True)


def write_receipt(path: Path, receipt: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def add_gpu_probe(page) -> None:
    page.add_init_script("""
      window.__asrGpuDispatches = 0;
      const install = () => {
        const proto = globalThis.GPUComputePassEncoder?.prototype;
        if (!proto || proto.__asrProbeInstalled) return;
        Object.defineProperty(proto, '__asrProbeInstalled', { value: true });
        for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
          const original = proto[name];
          if (!original) continue;
          proto[name] = function(...args) {
            window.__asrGpuDispatches++;
            return original.apply(this, args);
          };
        }
      };
      install();
      addEventListener('DOMContentLoaded', install, { once: true });
    """)


def mark_gpu(page, receipt: dict, key: str) -> None:
    receipt["actualGpuDispatches"][key] = page.evaluate("window.__asrGpuDispatches || 0")
    page.evaluate("window.__asrGpuDispatches = 0")


def option_select(page, value: str, *, occurrence: int = 0):
    selects = page.locator("select").filter(has=page.locator(f'option[value="{value}"]'))
    if selects.count() <= occurrence:
        raise RuntimeError(f"No select exposes requested option {value!r}")
    if selects.nth(occurrence).input_value() != value:
        selects.nth(occurrence).select_option(value)
    return selects.nth(occurrence)


def labeled_select(page, label_text: str):
    """Find form controls in both native-label and custom Field layouts."""
    field_labels = page.locator("label").filter(has=page.locator(".field-label").filter(has_text=re.compile(r"^" + re.escape(label_text) + r"$", re.I)))
    if field_labels.count() and field_labels.first.locator("select").count():
        return field_labels.first.locator("select").first
    # Wrapped labels include their option text in the accessible name.
    native = page.get_by_label(re.compile(r"^\s*" + re.escape(label_text), re.I))
    if native.count():
        return native.first
    labels = page.locator("label")
    for index in range(labels.count()):
        label = labels.nth(index)
        if normalize(label.inner_text()) != normalize(label_text):
            continue
        nested = label.locator("select")
        if nested.count():
            return nested.first
        sibling_wrapper = label.locator("xpath=..")
        nested = sibling_wrapper.locator("select")
        if nested.count():
            return nested.first
    return page.locator("select.asr-harness-missing-label")


def try_labeled_select(page, labels: tuple[str, ...], value: str) -> bool:
    for label in labels:
        loc = labeled_select(page, label)
        if loc.count():
            options = loc.locator("option").evaluate_all("els => els.map(e => e.value)")
            if value not in options:
                raise RuntimeError(f"{label} does not expose requested backend {value!r}; options={options}")
            if loc.is_disabled():
                # A one-source selector is intentionally disabled; React may
                # still be normalizing its controlled value after model change.
                expect(loc).to_have_value(value, timeout=5000)
            elif loc.input_value() != value:
                loc.select_option(value)
            return True
    return False


def configure_model(page, args: argparse.Namespace, receipt: dict) -> None:
    if args.app == "playground":
        page.get_by_role("button", name="Universal Catalog Mode", exact=True).click()
    option_select(page, args.model_id)
    if args.app == "benchmark":
        source_button = page.get_by_role(
            "button", name="Local Folder" if args.source == "local" else "HuggingFace Hub", exact=True
        )
        if source_button.count():
            source_button.click()
            receipt["sourceSelectionStatus"] = "UI"
        else:
            # One-source catalog models do not render source buttons.
            source_candidates = page.locator("select").filter(has=page.locator(f'option[value="{args.source}"]'))
            if source_candidates.count():
                source_candidates.first.select_option(args.source)
                receipt["sourceSelectionStatus"] = "UI"
            elif args.source in (args.descriptor_sources or []):
                receipt["sourceSelectionStatus"] = "DESCRIPTOR_CONFIRMED_SINGLE_SOURCE"
            else:
                raise RuntimeError(f"Benchmark app has no source control; descriptor sources must confirm {args.source!r}")
    else:
        source_labels = {
        "showcase": ("Model Source", "Artifact source"),
        "realtime": ("Artifact source", "Model Source"),
        "playground": ("Artifact source", "Model Source"),
        }[args.app]
        if not try_labeled_select(page, source_labels, args.source):
            # Some single-source entries (e.g. local-only Moonshine) have no
            # source toggle. Retain their sole supported source.
            candidates = page.locator("select").filter(has=page.locator(f'option[value="{args.source}"]'))
            if candidates.count():
                candidates.first.select_option(args.source)
                receipt["sourceSelectionStatus"] = "UI"
            elif args.source in (args.descriptor_sources or []):
                receipt["sourceSelectionStatus"] = "DESCRIPTOR_CONFIRMED_SINGLE_SOURCE"
            else:
                raise RuntimeError(f"No source control; descriptor sources must confirm {args.source!r}")
        else:
            receipt["sourceSelectionStatus"] = "UI"

    if args.source == "local":
        if args.app == "playground":
            model_folder = page.locator('input[webkitdirectory]').nth(0)
        elif args.app == "benchmark":
            model_folder = page.locator('input[webkitdirectory]').nth(0)
        else:
            model_folder = page.locator('input[webkitdirectory]').first
        if not args.model_dir:
            raise RuntimeError("Local source needs --model-dir")
        model_folder.set_input_files(str(args.model_dir))
        if receipt["sourceSelectionStatus"] == "UNVERIFIED":
            receipt["sourceSelectionStatus"] = "LOCAL_FOLDER_SELECTED"

    backend_labels = {
        "showcase": ("Runtime Backend",),
        "realtime": ("Runtime backend", "Runtime Backend"),
        "playground": ("Execution Backend", "Backend"),
        "benchmark": ("Execution Backend",),
    }[args.app]
    runtime_value = args.backend
    # The unified Showcase/Reatime setting exposes the hybrid WebGPU runtime
    # name; the encoder and decoder component settings separately choose GPU.
    if args.backend == "webgpu":
        for label in backend_labels:
            loc = labeled_select(page, label)
            if loc.count():
                available = loc.locator("option").evaluate_all("els => els.map(e => e.value)")
                if args.backend not in available and "webgpu-hybrid" in available:
                    runtime_value = "webgpu-hybrid"
                break
    if args.backend and not try_labeled_select(page, backend_labels, runtime_value):
        raise RuntimeError(f"Could not select runtime backend {args.backend!r} using app controls {backend_labels}")
    component_labels = {
        "showcase": (("Encoder Backend",), ("Decoder Backend",)),
        "realtime": (("Encoder",), ("Decoder",)),
        "playground": (("Encoder backend", "Encoder Backend"), ("Decoder backend", "Decoder Backend")),
        "benchmark": ((), ()),
    }[args.app]
    if args.encoder_backend and not try_labeled_select(page, component_labels[0], args.encoder_backend):
        raise RuntimeError("Requested encoder backend control was not found")
    if args.decoder_backend and not try_labeled_select(page, component_labels[1], args.decoder_backend):
        raise RuntimeError("Requested decoder backend control was not found")

    quant_labels = {
        "showcase": (("Encoder",), ("Decoder",)),
        "realtime": (("Encoder quant",), ("Decoder quant",)),
        "playground": (("Encoder quantization", "Encoder quant"), ("Decoder quantization", "Decoder quant")),
        "benchmark": (("Encoder Quant",), ("Decoder Quant",)),
    }[args.app]
    if args.encoder_quant and not try_labeled_select(page, quant_labels[0], args.encoder_quant):
        raise RuntimeError("Requested encoder quantization control was not found")
    if args.decoder_quant and not try_labeled_select(page, quant_labels[1], args.decoder_quant):
        raise RuntimeError("Requested decoder quantization control was not found")

    # Record actual selected component values as reported by UI controls.
    components = []
    for label in component_labels:
        for name in label:
            loc = labeled_select(page, name)
            if loc.count():
                components.append(loc.input_value())
                break
    receipt["actualComponentBackends"] = components
    if component_labels[0] and components:
        receipt["actualEncoderBackend"] = components[0]
    if component_labels[1] and len(components) > 1:
        receipt["actualDecoderBackend"] = components[1]
    for key, labels in (("Encoder", quant_labels[0]), ("Decoder", quant_labels[1])):
        for name in labels:
            control = labeled_select(page, name)
            if control.count():
                receipt[f"actual{key}Quant"] = control.input_value()
                break
    receipt["actualBackend"] = None
    for name in backend_labels:
        loc = labeled_select(page, name)
        if loc.count():
            receipt["actualBackend"] = loc.input_value()
            break


def assert_requested_backend_selection(args: argparse.Namespace, receipt: dict) -> None:
    if args.backend == "wasm" and not any("webgpu" in value for value in component_requested(args)):
        selected = receipt.get("actualComponentBackends", [])
        if any("webgpu" in str(value) for value in selected):
            raise RuntimeError(
                "Requested WASM but a component still selects WebGPU; explicitly select "
                "--encoder-backend wasm / --decoder-backend wasm before loading"
            )


def wait_for_load(page, args: argparse.Namespace, receipt: dict) -> None:
    assert_requested_backend_selection(args, receipt)
    load_button = page.get_by_role("button", name=re.compile("Load Model", re.I))
    if not load_button.count():
        raise RuntimeError("Load Model control is absent")
    load_button.first.click()
    page.wait_for_function(
        "document.body.innerText.includes('Model ready') || "
        "document.body.innerText.includes('Model Loaded') || "
        "document.body.innerText.includes('Reload Model') || "
        "document.body.innerText.includes('Failed:') || "
        "document.body.innerText.includes('Error:') || "
        "document.body.innerText.includes('Warm-up failed') || "
        "document.body.innerText.includes('Verification failed') || "
        "document.body.innerText.includes('Model load failed')",
        timeout=args.load_timeout_ms,
    )
    body = page.locator("body").inner_text()
    receipt["loadPageText"] = body[-5000:]
    if not any(marker in body for marker in ("Model ready", "Model Loaded", "Reload Model")):
        receipt["loadStatus"] = "FAIL"
        raise RuntimeError("Model did not reach ready state")
    if args.app == "benchmark":
        page.get_by_role("button", name=re.compile("Reload Model")).wait_for(timeout=15000)
    model_control = page.locator("select").filter(has=page.locator(f'option[value="{args.model_id}"]')).first
    receipt["actualModelId"] = model_control.input_value()
    if receipt["actualModelId"] != args.model_id:
        raise RuntimeError("Model selection changed during loading; refusing inference attribution")
    receipt["loadStatus"] = "EXECUTED"
    mark_gpu(page, receipt, "load")


def transcript_locator(page, app: str):
    return page.locator("p.asr-transcript-text" if app in ("showcase", "playground") else ".transcript-body.asr-transcript-text, .transcript-body")


def playground_status(page):
    # Progress/event panels retain earlier success messages. Only the current
    # status paragraph establishes completion of this operation.
    panel = page.locator("section.panel-shell").filter(has=page.get_by_role("heading", name="Status", exact=True))
    return panel.locator(":scope > div.space-y-3 > p").first


def record_transcription_failed(receipt: dict, terminal_status: str) -> bool:
    """Persist and classify the terminal Playground status before scoring text."""
    receipt["terminalStatus"] = terminal_status
    if not terminal_status.startswith("Failed:"):
        return False

    # A record flow clones the file-flow receipt. Never let its prior exact
    # transcript survive a failed recording transcription attempt.
    receipt.pop("transcript", None)
    receipt["activeStage"] = "record-then-transcribe-failed"
    receipt["runtimeStatus"] = "FAIL"
    receipt["transcriptStatus"] = "NOT_EVALUATED"
    receipt["error"] = terminal_status
    receipt["verificationErrors"] = ["Transcription runtime failed before transcript comparison"]
    receipt["status"] = "FAIL"
    return True


def run_benchmark_file_flow(page, args: argparse.Namespace, receipt: dict) -> str:
    # Benchmark intentionally accepts an audio catalog, not a single-file
    # transcribe button. Limit the catalog to this fixture and request its full
    # duration as the one target so the oracle covers the whole supplied file.
    page.get_by_role("button", name="Local Duration Catalog", exact=True).click()
    audio_dir = args.output_dir / "benchmark-audio-fixture"
    audio_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.fixture, audio_dir / args.fixture.name)
    audio_input = page.locator('input[webkitdirectory]').nth(1)
    audio_input.set_input_files(str(audio_dir))
    duration = wav_duration(args.fixture)
    target = page.get_by_label(re.compile("Target Duration Strategy", re.I))
    target.select_option("custom")
    page.get_by_label("Target Durations (s)", exact=True).fill(f"{duration:.3f}")
    samples = page.get_by_label("Samples / Target", exact=True)
    samples.fill("1")
    page.get_by_label("Repeats", exact=True).fill("1")
    page.get_by_label("Warmups", exact=False).fill("0")
    page.wait_for_function("document.body.innerText.includes('Planned files: 1')", timeout=30000)
    page.get_by_role("button", name="▶ Start Benchmark", exact=True).click()
    page.wait_for_function(
        "document.body.innerText.includes('Completed 1 benchmark runs.') || "
        "document.body.innerText.includes('Error')",
        timeout=args.flow_timeout_ms,
    )
    with page.expect_download() as download:
        page.get_by_role("button", name="Export JSON", exact=True).click()
    export_path = args.output_dir / "benchmark-export.json"
    download.value.save_as(str(export_path))
    exported = json.loads(export_path.read_text(encoding="utf-8"))
    runs = exported.get("runs", [])
    if len(runs) != 1 or runs[0].get("error"):
        raise RuntimeError(f"Expected one successful benchmark row, got {len(runs)}")
    receipt["benchmarkRun"] = runs[0]
    return str(runs[0].get("transcription") or "")


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def resolve_mic_capture_ms(requested_ms: int | None, capture_fixture: Path) -> int:
    if requested_ms is not None:
        if requested_ms <= 0:
            raise ValueError("Microphone capture duration must be positive")
        return requested_ms
    # Round up to avoid stopping before the final sample of fractional-second WAVs.
    return math.ceil(wav_duration(capture_fixture) * 1000)


def run_file_flow(page, args: argparse.Namespace, receipt: dict) -> str:
    if args.app == "benchmark":
        return run_benchmark_file_flow(page, args, receipt)
    file_input = page.locator('input[type="file"][accept="audio/*"]')
    if not file_input.count():
        raise RuntimeError("Audio file input accept=audio/* is absent")
    file_input.first.set_input_files(str(args.fixture))
    if args.app == "playground":
        page.get_by_role("button", name="Transcribe", exact=True).click()
        expect(playground_status(page)).to_have_text(re.compile(r"^(Transcription complete\.|Failed:.*)$"), timeout=args.flow_timeout_ms)
    else:
        loc = transcript_locator(page, args.app)
        before = loc.last.inner_text() if loc.count() else ""
        page.wait_for_function(
            "([selector, before]) => { const e=document.querySelector(selector); "
            "const t=e?.textContent?.trim() || ''; const body=document.body.innerText; "
            "return (!!t && t !== before) || body.includes('Transcription failed') || "
            "body.includes('Failed:') || body.includes('Error:'); }",
            arg=["p.asr-transcript-text" if args.app == "showcase" else ".transcript-body", before],
            timeout=args.flow_timeout_ms,
        )
        body = page.locator("body").inner_text()
        if any(marker in body for marker in ("Transcription failed", "Failed:", "Error:")):
            raise RuntimeError("Demo reported a file transcription failure")
    loc = transcript_locator(page, args.app)
    body = page.locator("body").inner_text()
    if "Transcription failed" in body or "Failed:" in body:
        raise RuntimeError("File transcription failed; see console diagnostics")
    if not loc.count():
        raise RuntimeError("Transcript panel is absent after file transcription")
    return loc.last.inner_text()


def install_queue_capture(page, *, capture_mic_pcm: bool = False) -> None:
    capture_worker_script = """
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(scriptURL, options) {
          super(scriptURL, options);
          const workerUrl = new URL(scriptURL, location.href).href;
          if (!workerUrl.includes('browser-transcription-worker-thread-') &&
              !workerUrl.endsWith('browser-transcription-worker-thread.js')) return;
          const originalPostMessage = this.postMessage.bind(this);
          const recordsById = new Map();
          this.addEventListener('message', event => {
            const message = event.data;
            const record = message && recordsById.get(message.id);
            if (record) record.responseType = message.type;
          });
          this.postMessage = (message, transfer) => {
            const payload = message?.payload;
            if (window.__asrCaptureMicPcmEnabled && message?.type === 'TRANSCRIBE_MONO_PCM' &&
                payload?.pcm instanceof Float32Array && Number.isSafeInteger(message.id)) {
              // Copy before forwarding: the original request/transfer list is unchanged.
              const pcmCopy = payload.pcm.slice();
              const bytes = new Uint8Array(pcmCopy.buffer);
              let binary = '';
              for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
              }
              const record = {
                requestId: message.id,
                flow: window.__asrPcmCaptureFlow,
                sampleRate: payload.sampleRate,
                frames: pcmCopy.length,
                responseType: null,
                captureError: null,
              };
              recordsById.set(message.id, record);
              window.__asrPcmCaptureRecords.push(record);
              const pending = window.__asrCaptureMicPcm({
                flow: record.flow,
                requestId: record.requestId,
                sampleRate: record.sampleRate,
                frames: record.frames,
                pcmBase64: btoa(binary),
              }).then(saved => Object.assign(record, saved)).catch(error => {
                record.captureError = String(error);
              });
              window.__asrPcmCapturePending.push(pending);
            }
            return originalPostMessage(message, transfer);
          };
        }
      };
    """ if capture_mic_pcm else ""
    page.add_init_script("""
      window.__asrMicWorkerReady = false;
      window.__asrMicEvidence = { enqueued: [], completed: [], failed: [], decisions: [], pageErrors: [] };
      for (const method of ['debug', 'log', 'info', 'warn', 'error']) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
          const msg = args[0]; const meta = args[1] || {};
          if (msg === '[MicWorker] Ready' || (typeof msg === 'string' && msg.startsWith('[MicWorker] Falling back'))) window.__asrMicWorkerReady = true;
          if (msg === '[MicQueue] enqueue') window.__asrMicEvidence.enqueued.push(JSON.parse(JSON.stringify(meta)));
          if (msg === '[MicQueue] complete') window.__asrMicEvidence.completed.push(JSON.parse(JSON.stringify(meta)));
          if (msg === '[MicQueue] failed') window.__asrMicEvidence.failed.push(JSON.parse(JSON.stringify(meta)));
          if (typeof msg === 'string' && msg.startsWith('[StreamingSpeechDetector]')) window.__asrMicEvidence.decisions.push({message: msg, meta: JSON.parse(JSON.stringify(meta))});
          return original(...args);
        };
      }
    """ + capture_worker_script)


def save_captured_mic_pcm(out: Path, payload: dict) -> dict:
    flow = payload.get("flow")
    request_id = payload.get("requestId")
    sample_rate = payload.get("sampleRate")
    frames = payload.get("frames")
    if not isinstance(flow, str) or not re.fullmatch(r"mic-[a-z0-9-]+", flow):
        raise ValueError("Invalid mic PCM capture flow")
    if not isinstance(request_id, int) or request_id < 1:
        raise ValueError("Invalid mic PCM capture request ID")
    if not isinstance(sample_rate, (int, float)) or not math.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("Invalid mic PCM capture sample rate")
    if not isinstance(frames, int) or frames < 1:
        raise ValueError("Invalid mic PCM capture frame count")
    pcm_bytes = base64.b64decode(payload.get("pcmBase64", ""), validate=True)
    if len(pcm_bytes) != frames * 4:
        raise ValueError("Captured float32 PCM byte length does not match frame count")
    capture_dir = out / "mic-pcm-capture"
    capture_dir.mkdir(parents=True, exist_ok=True)
    pcm_path = capture_dir / f"{flow}-request-{request_id}.f32le"
    receipt_path = capture_dir / f"{flow}-request-{request_id}.json"
    digest = hashlib.sha256(pcm_bytes).hexdigest()
    pcm_path.write_bytes(pcm_bytes)
    saved = {
        "schemaVersion": 1,
        "flow": flow,
        "requestId": request_id,
        "sampleRate": sample_rate,
        "frames": frames,
        "pcmFormat": "mono-float32-little-endian",
        "pcmBytes": len(pcm_bytes),
        "pcmSha256": digest,
        "capturePoint": "TRANSCRIBE_MONO_PCM postMessage before original transfer",
        "pcmPath": str(pcm_path.resolve()),
    }
    write_receipt(receipt_path, saved)
    return {
        "captureReceiptPath": str(receipt_path.resolve()),
        "pcmPath": str(pcm_path.resolve()),
        "pcmSha256": digest,
    }


def mic_queue_has_nonempty_text(evidence: dict) -> bool:
    """Whether a completed microphone job should eventually change transcript text."""
    return any(
        isinstance(job, dict)
        and isinstance(job.get("textLength"), int)
        and not isinstance(job.get("textLength"), bool)
        and job["textLength"] > 0
        for job in evidence.get("completed", [])
    )


def padded_fake_mic_fixture(source: Path, target: Path) -> None:
    with wave.open(str(source), "rb") as wav:
        params = wav.getparams()
        frames = wav.readframes(wav.getnframes())
    silence = bytes(params.framerate * params.nchannels * params.sampwidth * 5)
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as wav:
        wav.setparams(params)
        wav.writeframes(silence + frames + silence)


def run_realtime_mic(page, args: argparse.Namespace, out: Path, base_receipt: dict) -> list[dict]:
    if args.app != "realtime":
        raise RuntimeError("Microphone/VAD capture is available only in Realtime")
    modes = []
    for mode in args.mic_flow:
        # Syntax: manual, speech-detect:vad-only:ten-vad or
        # speech-detect:vad-only:firered-vad.
        parts = mode.split(":")
        if len(parts) == 1 and parts[0] == "manual":
            modes.append({"mode": "manual", "gate": None, "vad": None})
        elif len(parts) == 3:
            modes.append({"mode": parts[0], "gate": parts[1], "vad": parts[2]})
        else:
            raise ValueError(f"Invalid --mic-flow {mode!r}")

    fixture = out / (args.fixture.stem + "-padded-5s.wav")
    padded_fake_mic_fixture(args.fixture, fixture)
    capture_fixture_duration = wav_duration(fixture)
    capture_duration_ms = resolve_mic_capture_ms(args.mic_capture_ms, fixture)
    results = []
    # Loading the independent microphone model must finish before the probe is
    # reset, otherwise model warm-up could be mistaken for microphone inference.
    page.wait_for_function("window.__asrMicWorkerReady === true", timeout=args.load_timeout_ms)
    worker_probe = """() => {
      const proto = globalThis.GPUComputePassEncoder?.prototype;
      if (!proto) return false;
      if (!proto.__asrMicProbeInstalled) {
        Object.defineProperty(proto, '__asrMicProbeInstalled', {value: true});
        for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
          const original = proto[name];
          if (original) proto[name] = function(...args) {
            globalThis.__asrMicGpuDispatches = (globalThis.__asrMicGpuDispatches || 0) + 1;
            return original.apply(this, args);
          };
        }
      }
      globalThis.__asrMicGpuDispatches = 0;
      return true;
    }"""
    for spec in modes:
        receipt = new_receipt(args, args.fixture, f"mic-{spec['mode']}-{spec['gate'] or 'manual'}-{spec['vad'] or 'none'}")
        for key in (
            "actualBackend", "actualComponentBackends", "actualEncoderBackend", "actualDecoderBackend",
            "actualEncoderQuant", "actualDecoderQuant", "requestedComponentBackends",
            "loadStatus", "requestedBackend", "requestedEncoderBackend", "requestedDecoderBackend",
            "requestedEncoderQuant", "requestedDecoderQuant",
            "sourceSelectionStatus", "descriptorSources", "profilingSelection",
        ):
            if key in base_receipt:
                receipt[key] = copy.deepcopy(base_receipt[key])
        receipt["actualGpuDispatches"] = {"load": 0, "file": 0, "mic": 0, "stream": 0}
        receipt.update({
            "captureFixture": str(fixture.resolve()),
            "captureFixtureSha256": sha256(fixture),
            "captureFixtureDurationSeconds": capture_fixture_duration,
            "requestedCaptureMs": capture_duration_ms,
            "controlledFakeMicrophone": True,
        })
        receipt["gate"] = spec["gate"]
        receipt["vadBackend"] = spec["vad"]
        receipt["captureMicPcmRequested"] = args.capture_mic_pcm
        before_text = transcript_locator(page, "realtime").last.inner_text()
        if spec["mode"] == "manual":
            labeled_select(page, "Mode").select_option("manual")
        else:
            labeled_select(page, "Mode").select_option(spec["mode"])
            labeled_select(page, "Gate mode").select_option(spec["gate"])
            labeled_select(page, "VAD backend").select_option(spec["vad"])
        page.evaluate("""([flow, capture]) => {
          window.__asrMicEvidence = {enqueued: [], completed: [], failed: [], decisions: [], pageErrors: []};
          window.__asrGpuDispatches = 0;
          window.__asrPcmCaptureFlow = flow;
          window.__asrCaptureMicPcmEnabled = capture;
          window.__asrPcmCaptureRecords = [];
          window.__asrPcmCapturePending = [];
        }""", [receipt["flow"], args.capture_mic_pcm])
        probed_workers = []
        for worker in page.workers:
            # ORT pthread workers can block their event loop in Atomics.wait;
            # evaluate only our transcription worker, never VAD/ORT workers.
            if not is_transcription_worker_url(worker.url):
                continue
            try:
                if worker.evaluate(worker_probe):
                    probed_workers.append(worker)
            except Exception:
                pass  # Missing telemetry remains a failure for a requested GPU.
        receipt["activeStage"] = "mic-capture-running"
        receipt["runtimeStatus"] = "RUNNING"
        write_receipt(out / f"{receipt['flow']}.json", receipt)
        start = page.get_by_role("button", name="Start Mic", exact=True)
        start.click()
        page.get_by_role("button", name="Stop Mic", exact=True).wait_for()
        page.wait_for_timeout(capture_duration_ms)
        page.get_by_role("button", name="Stop Mic", exact=True).click()
        # Stop may asynchronously enqueue a final context revision after all
        # previous jobs completed. Do not mistake that earlier idle queue for completion.
        page.wait_for_function(
            "document.body.innerText.includes('Microphone stopped') || "
            "document.body.innerText.includes('Microphone error') || "
            "document.body.innerText.includes('Microphone transcription failed') || "
            "document.body.innerText.includes('Failed:')",
            timeout=args.flow_timeout_ms,
        )
        receipt["stopCompletionObserved"] = "Microphone stopped" in page.locator("body").inner_text()
        page.wait_for_function(
            "window.__asrMicEvidence && window.__asrMicEvidence.enqueued.length > 0 && "
            "window.__asrMicEvidence.enqueued.length === window.__asrMicEvidence.completed.length || "
            "(window.__asrMicEvidence && window.__asrMicEvidence.failed.length > 0) || "
            "document.body.innerText.includes('Microphone error') || document.body.innerText.includes('Microphone transcription failed') || document.body.innerText.includes('Failed:')",
            timeout=args.flow_timeout_ms,
        )
        evidence = page.evaluate("window.__asrMicEvidence")
        if mic_queue_has_nonempty_text(evidence):
            page.wait_for_function(
                "([before]) => { const e=document.querySelector('.transcript-body'); "
                "return (!!e && e.textContent !== before) || document.body.innerText.includes('Microphone transcription failed'); }",
                arg=[before_text],
                timeout=args.flow_timeout_ms,
            )
        if args.capture_mic_pcm:
            captures = page.evaluate("""async () => {
              await Promise.all(window.__asrPcmCapturePending || []);
              return window.__asrPcmCaptureRecords || [];
            }""")
            if len(captures) == len(evidence.get("enqueued", [])):
                for capture, queued in zip(captures, evidence.get("enqueued", []), strict=True):
                    capture["queue"] = queued
            receipt["capturedMicPcm"] = captures
            page.evaluate("window.__asrCaptureMicPcmEnabled = false")
        receipt.update(evidence)
        receipt["pageErrors"] = list(base_receipt.get("pageErrors", []))
        receipt["console"] = list(base_receipt.get("console", [])) + list(receipt.get("console", []))
        receipt["consoleErrors"] = list(base_receipt.get("consoleErrors", [])) + list(receipt.get("consoleErrors", []))
        receipt["gpuWorkerTelemetry"] = []
        for worker in probed_workers:
            try:
                count = worker.evaluate("globalThis.__asrMicGpuDispatches || 0")
                receipt["gpuWorkerTelemetry"].append({"url": worker.url, "dispatches": count})
            except Exception:
                receipt["gpuWorkerTelemetry"].append({"url": worker.url, "dispatches": None})
        receipt["actualGpuDispatches"]["mic"] = page.evaluate("window.__asrGpuDispatches || 0") + sum(x["dispatches"] for x in receipt["gpuWorkerTelemetry"] if isinstance(x["dispatches"], int))
        after_text = transcript_locator(page, "realtime").last.inner_text()
        receipt["transcriptBefore"] = before_text
        receipt["transcriptAfter"] = after_text
        if not after_text.startswith(before_text):
            receipt["transcript"] = ""
            receipt["transcriptDeltaError"] = "Transcript history changed without preserving the prior prefix"
        else:
            receipt["transcript"] = after_text[len(before_text):].strip()
        receipt["loadStatus"] = "EXECUTED"
        receipt["runtimeStatus"] = "EXECUTED"
        receipt["transcriptStatus"] = "EXACT" if normalize(receipt.get("transcript")) == normalize(args.oracle) else "MISMATCH"
        receipt["activeStage"] = "mic-flow-complete"
        receipt["status"] = "UNVERIFIED"
        receipt["verificationErrors"] = verify_receipt(receipt, require_exact=True, require_mic=True)
        receipt["status"] = "FAIL" if receipt["verificationErrors"] else "PASS_CONTROLLED_MIC"
        write_receipt(out / f"{receipt['flow']}.json", receipt)
        results.append(receipt)
    return results


def verify_receipt(receipt: dict, *, require_exact: bool = True, require_mic: bool = False) -> list[str]:
    errors = []
    if not receipt.get("fixtureSha256") or len(receipt["fixtureSha256"]) != 64:
        errors.append("Missing or malformed fixture SHA-256")
    if not receipt.get("expectedFixtureSha256"):
        errors.append("Known-good fixture SHA-256 was not supplied")
    if receipt.get("expectedFixtureSha256") and receipt.get("fixtureSha256") != receipt.get("expectedFixtureSha256"):
        errors.append("Wrong fixture SHA-256")
    if receipt.get("loadStatus") != "EXECUTED":
        errors.append("Real model load not verified")
    if "actualModelId" in receipt and receipt.get("actualModelId") != receipt.get("modelId"):
        errors.append("Loaded model selection differs from request")
    if receipt.get("runtimeStatus") != "EXECUTED":
        errors.append("Flow runtime not verified")
    if receipt.get("sourceSelectionStatus") not in ("UI", "DESCRIPTOR_CONFIRMED_SINGLE_SOURCE", "LOCAL_FOLDER_SELECTED"):
        errors.append("Requested model source was not verified")
    if receipt.get("pageErrors"):
        errors.append("Browser page errors present")
    if receipt.get("consoleErrors"):
        errors.append("Browser console errors present")
    if receipt.get("physicalMicrophone") != "UNVERIFIED":
        errors.append("Harness cannot certify physical microphone input")
    if require_exact and normalize(receipt.get("transcript")) != normalize(receipt.get("oracle")):
        errors.append("Transcript is partial, duplicated, or differs from exact oracle")
    if receipt.get("requestedBackend") and receipt.get("actualBackend") != receipt.get("requestedBackend"):
        hybrid_webgpu = receipt.get("requestedBackend") == "webgpu" and receipt.get("actualBackend") == "webgpu-hybrid"
        if not hybrid_webgpu:
            errors.append("Selected runtime backend differs from request")
    for key in ("encoder", "decoder"):
        requested = receipt.get(f"requested{key.title()}Backend")
        actual = receipt.get(f"actual{key.title()}Backend")
        if requested and actual != requested:
            errors.append(f"Requested {key} backend selection is not confirmed by UI")
    for key in ("Encoder", "Decoder"):
        requested = receipt.get(f"requested{key}Quant")
        actual = receipt.get(f"actual{key}Quant")
        if requested and actual != requested:
            errors.append(f"Requested {key.lower()} quantization is not confirmed by UI")
    dispatch = receipt.get("actualGpuDispatches", {})
    requested_components = receipt.get("requestedComponentBackends", [])
    if receipt.get("requestedBackend") == "wasm" and not any("webgpu" in str(value) for value in requested_components):
        phase = "mic" if require_mic else "stream" if receipt.get("flow") in ("streaming", "stream-recorded") else "file"
        if isinstance(dispatch.get(phase), int) and dispatch[phase] > 0:
            errors.append(f"WebGPU dispatch observed during requested WASM {phase} inference")
    if str(receipt.get("requestedBackend", "")).startswith("webgpu") or any("webgpu" in str(value) for value in requested_components):
        key = "mic" if require_mic else "stream" if receipt.get("flow") in ("streaming", "stream-recorded") else "file"
        if not isinstance(dispatch.get(key), int) or dispatch[key] <= 0:
            errors.append(f"Actual WebGPU dispatch missing for {key} inference")
    if require_mic:
        if receipt.get("stopCompletionObserved") is False:
            errors.append("Microphone stop did not complete before transcript acceptance")
        queued = receipt.get("enqueued", [])
        completed = receipt.get("completed", [])
        decisions = receipt.get("decisions", [])
        ready_segments = [
            entry for entry in decisions
            if "Segment ready:" in str(entry.get("message", ""))
        ]
        if not queued:
            errors.append("No microphone transcription jobs enqueued")
        if receipt.get("failed"):
            errors.append("Microphone transcription queue contains failed jobs")
        if len(queued) != len(completed):
            errors.append("Microphone queue enqueue/complete counts differ")
        if receipt.get("gate") is not None and not ready_segments:
            errors.append("No finalized microphone segments")
        finalized_contexts = [
            job.get("context") for job in queued
            if isinstance(job, dict) and isinstance(job.get("context"), dict)
            and job["context"].get("finalized") is True
        ]
        if finalized_contexts:
            errors.extend(verify_finalized_context_tail(
                queued,
                receipt.get("capturedMicPcm", []),
                ready_segment_count=len(ready_segments),
                capture_requested=receipt.get("captureMicPcmRequested") is True,
            ))
        elif receipt.get("gate") is not None and ready_segments and len(queued) != len(ready_segments):
            errors.append("Microphone segment count differs from transcription job count")
        if any("Segment rejected" in str(entry.get("message", "")) for entry in decisions):
            errors.append("Microphone speech segment was rejected")
        if receipt.get("physicalMicrophone") != "UNVERIFIED":
            errors.append("Controlled fake mic receipt cannot certify physical mic")
        if receipt.get("controlledFakeMicrophone") is not True:
            errors.append("Microphone was not explicitly controlled fake input")
        bounds = []
        previous_end = -1
        for entry in ready_segments:
            meta = entry.get("meta", {})
            start = meta.get("logicalStartFrame", meta.get("startFrame"))
            end = meta.get("logicalEndFrame", meta.get("endFrame"))
            if start is not None and end is not None:
                bounds.append((start, end))
            if isinstance(end, (int, float)):
                if end <= previous_end:
                    errors.append("Finalized microphone timeline repeated or moved backwards")
                previous_end = end
        if len(bounds) != len(set(bounds)):
            errors.append("Duplicate microphone segment bounds")
        if receipt.get("gate") == "vad-only":
            backend_name = {"ten-vad": "TEN-VAD", "firered-vad": "FireRed VAD"}.get(receipt.get("vadBackend"))
            if not backend_name or not any(str(x.get("message", "")).removeprefix("[StreamingSpeechDetector] ") == f"{backend_name} ready for diagnostics" for x in decisions):
                errors.append("No selected VAD readiness evidence")
            if not any(x.get("meta", {}).get("gateMode") == "vad-only" for x in decisions):
                errors.append("Effective VAD-only gate is unverified")
    if receipt.get("captureMicPcmRequested"):
        captures = receipt.get("capturedMicPcm", [])
        if len(captures) != len(receipt.get("enqueued", [])) or len(captures) != len(receipt.get("completed", [])):
            errors.append("Captured mic PCM count does not match completed worker queue jobs")
        if any(
            capture.get("captureError")
            or capture.get("responseType") != "SUCCESS"
            or not re.fullmatch(r"[0-9a-f]{64}", str(capture.get("pcmSha256", "")))
            for capture in captures
        ):
            errors.append("Mic PCM capture is incomplete or lacks a successful worker response")
        for capture in captures:
            pcm_path = Path(str(capture.get("pcmPath", "")))
            if not pcm_path.is_file():
                errors.append("Captured mic PCM artifact is missing")
                continue
            if pcm_path.stat().st_size != capture.get("frames", 0) * 4:
                errors.append("Captured mic PCM artifact byte length differs from frame count")
            elif sha256(pcm_path) != capture.get("pcmSha256"):
                errors.append("Captured mic PCM artifact SHA-256 mismatch")
    return errors


def verify_streaming_receipt(receipt: dict) -> list[str]:
    errors = verify_receipt(receipt, require_exact=False)
    if receipt.get("streamingStatus") != "NATIVE_EXECUTED":
        errors.append("Native streaming was unsupported or failed; offline fallback is not a streaming PASS")
    if receipt.get("streamSteps", 0) < 2:
        errors.append("Multiple native streaming steps were not verified")
    if normalize(receipt.get("streamTranscript")) != normalize(receipt.get("oracle")):
        errors.append("Native streaming transcript differs from exact oracle")
    requested_components = receipt.get("requestedComponentBackends", [])
    if str(receipt.get("requestedBackend", "")).startswith("webgpu") or any("webgpu" in str(value) for value in requested_components):
        if not isinstance(receipt.get("actualGpuDispatches", {}).get("stream"), int) or receipt["actualGpuDispatches"]["stream"] <= 0:
            errors.append("Actual WebGPU dispatch missing for native streaming")
    return errors


def verify_finalized_context_tail(
    queued: list,
    captured_pcm: list,
    *,
    ready_segment_count: int,
    capture_requested: bool,
) -> list[str]:
    """Validate the sole permitted terminal extension of a VAD context."""
    errors = []
    finalized = [
        (index, job.get("context"))
        for index, job in enumerate(queued)
        if isinstance(job, dict)
        and isinstance(job.get("context"), dict)
        and job["context"].get("finalized") is True
    ]
    if not finalized:
        return errors
    if len(finalized) != 1:
        return ["More than one finalized microphone context tail was enqueued"]

    index, context = finalized[0]
    if len(queued) != ready_segment_count + 1:
        errors.append("Finalized microphone context tail is not exactly one extra queue job")
    if index != len(queued) - 1:
        errors.append("Finalized microphone context tail is not the last queued job")
    if index == 0:
        errors.append("Finalized microphone context tail has no prior context revision")
        return errors

    previous = queued[index - 1]
    previous_context = previous.get("context") if isinstance(previous, dict) else None
    if not isinstance(previous_context, dict):
        errors.append("Finalized microphone context tail has no prior context metadata")
        return errors

    start = context.get("startFrame")
    end = context.get("endFrame")
    previous_start = previous_context.get("startFrame")
    previous_end = previous_context.get("endFrame")
    sample_rate = context.get("sampleRate")
    if context.get("id") != previous_context.get("id"):
        errors.append("Finalized microphone context tail changed context identity")
    if context.get("revision") != previous_context.get("revision", -2) + 1:
        errors.append("Finalized microphone context tail revision is not the next revision")
    if start != previous_start:
        errors.append("Finalized microphone context tail changed its start frame")
    if context.get("sampleRate") != previous_context.get("sampleRate"):
        errors.append("Finalized microphone context tail changed sample rate")
    if not all(isinstance(value, int) for value in (start, end, previous_start, previous_end, sample_rate)) or sample_rate <= 0:
        errors.append("Finalized microphone context tail has invalid frame bounds")
        return errors
    extension = end - previous_end
    if extension <= 0:
        errors.append("Finalized microphone context tail did not append captured frames")
    if extension > round(sample_rate * 0.6):
        errors.append("Finalized microphone context tail exceeds the 600 ms limit")
    if end <= start or end - start > sample_rate * 30:
        errors.append("Finalized microphone context tail exceeds the 30 second context bound")

    if not capture_requested:
        errors.append("Finalized microphone context tail lacks captured PCM prefix evidence")
        return errors

    def capture_for(job_context: dict) -> dict | None:
        for capture in captured_pcm:
            queue = capture.get("queue") if isinstance(capture, dict) else None
            captured_context = queue.get("context") if isinstance(queue, dict) else None
            if isinstance(captured_context, dict) and (
                captured_context.get("id"), captured_context.get("revision")
            ) == (job_context.get("id"), job_context.get("revision")):
                return capture
        return None

    prior_capture = capture_for(previous_context)
    final_capture = capture_for(context)
    if not prior_capture or not final_capture:
        errors.append("Finalized microphone context tail is missing captured PCM artifacts")
        return errors
    if prior_capture.get("sampleRate") != sample_rate or final_capture.get("sampleRate") != sample_rate:
        errors.append("Finalized microphone context tail PCM sample rate differs from context")
    if prior_capture.get("frames") != previous_end - previous_start or final_capture.get("frames") != end - start:
        errors.append("Finalized microphone context tail PCM frame count differs from context bounds")
    try:
        prior_pcm = Path(str(prior_capture.get("pcmPath", ""))).read_bytes()
        final_pcm = Path(str(final_capture.get("pcmPath", ""))).read_bytes()
    except OSError:
        errors.append("Finalized microphone context tail PCM artifact cannot be read")
        return errors
    if len(prior_pcm) != (previous_end - previous_start) * 4 or len(final_pcm) != (end - start) * 4:
        errors.append("Finalized microphone context tail PCM byte length differs from frame bounds")
    elif final_pcm[:len(prior_pcm)] != prior_pcm:
        errors.append("Finalized microphone context tail PCM does not preserve the prior context prefix")
    return errors


def complete_recorded_streaming_receipt(receipt: dict, live_receipt: dict) -> list[str]:
    """Copy current browser diagnostics before applying the strict stream gate."""
    for key in ("pageErrors", "console", "consoleErrors"):
        receipt[key] = copy.deepcopy(live_receipt.get(key, []))
    receipt["transcript"] = receipt.get("streamTranscript", "")
    receipt["transcriptStatus"] = "EXACT" if normalize(receipt["transcript"]) == normalize(receipt.get("oracle")) else "MISMATCH"
    errors = verify_streaming_receipt(receipt)
    receipt["verificationErrors"] = errors
    receipt["status"] = "FAIL" if errors else "PASS_NATIVE_RECORDED_STREAMING"
    return errors


def refresh_recorded_streaming_diagnostics(receipt: dict, live_receipt: dict) -> list[str]:
    """Refresh diagnostics and revoke PASS if late browser errors appeared."""
    for key in ("pageErrors", "console", "consoleErrors"):
        receipt[key] = copy.deepcopy(live_receipt.get(key, []))
    if not receipt.get("status", "").startswith("PASS_"):
        return list(receipt.get("verificationErrors", []))
    errors = verify_streaming_receipt(receipt)
    receipt["verificationErrors"] = errors
    if errors:
        receipt["status"] = "FAIL"
    return errors


def expected_flow_ids(args: argparse.Namespace) -> list[str]:
    flows = ["file"]
    if args.run_streaming:
        flows.append("streaming")
    if args.record_mic:
        flows.append("record-then-transcribe")
    if getattr(args, "stream_recorded", False):
        flows.append("stream-recorded")
    for mode in args.mic_flow:
        parts = mode.split(":")
        if len(parts) == 1 and parts[0] == "manual":
            flows.append("mic-manual-manual-none")
        elif len(parts) == 3:
            flows.append(f"mic-{parts[0]}-{parts[1]}-{parts[2]}")
        else:
            flows.append(f"mic-invalid-{mode}")
    return flows


def aggregate_status(receipts: dict[str, dict | None], required_flows: list[str]) -> dict:
    flow_status = {}
    missing = []
    failed = []
    for flow_id in required_flows:
        receipt = receipts.get(flow_id)
        if not receipt:
            missing.append(flow_id)
            flow_status[flow_id] = {"status": "MISSING", "errors": ["Requested flow produced no receipt"]}
            failed.append(flow_id)
            continue
        status = str(receipt.get("status", "UNVERIFIED"))
        errors = list(receipt.get("verificationErrors") or [])
        if receipt.get("error"):
            errors.append(str(receipt["error"]))
        flow_status[flow_id] = {"status": status, "errors": errors, "activeStage": receipt.get("activeStage")}
        if not status.startswith("PASS_") or errors:
            failed.append(flow_id)
    return {
        "status": "PASS_ALL_REQUESTED_FLOWS" if not failed else "FAIL",
        "requiredFlows": required_flows,
        "flowStatus": flow_status,
        "missingFlows": missing,
        "failedFlows": failed,
    }


def run_streaming(page, args: argparse.Namespace, receipt: dict) -> None:
    if args.app != "playground":
        receipt["streamingStatus"] = "UNSUPPORTED_APP"
        return
    page.get_by_role("button", name="Stream Chunks", exact=True).click()
    expect(playground_status(page)).to_have_text(re.compile(r"^(Streaming complete.*|Offline transcription complete.*|Streaming failed:.*)$"), timeout=args.flow_timeout_ms)
    body = page.locator("body").inner_text()
    if "Streaming failed:" in body:
        receipt["streamingSupported"] = None
        receipt["streamingStatus"] = "FAILED"
        receipt["streamingPageText"] = body[-3000:]
        mark_gpu(page, receipt, "stream")
        return
    native = "Offline transcription complete" not in body and "Offline Fallback Result" not in body
    receipt["streamingSupported"] = native
    receipt["streamingStatus"] = "NATIVE_EXECUTED" if native else "UNSUPPORTED_OFFLINE_FALLBACK"
    steps = re.search(r"Streaming complete\s*\((\d+) steps\)", body)
    receipt["streamSteps"] = int(steps.group(1)) if steps else 0
    receipt["streamingPageText"] = body[-3000:]
    receipt["streamTranscript"] = transcript_locator(page, "playground").last.inner_text()
    mark_gpu(page, receipt, "stream")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, choices=APPS)
    parser.add_argument("--base-url", help="Override app URL; defaults to port 4190 app route")
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--source", choices=("local", "huggingface"), default="local")
    parser.add_argument("--descriptor-sources", help="Verified model catalog source values for a one-source UI entry (comma-separated)")
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--backend", default="wasm", help="Runtime/execution backend value requested in UI")
    parser.add_argument("--encoder-backend")
    parser.add_argument("--decoder-backend")
    parser.add_argument("--encoder-quant")
    parser.add_argument("--decoder-quant")
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--oracle", required=True, help="Exact normalized transcript expected for the whole fixture")
    parser.add_argument("--expected-fixture-sha256", help="Known-good fixture hash for independent identity verification")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--profile-dir", type=Path,
                        default=Path(__file__).resolve().parents[2] / 'tmp/real-e2e/model-audit-chrome-profile',
                        help="Test-owned browser profile; reuses model downloads across serial cases")
    parser.add_argument("--load-timeout-ms", type=int, default=300000)
    parser.add_argument("--flow-timeout-ms", type=int, default=180000)
    parser.add_argument("--run-streaming", action="store_true", help="Run Playground Stream Chunks; offline fallback is explicitly unsupported")
    parser.add_argument("--record-mic", action="store_true", help="Playground record-then-transcribe mic path (not continuous streaming)")
    parser.add_argument("--stream-recorded", action="store_true", help="After --record-mic, stream the same recorded audio through Playground")
    parser.add_argument("--mic-flow", action="append", default=[], help="Realtime capture: manual OR speech-detect:vad-only:ten-vad|firered-vad")
    parser.add_argument("--capture-mic-pcm", action="store_true",
                        help="Diagnostic only: save exact mono float32 PCM sent to the Realtime transcription worker")
    parser.add_argument("--mic-capture-ms", type=int, default=None,
                        help="Capture duration override; default is the full padded fake-microphone fixture duration")
    parser.add_argument("--capture-recorded-audio", action="store_true", help="Save Playground recording blob and independent 16k WebAudio PCM diagnostic")
    args = parser.parse_args()
    args.descriptor_sources = [part.strip() for part in (args.descriptor_sources or "").split(",") if part.strip()]
    if args.run_streaming and args.app != "playground":
        parser.error("--run-streaming is available only for the Playground demo")
    if args.record_mic and args.app != "playground":
        parser.error("--record-mic is available only for the Playground demo")
    if args.stream_recorded and args.app != "playground":
        parser.error("--stream-recorded is available only for the Playground demo")
    if args.stream_recorded and not args.record_mic:
        parser.error("--stream-recorded requires --record-mic")
    if args.mic_flow and args.app != "realtime":
        parser.error("--mic-flow is available only for the Realtime demo")
    if args.capture_mic_pcm and not args.mic_flow:
        parser.error("--capture-mic-pcm requires at least one --mic-flow")
    if args.capture_recorded_audio and not (args.app == "playground" and args.record_mic):
        parser.error("--capture-recorded-audio requires Playground --record-mic")
    requested_flows = expected_flow_ids(args)
    if len(requested_flows) != len(set(requested_flows)):
        parser.error("Requested flow options must be unique")
    args.fixture = args.fixture.resolve()
    if args.model_dir:
        args.model_dir = args.model_dir.resolve()
    args.output_dir = args.output_dir.resolve()
    if not args.fixture.is_file():
        parser.error("--fixture must be a file")
    if args.source == "local" and (not args.model_dir or not args.model_dir.is_dir()):
        parser.error("--source local requires --model-dir to be a directory")
    if args.expected_fixture_sha256 and not re.fullmatch(r"[0-9a-fA-F]{64}", args.expected_fixture_sha256):
        parser.error("--expected-fixture-sha256 must contain 64 hexadecimal characters")
    if args.mic_capture_ms is not None and args.mic_capture_ms <= 0:
        parser.error("--mic-capture-ms must be positive")
    try:
        ensure_fresh_output_dir(args.output_dir)
    except ValueError as error:
        parser.error(str(error))
    url = args.base_url or DEFAULT_URLS[args.app]
    receipt = new_receipt(args, args.fixture, "file")
    write_receipt(args.output_dir / "file.json", receipt)
    mic_evidence = []
    stream_receipt = None
    stream_recorded_receipt = None
    record_receipt = None
    if args.stream_recorded:
        stream_recorded_receipt = copy.deepcopy(receipt)
        stream_recorded_receipt.update({
            "flow": "stream-recorded",
            "sourceAudioFlow": "record-then-transcribe",
            "recordingReceiptPath": str((args.output_dir / "playground-record-then-transcribe.json").resolve()),
            "recordingStatus": "PENDING",
            "recordedInputSource": "Playground current recorded audio state",
            "activeStage": "awaiting-recorded-audio",
            "status": "PENDING_RECORDING",
            "runtimeStatus": "UNVERIFIED",
            "streamingStatus": "NOT_REQUESTED",
        })
        write_receipt(args.output_dir / "stream-recorded.json", stream_recorded_receipt)
    with sync_playwright() as playwright:
        browser_args = ["--enable-unsafe-webgpu"]
        if args.mic_flow or args.record_mic:
            padded = args.output_dir / (args.fixture.stem + "-padded-5s.wav")
            padded_fake_mic_fixture(args.fixture, padded)
            browser_args += ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", fake_audio_capture_flag(padded)]
        context = playwright.chromium.launch_persistent_context(
            str(args.profile_dir.resolve()), channel="chrome", headless=True, args=browser_args,
            permissions=["microphone"] if args.mic_flow or args.record_mic else [],
        )
        page = context.new_page()
        version_session = context.new_cdp_session(page)
        browser_version = version_session.send('Browser.getVersion')['product']
        version_session.detach()
        receipt["testBrowserProfile"] = str(args.profile_dir.resolve())
        page.set_default_timeout(45000)
        add_gpu_probe(page)
        if args.mic_flow:
            install_queue_capture(page, capture_mic_pcm=args.capture_mic_pcm)
            if args.capture_mic_pcm:
                page.expose_binding("__asrCaptureMicPcm", lambda _source, payload: save_captured_mic_pcm(args.output_dir, payload))
        page.on("pageerror", lambda error: receipt["pageErrors"].append(str(error)) if len(receipt["pageErrors"]) < 50 else None)
        def capture_console(message) -> None:
            entry = {"type": message.type, "text": message.text[:8000]}
            if len(receipt["console"]) < 500:
                receipt["console"].append(entry)
            if is_console_error(message.type, message.text) and len(receipt["consoleErrors"]) < 100:
                receipt["consoleErrors"].append(entry)
        page.on("console", capture_console)
        def track_request(request) -> None:
            url = request.url.split("?", 1)[0]
            if any(part in url for part in (".onnx", ".data", "tokenizer", "vocab", "config.json")) and len(receipt["artifactRequests"]) < 100:
                receipt["artifactRequests"].append({"url": url, "state": "pending"})
        def finish_request(request, *, failed: bool = False) -> None:
            url = request.url.split("?", 1)[0]
            for item in reversed(receipt["artifactRequests"]):
                if item["url"] == url and item["state"] == "pending":
                    response = None if failed else request.response()
                    item.update(state="failed" if failed else "finished", status=response.status if response else None)
                    if failed:
                        item["failure"] = request.failure
                    break
        page.on("request", track_request)
        page.on("requestfinished", finish_request)
        page.on("requestfailed", lambda request: finish_request(request, failed=True))
        page.on("crash", lambda: receipt["pageErrors"].append("Browser page crashed"))
        try:
            page.goto(url)
            page.wait_for_selector(".asr-suite")
            configure_model(page, args, receipt)
            profiling_controls = page.get_by_role("checkbox", name=re.compile("profil", re.IGNORECASE))
            profiling_count = profiling_controls.count()
            receipt["profilingSelection"] = {
                "controlCount": profiling_count,
                "enabled": profiling_controls.first.is_checked() if profiling_count == 1 else None,
            }
            receipt["activeStage"] = "model-configured"
            write_receipt(args.output_dir / "file.json", receipt)
            receipt["activeStage"] = "model-load-running"
            receipt["loadStatus"] = "RUNNING"
            receipt["status"] = "LOAD_RUNNING"
            write_receipt(args.output_dir / "file.json", receipt)
            wait_for_load(page, args, receipt)
            receipt["activeStage"] = "model-loaded"
            write_receipt(args.output_dir / "file.json", receipt)
            receipt["activeStage"] = "file-flow-running"
            receipt["runtimeStatus"] = "RUNNING"
            write_receipt(args.output_dir / "file.json", receipt)
            transcript_result = run_file_flow(page, args, receipt)
            receipt["transcript"] = transcript_result
            receipt["runtimeStatus"] = "EXECUTED"
            receipt["transcriptStatus"] = "EXACT" if normalize(transcript_result) == normalize(args.oracle) else "MISMATCH"
            mark_gpu(page, receipt, "file")
            if args.run_streaming:
                stream_receipt = copy.deepcopy(receipt)
                stream_receipt["flow"] = "streaming"
                stream_receipt["activeStage"] = "streaming-running"
                stream_receipt["status"] = "RUNNING"
                write_receipt(args.output_dir / "streaming.json", stream_receipt)
                try:
                    run_streaming(page, args, stream_receipt)
                    stream_receipt["runtimeStatus"] = "EXECUTED" if stream_receipt["streamingStatus"] == "NATIVE_EXECUTED" else "UNSUPPORTED"
                    stream_receipt["transcriptStatus"] = "EXACT" if normalize(stream_receipt.get("streamTranscript")) == normalize(args.oracle) else "MISMATCH"
                    stream_receipt["verificationErrors"] = verify_streaming_receipt(stream_receipt)
                    stream_receipt["status"] = "FAIL" if stream_receipt["verificationErrors"] else "PASS_NATIVE_STREAMING"
                except Exception as error:
                    stream_receipt["status"] = "FAIL"
                    stream_receipt["error"] = str(error)
                    stream_receipt["runtimeStatus"] = "FAIL"
                write_receipt(args.output_dir / "streaming.json", stream_receipt)
            if args.record_mic and args.app == "playground":
                record_receipt = copy.deepcopy(receipt)
                record_receipt["flow"] = "record-then-transcribe"
                record_receipt["controlledFakeMicrophone"] = True
                record_receipt["physicalMicrophone"] = "UNVERIFIED"
                record_receipt.pop("transcript", None)
                record_receipt.pop("verificationErrors", None)
                record_receipt["transcriptStatus"] = "UNVERIFIED"
                capture_fixture = args.output_dir / (args.fixture.stem + "-padded-5s.wav")
                capture_fixture_duration = wav_duration(capture_fixture)
                capture_duration_ms = resolve_mic_capture_ms(args.mic_capture_ms, capture_fixture)
                record_receipt.update({
                    "captureFixture": str(capture_fixture.resolve()),
                    "captureFixtureSha256": sha256(capture_fixture),
                    "captureFixtureDurationSeconds": capture_fixture_duration,
                    "requestedCaptureMs": capture_duration_ms,
                })
                record_receipt["status"] = "RUNNING"
                record_receipt["activeStage"] = "record-then-transcribe-running"
                write_receipt(args.output_dir / "playground-record-then-transcribe.json", record_receipt)
                try:
                    page.get_by_role("button", name="Record Mic", exact=True).click()
                    page.get_by_role("button", name="Stop Recording", exact=True).wait_for()
                    page.wait_for_timeout(capture_duration_ms)
                    page.get_by_role("button", name="Stop Recording", exact=True).click()
                    expect(playground_status(page)).to_have_text(re.compile(r"^(Recorded audio ready\.|Microphone recording failed:.*)$"), timeout=30000)
                    record_receipt["recordingTerminalStatus"] = playground_status(page).inner_text().strip()
                    record_receipt["recordingStatus"] = "CAPTURED" if record_receipt["recordingTerminalStatus"] == "Recorded audio ready." else "FAILED"
                    if args.capture_recorded_audio:
                        recorded = page.locator("audio").evaluate("""async (element) => {
                          const response = await fetch(element.currentSrc || element.src);
                          const blob = await response.blob();
                          const bytes = new Uint8Array(await blob.arrayBuffer());
                          const base64 = (data) => {
                            let binary = '';
                            for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
                            return btoa(binary);
                          };
                          const context = new AudioContext({sampleRate: 16000});
                          try {
                            const decoded = await context.decodeAudioData(bytes.buffer.slice(0));
                            const mono = new Float32Array(decoded.length);
                            for (let c = 0; c < decoded.numberOfChannels; c++) {
                              const channel = decoded.getChannelData(c);
                              for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
                            }
                            return {mimeType: blob.type, encodedBase64: base64(bytes),
                              pcmBase64: base64(new Uint8Array(mono.buffer)), frames: mono.length, sampleRate: decoded.sampleRate};
                          } finally { await context.close(); }
                        }""")
                        encoded = base64.b64decode(recorded.pop("encodedBase64"), validate=True)
                        pcm = base64.b64decode(recorded.pop("pcmBase64"), validate=True)
                        if len(pcm) != recorded["frames"] * 4:
                            raise ValueError("Recorded audio diagnostic PCM length mismatch")
                        encoded_path = args.output_dir / "recorded-audio.bin"
                        pcm_path = args.output_dir / "recorded-audio-browser-decoded.f32le"
                        if encoded_path.exists() or pcm_path.exists():
                            raise FileExistsError("Refusing to overwrite recorded-audio diagnostics")
                        encoded_path.write_bytes(encoded)
                        pcm_path.write_bytes(pcm)
                        record_receipt["recordedAudioArtifact"] = {**recorded,
                            "encodedPath": str(encoded_path.resolve()), "encodedSha256": sha256(encoded_path),
                            "pcmPath": str(pcm_path.resolve()), "pcmSha256": sha256(pcm_path),
                            "scope": "Independent WebAudio 16k mono decode of recorded blob; not an inference-input hook"}
                    page.evaluate("window.__asrGpuDispatches = 0")
                    page.get_by_role("button", name="Transcribe", exact=True).click()
                    expect(playground_status(page)).to_have_text(re.compile(r"^(Transcription complete\.|Failed:.*)$"), timeout=args.flow_timeout_ms)
                    terminal_status = playground_status(page).inner_text().strip()
                    failed = record_transcription_failed(record_receipt, terminal_status)
                    for key in ("pageErrors", "console", "consoleErrors"):
                        record_receipt[key] = copy.deepcopy(receipt[key])
                    if not failed:
                        record_receipt["activeStage"] = "record-then-transcribe-terminal"
                        record_receipt["runtimeStatus"] = "EXECUTED"
                        record_receipt["status"] = "TRANSCRIPTION_COMPLETE_PENDING_ORACLE"
                    write_receipt(args.output_dir / "playground-record-then-transcribe.json", record_receipt)
                    mark_gpu(page, record_receipt, "file")
                    if not failed:
                        record_receipt["activeStage"] = "record-then-transcribe-complete"
                        record_receipt["transcript"] = transcript_locator(page, "playground").last.inner_text()
                        record_receipt["transcriptStatus"] = "EXACT" if normalize(record_receipt["transcript"]) == normalize(args.oracle) else "MISMATCH"
                        record_receipt["verificationErrors"] = verify_receipt(record_receipt)
                        record_receipt["status"] = "FAIL" if record_receipt["verificationErrors"] else "PASS_CONTROLLED_RECORD_THEN_TRANSCRIBE"
                except Exception as error:
                    record_receipt["status"] = "FAIL"
                    record_receipt["runtimeStatus"] = "FAIL"
                    record_receipt["error"] = str(error)
                write_receipt(args.output_dir / "playground-record-then-transcribe.json", record_receipt)
            if args.stream_recorded:
                stream_recorded_receipt = copy.deepcopy(record_receipt or receipt)
                stream_recorded_receipt.update({
                    "flow": "stream-recorded",
                    "sourceAudioFlow": "record-then-transcribe",
                    "recordingReceiptPath": str((args.output_dir / "playground-record-then-transcribe.json").resolve()),
                    "recordingStatus": (record_receipt or {}).get("recordingStatus", "UNAVAILABLE"),
                    "recordingTerminalStatus": (record_receipt or {}).get("recordingTerminalStatus"),
                    "recordingTranscriptionStatus": (record_receipt or {}).get("transcriptStatus", "UNAVAILABLE"),
                    "recordingDiagnosticArtifact": copy.deepcopy((record_receipt or {}).get("recordedAudioArtifact")),
                    "recordedInputSource": "Playground current recorded audio state",
                    "activeStage": "stream-recorded-running",
                    "status": "RUNNING",
                    "runtimeStatus": "RUNNING",
                    "transcriptStatus": "UNVERIFIED",
                    "streamingStatus": "UNVERIFIED",
                    "actualGpuDispatches": {**(record_receipt or receipt).get("actualGpuDispatches", {}), "stream": 0},
                })
                stream_recorded_receipt.pop("transcript", None)
                stream_recorded_receipt.pop("terminalStatus", None)
                stream_recorded_receipt.pop("verificationErrors", None)
                stream_recorded_receipt.pop("error", None)
                stream_recorded_path = args.output_dir / "stream-recorded.json"
                write_receipt(stream_recorded_path, stream_recorded_receipt)
                try:
                    if stream_recorded_receipt["recordingStatus"] != "CAPTURED":
                        raise RuntimeError("Recorded audio was not available for the requested streaming flow")
                    page.evaluate("window.__asrGpuDispatches = 0")
                    run_streaming(page, args, stream_recorded_receipt)
                    stream_recorded_receipt["runtimeStatus"] = "EXECUTED" if stream_recorded_receipt["streamingStatus"] == "NATIVE_EXECUTED" else "UNSUPPORTED"
                    complete_recorded_streaming_receipt(stream_recorded_receipt, receipt)
                except Exception as error:
                    stream_recorded_receipt["status"] = "FAIL"
                    stream_recorded_receipt["runtimeStatus"] = "FAIL"
                    stream_recorded_receipt["error"] = str(error)
                    stream_recorded_receipt["verificationErrors"] = [str(error)]
                finally:
                    refresh_recorded_streaming_diagnostics(stream_recorded_receipt, receipt)
                    stream_recorded_receipt["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                    write_receipt(stream_recorded_path, stream_recorded_receipt)
            if args.mic_flow:
                try:
                    mic_evidence = run_realtime_mic(page, args, args.output_dir, receipt)
                except Exception as error:
                    receipt["micFlowError"] = str(error)
                    for flow_id in expected_flow_ids(args):
                        if flow_id.startswith("mic-"):
                            mic_path = args.output_dir / f"{flow_id}.json"
                            partial = json.loads(mic_path.read_text(encoding="utf-8")) if mic_path.exists() else new_receipt(args, args.fixture, flow_id)
                            if str(partial.get("status", "")).startswith("PASS_"):
                                continue
                            partial["status"] = "FAIL"
                            partial["runtimeStatus"] = "FAIL"
                            partial["error"] = str(error)
                            write_receipt(mic_path, partial)
            receipt["verificationErrors"] = verify_receipt(receipt)
            if str(args.backend).startswith("webgpu") or "webgpu" in component_requested(args):
                if receipt["actualGpuDispatches"].get("file", 0) <= 0:
                    receipt["verificationErrors"].append("Actual GPU dispatch telemetry is zero for file inference")
            receipt["status"] = "FAIL" if receipt["verificationErrors"] else "PASS_FILE_FLOW"
        except Exception as error:
            receipt["status"] = "FAIL"
            if receipt.get("loadStatus") == "RUNNING":
                receipt["loadStatus"] = "FAIL"
            if receipt.get("runtimeStatus") == "RUNNING":
                receipt["runtimeStatus"] = "FAIL"
            receipt["error"] = str(error)
            try:
                receipt["pageText"] = page.locator("body").inner_text()[-6000:]
            except Exception:
                pass
            if stream_recorded_receipt is not None and stream_recorded_receipt.get("status") == "PENDING_RECORDING":
                stream_recorded_receipt.update({
                    "status": "FAIL",
                    "runtimeStatus": "FAIL",
                    "activeStage": "stream-recorded-prerequisite-failed",
                    "error": "Model or file flow failed before recorded audio streaming could run",
                    "verificationErrors": ["Recorded audio streaming prerequisite did not complete"],
                })
        finally:
            receipt["browserVersion"] = browser_version
            receipt["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
            write_receipt(args.output_dir / "file.json", receipt)
            if stream_recorded_receipt is not None:
                if stream_recorded_receipt.get("status") in ("PENDING_RECORDING", "RUNNING"):
                    stream_recorded_receipt.update({
                        "status": "FAIL",
                        "runtimeStatus": "FAIL",
                        "activeStage": "stream-recorded-incomplete",
                        "error": "Recorded audio streaming did not reach a terminal result",
                        "verificationErrors": ["Recorded audio streaming did not reach a terminal result"],
                    })
                for key in ("pageErrors", "console", "consoleErrors"):
                    stream_recorded_receipt[key] = copy.deepcopy(receipt[key])
                stream_recorded_receipt["browserVersion"] = browser_version
                stream_recorded_receipt["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                write_receipt(args.output_dir / "stream-recorded.json", stream_recorded_receipt)
            try:
                page.screenshot(path=str(args.output_dir / "file.png"), full_page=True)
            except Exception:
                pass
            context.close()
    flow_receipts = {"file": receipt}
    if stream_receipt is not None:
        flow_receipts["streaming"] = stream_receipt
    if record_receipt is not None:
        flow_receipts["record-then-transcribe"] = record_receipt
    if stream_recorded_receipt is not None:
        flow_receipts["stream-recorded"] = stream_recorded_receipt
    for flow_id in expected_flow_ids(args):
        if flow_id.startswith("mic-"):
            mic_path = args.output_dir / f"{flow_id}.json"
            if mic_path.exists():
                flow_receipts[flow_id] = json.loads(mic_path.read_text(encoding="utf-8"))
    overall = aggregate_status(flow_receipts, expected_flow_ids(args))
    overall.update({"app": args.app, "modelId": args.model_id, "source": args.source, "requestedBackend": args.backend, "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    write_receipt(args.output_dir / "overall.json", overall)
    print(json.dumps(overall, ensure_ascii=False), flush=True)
    return 0 if overall["status"] == "PASS_ALL_REQUESTED_FLOWS" else 1


if __name__ == "__main__":
    sys.exit(main())
