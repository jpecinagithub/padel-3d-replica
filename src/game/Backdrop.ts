// Entorno de la escena (REPLICA_SPEC §5.1, §5.6): cielo degradado, niebla,
// luces (hemisférica + clave con sombras + relleno), estrellas, nubes,
// montañas y suelo exterior. Todo procedural, sin assets externos.

import * as THREE from 'three';
import type { AmbiencePreset } from './ambiencePresets';

export interface Backdrop {
  group: THREE.Group;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  /** Aplica el preset a cielo, niebla, luces y decorado de la escena dada. */
  applyPreset(preset: AmbiencePreset, scene: THREE.Scene): void;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition).y;
    float mixFactor = pow(max(h, 0.0), 0.65);
    gl_FragColor = vec4(mix(horizonColor, topColor, mixFactor), 1.0);
  }
`;

export function buildBackdrop(): Backdrop {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const rand = mulberry32(1884);

  // ---- Cielo: esfera con degradado cenit→horizonte ----
  const skyUniforms = {
    topColor: { value: new THREE.Color('#04060f') },
    horizonColor: { value: new THREE.Color('#16263f') },
  };
  const skyMat = track(
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(230, 24, 12)), skyMat);
  group.add(sky);

  // ---- Suelo exterior ----
  const groundMat = track(new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 1 }));
  const ground = new THREE.Mesh(track(new THREE.CircleGeometry(230, 40)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- Estrellas (solo de noche; se generan 900 y se muestran u ocultan) ----
  const starCount = 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const azimuth = rand() * Math.PI * 2;
    const y = 0.06 + rand() * 0.94;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    starPositions[i * 3] = Math.cos(azimuth) * ring * 215;
    starPositions[i * 3 + 1] = y * 215;
    starPositions[i * 3 + 2] = Math.sin(azimuth) * ring * 215;
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = track(
    new THREE.PointsMaterial({ color: 0xd8e6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.95, fog: false }),
  );
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  // ---- Nubes: grupos de esferas aplastadas con material compartido ----
  const cloudMat = track(new THREE.MeshStandardMaterial({ color: 0xaebfd8, transparent: true, opacity: 0.1, roughness: 1, flatShading: true }));
  const cloudGroup = new THREE.Group();
  for (let c = 0; c < 7; c++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(track(new THREE.SphereGeometry(4 + rand() * 5, 7, 5)), cloudMat);
      puff.position.set(p * 5 - puffs * 2.2, rand() * 1.2, (rand() - 0.5) * 4);
      puff.scale.y = 0.38;
      cloud.add(puff);
    }
    const angle = (c / 7) * Math.PI * 2 + rand() * 0.5;
    const radius = 75 + rand() * 70;
    cloud.position.set(Math.cos(angle) * radius, 36 + rand() * 20, Math.sin(angle) * radius);
    cloudGroup.add(cloud);
  }
  group.add(cloudGroup);

  // ---- Montañas: anillo de conos bajos en el horizonte ----
  const mountainMat = track(new THREE.MeshStandardMaterial({ color: 0x0d1626, roughness: 1, flatShading: true }));
  const mountainGroup = new THREE.Group();
  for (let m = 0; m < 11; m++) {
    const angle = (m / 11) * Math.PI * 2 + rand() * 0.3;
    const radius = 165 + rand() * 30;
    const height = 15 + rand() * 15;
    const cone = new THREE.Mesh(track(new THREE.ConeGeometry(20 + rand() * 14, height, 5)), mountainMat);
    cone.position.set(Math.cos(angle) * radius, height / 2 - 1.5, Math.sin(angle) * radius);
    mountainGroup.add(cone);
  }
  group.add(mountainGroup);

  // ---- Luces ----
  const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x1a2438, 0.55);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xcfe4ff, 1.7);
  sun.position.set(18, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  group.add(sun);
  group.add(sun.target);
  const fill = new THREE.DirectionalLight(0x5a76b8, 0.4);
  fill.position.set(-18, 14, -12);
  group.add(fill);
  group.add(fill.target);

  return {
    group,
    hemi,
    sun,
    fill,
    applyPreset(preset: AmbiencePreset, scene: THREE.Scene) {
      skyUniforms.topColor.value.set(preset.skyTop);
      skyUniforms.horizonColor.value.set(preset.skyHorizon);
      scene.background = new THREE.Color(preset.skyHorizon);
      scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
      hemi.color.set(preset.hemiSky);
      hemi.groundColor.set(preset.hemiGround);
      hemi.intensity = preset.hemiIntensity;
      sun.color.set(preset.sunColor);
      sun.intensity = preset.sunIntensity;
      sun.position.set(...preset.sunPosition);
      fill.color.set(preset.fillColor);
      fill.intensity = preset.fillIntensity;
      fill.position.set(-preset.sunPosition[0], 14, -preset.sunPosition[2]);
      stars.visible = preset.stars > 0;
      cloudMat.color.set(preset.cloudColor);
      cloudMat.opacity = preset.cloudOpacity;
      mountainMat.color.set(preset.mountainColor);
      groundMat.color.set(preset.groundColor);
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
