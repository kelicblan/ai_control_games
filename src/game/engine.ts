import {
  ACTIONS, EMOTIONS, type ActionId, type Emotion, type GameCommand, type GameEvent,
  type GameOptions, type GameState, type Npc, type PolicyFunction, type PolicyObservation,
  type PolicyResult,
} from './types';
import {
  ACTION_DURATIONS, ACTION_LABELS, ARRIVAL_DISTANCE, clamp, DIFFICULTY_CONFIG, distance,
  FIRE_GAIN, GAME_DURATION, isAtCamp, LOCATIONS, MAX_DECISIONS, MAX_EVENTS, MEAL_RELIEF,
  MOVE_SPEED, NPC_PROFILES,
} from './constants';
import { getObservation } from './observation';

export { FEATURE_NAMES, getAllowedActions, getObservation } from './observation';

const STAT_KEYS = ['health', 'energy', 'hunger', 'morale', 'trust', 'fear'] as const;
const WORK_ENERGY: Record<ActionId, number> = {
  wood: .82, food: .58, fire: .1, eat: -.7, rest: -3.9, help: .38, camp: -.14, explore: .98,
};
const ACTION_SPEECH: Record<ActionId, string> = {
  wood: '找些干燥的木头，今晚用得上。', food: '我去看看浆果熟了没有。',
  fire: '火光可不能灭，交给我。', eat: '先填饱肚子，才有力气干活。',
  rest: '稍微歇一会儿，我就回来。', help: '别担心，我来搭把手。',
  camp: '回到火光旁边，大家在一起。', explore: '我去前面看看，很快回来。',
};

