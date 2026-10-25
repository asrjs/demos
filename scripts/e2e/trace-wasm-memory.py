"""Run remaining-model-flows with optional WASM capacity diagnostics.

This observes linear-memory capacity/growth, not live allocations or GPU memory.
It forwards the ordinary runner's CLI and acceptance gates unchanged.

Diagnostic options:
  --mic-stress-repeats N       Repeat microphone flows in the same page/model.
  --disable-whisper-cpu-arena  Transform the exact Realtime Whisper WebGPU
                               session option in intercepted JS responses.
                               This is an experiment, not package acceptance;
                               it allows one mic-flow cycle only.
"""
import importlib.util
import argparse
import copy
import hashlib
import re
import sys
from pathlib import Path


MEMORY_PROBE = r"""() => {
  if (globalThis.__asrWasmCapacityProbe) return;
  const NativeMemory = WebAssembly.Memory;
  const nativeGrow = NativeMemory.prototype.grow;
  const seen = new WeakSet();
  const memories = [];
  const growth = [];
  const remember = memory => {
    if (!seen.has(memory)) {
      seen.add(memory);
      memories.push(new WeakRef(memory));
    }
  };
  NativeMemory.prototype.grow = function(delta) {
    remember(this);
    const event = {beforeBytes: this.buffer.byteLength, requestedPages: delta, atMs: performance.now()};
    try {
      const previousPages = nativeGrow.call(this, delta);
      event.afterBytes = this.buffer.byteLength;
      event.status = 'GROWN';
      return previousPages;
    } catch (error) {
      event.afterBytes = this.buffer.byteLength;
      event.status = 'FAILED';
      event.error = String(error);
      throw error;
    } finally {
      if (growth.length < 500) growth.push(event);
    }
  };
  WebAssembly.Memory = new Proxy(NativeMemory, {
    construct(target, args, newTarget) {
      const memory = Reflect.construct(target, args, newTarget);
      remember(memory);
      return memory;
    },
  });
  Object.defineProperty(globalThis, '__asrWasmCapacityProbe', {value: () => ({
    scope: 'linear memory capacity and JS-visible growth; not live allocations or GPU memory',
    capacityBytes: memories.map(ref => ref.deref()?.buffer.byteLength ?? null),
    growth,
  })});
}"""


# Exact minified Whisper create-session contract in the current Realtime build.
# The worker parameter may be minified to a different identifier, but its
# backendId reference must match the enableProfiling reference in the options.
WHISPER_WEBGPU_ARENA = re.compile(
    r'executionProviders:(?P<runtime>[A-Za-z_$][\w$]*)\.backendId\.startsWith\("webgpu"\)'
    r'\?\[\{name:"webgpu",deviceType:"gpu",powerPreference:"high-performance"\}\]'
    r':\["wasm"\],graphOptimizationLevel:"all",executionMode:"parallel",'
    r'enableCpuMemArena:!0,enableMemPattern:!0,enableProfiling:'
    r'(?P=runtime)\.enableProfiling\?\?!1'
)


def transform_whisper_cpu_arena(source):
    """Disable only the exact WebGPU Whisper session arena in one JS response."""
    matches = list(WHISPER_WEBGPU_ARENA.finditer(source))
    original_hash = hashlib.sha256(source.encode('utf-8')).hexdigest()
    if len(matches) != 1:
        return source, {
            'status': 'REJECTED', 'matchCount': len(matches),
            'originalSha256': original_hash, 'transformedSha256': original_hash,
        }
    match = matches[0]
    transformed = source[:match.start()] + match.group(0).replace(
        'enableCpuMemArena:!0', 'enableCpuMemArena:!1', 1
    ) + source[match.end():]
    if transformed == source:
        return source, {
            'status': 'REJECTED', 'matchCount': 1, 'error': 'replacement made no change',
            'originalSha256': original_hash, 'transformedSha256': original_hash,
        }
    return transformed, {
        'status': 'TRANSFORMED', 'matchCount': 1,
        'originalSha256': original_hash,
        'transformedSha256': hashlib.sha256(transformed.encode('utf-8')).hexdigest(),
    }


def load_runner():
    spec = importlib.util.spec_from_file_location('wasm_capacity_model_flows', Path(__file__).with_name('remaining-model-flows.py'))
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def stress_status(base_code, expected_repeats, summaries):
    missing = expected_repeats - 1 - len(summaries)
    passed = base_code == 0 and missing == 0 and all(
        item.get('status') == 'PASS_ALL_REQUESTED_FLOWS' for item in summaries
    )
    return {'status': 'PASS_ALL_STRESS_REPEATS' if passed else 'FAIL',
            'baseExitCode': base_code, 'requestedRepeats': expected_repeats,
            'missingRepeats': max(0, missing), 'repeats': summaries}


