"""Browser transport regression for opt-in exact mic PCM capture."""
from __future__ import annotations

import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


SCRIPT = Path(__file__).with_name("remaining-model-flows.py")
spec = importlib.util.spec_from_file_location("remaining_model_flows_pcm_test", SCRIPT)
runner = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(runner)


class MicPcmWorkerCaptureTests(unittest.TestCase):
    def test_captures_before_transfer_and_preserves_worker_request(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir, sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch(channel="chrome", headless=True)
            except Exception as error:  # pragma: no cover - depends on host browser installation
                self.skipTest(f"Chromium unavailable: {error}")
            try:
                page = browser.new_page()
                page.expose_binding(
                    "__asrCaptureMicPcm",
                    lambda _source, payload: runner.save_captured_mic_pcm(Path(temp_dir), payload),
                )
                page.route("**/*", lambda route: route.fulfill(body="<html><body></body></html>"))
                page.route(
                    "**/browser-transcription-worker-thread.js",
                    lambda route: route.fulfill(
                        content_type="text/javascript",
                        body="self.onmessage = e => self.postMessage({id:e.data.id,type:'SUCCESS',payload:{received:Array.from(e.data.payload.pcm),sampleRate:e.data.payload.sampleRate,options:e.data.payload.options}});",
                    ),
                )
                runner.install_queue_capture(page, capture_mic_pcm=True)
                page.goto("http://capture.test/")
                result = page.evaluate("""async () => {
                  window.__asrPcmCaptureRecords = [];
                  window.__asrPcmCapturePending = [];
                  const worker = new Worker('/browser-transcription-worker-thread.js');
                  const send = (id, enabled) => new Promise((resolve, reject) => {
                    window.__asrCaptureMicPcmEnabled = enabled;
                    window.__asrPcmCaptureFlow = 'mic-manual-manual-none';
                    worker.onmessage = event => resolve(event.data);
                    worker.onerror = reject;
                    const pcm = Float32Array.from([0.25, -0.5, 1]);
                    const originalBuffer = pcm.buffer;
                    worker.postMessage({
                      id,
                      type: 'TRANSCRIBE_MONO_PCM',
                      payload: { pcm, sampleRate: 16000, options: { responseFlavor: 'canonical' } },
                    }, [originalBuffer]);
                    window.__asrLastTransferByteLength = originalBuffer.byteLength;
                  });
                  const disabled = await send(16, false);
                  const bindingStillFunction = typeof window.__asrCaptureMicPcm === 'function';
                  const enabled = await send(17, true);
                  await Promise.all(window.__asrPcmCapturePending);
                  const records = window.__asrPcmCaptureRecords;
                  worker.terminate();
                  return { disabled, enabled, bindingStillFunction, transferredByteLength: window.__asrLastTransferByteLength,
                    records: records.map(({requestId, sampleRate, frames, responseType, captureError, pcmSha256}) =>
                      ({requestId, sampleRate, frames, responseType, captureError, pcmSha256})) };
                }""")
                expected = struct.pack("<fff", 0.25, -0.5, 1.0)
                self.assertEqual(result["disabled"]["payload"]["received"], [0.25, -0.5, 1])
                self.assertEqual(result["disabled"]["payload"]["sampleRate"], 16000)
                self.assertEqual(result["disabled"]["payload"]["options"], {"responseFlavor": "canonical"})
                self.assertEqual(result["enabled"]["id"], 17)
                self.assertEqual(result["enabled"]["payload"]["received"], [0.25, -0.5, 1])
                self.assertEqual(result["enabled"]["payload"]["sampleRate"], 16000)
                self.assertEqual(result["enabled"]["payload"]["options"], {"responseFlavor": "canonical"})
                self.assertTrue(result["bindingStillFunction"])
                self.assertEqual(result["transferredByteLength"], 0)
                self.assertEqual(len(result["records"]), 1)
                self.assertEqual(result["records"][0]["requestId"], 17)
                self.assertEqual(result["records"][0]["sampleRate"], 16000)
                self.assertEqual(result["records"][0]["frames"], 3)
                self.assertEqual(result["records"][0]["responseType"], "SUCCESS")
                self.assertIsNone(result["records"][0]["captureError"])
                pcm_files = list((Path(temp_dir) / "mic-pcm-capture").glob("*.f32le"))
                self.assertEqual(len(pcm_files), 1)
                self.assertEqual(pcm_files[0].read_bytes(), expected)
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()
