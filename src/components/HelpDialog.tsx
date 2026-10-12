import { ArrowRight, Axe, Flame, HeartHandshake, Moon, MousePointer2 } from 'lucide-react';
import { Modal } from './ui';
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="你的第一晚，怎么度过？" onClose={onClose} className="help-modal">
    <p className="dialog-description">坚持 4 分钟，让三名伙伴活着回到篝火附近，并保持火焰燃烧。</p>
    <div className="help-sections"><section><MousePointer2 /><div><h3>先选一个伙伴，再安排工作</h3><p>点击左侧头像或地图上的人，再点击任务按钮或地图地点。按 1 / 2 / 3 快速切换伙伴，Q / W / E / R / T 分配任务，空格暂停。暂停时也可以安排接下来的工作。</p></div></section><section><Axe /><div><h3>木材是温暖，食物是力气</h3><p>采集到的物资会送回储物区。安排伙伴照看篝火，会消耗木材补充火势。饥饿高时给他一份食物，精力低时允许休息。</p></div></section><section><HeartHandshake /><div><h3>他们有自己的想法</h3><p>模型根据体力、饥饿、恐惧、信任和性格选择任务。伙伴可能先吃饭、休息或照顾同伴。鼓励能改善状态，反复催促也可能引起不满。只有一声命令，不保证立即执行。</p></div></section><section><Moon /><div><h3>留意天气，也别忘了回家</h3><p>风雨会加快篝火消耗，林间危险可能造成受伤。最后 30 秒点击“全队回营”，让大家回到篝火 25 格以内。篝火熄灭或有人倒下都会让旅程失败。</p></div></section></div>
    <div className="help-model"><Flame size={20} /><div><strong>想验证真正的模型决策？</strong><p>打开底部“决策观察”，查看实际输入、候选分数与执行结果。新旅程里可切换规则对照、复用种子。这里的模型是专用任务网络，伙伴台词是情绪模板，不是大模型生成。</p></div></div>
    <button className="primary-button" onClick={onClose}>明白了，一起努力 <ArrowRight size={17} /></button>
  </Modal>;
}
