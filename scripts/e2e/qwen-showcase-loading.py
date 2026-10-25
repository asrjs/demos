"""Real Qwen through the production Showcase UI. Exact fixture oracle; no model mocks."""
import argparse, hashlib, json, re, shutil, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
ORACLE='And so my fellow Americans ask not what your country can do for you ask what you can do for your country'
SHA='59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e'
def normalize(s): return ' '.join(re.sub(r'[^a-z0-9\s]',' ',s.lower()).split())
def verify(r):
 errors=[]
 if r.get('fixtureSha256')!=SHA: errors.append('Wrong fixture')
 if r.get('sourceOptions')!=['local']: errors.append('Unsupported Hub source offered')
 if r.get('load')!='EXECUTED': errors.append('Model load/warmup unverified')
 if r.get('requestedComponents')!=[r['backend'],r['backend']]: errors.append('Component selection mismatch')
 if normalize(r.get('transcript',''))!=normalize(ORACLE): errors.append('Full transcript mismatch')
 if r.get('pageErrors'): errors.append('Browser page errors')
 if r['backend']=='webgpu' and not r.get('fileGpuDispatches',0)>0: errors.append('Real GPU compute unverified')
 return errors

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--backend',choices=['wasm','webgpu'],required=True);parser.add_argument('--app',choices=['showcase','realtime'],default='showcase');a=parser.parse_args()
 out=ROOT/'tmp/real-e2e/qwen-loading-20261023';out.mkdir(parents=True,exist_ok=True)
 source=Path('N:/models/onnx/qwen3-asr-0.6b-official');folder=out/'model-fp16'
 files=['audio-encoder-dynamic.onnx','decoder-prefill-fp16.onnx','decoder-step-fp16.onnx','decoder-fp16.onnx.data','tokenizer/tokenizer.json']
 for f in files:
  target=folder/f;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists():shutil.copyfile(source/f,target)
 fixture=ROOT.parent/'speech-recognition/tests/fixtures/jfk2.en.wav'
 r={'app':a.app,'backend':a.backend,'status':'UNVERIFIED','fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'pageErrors':[],'console':[],'modelFiles':[{'path':f,'size':(source/f).stat().st_size} for f in files]}
 with sync_playwright() as p:
  b=p.chromium.launch(channel='chrome',headless=True,args=['--enable-unsafe-webgpu']);page=b.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(30000)
  page.add_init_script('''window.__gpuDispatches=0;if(typeof GPUComputePassEncoder!=='undefined'){for(const name of ['dispatchWorkgroups','dispatchWorkgroupsIndirect']){const original=GPUComputePassEncoder.prototype[name];if(original)GPUComputePassEncoder.prototype[name]=function(...args){window.__gpuDispatches++;return original.apply(this,args)}}}''')
  page.on('pageerror',lambda e:r['pageErrors'].append(str(e)));page.on('console',lambda m:r['console'].append({'type':m.type,'text':m.text}))
  try:
   page.goto('http://127.0.0.1:4190/'+a.app+'/');page.wait_for_selector('.asr-suite')
   page.locator('select').filter(has=page.locator('option[value="Qwen/Qwen3-ASR-0.6B-hf"]')).select_option('Qwen/Qwen3-ASR-0.6B-hf')
   r['sourceOptions']=page.locator('select').filter(has=page.locator('option[value="local"]')).locator('option').evaluate_all('(es)=>es.map(e=>e.value)')
   assert page.get_by_role('button',name='Load Model',exact=False).is_disabled()
   page.locator('input[webkitdirectory]').set_input_files(str(folder))
   page.locator('select').filter(has=page.locator('option[value="webgpu-hybrid"]')).select_option('wasm' if a.backend=='wasm' else 'webgpu-hybrid')
   components=page.locator('select').filter(has=page.locator('option[value="webgpu"]'))
   components.nth(0).select_option(a.backend);components.nth(1).select_option(a.backend)
   r['requestedComponents']=components.evaluate_all('(es)=>es.map(e=>e.value)')
   page.locator('#profiling').uncheck();r['beforeLoad']=page.locator('body').inner_text();start=time.monotonic()
   page.get_by_role('button',name='Load Model',exact=False).click()
   page.wait_for_function('document.body.innerText.includes("Model ready") || document.body.innerText.includes("Failed:") || document.body.innerText.includes("Warm-up failed") || document.body.innerText.includes("Verification failed")',timeout=240000)
   r['loadSeconds']=time.monotonic()-start;r['afterLoad']=page.locator('body').inner_text()
   if 'Model ready' not in r['afterLoad']:raise RuntimeError('Real load/warmup failed')
   r['load']='EXECUTED';r['warmupGpuDispatches']=page.evaluate('window.__gpuDispatches');page.evaluate('window.__gpuDispatches=0');start=time.monotonic()
   page.locator('input[type=file][accept="audio/*"]').set_input_files(str(fixture))
   page.wait_for_function('document.querySelector("'+('p.asr-transcript-text' if a.app=='showcase' else '.transcript-body')+'")?.textContent.includes("country") || document.body.innerText.includes("Transcription failed")',timeout=180000)
   r['fileGpuDispatches']=page.evaluate('window.__gpuDispatches');r['transcriptionSeconds']=time.monotonic()-start;r['transcript']=page.locator('p.asr-transcript-text' if a.app=='showcase' else '.transcript-body').inner_text()
   r['verificationErrors']=verify(r);r['status']='PASS_SHOWCASE_FIXTURE' if not r['verificationErrors'] else 'FAIL'
  except Exception as e:r.update(status='FAIL',error=str(e),body=page.locator('body').inner_text())
  finally:
   page.screenshot(path=str(out/f'{a.app}-{a.backend}.png'),full_page=True);r['browserVersion']=b.version;b.close();(out/f'{a.app}-{a.backend}.json').write_text(json.dumps(r,indent=2),encoding='utf8')
 print(json.dumps({k:v for k,v in r.items() if k not in ['console','body','beforeLoad','afterLoad','modelFiles']}),flush=True)
 return 0 if r['status']=='PASS_SHOWCASE_FIXTURE' else 1
if __name__=='__main__':sys.exit(main())
