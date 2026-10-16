import { moveWorldBody, separateWorldNpcs, worldCanTraverse } from '../world/navigation';
import { advanceAppointment,updateAppointments } from '../social/appointments';
import { validPoint } from '../../../../packages/world-core/src';
import { createWorldState, updateWorldExploration } from '../world/state';
import {
  ACTIONS, EMOTIONS, type ActionId, type Emotion, type GameCommand, type GameEvent,
  type GameOptions, type GameState, type Npc, type PolicyFunction, type PolicyObservation,
  type PolicyResult,
  type ContactReaction, type DecisionTrigger,
} from './types';
import {
  ACTION_DURATIONS, ACTION_LABELS, clamp, DIFFICULTY_CONFIG, distance,
  GAME_DURATION, isAtCamp, MAX_DECISIONS, MAX_EVENTS, MEAL_RELIEF,
  MOVE_SPEED, NPC_PROFILES, createNpc,
} from './constants';
import { FEATURE_VERSION, getObservation } from './observation';
import { foodReserve, needsFoodGatherer } from './survival';
import { cancelSocialAgreement, createSocialState, getSocialAgreement,
  handleSocialCommand, recordSocialAction, recordSocialInteraction, updateSocial } from './social';
import { getTaskDestination, TERRAIN } from './terrain';
import { findRoute, projectToWalkable, type CollisionContact } from './physics';
import { createAtmosphere, getWeatherSnapshot, initialWeatherDelay, setWeather, updateAtmosphere, WEATHER_KINDS, WEATHER_LABELS } from './weather';
import { canAcceptManualMove, decideCampBehavior, noticeCampOrder, publishCampExpression, refreshCampMind } from '../npc/bridge';
import { campExpression } from '../npc/phrases';
import { applyCampInitialSettings, campSkillMultiplier } from '../settings/runtime';
import { CAMP_DAY_SECONDS, getCampClock, MAX_SIMULATION_TIME } from './clock';
import { advanceLord, createLord, LOCAL_PLAYER_ID, setLordInput } from './lord';
import {canRescue,RESCUE_FOOD_COST} from './triage';
import { syncCampfire } from './campfire';
import { ensureEcology, chooseWildTask, harvestResource, resourceFor, animalFor, threatNear } from '../world/ecology';
import { updateEcology } from '../world/wildlife';
import { insideSettlement } from '../world/settlement';
import { villageActionSpeech } from '../npc/world-context';
import { captureExperiences } from '../npc/experience';
import { protesting } from '../npc/agency';
import { updateCollectives, replyCollective } from '../npc/collectives';
import { advanceRecruitment } from '../npc/recruitment';

export { FEATURE_NAMES, getAllowedActions, getObservation } from './observation';

const STAT_KEYS = ['health', 'energy', 'hunger', 'morale', 'trust', 'fear', 'wetness'] as const;
const WORK_ENERGY: Record<ActionId, number> = {
  wood: .82, food: .58, fire: .1, eat: -.7, rest: -3.9, help: .38, camp: -.14, explore: .98,
};

function addEvent(state: GameState, kind: GameEvent['kind'], text: string, npcId?: Npc['id'], reaction?: ContactReaction) {
  state.events.push({ id: state.nextEventId++, time: state.elapsed, kind, text, ...(npcId ? { npcId } : {}), ...(reaction ? { reaction } : {}) });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

/** This RNG belongs only to non-weather world events. Weather has its own seeded schedule. */
function worldRandom(state: GameState): number {
  let value = state.randomState || 0x6d2b79f5;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.randomState = value >>> 0;
  return state.randomState / 4294967296;
}

export function createGame(options: GameOptions = {}): GameState {
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed!) >>> 0 : 20261012;
  const difficulty = options.difficulty && options.difficulty in DIFFICULTY_CONFIG ? options.difficulty : 'cozy';
  const config = DIFFICULTY_CONFIG[difficulty];
  const scenario = options.scenario === 'storm' || options.scenario === 'conflict' ? options.scenario : 'standard';
  const state: GameState = {
    version: 1, seed, world: createWorldState(seed), lord: createLord(seed), randomState: seed || 0x6d2b79f5, status: 'ready', difficulty, scenario,
    mode: options.mode === 'rules' ? 'rules' : 'model', elapsed: 0, duration: GAME_DURATION, day: 1,
    wood: config.wood, food: config.food, fire: config.wood > 0 ? 100 : 0,
    weather: scenario === 'storm' ? 'storm' : 'clear',
    atmosphere: createAtmosphere(seed, scenario === 'storm' ? 'storm' : 'clear'), shelterIntegrity: 100,
    danger: config.danger + (scenario === 'storm' ? 12 : 0),
    weatherUntil: scenario === 'storm' ? 26 : initialWeatherDelay(seed),
    npcs: NPC_PROFILES.map(profile => createNpc(profile.id, 0, scenario)),
    social: createSocialState(NPC_PROFILES.map(profile => createNpc(profile.id, 0, scenario))),
    events: [], decisions: [], selectedNpc: 'azhuang', priority: 'balanced',
    nextEventId: 1, nextDecisionId: 1, nextWorldEvent: scenario === 'storm' ? 24 : 38,
    stats: { gatheredWood: 0, gatheredFood: 0, meals: 0, helps: 0, modelDecisions: 0, ruleDecisions: 0, fallbackDecisions: 0, totalLatency: 0, taskSwitches: 0 },
    resultReason: '', score: 0,
  };
  // 整份模板先校验，再仅对新局初始化；继续存档不经过这里。
  if (options.npcSettings) applyCampInitialSettings(state, options.npcSettings);
  state.food = Math.max(state.food, foodReserve(state).minimum);
  syncCampfire(state);
  addEvent(state, 'info', scenario === 'storm'
    ? '雨已经落下。备好食物和木材，照顾伙伴并留意避雨。'
    : scenario === 'conflict' ? '大家有些饿了，却都收到了采木指令。看看他们会如何权衡。'
      : `新的一天开始了。照顾${state.npcs.length}位属民，储备口粮，让村寨在每个昼夜继续生活。`);
  return state;
}

