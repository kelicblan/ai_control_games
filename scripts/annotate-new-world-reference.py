"""Create an explicitly provisional, reversible pixel annotation of the selected map."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'native/ArtSource/new-world-20261017/selected-world-map.png'
DEST = ROOT / 'docs/new-world'
EXPECTED = '65a53c8676e8c77f5eb95e51a460171d60f511f641c559dc850ded30fcc7db42'

def main():
    assert Path.cwd().resolve() == ROOT, 'Run from the Unity checkout'
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
    # Pixel observations, not world coordinates or reconstructed dimensions.
    observations = [
        ('H', '主殿屋脊中心', 1000, 119),
        ('ST', '长阶上端中心', 956, 287),
        ('SB', '长阶下端中心', 922, 367),
        ('A', '左后住宅屋脊', 621, 310),
        ('B', '左中住宅屋脊', 455, 365),
        ('C', '左前住宅屋脊', 415, 463),
        ('D', '右后住宅屋脊', 1335, 365),
        ('E', '右前住宅屋脊', 1231, 480),
        ('P', '中央立石底部', 916, 440),
        ('G', '寨门通路中心', 731, 653),
        ('T', '门左瞭望塔顶', 617, 457),
        ('BN', '木桥寨侧桥面端点', 665, 708),
        ('BF', '木桥外侧桥面端点', 475, 790),
        ('W', '左侧寨墙转折', 190, 460),
        ('R', '右侧寨墙转折', 1618, 505),
        ('M1', '左后独立石峰顶', 625, 20),
        ('M2', '主殿后石峰顶', 971, 8),
        ('F', '后山主瀑布起点', 1110, 77),
    ]
    points = [dict(id=i, label=l, pixel=[x,y], status='manual-first-pass', worldPosition=None) for i,l,x,y in observations]
    DEST.mkdir(parents=True, exist_ok=True)
    data = dict(schema='new-world-pixel-observations-v1', referenceSha256=EXPECTED,
                imageSize=[1672,941], coordinateSystem='image pixels; top-left origin; x right, y down',
                warning='人工初描，尚未逐点精修或通过实景截图验收。不是三维位置、高差、尺寸或相机参数。', points=points)
    (DEST/'anchors.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    marks = ''.join(f'<g><title>{p["label"]}：{p["pixel"]}</title><circle cx="{p["pixel"][0]}" cy="{p["pixel"][1]}" r="7"/><text x="{p["pixel"][0]+10}" y="{max(18,p["pixel"][1]-9)}">{p["id"]}</text></g>' for p in points)
    layout_path = DEST/'layout.json'
    if layout_path.exists():
        layout = json.loads(layout_path.read_text(encoding='utf-8'))
        assert layout['referenceSha256'] == EXPECTED
        def trace(points, color, close=False):
            tag = 'polygon' if close else 'polyline'
            coords = ' '.join(f'{x},{y}' for x,y in points)
            return f'<{tag} points="{coords}" fill="none" stroke="{color}" stroke-width="2.5"/>'
        marks += ''.join(trace(b['roofBounds'],'#ffb400',True)+trace(b['footprint'],'#d62147',True) for b in layout['buildings'])
        marks += trace(layout['wall']['footline'],'#fa6eff')
        marks += trace(layout['river']['villageBank'],'#00b8ff')+trace(layout['river']['outerBank'],'#00b8ff')
        marks += trace(layout['platform']['top'],'#fff',True)+trace(layout['plaza']['outline'],'#fff',True)
        marks += ''.join(trace(m['crest'],'#9df199') for m in layout['mountains'])
        extra=''.join(trace(b['outline'],'#ffee88',True) for b in layout.get('bankRockObservations',[]))
        vegetation_path=DEST/'vegetation-observations.json'
        if vegetation_path.exists():
            vegetation=json.loads(vegetation_path.read_text(encoding='utf-8'))
            assert vegetation['referenceSha256']==EXPECTED
            for item in vegetation['observations']:
                x0,y0,x1,y1=item['bounds']
                extra+=f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="none" stroke="#91f5d2" stroke-width="1.5"><title>{item["id"]}: coarse observation</title></rect>'
        marks+='<g id="detail-observations" style="display:none">'+extra+'</g>'
    rows = ''.join(f'<tr><td>{p["id"]}</td><td>{p["label"]}</td><td>{p["pixel"]}</td></tr>' for p in points)
    html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>新世界原图定位</title>
<style>body{margin:24px;background:#17212a;color:#edf1f5;font:16px system-ui}figure{margin:0;position:relative;max-width:1672px}img{display:block;width:100%}svg{position:absolute;inset:0;width:100%;height:100%}circle{fill:#d62147;stroke:white;stroke-width:2}text{fill:white;font:bold 18px system-ui;paint-order:stroke;stroke:#17212a;stroke-width:4}table{border-collapse:collapse}td{padding:7px 18px;border-bottom:1px solid #506070}</style>
<h1>新世界参考定位：人工初描</h1><p>唯一构图依据：本次上传的绘画感版本一，1672×941。标记为二维观测，不代表已完成三维场景。黄线屋顶、红线建筑基础、紫线寨墙、蓝线双岸、绿线山脊、白线平台和广场，均需继续精修。</p>
<label><input type="checkbox" checked onchange="document.querySelector('svg').hidden=!this.checked">显示定位标记</label>
<label><input type="checkbox" onchange="document.getElementById('detail-observations').style.display=this.checked?'':'none'">树冠及岸石人工初描</label>
<figure><img src="../../native/ArtSource/new-world-20261017/selected-world-map.png" alt="用户选定新地图原图"><svg viewBox="0 0 1672 941">'''+marks+'</svg></figure><p>'+data['warning']+'</p><table><tr><th>编号</th><th>对象</th><th>像素坐标</th></tr>'+rows+'</table></html>'
    (DEST/'review.html').write_text(html,encoding='utf-8')
    print(json.dumps(dict(points=len(points),referenceVerified=True,output=str(DEST/'review.html'))))

if __name__ == '__main__':
    main()
