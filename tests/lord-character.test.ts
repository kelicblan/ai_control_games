import { describe, expect, it } from 'vitest';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, NumberKeyframeTrack } from 'three';
import { createGame } from '../src/games/camp/simulation/engine';
import { Shapes } from '../src/scene/geometry';
import { createLordCharacter, disposeLordCharacter, updateLordCharacter } from '../src/scene/lordCharacter';

function asset() {
  const scene = new Group(); scene.add(new Mesh(new BoxGeometry(.4, 1, .3), new MeshStandardMaterial()));
  const clips = ['Idle', 'Walk'].map(name => new AnimationClip(name, 1, [new NumberKeyframeTrack('.rotation[x]', [0, .5, 1], [0, .05, 0])]));
  return { scene, animations: clips };
}
describe('imported lord presentation', () => {
  it('replaces the fallback, switches clips with movement and freezes when paused', async () => {
    const rig = createLordCharacter(new Shapes(), async () => asset());
    await rig.modelReady;
    expect(rig.torso.visible).toBe(false);
    expect(rig.legs.every(leg => !leg.visible)).toBe(true);
    expect(rig.model?.root.parent).toBe(rig.pivot);
    const state = createGame({ seed: 17 }); state.status = 'playing';
    updateLordCharacter(rig, state, .016, 0, false);
    expect(rig.model?.active).toBe('Idle');
    state.lord!.input = { x: 1, y: 0 }; state.lord!.position.x += .5;
    updateLordCharacter(rig, state, .016, .016, false);
    expect(rig.model?.active).toBe('Walk');
    state.lord!.input = { x: 0, y: 0 };
    updateLordCharacter(rig, state, .016, .032, false);
    expect(rig.model?.active).toBe('Idle');
    state.status = 'paused'; const before = rig.model!.mixer.time;
    updateLordCharacter(rig, state, .1, .132, false);
    expect(rig.model!.mixer.time).toBe(before);
    disposeLordCharacter(rig);
  });
  it('keeps the original character usable when loading fails', async () => {
    const rig = createLordCharacter(new Shapes(), async () => { throw new Error('offline'); });
    await rig.modelReady;
    expect(rig.torso.visible).toBe(true);
    expect(rig.root.userData.modelStatus).toBe('error');
    disposeLordCharacter(rig);
  });
  it('disposes a model arriving after the scene has closed', async () => {
    let resolve!: (value: ReturnType<typeof asset>) => void;
    const rig = createLordCharacter(new Shapes(), () => new Promise(r => { resolve = r; }));
    disposeLordCharacter(rig); resolve(asset()); await rig.modelReady;
    expect(rig.model).toBeUndefined();
  });
});
