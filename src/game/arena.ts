import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Fighter } from './fighter';
import type { Combat, HitEvent } from './combat';

interface Spark { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; total: number }
interface Wave { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number }

export class Arena {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly fighters: [Fighter, Fighter];
  private markers: THREE.Mesh[] = [];
  private shields: THREE.Mesh[] = [];
  private sparks: Spark[] = [];
  private waves: Wave[] = [];
  private sparkGeometry = new THREE.BoxGeometry(0.035, 0.035, 0.12);
  private waveGeometry = new THREE.RingGeometry(0.38, 0.4, 48);
  private time = 0;
  private shake = 0;
  private center = 0;
  private distance = 7.7;
  private width = 1;
  private height = 1;
  private rng = 48;

  constructor(canvas: HTMLCanvasElement, gltf: GLTF) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene.fog = new THREE.Fog('#b1b3ae', 15, 55);
    this.environment();
    this.platform();
    this.fighters = [new Fighter(gltf, 0), new Fighter(gltf, 1)];
    this.fighters.forEach((fighter, i) => {
      this.scene.add(fighter.root);
      const color = i ? '#f09c88' : '#5ae1ec';
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.405, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      this.scene.add(ring);
      this.markers.push(ring);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(0.65, 20, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, wireframe: true }));
      shield.scale.set(0.8, 1.1, 0.8);
      this.scene.add(shield);
      this.shields.push(shield);
    });
    this.resize();
  }

  resize() {
    this.width = this.renderer.domElement.clientWidth;
    this.height = this.renderer.domElement.clientHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, game: Combat, animationDt = dt) {
    this.time += dt;
    game.events.forEach(hit => this.hit(hit));
    this.fighters.forEach((fighter, i) => {
      fighter.update(dt, game.fighters[i], animationDt <= 0, animationDt);
      this.markers[i].position.x = game.fighters[i].x;
      this.markers[i].scale.setScalar(1 + Math.sin(this.time * 2) * 0.025);
      this.shields[i].visible = game.fighters[i].guard;
      this.shields[i].position.set(game.fighters[i].x, 0.9, 0);
    });
    this.updateEffects(dt);
    const [a, b] = game.fighters;
    this.center = THREE.MathUtils.damp(this.center, (a.x + b.x) / 2, 3, dt);
    const aspect = Math.max(0.45, this.camera.aspect);
    const framing = Math.max(7.1, (Math.abs(a.x - b.x) + 3.1) / (2 * Math.tan(THREE.MathUtils.degToRad(19)) * aspect));
    this.distance = THREE.MathUtils.damp(this.distance, framing, 3, dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const jitter = this.shake * Math.sin(this.time * 90);
    this.camera.position.set(this.center + jitter * 0.12, 2.55 + jitter * 0.08, this.distance);
    this.camera.lookAt(this.center, aspect < 1 ? 0.8 : 0.95, 0);
    this.renderer.render(this.scene, this.camera);
  }

  reset() {
    this.fighters.forEach(f => f.reset());
    this.sparks.forEach(s => { this.scene.remove(s.mesh); (s.mesh.material as THREE.Material).dispose(); });
    this.waves.forEach(w => { this.scene.remove(w.mesh); w.mesh.material.dispose(); });
    this.sparks = [];
    this.waves = [];
    this.shake = 0;
  }

  private random() { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng / 4294967296; }

  private environment() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(75, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#668494') }, horizon: { value: new THREE.Color('#e3b793') } },
      vertexShader: 'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 direction;
        void main(){ float h=clamp(normalize(direction).y*1.8,0.,1.); gl_FragColor=vec4(mix(horizon,top,h),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.scene.add(sky);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(2.0, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffe2b8', fog: false, toneMapped: false }));
    sun.position.set(-17, 5.5, -48);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight('#d7ecf5', '#454354', 2.2));
    const key = new THREE.DirectionalLight('#ffe2c2', 3.2);
    key.position.set(-6, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 24;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#a6e8ee', 2);
    rim.position.set(3, 4, -5);
    this.scene.add(rim);
    // Far silhouettes and lower city blocks keep the playable plane readable.
    for (let i = 0; i < 32; i++) {
      const height = 2 + this.random() * 6;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(3 + this.random() * 3, height, 5), new THREE.MeshStandardMaterial({ color: i % 2 ? '#677f8b' : '#779096', roughness: 1 }));
      peak.position.set((i - 16) * 3.5, height / 2 - 3.3, -34 - this.random() * 10);
      this.scene.add(peak);
    }
    const windowTexture = this.windowTexture();
    const cityMaterial = new THREE.MeshStandardMaterial({ map: windowTexture, color: '#96a4aa', roughness: 0.95 });
    const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#667e85', roughness: 1 }));
    cityGround.rotation.x = -Math.PI / 2;
    cityGround.position.y = -2.2;
    this.scene.add(cityGround);
    for (let i = 0; i < 36; i++) {
      const height = 0.8 + this.random() * 3.5;
      const building = new THREE.Mesh(new THREE.BoxGeometry(0.9 + this.random() * 1.2, height, 1.2), cityMaterial);
      building.position.set((i - 18) * 1.7, height / 2 - 2.2, -16 - this.random() * 7);
      this.scene.add(building);
      if (i % 3 === 0) {
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 5), new THREE.MeshStandardMaterial({ color: '#4b636e' }));
        antenna.position.copy(building.position).add(new THREE.Vector3(0, height / 2 + 0.6, 0));
        this.scene.add(antenna);
      }
    }
  }

  private windowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#71848b';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 12; y < 250; y += 20) for (let x = 9; x < 122; x += 18) {
      ctx.fillStyle = this.random() < 0.15 ? '#d3b79a' : '#536d79';
      ctx.fillRect(x, y, 9, 12);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private platform() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.34, 5.2), new THREE.MeshStandardMaterial({ color: '#263d47', roughness: 0.86, metalness: 0.18 }));
    slab.position.y = -0.19;
    slab.receiveShadow = true;
    this.scene.add(slab);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 5.1), new THREE.MeshStandardMaterial({ map: this.floorTexture(), color: '#96a5aa', roughness: 0.9 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = -0.01;
    top.receiveShadow = true;
    this.scene.add(top);
    const lightMaterial = new THREE.MeshBasicMaterial({ color: '#90e7e5' });
    for (const z of [-2.5, 2.5]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.018, 0.024), lightMaterial);
      line.position.set(0, 0.005, z);
      this.scene.add(line);
    }
    for (const x of [-6.05, 6.05]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 5), lightMaterial);
      line.position.set(x, 0.005, 0);
      this.scene.add(line);
    }
    const circle = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.115, 96), new THREE.MeshBasicMaterial({ color: '#d5dad1', opacity: 0.38, transparent: true, side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.001;
    this.scene.add(circle);
    const center = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.435, 48), circle.material);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.001;
    this.scene.add(center);
    for (const x of [-5.4, 5.4]) {
      for (const z of [-2.1, 2.1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.05, 0.2), new THREE.MeshStandardMaterial({ color: '#233842', roughness: 0.5 }));
        post.position.set(x, 0.52, z);
        this.scene.add(post);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.65, 0.025), lightMaterial);
        strip.position.set(x, 0.57, z + 0.11);
        this.scene.add(strip);
      }
    }
    const railMaterial = new THREE.MeshStandardMaterial({ color: '#405963', roughness: 0.7 });
    for (const y of [0.15, 0.58]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.035, 0.045), railMaterial);
      rail.position.set(0, y, -2.15);
      this.scene.add(rail);
    }
  }

  private floorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#879397';
    ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = this.random() > 0.5 ? '#ffffff08' : '#172c400a';
      ctx.fillRect(this.random() * 1024, this.random() * 512, 2, 2);
    }
    ctx.strokeStyle = '#283f4830';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1024; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    for (let y = 0; y < 512; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); }
    ctx.fillStyle = '#334e5740';
    ctx.font = 'bold 70px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('V A N G U A R D', 512, 450);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private hit(hit: HitEvent) {
    this.shake = hit.blocked ? 0.13 : hit.kind === 'kick' ? 0.42 : 0.25;
    const color = hit.blocked ? '#8affef' : '#ffe5aa';
    const origin = new THREE.Vector3(hit.x, hit.kind === 'kick' ? 0.92 : 1.2, 0.16);
    for (let i = 0; i < (hit.blocked ? 10 : 20); i++) {
      const mesh = new THREE.Mesh(this.sparkGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }));
      mesh.position.copy(origin);
      const angle = this.random() * Math.PI * 2;
      const velocity = new THREE.Vector3(Math.cos(angle) * (1.4 + this.random() * 2), Math.sin(angle) * 2.4 + 0.7, this.random() * 1.8);
      const life = 0.2 + this.random() * 0.25;
      this.sparks.push({ mesh, velocity, life, total: life });
      this.scene.add(mesh);
    }
    const ring = new THREE.Mesh(this.waveGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(origin);
    this.waves.push({ mesh: ring, life: 0.3 });
    this.scene.add(ring);
  }

  private updateEffects(dt: number) {
    this.sparks = this.sparks.filter(s => {
      s.life -= dt;
      if (s.life <= 0) { this.scene.remove(s.mesh); (s.mesh.material as THREE.Material).dispose(); return false; }
      s.velocity.y -= dt * 5;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.z += dt * 10;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = s.life / s.total;
      return true;
    });
    this.waves = this.waves.filter(w => {
      w.life -= dt;
      if (w.life <= 0) { this.scene.remove(w.mesh); w.mesh.material.dispose(); return false; }
      w.mesh.scale.setScalar(1 + (0.3 - w.life) * 5);
      w.mesh.material.opacity = w.life * 3;
      return true;
    });
  }
}
