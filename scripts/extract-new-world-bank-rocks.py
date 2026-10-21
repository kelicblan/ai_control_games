"""Extract coarse rock contours as numeric observations, without editing the image."""
import hashlib,json,math
from pathlib import Path
from collections import deque
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
assert Path.cwd().resolve()==ROOT
path=ROOT/'docs/new-world/layout.json';data=json.loads(path.read_text(encoding='utf-8'));reference=ROOT/'native/ArtSource/new-world-20261017/selected-world-map.png'
assert hashlib.sha256(reference.read_bytes()).hexdigest()==data['referenceSha256']
rgb=np.asarray(Image.open(reference).convert('RGB')).astype(np.int16);height,width=rgb.shape[:2];yy,xx=np.mgrid[:height,:width];distance=np.full((height,width),1e9,dtype=np.float32)
for key in ['outerBank','villageBank']:
    chain=np.array(data['river'][key],dtype=float)
    for a,b in zip(chain,chain[1:]):
        delta=b-a;t=np.clip(((xx-a[0])*delta[0]+(yy-a[1])*delta[1])/(delta@delta),0,1)
        distance=np.minimum(distance,(xx-a[0]-delta[0]*t)**2+(yy-a[1]-delta[1]*t)**2)
r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
mask=(distance<65**2)&(yy>260)&(r>45)&(r<235)&(r-b>2)&(r-b<64)&(g-b<65)&(g<r*1.10)
def dilate(binary):
    p=np.pad(binary,2);out=np.zeros_like(binary)
    for dy in range(5):
        for dx in range(5):out|=p[dy:dy+height,dx:dx+width]
    return out
mask=~dilate(~dilate(mask))
seen=np.zeros(mask.shape,dtype=bool);components=[]
def hull(component):
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    ordered=sorted(set(component));lower=[];upper=[]
    for p in ordered:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(ordered):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return [list(p) for p in lower[:-1]+upper[:-1]]
for y,x in zip(*np.where(mask)):
    if seen[y,x]:continue
    seen[y,x]=True;queue=deque([(int(x),int(y))]);component=[]
    while queue:
        px,py=queue.popleft();component.append((px,py))
        for nx,ny in [(px-1,py),(px+1,py),(px,py-1),(px,py+1)]:
            if 0<=nx<width and 0<=ny<height and mask[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;queue.append((nx,ny))
    if not 50<=len(component)<=6500:continue
    points=np.array(component);lo=points.min(axis=0);hi=points.max(axis=0);size=hi-lo
    if size[0]<9 or size[1]<7 or max(size)>145 or size[0]>size[1]*4.5:continue
    center=points.mean(axis=0)
    # Do not interpret the wooden bridge and its clear walking approach as rocks.
    a=np.array(data['bridge']['outerEnd']);z=np.array(data['bridge']['villageEnd']);axis=z-a;t=np.clip(((center-a)@axis)/(axis@axis),0,1)
    if np.linalg.norm(center-a-axis*t)<18:continue
    outline=hull(component)
    if len(outline)<5:continue
    components.append(dict(id=f'source-contour-{len(components):03}',outline=outline,inferredHeightMeters=round(max(.6,min(5,float(size[1])*.075)),2),inferredDepthMeters=round(max(1,min(6,float(size[0])*.075)),2),componentPixels=len(component),observedBounds=[int(lo[0]),int(lo[1]),int(hi[0]),int(hi[1])],status='Colour-component contour near observed banks; coarse automatic observation, moss/overlap uncertainty; height and back inferred, not accepted'))
if 'bankRockObservationsPreviousCoarse' not in data:data['bankRockObservationsPreviousCoarse']=data['bankRockObservations']
for original in data['bankRockObservationsPreviousCoarse']:
    observed=np.array(original['outline']);lo=observed.min(axis=0);hi=observed.max(axis=0);center=(lo+hi)/2
    if any(np.linalg.norm((np.array(c['observedBounds'][:2])+np.array(c['observedBounds'][2:]))/2-center)<max(hi-lo)*.4 for c in components):continue
    x0,y0=np.maximum(lo-3,0);x1,y1=np.minimum(hi+4,[width,height]);local=mask[y0:y1,x0:x1];py,px=np.where(local)
    if len(px)<20:outline=original['outline']
    else:outline=hull(list(zip((px+x0).tolist(),(py+y0).tolist())))
    if len(outline)<5:outline=original['outline']
    components.append(dict(**{k:v for k,v in original.items() if k not in ['outline','status']},outline=outline,observedBounds=[int(lo[0]),int(lo[1]),int(hi[0]),int(hi[1])],status='Original manual object box, with coarse numeric colour-hull refinement where available; not accepted segmentation'))
data['bankRockObservations']=components;data['bankRockObservationMethod']='Numeric colour-component analysis of original reference within observed river-bank band; no reference image modified; not precise segmentation or art acceptance'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(rockContours=len(components),points=sum(len(c['outline']) for c in components))))
