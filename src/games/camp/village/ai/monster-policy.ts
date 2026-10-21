import type { VillageState } from '../domain/types';
import { combatEntity } from '../systems/targeting';
import { distance } from '../systems/resources';
/** Monsters use their own visible physical targets; no LLM queue or private goals. */
export function chooseMonsterIntent(state: VillageState, enemyId: string) {
  const enemy = state.combat?.enemies[enemyId]; if (!enemy || enemy.hp <= 0) return undefined;
  const targets = Object.values(state.actors).filter(a => a.body.hp > 0 && distance(enemy.position, a.position) <= 60);
  const rank = (id: string) => {
    const a = combatEntity(state,id)!, actor=state.actors[id];let value=distance(enemy.position,a.position);
    if(enemy.archetypeId==='M005'||enemy.archetypeId==='M006')value-=a.stats.range>2?30:0;
    if(enemy.archetypeId==='M001')value-=actor.kind==='wanderer'||actor.kind==='player'?10:0;
    if(enemy.archetypeId==='M004')value-=actor.kind==='player'?15:0;
    if(enemy.archetypeId==='M003')value-=a.stats.range<=2?10:0;
    if(enemy.archetypeId==='M007'){let hash=state.seed+Math.floor(state.elapsed/5);for(const char of enemy.id+id)hash=Math.imul(hash^char.charCodeAt(0),16777619);value=(hash>>>0)/4294967296;}
    return value;
  };
  targets.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  return targets[0] ? { attackerId: enemyId, targetId: targets[0].id } : undefined;
}
