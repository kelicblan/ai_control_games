"""Diagnose terrain warp folding from actual GLB geometry and saved controls."""
import json,struct
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
assert Path.cwd().resolve()==ROOT
layout=json.loads((ROOT/'docs/new-world/layout.json').read_text(encoding='utf-8'));data=layout['terrainRegistrationInferences'];rows=data['controls'];src=np.array([[-r['sourceGltfXZ'][0],r['sourceGltfXZ'][1]] for r in rows]);n=len(src)
pitch=np.deg2rad(layout['activeCameraInference']['pitch']);t=np.tan(np.deg2rad(layout['activeCameraInference']['verticalFov']/2));s,c=np.sin(pitch),np.cos(pitch);origin=np.array([0,s,-c])*layout['activeCameraInference']['distance']
target=[]
for r in rows:
    x,y=r['targetPixel'];yy=1-y/941*2;direction=np.array([(x/1672*2-1)*t*1672/941,-s+yy*c*t,c+yy*s*t]);p=origin+direction*((r['targetHeight']-origin[1])/direction[1]);target.append(p[[0,2]])
def kernel(a):
    d=((a[:,None,:]-src[None,:,:])**2).sum(axis=2);return d*np.log(np.maximum(d,1e-20))
matrix=np.zeros((n+3,n+3));matrix[:n,:n]=kernel(src);matrix[:n,n:]=np.c_[np.ones(n),src];matrix[n:,:n]=matrix[:n,n:].T;weights=np.linalg.solve(matrix,np.r_[np.array(target),np.zeros((3,2))])
b=(ROOT/'native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models/terrain/terrain-base.glb').read_bytes();length=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+length]);binary=memoryview(b)[28+length:];primitive=doc['meshes'][0]['primitives'][0]
def read(index,width):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];return np.frombuffer(binary,dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']],count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
vertices=read(primitive['attributes']['POSITION'],3).copy();vertices[:,0]*=-1;triangles=read(primitive['indices'],1).reshape(-1,3);points=vertices[:,[0,2]];mapped=np.c_[kernel(points),np.ones(len(points)),points]@weights
def cross(a,b):return a[:,0]*b[:,1]-a[:,1]*b[:,0]
before=cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]]);after=cross(mapped[triangles[:,1]]-mapped[triangles[:,0]],mapped[triangles[:,2]]-mapped[triangles[:,0]]);valid=np.abs(before)>1e-8;fold=(before*after<0)&valid
centers=points[triangles].mean(axis=1);nearest=((centers[:,None,:]-src[None,:,:])**2).sum(axis=2).argmin(axis=1)
report=dict(folded=int(fold.sum()),tested=int(valid.sum()),foldedAreaFraction=float(np.abs(before[fold]).sum()/np.abs(before[valid]).sum()),nearControls={r['id']:int((fold&(nearest==i)).sum()) for i,r in enumerate(rows) if (fold&(nearest==i)).any()})
delta=points[:,None,:]-src[None,:,:];radius=(delta**2).sum(axis=2);gradient=2*delta*(np.log(np.maximum(radius,1e-20))+1)[:,:,None]
dx=gradient[:,:,0]@weights[:n]+weights[n+1];dy=gradient[:,:,1]@weights[:n]+weights[n+2]
report['minimumHorizontalJacobian']=float((dx[:,0]*dy[:,1]-dy[:,0]*dx[:,1]).min())
print(json.dumps(report,indent=2))