function addEvent(state: GameState, kind: GameEvent['kind'], text: string, npcId?: Npc['id']) {
  state.events.push({ id: state.nextEventId++, time: state.elapsed, kind, text, ...(npcId ? { npcId } : {}) });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

/** This RNG belongs only to world events, keeping weather fair across different policies. */
function worldRandom(state: GameState): number {
  let value = state.randomState || 0x6d2b79f5;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.randomState = value >>> 0;
  return state.randomState / 4294967296;
}

function outcomeRandom(state: GameState, npc: Npc): number {
  const npcSalt = npc.id === 'azhuang' ? 101 : npc.id === 'xiaomi' ? 211 : 307;
  let value = state.seed ^ Math.imul(npc.completedTasks + 1, 0x45d9f3b) ^ Math.imul(npcSalt, 0x119de1f3) ^ Math.floor(state.elapsed * 100);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function createGame(options: GameOptions = {}): GameState {
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed!) >>> 0 : 20261012;
  const difficulty = options.difficulty && options.difficulty in DIFFICULTY_CONFIG ? options.difficulty : 'cozy';
  const config = DIFFICULTY_CONFIG[difficulty];
  const scenario = options.scenario === 'storm' || options.scenario === 'conflict' ? options.scenario : 'standard';
  const state: GameState = {
    version: 1, seed, randomState: seed || 0x6d2b79f5, status: 'ready', difficulty, scenario,
    mode: options.mode === 'rules' ? 'rules' : 'model', elapsed: 0, duration: GAME_DURATION, day: 1,
    wood: config.wood, food: config.food, fire: config.fire,
    weather: scenario === 'storm' ? 'rain' : 'clear',
    danger: config.danger + (scenario === 'storm' ? 12 : 0),
    weatherUntil: scenario === 'storm' ? 40 : 0,
    npcs: NPC_PROFILES.map((profile, index) => ({
      ...profile, personality: { ...profile.personality },
      health: 100, energy: [88, 84, 80][index], hunger: [26, 22, 32][index] + (scenario === 'conflict' ? 22 : 0),
      morale: [76, 72, 80][index], trust: [76, 70, 84][index] - (scenario === 'conflict' ? 24 : 0),
      fear: [8, 22, 12][index], position: { x: 46 + index * 3, y: 65 + index * 2 },
      destination: { x: 46 + index * 3, y: 65 + index * 2 },
      action: null, command: scenario === 'conflict' ? 'wood' : null,
      progress: 0, actionDuration: 0, decisionIn: 0,
      emotion: 'calm', speech: '', speechUntil: 0, injured: false, alive: true,
      inventory: { wood: 0, food: 0 }, completedTasks: 0, refusals: 0, lastInteraction: 0,
    })),
    events: [], decisions: [], selectedNpc: 'azhuang', priority: 'balanced',
    nextEventId: 1, nextDecisionId: 1, nextWorldEvent: scenario === 'storm' ? 24 : 38,
    stats: { gatheredWood: 0, gatheredFood: 0, meals: 0, helps: 0, modelDecisions: 0, ruleDecisions: 0, fallbackDecisions: 0, totalLatency: 0, taskSwitches: 0 },
    resultReason: '', score: 0,
  };
  addEvent(state, 'info', scenario === 'storm'
    ? '雨已经落下。备好食物和木材，守住今晚的火光。'
    : scenario === 'conflict' ? '大家有些饿了，却都收到了采木指令。看看他们会如何权衡。'
      : '天色渐晚。照顾三位队员，在天亮前守住篝火，最后一起回营。');
  return state;
}

function requestReplan(state: GameState, npc: Npc) {
  if (npc.action !== null) state.stats.taskSwitches++;
  npc.action = null;
  npc.progress = 0;
  npc.actionDuration = 0;
  npc.decisionIn = 0;
  npc.destination = { ...npc.position };
}

function helpTarget(state: GameState, npc: Npc): Npc | undefined {
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
  npc.emotion = emotion;
  switch (emotion) {
    case 'happy': npc.morale += 1.3; npc.fear -= .8; break;
    case 'worried': npc.fear += 1.8; npc.morale -= .3; break;
    case 'annoyed': npc.morale -= 1; npc.trust -= .25; break;
    case 'caring': npc.morale += .7; npc.trust += .3; break;
    case 'calm': npc.fear -= 1; break;
  }
}

function startAction(state: GameState, npc: Npc, action: ActionId) {
  npc.action = action;
  npc.progress = 0;
  npc.actionDuration = ACTION_DURATIONS[action];
  const destination = action === 'eat' ? LOCATIONS.storage
    : action === 'help' ? (helpTarget(state, npc)?.position ?? LOCATIONS.camp)
      : action === 'camp' && (npc.inventory.wood > 0 || npc.inventory.food > 0) ? LOCATIONS.storage
        : LOCATIONS[action as keyof typeof LOCATIONS] ?? LOCATIONS.camp;
  npc.destination = { ...destination };
}

function makeDecision(state: GameState, npc: Npc, policy: PolicyFunction) {
  const observation = getObservation(state, npc);
  let result: PolicyResult;
  let valid = true;
  try {
    result = policy({ features: [...observation.features], allowed: [...observation.allowed], npcId: observation.npcId });
    if (!validResult(result, observation)) {
      result = fallbackPolicy(observation);
      valid = false;
    }
  } catch {
    result = { ...fallbackPolicy(observation), reason: '策略推理失败，已采用安全回退。' };
    valid = false;
  }
  const command = npc.command;
  const accepted = valid && (command === null || command === result.action);
  let reason = result.reason;
  applyEmotion(npc, result.emotion);
  npc.speech = ACTION_SPEECH[result.action];
  npc.speechUntil = state.elapsed + 4.5;
  if (command !== null) {
    if (result.action === command) {
      npc.trust += .8;
      addEvent(state, 'info', `${npc.name}接受了「${ACTION_LABELS[command]}」的安排。`, npc.id);
    } else {
      npc.refusals++;
      npc.trust -= .5;
      const refusal = npc.hunger > 72 ? '我得先顾好肚子。' : npc.energy < 22 ? '我需要先恢复一点体力。'
        : npc.fear > 55 ? '那里让我有些担心。' : '我想先处理眼前更紧急的事。';
      npc.speech = refusal;
      reason = `${refusal}选择了「${ACTION_LABELS[result.action]}」。`;
      addEvent(state, 'warning', `${npc.name}暂未接受安排：${reason}`, npc.id);
    }
    npc.command = null;
  }
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
    ...(reason ? { reason: reason.slice(0, 200) } : {}),
  });
  if (state.decisions.length > MAX_DECISIONS) state.decisions.splice(0, state.decisions.length - MAX_DECISIONS);
  startAction(state, npc, result.action);
}

