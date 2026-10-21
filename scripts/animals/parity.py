import json,pathlib,numpy as np,argparse
p=argparse.ArgumentParser();p.add_argument('--dataset',default='native/Artifacts/animals/beast-tide-v2/dataset.json');p.add_argument('--model-dir',default='native/Artifacts/animals/beast-tide-v2/model');p.add_argument('--output',default='native/Artifacts/animals/beast-tide-v2/parity-reference.json');args=p.parse_args()
d=json.loads(pathlib.Path(args.dataset).read_text());p=json.loads((pathlib.Path(args.model_dir)/'weights.json').read_text())['parameters'];p=[np.array(a,dtype='f') for a in p];rows=[r for r in d['rows'] if r['seed'] in d['testSeeds']][::103][:128];out=[]
for r in rows:
 o=r['input'];x=np.array([o['state']+c['features'] for c in o['candidates']],dtype='f');a=np.maximum(x@p[0]+p[1],0);b=np.maximum(a@p[2]+p[3],0);y=b@p[4]+p[5];out.append({'input':o,'scores':y[:,int(o['head']=='combat')].tolist()})
pathlib.Path(args.output).write_text(json.dumps(out))
