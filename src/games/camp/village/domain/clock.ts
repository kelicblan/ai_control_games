import type { ClockRules, CompiledVillageRules } from '../config/schema';

export interface VillageClock {
  day: number; isNight: boolean; cycleSeconds: number; phaseSeconds: number;
  phaseProgress: number; nightStartsAt: number; daylight: number;
}
function validateTime(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('模拟时间超出可验证范围');
}
/** 新时钟只解释显式传入的规则；不读取或改写旧世界 elapsed。 */
export function readVillageClock(elapsedSeconds: number, rules: ClockRules): VillageClock {
  validateTime(elapsedSeconds);
  const { daylightSeconds, nightSeconds } = rules;
  if (![daylightSeconds, nightSeconds].every(v => Number.isFinite(v) && v > 0 && v <= 86400)) throw new Error('日段时长无效');
  const duration = daylightSeconds + nightSeconds;
  const dayIndex = Math.floor(elapsedSeconds / duration), cycleSeconds = elapsedSeconds % duration;
  const isNight = cycleSeconds >= daylightSeconds;
  const phaseSeconds = isNight ? cycleSeconds - daylightSeconds : cycleSeconds;
  const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  // 仅表现过渡：沿用旧版最长 20 秒，在短日段上限制为该日段的一半。
  const twilight = Math.min(20, daylightSeconds / 2, nightSeconds / 2);
  const daylight = isNight ? .05 + .95 * smooth((cycleSeconds - (duration - twilight)) / twilight)
    : 1 - .95 * smooth((cycleSeconds - (daylightSeconds - twilight)) / twilight);
  return { day: dayIndex + 1, isNight, cycleSeconds, phaseSeconds,
    phaseProgress: phaseSeconds / (isNight ? nightSeconds : daylightSeconds),
    nightStartsAt: dayIndex * duration + daylightSeconds, daylight };
}

/** 纯调度：持久化的 triggered IDs 由后续权威状态持有，不依赖渲染帧数。 */
export function dueVillageWaves(from: number, to: number, rules: CompiledVillageRules, triggered: readonly number[]) {
  readVillageClock(from, rules.clock); readVillageClock(to, rules.clock);
  if (to < from) throw new Error('模拟时钟不得回退');
  if (triggered.some(id => !Number.isSafeInteger(id) || id < 1 || id > rules.tables.waves.length)) throw new Error('已触发波次 ID 无效');
  const duration = rules.clock.daylightSeconds + rules.clock.nightSeconds;
  return rules.tables.waves.flatMap((wave, index) => {
    const day = rules.waveSchedule.kind === 'table' ? rules.waveSchedule.days[index]
      : rules.waveSchedule.firstDay + index * rules.waveSchedule.everyDays;
    const atSeconds = (day - 1) * duration + rules.clock.daylightSeconds;
    return !triggered.includes(wave.id) && atSeconds > from && atSeconds <= to ? [{ waveId: wave.id, atSeconds }] : [];
  });
}