function finishAction(npc: Npc, completed = true) {
  if (completed) npc.completedTasks++;
  npc.action = null;
  npc.progress = 0;
  npc.actionDuration = 0;
  npc.decisionIn = .6;
  npc.destination = { ...npc.position };
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
    addEvent(state, 'good', `${npc.name}把${items}带回了营地。`, npc.id);
    npc.morale += 1.5;
  }
  npc.inventory = { wood: 0, food: 0 };
}

function returnWithSupplies(npc: Npc) {
  npc.destination = { ...LOCATIONS.storage };
  npc.progress = 0;
  npc.actionDuration = 1.1;
  npc.speech = '收获不错，我把东西送回营地。';
}

function completeAction(state: GameState, npc: Npc) {
  const action = npc.action;
  if (action === null) return;
  if (['wood', 'food', 'explore'].includes(action) && (npc.inventory.wood > 0 || npc.inventory.food > 0)) {
    depositSupplies(state, npc);
    finishAction(npc);
    return;
  }
  switch (action) {
    case 'wood':
      npc.inventory.wood = state.difficulty === 'cozy' ? 4 : state.difficulty === 'normal' ? 3 : 2;
      returnWithSupplies(npc);
      return;
    case 'food':
      npc.inventory.food = state.difficulty === 'cozy' ? 4 : 2;
      returnWithSupplies(npc);
      return;
    case 'explore': {
      const roll = outcomeRandom(state, npc);
      if (roll < .18 && state.danger > 35) {
        npc.health -= 13 * DIFFICULTY_CONFIG[state.difficulty].damage;
        npc.fear += 15;
        npc.injured = true;
        npc.inventory.wood = 1;
        addEvent(state, 'danger', `${npc.name}在探路时擦伤了，需要休息或同伴帮助。`, npc.id);
      } else {
        npc.inventory.wood = roll > .7 ? 3 : 2;
        npc.inventory.food = roll < .5 ? 2 : 1;
        npc.morale += 5;
        addEvent(state, 'good', `${npc.name}发现了一处旧营地，正在带回补给。`, npc.id);
      }
      returnWithSupplies(npc);
      return;
    }
    case 'fire':
      if (state.wood < 1) {
        addEvent(state, 'warning', `${npc.name}到达篝火旁，却发现木材已经用完。`, npc.id);
        finishAction(npc, false);
        return;
      }
      state.wood--;
      state.fire = clamp(state.fire + FIRE_GAIN);
      npc.morale += 2;
      addEvent(state, 'good', `${npc.name}添了柴，篝火又亮了一些。`, npc.id);
      break;
    case 'eat':
      if (state.food < 1) {
        addEvent(state, 'warning', `${npc.name}没领到食物，需要先补充营地库存。`, npc.id);
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
      target.trust = clamp(target.trust + 7);
      target.injured = false;
      npc.energy -= 3;
      npc.morale += 6;
      state.stats.helps++;
      addEvent(state, 'good', `${npc.name}照顾了${target.name}，队伍更有底气了。`, npc.id);
      break;
    }
    case 'rest':
      npc.energy += 4;
      npc.fear -= 5;
      if (npc.hunger < 75) npc.health += 3;
      if (npc.health >= 80) npc.injured = false;
      if (npc.inventory.wood > 0 || npc.inventory.food > 0) depositSupplies(state, npc);
      break;
    case 'camp':
      npc.energy += 2;
      npc.fear -= 3;
      if (npc.inventory.wood > 0 || npc.inventory.food > 0) depositSupplies(state, npc);
      break;
  }
  finishAction(npc);
}

