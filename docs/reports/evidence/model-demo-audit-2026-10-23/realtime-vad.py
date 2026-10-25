import json,pathlib,time,wave
from playwright.sync_api import sync_playwright
out=pathlib.Path('tmp/real-e2e/audit-20261023');fixture=out/'jfk-with-silence.wav'
with wave.open('../speech-recognition/tests/fixtures/jfk2.en.wav','rb') as r:
 params=r.getparams();audio=r.readframes(r.getnframes())
with wave.open(str(fixture),'wb') as w:
 w.setparams(params);silence=b'\0'*(params.framerate*params.nchannels*params.sampwidth);w.writeframes(silence+audio+silence*5)
receipt={'scope':'Realtime demo, controlled microphone, speech-detect, rough-only gate, local real v3 model','physicalMicrophone':'UNVERIFIED','events':[],'pageErrors':[],'startedAt':time.strftime('%Y-%m-%dT%H:%M:%S')}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',f'--use-file-for-fake-audio-capture={fixture.resolve()}'])
 c=b.new_context(permissions=['microphone']);pg=c.new_page();pg.set_default_timeout(45000)
 pg.add_init_script('''window.__asrMessages=[];const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(m,t){if(m?.type==='TRANSCRIBE_MONO_PCM')window.__asrMessages.push({type:m.type,samples:m.payload?.pcm?.length,sampleRate:m.payload?.sampleRate,at:performance.now()});return post.call(this,m,t)};''')
 pg.on('console',lambda m:receipt['events'].append({'type':m.type,'text':m.text}) if len(receipt['events'])<500 else None);pg.on('pageerror',lambda e:receipt['pageErrors'].append(str(e)))
 try:
  pg.goto('http://127.0.0.1:4190/realtime/');pg.wait_for_selector('.asr-suite')
  pg.locator('select').nth(2).select_option('parakeet-tdt-0.6b-v3');pg.locator('select').nth(1).select_option('local');pg.locator('input[webkitdirectory]').set_input_files(r'N:\models\onnx\nemo\parakeet-tdt-0.6b-v3-onnx');pg.locator('#profiling').uncheck()
  qs=pg.locator('select').filter(has=pg.locator('option[value=fp32]'));qs.nth(0).select_option('fp16');qs.nth(1).select_option('fp32');pg.get_by_role('button',name='Load Model',exact=False).click()
  pg.wait_for_function('document.body.innerText.includes("Model ready")',timeout=150000);receipt['load']='EXECUTED'
  pg.locator('select').filter(has=pg.locator('option[value="speech-detect"]')).select_option('speech-detect')
  pg.locator('select').filter(has=pg.locator('option[value="rough-only"]')).select_option('rough-only')
  receipt['beforeCapture']=pg.locator('body').inner_text();pg.get_by_role('button',name='Start Mic',exact=True).click();pg.get_by_role('button',name='Stop Mic',exact=True).wait_for();pg.wait_for_timeout(16000)
  receipt['beforeStop']=pg.locator('body').inner_text();receipt['messagesBeforeStop']=pg.evaluate('window.__asrMessages');pg.get_by_role('button',name='Stop Mic',exact=True).click();pg.wait_for_timeout(18000)
  receipt['afterStop']=pg.locator('body').inner_text();receipt['workerMessages']=pg.evaluate('window.__asrMessages');receipt['status']='OBSERVED';pg.screenshot(path=str(out/'realtime-vad-controlled.png'),full_page=True)
 except Exception as e:receipt['status']='FAILED';receipt['error']=str(e);receipt['body']=pg.locator('body').inner_text()
 finally:
  (out/'realtime-vad-controlled.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in receipt.items() if k not in ['events','beforeCapture','beforeStop','afterStop','body']}));b.close()