function requestReplan(state: GameState, npc: Npc, trigger: DecisionTrigger = 'needs') {
  npc.previousAction = npc.action ?? npc.previousAction ?? null;
  npc.decisionTrigger = trigger;
  if (npc.action !== null) state.stats.taskSwitches++;
  npc.action = null;
  npc.progress = 0;
  npc.actionDuration = 0;
  npc.decisionIn = 0;
  npc.destination = { ...npc.position };
  delete npc.manualTarget;
  delete npc.worldRoute;
  if(!npc.inventory.wood&&!npc.inventory.food)delete npc.wildTask;
}

/** Environment changes request inference without discarding ongoing work or a player's route. */
function requestWeatherReview(npc: Npc, trigger: 'weather' | 'thunder') {
  if (!npc.alive) return;
  // An explicit hunt is a committed player route, like manual movement. Physical needs/threats still interrupt it.
  if(npc.wildTask?.kind==='hunt')return;
  if (npc.action === 'food' && npc.wildTask?.kind === 'gather') return;
  if (npc.decisionTrigger !== 'command' && npc.decisionTrigger !== 'needs') {
    npc.decisionTrigger = trigger;
    npc.previousAction = npc.action ?? npc.previousAction ?? null;
  }
  npc.decisionIn = Math.min(npc.decisionIn, .5);
}

function helpTarget(state: GameState, npc: Npc): Npc | undefined {
  const agreedId = state.social.agreements.find(agreement => agreement.npcId === npc.id && agreement.action === 'help')?.targetId;
  const agreed = state.npcs.find(other => other.id === agreedId && other.id !== npc.id && other.alive && (other.injured || other.health < 65));
  if (agreedId) return agreed;
  return state.npcs.filter((other) => other.alive && other.id !== npc.id && (other.injured || other.health < 65))
    .sort((a, b) => (a.health - Number(a.injured) * 25) - (b.health - Number(b.injured) * 25))[0];
}

function fallbackPolicy(observation: PolicyObservation): PolicyResult {
  const f = observation.features;
  const allowed = observation.allowed;
  let action: ActionId = 'camp';
  if (f[11] < .45 && allowed.includes('fire')) action = 'fire';
  else if (f[0] > .6 && allowed.includes('eat')) action = 'eat';
  else if (f[1] < .3 || f[2] < .65 || f[16] > .5) action = 'rest';
  else if (f[17] < .35 && allowed.includes('help')) action = 'help';
  return {
    action, emotion: f[0] > .8 || f[11] < .2 ? 'worried' : 'calm', source: 'fallback', latencyMs: 0,
    scores: ACTIONS.map((candidate) => Number(candidate === action)), reason: '策略输出无效，已采用安全回退。',
  };
}

function validResult(result: PolicyResult, observation: PolicyObservation): boolean {
  return !!result && ACTIONS.includes(result.action) && observation.allowed.includes(result.action)
    && EMOTIONS.includes(result.emotion) && Array.isArray(result.scores) && result.scores.length === ACTIONS.length
    && result.scores.every(Number.isFinite) && ['model', 'rules', 'fallback'].includes(result.source)
    && Number.isFinite(result.latencyMs) && result.latencyMs >= 0;
}

function applyEmotion(npc: Npc, emotion: Emotion) {
  // MLP 的五种情绪只负责渲染投影。不能每次输出“开心”就奖励信任、洗掉怨恨。
  npc.emotion = emotion;
}

function startAction(state: GameState, npc: Npc, action: ActionId) {
  npc.action = action;
  npc.progress = 0;
  npc.actionDuration = ACTION_DURATIONS[action];
  const carrying = npc.inventory.wood > 0 || npc.inventory.food > 0;
  if(!carrying){
    delete npc.wildTask;
    if(['wood','food','explore'].includes(action)){
      if(chooseWildTask(state,npc))return;
      npc.action='camp';npc.actionDuration=ACTION_DURATIONS.camp;
    }
  }
  npc.destination = projectToWalkable(getTaskDestination(npc.action!, npc.id, carrying, helpTarget(state, npc)?.position), true, npc.position);
}

