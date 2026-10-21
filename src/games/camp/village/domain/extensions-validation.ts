import { canonical, ensure, record } from '../../../../../packages/action-runtime/src/json';
import { validId } from '../../../../../packages/action-runtime/src/types';
import { applyInstitution, institutionHash } from '../../../../../packages/social-core/src/institutions';
import type { VillageState } from './types';
export function validateExtensions(state: VillageState) {
  ensure(state.catchupTicks===undefined||Number.isSafeInteger(state.catchupTicks)&&state.catchupTicks>=0&&state.catchupTicks<=1e12,'Invalid catchup backlog');
  if(state.history){const h=state.history;ensure(record(h)&&Number.isSafeInteger(h.sequence)&&h.sequence>0&&Number.isSafeInteger(h.retiredBeforeTick)&&h.retiredBeforeTick>=0&&h.retiredBeforeTick<=state.tick&&Number.isSafeInteger(h.archivedEvents)&&h.archivedEvents>=0&&Number.isSafeInteger(h.archivedExecutions)&&h.archivedExecutions>=0&&/^[a-f0-9]{64}$/.test(h.chainHash)&&Array.isArray(h.segments)&&h.segments.length<=128&&h.segments.every(s=>Number.isSafeInteger(s.sequence)&&s.sequence>0&&s.sequence<=h.sequence&&/^[a-f0-9]{64}$/.test(s.hash)&&/^[a-f0-9]{64}$/.test(s.chainHash)&&Number.isSafeInteger(s.count)&&s.count>=0)&&h.segments.at(-1)?.chainHash===h.chainHash,'Invalid archived history');}
  if(state.policyMemo)ensure(record(state.policyMemo)&&Object.entries(state.policyMemo).every(([id,m])=>state.actors[id]&&record(m)&&/^[a-f0-9]{64}$/.test(m.fingerprint)&&Number.isFinite(m.nextAt)&&m.nextAt>=0),'Invalid policy memo');
  if (state.navigation) {
    for(const route of Object.values(state.navigation.routes))if(route.steering!==undefined){const m=route.steering;ensure(record(m)&&(m.side===1||m.side===-1)&&Number.isFinite(m.until)&&m.until>=0&&Number.isSafeInteger(m.blocked)&&m.blocked>=0,'Invalid local steering memory');}
    ensure(record(state.navigation) && state.navigation.mode === 'shared-world' && record(state.navigation.routes) && Object.keys(state.navigation.routes).length <= 200, 'Invalid navigation state');
    for (const [id, route] of Object.entries(state.navigation.routes)) ensure((state.actors[id] || state.combat?.enemies[id]) && record(route) && record(route.target) && [route.target.x, route.target.y].every(Number.isFinite) && Number.isSafeInteger(route.revision) && route.revision >= 0 && Array.isArray(route.points) && route.points.length <= 8192 && route.points.every(p => record(p) && [p.x, p.y].every(Number.isFinite)), 'Invalid navigation route');
  }
  if (state.institutions) {
    ensure(record(state.institutions) && Object.keys(state.institutions).length <= 256, 'Invalid institution map');
    for (const [id, rule] of Object.entries(state.institutions)) {
      ensure(validId(id) && rule.id === id && rule.members.every(a => state.actors[a]), 'Invalid institution identity');
      const task = Object.values(state.executions).find(e => e.status === 'completed' && e.command.action === 'ACCEPT_REQUEST' && canonical(e.command.parameters.institution) === canonical(rule));
      ensure(task?.command.planId && state.social.plans[task.command.planId] && state.events.some(e => e.kind === 'institution.changed' && e.executionId === task.id && e.facts.termsHash === institutionHash(rule)), 'Institution requires actual accepted-plan evidence');
      const result = applyInstitution({ ...rule, version: 1 }, rule.members.map(actorId => ({ actorId, response: 'accept', termsHash: institutionHash({ ...rule, version: 1 }) })), {});
      ensure(result.ok, 'Invalid institution terms');
    }
  }
}
