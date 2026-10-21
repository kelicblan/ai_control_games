import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { ActorPrototype, CompiledVillageRules } from '../config/schema';
export interface DerivedStats extends ActorPrototype {}
/** Source 角色成长!C4:C9 and F001/F002; prototype values never become new bases. */
export function deriveStats(archetype: ActorPrototype, level: number, equipment: string | null, rules: CompiledVillageRules): DerivedStats {
  ensure(Number.isSafeInteger(level) && level >= 1 && level <= 10, 'Invalid level');
  const weapon = equipment ? rules.tables.weapons.find(w => w.id === equipment) : undefined; ensure(!equipment || weapon, 'Unknown equipment prototype');
  return { ...archetype, hp: Math.floor(archetype.hp * (1 + .08 * (level - 1))), attack: Math.floor(archetype.attack * (1 + .07 * (level - 1))) + (weapon?.attack ?? 0),
    defense: archetype.defense + .5 * (level - 1), attackSpeed: Math.max(.1, archetype.attackSpeed + (weapon?.attackSpeedModifier ?? 0)), range: weapon?.range ?? archetype.range,
    gather: archetype.gather * (1 + .03 * (level - 1)), explore: archetype.explore * (1 + .04 * (level - 1)) };
}
