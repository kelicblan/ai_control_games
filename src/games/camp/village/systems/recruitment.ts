import { ensure } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { selectWorldRules } from '../config/load';
import { createActor } from '../domain/actors';
import type { VillageState } from '../domain/types';
import { supplement } from './resources';
export function offerRecruit(state: VillageState, id: string, archetypeId: string, expiresAt: number) {
  const rules = selectWorldRules('village-v1', state.ruleVersion);
  ensure(state.economy && validId(id) && !state.economy.offers[id] && rules.tables.actors.some(a => a.id === archetypeId && a.kind !== 'player') && Number.isFinite(expiresAt) && expiresAt > state.elapsed, 'Invalid recruit offer');
  state.economy.offers[id] = { id, archetypeId, expiresAt, acceptedBy: null };
}
export function recruit(state: VillageState, offerId: string) {
  const rules = selectWorldRules('village-v1', state.ruleVersion), economy = state.economy, offer = economy?.offers[offerId];
  ensure(economy && offer && rules.capabilities.recruit.configured, 'Unknown recruit offer');
  if (offer.acceptedBy) return { accepted: true, actorId: offer.acceptedBy };
  const config = supplement<{ heroUniqueness: string; recruitCost: Record<string, number> }>(rules, 'D13');
  if (offer.expiresAt <= state.elapsed || Object.keys(state.actors).length - 1 >= rules.tables.globals.RECRUIT_MAX) return { accepted: false };
  const prototype = rules.tables.actors.find(p => p.id === offer.archetypeId)!;
  if (config.heroUniqueness === 'unique-heroes' && prototype.kind === 'hero' && Object.values(state.actors).some(a => a.archetypeId === prototype.id)) return { accepted: false };
  for (const [key, n] of Object.entries(config.recruitCost)) if ((state.inventory[key] ?? 0) - Object.values(state.reservations).reduce((sum, r) => sum + (r[key] ?? 0), 0) < n) return { accepted: false };
  const actorId = `recruit:${offerId}`; ensure(validId(actorId) && !state.actors[actorId], 'Recruit identity collision');
  for (const [key, n] of Object.entries(config.recruitCost)) state.inventory[key] = (state.inventory[key] ?? 0) - n;
  state.actors[actorId] = createActor(offer.archetypeId, actorId, { position: economy.storePosition }, rules.tables.actors); economy.experience[actorId] = 0;
  offer.acceptedBy = actorId; state.versions[`actor:${actorId}`] = 0; state.versions['inventory:public']++;
  appendEvent(state, 'actor.recruited', [state.playerId, actorId], { offerId, archetypeId: offer.archetypeId }); return { accepted: true, actorId };
}
export function spawnRecruitOffers(state: VillageState, day: number) {
  if (!state.economy) return;
  const rules = selectWorldRules('village-v1', state.ruleVersion), config = supplement<{ spawnRules: { intervalDays: number; maxOffers: number }; offerRules: { archetypeIds: string[]; expiresAfterDays: number } }>(rules, 'D13');
  if ((day - 1) % config.spawnRules.intervalDays !== 0) return;
  const cycle = rules.clock.daylightSeconds + rules.clock.nightSeconds;
  for (let i = 0; i < config.spawnRules.maxOffers; i++) { const id = `offer:${day}:${i}`; if (state.economy.offers[id]) continue;
    const archetypeId = config.offerRules.archetypeIds[(Math.abs(state.seed) + day + i) % config.offerRules.archetypeIds.length];
    offerRecruit(state, id, archetypeId, state.elapsed + cycle * config.offerRules.expiresAfterDays);
  }
}
