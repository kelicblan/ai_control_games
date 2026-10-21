"""Six-species shared trunk with independent life/combat candidate scoring heads."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['OMP_NUM_THREADS']='1'
import json, pathlib,hashlib,time,argparse
import numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--dataset',default='native/Artifacts/animals/mlp-v1/dataset.json');parser.add_argument('--output',default='native/Artifacts/animals/beast-tide-v2/model');parser.add_argument('--epochs',type=int,default=100);args=parser.parse_args()
src=pathlib.Path(args.dataset);raw=src.read_bytes();d=json.loads(raw)
input_size=len(d['rows'][0]['input']['state'])+len(d['rows'][0]['input']['candidates'][0]['features'])
assert d['format']=='animal-real-executor-v1'
rows=d['rows'];assert all(r['executionId'] and r['outcome']['status']=='executed' and r['chosenIndex']>=0 for r in rows)
train=[r for r in rows if r['seed'] in d['trainSeeds']];val=[r for r in rows if r['seed'] in d['validationSeeds']];test=[r for r in rows if r['seed'] in d['testSeeds']]
rng=np.random.default_rng(1701)
params=[rng.normal(0,.2,(input_size,64)).astype('f'),np.zeros(64,'f'),rng.normal(0,.15,(64,32)).astype('f'),np.zeros(32,'f'),rng.normal(0,.15,(32,2)).astype('f'),np.zeros(2,'f')]
initial=hashlib.sha256(b''.join(p.tobytes() for p in params)).hexdigest();m=[np.zeros_like(p) for p in params];v=[np.zeros_like(p) for p in params]
def batch(rs):
 x=np.array([r['input']['state']+c['features'] for r in rs for c in r['input']['candidates']],dtype='f')
 a=np.maximum(x@params[0]+params[1],0);b=np.maximum(a@params[2]+params[3],0);y=b@params[4]+params[5];return x,a,b,y
def evaluate(rs):
 out={}
 for head in ['life','combat']:
  group=[r for r in rs if r['input']['head']==head];correct=0;by={}
  for r in group:
   *_,y=batch([r]);selected=int(y[:,int(head=='combat')].argmax());ok=selected==r['chosenIndex'];correct+=ok
   species=r['species'];q=by.setdefault(species,[0,0]);q[0]+=int(ok);q[1]+=1
  out[head]={'top1':correct/max(1,len(group)),'decisions':len(group),'species':by}
 return out
step=0;best=None;bestscore=-1;start=time.time()
for epoch in range(args.epochs):
 for ids in np.array_split(rng.permutation(len(train)),max(1,len(train)//128)):
  rs=[train[i] for i in ids];x,a,b,y=batch(rs);g=np.zeros_like(y);offset=0
  for r in rs:
   n=len(r['input']['candidates']);h=int(r['input']['head']=='combat');s=y[offset:offset+n,h];p=np.exp(s-s.max());p/=p.sum();g[offset:offset+n,h]=p;g[offset+r['chosenIndex'],h]-=1;offset+=n
  g/=len(rs);gb=(g@params[4].T)*(b>0);ga=(gb@params[2].T)*(a>0)
  grads=[x.T@ga,ga.sum(0),a.T@gb,gb.sum(0),b.T@g,g.sum(0)];step+=1
  for i,(p,grad) in enumerate(zip(params,grads)):
   m[i]=.9*m[i]+.1*grad;v[i]=.999*v[i]+.001*grad*grad;p-=.002*(m[i]/(1-.9**step))/(np.sqrt(v[i]/(1-.999**step))+1e-8)
 if epoch%10==9:
  scores=evaluate(val);score=sum(x['top1'] for x in scores.values());print(epoch+1,scores,flush=True)
  if score>bestscore:bestscore=score;best=[p.copy() for p in params];bestepoch=epoch+1
params=best
weights={'format':'animal-shared-trunk-two-head-v1','layers':[input_size,64,32,2],'parameters':[p.tolist() for p in params]};weightsraw=json.dumps(weights,separators=(',',':')).encode();out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True);(out/'weights.json').write_bytes(weightsraw)
report={'datasetProvenance':d.get('provenance'),'kind':'real-numpy-fp32-adam-imitation-training','engineHash':d['engineHash'],'datasetHash':hashlib.sha256(raw).hexdigest(),'initialWeightHash':initial,'weightHash':hashlib.sha256(weightsraw).hexdigest(),'epochs':args.epochs,'selectedEpoch':bestepoch,'steps':step,'trainSeeds':d['trainSeeds'],'validationSeeds':d['validationSeeds'],'testSeeds':d['testSeeds'],'validation':evaluate(val),'test':evaluate(test),'seconds':time.time()-start}
(out/'training-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
