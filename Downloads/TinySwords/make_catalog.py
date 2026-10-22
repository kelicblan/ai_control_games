from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import html, json, math

repo = Path(__file__).resolve().parents[2]
root = repo / 'native/CampMind.Unity/Assets/ThirdParty/TinySwords/Tiny Swords (Free Pack)'
out = Path(__file__).parent / 'Catalog'
out.mkdir(exist_ok=True)
groups = {}
for p in sorted(root.rglob('*.png')):
    rel = p.relative_to(root)
    parts = rel.parts
    key = ('Units / ' + parts[1]) if parts[0] == 'Units' else ('Terrain / ' + parts[1]) if parts[0] == 'Terrain' else parts[0]
    groups.setdefault(key, []).append(p)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
titlefont = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 24)
sections = []
manifest = []
for index, (name, paths) in enumerate(groups.items(), 1):
    cards = []
    for p in paths:
        rel = p.relative_to(root).as_posix()
        im = Image.open(p).convert('RGBA')
        w,h = im.size
        cards.append(f'<a class="card" href="{p.as_uri()}" target="_blank"><div class="image"><img loading="lazy" src="{p.as_uri()}"></div><b>{html.escape(p.name)}</b><small>{w} × {h} px</small><small>{html.escape(rel)}</small></a>')
    sections.append(f'<section id="g{index}"><h2>{html.escape(name)} <span>{len(paths)} PNG</span></h2><div class="grid">'+''.join(cards)+'</div></section>')
    # Every image is included in a labelled contact sheet; HTML links provide full size detail.
    cw,ch,cols = 310,220,4
    sheet = Image.new('RGB',(cw*cols,60+ch*math.ceil(len(paths)/cols)), '#24303a')
    d=ImageDraw.Draw(sheet)
    d.text((16,16), f'{name} — {len(paths)} PNG', font=titlefont, fill='white')
    for n,p in enumerate(paths):
        x,y=(n%cols)*cw,60+(n//cols)*ch
        d.rectangle((x+5,y+5,x+cw-5,y+ch-5),fill='#35434e')
        im=Image.open(p).convert('RGBA')
        scale=min((cw-24)/im.width,(ch-66)/im.height,3)
        im=im.resize((max(1,int(im.width*scale)),max(1,int(im.height*scale))),Image.Resampling.NEAREST)
        sheet.paste(im,(x+(cw-im.width)//2,y+12+(ch-66-im.height)//2),im)
        d.text((x+12,y+ch-47),p.name[:40],font=font,fill='white')
        d.text((x+12,y+ch-27),p.parent.name[:40],font=font,fill='#bdcbd5')
    filename=f'{index:02d}-{name.replace(" / ","-").replace(" ","_")}.jpg'
    sheet.save(out/filename,quality=92)
    manifest.append({'category':name,'count':len(paths),'sheet':filename})
nav=''.join(f'<a href="#g{i}">{html.escape(name)} ({len(paths)})</a>' for i,(name,paths) in enumerate(groups.items(),1))
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Tiny Swords 本地资源图册</title><style>
*{box-sizing:border-box}body{margin:0;background:#172129;color:#edf4f7;font:15px/1.5 "Microsoft YaHei",sans-serif}header{padding:28px 32px}h1{margin:0 0 10px}p{color:#b8cbd7}nav{display:flex;gap:10px;flex-wrap:wrap}nav a{padding:8px 12px;background:#304550;border-radius:6px;color:#d8f5ee;text-decoration:none}main{padding:0 32px 40px}h2{padding-top:24px}h2 span{font-size:14px;color:#a5c1c9}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}.card{background:#2b3b46;border:1px solid #425660;border-radius:8px;overflow:hidden;text-decoration:none;color:white;padding:12px}.image{height:200px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#35434e 0% 25%,#3d4c57 0% 50%) 0/24px 24px;margin-bottom:10px}.image img{max-width:100%;max-height:100%;object-fit:contain;image-rendering:pixelated}b,small{display:block;overflow-wrap:anywhere}small{color:#bad0da;font-size:12px}input{width:100%;max-width:620px;padding:12px;margin:16px 0;background:#f0f5f7;border:0;border-radius:5px}
</style><header><h1>Tiny Swords 免费基础包 · 本地图册</h1><p>410 张 PNG 全部收录。点击图片打开原始分辨率大图；动画以完整序列图展示，并非播放预览。五色阵营分别列出。18 个 Aseprite 源文件保留在原素材目录。</p><input id="q" placeholder="搜索英文文件名，例如 Tree、House、Pawn、Gold"><nav>'''+nav+'</nav></header><main>'+''.join(sections)+'''</main><script>document.querySelector('#q').oninput=e=>{let q=e.target.value.toLowerCase();document.querySelectorAll('.card').forEach(c=>c.hidden=!c.textContent.toLowerCase().includes(q));};</script></html>'''
(out/'index.html').write_text(page,encoding='utf-8')
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
print(out/'index.html')
