"""Real-model TEN-VAD regression. Controlled capture only; never certifies a physical mic."""
from __future__ import annotations
import argparse, hashlib, json, sys, time, unicodedata, wave
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ORACLE = 'And so my fellow Americans ask not what your country can do for you ask what you can do for your country'
JFK_SHA256 = '59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e'

def normalize(text):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFC', text).lower() if c.isalnum() or c.isspace()).split())

def verify(receipt):
    errors = []
    if receipt.get('fixtureSha256') != JFK_SHA256: errors.append('Wrong oracle fixture')
    if receipt.get('load') != 'EXECUTED': errors.append('Real model load unverified')
    if receipt.get('pageErrors'): errors.append('Browser page errors')
    if normalize(receipt.get('transcript', '')) != normalize(ORACLE): errors.append('Full transcript differs from oracle')
    decisions = receipt.get('decisions', [])
    neural = receipt.get('gate') == 'vad-only'
    if neural and not any('TEN-VAD ready' in d['message'] and d.get('meta', {}).get('state') == 'ready' for d in decisions): errors.append('TEN-VAD ready state missing')
    if neural and not any(d.get('meta', {}).get('gateMode') == 'vad-only' for d in decisions): errors.append('Effective neural gate unverified')
    if any('degraded' in d['message'].lower() for d in decisions): errors.append('VAD degraded')
    last_end = 0
    ready = []
    for d in decisions:
        meta = d.get('meta', {})
        if d['message'].endswith('Neural VAD speech start') and meta.get('startFrame', -1) < last_end:
            errors.append('Neural onset replayed finalized audio')
        if 'Segment rejected' in d['message']: errors.append('Unexpected rejected fixture segment')
        if 'Segment ready:' in d['message']:
            end = meta.get('logicalEndFrame')
            if not isinstance(end, (int, float)) or end <= last_end: errors.append('Finalized timeline did not advance')
            else: last_end = end
            ready.append(meta)
    if not ready: errors.append('No finalized real audio segments')
    jobs = receipt.get('jobs', [])
    completed = receipt.get('completedJobs', 0)
    if len(jobs) != len(ready) or completed != len(ready): errors.append('Incomplete or duplicated transcription queue')
    keys = [(d.get('startFrame'), d.get('endFrame')) for d in ready]
    if len(set(keys)) != len(keys): errors.append('Duplicate PCM bounds')
    return errors

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', required=True)
    parser.add_argument('--gate', choices=['vad-only', 'rough-only'], default='vad-only')
    parser.add_argument('--base-url', default='http://127.0.0.1:4190/realtime/')
    parser.add_argument('--model-dir', type=Path, default=Path('N:/models/onnx/nemo/parakeet-tdt-0.6b-v3-onnx'))
    parser.add_argument('--output-dir', type=Path, default=ROOT/'tmp/real-e2e/ten-vad-regression-20261023')
    args = parser.parse_args()
    out = args.output_dir.resolve(); out.mkdir(parents=True, exist_ok=True)
    original = ROOT.parent/'speech-recognition/tests/fixtures/jfk2.en.wav'
    fixture = out/'jfk-with-silence.wav'
    with wave.open(str(original), 'rb') as audio:
        params = audio.getparams(); pcm = audio.readframes(audio.getnframes())
    with wave.open(str(fixture), 'wb') as audio:
        audio.setparams(params); silence = bytes(params.framerate*params.nchannels*params.sampwidth)
        audio.writeframes(silence + pcm + silence*5)
    receipt = {'phase': args.phase, 'gate': args.gate, 'status': 'UNVERIFIED', 'physicalMicrophone': 'UNVERIFIED', 'fixtureSha256': hashlib.sha256(original.read_bytes()).hexdigest(), 'captureFixtureSha256': hashlib.sha256(fixture.read_bytes()).hexdigest(), 'pageErrors': [], 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'modelDir': str(args.model_dir)}
    capture_script = '''window.__vadEvidence={decisions:[],jobs:[],completedJobs:0};
    const debug=console.debug; console.debug=function(message,meta){if(typeof message==='string'&&message.startsWith('[StreamingSpeechDetector]'))window.__vadEvidence.decisions.push({message,meta:JSON.parse(JSON.stringify(meta||{}))});if(message==='[MicQueue] enqueue')window.__vadEvidence.jobs.push(JSON.parse(JSON.stringify(meta)));if(message==='[MicQueue] complete')window.__vadEvidence.completedJobs++;return debug.apply(this,arguments)};
    const log=console.log; console.log=function(message,meta){if(message==='[MicQueue] enqueue')window.__vadEvidence.jobs.push(JSON.parse(JSON.stringify(meta)));if(message==='[MicQueue] complete')window.__vadEvidence.completedJobs++;return log.apply(this,arguments)};'''
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True, args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',f'--use-file-for-fake-audio-capture={fixture}'])
        context = browser.new_context(permissions=['microphone']); page = context.new_page(); page.set_default_timeout(45000)
        page.add_init_script(capture_script)
        page.on('pageerror', lambda e: receipt['pageErrors'].append(str(e)))
        try:
            page.goto(args.base_url); page.wait_for_selector('.asr-suite')
            page.locator('select').filter(has=page.locator('option[value="parakeet-tdt-0.6b-v3"]')).select_option('parakeet-tdt-0.6b-v3')
            page.locator('select').filter(has=page.locator('option[value="local"]')).select_option('local')
            page.locator('input[webkitdirectory]').set_input_files(str(args.model_dir)); page.locator('#profiling').uncheck()
            quantizers = page.locator('select').filter(has=page.locator('option[value="fp32"]'))
            quantizers.nth(0).select_option('fp16'); quantizers.nth(1).select_option('fp32')
            page.get_by_role('button', name='Load Model', exact=False).click()
            page.wait_for_function('document.body.innerText.includes("Model ready")', timeout=150000); receipt['load']='EXECUTED'
            page.locator('select').filter(has=page.locator('option[value="speech-detect"]')).select_option('speech-detect')
            page.locator('select').filter(has=page.locator('option[value="rough-only"]')).select_option(args.gate)
            page.locator('select').filter(has=page.locator('option[value="ten-vad"]')).select_option('ten-vad')
            receipt['beforeCaptureBody'] = page.locator('body').inner_text()
            page.get_by_role('button', name='Start Mic', exact=True).click(); page.get_by_role('button',name='Stop Mic',exact=True).wait_for()
            page.wait_for_timeout(16000)
            receipt['beforeStopEvidence'] = page.evaluate('window.__vadEvidence')
            page.get_by_role('button',name='Stop Mic',exact=True).click()
            page.wait_for_timeout(2000)
            page.wait_for_function('window.__vadEvidence.jobs.length>0 && window.__vadEvidence.jobs.length===window.__vadEvidence.completedJobs', timeout=60000)
            receipt.update(page.evaluate('window.__vadEvidence'))
            receipt['transcript'] = page.locator('.transcript-body').inner_text()
            receipt['afterStopBody'] = page.locator('body').inner_text()
            page.screenshot(path=str(out/f'{args.phase}-{args.gate}.png'), full_page=True)
            receipt['verificationErrors'] = verify(receipt)
            receipt['status'] = 'FAIL' if receipt['verificationErrors'] else 'PASS_CONTROLLED_FIXTURE'
        except Exception as error:
            receipt.update(page.evaluate('window.__vadEvidence || {}'))
            receipt['status']='FAIL'; receipt['error']=str(error); receipt['body']=page.locator('body').inner_text()
        finally:
            receipt['browserVersion'] = browser.version
            target = out/f'{args.phase}-{args.gate}.json'; target.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf8')
            print(json.dumps({'receipt':str(target),'status':receipt['status'],'errors':receipt.get('verificationErrors',receipt.get('error')),'jobs':len(receipt.get('jobs',[])),'transcript':receipt.get('transcript')},ensure_ascii=False),flush=True)
            browser.close()
    return 0 if receipt['status']=='PASS_CONTROLLED_FIXTURE' else 1

if __name__=='__main__': sys.exit(main())