function updateNpcNeeds(state: GameState, npc: Npc, dt: number) {
  const config = DIFFICULTY_CONFIG[state.difficulty];
  const previousHunger = npc.hunger;
  const sheltered = isAtCamp(npc);
  const activeWork = npc.action === 'wood' || npc.action === 'food' || npc.action === 'explore';
  npc.hunger += (config.hungerRate + (activeWork ? .045 : 0)) * dt;
  npc.energy -= .035 * dt;
  if (npc.hunger >= 88) npc.health -= .46 * config.damage * dt;
  if (npc.energy < 3) npc.health -= .12 * config.damage * dt;
  if (npc.injured) npc.health -= .025 * dt;
  if (state.fire < 15 && state.elapsed > state.duration * .4) npc.health -= .15 * config.damage * dt;
  if (sheltered && state.fire > 35 && npc.hunger < 60) npc.health += .04 * dt;
  const desiredFear = sheltered ? 5 : state.danger * (1 - npc.personality.bravery * .62);
  npc.fear += (desiredFear - npc.fear) * (sheltered ? .10 : .045) * dt;
  npc.morale += ((sheltered && state.fire > 40 ? .035 : 0) - (npc.hunger > 72 ? .09 : 0) - (npc.energy < 18 ? .07 : 0)) * dt;
  if (previousHunger < 80 && npc.hunger >= 80) {
    addEvent(state, 'warning', `${npc.name}已经很饿了，尽快让他吃点东西。`, npc.id);
    if (npc.action !== 'eat') requestReplan(state, npc);
  }
}

function updateNpcAction(state: GameState, npc: Npc, dt: number, policy: PolicyFunction) {
  npc.decisionIn = Math.max(0, npc.decisionIn - dt);
  if (npc.action === null && npc.decisionIn <= 0) makeDecision(state, npc, policy);
  if (npc.action === null) return;
  if (npc.action === 'help') {
    const target = helpTarget(state, npc);
    if (!target) {
      finishAction(npc, false);
      return;
    }
    npc.destination = { ...target.position };
  }
  const gap = distance(npc.position, npc.destination);
  const speed = MOVE_SPEED * (npc.injured ? .72 : 1) * (npc.energy < 12 ? .72 : 1);
  const travelTime = gap > ARRIVAL_DISTANCE ? Math.min(dt, gap / speed) : 0;
  if (travelTime > 0) {
    const ratio = Math.min(1, speed * travelTime / gap);
    npc.position.x += (npc.destination.x - npc.position.x) * ratio;
    npc.position.y += (npc.destination.y - npc.position.y) * ratio;
    npc.energy -= travelTime * .23;
  }
  if (distance(npc.position, npc.destination) > ARRIVAL_DISTANCE) return;
  npc.position = { ...npc.destination };
  const workTime = Math.max(0, dt - travelTime);
  if (workTime <= 0) return;
  const action = npc.action;
  npc.energy -= WORK_ENERGY[action] * workTime;
  if (action === 'rest' && npc.hunger < 75) npc.health += .55 * workTime;
  const diligence = action === 'wood' || action === 'food' || action === 'explore' ? .9 + npc.personality.diligence * .2 : 1;
  npc.progress = clamp(npc.progress + workTime * diligence / Math.max(.1, npc.actionDuration), 0, 1);
  if (npc.progress >= 1) completeAction(state, npc);
}

function worldEvent(state: GameState) {
  // Consume a fixed number of random values regardless of NPC positions or policy choices.
  const kind = worldRandom(state);
  const intensity = worldRandom(state);
  const targetRoll = worldRandom(state);
  const nextDelay = worldRandom(state);
  state.nextWorldEvent = state.elapsed + 27 + nextDelay * 14;
  if (kind < (state.scenario === 'storm' ? .46 : .30)) {
    state.weather = 'rain';
    state.weatherUntil = state.elapsed + 20 + intensity * 12;
    state.danger = clamp(state.danger + 7);
    addEvent(state, 'warning', '雨落下来了，篝火消耗加快。记得留出添柴的人手。');
  } else if (kind < .56) {
    state.weather = 'wind';
    state.weatherUntil = state.elapsed + 17 + intensity * 10;
    state.danger = clamp(state.danger + 4);
    addEvent(state, 'warning', '一阵山风穿过营地，火苗摇晃起来。');
  } else if (kind < .85) {
    state.danger = clamp(state.danger + 19 + intensity * 12);
    addEvent(state, 'danger', '林间传来野兽的动静。在外的队员需要留意危险。');
    const target = state.npcs[Math.min(state.npcs.length - 1, Math.floor(targetRoll * state.npcs.length))];
    if (target.alive && !isAtCamp(target)) {
      target.fear = clamp(target.fear + 13 * (1 - target.personality.bravery * .5));
      if (intensity > .34) {
        target.health = clamp(target.health - (12 + intensity * 8) * DIFFICULTY_CONFIG[state.difficulty].damage);
        target.injured = true;
        addEvent(state, 'danger', `${target.name}躲避野兽时受了伤，可以安排同伴帮助。`, target.id);
      }
      requestReplan(state, target);
    }
  } else {
    state.weather = 'clear';
    state.weatherUntil = 0;
    state.danger = clamp(state.danger - 12);
    addEvent(state, 'good', '云隙露出星光，四周暂时安静下来。');
    for (const npc of state.npcs) if (npc.alive) npc.morale = clamp(npc.morale + 3);
  }
}

