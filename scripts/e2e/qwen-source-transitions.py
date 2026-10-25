import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).resolve().parents[2]/'tmp/real-e2e/qwen-loading-20261023';r=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True)
 for app in ['showcase','realtime','playground','benchmark']:
  print(app,flush=True);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:4190/'+app+'/');page.wait_for_selector('.asr-suite')
  models=page.locator('select').filter(has=page.locator('option[value="Qwen/Qwen3-ASR-0.6B-hf"]'));models.select_option('Qwen/Qwen3-ASR-0.6B-hf');page.wait_for_timeout(200)
  inputs=page.locator('input[webkitdirectory]');inputs.first.set_input_files(str((out/'model-fp16').resolve()));page.wait_for_timeout(250)
  before=page.locator('body').inner_text()
  for model in ['UsefulSensors/moonshine-tiny','parakeet-tdt-0.6b-v2','Qwen/Qwen3-ASR-0.6B-hf']:
   print('switch',model,'errors',errors,flush=True);models.select_option(model);page.wait_for_timeout(200)

  if app!='playground':
   options=page.locator('select').filter(has=page.locator('option[value="fp16"]')).locator('option').evaluate_all('(es)=>es.map(e=>e.value)')
   assert not options or options==['fp16'],(app,options)
  r.append({'app':app,'pageErrors':errors,'selected':models.input_value(),'folderDetected': 'fp16' in before,'body':page.locator('body').inner_text()});page.close()
 b.close()
(out/'ui-transitions.json').write_text(json.dumps(r,indent=2),encoding='utf8');print(json.dumps([{k:v for k,v in x.items() if k!='body'} for x in r]));assert all(not x['pageErrors'] for x in r)
