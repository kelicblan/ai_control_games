"""Read saved scene transforms without opening or changing the map author's scene."""
import pathlib,re,json,hashlib,numpy as np
scene=pathlib.Path('native/CampMind.Unity/Assets/CampMind/NewWorldGame/Camp.unity');raw=scene.read_bytes();text=raw.decode('utf8');objects={};transforms={}
for kind,key,body in re.findall(r'--- !u!(\d+) &(-?\d+)\n(.*?)(?=\n--- !u!|\Z)',text,re.S):
 if kind=='1':
  name=re.search(r'  m_Name: (.*)',body);objects[key]=name.group(1).strip('"') if name else ''
 if kind=='4':
  def vector(field):
   value=re.search(r'  '+field+r': \{([^}]+)\}',body);return [float(n) for n in re.findall(r'[xyzw]: ([\d.eE+-]+)',value.group(1))]
  owner=re.search(r'm_GameObject: \{fileID: (-?\d+)\}',body);parent=re.search(r'm_Father: \{fileID: (-?\d+)\}',body)
  if owner and parent:transforms[key]=(owner.group(1),parent.group(1),vector('m_LocalPosition'),vector('m_LocalRotation'),vector('m_LocalScale'))
cache={}
def matrix(key):
 if key=='0' or key not in transforms:return np.eye(4)
 if key in cache:return cache[key]
 owner,parent,p,q,s=transforms[key];x,y,z,w=q;r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 m=np.eye(4);m[:3,:3]=r@np.diag(s);m[:3,3]=p;cache[key]=matrix(parent)@m;return cache[key]
trees=[]
for key,(owner,*_) in transforms.items():
 if objects.get(owner,'').startswith('observed-tree-'):
  p=matrix(key)[:3,3];trees.append({'id':objects[owner].split(' ')[0],'position':{'x':float(50-p[0]),'y':float(p[2]+50)}})
assert len(trees)>20
out=pathlib.Path('config/animals/habitats-new-world-v1.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'version':1,'layout':'new-world-v1','sourceSceneHash':hashlib.sha256(raw).hexdigest(),'trees':trees},indent=2),encoding='utf8');print(json.dumps({'trees':len(trees),'output':str(out)}))