function makeDecision(state: GameState, npc: Npc, policy: PolicyFunction) {
  const agreement = getSocialAgreement(state, npc);
  const observation = getObservation(state, npc);
  const weather = getWeatherSnapshot(state, npc);
  const trigger = npc.decisionTrigger ?? 'routine';
  const previousAction = npc.action ?? npc.previousAction ?? null;
  let result: PolicyResult;
  let valid = true;
  try {
    result = agreement ? {
      action: agreement.action, emotion: agreement.action === 'help' ? 'caring' : 'calm',
      source: 'rules', latencyMs: 0, scores: ACTIONS.map(action => Number(action === agreement.action)),
      reason: `执行与玩家商定的一轮「${ACTION_LABELS[agreement.action]}」；身体、天气与任务条件仍需满足。`,
    } : policy(structuredClone(observation));
    if (!validResult(result, observation)) {
      result = fallbackPolicy(observation);
      valid = false;
    }
  } catch {
    result = { ...fallbackPolicy(observation), reason: '策略推理失败，已采用安全回退。' };
    valid = false;
  }
  result = decideCampBehavior(state, npc, result, observation.allowed).result;
  if (npc.action !== result.action) {
    if (npc.action !== null) state.stats.taskSwitches++;
    startAction(state, npc, result.action);
    if (npc.action !== result.action) result = { ...result, action: npc.action!, source: 'rules',
      reason: '没有可用的采集目标，先返回村寨重新安排。' };
  }
  const executionOverride = /生存库存|全员补足|先完成手中物资/.test(result.reason ?? '');
  const actionSpeech = villageActionSpeech(state, npc, result.action, executionOverride);
  if (agreement && result.action !== agreement.action) cancelSocialAgreement(state, npc.id);
  const command = npc.command;
  // Explicit recall remains an intent until replaced by a new assignment or agreement.
  const keepCampIntent = command === 'camp' && !agreement;
  const accepted = valid && (command === null || command === result.action);
  let reason = result.reason;
  const reacting = (npc.collision?.reactionUntil ?? 0) > state.elapsed;
  if (!reacting) {
    applyEmotion(npc, result.emotion);
    npc.speech = executionOverride ? actionSpeech : campExpression(npc, actionSpeech);
    npc.speechUntil = state.elapsed + 4.5;
  }
  // A continuing intent is not another player order: acknowledge it only once.
  if (command !== null && (!keepCampIntent || trigger === 'command')) {
    if (result.action === command) {
      const protesting = npc.mind && ['refuse', 'recruit', 'strike'].includes(npc.mind.intent.kind);
      addEvent(state, 'info', protesting && command === 'camp' ? `${npc.name}先回安全集合区，原有停工立场并未改变。`
        : `${npc.name}开始执行「${ACTION_LABELS[command]}」的安排。`, npc.id);
    } else {
      npc.refusals++;
      // 是否受冒犯已由原始命令/诉求事件评价，执行“不接受”不能再重复扣一次信任。
      const refusal = executionOverride ? actionSpeech : campExpression(npc, npc.hunger > 72 ? '我得先顾好肚子。' : npc.energy < 22 ? '我需要先恢复一点体力。'
        : npc.fear > 55 ? '那里让我有些担心。' : '我想先处理眼前更紧急的事。');
      if (!reacting) npc.speech = refusal;
      reason = `${result.reason ?? refusal}选择了「${ACTION_LABELS[result.action]}」。`;
      addEvent(state, 'warning', `${npc.name}暂未接受安排：${reason}`, npc.id);
    }
  }
  if (!keepCampIntent) npc.command = null;
  const latencyMs = Math.min(result.latencyMs, 10000);
  const source = result.source;
  if (source === 'model') state.stats.modelDecisions++;
  else if (source === 'rules') state.stats.ruleDecisions++;
  else state.stats.fallbackDecisions++;
  state.stats.totalLatency += latencyMs;
  state.decisions.push({
    id: state.nextDecisionId++, time: state.elapsed, npcId: npc.id, source,
    action: result.action, emotion: result.emotion, scores: [...result.scores],
    features: [...observation.features], allowed: [...observation.allowed], latencyMs, accepted,
    featureVersion: FEATURE_VERSION, trigger, previousAction, weather,
    ...(reason ? { reason: reason.slice(0, 200) } : {}),
  });
  if (state.decisions.length > MAX_DECISIONS) state.decisions.splice(0, state.decisions.length - MAX_DECISIONS);
  if (trigger === 'weather' || trigger === 'thunder') {
    const context = trigger === 'thunder' ? '雷声响起后' : `${WEATHER_LABELS[state.weather]}天气里`;
    addEvent(state, 'info', `${context}，${npc.name}重新观察后${previousAction === result.action ? '继续' : '选择'}「${ACTION_LABELS[result.action]}」。`, npc.id);
  }
  npc.decisionIn = 1;
  delete npc.decisionTrigger;
  delete npc.previousAction;
}

function finishAction(npc: Npc, completed = true) {
  if (completed) npc.completedTasks++;
  npc.previousAction = npc.action;
  npc.action = null;
  npc.progress = 0;
  npc.actionDuration = 0;
  npc.decisionIn = .6;
  npc.destination = { ...npc.position };
  delete npc.wildTask;
  delete npc.worldRoute;
}

function depositSupplies(state: GameState, npc: Npc) {
  const wood = Math.min(npc.inventory.wood, 100 - state.wood);
  const food = Math.min(npc.inventory.food, 100 - state.food);
  state.wood += wood;
  state.food += food;
  state.stats.gatheredWood += wood;
  state.stats.gatheredFood += food;
  if (wood > 0 || food > 0) {
    const items = [wood > 0 ? `${wood}份木材` : '', food > 0 ? `${food}份食物` : ''].filter(Boolean).join('和');
    addEvent(state, 'good', `${npc.name}把${items}送到仓库，已经入库。`, npc.id);
    npc.morale += 1.5;
  }
  npc.inventory = { wood: 0, food: 0 };
}

function returnWithSupplies(npc: Npc) {
  npc.destination = getTaskDestination('camp', npc.id, true);
  npc.progress = 0;
  npc.actionDuration = npc.wildTask?.meat ? 4 : 1.1;
  if(npc.wildTask)npc.wildTask.phase='return';
  delete npc.worldRoute;
  npc.speech = '收获不错，我把东西送回仓库。';
}

function completeAction(state: GameState, npc: Npc) {
  const action = npc.action;
  if (action === null) return;
  if (['wood', 'food', 'explore'].includes(action) && (npc.inventory.wood > 0 || npc.inventory.food > 0)) {
    depositSupplies(state, npc);
    recordSocialAction(state, npc, action);
    finishAction(npc);
    return;
  }
  switch (action) {
    case 'wood':
    case 'food':
      if(harvestResource(state,npc)>0)returnWithSupplies(npc);else finishAction(npc,false);
      return;
    case 'explore': {
      if(npc.wildTask?.kind==='hunt'){
        const animal=animalFor(state,npc);
        if(animal&&animal.health>0&&distance(npc.position,animal.position)<8&&worldCanTraverse(npc.position,animal.position,state.seed,state.world?.gateOpen??true)){
          animal.health=0;animal.mode='dead';animal.respawnAt=state.elapsed+(animal.species==='boar'?1200:720);
          npc.inventory.food=4;npc.wildTask.meat=true;
          addEvent(state,'good',`${npc.name}猎获${npc.wildTask.label}，正在带回寨内处理。`,npc.id);
          returnWithSupplies(npc);
        }else finishAction(npc,false);
      }else if(harvestResource(state,npc)>0){
        addEvent(state,'good',`${npc.name}在寨外发现${npc.wildTask?.label}，带回真实收获。`,npc.id);returnWithSupplies(npc);
      }else finishAction(npc,false);
      return;
    }
    case 'fire':
      finishAction(npc, false);
      return;
    case 'eat':
      if (state.food < 1) {
        addEvent(state, 'warning', `${npc.name}没领到食物，需要先补充仓库口粮。`, npc.id);
        finishAction(npc, false);
        return;
      }
      state.food--;
      state.stats.meals++;
      npc.hunger -= MEAL_RELIEF;
      npc.energy += 8;
      npc.health += 3;
      npc.morale += 4;
      addEvent(state, 'good', `${npc.name}吃了一份食物，重新有了精神。`, npc.id);
      break;
    case 'help': {
      const target = helpTarget(state, npc);
      if (!target || distance(npc.position, target.position) > 3.5) {
        finishAction(npc, false);
        return;
      }
      target.health = clamp(target.health + 23);
      target.energy = clamp(target.energy + 9);
      target.fear = clamp(target.fear - 18);
      target.morale = clamp(target.morale + 8);
      // 治疗的功劳属于实际出手的同伴；recordSocialAction 会更新双方关系。
      // 此处不奖励对玩家的权威信任，避免玩家未参与也能靠自主互助洗掉失信。
      target.injured = false;
      npc.energy -= 3;
      npc.morale += 6;
      state.stats.helps++;
      addEvent(state, 'good', `${npc.name}照顾了${target.name}，队伍更有底气了。`, npc.id);
      recordSocialAction(state, npc, 'help', target.id);
      break;
    }
    case 'rest':
      npc.energy += 4;
      npc.fear -= 5;
      if (npc.hunger < 75) npc.health += 3;
      if (npc.health >= 80) npc.injured = false;
      if (npc.inventory.wood > 0 || npc.inventory.food > 0) depositSupplies(state, npc);
      if (getWeatherSnapshot(state, npc).shelterDistance === 0 && state.shelterIntegrity < 98) {
        state.shelterIntegrity = clamp(state.shelterIntegrity + 2);
        addEvent(state, 'good', `${npc.name}歇脚时检查了屋舍遮雨处，村寨的屋顶更稳了。`, npc.id);
      }
      break;
    case 'camp':
      npc.energy += 2;
      npc.fear -= 3;
      if (npc.inventory.wood > 0 || npc.inventory.food > 0) depositSupplies(state, npc);
      break;
  }
  if (action !== 'help') recordSocialAction(state, npc, action);
  finishAction(npc);
}

