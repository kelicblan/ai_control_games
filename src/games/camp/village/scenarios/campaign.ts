import { selectWorldRules } from '../config/load';
import type { Point, VillageScenario } from '../domain/types';
import { resourceLevel } from '../systems/exploration';
import { createGame } from '../../simulation/engine';
import type { GameState } from '../../simulation/types';
/** A finite, declared scenario inventory. No runtime gifts or automatic equipment. */
export function campaignScenario(worldId: string, seed: number, center: Point, project: (p: Point) => Point = p => p, roster: GameState['npcs'] = createGame({seed}).npcs): VillageScenario {
  const rules = selectWorldRules('village-v1', 'p4-social-content-v1');
  return { id: 'campaign-v1', classification: 'experiment', ruleVersion: rules.ruleVersion, worldId, seed, storePosition: { ...center },
    actors: roster.map((n,i)=>({archetypeId:/观察|探索|机灵/.test(n.role)?'W003':n.personality.bravery>=.7&&n.personality.diligence>=.7?'W002':'W001',instanceId:n.id,initial:{name:n.name,personality:{bravery:n.personality.bravery,diligence:n.personality.diligence,empathy:n.personality.empathy},position:project({x:center.x+Math.cos(i*2.399963229728653)*(2+i*.4),y:center.y+Math.sin(i*2.399963229728653)*(2+i*.4)})}})),
    inventory: { wood: 35, stone: 5, rope: 5, food: 30, meat: 0 },
    resourceNodes: Array.from({ length: 30 }, (_, i) => { const resource = (['wood', 'stone', 'rope'] as const)[i % 3], ring = Math.floor(i / 3), angle = i * 2.399963229728653;
      const position = project({ x: center.x + Math.cos(angle) * (3 + ring * 10), y: center.y + Math.sin(angle) * (3 + ring * 10) });
      return { id: `campaign-node-${i}`, resource, level: resourceLevel(Math.hypot(position.x-center.x,position.y-center.y),rules), position }; }) };
}
