"""Use actual GLB surface intersections, not neighbourhood quantiles, as datums.

Only numeric geometry is read. No reference bitmap is changed. Local top/foot
controls are observed pixels with inferred heights, not accepted reconstruction.
"""
import json, struct, math
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
assert Path.cwd().resolve()==ROOT
path=ROOT/'docs/new-world/layout.json'
data=json.loads(path.read_text(encoding='utf-8'))
registration=data['terrainRegistrationInferences']; rows=registration['controls']
payload=(ROOT/'native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models/terrain/terrain-base.glb').read_bytes()
length=struct.unpack_from('<I',payload,12)[0];doc=json.loads(payload[20:20+length]);binary=memoryview(payload)[28+length:]
primitive=doc['meshes'][0]['primitives'][0]
def read(index,width):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    return np.frombuffer(binary,dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']],count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
vertices=read(primitive['attributes']['POSITION'],3);triangles=read(primitive['indices'],1).reshape(-1,3)
a,b,c=vertices[triangles[:,0]],vertices[triangles[:,1]],vertices[triangles[:,2]]
ab=b[:,[0,2]]-a[:,[0,2]];ac=c[:,[0,2]]-a[:,[0,2]];den=ab[:,0]*ac[:,1]-ab[:,1]*ac[:,0]
def surface(xz):
    q=np.array(xz)-a[:,[0,2]]
    u=np.divide(q[:,0]*ac[:,1]-q[:,1]*ac[:,0],den,out=np.full_like(den,-9),where=abs(den)>1e-12)
    w=np.divide(ab[:,0]*q[:,1]-ab[:,1]*q[:,0],den,out=np.full_like(den,-9),where=abs(den)>1e-12)
    valid=(u>=0)&(w>=0)&(u+w<=1)
    heights=(a[:,1]+u*(b[:,1]-a[:,1])+w*(c[:,1]-a[:,1]))[valid]
    if not len(heights):raise ValueError(f'No source surface under {xz}')
    return float(heights.max())
camera=data['activeCameraInference'];pitch=math.radians(camera['pitch']);s,camera_cos=math.sin(pitch),math.cos(pitch);t=math.tan(math.radians(camera['verticalFov']/2));origin=np.array([0,s,-camera_cos])*camera['distance']
def ground(pixel,height):
    x,y=pixel;v=1-y/941*2;direction=np.array([(x/1672*2-1)*t*1672/941,-s+v*camera_cos*t,camera_cos+v*s*t])
    return origin+direction*((height-origin[1])/direction[1])
base=[r for r in rows if not r['id'].startswith('court-datum-')]
src=np.array([[-r['sourceGltfXZ'][0],r['sourceGltfXZ'][1]] for r in base]);n=len(src)
def kernel(points):
    d=((points[:,None,:]-src[None,:,:])**2).sum(axis=2);return d*np.log(np.maximum(d,1e-20))
matrix=np.zeros((n+3,n+3));matrix[:n,:n]=kernel(src);matrix[:n,n:]=np.c_[np.ones(n),src];matrix[n:,:n]=matrix[:n,n:].T
target=np.array([ground(r['targetPixel'],r['targetHeight'])[[0,2]] for r in base]);weights=np.linalg.solve(matrix,np.r_[target,np.zeros((3,2))])
def warp(p):return np.r_[kernel(np.array([p]))[0],1,p]@weights
def inverse(target):
    p=src[np.linalg.norm(np.array([warp(q) for q in src])-target,axis=1).argmin()].copy()
    for _ in range(20):
        error=warp(p)-target
        if np.linalg.norm(error)<1e-8:return p
        h=1e-5;j=np.column_stack([(warp(p+np.eye(2)[i]*h)-warp(p-np.eye(2)[i]*h))/(2*h) for i in range(2)])
        p-=np.linalg.solve(j,error)
    raise ValueError('Horizontal registration inverse did not converge')
rows=list(base)
# These datum constraints only change vertical registration. Their horizontal
# positions are an inverse of the existing warp, so no new horizontal folding.
for i,pixel in enumerate([[835,278],[880,280],[1060,280],[1128,292],[1050,310]]):
    coordinate=inverse(ground(pixel,10)[[0,2]])
    rows.append(dict(id=f'court-datum-{i}',sourceGltfXZ=[float(-coordinate[0]),float(coordinate[1])],targetPixel=pixel,targetHeight=10,status='Visible forecourt datum, height and source correspondence inferred'))
for row in rows:
    if 'previousNeighbourhoodSurfaceHeight' not in row and 'sourceSurfaceHeight' in row:row['previousNeighbourhoodSurfaceHeight']=row['sourceSurfaceHeight']
    row['sourceSurfaceHeight']=surface(row['sourceGltfXZ'])
registration['controls']=rows
registration['sourceHeightMethod']='Highest actual triangle/ray intersection at each raw GLB XZ; neighbourhood quantiles superseded. Added court datums preserve the previous horizontal warp.'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(controls=len(rows),courtDatums=5,method=registration['sourceHeightMethod'])))
