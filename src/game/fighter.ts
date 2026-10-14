import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import modelUrl from '../../assets/characters/azure-fighter/2026-10-14-v2/models/character.glb?url';
import { ATTACKS, type FighterState, type Motion } from './combat';

const CLIPS = { idle: 'Combat_Stance', walk: 'Walking', run: 'Running', punch: 'Right_Jab_from_Guard', kick: 'Boxing_Guard_Right_Straight_Kick' } as const;
type ClipKey = keyof typeof CLIPS;
export async function loadCharacter(onProgress: (percent: number) => void): Promise<GLTF> {
  return new GLTFLoader().loadAsync(modelUrl, e => { if (e.total) onProgress(Math.round(e.loaded / e.total * 100)); });
}

export class Fighter {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipKey, THREE.AnimationAction>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private current: ClipKey | null = null;
  private attackId = -1;
  private lean = 0;
  private yaw: number;

  constructor(gltf: GLTF, readonly index: number) {
    this.model = clone(gltf.scene);
    this.root.add(this.model);
    this.yaw = index === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.root.rotation.y = this.yaw;
    this.model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      const cloned = originals.map(material => {
        const result = material.clone() as THREE.MeshStandardMaterial;
        result.roughness = Math.max(result.roughness, 0.68);
        result.metalness = Math.min(result.metalness, 0.15);
        if (index === 1) result.color.set('#c8b3df');
        this.materials.push(result);
        return result;
      });
      object.material = Array.isArray(object.material) ? cloned : cloned[0];
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [key, name] of Object.entries(CLIPS)) {
      const original = gltf.animations.find(a => a.name === name);
      if (!original) throw new Error(`角色文件缺少动作：${name}`);
      const clip = original.clone();
      // The source stance contains a 0.33m hips offset. Keep height, anchor X/Z.
      for (const track of clip.tracks) {
        if (/Hips.*\.position$/.test(track.name)) {
          for (let i = 0; i < track.values.length; i += 3) { track.values[i] = 0; track.values[i + 2] = 0; }
        }
      }
      const action = this.mixer.clipAction(clip);
      if (key === 'punch' || key === 'kick') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = clip.duration / ATTACKS[key].duration;
      }
      this.actions.set(key as ClipKey, action);
    }
    this.play('idle');
    this.mixer.update(0);
  }

  update(dt: number, state: FighterState, frozen: boolean, animationDt = dt) {
    const kind = this.clipFor(state.motion);
    const attack = state.attack?.id ?? -1;
    if (kind !== this.current || (state.attack && attack !== this.attackId)) {
      this.play(kind);
      this.attackId = attack;
    }
    if (!frozen) this.mixer.update(animationDt);
    this.root.position.x = state.x;
    const desiredYaw = state.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.yaw += Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw)) * (1 - Math.exp(-18 * dt));
    this.root.rotation.y = this.yaw;
    const desiredLean = state.motion === 'down' ? -1.35 : state.motion === 'hit' ? -0.18 : state.motion === 'guard' ? 0.08 : 0;
    this.lean = THREE.MathUtils.damp(this.lean, desiredLean, 12, dt);
    this.model.rotation.x = this.lean;
    for (const material of this.materials) {
      material.emissive.set(state.flash > 0 ? '#e5a480' : '#000000');
      material.emissiveIntensity = state.flash > 0 ? state.flash * 2.8 : 0;
    }
  }

  reset() {
    this.mixer.stopAllAction();
    this.current = null;
    this.attackId = -1;
    this.lean = 0;
    this.model.rotation.x = 0;
    this.play('idle');
  }

  private play(kind: ClipKey) {
    const next = this.actions.get(kind)!;
    const previous = this.current ? this.actions.get(this.current)! : null;
    next.reset().setEffectiveWeight(1).play();
    if (previous && previous !== next) next.crossFadeFrom(previous, 0.12, false);
    this.current = kind;
  }

  private clipFor(motion: Motion): ClipKey {
    if (motion === 'dash') return 'run';
    if (motion === 'hit' || motion === 'down' || motion === 'guard') return 'idle';
    return motion;
  }
}
