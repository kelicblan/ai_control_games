import { ArrowRight, Axe, Flame, HeartHandshake, Moon, MousePointer2 } from 'lucide-react';
import { Modal } from './ui';
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="你的第一晚，怎么度过？" onClose={onClose} className="help-modal">
    <p className="dialog-description">坚持 4 分钟，让五名伙伴活着回到篝火附近，并保持火焰燃烧。</p>
    <div className="help-sections"><section><MousePointer2 /><div><h3>先选一个伙伴，再安排工作</h3><p>点击左侧头像或场景中的伙伴，再点底部任务、营地地点，或一块空地。点空地会让伙伴走过去。按 1 / 2 / 3 / 4 / 5 切换伙伴，Q / W / E / R / T 分配任务，空格暂停。暂停时也可以安排工作。</p></div></section><section><Axe /><div><h3>木材是温暖，食物是力气</h3><p>采集的物资会送回储物区，照看篝火会消耗木材。头像下的绿条是精力，橙条是饥饿。点底部伙伴名字或右侧“营地”，查看状态、分配食物、鼓励伙伴和调整物资优先级。</p></div></section><section><HeartHandshake /><div><h3>给伙伴一些照顾，也留意脚下</h3><p>伙伴会照顾自己的饥饿、疲劳与受伤同伴，也可能拒绝安排。火焰会烫伤，荆棘、岩石和溪水也要小心。受伤时会有身体反应和牢骚，右侧“音效”可以开启声音；“手记”会记下发生的事。伙伴会提出自己的请求；点小提示回应，或在营地抽屉里主动聊聊。协商影响任务、物资与信任，吃饭和休息的承诺要用行动兑现。</p></div></section><section><Moon /><div><h3>留意天气，也别忘了回家</h3><p>风雨会加快篝火消耗。最后 30 秒打开“营地”，点击“全队回营”，让大家回到篝火 25 格以内。篝火熄灭或有人倒下都会让旅程失败。打开窗口会自动暂停，关闭后继续原来的节奏。</p></div></section></div>
    <div className="help-model"><Flame size={20} /><div><strong>想验证真正的模型决策？</strong><p>点击顶部天气标签，可以主动吹起山风、落雨或触发雷暴。露天的伙伴会淋湿，雨棚下能避雨，风雨也会影响篝火。从天气窗口、“手记”或“营地”进入“决策观察”，可核对天气输入、前后任务、候选分数与真实来源。营地里的“新旅程”可切换规则对照、复用种子。任务模型是专用网络；开启 MiniMind3 后可生成伙伴话语，离线时使用即时预设回应。实际安排通过对话选项执行。</p></div></div>
    <button className="primary-button" onClick={onClose}>明白了，一起努力 <ArrowRight size={17} /></button>
  </Modal>;
}
