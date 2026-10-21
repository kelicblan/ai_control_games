"""Rank-preserving FP32 output calibration. Select scale from validation logits only."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import json,pathlib,hashlib,math,sys,shutil
import numpy as np
source,target,data_path=map(pathlib.Path,sys.argv[1:4]);assert not target.exists();data=json.loads(data_path.read_bytes())
manifest=json.loads((source/'manifest.json').read_bytes());report=json.loads((source/'training-report.json').read_bytes());raw=(source/'weights.bin').read_bytes();assert hashlib.sha256(raw).hexdigest()==manifest['sha256']
flat=np.frombuffer(raw,dtype='<f4').copy();layers=manifest['layers'];params=[];offset=0
for a,b in zip(layers[:-1],layers[1:]):
 w=flat[offset:offset+a*b].reshape(a,b);offset+=a*b;bias=flat[offset:offset+b];offset+=b;params.append((w,bias))
assert offset==len(flat)
def score(row):
 x=np.array([row['input']['stateFeatures']+c['features'] for c in row['input']['candidates']],np.float32)
 for i,(w,b) in enumerate(params):
  x=x@w+b
  if i<len(params)-1:x=np.maximum(x,0)
 return x[:,0]
validation=[r for r in data['rows'] if r['seed'] in data['validationSeeds']];assert validation
maximum=max(float(np.abs(score(r)).max()) for r in validation)
scale=2.0**min(0,math.floor(math.log2(16/max(maximum,1e-9))))
before=[int(np.argmax(score(r))) for r in data['rows']]
params[-1][0][:]*=np.float32(scale);params[-1][1][:]*=np.float32(scale)
after=[int(np.argmax(score(r))) for r in data['rows']];assert before==after,'Calibration changed ranking'
target.mkdir();calibrated=flat.astype('<f4').tobytes();weight_hash=hashlib.sha256(calibrated).hexdigest()
shutil.copy2(source/'training-report.json',target/'uncalibrated-training-report.json');shutil.copy2(source/'weights.bin',target/'uncalibrated-weights.bin')
report['uncalibratedWeightHash']=manifest['sha256'];report['weightHash']=weight_hash
report['outputCalibration']={'method':'positive-power-of-two-final-affine-scale','scale':scale,'validationMaximumAbsoluteLogit':maximum,'maximumValidationAbsoluteLogitAfter':maximum*scale,'selectionData':'validation-only','allDatasetRankingsUnchanged':True,'sourceReportHash':hashlib.sha256((source/'training-report.json').read_bytes()).hexdigest()}
# Preserve the training-time loss logs and report deployed score losses separately.
for split in ['train','validation','test']:
 rows=[r for r in data['rows'] if r['seed'] in data[split+'Seeds']];loss=0
 for r in rows:
  scores=score(r);p=np.exp(scores-scores.max());p/=p.sum();loss-=math.log(max(float(p[r['chosenIndex']]),1e-12))
 report[split]['calibratedLoss']=loss/max(1,len(rows))
report_raw=(json.dumps(report,indent=2)+'\n').encode();(target/'training-report.json').write_bytes(report_raw);(target/'weights.bin').write_bytes(calibrated)
manifest['sha256']=weight_hash;manifest['modelId']+='-calibrated';manifest['training']['reportHash']=hashlib.sha256(report_raw).hexdigest();(target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(target),'scale':scale,'originalHash':report['uncalibratedWeightHash'],'sha256':weight_hash,'rankingsUnchanged':True}))
