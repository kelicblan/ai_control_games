import { ensure } from '../../../../../packages/action-runtime/src/json';
import { selectWorldRules } from '../config/load';
import type { VillageState } from '../domain/types';
import { deriveStats } from '../domain/stats';
import { supplement } from './resources';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { fenceBlocksSegment } from './targeting';
const growthKeys = ['hp', 'attack', 'defense', 'gather', 'explore'] as const;
function gains(before: ReturnType<typeof deriveStats>, after: ReturnType<typeof deriveStats>) {
  return Object.fromEntries(growthKeys.map(key => [key, Math.round((after[key] - before[key]) * 1000) / 1000]));
}
/** Read-only presentation: the authority's thresholds, equipment and source ledger. */
export function progressionView(state: VillageState, actorId: string) {
  const actor = state.actors[actorId], rules = selectWorldRules('village-v1', state.ruleVersion);
  const config = supplement<{ xpThresholds?: number[]; xpSources?: Record<string, number> }>(rules, 'D14');
  const thresholds = config.xpThresholds ?? [0], xp = state.economy?.experience[actorId] ?? 0;
  const recipe = actor.equipment ? state.economy?.items[actor.equipment]?.recipeId ?? null : null;
  const stats = deriveStats(actor.attributes, actor.level, recipe, rules), maxLevel = actor.level >= thresholds.length;
  const next = maxLevel ? null : deriveStats(actor.attributes, actor.level + 1, recipe, rules);
  return { experience: xp, level: actor.level, currentLevelXp: xp - thresholds[actor.level - 1],
    requiredXp: maxLevel ? 0 : thresholds[actor.level] - thresholds[actor.level - 1],
    remainingXp: maxLevel ? 0 : Math.max(0, thresholds[actor.level] - xp), maxLevel,
    stats, nextGains: next ? gains(stats, next) : null, sources: config.xpSources ?? {},
    recent: state.events.filter(e => state.economy?.xpEvents[`${e.id}:${actorId}`]).slice(-5).reverse().map(e => ({ eventId: e.id, at: e.at, action: String(e.facts.action ?? (e.kind === 'enemy.died' ? 'ATTACK' : e.kind)), amount: Number(state.economy!.xpEvents[`${e.id}:${actorId}`]) })) };
}
export function grantExperience(state: VillageState, eventId: string, actorId: string, amount: number) {
  const economy = state.economy, actor = state.actors[actorId], event = state.events.find(e => e.id === eventId);
  ensure(economy && actor && event?.participants.includes(actorId) && ['execution.completed', 'node.depleted', 'item.crafted', 'resources.deposited','enemy.died','wildlife.hunt_completed','wildlife.harvested'].includes(event.kind) && Number.isSafeInteger(amount) && amount > 0, 'Invalid contribution');
  const key = `${eventId}:${actorId}`, old = economy.xpEvents[key]; if (old) { ensure(old === String(amount), 'Contribution amount changed'); return; }
  const rules = selectWorldRules('village-v1', state.ruleVersion), config = supplement<{ xpThresholds: number[]; levelHpPolicy: string }>(rules, 'D14');
  economy.xpEvents[key] = String(amount); economy.experience[actorId] = (economy.experience[actorId] ?? 0) + amount;
  const level = Math.min(10, config.xpThresholds.filter(t => t <= economy.experience[actorId]).length);
  if (level > actor.level) {
    const fromLevel = actor.level, recipe = actor.equipment ? economy.items[actor.equipment]?.recipeId ?? null : null;
    const before = deriveStats(actor.attributes, actor.level, recipe, rules);
    const previous = actor.body.maxHp; actor.level = level; actor.body.maxHp = deriveStats(actor.attributes, level, null, rules).hp;
    if (config.levelHpPolicy === 'preserve-ratio') actor.body.hp = actor.body.hp / previous * actor.body.maxHp;
    state.versions[`actor:${actorId}`]++;
    const witnesses = Object.values(state.actors).filter(a => a.id !== actorId && a.body.hp > 0 && !a.body.incapacitated && Math.hypot(a.position.x - actor.position.x, a.position.y - actor.position.y) <= 12 && !fenceBlocksSegment(state, a.position, actor.position));
    const upgrade = appendEvent(state, 'actor.levelled_up', [actorId], { fromLevel, toLevel: level, sourceEventId: eventId, experience: economy.experience[actorId], gains: gains(before, deriveStats(actor.attributes, level, recipe, rules)) });
    upgrade.visibleTo = [...new Set([actorId, state.playerId, ...witnesses.map(a => a.id)])];
    // A nearby established companion may acknowledge the actual event. No invented global chatter.
    const companion = witnesses.find(a => a.id !== state.playerId && (a.personal.relations[actorId]?.affinity ?? 0) >= .6 && a.personal.relations[actorId].basisRefs.length > 0 && !state.events.some(e => e.kind === 'progression.acknowledged' && e.participants.includes(a.id) && state.elapsed - e.at < 600));
    if (companion) {
      const reply = appendEvent(state, 'progression.acknowledged', [companion.id, actorId], { speakerId: companion.id, recipientId: actorId, basisRef: upgrade.id, text: `${actor.name}，这段时间的努力有成果了，恭喜升到${level}级。` });
      reply.visibleTo = [...upgrade.visibleTo];
    }
  }
}
