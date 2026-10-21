import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=path.resolve(process.argv[2]??'');
const allowed=path.join(root,'native/Artifacts')+path.sep;
if(!run.startsWith(allowed))throw new Error('Use a probe directory in native/Artifacts');
const result=JSON.parse(fs.readFileSync(path.join(run,'result.json'),'utf8'));
if(result.passed!==true)throw new Error('Probe did not pass');
const sources=JSON.parse(fs.readFileSync(path.join(root,'native/CampMind.Unity/Assets/CampMind/ReferenceSample/sources.json'),'utf8'));
const destination=path.join(root,'docs/reference-sample');fs.mkdirSync(path.join(destination,'screenshots'),{recursive:true});
for(const name of ['overview','manor','dwelling','gate','watchtower','riverbank','walk']){
  const bytes=fs.readFileSync(path.join(run,name+'.png'));if(bytes.length<1000||bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('Invalid screenshot '+name);
  fs.writeFileSync(path.join(destination,'screenshots',name+'.png'),bytes);
}
const link=p=>p.replaceAll('\\','/');
const refs=path.resolve(root,'../模型/模型原图');
const rows=[['总览','晨曦群山中的古风山寨.png','overview'],['领主宅','领主宅.png','manor'],['民居','属民屋.png','dwelling'],['寨门','围栏和寨门.png','gate'],['瞭望塔','瞭望塔.png','watchtower']];
const names={manor:'领主宅',dwelling:'民居',gate:'寨门',watchtower:'瞭望塔'};
const lines=[
  '# 参考图可行走样板 · 首版验收记录',
  '',
  '日期：2026-10-17。四项Tripo建筑已接入独立Unity原生场景，复用现有骨骼人物，可以观察、行走和开合寨门。当前为建筑与通行样板，**视觉尚未达到参考图，不能作为整张地图还原完成的结论**。',
  '',
  '## 启动与操作',
  '',
  `[双击运行参考图样板.cmd](${link(path.join(root,'运行参考图样板.cmd'))})；程序在 native/Builds/ReferenceSample/CampMindSample.exe。`,
  '',
  '- 1～6：总览、领主宅、民居、寨门、瞭望塔、河岸固定机位。',
  '- Tab：切换行走镜头；WASD移动；右键拖动环绕；滚轮调距离。',
  '- 靠近寨门按E开合；Home回出生点；H隐藏说明；F12截图。',
  '- 独立场景不连接TS世界服务、不写玩家存档，未替换Camp主地图。房屋室内、塔楼攀爬和正式世界寻路尚未验收。',
  '',
  '## 实际费用',
  '',
  '| 资产 | 操作 | 任务ID | 实际积分 |',
  '|---|---|---|---:|',
  ...sources.sources.map(r=>`| ${names[r.id]} | image_to_model | ${r.taskId} | ${r.credits} |`),
  '',
  `总消费 **${sources.totalCredits}积分**；四项各60积分。生成后查询余额3050、冻结0。没有付费重生成、转换、分割或角色生成。源文件与SHA256见Unity样板目录中的sources.json。`,
  '',
  '寨门原始结果混入背景建筑与地面，做了本地裁剪、去除无引用顶点及复用本次瞭望塔屋顶修补。开合门板使用本地建模与程序化木纹重建；原始付费GLB未覆盖。修补结构仍需视觉验收。',
  '',
  '## 验证证据',
  '',
  `实际渲染窗口探针：${link(run)}。`,
  `人物运动距离约${result.distance.toFixed(1)}米；${result.animatedBones}根骨骼有姿态变化；${result.segments.length}段路线均到达目标。地面支撑=${result.groundSupported}，障碍穿透=${result.obstacleOverlap}，关门阻挡=${result.closedGateBlocked}，开门通路=${result.openGatePassage}。`,
  '',
  'Unity专项EditMode检查4/4通过；真实Windows Player构建及窗口截图已完成。没有运行全项目测试、正式世界联调或长期性能基准，通行结果仅覆盖记录的样板路线。',
  '',
  '## 固定视角对照',
  '',
  '相机按参考图方向与主体构图近似设置，并记录位置、目标点与FOV。单张参考图没有原始相机参数，以下不是像素级标定或完全相同机位的证明。',
  '',
  '| 对象 | 参考图片 | 实际Unity窗口截图 |',
  '|---|---|---|',
  ...rows.map(([label,ref,name])=>`| ${label} | ![${label}参考](${link(path.join(refs,ref))}) | ![${label}实际](${link(path.join(destination,'screenshots',name+'.png'))}) |`),
  '',
  '## 河岸与实际行走',
  '',
  `![河岸](${link(path.join(destination,'screenshots/riverbank.png'))})`,
  `![行走后位置](${link(path.join(destination,'screenshots/walk.png'))})`,
  '',
  '## 仍有的视觉差异',
  '',
  '- 四栋建筑主要轮廓和装饰已生成；木构细节、屋顶厚度、零散道具、背面和部分材质仍有AI生成误差。',
  '- 样板山体为程序化占位，植被、围墙与石块复用旧资产，风格和密度与原图不一致。',
  '- 台地、峭壁、复杂河谷、瀑布急流、山谷云雾与地表生活细节未达到原图。',
  '- 总览布局只覆盖样板构图，不能视为完整参考地图的地理复刻。',
  '- 未将当前画面标记为visualAccepted；后续应先对上述差异继续制作，再决定是否扩展全图。',
  '',
  '## 相机参数',
  '',
  '| 机位 | 位置 | 目标 | 垂直FOV |',
  '|---|---|---|---:|',
  ...result.cameras.map(c=>`| ${c.name} | ${c.position.join(', ')} | ${c.target.join(', ')} | ${c.fov} |`),
  ''
];
fs.writeFileSync(path.join(destination,'README.md'),lines.join('\n'));
fs.writeFileSync(path.join(root,'native/Artifacts/reference-sample/latest.json'),JSON.stringify({run,result,report:path.join(destination,'README.md')},null,2)+'\n');
console.log(path.join(destination,'README.md'));
