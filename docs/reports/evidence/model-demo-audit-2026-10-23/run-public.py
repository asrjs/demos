import argparse, json, pathlib, time, hashlib
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('family');a=p.parse_args()
base='http://127.0.0.1:8999'; ext=base+'/__external_models__/'
specs={
'gigaam-ctc':dict(modelId='gigaam-multilingual-ctc',artifacts=dict(modelUrl=ext+'onnx/gigaam/multilingual-ctc/multilingual_ctc.onnx',tokenizerUrl=ext+'onnx/gigaam/multilingual-ctc/multilingual_vocab.txt')),
'sensevoice':dict(modelId='SenseVoiceSmall',artifacts=dict(modelUrl=ext+'onnx/sensevoice/small/model.onnx',tokenizerUrl=ext+'onnx/sensevoice/small/vocab.txt',cmvnUrl=ext+'onnx/sensevoice/small/am.mvn')),
'x-asr':dict(modelId='x-asr-zh-en-160ms',artifacts=dict(encoderUrl=ext+'x-asr/zh-en/chunk-160ms-model/encoder-160ms.onnx',decoderUrl=ext+'x-asr/zh-en/chunk-160ms-model/decoder-160ms.onnx',joinerUrl=ext+'x-asr/zh-en/chunk-160ms-model/joiner-160ms.onnx',tokenizerUrl=ext+'x-asr/zh-en/chunk-160ms-model/tokens.txt')),
'gigaam-rnnt':dict(modelId='gigaam-v3-e2e-rnnt',artifacts=dict(encoderUrl=ext+'onnx/gigaam/v3-e2e-rnnt/v3_e2e_rnnt_encoder.onnx',decoderUrl=ext+'onnx/gigaam/v3-e2e-rnnt/v3_e2e_rnnt_decoder.onnx',jointUrl=ext+'onnx/gigaam/v3-e2e-rnnt/v3_e2e_rnnt_joint.onnx',tokenizerUrl=ext+'onnx/gigaam/v3-e2e-rnnt/v3_e2e_rnnt_vocab.txt'))}
spec=specs[a.family];spec['family']=a.family;spec['fixture']=base+'/__fixtures__/jfk-short.wav';spec['expected']='And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.'
if a.family=='gigaam-rnnt':
 ref=json.loads(pathlib.Path('tools/data/results/gigaam/v3-e2e-rnnt-example-reference.json').read_text(encoding='utf-8'));spec['fixture']=ext+'gigaam/official-cache/example.wav';spec['expected']=ref['samples'][0]['text']
result={'family':a.family,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%S'),'spec':spec,'pageErrors':[],'consoleErrors':[]}
out=pathlib.Path('tmp/model-audit-20261023')/(a.family+'.json')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--disable-vulkan-surface','--no-sandbox'])
 page=browser.new_page();page.set_default_timeout(300000)
 page.on('pageerror',lambda e:result['pageErrors'].append(str(e)))
 page.on('console',lambda m:result['consoleErrors'].append(m.text) if m.type=='error' else None)
 try:
  page.goto(base+'/harness.html');page.wait_for_function('!!window.__ASR_HARNESS__',timeout=30000)
  result['run']=page.evaluate('''async spec=>{
 const out={stage:'imports'};let h;
 try{
 const {loadSpeechModel,PcmAudioBuffer}=await import('/dist/index.js');
 const {decodeWavToMonoPcm}=await import('/dist/audio/wav.js');
 const bytes=await (await fetch(spec.fixture)).arrayBuffer();
 out.fixtureSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const {pcm,sampleRate}=decodeWavToMonoPcm(bytes);out.durationSeconds=pcm.length/sampleRate;
 out.stage='load';let t=performance.now();
 h=await loadSpeechModel({family:spec.family,modelId:spec.modelId,backend:'webgpu',options:{source:{kind:'direct',cpuThreads:1,wasmPaths:'/node_modules/onnxruntime-web/dist/',artifacts:spec.artifacts}}});
 out.loadMs=performance.now()-t;out.supportsStreaming=h.supportsStreaming;
 out.stage='offline';t=performance.now();const r=await h.transcribeMonoPcm(pcm,sampleRate,{language:'en',detail:'text'});out.offlineMs=performance.now()-t;out.offlineText=r.text;
 const norm=s=>s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();out.exactNormalizedMatch=norm(r.text)===norm(spec.expected);
 if(h.supportsStreaming){out.stage='streaming';const st=await h.createStreamingTranscriber({});out.partials=[];t=performance.now();try{for(let offset=0;offset<pcm.length;offset+=2560){const p=await st.pushAudio(PcmAudioBuffer.fromMono(pcm.subarray(offset,offset+2560),sampleRate));if(p?.text)out.partials.push({atSeconds:Math.min(offset+2560,pcm.length)/sampleRate,text:p.text});}const f=await st.finalize();out.streamingText=f?.text;out.streamingExactNormalizedMatch=norm(f?.text||'')===norm(spec.expected);out.streamingMs=performance.now()-t;}finally{await st.dispose?.();}}
 out.stage='completed';out.status=out.exactNormalizedMatch?'FIXTURE_MATCH':'EXECUTED_WITH_MISMATCH';
 }catch(e){out.status='FAILED';out.error=String(e);out.stack=e?.stack;}finally{try{await h?.dispose();out.disposed=true;}catch(e){out.disposeError=String(e);}}
 return out;
}''',spec)
 except Exception as e:result['driverError']=str(e)
 finally:
  out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False));browser.close()
