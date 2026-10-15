import { readFileSync, writeFileSync } from 'node:fs';
import { createGame, advanceGameSteps } from '../src/games/camp/simulation/engine';
import { baselinePolicy, decodePolicy, inferPolicy } from '../src/games/camp/ai/policy';
import { foodReserve } from '../src/games/camp/simulation/survival';
import { isValidGameState } from '../src/games/camp/simulation/persistence';
import type { Difficulty } from '../src/games/camp/simulation/types';

const option = (key: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${key}=`))?.split('=')[1] ?? fallback;
const seeds = option('seeds', '17,41,7').split(',').map(Number);
const seconds = Number(option('seconds', '1800'));
const difficulty = option('difficulty', 'normal') as Difficulty;
if (!['normal', 'hard', 'cozy'].includes(difficulty) || seeds.some(seed => !Number.isSafeInteger(seed))
  || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds % 10) throw new Error('Invalid evaluation options');
const bytes = readFileSync('public/models/policy.f32');
const model = decodePolicy(JSON.parse(readFileSync('public/models/manifest.json', 'utf8')),
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const rules = process.argv.includes('--rules');
const policy = rules ? baselinePolicy : (observation: Parameters<typeof inferPolicy>[1]) => inferPolicy(model, observation);
const results = [];
for (const seed of seeds) {
  let state = createGame({ seed, difficulty }); state.status = 'playing';
  let deficitSeconds = 0, longestDeficit = 0, streak = 0, minFoodAfterWarmup = 100;
  const samples = [];
  for (let at = 0; at < seconds; at += 10) {
    state = advanceGameSteps(state, 100, policy);
    const reserve = foodReserve(state);
    if (state.food < reserve.minimum) { deficitSeconds += 10; streak += 10; longestDeficit = Math.max(longestDeficit, streak); }
    else streak = 0;
    if (state.elapsed >= 300) minFoodAfterWarmup = Math.min(minFoodAfterWarmup, state.food);
    if (state.elapsed % 300 === 0 || state.elapsed === seconds) {
      const sample = { time: state.elapsed, stock: state.food, minimum: reserve.minimum, target: reserve.target,
        incoming: reserve.incoming, committed: reserve.committed, alive: state.npcs.filter(n => n.alive).length,
        gathered: state.stats.gatheredFood, meals: state.stats.meals, valid: isValidGameState(state),
        npcs: state.npcs.map(n => ({ id: n.id, health: Math.round(n.health), hunger: Math.round(n.hunger), energy: Math.round(n.energy),
          action: n.action, xy: [Math.round(n.position.x), Math.round(n.position.y)], task: n.wildTask?.phase })) };
      samples.push(sample); console.log(JSON.stringify({ seed, difficulty, mode: rules ? 'rules' : 'model', ...sample }));
    }
  }
  const checks = { completed: state.elapsed === seconds, allAlive: state.npcs.every(n => n.alive),
    validStates: samples.every(s => s.valid), depositedFood: state.stats.gatheredFood > 0, consumedMeals: state.stats.meals > 0,
    stockAfterWarmup: seconds < 300 || minFoodAfterWarmup > 0, boundedDeficit: longestDeficit <= 180 };
  const passed = Object.values(checks).every(Boolean);
  results.push({ seed, difficulty, seconds, mode: rules ? 'rules' : 'model', passed, checks, deficitSeconds, longestDeficit, minFoodAfterWarmup, samples });
  if (!passed) process.exitCode = 1;
}
const output = option('output', '');
if (output) writeFileSync(output, JSON.stringify({ sha256: model.manifest.sha256, results }, null, 2) + '\n');
console.log(JSON.stringify({ summary: results.map(({ samples: _samples, ...summary }) => summary) }));