function updateNpcNeeds(state: GameState, npc: Npc, dt: number) {
  const config = DIFFICULTY_CONFIG[state.difficulty];
  const previousHunger = npc.hunger;
  const sheltered = isAtCamp(npc);
  const weather = getWeatherSnapshot(state, npc);
  const covered = weather.shelterDistance === 0;
  const drying = covered ? (2.3 + Number(npc.action === 'rest') * 1.2) * (1 - weather.exposure)
    : weather.rainIntensity < .1 ? .42 : .06;
  npc.wetness = clamp(npc.wetness + (weather.rainIntensity * weather.exposure * 3.1 - drying) * dt);
  const activeWork = npc.action === 'wood' || npc.action === 'food' || npc.action === 'explore';
  npc.hunger += (config.hungerRate + (activeWork ? .045 : 0)) * dt;
  npc.energy -= .035 * dt;
  npc.energy -= (npc.wetness / 100 * .14 + weather.rainIntensity * weather.windStrength * .12) * weather.exposure * dt;
  if (npc.hunger >= 88) npc.health -= .46 * config.damage * dt;
  if (npc.energy < 3) npc.health -= .12 * config.damage * dt;
  if (npc.injured) npc.health -= .025 * dt;
  if (sheltered && npc.hunger < 60) npc.health += .04 * dt;
  const weatherFear = (weather.stormRisk * 24 + weather.windStrength * 5 + npc.wetness * .08) * weather.exposure * (1 - npc.personality.bravery * .45);
  const desiredFear = (sheltered ? 5 : state.danger * (1 - npc.personality.bravery * .62)) + weatherFear;
  npc.fear += (desiredFear - npc.fear) * (sheltered ? .10 : .045) * dt;
  npc.morale += ((sheltered ? .035 : 0) - (npc.hunger > 72 ? .09 : 0) - (npc.energy < 18 ? .07 : 0)) * dt;
  if (previousHunger < 80 && npc.hunger >= 80) {
    addEvent(state, 'warning', `${npc.name}已经很饿了，尽快让他吃点东西。`, npc.id);
    if (npc.action !== 'eat' && !(npc.action === 'food' && npc.wildTask?.kind === 'gather' && state.food < 1)) requestReplan(state, npc);
  }
}

/** Collision outcomes belong to the deterministic engine, never to rendering or audio. */
function applyContacts(state: GameState, npc: Npc, contacts: CollisionContact[]): boolean {
  let interrupted = false;
  for (const contact of [...contacts].sort((a, b) => Number(!!TERRAIN.find(object => object.id === b.objectId)?.hazard)
    - Number(!!TERRAIN.find(object => object.id === a.objectId)?.hazard))) {
    const object = TERRAIN.find(candidate => candidate.id === contact.objectId);
    const hazard = object?.hazard;
    const impact = contact.kind === 'rock' && contact.impactSpeed >= 5.5 && !contact.initialOverlap;
    const harmful = !!hazard || impact;
    if (!harmful && contact.impactSpeed < 1.5) continue;
    const collision = npc.collision ??= { hurtUntil: 0, reactionUntil: 0, objectCooldowns: {} };
    const objectReady = state.elapsed >= (collision.objectCooldowns[contact.objectId] ?? 0);
    let damage = 0;
    if (harmful) {
      // A safe reflex happens even during invulnerability: cooldown is not permission to remain in fire/water.
      requestReplan(state, npc);
      npc.position = projectToWalkable({
        x: contact.point.x + contact.normal.x * 2,
        y: contact.point.y + contact.normal.y * 2,
      }, true, npc.position, .2);
      npc.destination = { ...npc.position };
      npc.decisionIn = 1;
      interrupted = true;
      if (objectReady && state.elapsed >= collision.hurtUntil) {
        damage = (hazard?.damage ?? 2) * DIFFICULTY_CONFIG[state.difficulty].damage;
        npc.health -= damage;
        npc.fear += hazard?.fear ?? 3;
        npc.energy -= hazard?.energy ?? 1;
        npc.morale -= hazard ? 2 : 1;
        npc.injured ||= hazard?.injury ?? true;
        collision.hurtUntil = state.elapsed + 1;
        collision.objectCooldowns[contact.objectId] = state.elapsed + (hazard?.cooldown ?? 2.5);
      }
    } else if (npc.manualTarget && contact.kind !== 'npc') {
      // Clicking a trunk, box or tent means walking up to its boundary, not pushing forever.
      requestReplan(state, npc);
      npc.decisionIn = .6;
      interrupted = true;
    }
    const kind = hazard?.kind ?? (impact ? 'impact' : 'bump');
    const intensity = clamp(harmful ? .25 + damage / 12 : .16, 0, 1);
    // Animation records every actual injury even when speech is still cooling down.
    if (damage > 0) collision.lastHit = { kind, objectId: contact.objectId, time: state.elapsed, intensity, damage };
    if ((!objectReady || (harmful && damage === 0)) || state.elapsed < collision.reactionUntil) continue;
    const index = npc.id === 'azhuang' ? 0 : npc.id === 'xiaomi' ? 1 : 2;
    const utterance = hazard?.speech[index] ?? (impact
      ? ['哎哟！膝盖撞上石头了，真疼！', '啊！被石头磕到了……得慢一点。', '嘶，撞到岩石了，大家看着脚下。'][index]
      : contact.kind === 'npc' ? ['借过一下，别挤！', '哎，稍微让一让好吗？', '慢点，咱们一个个走。'][index]
        : `哎，${object?.label ?? '前面'}挡住了，得绕一下。`);
    collision.reactionUntil = state.elapsed + (harmful ? 3.4 : 3);
    collision.objectCooldowns[contact.objectId] = Math.max(collision.objectCooldowns[contact.objectId] ?? 0, collision.reactionUntil);
    collision.lastHit = { kind, objectId: contact.objectId, time: state.elapsed, intensity, damage };
    npc.emotion = kind === 'burn' || kind === 'water' ? 'worried' : 'annoyed';
    npc.speech = utterance;
    npc.speechUntil = state.elapsed + 3.4;
    addEvent(state, harmful ? 'danger' : 'info', `${npc.name}：${utterance}`, npc.id,
      { kind, objectId: contact.objectId, intensity, utterance });
  }
  return interrupted;
}

