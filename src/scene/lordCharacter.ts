import { createNpc } from '../games/camp/simulation/constants';
import type { GameState } from '../games/camp/simulation/types';
import { createCompanion, updateCompanion } from './characters';
import type { CompanionRig } from './characters';
import { addMesh, material, Shapes } from './geometry';
import { AnimationMixer, Box3, Group, Mesh, SkinnedMesh, Vector3 } from 'three';
import type { AnimationAction, AnimationClip } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type ModelAsset = { scene: Group; animations: AnimationClip[] };
export interface LordRig extends CompanionRig {
  disposed?: boolean;
  modelReady: Promise<void>;
  model?: { root: Group; mixer: AnimationMixer; actions: Record<string, AnimationAction>; active: string };
}
const loadLordModel = () => new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/lord/model.glb`);
function releaseAsset(root: Group) {
  root.traverse(object => {
    const mesh = object as Mesh;
    if ((object as SkinnedMesh).isSkinnedMesh) (object as SkinnedMesh).skeleton.dispose();
    mesh.geometry?.dispose();
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(mat)) if (value?.isTexture) value.dispose();
      mat.dispose();
    }
  });
}

export function createLordCharacter(shapes: Shapes, loadModel: () => Promise<ModelAsset> = loadLordModel): LordRig {
  const rig = createCompanion('azhuang', shapes, true) as LordRig, gold = material('#e8c56a', { metalness: .6, roughness: .4 });
  addMesh(rig.head, shapes.cylinder, gold, [0, 1.72, 0], [.91, .22, .78]);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    addMesh(rig.head, shapes.box, gold, [Math.sin(a) * .72, 1.99, Math.cos(a) * .62], [.16, .34, .16]);
  }
  rig.root.userData.modelStatus = 'loading';
  rig.modelReady = loadModel().then(asset => {
    if (rig.disposed) { releaseAsset(asset.scene); return; }
    const bounds = new Box3().setFromObject(asset.scene), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0 || !['Idle', 'Walk'].every(name => asset.animations.some(clip => clip.name === name))) {
      releaseAsset(asset.scene); throw new Error('Invalid lord model or missing animation clips');
    }
    const normalized = new Group(), scale = 7.8 / rig.root.scale.y / size.y;
    normalized.scale.setScalar(scale);
    // Tripo source faces +X, while game heading zero faces +Z.
    normalized.rotation.y = -Math.PI / 2;
    asset.scene.position.add(new Vector3(-center.x, -bounds.min.y, -center.z));
    normalized.add(asset.scene);
    asset.scene.traverse(object => {
      if ((object as Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    rig.pivot.add(normalized); rig.torso.visible = false;
    rig.legs.forEach(leg => { leg.visible = false; });
    const mixer = new AnimationMixer(asset.scene), actions: Record<string, AnimationAction> = {};
    for (const clip of asset.animations) actions[clip.name] = mixer.clipAction(clip);
    actions.Idle.play();
    rig.model = { root: normalized, mixer, actions, active: 'Idle' };
    rig.root.userData.modelStatus = 'ready';
  }).catch(error => {
    if (!rig.disposed) { rig.root.userData.modelStatus = 'error'; rig.root.userData.modelError = String(error); }
  });
  return rig;
}
export function disposeLordCharacter(rig: LordRig): void {
  rig.disposed = true;
  rig.model?.mixer.stopAllAction();
  if (rig.model) rig.model.mixer.uncacheRoot(rig.model.mixer.getRoot());
  rig.model?.root.traverse(object => { if ((object as SkinnedMesh).isSkinnedMesh) (object as SkinnedMesh).skeleton.dispose(); });
}
// Presentation-only adapter: the lord never joins the NPC policy or social roster.
const pose = createNpc('azhuang');
export function updateLordCharacter(rig: LordRig, state: GameState, dt: number, time: number, reducedMotion: boolean): void {
  const lord = state.lord; if (!lord) { rig.root.visible = false; return; }
  rig.root.visible = true; pose.position = lord.position;
  pose.destination = { x: lord.position.x + lord.input.x, y: lord.position.y + lord.input.y };
  pose.action = null; pose.command = null;
  const oldX = rig.root.position.x, oldZ = rig.root.position.z, initialized = rig.initialized;
  updateCompanion(rig, pose, dt, time, state.elapsed, true, state.status === 'playing', reducedMotion, state.atmosphere);
  rig.pivot.rotation.y = lord.heading;
  rig.axe.visible = false; rig.bundle.visible = false;
  rig.basket.visible = false;
  if (rig.model) {
    const playing = state.status === 'playing';
    const moving = initialized && playing && Math.hypot(lord.input.x, lord.input.y) > .01 && Math.hypot(rig.root.position.x - oldX, rig.root.position.z - oldZ) > .0001;
    const next = moving && !reducedMotion ? 'Walk' : 'Idle';
    if (playing && next !== rig.model.active) {
      rig.model.actions[rig.model.active].fadeOut(.18);
      rig.model.actions[next].reset().fadeIn(.18).play(); rig.model.active = next;
    }
    if (playing && !reducedMotion) rig.model.mixer.update(Math.min(.1, Math.max(0, dt)));
    rig.root.userData.animation = rig.model.active;
  }
}
