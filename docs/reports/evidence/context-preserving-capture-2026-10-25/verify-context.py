"""Audit completed runner receipts and actual contextual input bytes, independently of PASS labels."""
import argparse,hashlib,json,unicodedata
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('root',type=Path);a=p.parse_args();root=a.root
runs=json.loads((root/'runs.json').read_text());checks=[]
def norm(s):return ' '.join(''.join(c for c in unicodedata.normalize('NFC',s).casefold() if c.isalnum() or c.isspace()).split())
for run in runs:
 cmd=run['command'];arg=lambda name:cmd[cmd.index(name)+1] if name in cmd else None
 out=Path(arg('--output-dir'));backend=arg('--backend');oracle=arg('--oracle');fixture=arg('--fixture');fixture_sha=arg('--expected-fixture-sha256')
 assert hashlib.sha256(Path(fixture).read_bytes()).hexdigest()==fixture_sha
 flows=['file'];flows+=['mic-'+cmd[i+1].replace(':','-') if ':' in cmd[i+1] else 'mic-manual-manual-none' for i,x in enumerate(cmd) if x=='--mic-flow']
 if '--record-mic' in cmd:flows.append('playground-record-then-transcribe')
 if '--run-streaming' in cmd:flows.append('streaming')
 for flow in flows:
  path=out/(flow+'.json');d=json.loads(path.read_text());assert d['status'].startswith('PASS') or d['status']=='FAIL',(path,d['status'])
  assert d['oracle']==oracle and d['fixtureSha256']==d['expectedFixtureSha256']==fixture_sha and d['requestedBackend']==backend
  exact=norm(d.get('transcript',''))==norm(oracle)
  if d['status'].startswith('PASS'):
   assert exact and not d.get('verificationErrors') and not d.get('consoleErrors') and not d.get('pageErrors'),path
   assert d['loadStatus']==d['runtimeStatus']=='EXECUTED',path
   components=d.get('requestedComponentBackends',[])
   if components:assert d['actualComponentBackends']==components,path
   assert d['actualBackend']==backend or (backend=='webgpu' and d['actualBackend']=='webgpu-hybrid' and 'webgpu' in components),path
   dispatch='mic' if flow.startswith('mic-') else 'stream' if flow=='streaming' else 'file'
   assert d['actualGpuDispatches'][dispatch]>0 if backend=='webgpu' else all(v==0 for v in d['actualGpuDispatches'].values()),path
   if flow.startswith('mic-'):assert len(d['enqueued'])==len(d['completed'])>0 and not d.get('failed'),path
   if flow=='streaming':assert d['status']=='PASS_NATIVE_STREAMING',path
  bycontext={};captures=[]
  for item in d.get('capturedMicPcm',[]):
   content=Path(item['pcmPath']).read_bytes();assert len(content)==item['frames']*4 and hashlib.sha256(content).hexdigest()==item['pcmSha256'];assert item['responseType']=='SUCCESS' and item['captureError'] is None
   ctx=item.get('queue',{}).get('context')
   if ctx:
    assert ctx['endFrame']-ctx['startFrame']==item['frames'] and ctx['sampleRate']==item['sampleRate']
    if ctx['id'] in bycontext:
     previous=bycontext[ctx['id']];assert ctx['revision']==previous[0]['revision']+1 and ctx['startFrame']==previous[0]['startFrame'];assert content[:len(previous[1])]==previous[1]
    bycontext[ctx['id']]=(ctx,content)
   captures.append({'path':item['pcmPath'],'sha256':item['pcmSha256'],'frames':item['frames'],'context':ctx})
  checks.append({'path':str(path.resolve()),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'status':d['status'],'exact':exact,'actualBackend':d['actualBackend'],'transcript':d.get('transcript'),'captures':captures})
result={'scope':'Parent SHA, PCM prefix continuity, full transcript and requested backend audit; physical microphone unverified','accepted':sum(c['status'].startswith('PASS') for c in checks),'total':len(checks),'checks':checks}
out=root/'parent-context-verification.json';assert not out.exists();out.write_text(json.dumps(result,indent=2,ensure_ascii=False));print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
