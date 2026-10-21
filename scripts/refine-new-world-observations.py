"""Record revised manual observations from the selected original, never alter image pixels."""
import json
import struct
import math
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
assert Path.cwd().resolve()==ROOT
path=ROOT/'docs/new-world/layout.json'
data=json.loads(path.read_text(encoding='utf-8'))
data['sourceCorrectionInferences']=[
    dict(id='H',model='stage2/hall',yaw=-85,observedBounds=[815,97,1188,282],baseHeightMeters=10,topHeightMeters=34),
    dict(id='A',model='house',yaw=-80,observedBounds=[548,293,694,383],baseHeightMeters=0,topHeightMeters=11),
    dict(id='B',model='house',yaw=-80,observedBounds=[350,343,534,452],baseHeightMeters=0,topHeightMeters=12),
    dict(id='C',model='house',yaw=-80,observedBounds=[322,447,492,539],baseHeightMeters=0,topHeightMeters=11),
    dict(id='D',model='house',yaw=-80,observedBounds=[1252,349,1420,441],baseHeightMeters=0,topHeightMeters=11),
    dict(id='E',model='stage2/large-house',yaw=-80,observedBounds=[1122,462,1368,590],baseHeightMeters=0,topHeightMeters=13),
]
data['sourceCorrectionStatus']='Manual observed outer envelopes; per-building hidden height/yaw inferred. Derived mesh correction preserves original GLBs and UV. Interior landmarks and silhouette have not been accepted.'
data['awningObservations']=[dict(id='E-side-canopy',roofOutline=[[1342,530],[1385,538],[1403,551],[1353,545]],inferredRoofHeightMeters=3.2,observationStatus='Coarse visible green canopy outline at east house, support heights and concealed joints inferred')]
data['plaza']['inferredStandingHeightMeters']=6.5
# The source front is viewed from +90 degrees in the source studio. Infer its
# map orientation from each observed front foundation edge, rather than an
# arbitrary common yaw that previously exposed the back wall.
def ground_point(pixel,height):
    camera=data['activeCameraInference'];pitch=math.radians(camera['pitch']);s,c=math.sin(pitch),math.cos(pitch);t=math.tan(math.radians(camera['verticalFov']/2));origin=np.array([0,s,-c])*camera['distance'];x,y=pixel;v=1-y/941*2;direction=np.array([(x/1672*2-1)*t*1672/941,-s+v*c*t,c+v*s*t]);return origin+direction*((height-origin[1])/direction[1])
for row in data['sourceCorrectionInferences']:
    building=next(b for b in data['buildings'] if b['id']==row['id']);a=ground_point(building['footprint'][3],row['baseHeightMeters']);b=ground_point(building['footprint'][2],row['baseHeightMeters']);edge=b-a
    row['yaw']=-90-math.degrees(math.atan2(edge[2],edge[0]))
    row['yawInference']='Observed front foundation edge on inferred horizontal floor; source front verified in isolated studio'