function updateNpcAction(state: GameState, npc: Npc, dt: number, policy: PolicyFunction) {
  if (advanceAppointment(state,npc,dt)) return;
  if (advanceRecruitment(state,npc,dt)) return;
  npc.decisionIn = Math.max(0, npc.decisionIn - dt);
  const outside=!insideSettlement(npc.position.x,npc.position.y);
  const threat=outside?threatNear(state,npc.position):undefined;
  const facingOwnBoar=npc.wildTask?.kind==='hunt'&&npc.wildTask.phase!=='return'&&animalFor(state,npc)?.species==='boar'
    &&npc.personality.bravery>.7&&npc.health>65&&npc.energy>30;
  const immediateThreat=threat&&!(facingOwnBoar&&threat.id===npc.wildTask?.targetId);
  if(!npc.manualTarget&&outside&&npc.action!=='camp'&&npc.action!=='help'&&(immediateThreat||npc.energy<18||npc.injured&&!facingOwnBoar||npc.health<35)){
    const reason=threat?'附近有猛兽，先撤回寨里！':'体力不足，先回寨休整。';
    requestReplan(state,npc);startAction(state,npc,'camp');npc.decisionIn=20;npc.speech=reason;npc.speechUntil=state.elapsed+5;
    if(threat)addEvent(state,'warning',`${npc.name}：${reason}`,npc.id);
  }
  const returning = npc.action !== null && (npc.inventory.wood > 0 || npc.inventory.food > 0);
  if (!outside && !npc.manualTarget && !returning && ['wood', 'food', 'explore'].includes(npc.action ?? '')
    && (npc.injured || npc.health <= 35 || npc.energy < 18)) requestReplan(state, npc);
  // Stock depletion is a world-level need, even for someone currently idling or walking to a wood job.
  // Do not restart meals, aid, or an already committed food trip on every tick.
  if (!npc.manualTarget && !returning && !['food', 'eat', 'help'].includes(npc.action ?? '')
    && !(npc.action === 'explore' && npc.wildTask)
    && !immediateThreat && needsFoodGatherer(state, npc) && !(state.agency?.enabled && protesting(npc))) requestReplan(state, npc);
  if(returning){npc.destination=getTaskDestination('camp',npc.id,true);if(npc.wildTask)npc.wildTask.phase='return';}
  if (!npc.manualTarget && !returning && npc.action !== null
    && state.social.agreements.some(agreement => agreement.npcId === npc.id)
    && !getSocialAgreement(state, npc)) requestReplan(state, npc, 'needs');
  if (!npc.manualTarget && !returning && (npc.action === null || npc.decisionTrigger) && npc.decisionIn <= 0) makeDecision(state, npc, policy);
  if(!npc.manualTarget&&!returning&&npc.action&&['wood','food','explore'].includes(npc.action)){
    if(!npc.wildTask){npc.progress=0;if(!chooseWildTask(state,npc)){finishAction(npc,false);return;}}
    const task=npc.wildTask!;
    if(task.kind==='hunt'){
      const animal=animalFor(state,npc);
      if(!animal||animal.health<=0||state.elapsed-task.startedAt>90){finishAction(npc,false);return;}
      // Stalking/short throwing range, rather than requiring a faster animal to stand still.
      const d=distance(npc.position,animal.position);
      if(d>7||!worldCanTraverse(npc.position,animal.position,state.seed,state.world?.gateOpen??true))npc.destination={...animal.position};else npc.destination={...npc.position};
    }else if(!resourceFor(state,npc)?.remaining){finishAction(npc,false);return;}
  }
  const gateBlocked=state.world?.gateOpen===false&&insideSettlement(npc.position.x,npc.position.y)!==insideSettlement(npc.destination.x,npc.destination.y);
  if(gateBlocked&&!npc.manualTarget){npc.speech='寨门关着，等待开门再通行。';npc.speechUntil=state.elapsed+2;return;}
  let withinCareReach = false;
  if (!npc.manualTarget && npc.action === 'help') {
    const target = helpTarget(state, npc);
    if (!target) {
      finishAction(npc, false);
      return;
    }
    npc.destination = projectToWalkable(getTaskDestination('help', npc.id, false, target.position), true, npc.position);
    // 治疗只要求真正走到伤者身边，不要求踩中固定偏移的一个像素。目标周围
    // 有其他伙伴时避人转向会永远绕过那个点；到达现有3.5治疗半径即可站定。
    // 同时要求静态导航可直达，避免隔着帐篷/岩石也能隔空治疗。
    withinCareReach = distance(npc.position, target.position) <= 3.5 && findRoute(npc.position, target.position, true).length === 1;
  }
  const manual = !!npc.manualTarget;
  const weather = getWeatherSnapshot(state, npc);
  const weatherSpeed = 1 - weather.wetness / 100 * weather.rainIntensity * .13 - weather.windStrength * weather.exposure * .06;
  const speed = MOVE_SPEED * (npc.injured ? .72 : 1) * (npc.energy < 12 ? .72 : 1) * weatherSpeed;
  const active = manual || npc.action !== null && !withinCareReach;
  const motion = moveWorldBody(npc, npc.manualTarget ?? npc.destination, active ? speed : 0, dt, state.npcs, state.seed, manual,state.world?.gateOpen??true);
  npc.position = motion.position;
  if (applyContacts(state, npc, motion.contacts)) return;
  const travelTime = Math.min(dt, motion.distanceMoved / speed);
  npc.energy -= travelTime * .23;
  if(npc.wildTask&&!returning){
    npc.wildTask.stalledFor=motion.distanceMoved<.01&&!motion.arrived?npc.wildTask.stalledFor+dt:0;
    if(npc.wildTask.stalledFor>8){finishAction(npc,false);return;}
    npc.wildTask.phase=motion.arrived?'work':'travel';
    if(!motion.arrived)npc.progress=Math.max(0,npc.progress-dt*.08);
  }
  if (manual) {
    if (motion.arrived) {
      delete npc.manualTarget;
      npc.destination = { ...npc.position };
      npc.decisionIn = .6;
    }
    return;
  }
  if (!npc.action || !motion.arrived && !withinCareReach) return;
  const workTime = Math.max(0, dt - travelTime);
  if (workTime <= 0) return;
  const action = npc.action;
  // 磨洋工是真实的低投入：同样的时间完成得更少，也不会凭空消耗完整劳动体力。
  const effort = ['wood', 'food', 'fire', 'help', 'explore'].includes(action) ? npc.actionEffort ?? 1 : 1;
  npc.energy -= WORK_ENERGY[action] * workTime * effort;
  if (action === 'rest' && npc.hunger < 75) npc.health += .55 * workTime;
  const diligence = action === 'wood' || action === 'food' || action === 'explore' ? .9 + npc.personality.diligence * .2 : 1;
  npc.progress = clamp(npc.progress + workTime * diligence * effort * campSkillMultiplier(npc, action) / Math.max(.1, npc.actionDuration), 0, 1);
  if (npc.progress >= 1) completeAction(state, npc);
}

