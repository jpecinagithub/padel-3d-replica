// Entorno de la escena (REPLICA_SPEC §5.1, §5.6): cielo degradado, niebla,
// luces (hemisférica + clave con sombras + relleno), estrellas, nubes,
// montañas y suelo exterior. Todo procedural, sin assets externos.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AmbiencePreset } from './ambiencePresets';
import { makeBuildingTextures, makeVenueTexture } from './textures';

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
  // Basic a propósito: el disco queda siempre fuera de la cámara de
  // sombras (±18 m), así que no pierde nada y ahorra el sombreado
  // completo por fragmento en la zona más amplia de la pantalla.
  const groundMat = track(new THREE.MeshBasicMaterial({ color: 0x0b1220 }));
  const ground = new THREE.Mesh(track(new THREE.CircleGeometry(230, 40)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
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

  // ---- Suelo del recinto (Fase 10): losa de asfalto pintado que
  // cierra visualmente el estadio entre el apron y el skyline. ----
  const venueMat = track(new THREE.MeshLambertMaterial({ map: track(makeVenueTexture()) }));
  const venue = new THREE.Mesh(track(new THREE.PlaneGeometry(46, 56)), venueMat);
  venue.rotation.x = -Math.PI / 2;
  venue.position.y = -0.048;
  venue.receiveShadow = true;
  group.add(venue);

  // ---- Skyline (Fase 10): anillo de edificios con ventanas
  // iluminadas (textura procedural propia, dos tonos). La intensidad
  // emisiva la manda el preset: fuerte de noche, casi nula de día. ----
  const buildingMats: THREE.MeshLambertMaterial[] = [];
  {
    const styles = [makeBuildingTextures('warm'), makeBuildingTextures('cool')];
    for (const s of styles) {
      track(s.map);
      track(s.emissiveMap);
      buildingMats.push(
        track(
          new THREE.MeshLambertMaterial({
            map: s.map,
            emissiveMap: s.emissiveMap,
            emissive: 0xffffff,
            emissiveIntensity: 1.35,
          }),
        ),
      );
    }
    for (let b = 0; b < 14; b++) {
      const angle = (b / 14) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const radius = 36 + rand() * 16;
      const w = 8 + rand() * 6;
      const h = 16 + rand() * 28;
      const d = 8 + rand() * 6;
      const building = new THREE.Mesh(
        track(new THREE.BoxGeometry(w, h, d)),
        buildingMats[b % 2] as THREE.MeshLambertMaterial,
      );
      building.position.set(Math.cos(angle) * radius, h / 2 - 0.06, Math.sin(angle) * radius);
      building.rotation.y = -angle;
      group.add(building);
    }
  }

  // ---- Palmeras low-poly propias (Fase 10): tronco de segmentos y
  // corona de frondas curvadas, fusionadas en una sola geometría con
  // colores por vértice por palmera. ----
  const palmMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  const paintGeo = (geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry => {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position?.count ?? 0;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };
  const buildPalm = (): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    let x = 0;
    let y = 0;
    const lean = (rand() - 0.5) * 0.22;
    for (let s = 0; s < 4; s++) {
      const seg = new THREE.CylinderGeometry(0.09 - 0.012 * s, 0.115 - 0.012 * s, 0.85, 6);
      seg.translate(x, y + 0.42, 0);
      x += lean * 0.85;
      y += 0.8;
      parts.push(paintGeo(seg, '#6b4a2f'));
    }
    const greens = ['#2e7d43', '#35924e', '#27703b', '#3fa055'];
    for (let f = 0; f < 7; f++) {
      const frond = new THREE.PlaneGeometry(0.34, 1.7, 1, 4);
      frond.translate(0, 0.85, 0);
      const pos = frond.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const t = (pos.getY(v) as number) / 1.7;
        pos.setZ(v, -0.5 * t * t);
      }
      frond.computeVertexNormals();
      const yaw = (f / 7) * Math.PI * 2 + rand() * 0.5;
      const m = new THREE.Matrix4()
        .makeRotationY(yaw)
        .multiply(new THREE.Matrix4().makeRotationX(1.05 + rand() * 0.25));
      frond.applyMatrix4(m);
      frond.translate(x, y + 0.15, 0);
      parts.push(paintGeo(frond, greens[f % greens.length] as string));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('No se pudo fusionar la palmera');
    return merged;
  };
  const palmSpots: [number, number][] = [
    [14.5, 20],
    [-14.5, 20],
    [14.5, -20],
    [-14.5, -20],
    [22, 4],
    [-22, -4],
    [0, 26.5],
  ];
  for (const [px, pz] of palmSpots) {
    const palm = new THREE.Mesh(track(buildPalm()), palmMat);
    palm.position.set(px, -0.05, pz);
    palm.rotation.y = rand() * Math.PI * 2;
    const s = 0.9 + rand() * 0.35;
    palm.scale.set(s, s * (0.95 + rand() * 0.2), s);
    group.add(palm);
  }

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
      // Fase 10: ventanas del skyline según el ambiente.
      for (const m of buildingMats) m.emissiveIntensity = preset.buildingGlow;
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
