"""Link verified runtime captures into a local review page, without editing pixels."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'docs/new-world'

def main():
    assert Path.cwd().resolve()==ROOT
    runs=sorted((ROOT/'native/Artifacts').glob('new-world-capture-*'),key=lambda p:p.stat().st_mtime,reverse=True)
    completed=[r for r in runs if (r/'scene-report.json').exists() and (r/'perspective-greybox.png').exists()]
    if not completed:
        raise ValueError('No completed capture')
    run=completed[0]
    report=json.loads((run/'scene-report.json').read_text(encoding='utf-8'))
    assert report['referenceSha256']=='65a53c8676e8c77f5eb95e51a460171d60f511f641c559dc850ded30fcc7db42'
    assert not report['visualAccepted'] and not report['authorityConnected']
    prefix='../../'+run.relative_to(ROOT).as_posix()+'/'
    reference='../../native/ArtSource/new-world-20261017/selected-world-map.png'
    stage3=report.get('stage3Placement',{})
    extra=[stage3['gateFit']] if 'gateFit' in stage3 else []
    candidates=[p for p in report.get('sampleAssets',[])+report.get('stage2Placement',[])+extra if 'targetBounds' in p]
    if report.get('observedVegetation'):
        candidates=[p for p in candidates if p['id']!='sample-conifer-foreground']
    candidate_rows=''.join(f'<tr><td>{p["id"]}</td><td>{p["heightDifferencePixels"]:+.1f} px</td><td>{"原件仅保留对照，已隐藏" if p.get("rendered") is False else "可控新建结构，细节未验收" if "method" in p else "原件统一缩放试装，未验收"}</td></tr>' for p in candidates)
    sample_section='<h2>新生成资产的实景偏差</h2><p>以下是固定机位外包框高度差，只用于诊断，不代表轮廓、门窗、背面或整体相似度验收。</p><table><tr><th>对象</th><th>实际高度减目标高度</th><th>状态</th></tr>'+candidate_rows+'</table>' if candidates else ''
    vegetation=report.get('observedVegetation',[])
    if vegetation:
        rows=''.join(f'<tr><td>{p["id"]}</td><td>{p["heightDifferencePixels"]:+.1f} px</td><td>{p["widthDifferencePixels"]:+.1f} px</td></tr>' for p in vegetation)
        sample_section+='<details><summary>主要树木逐棵投影偏差（均未验收）</summary><p>原图人工初描，非精确分割。树冠高度、宽度依观测修整，隐藏纵深及枝叶仍为推断；包框拟合不等于树冠造型通过。</p><table><tr><th>对象</th><th>高度差</th><th>宽度差</th></tr>'+rows+'</table><a href="vegetation-observations.json">逐棵观测与推断</a></details>'
    platform=report.get('platform',{})
    traced=[p for p in platform.get('footCorrespondence',[]) if 'observedPixel' in p]
    if traced and not report.get('sourceTerrain'):
        rows=''.join(f'<tr><td>{p["index"]}</td><td>{p["oldExtrusionFootErrorPixels"]:.2f} px</td><td>{p["newFootTraceErrorPixels"]:.4f} px</td></tr>' for p in traced)
        sample_section+='<h2>主殿岩台上下轮廓约束</h2><p>台面和岩脚分别采用原图人工初描轮廓，保留长阶缺口。下表只验证输入点的投影回算，不代表轮廓描绘准确、岩石形态或旗帜遮挡已通过验收；两处被长阶遮住的岩脚仍为推断。</p><table><tr><th>岩脚点</th><th>原垂直挤出偏差</th><th>新轮廓回算偏差</th></tr>'+rows+'</table>'
    terrain=report.get('sourceTerrain')
    if terrain:
        sample_section+='<h2>新生成村寨地形的本地修整</h2><p>源件任务 '+terrain['taskId']+'，实际60积分。原件保留；派生网格按五住宅、高台、广场、入口及墙边控制点注册，补入口坡道与长阶净空。控制点仍为人工初估，不能把回算误差当作地形轮廓验收。</p><p>水平变形最小雅可比：'+str(terrain.get('minimumHorizontalJacobian','本次未记录'))+'；微小三角面投影反向面积占比：'+str(terrain.get('foldedProjectedAreaFraction','本次未记录'))+'。仍需结合近景检查地面穿插和崖壁。</p>'
    corrected=report.get('sourceGeometryCorrections',[])
    if corrected:
        sample_section+='<h2>建筑细节源件修整</h2><p>当前六处建筑使用保留UV和贴图的派生源件网格，替换了原先缺少细节的屋顶和墙体块。朝向由原图前基脚边推算，外包框受总图约束；门窗、抱厦、屋脊及整体轮廓仍未验收。</p>'
    yards=report.get('yardWalkProbes',[])
    if yards:
        rows=''.join(f'<tr><td>{p["id"]}</td><td>{"通过" if p["passed"] else "未通过，见实景报告"}</td><td>'+ (f'<a href="{prefix}walk-yard-{p["id"]}.png">院落实景</a>' if (run/f'walk-yard-{p["id"]}.png').exists() else '本次未拍摄')+'</td></tr>' for p in yards)
        sample_section+='<h2>五个院落通路实测</h2><p>只证明参考院口的玩家碰撞通路，不证明入室、NPC住房或正式导航已接入。</p><table><tr><th>院落</th><th>结果</th><th>查看</th></tr>'+rows+'</table>'
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>新世界灰盒实景对照</title>
<style>body{margin:24px;background:#17212a;color:#edf1f5;font:16px system-ui}a{color:#8cd4ff}section{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;display:block}figure{margin:0}figcaption{padding:8px 0}details img{max-width:1672px}.notice{background:#3e3230;padding:16px}</style>
<h1>新世界施工实景对照</h1><p class="notice">这是独立校准场景，不是正式游戏地图。当前正在按总图修整新生成源件；地形、建筑、植被、河流及远景仍有明显差异。可行走不等于视觉验收通过。</p>
<p><a href="review.html">原图定位线</a> · <a href="layout.json">二维观测与三维推断</a> · <a href="'''+prefix+'''scene-report.json">本次实景报告</a></p>
<section><figure><img src="'''+reference+'''" alt="用户原图"><figcaption>用户选定原图</figcaption></figure><figure><img src="'''+prefix+'''perspective-greybox.png" alt="Unity实际灰盒"><figcaption>Unity实际渲染，1672×941，透视候选机位</figcaption></figure></section>
<details><summary>50%叠加对照</summary><img src="'''+prefix+'''perspective-overlay.png" alt="原图叠加"></details>
<details><summary>正交机位诊断（同一几何，未单独拟合）</summary><img src="'''+prefix+'''orthographic-unfitted.png" alt="未拟合正交诊断"></details>
<h2>碰撞通路实测</h2><p>桥—寨门—广场—主殿长阶：'''+('本次灰盒5段均到达。' if report.get('walkProbePassed') else '本次未全部通过，详见报告。')+'''人物使用旧领主GLB、骨架及Idle/Walk动作；没有使用旧环境模型。</p>
'''+sample_section+'''<p>仍需处理：整体地形与岸线、远近山体层次、建筑轮廓和细节、地面植被及材质风格；随后接入正式世界、NPC住房、导航与存档。截图不可作为最终还原完成的证据。</p></html>'''
    (DEST/'runtime-review.html').write_text(html,encoding='utf-8')
    (DEST/'latest-runtime.json').write_text(json.dumps(dict(run=run.relative_to(ROOT).as_posix(),layoutSha256=report.get('layoutSha256'),walkProbePassed=report.get('walkProbePassed'),allYardRoutesPassed=report.get('allYardRoutesPassed'),sourceAssetCredits=report.get('sourceAssetCredits'),visualAccepted=False,authorityConnected=False),indent=2)+'\n',encoding='utf-8')
    print(str(DEST/'runtime-review.html'))

if __name__=='__main__':
    main()