function worldEvent(state: GameState) {
  // Consume a fixed number of random values regardless of NPC positions or policy choices.
  const kind = worldRandom(state);
  worldRandom(state);
  worldRandom(state);
  const nextDelay = worldRandom(state);
  state.nextWorldEvent = state.elapsed + 27 + nextDelay * 14;
  if (kind < .56) {
    addEvent(state, 'info', '林间响起虫鸣，队员们继续留意周围。');
  } else if (kind < .85) {
    const target=state.npcs.find(n=>n.alive&&threatNear(state,n.position));
    addEvent(state,target?'danger':'info',target?'附近发现猛兽，寨外队员正在避让。':'远处传来林间动物的动静，近郊采集路线暂时安全。');
    // Actual animal movement/contact owns fear, retreat and injury. Sound cannot create a phantom attack.
  } else {
    state.danger = clamp(state.danger - 12);
    addEvent(state, 'good', '林间的动静渐渐远去，四周暂时安静下来。');
    for (const npc of state.npcs) if (npc.alive) npc.morale = clamp(npc.morale + 3);
  }
}

function updateWorld(state: GameState, dt: number) {
  const weatherEvent = updateAtmosphere(state, dt);
  if (weatherEvent.changed) {
    const text = state.weather === 'storm' ? '乌云压低，雷雨接近。留意避雨和伙伴的体力。'
      : state.weather === 'rain' ? '雨落下来了，露天的衣服会淋湿，需要留意避雨。'
        : state.weather === 'wind' ? '一阵山风穿过村寨，树梢和屋檐下的灯笼轻轻摇晃。'
          : '云层正在散开，风雨渐渐减弱。';
    addEvent(state, state.weather === 'clear' ? 'good' : 'warning', text);
    for (const npc of state.npcs) requestWeatherReview(npc, 'weather');
  }
  if (weatherEvent.lightning) {
    addEvent(state, 'warning', '一道闪电照亮树林，雷声让队员们小心留意周围。');
    for (const npc of state.npcs) {
      if (!npc.alive) continue;
      const weather = getWeatherSnapshot(state, npc);
      const proximity = 1 - Math.min(1, distance(npc.position, state.atmosphere.lightningPoint!) / 75);
      const startle = (5 + proximity * 8) * (.3 + weather.exposure * .7) * (1 - npc.personality.bravery * .45);
      npc.fear = clamp(npc.fear + startle);
      npc.energy = clamp(npc.energy - .4 * weather.exposure);
      requestWeatherReview(npc, 'thunder');
    }
  }
  if (state.elapsed >= state.nextWorldEvent) worldEvent(state);
  const config = DIFFICULTY_CONFIG[state.difficulty];
  const { rainIntensity, windStrength, stormRisk } = state.atmosphere;
  state.shelterIntegrity = clamp(state.shelterIntegrity - (windStrength ** 2 * .055 + rainIntensity * .035 + stormRisk * .02) * dt, 35, 100);
  const night = getCampClock(state.elapsed).isNight;
  const dangerFloor = config.danger + (night ? 7 : 0);
  const wildlifeThreat=state.npcs.some(n=>n.alive&&threatNear(state,n.position));
  state.danger = clamp(dangerFloor+(wildlifeThreat?45:0));
}