function updateWorld(state: GameState, dt: number) {
  if (state.weather !== 'clear' && state.weatherUntil > 0 && state.elapsed >= state.weatherUntil) {
    state.weather = 'clear';
    state.weatherUntil = 0;
    addEvent(state, 'info', '风雨渐渐停了，抓紧这段平静的时间。');
  }
  if (state.elapsed >= state.nextWorldEvent && state.elapsed < state.duration - 12) worldEvent(state);
  const config = DIFFICULTY_CONFIG[state.difficulty];
  const previousFire = state.fire;
  const weatherMultiplier = state.weather === 'rain' ? 1.65 : state.weather === 'wind' ? 1.4 : 1;
  const nightMultiplier = state.elapsed > state.duration * .42 ? 1.18 : 1;
  state.fire = clamp(state.fire - config.fireRate * weatherMultiplier * nightMultiplier * dt);
  const dangerFloor = config.danger + (state.elapsed > state.duration * .5 ? 7 : 0);
  state.danger = clamp(Math.max(dangerFloor, state.danger - dt * .10));
  if (previousFire > 25 && state.fire <= 25) addEvent(state, 'warning', '篝火快暗下来了，需要尽快添柴。');
  if (previousFire > 14 && state.fire <= 14) {
    addEvent(state, 'danger', '火光只剩一点了！营地需要立即补充燃料。');
    for (const npc of state.npcs) if (npc.alive && npc.action !== 'fire') requestReplan(state, npc);
  }
}

function calculateScore(state: GameState): number {
  const survivors = state.npcs.filter((npc) => npc.alive);
  const wellbeing = survivors.reduce((sum, npc) => sum + npc.health * 2 + npc.morale, 0);
  return Math.round(Math.max(0, (state.status === 'won' ? 1000 : 0) + survivors.length * 200 + wellbeing
    + state.elapsed / state.duration * 400 + state.fire * 3 + state.wood * 7 + state.food * 12
    + state.stats.gatheredWood * 8 + state.stats.gatheredFood * 12 + state.stats.helps * 60));
}

function checkOutcome(state: GameState) {
  const fallen = state.npcs.find((npc) => !npc.alive || npc.health <= 0);
  if (fallen) {
    fallen.alive = false;
    fallen.health = 0;
    state.status = 'lost';
    state.resultReason = `${fallen.name}没能撑过这一夜。留意饥饿、伤势和体力，下次一起回来。`;
  } else if (state.fire <= 0) {
    state.status = 'lost';
    state.resultReason = '篝火熄灭了，营地无法继续抵挡寒夜。下次提前准备木材和添柴的人手。';
  } else if (state.elapsed >= state.duration) {
    const outside = state.npcs.filter((npc) => !isAtCamp(npc));
    if (outside.length > 0) {
      state.status = 'lost';
      state.resultReason = `天亮了，但${outside.map((npc) => npc.name).join('、')}还没回到火光旁。最后半分钟记得全队召回。`;
    } else {
      state.status = 'won';
      state.resultReason = '天亮了。三位队员都回到了营地，篝火依然温暖——今晚，没有人被落下。';
    }
  }
  if (state.status === 'won' || state.status === 'lost') {
    addEvent(state, state.status === 'won' ? 'good' : 'danger', state.resultReason);
    for (const npc of state.npcs) npc.decisionIn = 0;
  }
}

