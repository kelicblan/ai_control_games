"""Train all Life v4 network layers with NumPy FP32 Adam, on real executor outcomes."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import json, hashlib, pathlib, sys, time
import numpy as np

data_path = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2]); output.mkdir(parents=True, exist_ok=True)
raw = data_path.read_bytes(); data = json.loads(raw)
assert data['format'] in ['village-life-alpha-dataset-v1','village-tactical-alpha-dataset-v1','village-release-dataset-v1']
assert all(row['outcome']['status'] == 'completed' and row['executionId'] for row in data['rows'])
spec = data['spec']; head=data.get('head','life'); layers = spec['heads'][head]['layers']; assert layers in [[192,128,64,1],[160,128,64,1]]
rng = np.random.default_rng(1701)
weights = [rng.normal(0, np.sqrt(2/a), (a,b)).astype(np.float32) for a,b in zip(layers[:-1],layers[1:])]
biases = [np.zeros(b,np.float32) for b in layers[1:]]
params = [p for pair in zip(weights,biases) for p in pair]
resume_path=pathlib.Path(sys.argv[sys.argv.index('--resume')+1]) if '--resume' in sys.argv else None
epochs=int(sys.argv[sys.argv.index('--epochs')+1]) if '--epochs' in sys.argv else 300
learning_rate=float(sys.argv[sys.argv.index('--learning-rate')+1]) if '--learning-rate' in sys.argv else .001
if resume_path:
    resume=np.frombuffer(resume_path.read_bytes(),dtype='<f4');cursor=0
    for p in params:p[:]=resume[cursor:cursor+p.size].reshape(p.shape);cursor+=p.size
    assert cursor==len(resume)
initial = b''.join(p.tobytes() for p in params)
train_rows=[r for r in data['rows'] if r['seed'] in data['trainSeeds']] if 'trainSeeds' in data else [r for r in data['rows'] if r['seed'] not in data['heldoutSeeds']]
validation_rows=[r for r in data['rows'] if r['seed'] in data.get('validationSeeds',data['heldoutSeeds'])]
test_rows=[r for r in data['rows'] if r['seed'] in data.get('testSeeds',[])]
assert train_rows and validation_rows
assert not set(data.get('trainSeeds',[])) & set(data.get('validationSeeds',[]))
assert not set(data.get('testSeeds',[])) & set(data.get('trainSeeds',[])+data.get('validationSeeds',[]))
def forward(a):
    cache=[a]
    for i,(w,b) in enumerate(zip(weights,biases)):
        a=a@w+b
        if i<2: a=np.maximum(a,0)
        cache.append(a)
    return a,cache
def evaluate(rows):
    correct=0; coverage={};loss=0
    for row in rows:
        vectors=np.array([row['input']['stateFeatures']+c['features'] for c in row['input']['candidates']],np.float32)
        scores,_=forward(vectors); selected=int(np.argmax(scores[:,0])); correct+=selected==row['chosenIndex']
        prob=np.exp(scores[:,0]-scores[:,0].max());prob/=prob.sum();loss+=float(-np.log(max(float(prob[row['chosenIndex']]),1e-12)))
        action=row['input']['candidates'][row['chosenIndex']]['action']; group=coverage.setdefault(action,[0,0]);group[0]+=selected==row['chosenIndex'];group[1]+=1
    return {'top1':correct/max(1,len(rows)), 'decisions':len(rows),'byAction':coverage,'loss':loss/max(1,len(rows))}
m=[np.zeros_like(p) for p in params]; v=[np.zeros_like(p) for p in params]; step=0; log=[]; start=time.time()
best=None;best_key=(-1,float('-inf'));best_epoch=0
for epoch in range(epochs):
    order=rng.permutation(len(train_rows)); losses=[]
    for start_index in range(0,len(order),32):
        selected_rows=[train_rows[i] for i in order[start_index:start_index+32]]
        vectors=np.array([row['input']['stateFeatures']+c['features'] for row in selected_rows for c in row['input']['candidates']],np.float32)
        logits,cache=forward(vectors);gradient=np.zeros_like(logits);offset=0
        for row in selected_rows:
            count=len(row['input']['candidates']);scores=logits[offset:offset+count,0];prob=np.exp(scores-scores.max());prob/=prob.sum()
            losses.append(float(-np.log(max(float(prob[row['chosenIndex']]),1e-12))))
            factor=4 if row['input']['candidates'][row['chosenIndex']]['action']=='REST' else 1
            gradient[offset:offset+count,0]=prob*factor;gradient[offset+row['chosenIndex'],0]-=factor;offset+=count
        gradient/=len(selected_rows);grads=[None]*6
        for layer in range(2,-1,-1):
            grads[layer*2]=cache[layer].T@gradient;grads[layer*2+1]=gradient.sum(axis=0)
            if layer: gradient=(gradient@weights[layer].T)*(cache[layer]>0)
        step+=1
        for i,(p,g) in enumerate(zip(params,grads)):
            np.clip(g,-5,5,out=g); m[i]=.9*m[i]+.1*g;v[i]=.999*v[i]+.001*g*g
            p-=learning_rate*(m[i]/(1-.9**step))/(np.sqrt(v[i]/(1-.999**step))+1e-8)
    if epoch%20==0 or epoch==epochs-1:
        validation=evaluate(validation_rows);entry={'epoch':epoch+1,'loss':float(np.mean(losses)),'validation':validation};log.append(entry);print(json.dumps(entry),flush=True)
        key=(validation['top1'],-validation['loss'])
        if key>best_key:best_key=key;best_epoch=epoch+1;best=[p.copy() for p in params]
assert best is not None
for p,b in zip(params,best):p[:]=b
assert all(np.isfinite(p).all() for p in params)
trained=b''.join(p.astype('<f4').tobytes() for p in params);assert len(trained)==sum(a*b+b for a,b in zip(layers[:-1],layers[1:]))*4 and trained!=initial
(output/'weights.bin').write_bytes(trained)
report={'kind':'real-numpy-fp32-adam-imitation-training','objective':'grouped-candidate-softmax-cross-entropy','head':head,'seed':1701,'epochs':300,'steps':step,'seconds':time.time()-start,'numpy':np.__version__,'datasetHash':hashlib.sha256(raw).hexdigest(),'initialWeightHash':hashlib.sha256(initial).hexdigest(),'weightHash':hashlib.sha256(trained).hexdigest(),'log':log,'checkpoint':{'epoch':best_epoch,'criterion':'validation-top1-then-validation-loss','testUsedForSelection':False},'train':evaluate(train_rows),'heldout':evaluate(validation_rows),'validation':evaluate(validation_rows),'test':evaluate(test_rows),'limitations':['Supervised ranking of an explainable teacher, not a claim of optimal policy or social reasoning.','Teacher agreement is not episode success. Physical outcomes and social controls require separate evaluation.']}
report['engineHash']=data['engineHash']
if 'provenance' in data:report['datasetProvenance']=data['provenance']
report['epochs']=epochs;report['learningRate']=learning_rate
if resume_path:report['initialization']={'kind':'trained-checkpoint-resume','sourceWeightHash':hashlib.sha256(resume_path.read_bytes()).hexdigest(),'correction':data.get('correction')}
report_raw=(json.dumps(report,indent=2)+'\n').encode();(output/'training-report.json').write_bytes(report_raw)
manifest={'format':'village-candidate-mlp-v4','dtype':'float32-le','modelId':head+'-alpha','head':head,'schemaId':spec['schemaId'],'candidateSchemaId':spec['candidateSchemaId'],'featureHash':spec['featureHash'],'normalizerHash':spec['normalizerHash'],'ruleHashes':[data['ruleHash']],'layers':layers,'sha256':report['weightHash'],'kind':'trained','training':{'dataHash':report['datasetHash'],'reportHash':hashlib.sha256(report_raw).hexdigest()}}
if len(sys.argv)>3:manifest['modelId']=sys.argv[3]
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps({'train':report['train'],'heldout':report['heldout'],'sha256':manifest['sha256']}))
