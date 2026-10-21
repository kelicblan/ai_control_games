import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState } from '../domain/types';
import type { CompiledVillageRules } from '../config/schema';
import { supplement } from './resources';
export function settleDailyFood(state: VillageState, rules: CompiledVillageRules, day: number) {
  ensure(state.economy && Number.isSafeInteger(day) && day >= 1 && rules.ruleHash === state.ruleHash, 'Invalid daily food settlement');
  const food = supplement<{ foodPerRecruitPerDay: number; foodPerPlayerPerDay: number; meatFoodRatio: number; starvationDamage?: number }>(rules, 'D12');
  for (const actor of Object.values(state.actors)) {
    if (actor.body.incapacitated) continue;
    const key = `${actor.id}:${day}`; if (state.economy.foodDays[key]) continue;
    const amount = actor.kind === 'player' ? food.foodPerPlayerPerDay : food.foodPerRecruitPerDay;
    const reserved = Object.values(state.reservations).reduce((n, r) => n + (r.food ?? 0), 0);
    let meatUsed = 0;
    if (state.ruleVersion === 'p4-social-content-v1') {
      const missing = Math.max(0, amount - Math.max(0,(state.inventory.food??0)-reserved));
      const freeMeat = Math.max(0,(state.inventory.meat??0)-Object.values(state.reservations).reduce((n,r)=>n+(r.meat??0),0));
      meatUsed = Math.min(freeMeat, Math.ceil(missing/food.meatFoodRatio));
      if (meatUsed) {state.inventory.meat-=meatUsed;state.inventory.food=(state.inventory.food??0)+Math.floor(meatUsed*food.meatFoodRatio);}
    }
    const paid = Math.min(amount, Math.max(0, (state.inventory.food ?? 0) - reserved));
    state.inventory.food = (state.inventory.food ?? 0) - paid; state.economy.foodDays[key] = true;
    actor.body.hunger = Math.min(100, actor.body.hunger + (amount - paid) * 20); state.versions['inventory:public']++; state.versions[`actor:${actor.id}`]++;
    appendEvent(state, 'food.daily_maintenance', [actor.id], { day, required: amount, consumed: paid, ...(meatUsed?{meatUsed}: {}) });
    if (actor.body.hp>0 && actor.body.hunger>=100 && paid<amount && food.starvationDamage) {
      const damage=Math.min(actor.body.hp,food.starvationDamage);actor.body.hp-=damage;
      if(!actor.body.hp){actor.body.downed=true;if(state.combat)state.combat.downedAt[actor.id]??=state.elapsed;}
      appendEvent(state,'food.starvation_damage',[actor.id],{damage,source:'starvation',day});
    }
  }
}
