"""Serial real-weight context audit. Fresh receipts, fixed full-oracle checks, no GPU concurrency."""
from pathlib import Path
import argparse,importlib.util,json,subprocess,sys
spec=importlib.util.spec_from_file_location('previous','tmp/real-e2e/run-modern-four-v18-matrix.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
models={'moonshine':{'id':'moonshine-ai/moonshine-streaming-tiny','dir':Path('tmp/real-e2e/remaining-models-20261024/native-moonshine-streaming-tiny'),'components':'split','stream':True},'gigaam-ctc':m.MODELS['gigaam-ctc'],'gigaam-rnnt':m.MODELS['gigaam-rnnt'],'x-asr':{**m.MODELS['x-asr'],'stream':True},'sensevoice':m.MODELS['sensevoice'],'qwen':{'id':'Qwen/Qwen3-ASR-0.6B-hf','dir':Path('tmp/real-e2e/qwen-loading-20261023/model-fp16'),'components':'split'}}
p=argparse.ArgumentParser();p.add_argument('--model',action='append',choices=list(models));p.add_argument('--app',action='append',choices=['realtime','playground']);p.add_argument('--vad-only',action='store_true');p.add_argument('--root',required=True,type=Path);args=p.parse_args();root=args.root;root.mkdir(parents=True,exist_ok=False)
subprocess.run([sys.executable,'tmp/real-e2e/capture-served-provenance.py','--version','v23','--output-root',str(root)],check=True)
results=[]
for key in args.model or models:
 model=models[key]
 for backend in ['webgpu','wasm']:
  for app in args.app or ['realtime','playground']:
   fixture=model.get('fixture',m.JFK);oracle=model.get('oracle',m.JFK_ORACLE);sha=model.get('sha',m.JFK_SHA)
   command=[sys.executable,'scripts/e2e/remaining-model-flows.py','--app',app,'--model-id',model['id'],'--source','local','--descriptor-sources','local','--model-dir',str(model['dir']),'--backend',backend,'--fixture',str(fixture),'--oracle',oracle,'--expected-fixture-sha256',sha,'--output-dir',str(root/key/backend/app),'--profile-dir',str(root/'profiles'/key/backend/app),'--load-timeout-ms','300000','--flow-timeout-ms','300000']
   if app=='realtime':command+=['--encoder-backend',backend,'--decoder-backend',backend if model['components']=='split' else 'wasm','--capture-mic-pcm',* ([] if args.vad_only else ['--mic-flow','manual']),'--mic-flow','speech-detect:vad-only:ten-vad','--mic-flow','speech-detect:vad-only:firered-vad']
   else:
    command+=['--record-mic','--capture-recorded-audio']
    if model.get('stream'):command+=['--run-streaming']
   logpath=root/f'{key}-{backend}-{app}.log'
   with logpath.open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
   item={'model':key,'backend':backend,'app':app,'exitCode':r.returncode,'command':command};results.append(item);(root/'runs.json').write_text(json.dumps(results,indent=2));print(json.dumps({k:v for k,v in item.items() if k!='command'}),flush=True)
raise SystemExit(0 if all(x['exitCode']==0 for x in results) else 1)
