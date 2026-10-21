"""Publish actual downloaded asset evidence; this script never submits Tripo jobs."""
import hashlib
import html
import json
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'native/ArtSource/new-world-20261017'
DEST=ROOT/'docs/new-world'
CATALOG={
    'new-world-sample-house':('普通民居初稿','02_village_house.png'),
    'new-world-sample-conifer':('针叶树初稿','12_tall_conifer.png'),
    'new-world-sample-rock':('岩石初稿','10_rocky_peak.png'),
    'new-world-stage2-hall':('主殿初稿','01_lord_main_hall.png'),
    'new-world-stage2-large-house':('较大民居初稿','03_large_village_house.png'),
    'new-world-stage2-watchtower':('瞭望塔初稿','04_watchtower.png'),
    'new-world-stage2-spreading-pine':('展冠松初稿','13_spreading_pine.png'),
    'new-world-stage2-broadleaf':('阔叶树初稿','14_broadleaf_tree.png'),
    'new-world-stage2-snow-range':('雪山初稿','11_snow_mountains.png'),
    'new-world-stage3-gate':('寨门初稿','05_village_gate.png'),
    'new-world-stage3-palisade':('寨墙模块初稿','06_palisade_wall.png'),
    'new-world-stage3-low-fence':('低围栏初稿','07_low_fence.png'),
    'new-world-stage3-bridge':('木桥初稿','08_wooden_bridge.png'),
    'new-world-terrain-base':('村寨地形源件初稿','09_terrain_base.png'),
}

def relative(path):
    return '../../'+path.relative_to(ROOT).as_posix()

def main():
    assert Path.cwd().resolve()==ROOT
    native_views={}
    captures=sorted((ROOT/'native/Artifacts').glob('new-world-capture-*'),key=lambda p:p.stat().st_mtime,reverse=True)
    for run in captures:
        report_file=run/'scene-report.json'
        if not report_file.exists():
            continue
        report=json.loads(report_file.read_text(encoding='utf-8'))
        shots=report.get('assetStudioShots',[])
        if len(shots) not in (24,40,44) or not all(s.get('isolated') for s in shots):
            continue
        for shot in shots:
            file=(run/shot['file']).resolve()
            assert file.parent==run.resolve() and file.exists()
            batch='stage3' if shot['asset'] in ('gate','palisade','low-fence','bridge') else 'stage2'
            key='new-world-terrain-base' if shot['asset']=='terrain-base' else 'new-world-'+batch+'-'+shot['asset']
            native_views.setdefault(key,[]).append(dict(file=relative(file),yaw=shot['yaw']))
        break
    rows=[]
    for key,(label,reference) in CATALOG.items():
        matches=list(SOURCE.glob('generated*/tripo-out/'+key+'-*'))
        if len(matches)>1:
            raise ValueError('Unexpected reroll for '+key)
        if not matches:
            continue
        folder=matches[0]
        if not all((folder/name).exists() for name in ('task.json','model.glb','preview.png')):
            continue
        task=json.loads((folder/'task.json').read_text(encoding='utf-8'))
        if task['status']!='success':
            continue
        raw=(folder/'model.glb').read_bytes()
        assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
        length=struct.unpack_from('<I',raw,12)[0]
        doc=json.loads(raw[20:20+length])
        triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
        rows.append(dict(id=key,label=label,taskId=task['task_id'],credits=task['credits_consumed'],triangles=triangles,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),
                         model=relative(folder/'model.glb'),preview=relative(folder/'preview.png'),reference=relative(SOURCE/'reference-pack/04_model_references'/reference),nativeViews=native_views.get(key,[]),visualAccepted=False))
    total=sum(row['credits'] for row in rows)
    manifest=dict(schema='new-world-generated-library-v1',completedAssets=len(rows),actualCredits=total,visualAccepted=False,assets=rows)
    DEST.mkdir(parents=True,exist_ok=True)
    (DEST/'generated-assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    cards=[]
    for row in rows:
        native=''.join(f'<figure><a href="{shot["file"]}"><img src="{shot["file"]}"></a><figcaption>Unity隔离视角 {shot["yaw"]}°</figcaption></figure>' for shot in row['nativeViews'])
        details='<details><summary>查看Unity四面实景（原件检查，非地图位置）</summary><div class="pair">'+native+'</div></details>' if native else ''
        cards.append(f'<article><h2>{html.escape(row["label"])}</h2><div class="pair"><figure><img src="{row["reference"]}"><figcaption>单件参考；可见布局仍服从总图</figcaption></figure><figure><img src="{row["preview"]}"><figcaption>生成服务预览；待修整验收</figcaption></figure></div><p>任务 {row["taskId"]} · 实际{row["credits"]}积分 · {row["triangles"]}三角面 · <a href="{row["model"]}">GLB原件</a></p>{details}</article>')
    page=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>新地图生成资产记录</title>
<style>body{{max-width:1200px;margin:24px auto;background:#17212a;color:#edf1f5;font:16px system-ui;padding:0 16px}}a{{color:#8cd4ff}}article{{padding:12px 0 28px;border-bottom:1px solid #506070}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:0}}img{{width:100%;height:380px;object-fit:contain;background:#10161c}}figcaption{{padding:8px}}.notice{{background:#3e3230;padding:16px}}</style>
<h1>新地图生成资产记录</h1><p class="notice">当前下载完成{len(rows)}件，实际累计{total}积分。这是源文件与服务预览清单，不是完整地图或最终模型验收结果；人物继续复用旧模型。</p>
<p><a href="runtime-review.html">实际Unity地图对照</a> · <a href="generated-assets.json">完整任务、积分与文件哈希</a></p>{''.join(cards)}</html>'''
    (DEST/'assets-review.html').write_text(page,encoding='utf-8')
    print(json.dumps(dict(completedAssets=len(rows),actualCredits=total,page=str(DEST/'assets-review.html'))))

if __name__=='__main__':
    main()
