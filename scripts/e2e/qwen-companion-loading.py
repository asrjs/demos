import argparse,importlib.util,json,shutil,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('q',Path(__file__).with_name('qwen-showcase-loading.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
p=argparse.ArgumentParser();p.add_argument('--app',choices=['playground','benchmark'],required=True);a=p.parse_args()
out=q.ROOT/'tmp/real-e2e/qwen-loading-20261023';fixture=q.ROOT.parent/'speech-recognition/tests/fixtures/jfk2.en.wav';audio=out/'audio';audio.mkdir(exist_ok=True);shutil.copyfile(fixture,audio/fixture.name)
r={'fixtureSha256':q.hashlib.sha256(fixture.read_bytes()).hexdigest(),'app':a.app,'status':'UNVERIFIED','pageErrors':[],'console':[]}
with sync_playwright() as pw:
 b=pw.chromium.launch(channel='chrome',headless=True,args=['--enable-unsafe-webgpu']);page=b.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(30000)
 page.add_init_script("window.__gpuDispatches=0;if(typeof GPUComputePassEncoder!=='undefined'){const f=GPUComputePassEncoder.prototype.dispatchWorkgroups;GPUComputePassEncoder.prototype.dispatchWorkgroups=function(...args){window.__gpuDispatches++;return f.apply(this,args)}}")
 page.on('pageerror',lambda e:r['pageErrors'].append(str(e)));page.on('console',lambda m:r['console'].append(m.text))
 try:
  page.goto('http://127.0.0.1:4190/'+a.app+'/');page.wait_for_selector('.asr-suite')
  page.locator('select').filter(has=page.locator('option[value="Qwen/Qwen3-ASR-0.6B-hf"]')).select_option('Qwen/Qwen3-ASR-0.6B-hf')
  page.locator('input[webkitdirectory]').first.set_input_files(str(out/'model-fp16'))
  page.locator('select').filter(has=page.locator('option[value="webgpu-hybrid"]')).select_option('webgpu')
  if a.app=='playground':
   for select in page.locator('select').filter(has=page.locator('option[value="webgpu"]')).all():select.select_option('webgpu')
  start=time.monotonic();page.get_by_role('button',name='Load Model',exact=True).click()
  page.wait_for_function('document.body.innerText.includes("Model Loaded") || document.body.innerText.includes("Reload Model") || document.body.innerText.includes("Failed:")',timeout=240000);assert page.get_by_role('button',name='Model Loaded' if a.app=='playground' else 'Reload Model ✓',exact=True).count()==1;r['loadSeconds']=time.monotonic()-start;r['load']='EXECUTED'
  page.evaluate('window.__gpuDispatches=0');start=time.monotonic()
  if a.app=='playground':
   page.locator('input[accept="audio/*"]').set_input_files(str(fixture));page.get_by_role('button',name='Transcribe',exact=True).click();page.wait_for_function('document.querySelector("p.asr-transcript-text")?.textContent.includes("country")',timeout=180000);r['transcript']=page.locator('p.asr-transcript-text').inner_text()
  else:
   page.get_by_role('button',name='Local Duration Catalog',exact=True).click();page.locator('input[webkitdirectory]').nth(1).set_input_files(str(audio));page.get_by_label('Target Duration Strategy',exact=False).select_option('custom');page.get_by_label('Target Durations (s)',exact=True).fill('11');page.get_by_label('Samples / Target',exact=True).fill('1');page.get_by_label('Repeats',exact=True).fill('1');page.get_by_label('Warmups',exact=False).fill('0');page.wait_for_function('document.body.innerText.includes("Planned files: 1")',timeout=30000);page.get_by_role('button',name='▶ Start Benchmark',exact=True).click();page.wait_for_function('document.body.innerText.includes("Completed 1 benchmark runs.")',timeout=180000)
   with page.expect_download() as download:page.get_by_role('button',name='Export JSON',exact=True).click()
   target=out/'benchmark-export.json';download.value.save_as(str(target));export=json.loads(target.read_text());assert len(export['runs'])==1 and not export['runs'][0]['error'];r['transcript']=export['runs'][0]['transcription']
  r['transcriptionSeconds']=time.monotonic()-start;r['fileGpuDispatches']=page.evaluate('window.__gpuDispatches');assert r['fixtureSha256']==q.SHA;assert q.normalize(r['transcript'])==q.normalize(q.ORACLE);assert not r['pageErrors'];assert r['fileGpuDispatches']>0;r['status']='PASS_UI_FIXTURE'
 except Exception as e:r.update(status='FAIL',error=str(e),body=page.locator('body').inner_text())
 finally:
  page.screenshot(path=str(out/f'{a.app}-webgpu.png'),full_page=True);b.close();(out/f'{a.app}-webgpu.json').write_text(json.dumps(r,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in r.items() if k not in ['console','body']}),flush=True);sys.exit(0 if r['status']=='PASS_UI_FIXTURE' else 1)