terrain_file=ROOT/'native/CampMind.Unity/Assets/CampMind/NewWorldCalibration/Models/terrain/terrain-base.glb'
if terrain_file.exists():
    payload=terrain_file.read_bytes();chunk=struct.unpack_from('<I',payload,12)[0];gltf=json.loads(payload[20:20+chunk]);binary=memoryview(payload)[28+chunk:]
    accessor=gltf['accessors'][gltf['meshes'][0]['primitives'][0]['attributes']['POSITION']];view=gltf['bufferViews'][accessor['bufferView']]
    vertices=np.frombuffer(binary,dtype='<f4',count=accessor['count']*3,offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape(-1,3)
    pairs=[
        ('H',[-.14,-.26],[1000,270],10),('H-front',[-.05,-.22],[1000,310],10),
        ('plaza',[.03,-.01],[907,432],0),('A',[-.20,.08],[625,360],0),('B',[-.19,.18],[445,430],0),
        ('C',[-.02,.24],[409,517],0),('D',[.18,-.28],[1345,415],0),('E',[.27,-.12],[1253,562],0),('gate',[.36,.12],[731,665],0),
        ('wall-west-rear',[-.30,.12],[435,319],0),('wall-west',[-.27,.30],[200,424],0),
        ('wall-west-front',[.03,.32],[372,567],0),('wall-gate-west',[.28,.25],[666,645],0),
        ('wall-front',[.40,.0],[1169,720],0),('wall-east',[.30,-.30],[1565,614],0),
        ('wall-east-rear',[.05,-.40],[1501,399],0),('wall-back-right',[-.20,-.36],[1184,300],0),('wall-back-left',[-.32,-.08],[739,270],0),
    ]
    controls=[]
    for id,(x,z),pixel,height in pairs:
        near=vertices[(vertices[:,0]-x)**2+(vertices[:,2]-z)**2<.025**2,1]
        assert len(near),id
        controls.append(dict(id=id,sourceGltfXZ=[x,z],sourceSurfaceHeight=float(np.quantile(near,.65)),targetPixel=pixel,targetHeight=height))
    data['terrainRegistrationInferences']=dict(sourceTask='47721ef6-cffe-487a-94bf-ff2e4974801e',heightScale=166.67,sourceDatum=-.004,controls=controls,status='Source clearings manually estimated in numerical GLB top view; target controls from selected overview; hidden height and correspondence require runtime review')
data['waterfallObservations']=[
    dict(id='hall-west-fall',centers=[[1115,88],[1110,112],[1108,140],[1102,165],[1097,187]],widthsPixels=[8,10,11,13,16],inferredHeightsMeters=[35,28,20,12,4]),
    dict(id='hall-east-fall',centers=[[1207,87],[1209,120],[1208,155],[1210,187],[1203,218]],widthsPixels=[8,9,11,14,20],inferredHeightsMeters=[35,28,20,10,1]),
]
data['mistObservations']=[
    dict(bounds=[-40,76,470,183],inferredHeightMeters=12),
    dict(bounds=[407,109,844,205],inferredHeightMeters=8),
    dict(bounds=[701,40,951,133],inferredHeightMeters=25),
    dict(bounds=[1248,128,1672,268],inferredHeightMeters=12),
    dict(bounds=[1323,37,1591,153],inferredHeightMeters=23),
]
# Correct the previously misplaced far bank: the actual water exits the left
# image border before returning through the foreground, not a narrow canal.
outer=[[474,177],[443,189],[423,204],[398,209],[379,225],[347,229],[319,245],[282,254],[260,270],[233,278],[204,288],[184,305],[153,307],[131,323],[101,327],[79,342],[53,344],[29,360],[12,377],[-8,393],[-18,429],[-15,466],[-6,503],[18,537],[57,566],[100,591],[142,614],[181,636],[218,661],[260,683],[304,710],[349,733],[394,758],[438,785],[478,810],[529,833],[577,859],[626,882],[676,903],[725,927],[752,949]]
data['river']['outerBank']=outer
data['river']['observationRevision']='Manual outer bank correction against selected map; follows water leaving left frame and re-entering foreground. Bank heights remain inferred.'
data['river']['inferredHeightProfile']=[[0,-1.2],[.26,-1.3],[.28,-2.1],[.36,-2.2],[.365,-3.2],[.65,-3.4],[1,-4.4]]
data['river']['heightProfileStatus']='Inferred downstream elevations and rapid drops, not measured heights; both visible bank traces remain fixed under the reference camera'
data['terrainOuterBank']=outer+[[-80,1021],[-80,180],[0,175],[90,150],[180,170],[280,180],[370,160],[430,177]]
# More cliff irregularities on the observed crest; no changes to settlement locations.
data['mountains'][1]['crest']=[[532,186],[540,142],[551,104],[559,103],[561,80],[574,83],[579,52],[590,54],[594,39],[607,43],[611,28],[623,21],[635,36],[644,33],[650,48],[663,46],[675,61],[685,93],[695,100],[700,137],[716,151],[727,164]]
data['mountains'][3]['crest']=[[1035,139],[1042,106],[1055,89],[1058,64],[1071,54],[1086,55],[1090,51],[1100,62],[1111,61],[1120,65],[1128,59],[1134,43],[1147,42],[1155,65],[1167,67],[1174,74],[1182,99],[1193,105],[1200,117],[1211,163],[1225,190]]
data['mountains']=[m for m in data['mountains'] if not m['id'].startswith('observed-secondary-')]
secondary=[
 ('west-edge',[[-60,28],[-27,42],[0,56],[8,24],[19,47],[25,103],[51,131],[65,161]],[[-60,210],[66,196]],24),
 ('west-valley',[[230,145],[243,118],[258,97],[275,103],[290,73],[305,103],[318,94],[336,127],[348,151],[375,167]],[[230,206],[385,204]],16),
 ('west-low-ridge',[[280,222],[300,200],[319,174],[341,168],[358,177],[376,210],[395,233]],[[280,272],[410,253]],12),
 ('west-needle',[[494,125],[520,87],[537,101],[549,58],[553,15],[565,26],[578,67],[586,104],[609,135]],[[484,201],[612,214]],25),
 ('rear-needle',[[698,81],[708,52],[722,38],[726,12],[739,26],[746,8],[761,35],[774,65],[788,91],[807,103]],[[684,170],[834,178]],22),
 ('east-distance',[[1405,201],[1418,163],[1431,141],[1440,107],[1457,123],[1468,156],[1482,179],[1507,203]],[[1384,283],[1530,284]],18),
]
for id,crest,foot,height in secondary:
    data['mountains'].append(dict(id='observed-secondary-'+id,crest=crest,foot=foot,inferredBaseHeightMeters=0,inferredCrestHeightMeters=height,inferredDepthScale=1.15,inferredAerialHaze=.36,observationStatus='Additional coarse visible crest/foot trace from selected original; hidden height and depth inferred'))
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Recorded six source correction cages, revised outer bank and two cliff crests')

veg_path=ROOT/'docs/new-world/vegetation-observations.json'
veg=json.loads(veg_path.read_text(encoding='utf-8'))
veg['observations']=[p for p in veg['observations'] if not p['id'].startswith(('traced-density-','foreground-canopy-'))]
# Individual crown/foot estimates inspected on the full selected image. These
# are recorded observations, not seeded scatter, and remain coarse/unaccepted.
crowns=[
 (8,226,72,24),(31,227,81,29),(57,230,64,24),(82,227,71,23),(108,240,68,23),(136,257,66,24),(162,259,57,21),
 (7,291,74,31),(65,276,70,27),(91,270,64,23),(122,277,61,23),(162,300,74,25),(185,298,64,23),
 (238,275,57,20),(264,258,58,20),(292,256,49,19),(318,243,51,20),(354,231,56,18),(376,220,53,19),(410,214,56,18),
 (467,267,94,31),(490,270,80,27),(548,268,79,28),(568,275,64,23),(612,259,64,24),(637,270,59,24),
 (732,257,69,25),(818,224,52,22),(848,187,55,20),(883,111,54,20),(902,89,43,17),
 (583,63,38,17),(610,50,38,17),(646,66,37,17),(678,106,41,19),
 (960,35,49,19),(982,34,42,20),(1024,79,62,21),(1051,100,47,20),
 (1120,63,43,17),(1154,83,39,17),(1181,110,39,18),(1230,63,43,17),(1255,46,42,17),(1283,30,46,18),(1348,74,44,20),
 (1328,286,88,30),(1352,280,75,26),(1388,294,96,30),(1419,305,88,29),(1445,331,108,34),(1471,346,100,32),
 (1542,340,95,34),(1570,361,99,34),(1599,378,97,34),(1641,422,110,38),(1664,460,114,40),
 (1634,523,122,43),(1610,557,111,40),(1644,610,136,47),(1615,652,131,46),(1578,698,159,55),
 (1526,769,176,62),(1548,827,168,59),(1578,877,196,69),(1627,917,213,80),(1654,955,217,78),
 (1480,940,220,79),(1394,946,189,70),(1350,950,160,59),
 (18,864,209,78),(44,917,223,80),(76,963,211,82),(110,974,209,79),(278,971,199,73),
 (329,987,207,75),(415,985,192,69),(467,984,191,70),(506,988,155,57),
 (222,240,45,17),(246,236,48,18),(272,223,44,18),(290,212,38,15),(311,214,38,16),(338,206,39,15),(362,198,38,15),
 (289,277,43,17),(314,271,47,18),(333,255,43,16),(354,254,45,18),(378,254,46,18),(405,245,42,16),
 (434,249,59,22),(451,261,57,21),(475,276,56,21),(492,289,60,22),
 (516,253,63,23),(540,256,66,24),(559,264,54,20),(593,259,48,18),(620,259,56,21),
 (1323,267,58,21),(1371,289,65,22),(1398,307,70,25),(1428,309,62,22),(1456,332,63,23),
 (1496,359,72,26),(1525,374,73,26),(1561,412,85,29),(1593,461,87,31),(1615,485,90,32),
]
for i,(x,y,h,w) in enumerate(crowns):
    row=dict(id=f'traced-density-{i:03}',model='conifer',bounds=[x-w//2,y-h,x+w//2,y],observationStatus='Additional manual crown estimate; not precise segmentation')
    if y<150:
        row['inferredGroundHeightMeters']=round(35*(1-y/260),2)
        row['groundInference']='Visible mountain ledge; provisional height constrained by mountain crest, not valley floor'
    veg['observations'].append(row)
for i,bounds in enumerate([[-100,650,130,1000],[-35,795,155,1050],[125,865,312,1040],[1540,650,1760,985],[1480,845,1700,1070]]):
    veg['observations'].append(dict(id=f'foreground-canopy-{i}',model='stage2/broadleaf',bounds=bounds,foregroundShade=True,observationStatus='Coarse foreground broadleaf crown envelope, cropped by frame; shaded leaf tint inferred'))
veg_path.write_text(json.dumps(veg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Recorded {len(crowns)} additional source crown observations; {len(veg["observations"])} total')
