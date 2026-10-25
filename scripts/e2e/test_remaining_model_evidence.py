"""Unit checks for strict real-model evidence receipt acceptance."""
from __future__ import annotations

import importlib.util
import base64
import hashlib
import json
import sys
import tempfile
import types
import unittest
import wave
from pathlib import Path
from argparse import Namespace
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("remaining-model-flows.py")

# The evidence verifier does not require Playwright; keep this unit test usable
# in environments where the browser runner dependency is intentionally absent.
try:
    import playwright.sync_api
except ModuleNotFoundError as error:
    if error.name not in ("playwright", "playwright.sync_api"):
        raise
    playwright = types.ModuleType("playwright")
    sync_api = types.ModuleType("playwright.sync_api")
    sync_api.sync_playwright = None
    sync_api.expect = None
    playwright.sync_api = sync_api
    sys.modules["playwright"] = playwright
    sys.modules["playwright.sync_api"] = sync_api

spec = importlib.util.spec_from_file_location("remaining_model_flows", SCRIPT)
runner = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(runner)


class EvidenceVerifierTests(unittest.TestCase):
    def test_output_directory_rejects_prior_evidence_without_modifying_it(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "completed"
            output.mkdir()
            receipt = output / "file.json"
            original = b'{"status":"PASS_FILE_FLOW"}\n'
            receipt.write_bytes(original)
            with self.assertRaisesRegex(ValueError, "preserve prior evidence"):
                runner.ensure_fresh_output_dir(output)
            self.assertEqual(receipt.read_bytes(), original)
            self.assertEqual(list(output.iterdir()), [receipt])

    def test_output_directory_accepts_new_or_empty_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            for output in (Path(temp_dir) / "new" / "nested", Path(temp_dir) / "empty"):
                if output.name == "empty":
                    output.mkdir()
                runner.ensure_fresh_output_dir(output)
                self.assertTrue(output.is_dir())
                self.assertEqual(list(output.iterdir()), [])

    def test_output_directory_rejects_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "receipt-file"
            output.write_bytes(b"preserved")
            with self.assertRaises(ValueError):
                runner.ensure_fresh_output_dir(output)
            self.assertEqual(output.read_bytes(), b"preserved")

    def test_default_capture_duration_covers_each_full_capture_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            for duration_ms in (21000, 26750):
                with self.subTest(duration_ms=duration_ms):
                    fixture = Path(temp_dir) / f"capture-{duration_ms}.wav"
                    with wave.open(str(fixture), "wb") as wav_file:
                        wav_file.setnchannels(1)
                        wav_file.setsampwidth(2)
                        wav_file.setframerate(1000)
                        wav_file.writeframes(b"\0\0" * duration_ms)
                    self.assertEqual(runner.resolve_mic_capture_ms(None, fixture), duration_ms)

    def test_explicit_capture_duration_overrides_fixture_duration(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture = Path(temp_dir) / "long-capture.wav"
            with wave.open(str(fixture), "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(1000)
                wav_file.writeframes(b"\0\0" * 26750)
            self.assertEqual(runner.resolve_mic_capture_ms(16000, fixture), 16000)

    def test_record_transcription_failure_is_saved_before_transcript_scoring(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            flow="record-then-transcribe",
            status="RUNNING",
            activeStage="record-then-transcribe-running",
            transcript=self.valid_receipt()["oracle"],
        )

        failed = runner.record_transcription_failed(receipt, "Failed: Reshape input length 8584 is not divisible by 80")

        self.assertTrue(failed)
        self.assertEqual(receipt["terminalStatus"], "Failed: Reshape input length 8584 is not divisible by 80")
        self.assertEqual(receipt["activeStage"], "record-then-transcribe-failed")
        self.assertEqual(receipt["runtimeStatus"], "FAIL")
        self.assertEqual(receipt["transcriptStatus"], "NOT_EVALUATED")
        self.assertNotIn("transcript", receipt)
        self.assertIn("before transcript comparison", receipt["verificationErrors"][0])

    def test_record_transcription_success_stores_terminal_status_for_oracle_scoring(self) -> None:
        receipt = self.valid_receipt()
        failed = runner.record_transcription_failed(receipt, "Transcription complete.")

        self.assertFalse(failed)
        self.assertEqual(receipt["terminalStatus"], "Transcription complete.")
        self.assertEqual(receipt["transcript"], receipt["oracle"])

    def test_empty_completed_mic_job_does_not_wait_for_transcript_text(self) -> None:
        evidence = {"enqueued": [{}], "completed": [{"textLength": 0}], "failed": []}
        self.assertFalse(runner.mic_queue_has_nonempty_text(evidence))
        receipt = self.valid_receipt()
        receipt["transcript"] = ""
        self.assertIn(
            "Transcript is partial, duplicated, or differs from exact oracle",
            runner.verify_receipt(receipt),
        )

    def test_nonempty_completed_mic_job_waits_for_transcript_text(self) -> None:
        self.assertTrue(runner.mic_queue_has_nonempty_text({"completed": [{"textLength": 12}]}))
        self.assertFalse(runner.mic_queue_has_nonempty_text({"completed": [{"textLength": 0}], "failed": [{}]}))

    def test_fake_microphone_fixture_cannot_loop(self) -> None:
        self.assertEqual(runner.fake_audio_capture_flag(Path("short.wav")), "--use-file-for-fake-audio-capture=short.wav%noloop")

    def test_recorded_streaming_is_a_separate_opt_in_flow(self) -> None:
        ordinary = Namespace(run_streaming=True, record_mic=False, stream_recorded=False, mic_flow=[])
        self.assertEqual(runner.expected_flow_ids(ordinary), ["file", "streaming"])
        recorded = Namespace(run_streaming=True, record_mic=True, stream_recorded=True, mic_flow=[])
        self.assertEqual(
            runner.expected_flow_ids(recorded),
            ["file", "streaming", "record-then-transcribe", "stream-recorded"],
        )

    def test_stream_recorded_cli_requires_playground_recording(self) -> None:
        common = ["--model-id", "test-model", "--fixture", "fixture.wav", "--oracle", "text", "--output-dir", "output"]
        invalid_arguments = (
            ["--app", "playground", "--stream-recorded"],
            ["--app", "realtime", "--record-mic", "--stream-recorded"],
        )
        for options in invalid_arguments:
            with self.subTest(options=options), patch.object(sys, "argv", ["remaining-model-flows.py", *common, *options]):
                with self.assertRaises(SystemExit) as raised:
                    runner.main()
                self.assertEqual(raised.exception.code, 2)

    def test_wasm_recorded_streaming_uses_its_own_dispatch_phase(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(flow="stream-recorded", actualGpuDispatches={"file": 9, "stream": 1})
        errors = runner.verify_receipt(receipt, require_exact=False)
        self.assertIn("WebGPU dispatch observed during requested WASM stream inference", errors)
        receipt["actualGpuDispatches"] = {"file": 9, "stream": 0}
        self.assertNotIn(
            "WebGPU dispatch observed during requested WASM stream inference",
            runner.verify_receipt(receipt, require_exact=False),
        )

    def test_mic_worker_capture_writes_exact_float32_bytes_and_hash(self) -> None:
        pcm_bytes = bytes.fromhex("0000803f000000bf")
        with tempfile.TemporaryDirectory() as temp_dir:
            result = runner.save_captured_mic_pcm(Path(temp_dir), {
                "flow": "mic-speech-detect-vad-only-ten-vad",
                "requestId": 7,
                "sampleRate": 16000,
                "frames": 2,
                "pcmBase64": base64.b64encode(pcm_bytes).decode("ascii"),
            })
            pcm_path = Path(result["pcmPath"])
            self.assertEqual(pcm_path.read_bytes(), pcm_bytes)
            self.assertEqual(result["pcmSha256"], hashlib.sha256(pcm_bytes).hexdigest())
            self.assertEqual(json.loads(Path(result["captureReceiptPath"]).read_text())["frames"], 2)

    def test_mic_worker_capture_rejects_invalid_frame_length_and_flow(self) -> None:
        base = {
            "flow": "mic-manual-manual-none",
            "requestId": 1,
            "sampleRate": 16000,
            "frames": 2,
            "pcmBase64": base64.b64encode(b"1234").decode("ascii"),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(ValueError, "byte length"):
                runner.save_captured_mic_pcm(Path(temp_dir), base)
            invalid_flow = {**base, "flow": "../outside"}
            with self.assertRaisesRegex(ValueError, "flow"):
                runner.save_captured_mic_pcm(Path(temp_dir), invalid_flow)

    def test_requested_mic_pcm_capture_requires_saved_worker_artifacts(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            captureMicPcmRequested=True,
            enqueued=[{}],
            completed=[{}],
            capturedMicPcm=[],
            actualGpuDispatches={"file": 0, "mic": 0},
        )
        errors = runner.verify_receipt(receipt)
        self.assertIn("Captured mic PCM count does not match completed worker queue jobs", errors)

    def test_complete_saved_mic_pcm_capture_can_be_verified(self) -> None:
        pcm_bytes = base64.b64encode(bytes.fromhex("0000803f")).decode("ascii")
        with tempfile.TemporaryDirectory() as temp_dir:
            saved = runner.save_captured_mic_pcm(Path(temp_dir), {
                "flow": "mic-manual-manual-none",
                "requestId": 2,
                "sampleRate": 16000,
                "frames": 1,
                "pcmBase64": pcm_bytes,
            })
            receipt = self.valid_receipt()
            receipt.update(
                captureMicPcmRequested=True,
                enqueued=[{}],
                completed=[{}],
                capturedMicPcm=[{
                    "requestId": 2,
                    "responseType": "SUCCESS",
                    "frames": 1,
                    "pcmPath": saved["pcmPath"],
                    "pcmSha256": saved["pcmSha256"],
                }],
            )
            self.assertEqual(runner.verify_receipt(receipt), [])

    def test_gpu_probe_only_targets_transcription_workers(self) -> None:
        self.assertTrue(runner.is_transcription_worker_url("http://localhost/assets/browser-transcription-worker-thread-abc.js"))
        self.assertTrue(runner.is_transcription_worker_url("http://localhost/browser-transcription-worker-thread.js"))
        for url in ("http://localhost/ort.bundle.min.js", "blob:http://localhost/123", "http://localhost/ten-vad-worker-abc.js", "http://localhost/firered-vad-worker-abc.js"):
            self.assertFalse(runner.is_transcription_worker_url(url))

    def test_native_ort_warning_on_stderr_is_not_a_runtime_error(self) -> None:
        self.assertFalse(runner.is_console_error("error", "[W:onnxruntime:, session_state.cc:1398] Some nodes use CPU"))
        self.assertTrue(runner.is_console_error("error", "[E:onnxruntime:, inference_session.cc] Run failed"))
        self.assertTrue(runner.is_console_error("error", "Warm-up failed: missing decoder input"))
        self.assertTrue(runner.is_console_error("error", "Warm-up failed after warning [W:onnxruntime:, diagnostic]"))

    def valid_receipt(self) -> dict:
        text = "And so my fellow Americans ask not what your country can do for you ask what you can do for your country"
        return {
            "fixtureSha256": "a" * 64,
            "expectedFixtureSha256": "a" * 64,
            "sourceSelectionStatus": "UI",
            "loadStatus": "EXECUTED",
            "runtimeStatus": "EXECUTED",
            "transcript": text,
            "oracle": text,
            "pageErrors": [],
            "physicalMicrophone": "UNVERIFIED",
            "requestedBackend": "wasm",
            "actualBackend": "wasm",
            "actualGpuDispatches": {"file": 0, "mic": 0},
        }

    def test_completed_old_queue_cannot_hide_an_incomplete_microphone_stop(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(enqueued=[{}], completed=[{}], failed=[], controlledFakeMicrophone=True,
                       stopCompletionObserved=True)
        self.assertEqual(runner.verify_receipt(receipt, require_mic=True), [])
        receipt["stopCompletionObserved"] = False
        self.assertIn("Microphone stop did not complete before transcript acceptance",
                      runner.verify_receipt(receipt, require_mic=True))

    def test_exact_complete_fixture_flow_is_accepted(self) -> None:
        self.assertEqual(runner.verify_receipt(self.valid_receipt()), [])

    def test_correct_text_from_the_wrong_model_cannot_pass(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(modelId="requested-model", actualModelId="another-model")
        self.assertIn("Loaded model selection differs from request", runner.verify_receipt(receipt))

    def test_missing_known_fixture_identity_is_rejected(self) -> None:
        receipt = self.valid_receipt()
        receipt["expectedFixtureSha256"] = None
        self.assertIn("Known-good fixture SHA-256 was not supplied", runner.verify_receipt(receipt))

    def test_wrong_fixture_hash_is_rejected(self) -> None:
        receipt = self.valid_receipt()
        receipt["fixtureSha256"] = "b" * 64
        self.assertIn("Wrong fixture SHA-256", runner.verify_receipt(receipt))

    def test_partial_or_duplicate_transcript_is_rejected(self) -> None:
        for transcript in ("And so my fellow Americans", self.valid_receipt()["oracle"] * 2):
            with self.subTest(transcript=transcript[:35]):
                receipt = self.valid_receipt()
                receipt["transcript"] = transcript
                self.assertTrue(any("Transcript is partial" in e for e in runner.verify_receipt(receipt)))

    def test_unverified_load_and_browser_errors_are_rejected(self) -> None:
        receipt = self.valid_receipt()
        receipt["loadStatus"] = "UNVERIFIED"
        receipt["pageErrors"] = ["TypeError: model load failed"]
        errors = runner.verify_receipt(receipt)
        self.assertIn("Real model load not verified", errors)
        self.assertIn("Browser page errors present", errors)

    def test_real_gpu_dispatch_is_required_for_webgpu(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(requestedBackend="webgpu", actualBackend="webgpu", actualGpuDispatches={"file": 0})
        self.assertTrue(any("Actual WebGPU dispatch missing" in e for e in runner.verify_receipt(receipt)))

    def test_wasm_cannot_pass_with_silent_gpu_execution(self) -> None:
        receipt = self.valid_receipt()
        receipt["actualGpuDispatches"]["file"] = 5
        self.assertIn("WebGPU dispatch observed during requested WASM file inference", runner.verify_receipt(receipt))

    def test_hybrid_webgpu_dispatch_is_also_required(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(requestedBackend="webgpu-hybrid", actualBackend="webgpu-hybrid", actualGpuDispatches={"file": 0})
        self.assertTrue(any("Actual WebGPU dispatch missing" in e for e in runner.verify_receipt(receipt)))

    def test_mic_requires_balanced_queue_and_unique_segment_bounds(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            controlledFakeMicrophone=True,
            gate="vad-only",
            enqueued=[{"startFrame": 10, "endFrame": 20}],
            completed=[],
            decisions=[],
            actualGpuDispatches={"file": 0, "mic": 0},
        )
        errors = runner.verify_receipt(receipt, require_mic=True)
        self.assertIn("Microphone queue enqueue/complete counts differ", errors)
        self.assertIn("No selected VAD readiness evidence", errors)

    def test_mic_duplicate_segment_is_rejected(self) -> None:
        receipt = self.valid_receipt()
        segment = {"message": "Segment ready: audio", "meta": {"startFrame": 3, "endFrame": 9}}
        receipt.update(
            controlledFakeMicrophone=True,
            gate="rough-only",
            enqueued=[{}, {}],
            completed=[{}, {}],
            decisions=[segment, segment],
            actualGpuDispatches={"file": 0, "mic": 0},
        )
        errors = runner.verify_receipt(receipt, require_mic=True)
        self.assertIn("Duplicate microphone segment bounds", errors)

    def context_tail_receipt(self, root: Path) -> dict:
        prior_context = {
            "id": "speech-context-1", "revision": 1, "startFrame": 100,
            "endFrame": 104, "sampleRate": 10,
        }
        final_context = {**prior_context, "revision": 2, "endFrame": 108, "finalized": True}
        prior_pcm = bytes(range(16))
        final_pcm = prior_pcm + bytes(range(16, 32))
        prior_path = root / "prior.f32le"
        final_path = root / "final.f32le"
        prior_path.write_bytes(prior_pcm)
        final_path.write_bytes(final_pcm)

        def capture(context: dict, path: Path, pcm: bytes, request_id: int) -> dict:
            return {
                "requestId": request_id, "responseType": "SUCCESS", "sampleRate": 10,
                "frames": len(pcm) // 4, "pcmPath": str(path),
                "pcmSha256": hashlib.sha256(pcm).hexdigest(), "captureError": None,
                "queue": {"context": context},
            }

        receipt = self.valid_receipt()
        receipt.update(
            controlledFakeMicrophone=True,
            gate="vad-only",
            vadBackend="ten-vad",
            enqueued=[{"context": prior_context}, {"context": final_context}],
            completed=[{}, {}],
            failed=[],
            decisions=[
                {"message": "Segment ready: silence", "meta": {"startFrame": 100, "endFrame": 104}},
                {"message": "[StreamingSpeechDetector] TEN-VAD ready for diagnostics"},
                {"message": "[StreamingSpeechDetector] Gate evidence", "meta": {"gateMode": "vad-only"}},
            ],
            captureMicPcmRequested=True,
            capturedMicPcm=[
                capture(prior_context, prior_path, prior_pcm, 1),
                capture(final_context, final_path, final_pcm, 2),
            ],
            actualGpuDispatches={"file": 0, "mic": 0},
        )
        return receipt

    def test_single_finalized_context_tail_requires_same_context_and_exact_pcm_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            receipt = self.context_tail_receipt(Path(temp_dir))
            self.assertEqual(runner.verify_receipt(receipt, require_mic=True), [])

            receipt["enqueued"][1]["context"]["id"] = "speech-context-2"
            errors = runner.verify_receipt(receipt, require_mic=True)
            self.assertIn("Finalized microphone context tail changed context identity", errors)

    def test_finalized_context_tail_rejects_nonmonotonic_or_oversized_extension(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            receipt = self.context_tail_receipt(Path(temp_dir))
            receipt["enqueued"][1]["context"]["revision"] = 3
            self.assertIn(
                "Finalized microphone context tail revision is not the next revision",
                runner.verify_receipt(receipt, require_mic=True),
            )
            receipt = self.context_tail_receipt(Path(temp_dir))
            receipt["enqueued"][1]["context"]["endFrame"] = 111
            self.assertIn(
                "Finalized microphone context tail exceeds the 600 ms limit",
                runner.verify_receipt(receipt, require_mic=True),
            )

    def test_finalized_context_tail_must_be_single_and_terminal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            receipt = self.context_tail_receipt(Path(temp_dir))
            receipt["enqueued"].append({"context": {"id": "other", "revision": 1}})
            receipt["completed"].append({})
            receipt["capturedMicPcm"].append({})
            errors = runner.verify_receipt(receipt, require_mic=True)
            self.assertIn("Finalized microphone context tail is not the last queued job", errors)
            self.assertIn("Finalized microphone context tail is not exactly one extra queue job", errors)

            receipt = self.context_tail_receipt(Path(temp_dir))
            receipt["enqueued"].append({"context": {**receipt["enqueued"][1]["context"]}})
            receipt["completed"].append({})
            self.assertIn(
                "More than one finalized microphone context tail was enqueued",
                runner.verify_receipt(receipt, require_mic=True),
            )

    def test_finalized_context_tail_rejects_missing_or_changed_pcm_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            receipt = self.context_tail_receipt(root)
            receipt["capturedMicPcm"][1]["pcmPath"] = str(root / "missing.f32le")
            self.assertIn(
                "Finalized microphone context tail PCM artifact cannot be read",
                runner.verify_receipt(receipt, require_mic=True),
            )

            receipt = self.context_tail_receipt(root)
            final_path = Path(receipt["capturedMicPcm"][1]["pcmPath"])
            final_path.write_bytes(b"X" + final_path.read_bytes()[1:])
            self.assertIn(
                "Finalized microphone context tail PCM does not preserve the prior context prefix",
                runner.verify_receipt(receipt, require_mic=True),
            )

    def test_unfinalized_context_does_not_allow_an_extra_queue_job(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            controlledFakeMicrophone=True,
            gate="vad-only",
            vadBackend="ten-vad",
            enqueued=[{"context": {"id": "ctx", "revision": 1, "finalized": False}}, {}],
            completed=[{}, {}],
            failed=[],
            decisions=[
                {"message": "Segment ready: audio", "meta": {"startFrame": 0, "endFrame": 10}},
                {"message": "[StreamingSpeechDetector] TEN-VAD ready for diagnostics"},
                {"message": "Gate evidence", "meta": {"gateMode": "vad-only"}},
            ],
            actualGpuDispatches={"file": 0, "mic": 0},
        )
        self.assertIn(
            "Microphone segment count differs from transcription job count",
            runner.verify_receipt(receipt, require_mic=True),
        )

    def test_no_context_extension_needs_no_terminal_queue_job(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            controlledFakeMicrophone=True,
            gate="vad-only",
            vadBackend="ten-vad",
            enqueued=[{"context": {"id": "ctx", "revision": 1, "finalized": False}}],
            completed=[{}],
            failed=[],
            decisions=[
                {"message": "Segment ready: audio", "meta": {"startFrame": 0, "endFrame": 10}},
                {"message": "[StreamingSpeechDetector] TEN-VAD ready for diagnostics"},
                {"message": "Gate evidence", "meta": {"gateMode": "vad-only"}},
            ],
            actualGpuDispatches={"file": 0, "mic": 0},
        )
        self.assertEqual(runner.verify_receipt(receipt, require_mic=True), [])

    def test_selected_vad_must_match_readiness(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(controlledFakeMicrophone=True, gate="vad-only", vadBackend="ten-vad",
                       enqueued=[{}], completed=[{}], decisions=[
                           {"message": "[StreamingSpeechDetector] FireRed VAD ready for diagnostics"},
                           {"message": "Segment ready: audio", "meta": {"gateMode": "vad-only"}},
                       ])
        errors = runner.verify_receipt(receipt, require_mic=True)
        self.assertIn("No selected VAD readiness evidence", errors)
        receipt["decisions"][0]["message"] = "[StreamingSpeechDetector] TEN-VAD ready for diagnostics"
        self.assertEqual(runner.verify_receipt(receipt, require_mic=True), [])

    def test_physical_mic_claim_cannot_pass(self) -> None:
        receipt = self.valid_receipt()
        receipt["physicalMicrophone"] = "PASS"
        self.assertIn("Harness cannot certify physical microphone input", runner.verify_receipt(receipt))

    def test_offline_fallback_is_not_native_streaming_pass(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(streamingStatus="UNSUPPORTED_OFFLINE_FALLBACK", streamTranscript=receipt["oracle"])
        self.assertTrue(any("Native streaming was unsupported" in e for e in runner.verify_streaming_receipt(receipt)))

    def test_streaming_partial_result_is_rejected(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(streamingStatus="NATIVE_EXECUTED", streamTranscript="And so my fellow Americans")
        self.assertTrue(any("differs from exact oracle" in e for e in runner.verify_streaming_receipt(receipt)))

    def test_webgpu_streaming_requires_its_own_dispatches(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            requestedBackend="webgpu-hybrid",
            actualBackend="webgpu-hybrid",
            streamingStatus="NATIVE_EXECUTED",
            streamTranscript=receipt["oracle"],
            actualGpuDispatches={"file": 8, "stream": 0},
        )
        self.assertTrue(any("for native streaming" in e for e in runner.verify_streaming_receipt(receipt)))

    def test_streaming_requires_multiple_steps_even_with_a_complete_transcript(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(streamingStatus="NATIVE_EXECUTED", streamTranscript=receipt["oracle"], streamSteps=1)
        self.assertIn("Multiple native streaming steps were not verified", runner.verify_streaming_receipt(receipt))
        receipt["streamSteps"] = 19
        self.assertEqual(runner.verify_streaming_receipt(receipt), [])

    def test_late_recorded_streaming_page_error_revokes_pass(self) -> None:
        receipt = self.valid_receipt()
        receipt.update(
            flow="stream-recorded",
            streamingStatus="NATIVE_EXECUTED",
            streamTranscript=receipt["oracle"],
            streamSteps=2,
        )
        errors = runner.complete_recorded_streaming_receipt(receipt, {"pageErrors": [], "console": [], "consoleErrors": []})
        self.assertEqual(errors, [])
        self.assertEqual(receipt["transcript"], receipt["streamTranscript"])
        errors = runner.refresh_recorded_streaming_diagnostics(receipt, {
            "pageErrors": ["late browser failure"],
            "console": [],
            "consoleErrors": [],
        })
        self.assertEqual(receipt["status"], "FAIL")
        self.assertIn("Browser page errors present", errors)
        self.assertEqual(receipt["pageErrors"], ["late browser failure"])

    def test_aggregate_rejects_failed_requested_streaming_flow(self) -> None:
        receipts = {
            "file": {"status": "PASS_FILE_FLOW", "verificationErrors": []},
            "streaming": {"status": "FAIL", "verificationErrors": ["offline fallback"]},
        }
        result = runner.aggregate_status(receipts, ["file", "streaming"])
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["failedFlows"], ["streaming"])

    def test_aggregate_rejects_missing_requested_microphone_flow(self) -> None:
        result = runner.aggregate_status({"file": {"status": "PASS_FILE_FLOW"}}, ["file", "mic-speech-detect-vad-only-ten-vad"])
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["missingFlows"], ["mic-speech-detect-vad-only-ten-vad"])

    def test_aggregate_passes_only_when_every_requested_flow_passes(self) -> None:
        receipts = {
            "file": {"status": "PASS_FILE_FLOW", "verificationErrors": []},
            "streaming": {"status": "PASS_NATIVE_STREAMING", "verificationErrors": []},
        }
        result = runner.aggregate_status(receipts, ["file", "streaming"])
        self.assertEqual(result["status"], "PASS_ALL_REQUESTED_FLOWS")


if __name__ == "__main__":
    unittest.main()