/** Pure public transition. dt is game-time seconds; physics uses bounded deterministic substeps. */
export function advanceGame(state: GameState, dt: number, policy: PolicyFunction): GameState {
  const next = structuredClone(state);
  if (next.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return next;
  let remaining = Math.min(dt, Math.max(0, next.duration - next.elapsed));
  while (remaining > 1e-9 && next.status === 'playing') {
    const step = Math.min(.25, remaining);
    next.elapsed = Math.min(next.duration, Math.round((next.elapsed + step) * 1e9) / 1e9);
    updateWorld(next, step);
    for (const npc of next.npcs) {
      if (!npc.alive) continue;
      updateNpcNeeds(next, npc, step);
      if (npc.health > 0) updateNpcAction(next, npc, step, policy);
      for (const stat of STAT_KEYS) npc[stat] = clamp(npc[stat]);
      npc.position.x = clamp(npc.position.x);
      npc.position.y = clamp(npc.position.y);
      npc.destination.x = clamp(npc.destination.x);
      npc.destination.y = clamp(npc.destination.y);
      if (npc.health <= 0) npc.alive = false;
    }
    checkOutcome(next);
    remaining -= step;
  }
  if (next.status === 'playing' && next.elapsed >= next.duration) checkOutcome(next);
  next.score = calculateScore(next);
  return next;
}

export function issueCommand(state: GameState, command: GameCommand): GameState {
  const next = structuredClone(state);
  const npc = next.npcs.find((candidate) => candidate.id === (command.npcId ?? next.selectedNpc));
  if (command.type === 'select') {
    if (npc) next.selectedNpc = npc.id;
    return next;
  }
  if (command.type === 'priority') {
    if (command.priority && ['balanced', 'wood', 'food'].includes(command.priority)) {
      next.priority = command.priority;
      if (next.status === 'playing' || next.status === 'paused') addEvent(next, 'info', command.priority === 'balanced' ? '营地恢复均衡安排。' : `营地优先补充${command.priority === 'wood' ? '木材' : '食物'}。`);
    }
    return next;
  }
  if (next.status !== 'playing' && next.status !== 'paused') return next;
  if (command.type === 'recall') {
    for (const member of next.npcs) {
      if (!member.alive) continue;
      member.command = 'camp';
      member.lastInteraction = Math.max(.001, next.elapsed);
      requestReplan(next, member);
      member.speech = '收到召回指令。';
      member.speechUntil = next.elapsed + 3;
    }
    addEvent(next, 'info', '你发出了全队召回指令。队员正在重新安排路线。');
    return next;
  }
  if (!npc || !npc.alive) return next;
  if (command.type === 'assign') {
    if (command.action !== null && (!command.action || !ACTIONS.includes(command.action))) return next;
    npc.command = command.action;
    // Zero means no interaction yet; preserve the cooldown when paused at the start.
    npc.lastInteraction = Math.max(.001, next.elapsed);
    requestReplan(next, npc);
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
      addEvent(next, 'warning', '营地没有可分配的食物，需要先采集。', npc.id);
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
  } else if (command.type === 'praise') {
    npc.morale += 8;
    npc.trust += 5;
    npc.fear -= 6;
    npc.emotion = 'happy';
    npc.speech = '有你这句话，心里踏实多了。';
    addEvent(next, 'good', `你的鼓励让${npc.name}更有信心了。`, npc.id);
  } else if (command.type === 'urge') {
    npc.energy -= 4;
    npc.morale -= 5;
    npc.trust -= 4;
    npc.emotion = 'annoyed';
    npc.speech = '知道了……我会尽快，但也得喘口气。';
    if (npc.action && !['camp', 'rest', 'eat'].includes(npc.action) && distance(npc.position, npc.destination) <= ARRIVAL_DISTANCE) {
      npc.progress = Math.min(.99, npc.progress + .16);
    }
    addEvent(next, 'warning', `你催促了${npc.name}。工作可能加快，但他有些疲惫和不满。`, npc.id);
  }
  npc.lastInteraction = Math.max(.001, next.elapsed);
  npc.speechUntil = next.elapsed + 4;
  for (const stat of STAT_KEYS) npc[stat] = clamp(npc[stat]);
  next.score = calculateScore(next);
  return next;
}
