import { createCampScene } from '../src/scene/campScene';
import { createGame, advanceGame, issueCommand } from '../src/games/camp/simulation/engine';
import { createAtmosphere } from '../src/games/camp/simulation/weather';
import { baselinePolicy } from '../src/games/camp/ai/policy';

// An isolated deterministic world: benchmarking never writes the player's save.
let state = createGame({ seed: 17, difficulty: 'cozy', mode: 'rules' });
state.status = 'playing'; state.elapsed = 210;
let rainy = true;
function weather() {
  state.weather = rainy ? 'storm' : 'clear';
  state.atmosphere = createAtmosphere(17, state.weather, state.elapsed);
  state.atmosphere.rainIntensity = rainy ? 1 : 0;
  state.atmosphere.cloudCover = rainy ? .8 : .05;
  state.atmosphere.windStrength = .6; state.atmosphere.windAngle = .4;
}
weather();
const scene = createCampScene(document.getElementById('preview')!, state, {
  onSelect() {}, onAssign() {}, onProject() {}, onStatus() {},
  onLordInput(direction) { state = issueCommand(state, { type: 'lord-input', playerId: 'local-player', direction }); scene.update(state); },
});
for (const mode of ['god', 'lord'] as const) document.getElementById(mode)!.onclick = () => { scene.setViewMode(mode); (document.activeElement as HTMLElement)?.blur(); };
for (const kind of ['clear', 'rain'] as const) document.getElementById(kind)!.onclick = () => { rainy = kind === 'rain'; weather(); scene.update(state); };
const timer = window.setInterval(() => {
  state = advanceGame(state, .1, baselinePolicy); weather(); scene.update(state);
  const stats = scene.stats(); document.getElementById('stats')!.textContent = `${stats.fps} FPS · ${stats.calls} draw calls · ${stats.triangles.toLocaleString()} triangles`;
}, 100);
window.addEventListener('pagehide', () => { clearInterval(timer); scene.dispose(); }, { once: true });
