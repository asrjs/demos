import hashlib, json, pathlib, time, wave
import numpy as np
from scipy.signal import correlate, correlation_lags
import torch, gigaam
ROOT = pathlib.Path(r'N:\github\asrjs\demos\tmp\real-e2e\context-v19-gigaam-ctc')
FIXTURE = pathlib.Path(r'N:\github\asrjs\speech-recognition\tests\fixtures\jfk2.en.wav')
CAPTURE = ROOT / 'wasm' / 'mic-pcm-capture' / 'mic-speech-detect-vad-only-firered-vad-request-11.f32le'
OUT = ROOT / 'native-cpu-leading-context-control-v19-parent.json'
assert not OUT.exists()
def sha(b): return hashlib.sha256(b).hexdigest()
def file_sha(p): return sha(p.read_bytes())
with wave.open(str(FIXTURE), 'rb') as w:
    assert w.getnchannels() == 1 and w.getframerate() == 16000 and w.getsampwidth() == 2
    source = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768
capture = np.fromfile(CAPTURE, dtype='<f4')
# Find where the recorded FireRed context occurs in the known source fixture.
s, c = source[::8], capture[::8]
cc = correlate(s - s.mean(), c - c.mean(), mode='full', method='fft')
lags = correlation_lags(len(s), len(c), mode='full')
i = int(np.argmax(cc)); source_start = int(lags[i]) * 8
aligned = source[source_start:source_start + len(capture)]
scale = float(np.dot(aligned, capture) / np.dot(aligned, aligned))
correlation = float(np.corrcoef(aligned, capture)[0, 1])
if source_start < 4800 or len(aligned) != len(capture) or correlation < 0.99:
    raise RuntimeError(f'Capture alignment did not meet identity gate: start={source_start}, corr={correlation}')
leading = source[source_start - 4800:source_start]
trailing = source[source_start + len(capture):]
torch.set_num_threads(4)
model = gigaam.load_model('multilingual_ctc', fp16_encoder=False, use_flash=False, device='cpu', download_root=r'N:\models\gigaam\official-cache')
model.eval()
def infer(pcm):
    pcm = np.asarray(pcm, dtype=np.float32)
    with torch.inference_mode():
        wav = torch.from_numpy(pcm.copy()).unsqueeze(0)
        length = torch.tensor([len(pcm)], dtype=torch.long)
        encoded, encoded_len = model(wav, length)
        text, token_ids, token_frames = model.decoding.decode(model.head, encoded, encoded_len)[0]
    return {'text': str(text), 'tokenIds': [int(v) for v in token_ids], 'encodedShape': list(encoded.shape), 'encodedLengths': [int(v) for v in encoded_len.tolist()]}
def audio_meta(pcm):
    b = np.asarray(pcm, dtype='<f4').tobytes()
    return {'frames': len(pcm), 'durationSeconds': len(pcm) / 16000, 'pcmF32leSha256': sha(b), 'rms': float(np.sqrt(np.mean(np.asarray(pcm, dtype=np.float64)**2)))}
cases = {
    'captured_baseline': capture,
    'prepend_300ms_source_context': np.concatenate([leading, capture]),
    'append_available_source_tail': np.concatenate([capture, trailing]),
    'prepend_300ms_and_append_available_tail': np.concatenate([leading, capture, trailing]),
    'fixture_full': source,
}
started = time.perf_counter()
results = {name: {**audio_meta(pcm), 'native': infer(pcm)} for name, pcm in cases.items()}
receipt = {
 'schemaVersion': 1,
 'status': 'OFFICIAL_CPU_CONTEXT_BOUNDARY_CONTROL_COMPLETED_NOT_RUNTIME_PASS',
 'scope': 'Local official GigaAM multilingual_ctc PyTorch CPU only. This is a controlled native inference boundary experiment, not browser/WebGPU/WASM acceptance.',
 'source': {'officialRepo': r'N:\github\salute-developers\GigaAM', 'checkpoint': r'N:\models\gigaam\official-cache\multilingual_ctc.ckpt', 'checkpointSha256': file_sha(pathlib.Path(r'N:\models\gigaam\official-cache\multilingual_ctc.ckpt')), 'device': 'cpu', 'torch': torch.__version__, 'python': __import__('sys').version, 'localCheckpointOnly': True},
 'fixture': {'path': str(FIXTURE), 'wavSha256': file_sha(FIXTURE), 'frames': len(source), 'sampleRate': 16000},
 'capture': {'path': str(CAPTURE), **audio_meta(capture), 'sourceAlignedStartFrame': source_start, 'sourceAlignedEndFrame': source_start + len(capture), 'availableTrailingSourceFrames': len(trailing), 'captureToFixtureScale': scale, 'pearsonCorrelation': correlation},
 'controls': {'prependFrames': len(leading), 'prependSha256': sha(leading.astype('<f4').tobytes()), 'prependSourceRange': [source_start - len(leading), source_start], 'appendFrames': len(trailing), 'appendSha256': sha(trailing.astype('<f4').tobytes()), 'appendSourceRange': [source_start + len(capture), len(source)]},
 'results': results,
 'elapsedSeconds': round(time.perf_counter() - started, 3),
}
OUT.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({'status': receipt['status'], 'output': str(OUT), 'capture': receipt['capture'], 'controls': receipt['controls'], 'results': {k: {'frames': v['frames'], 'sha256': v['pcmF32leSha256'], 'text': v['native']['text']} for k,v in results.items()}, 'elapsedSeconds': receipt['elapsedSeconds']}, ensure_ascii=False))