function calculateScore(state: GameState): number {
  const survivors = state.npcs.filter((npc) => npc.alive);
  const wellbeing = survivors.reduce((sum, npc) => sum + npc.health * 2 + npc.morale, 0);
  return Math.round(Math.max(0, survivors.length * 200 + wellbeing
    + state.elapsed / CAMP_DAY_SECONDS * 400 + state.wood * 7 + state.food * 12
    + state.stats.gatheredWood * 8 + state.stats.gatheredFood * 12 + state.stats.helps * 60));
}

function recordDeaths(state: GameState) {
  for (const npc of state.npcs) {
    if (npc.alive && npc.health > 0) continue;
    if (npc.alive) addEvent(state, 'danger', `${npc.name}去世了。村寨与其他属民的生活仍在继续。`, npc.id);
    npc.alive = false;
    npc.health = 0;
    npc.action = null;
    npc.command = null;
    npc.progress = 0;
    npc.actionDuration = 0;
    npc.destination = { ...npc.position };
    delete npc.manualTarget;
    delete npc.worldRoute;
  }
}

/** Pure public transition. dt is game-time seconds; physics uses bounded deterministic substeps. */
export function advanceGame(state: GameState, dt: number, policy: PolicyFunction): GameState {
  const next = structuredClone(state);
  return advanceOwnedGame(next, dt, policy);
}

/** Replay the original 100ms transitions while copying the input only once. */
export function advanceGameSteps(state: GameState, steps: number, policy: PolicyFunction): GameState {
  if (!Number.isSafeInteger(steps) || steps < 0) throw new RangeError('Invalid simulation step count');
  const next = structuredClone(state);
  for (let index = 0; index < steps && next.status === 'playing'; index++) advanceOwnedGame(next, .1, policy);
  return next;
}

