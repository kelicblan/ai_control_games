import { describe, expect, it } from 'vitest';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createNpc } from '../src/games/camp/simulation/constants';
import { createAtmosphere } from '../src/games/camp/simulation/weather';
import { NPC_IDS } from '../src/games/camp/simulation/types';
import { Shapes } from '../src/scene/geometry';
import { createSubjectCharacter, updateSubjectCharacter, disposeSubjectCharacter } from '../src/scene/subjectCharacter';

function asset() {
  const scene = new Group(); scene.add(new Mesh(new BoxGeometry(.4, 1, .3), new MeshStandardMaterial()));
  const spine = new Group(); spine.name = 'Spine'; scene.add(spine);
  const misleading = new Group(); misleading.name = 'tripo::Spine_0'; scene.add(misleading);
  for (const side of [-1, 1]) { const hand = new Group(); hand.name = side === -1 ? 'LeftHand' : 'RightHand'; hand.position.set(side * .3, .5, .2); scene.add(hand); }
  return { scene, animations: ['Idle', 'Walk', 'Work', 'Gather', 'Rest', 'Carry'].map(name => new AnimationClip(name, 1, [])) };
}
describe('commoner model replacement', () => {
  it('replaces all nine subjects while preserving each NPC identity', async () => {
    for (const id of NPC_IDS) {
      const rig = createSubjectCharacter(id, new Shapes(), async () => asset()); await rig.modelReady;
      expect(rig.torso.visible).toBe(false); expect(rig.legs.every(leg => !leg.visible)).toBe(true);
      expect(rig.root.userData.npcId).toBe(id); expect(rig.bundle.parent?.name).toBe('Spine');
      disposeSubjectCharacter(rig);
    }
  });
  it('switches walking, work and carry clips, and freezes on pause', async () => {
    const rig = createSubjectCharacter('laozhou', new Shapes(), async () => asset()); await rig.modelReady;
    const npc = createNpc('laozhou'), weather = createAtmosphere(17, 'clear', 0);
    const update = (playing = true) => updateSubjectCharacter(rig, npc, .04, 1, 1, true, playing, false, weather);
    update(); npc.position.x += .5; npc.destination = { x: npc.position.x + 10, y: npc.position.y }; update();
    expect(rig.model?.active).toBe('Walk');
    npc.destination = { ...npc.position }; npc.action = 'wood'; for (let i = 0; i < 20; i++) update();
    expect(rig.model?.active).toBe('Work');
    npc.inventory.wood = 2; update(); expect(rig.model?.active).toBe('Carry');
    rig.root.updateMatrixWorld(true);
    const midpoint = rig.model!.hands![0].getWorldPosition(new Vector3()).add(rig.model!.hands![1].getWorldPosition(new Vector3())).multiplyScalar(.5);
    expect(rig.bundle.getWorldPosition(new Vector3()).distanceTo(midpoint)).toBeLessThan(.00001);
    const before = rig.model!.mixer.time; update(false); expect(rig.model!.mixer.time).toBe(before);
    disposeSubjectCharacter(rig);
  });
  it('keeps fallback visuals after a load error or late disposal', async () => {
    const rig = createSubjectCharacter('xiaomi', new Shapes(), async () => { throw new Error('offline'); }); await rig.modelReady;
    expect(rig.torso.visible).toBe(true); expect(rig.root.userData.modelStatus).toBe('error');
    let resolve!: (value: ReturnType<typeof asset>) => void;
    const late = createSubjectCharacter('azhuang', new Shapes(), () => new Promise(r => { resolve = r; }));
    disposeSubjectCharacter(late); resolve(asset()); await late.modelReady; expect(late.model).toBeUndefined();
  });
});
