import importlib.util, pathlib, unittest
spec = importlib.util.spec_from_file_location('ten_vad_regression', pathlib.Path(__file__).with_name('realtime-ten-vad-regression.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class EvidenceVerificationTests(unittest.TestCase):
    def fixture(self):
        return {'fixtureSha256': module.JFK_SHA256, 'load':'EXECUTED','gate':'vad-only','pageErrors':[], 'transcript':module.ORACLE,'jobs':[{}], 'completedJobs':1,'decisions':[
            {'message':'TEN-VAD ready','meta':{'state':'ready'}},
            {'message':'Neural VAD speech start','meta':{'gateMode':'vad-only','startFrame':0}},
            {'message':'Segment ready: silence','meta':{'startFrame':0,'endFrame':176000,'logicalEndFrame':176000}},
        ]}
    def test_accepts_complete_fixture_evidence(self):
        self.assertEqual(module.verify(self.fixture()), [])
    def test_rejects_replayed_timeline_even_when_joined_text_looks_correct(self):
        receipt = self.fixture(); receipt['decisions'].append({'message':'Neural VAD speech start','meta':{'gateMode':'vad-only','startFrame':0}})
        self.assertIn('Neural onset replayed finalized audio',module.verify(receipt))
    def test_rejects_missing_or_partial_evidence(self):
        for key,value in [('transcript','ask not what your country'),('transcript',module.ORACLE+' '+module.ORACLE),('completedJobs',0),('load','UNVERIFIED'),('fixtureSha256','wrong'),('pageErrors',['failure'])]:
            with self.subTest(key=key,value=value):
                receipt=self.fixture();receipt[key]=value;self.assertTrue(module.verify(receipt))
    def test_rejects_rough_fallback_for_neural_test(self):
        receipt=self.fixture();receipt['decisions'][1]['meta']['gateMode']='rough-only'
        self.assertIn('Effective neural gate unverified',module.verify(receipt))

if __name__=='__main__': unittest.main()
