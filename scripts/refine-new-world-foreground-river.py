"""Revise numeric shore observations; reference pixels remain unchanged."""
import json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
assert Path.cwd().resolve()==ROOT
path=ROOT/'docs/new-world/layout.json';data=json.loads(path.read_text(encoding='utf-8'))
assert hashlib.sha256((ROOT/'native/ArtSource/new-world-20261017/selected-world-map.png').read_bytes()).hexdigest()==data['referenceSha256']
river=data['river']
if 'foregroundPreviousCoarse' not in river:river['foregroundPreviousCoarse']={key:river[key] for key in ['outerBank','villageBank']}
outer=[p for p in river['foregroundPreviousCoarse']['outerBank'] if p[1]<=758]+[[400,770],[470,776],[535,781],[575,785],[630,800],[665,810],[685,833],[840,859],[910,882],[935,903],[945,927],[970,949]]
inner=[p for p in river['foregroundPreviousCoarse']['villageBank'] if p[1]<=775]+[[825,785],[845,800],[900,810],[925,833],[1070,859],[1110,882],[1150,900],[1242,920],[1310,941]]
river['outerBank']=outer;river['villageBank']=inner
data['terrainOuterBank']=outer+[[-80,1021],[-80,180],[0,175],[90,150],[180,170],[280,180],[370,160],[430,177]]
data['terrainMainland']=inner+[[1752,1021],[1752,359],[1449,290],[1254,262],[1080,253],[816,247],[749,244],[515,244]]
river['foregroundObservationRevision']='Coarse manual bank re-observation checked against numeric original water-colour spans at rows 785/800/810/833/859/882/903/927/938. Foam, bridge and rock occlusions remain uncertain; bridge-adjacent continuity inferred, not accepted segmentation.'
river['foregroundNumericWaterSpans']=[[785,587,810],[800,606,815],[810,679,883],[833,694,897],[859,858,1063],[882,927,1062],[903,951,1211],[927,958,1293],[938,980,1300]]
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(outerPoints=len(outer),innerPoints=len(inner),referenceUnmodified=True)))
