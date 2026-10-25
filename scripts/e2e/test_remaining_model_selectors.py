"""Browser regressions for selectors that invalidated earlier model evidence."""
import importlib.util
from argparse import Namespace
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location("model_flows", Path(__file__).with_name("remaining-model-flows.py"))
runner = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(runner)


class ModelFlowSelectorTests(unittest.TestCase):
    def setUp(self):
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(channel="chrome", headless=True)
        self.page = self.browser.new_page()

    def tearDown(self):
        self.browser.close()
        self.playwright.stop()

    def test_mode_does_not_select_the_disabled_model_control(self):
        self.page.set_content('''
          <label class="field"><div><span class="field-label">Model</span></div>
            <select disabled><option value="model">Model</option></select></label>
          <label class="field"><div><span class="field-label">Mode</span></div>
            <select><option value="manual">Manual</option><option value="speech-detect">Speech Detect</option></select></label>
        ''')
        mode = runner.labeled_select(self.page, "Mode")
        mode.select_option("speech-detect", timeout=1000)
        self.assertEqual(mode.input_value(), "speech-detect")
        self.assertEqual(runner.labeled_select(self.page, "Model").input_value(), "model")

    def test_old_progress_success_cannot_complete_a_new_transcription(self):
        self.page.set_content('''
          <section class="panel-shell"><div><h2>Status</h2><p>Live status.</p></div>
            <div class="space-y-3"><p>Transcribing…</p>
              <div><p>Transcription complete.</p></div></div></section>
          <section class="panel-shell"><h2>Events</h2><p>Transcription complete.</p></section>
        ''')
        self.assertEqual(runner.playground_status(self.page).inner_text(), "Transcribing…")

    def test_unexpected_gpu_component_is_rejected_before_load_button_click(self):
        self.page.set_content('''
          <label>Encoder Backend<select><option value="webgpu">WebGPU</option></select></label>
          <button onclick="window.loadClicked=true">Load Model</button>
        ''')
        receipt = {"actualComponentBackends": [runner.labeled_select(self.page, "Encoder Backend").input_value()]}
        args = Namespace(backend="wasm", encoder_backend=None, decoder_backend=None)
        with self.assertRaisesRegex(RuntimeError, "Requested WASM"):
            runner.wait_for_load(self.page, args, receipt)
        self.assertFalse(self.page.evaluate("window.loadClicked === true"))

    def test_preflight_preserves_explicit_hybrid_and_pure_wasm_requests(self):
        runner.assert_requested_backend_selection(
            Namespace(backend="wasm", encoder_backend="webgpu", decoder_backend="wasm"),
            {"actualComponentBackends": ["webgpu", "wasm"]},
        )
        runner.assert_requested_backend_selection(
            Namespace(backend="wasm", encoder_backend="wasm", decoder_backend="wasm"),
            {"actualComponentBackends": ["wasm", "wasm"]},
        )


if __name__ == "__main__":
    unittest.main()
