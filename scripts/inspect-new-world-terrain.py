"""Plot numerical GLB elevations for registration; does not edit reference imagery."""
import json,struct,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
assert Path.cwd().resolve()==ROOT
source=ROOT/'native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models/terrain/terrain-base.glb'
b=source.read_bytes();length=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+length]);binary=memoryview(b)[28+length:]
def accessor(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];width={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
    assert not v.get('byteStride')
    return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
primitive=doc['meshes'][0]['primitives'][0];vertices=accessor(primitive['attributes']['POSITION']);triangles=accessor(primitive['indices']).reshape(-1,3)
uv=accessor(primitive['attributes']['TEXCOORD_0'])
texture_index=doc['materials'][primitive.get('material',0)]['pbrMetallicRoughness']['baseColorTexture']['index']
image_index=doc['textures'][texture_index]['source'];view=doc['bufferViews'][doc['images'][image_index]['bufferView']]
texture=np.asarray(Image.open(io.BytesIO(bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]))).convert('RGB'))
im=Image.new('RGB',(1080,1080),'#202a32');draw=ImageDraw.Draw(im)
lo=vertices.min(axis=0);hi=vertices.max(axis=0)
def pixel(v):return (round(50+(float(v[0])+.5)*980),round(1030-(float(v[2])+.5)*980))
for triangle in sorted(triangles,key=lambda t:float(vertices[t,1].mean())):
    points=vertices[triangle];height=float(points[:,1].mean());t=(height-float(lo[1]))/float(hi[1]-lo[1]);colour=(int(65+160*t),int(88+125*t),int(83+70*t))
    draw.polygon([pixel(v) for v in points],fill=colour)
for i in range(-5,6):
    p=round(50+(i/10+.5)*980);draw.line([(p,50),(p,1030)],fill='#899393',width=1);draw.text((p+2,1035),f'x {i/10:.1f}',fill='white')
    p=round(1030-(i/10+.5)*980);draw.line([(50,p),(1030,p)],fill='#899393',width=1);draw.text((2,p),f'z {i/10:.1f}',fill='white')
draw.text((50,15),'SOURCE GLB ELEVATION PLOT | raw glTF X/Z | brighter = higher | not reference artwork',fill='white')
out=ROOT/'native/Artifacts/new-world-terrain-analysis';out.mkdir(exist_ok=True)
im.save(out/'source-elevation.png')
for triangle in sorted(triangles,key=lambda t:float(vertices[t,1].mean())):
    points=vertices[triangle];tex=uv[triangle].mean(axis=0)%1
    colour=tuple(int(v) for v in texture[min(texture.shape[0]-1,int(tex[1]*texture.shape[0])),min(texture.shape[1]-1,int(tex[0]*texture.shape[1]))])
    draw.polygon([pixel(v) for v in points],fill=colour)
for i in range(-5,6):
    p=round(50+(i/10+.5)*980);draw.line([(p,50),(p,1030)],fill='#899393',width=1)
    p=round(1030-(i/10+.5)*980);draw.line([(50,p),(1030,p)],fill='#899393',width=1)
im.save(out/'source-material-topdown.png')
(out/'source-bounds.json').write_text(json.dumps(dict(min=lo.tolist(),max=hi.tolist(),vertices=len(vertices),triangles=len(triangles)),indent=2)+'\n')
print(out/'source-elevation.png')