/** Mutates only a private copy owned by the current transition or replay batch. */
function advanceOwnedGame(next: GameState, dt: number, policy: PolicyFunction): GameState {
  syncCampfire(next);
  if (next.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return next;
  // Death belongs to the character; it never stops the world or other characters.
  recordDeaths(next);
  let remaining = Math.min(dt, Math.max(0, MAX_SIMULATION_TIME - next.elapsed));
  next.world??=createWorldState(next.seed);ensureEcology(next);
  while (remaining > 1e-9 && next.status === 'playing') {
    const step = Math.min(.25, remaining);
    next.elapsed = Math.round((next.elapsed + step) * 1e3) / 1e3;
    next.day = getCampClock(next.elapsed).day;
    updateWorld(next, step);
    updateEcology(next);
    // Deadlines apply before this step's work. Late delivery still credits real
    // supplies, but cannot claim that an expired commitment was completed on time.
    updateSocial(next);
    updateAppointments(next);
    for (const npc of next.npcs) {
      if (!npc.alive) continue;
      updateNpcNeeds(next, npc, step);
      if (npc.health > 0) updateNpcAction(next, npc, step, policy);
      for (const stat of STAT_KEYS) npc[stat] = clamp(npc[stat]);
    }
    recordDeaths(next);
    advanceLord(next, step);
    separateWorldNpcs(next.npcs,next.seed,next.world?.gateOpen??true);
    updateWorldExploration(next);
    syncCampfire(next);
    captureExperiences(next);
    updateCollectives(next);
    remaining -= step;
  }
  next.score = calculateScore(next);
  return next;
}

export function issueCommand(state: GameState, command: GameCommand): GameState {
  const next = issueOwnedCommand(state, command);
  if (next !== state) captureExperiences(next);
  return next;
}
function issueOwnedCommand(state: GameState, command: GameCommand): GameState {
  const next = structuredClone(state);
  if(command.type==='collective-reply'){
    if(['playing','paused'].includes(next.status)&&command.groupId!==undefined&&command.choiceId&&['listen','rest','food','fairness','refuse'].includes(command.choiceId))replyCollective(next,command.groupId,command.choiceId as 'listen'|'rest'|'food'|'fairness'|'refuse');
    return next;
  }
  syncCampfire(next);
  if(command.type === 'gate-toggle') {
    if(next.status!=='playing'&&next.status!=='paused')return next;
    const world=next.world??=createWorldState(next.seed),open=world.gateOpen??true;
    const occupied=[...next.npcs.filter(n=>n.alive),...(next.lord?[next.lord]:[])].some(n=>Math.abs(n.position.x-50)<12&&Math.abs(n.position.y-205)<12);
    if(open&&occupied){addEvent(next,'info','寨门附近有人，请等通道清空后再关门。');return next;}
    world.gateOpen=!open;world.revision++;
    for(const person of next.npcs)delete person.worldRoute;
    addEvent(next,'info',open?'寨门已关闭。':'寨门已打开。');
    return next;
  }
  if(command.type === 'lord-input') {
    if(command.playerId !== undefined && command.playerId !== LOCAL_PLAYER_ID) return next;
    next.lord ??= createLord(next.seed);
    setLordInput(next.lord, next.status === 'playing' ? command.direction : undefined);
    return next;
  }
  const npc = next.npcs.find((candidate) => candidate.id === (command.npcId ?? next.selectedNpc));
  if (command.type === 'select') {
    if (npc) next.selectedNpc = npc.id;
    return next;
  }
  if (command.type === 'priority') {
    if (command.priority && ['balanced', 'wood', 'food'].includes(command.priority)) {
      next.priority = command.priority;
      if (next.status === 'playing' || next.status === 'paused') addEvent(next, 'info', command.priority === 'balanced' ? '村寨恢复均衡安排，口粮不足时仍先补粮。' : `村寨优先补充${command.priority === 'wood' ? '木材' : '食物'}，生存口粮优先保障。`);
    }
    return next;
  }
  if (next.status !== 'playing' && next.status !== 'paused') return next;
  if (command.type === 'social-open' || command.type === 'social-reply' || command.type === 'social-chat') {
    handleSocialCommand(next, command);
    next.score = calculateScore(next);
    return next;
  }
  if (command.type === 'weather') {
    if (!command.weather || !WEATHER_KINDS.includes(command.weather) || command.weather === next.weather) return next;
    setWeather(next, command.weather);
    for (const member of next.npcs) requestWeatherReview(member, 'weather');
    addEvent(next, 'info', `你让天气转为${WEATHER_LABELS[command.weather]}。队员会观察变化后自行决定下一步。`);
    return next;
  }
  if (command.type === 'recall') {
    for (const member of next.npcs) {
      if (!member.alive) continue;
      cancelSocialAgreement(next, member.id);
      member.command = 'camp';
      member.lastInteraction = Math.max(.001, next.elapsed);
      requestReplan(next, member, 'command');
      member.speech = '收到召回指令。';
      member.speechUntil = next.elapsed + 3;
    }
    addEvent(next, 'info', '你发出了全队召回指令。队员正在重新安排路线。');
    return next;
  }
  if (!npc || !npc.alive) return next;
  if(command.type==='hunt'){
    if(!['playing','paused'].includes(next.status))return next;
    if(npc.inventory.wood||npc.inventory.food||npc.health<60||npc.energy<55||npc.hunger>65||npc.injured||!canAcceptManualMove(next,npc)){
      addEvent(next,'warning',`${npc.name}暂不适合狩猎，请先送回物资、进食或休整。`,npc.id);return next;
    }
    if(next.world?.gateOpen===false){addEvent(next,'warning','寨门关闭，暂时不能安排外出狩猎。',npc.id);return next;}
    cancelSocialAgreement(next,npc.id);requestReplan(next,npc,'command');
    npc.command=null;npc.action='explore';npc.actionDuration=7;
    if(!chooseWildTask(next,npc,true)){finishAction(npc,false);addEvent(next,'info','附近暂时没有适合狩猎的猎物。',npc.id);return next;}
    delete npc.decisionTrigger;npc.decisionIn=100;
    npc.speech=`我去寨外追踪${npc.wildTask?.label}，遇险就返回。`;npc.speechUntil=next.elapsed+5;
    addEvent(next,'info',`${npc.name}开始寨外狩猎。`,npc.id);return next;
  }
  if(command.type==='rescue'){
    if(!canRescue(npc))return next;
    if(next.food<RESCUE_FOOD_COST){addEvent(next,'warning',`救治需要 ${RESCUE_FOOD_COST} 份食物，仓库口粮不足。`,npc.id);return next;}
    next.food-=RESCUE_FOOD_COST;npc.health=40;npc.hunger=clamp(npc.hunger-45);npc.energy=Math.max(25,npc.energy);npc.injured=false;
    npc.speech='好多了，谢谢你及时照顾我。';npc.speechUntil=next.elapsed+4;
    next.stats.helps++;requestReplan(next,npc,'command');addEvent(next,'good',`你救治了濒死的${npc.name}。`,npc.id);return next;
  }
  if (command.type === 'move') {
    const target = command.target;
    if (!target || !validPoint(target)) return next;
    if (!canAcceptManualMove(next, npc)) {
      publishCampExpression(next, npc, npc.inventory.wood || npc.inventory.food ? '先把手里的物资送回去，不能半路丢下。' : '我现在不接受这个移动安排。');
      addEvent(next, 'warning', `${npc.name}没有接受移动要求：当前休息、停工或返送物资仍在继续。`, npc.id);
      return next;
    }
    cancelSocialAgreement(next, npc.id);
    requestReplan(next, npc, 'command');
    npc.command = null;
    npc.manualTarget = { ...target };
    npc.destination = projectToWalkable(npc.manualTarget, false, npc.position);
    npc.speech = '我过去看看，脚下会留神。';
    npc.speechUntil = next.elapsed + 2;
    npc.lastInteraction = Math.max(.001, next.elapsed);
    return next;
  }
  if (command.type === 'assign') {
    if (command.action === 'fire') return next;
    if (command.action !== null && (!command.action || !ACTIONS.includes(command.action))) return next;
    cancelSocialAgreement(next, npc.id);
    noticeCampOrder(next, npc, command.action ?? null);
    npc.command = command.action;
    // Zero means no interaction yet; preserve the cooldown when paused at the start.
    npc.lastInteraction = Math.max(.001, next.elapsed);
    if (!npc.inventory.wood && !npc.inventory.food) requestReplan(next, npc, 'command');
    addEvent(next, 'info', command.action ? `你请${npc.name}「${ACTION_LABELS[command.action]}」。` : `${npc.name}恢复自主安排。`, npc.id);
    return next;
  }
  if (npc.lastInteraction > 0 && next.elapsed - npc.lastInteraction < 3) {
    npc.speech = '听到了，让我先回应一下。';
    npc.speechUntil = next.elapsed + 2;
    return next;
  }
  if (command.type === 'feed') {
    if (next.food < 1) {
      addEvent(next, 'warning', '仓库没有可分配的食物，需要先出寨采集。', npc.id);
      return next;
    }
    if (npc.hunger < 10) {
      npc.speech = '我还不饿，把这份留给需要的人吧。';
      npc.speechUntil = next.elapsed + 3;
      return next;
    }
    next.food--;
    next.stats.meals++;
    npc.hunger -= MEAL_RELIEF;
    npc.energy += 8;
    npc.health += 4;
    npc.morale += 6;
    npc.trust += 4;
    npc.emotion = 'happy';
    npc.speech = '谢谢，这份食物来得正好。';
    if (npc.action === 'eat') requestReplan(next, npc);
    addEvent(next, 'good', `你给${npc.name}分了一份食物。`, npc.id);
    recordSocialInteraction(next, npc, 'feed');
  } else if (command.type === 'praise') {
    npc.fear -= 6;
    npc.emotion = 'happy';
    npc.speech = '有你这句话，心里踏实多了。';
    addEvent(next, 'good', `你的鼓励让${npc.name}更有信心了。`, npc.id);
    recordSocialInteraction(next, npc, 'praise');
  } else if (command.type === 'urge') {
    npc.emotion = 'annoyed';
    npc.speech = '知道了……我会尽快，但也得喘口气。';
    addEvent(next, 'warning', `你催促了${npc.name}。他会按脾气、体力和之前的经历决定是否继续。`, npc.id);
    recordSocialInteraction(next, npc, 'urge');
  }
  npc.lastInteraction = Math.max(.001, next.elapsed);
  refreshCampMind(next, npc);
  publishCampExpression(next, npc, npc.speech);
  npc.speechUntil = next.elapsed + 4;
  for (const stat of STAT_KEYS) npc[stat] = clamp(npc[stat]);
  next.score = calculateScore(next);
  return next;
}
