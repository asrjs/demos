import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('qwen',Path(__file__).with_name('qwen-showcase-loading.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
class EvidenceTests(unittest.TestCase):
 def good(self):return {'backend':'wasm','requestedComponents':['wasm','wasm'],'fixtureSha256':q.SHA,'sourceOptions':['local'],'load':'EXECUTED','transcript':q.ORACLE,'pageErrors':[]}
 def test_full_fixture(self):self.assertEqual(q.verify(self.good()),[])
 def test_rejects_partial_or_repeated_text(self):
  for text in ['ask not what your country',q.ORACLE+' '+q.ORACLE]:
   r=self.good();r['transcript']=text;self.assertTrue(q.verify(r))
 def test_gpu_requires_compute_evidence(self):
  r=self.good();r.update(backend='webgpu',requestedComponents=['webgpu','webgpu'],fileGpuDispatches=0);self.assertTrue(q.verify(r));r['fileGpuDispatches']=1;self.assertEqual(q.verify(r),[])
 def test_rejects_incomplete_evidence(self):
  for field,value in [('fixtureSha256','wrong'),('load','UNVERIFIED'),('sourceOptions',['huggingface','local']),('pageErrors',['failure']),('requestedComponents',['webgpu','wasm'])]:
   r=self.good();r[field]=value;self.assertTrue(q.verify(r),field)
if __name__=='__main__':unittest.main()
