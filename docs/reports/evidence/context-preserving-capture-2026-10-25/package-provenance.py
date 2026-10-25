from pathlib import Path
import json,hashlib,shutil,tarfile,argparse
p=argparse.ArgumentParser();p.add_argument('version');a=p.parse_args();assert a.version.startswith('v') and a.version[1:].isdigit()
lib=Path('../speech-recognition');vendor=Path('vendor');name=f'asrjs-speech-recognition-0.2.0-model-audit-20261024-{a.version}.tgz';out=vendor/name
assert not out.exists();shutil.copyfile(lib/'tmp/asrjs-speech-recognition-0.2.0.tgz',out)
data=json.loads((lib/f'tmp/context-{a.version}-pack.json').read_text(encoding='utf-8-sig'));data=data.get('@asrjs/speech-recognition',data) if isinstance(data,dict) else data[0]
h=lambda b:hashlib.sha256(b).hexdigest()
source={str(f.relative_to(lib)).replace('\\','/'):h(f.read_bytes()) for f in (lib/'src').rglob('*') if f.is_file()}
with tarfile.open(out) as t:dist={m.name.removeprefix('package/'):h(t.extractfile(m).read()) for m in t.getmembers() if m.isfile() and m.name.startswith('package/dist/')}
for path,sha in dist.items():assert h((lib/path).read_bytes())==sha
receipt={'baseCommit':'e534fb517dcd15a52ac8b52bff85551df89d3673','package':name,'packageSha256':h(out.read_bytes()),'integrity':data['integrity'],'sourceFilesSha256':source,'distFilesSha256':dist}
(vendor/(name.removesuffix('.tgz')+'.provenance.json')).write_text(json.dumps(receipt,indent=2));print(json.dumps({'sha256':receipt['packageSha256'],'source':len(source),'dist':len(dist)}))
