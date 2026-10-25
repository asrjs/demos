import importlib.util
import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('wasm_capacity_probe', Path(__file__).with_name('trace-wasm-memory.py'))
probe = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(probe)


class WasmMemoryProbeTests(unittest.TestCase):
    def test_capture_binding_sidecar_bypasses_browser_queries(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            writes = []
            class BusyPage:
                def __init__(self):
                    self.evaluations = []
                    self.workers = []
                def is_closed(self):
                    return False
                def evaluate(self, expression):
                    self.evaluations.append(expression)
                    return {'capacityBytes': []}

            page = BusyPage()
            runner = probe.load_runner()
            original_write = runner.write_receipt
            def tracked_write(path, receipt):
                original_write(path, receipt)
                writes.append(Path(path))
            current = {'page': page, 'errors': [], 'last': None, 'arenaTransformations': [], 'runtimeFailed': False}
            extra = type('Extra', (), {'disable_whisper_cpu_arena': False})()
            trace_writer = probe.create_memory_probe_receipt_writer(
                get_page=lambda: page, current=current, extra=extra,
                runner=runner, base_write=tracked_write,
            )
            # save_captured_mic_pcm resolves write_receipt from this module's
            # globals, exactly as the live runner does after monkeypatching.
            self.assertIs(runner.save_captured_mic_pcm.__globals__, vars(runner))
            runner.write_receipt = trace_writer
            pcm = b'\x00\x00\x80?' + b'\x00\x00\x00\xbf'
            saved = runner.save_captured_mic_pcm(root, {
                'flow': 'mic-manual-manual-none', 'requestId': 2,
                'sampleRate': 16000, 'frames': 2,
                'pcmBase64': base64.b64encode(pcm).decode('ascii'),
            })

            pcm_path = Path(saved['pcmPath'])
            sidecar = Path(saved['captureReceiptPath'])
            self.assertEqual(pcm_path.read_bytes(), pcm)
            self.assertEqual(saved['pcmSha256'], hashlib.sha256(pcm).hexdigest())
            self.assertEqual(json.loads(sidecar.read_text(encoding='utf-8'))['pcmSha256'], saved['pcmSha256'])
            self.assertEqual(writes, [sidecar])
            self.assertEqual(page.evaluations, [])

            regular_receipt = {}
            trace_writer(root / 'flow.json', regular_receipt)
            self.assertEqual(len(page.evaluations), 1)
            self.assertEqual(regular_receipt['wasmLinearMemoryDiagnostics']['main'], {'capacityBytes': []})

    def test_later_failure_or_missing_repeat_cannot_pass(self):
        passed = {'status': 'PASS_ALL_REQUESTED_FLOWS'}
        self.assertEqual(probe.stress_status(0, 2, [passed])['status'], 'PASS_ALL_STRESS_REPEATS')
        self.assertEqual(probe.stress_status(0, 2, [{'status': 'FAIL'}])['status'], 'FAIL')
        self.assertEqual(probe.stress_status(0, 3, [passed])['status'], 'FAIL')
        self.assertEqual(probe.stress_status(1, 2, [passed])['status'], 'FAIL')

    def test_prior_runtime_error_is_sticky_and_prevents_later_worker_sampling(self):
        state = {'runtimeFailed': False}
        self.assertFalse(probe.runtime_failure_seen(state, {'runtimeStatus': 'EXECUTED'}))
        self.assertTrue(probe.runtime_failure_seen(state, {
            'status': 'FAIL', 'consoleErrors': [{'text': 'std::bad_alloc'}],
        }))
        self.assertTrue(probe.runtime_failure_seen(state, {'status': 'UNVERIFIED'}))

    def test_failed_primary_cycle_skips_repeats_and_remains_a_failure(self):
        self.assertTrue(probe.continue_stress_repeats('PASS_ALL_REQUESTED_FLOWS'))
        self.assertFalse(probe.continue_stress_repeats('FAIL'))
        skipped = {'status': 'FAIL', 'skipped': True, 'repeat': 2}
        self.assertEqual(probe.stress_status(1, 2, [skipped])['status'], 'FAIL')

    def test_probe_preserves_constructor_growth_and_failure_semantics(self):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel='chrome', headless=True)
            try:
                page = browser.new_page()
                page.evaluate(probe.MEMORY_PROBE)
                result = page.evaluate('''() => {
                  const memory = new WebAssembly.Memory({initial: 1, maximum: 2});
                  const before = memory.buffer.byteLength;
                  const previous = memory.grow(1);
                  let failed = false;
                  try { memory.grow(1); } catch (error) { failed = error instanceof RangeError; }
                  return {before, previous, failed, instance: memory instanceof WebAssembly.Memory,
                    diagnostic: globalThis.__asrWasmCapacityProbe()};
                }''')
                self.assertEqual(result['before'], 65536)
                self.assertEqual(result['previous'], 1)
                self.assertTrue(result['failed'])
                self.assertTrue(result['instance'])
                self.assertEqual(result['diagnostic']['capacityBytes'], [131072])
                self.assertEqual([item['status'] for item in result['diagnostic']['growth']], ['GROWN', 'FAILED'])
            finally:
                browser.close()

    def test_whisper_arena_transform_changes_only_exact_webgpu_whisper_session(self):
        whisper = (
            'const d={executionProviders:n.backendId.startsWith("webgpu")?'
            '[{name:"webgpu",deviceType:"gpu",powerPreference:"high-performance"}]:["wasm"],'
            'graphOptimizationLevel:"all",executionMode:"parallel",enableCpuMemArena:!0,'
            'enableMemPattern:!0,enableProfiling:n.enableProfiling??!1};'
        )
        transformed, evidence = probe.transform_whisper_cpu_arena(whisper)
        self.assertEqual(evidence['status'], 'TRANSFORMED')
        self.assertEqual(evidence['matchCount'], 1)
        self.assertIn('enableCpuMemArena:!1', transformed)
        self.assertNotIn('enableCpuMemArena:!0', transformed)
        self.assertEqual(len(evidence['originalSha256']), 64)
        self.assertEqual(len(evidence['transformedSha256']), 64)

    def test_whisper_arena_transform_rejects_unrelated_and_ambiguous_code(self):
        unrelated = (
            'const d={executionProviders:n.backendId==="webgpu"?["webgpu"]:["wasm"],'
            'graphOptimizationLevel:"all",executionMode:"parallel",enableCpuMemArena:!0,'
            'enableMemPattern:!0,enableProfiling:n.enableProfiling??!1};'
        )
        unchanged, evidence = probe.transform_whisper_cpu_arena(unrelated)
        self.assertEqual(unchanged, unrelated)
        self.assertEqual(evidence['status'], 'REJECTED')
        self.assertEqual(evidence['matchCount'], 0)
        self.assertEqual(evidence['originalSha256'], evidence['transformedSha256'])

        matching = (
            'executionProviders:n.backendId.startsWith("webgpu")?'
            '[{name:"webgpu",deviceType:"gpu",powerPreference:"high-performance"}]:["wasm"],'
            'graphOptimizationLevel:"all",executionMode:"parallel",enableCpuMemArena:!0,'
            'enableMemPattern:!0,enableProfiling:n.enableProfiling??!1'
        )
        ambiguous, evidence = probe.transform_whisper_cpu_arena(matching + ';' + matching)
        self.assertEqual(ambiguous, matching + ';' + matching)
        self.assertEqual(evidence['status'], 'REJECTED')
        self.assertEqual(evidence['matchCount'], 2)
        self.assertEqual(evidence['originalSha256'], evidence['transformedSha256'])

    def test_current_realtime_entry_and_transcription_worker_have_one_exact_target(self):
        dist = Path(__file__).resolve().parents[2] / 'dist' / 'realtime' / 'assets'
        entry_files = list(dist.glob('index-*.js'))
        worker_files = list(dist.glob('browser-transcription-worker-thread-*.js'))
        self.assertEqual(len(entry_files), 1)
        self.assertEqual(len(worker_files), 1)
        for path in [*entry_files, *worker_files]:
            source = path.read_text(encoding='utf-8')
            transformed, evidence = probe.transform_whisper_cpu_arena(source)
            self.assertEqual(evidence['status'], 'TRANSFORMED', path.name)
            self.assertEqual(evidence['matchCount'], 1, path.name)
            self.assertEqual(transformed.count('enableCpuMemArena:!1'), source.count('enableCpuMemArena:!1') + 1)


if __name__ == '__main__':
    unittest.main()