def continue_stress_repeats(primary_status):
    return primary_status == 'PASS_ALL_REQUESTED_FLOWS'


def runtime_failure_seen(current, receipt):
    current['runtimeFailed'] = current.get('runtimeFailed', False) or (
        receipt.get('runtimeStatus') == 'FAIL'
        or receipt.get('status') == 'FAIL'
        or bool(receipt.get('pageErrors'))
        or bool(receipt.get('consoleErrors'))
    )
    return current['runtimeFailed']


def is_captured_pcm_metadata(path):
    candidate = Path(path)
    return candidate.parent.name == 'mic-pcm-capture' and candidate.suffix == '.json'


def create_memory_probe_receipt_writer(*, get_page, current, extra, runner, base_write):
    def write(path, receipt):
        # save_captured_mic_pcm runs inside expose_binding. Querying the page
        # here waits on the binding itself, so persist this sidecar directly.
        if is_captured_pcm_metadata(path):
            base_write(path, receipt)
            return
        page = get_page()
        runtime_failed = runtime_failure_seen(current, receipt)
        if page is not None and not page.is_closed() and not runtime_failed:
            snapshot = {'workers': [], 'probeErrors': list(current['errors'])}
            try:
                snapshot['main'] = page.evaluate('globalThis.__asrWasmCapacityProbe?.() ?? null')
                for worker in page.workers:
                    if runner.is_transcription_worker_url(worker.url):
                        try:
                            snapshot['workers'].append({'url': worker.url, 'probe': worker.evaluate('globalThis.__asrWasmCapacityProbe?.() ?? null')})
                        except Exception as error:
                            snapshot['probeErrors'].append({'worker': worker.url, 'error': str(error)})
                current['last'] = snapshot
            except Exception as error:
                current['errors'].append({'error': str(error)})
        if current['last'] is not None:
            diagnostic = copy.deepcopy(current['last'])
            if runtime_failed:
                diagnostic['snapshotNote'] = 'Live snapshot skipped after a runtime failure or error; this is the preceding snapshot and may predate that failure.'
            receipt['wasmLinearMemoryDiagnostics'] = diagnostic
        if extra.disable_whisper_cpu_arena:
            receipt['acceptanceScope'] = 'TRANSFORMED_CODE_EXPERIMENT_NOT_PACKAGE_ACCEPTANCE'
            receipt['packageAcceptance'] = False
            receipt['whisperCpuArenaDiagnostic'] = {
                'classification': 'TRANSFORMED_CODE_EXPERIMENT_NOT_PACKAGE_ACCEPTANCE',
                'transformations': copy.deepcopy(current['arenaTransformations']),
            }
        base_write(path, receipt)
    return write


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--mic-stress-repeats', type=int, default=1)
    parser.add_argument('--disable-whisper-cpu-arena', action='store_true')
    extra, remaining = parser.parse_known_args()
    if extra.mic_stress_repeats < 1:
        parser.error('--mic-stress-repeats must be positive')
    if extra.mic_stress_repeats > 1 and not any(arg.startswith('--mic-flow') for arg in remaining):
        parser.error('--mic-stress-repeats requires --mic-flow')
    if extra.disable_whisper_cpu_arena:
        def option_value(name):
            for index, value in enumerate(remaining):
                if value == name and index + 1 < len(remaining):
                    return remaining[index + 1]
                if value.startswith(name + '='):
                    return value.split('=', 1)[1]
            return None
        if option_value('--app') != 'realtime' or 'whisper' not in (option_value('--model-id') or '').lower():
            parser.error('--disable-whisper-cpu-arena requires --app realtime and a Whisper --model-id')
        if extra.mic_stress_repeats != 1:
            parser.error('--disable-whisper-cpu-arena is limited to one mic-flow cycle; compare separate baseline and diagnostic runs')
        if not any(arg.startswith('--mic-flow') for arg in remaining):
            parser.error('--disable-whisper-cpu-arena requires at least one --mic-flow')
    sys.argv = [sys.argv[0], *remaining]
    runner = load_runner()
    base_probe = runner.add_gpu_probe
    base_write = runner.write_receipt
    base_mic = runner.run_realtime_mic
    current = {'page': None, 'errors': [], 'last': None, 'arenaTransformations': [], 'runtimeFailed': False}
    repeated = []
    output_root = []

    def install(page):
        base_probe(page)
        current['page'] = page
        page.add_init_script(f'({MEMORY_PROBE})()')

        def worker_created(worker):
            if not runner.is_transcription_worker_url(worker.url):
                return
            try:
                worker.evaluate(MEMORY_PROBE)
            except Exception as error:
                current['errors'].append({'worker': worker.url, 'error': str(error)})
        page.on('worker', worker_created)

    runner.add_gpu_probe = install
    runner.write_receipt = create_memory_probe_receipt_writer(
        get_page=lambda: current['page'], current=current, extra=extra,
        runner=runner, base_write=base_write,
    )

    if extra.disable_whisper_cpu_arena:
        original_load_runner_main = runner.main

        def main_with_arena_route():
            from playwright.sync_api import sync_playwright as real_sync_playwright

            class PlaywrightProxy:
                def __init__(self, playwright):
                    self._playwright = playwright
                    self.chromium = ChromiumProxy(playwright.chromium)

                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    return self._playwright.__exit__(*args)

            class ChromiumProxy:
                def __init__(self, chromium):
                    self._chromium = chromium

                def __getattr__(self, name):
                    return getattr(self._chromium, name)

                def launch_persistent_context(self, *args, **kwargs):
                    context = self._chromium.launch_persistent_context(*args, **kwargs)
                    def transform_route(route):
                        request_url = route.request.url.split('?', 1)[0]
                        is_worker = runner.is_transcription_worker_url(request_url)
                        is_entry = bool(re.search(r'/realtime/assets/index-[^/]+\.js$', request_url))
                        if not (is_worker or is_entry):
                            route.continue_()
                            return
                        response = route.fetch()
                        source = response.text()
                        transformed, evidence = transform_whisper_cpu_arena(source)
                        evidence.update({'url': request_url, 'role': 'transcription-worker' if is_worker else 'entry-chunk'})
                        if is_worker and evidence['status'] != 'TRANSFORMED':
                            current['arenaTransformations'].append(evidence)
                            route.abort()
                            return
                        if is_entry and evidence['status'] == 'REJECTED' and evidence.get('matchCount', 0) > 1:
                            current['arenaTransformations'].append(evidence)
                            route.abort()
                            return
                        if evidence['status'] == 'TRANSFORMED':
                            current['arenaTransformations'].append(evidence)
                            route.fulfill(response=response, body=transformed)
                        else:
                            evidence['status'] = 'UNCHANGED_ENTRY_NO_MATCH'
                            current['arenaTransformations'].append(evidence)
                            route.fulfill(response=response)

                    context.route('**/realtime/assets/*.js', transform_route)
                    return context

            def patched_sync_playwright():
                manager = real_sync_playwright()

                class ManagerProxy:
                    def __enter__(self):
                        return PlaywrightProxy(manager.__enter__())

                    def __exit__(self, *args):
                        return manager.__exit__(*args)

                return ManagerProxy()

            runner.sync_playwright = patched_sync_playwright
            try:
                return original_load_runner_main()
            finally:
                runner.sync_playwright = real_sync_playwright

        runner.main = main_with_arena_route

    def microphone(page, args, out, receipt):
        output_root.append(out)
        primary = base_mic(page, args, out, receipt)
        expected = [flow for flow in runner.expected_flow_ids(args) if flow.startswith('mic-')]
        primary_status = runner.aggregate_status({item['flow']: item for item in primary}, expected)['status']
        for index in range(2, extra.mic_stress_repeats + 1):
            directory = out / f'repeat-{index}'
            runner.ensure_fresh_output_dir(directory)
            if not continue_stress_repeats(primary_status):
                summary = {
                    'status': 'FAIL', 'skipped': True, 'repeat': index,
                    'reason': 'The primary microphone cycle failed; the same model worker was not reused.',
                }
            else:
                try:
                    results = base_mic(page, args, directory, receipt)
                    summary = runner.aggregate_status({item['flow']: item for item in results}, expected)
                except Exception as error:
                    summary = {'status': 'FAIL', 'error': str(error)}
            summary['repeat'] = index
            write(directory / 'overall.json', summary)
            repeated.append(summary)
            primary_status = summary['status']
        return primary

    runner.run_realtime_mic = microphone
    code = runner.main()
    if extra.mic_stress_repeats > 1:
        summary = stress_status(code, extra.mic_stress_repeats, repeated)
        if extra.disable_whisper_cpu_arena:
            summary['acceptanceScope'] = 'TRANSFORMED_CODE_EXPERIMENT_NOT_PACKAGE_ACCEPTANCE'
            summary['packageAcceptance'] = False
            summary['whisperCpuArenaDiagnostic'] = {
                'classification': 'TRANSFORMED_CODE_EXPERIMENT_NOT_PACKAGE_ACCEPTANCE',
                'transformations': copy.deepcopy(current['arenaTransformations']),
            }
        if output_root:
            base_write(output_root[0] / 'memory-stress-overall.json', summary)
        return 0 if summary['status'] == 'PASS_ALL_STRESS_REPEATS' else 1
    return code


if __name__ == '__main__':
    raise SystemExit(main())
