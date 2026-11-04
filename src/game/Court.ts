// Construcción de la pista de pádel (REPLICA_SPEC §5.2, §5.6).
// Toda la geometría es propia y procedural: suelo con líneas, red con
// cinta, cristales, malla metálica, vallas publicitarias con texturas
// generadas, gradas y público instanciado. Nada procede del original.

import * as THREE from 'three';
import type { Surface } from '../state/modes';
import { COURT, CROWD_PER_ROW, CROWD_ROWS, CROWD_TOTAL } from './courtConstants';
import { makeAdTexture, makeFenceTexture, makeNetTexture } from './textures';

export interface CourtParts {
  group: THREE.Group;
  /** Paneles de cristal (fondos + laterales). */
  glassPanels: number;
  /** Paneles de malla (sobre cristales + laterales centrales). */
  meshPanels: number;
  /** Vallas publicitarias perimetrales. */
  adBoards: number;
  /** Espectadores instanciados (cuerpos + cabezas comparten conteo). */
  crowdCount: number;
  applySurface(surface: Surface): void;
  setCrowdVisible(visible: boolean): void;
  crowdVisible(): boolean;
  dispose(): void;
}

/** Aleatorio determinista (mulberry32): público estable entre cargas y tests. */
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

const SHIRT_COLORS = ['#c23b2e', '#2e6fc2', '#e8b93c', '#3fae6a', '#e6e6e6', '#7a4fc0', '#e2731d', '#2fb3a6', '#c22e7e', '#34506e'];
const SKIN_TONES = ['#f2c9a4', '#e0ac82', '#c68863', '#9c6644', '#7a4b2a'];

export function buildCourt(surface: Surface): CourtParts {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const floorMat = track(new THREE.MeshStandardMaterial({ color: surface.courtColor, roughness: 0.95 }));
  const apronMat = track(new THREE.MeshStandardMaterial({ color: surface.apronColor, roughness: 1 }));
  const lineMat = track(new THREE.MeshStandardMaterial({ color: surface.lineColor, roughness: 0.8 }));
  const metalMat = track(new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.55, metalness: 0.45 }));
  const glassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x9fc4de,
      transparent: true,
      opacity: 0.16,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const standMat = track(new THREE.MeshStandardMaterial({ color: 0x1c2940, roughness: 0.9 }));

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = false) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    group.add(mesh);
    return mesh;
  };

  // ---- Suelo de juego y apron exterior ----
  box(2 * COURT.halfWidth, 0.1, 2 * COURT.halfLength, floorMat, 0, -0.05, 0);
  box(17, 0.07, 27, apronMat, 0, -0.055, 0);

  // ---- Líneas reglamentarias (sobre el suelo, y = 0,007) ----
  const lw = COURT.lineWidth;
  const line = (w: number, d: number, x: number, z: number) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, 0.014, d)), lineMat);
    mesh.position.set(x, 0.007, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  line(lw, 2 * COURT.halfLength, -(COURT.halfWidth - lw / 2), 0);
  line(lw, 2 * COURT.halfLength, COURT.halfWidth - lw / 2, 0);
  line(2 * COURT.halfWidth, lw, 0, -(COURT.halfLength - lw / 2));
  line(2 * COURT.halfWidth, lw, 0, COURT.halfLength - lw / 2);
  line(2 * COURT.halfWidth, lw, 0, -COURT.serviceLineZ);
  line(2 * COURT.halfWidth, lw, 0, COURT.serviceLineZ);
  line(lw, 2 * COURT.serviceLineZ, 0, 0);

  // ---- Red con cinta (altura 0,88 m) ----
  const netGroup = new THREE.Group();
  group.add(netGroup);
  const netTexture = track(makeNetTexture());
  netTexture.repeat.set(48, 4);
  const netMat = track(
    new THREE.MeshStandardMaterial({ map: netTexture, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  const netMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(2 * COURT.halfWidth, 0.8)), netMat);
  netMesh.position.set(0, 0.44, 0);
  netGroup.add(netMesh);
  const tape = new THREE.Mesh(track(new THREE.BoxGeometry(2 * COURT.halfWidth + 0.1, 0.07, 0.05)), track(new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.7 })));
  tape.position.set(0, COURT.netHeight - 0.035, 0);
  tape.castShadow = true;
  netGroup.add(tape);
  for (const sideSign of [-1, 1]) {
    const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 10)), metalMat);
    post.position.set(sideSign * (COURT.halfWidth + 0.25), 0.475, 0);
    post.castShadow = true;
    netGroup.add(post);
  }

  // ---- Cristales: fondos completos y primeros metros de cada lateral ----
  let glassPanels = 0;
  const glass = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), glassMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    glassPanels += 1;
  };
  glass(2 * COURT.halfWidth, COURT.glassHeight, 0.06, 0, COURT.glassHeight / 2, -COURT.halfLength);
  glass(2 * COURT.halfWidth, COURT.glassHeight, 0.06, 0, COURT.glassHeight / 2, COURT.halfLength);
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      glass(0.06, COURT.glassHeight, COURT.sideGlassLength, xSign * COURT.halfWidth, COURT.glassHeight / 2, zSign * (COURT.halfLength - COURT.sideGlassLength / 2));
    }
  }
  // Marcos de los cristales: montantes y travesaño superior.
  for (const zSign of [-1, 1]) {
    for (const px of [-5, -2.5, 0, 2.5, 5]) {
      box(0.09, COURT.glassHeight, 0.09, metalMat, px, COURT.glassHeight / 2, zSign * COURT.halfLength);
    }
    box(2 * COURT.halfWidth + 0.1, 0.09, 0.09, metalMat, 0, COURT.glassHeight, zSign * COURT.halfLength);
  }
  for (const xSign of [-1, 1]) {
    box(0.09, 0.09, COURT.sideGlassLength, metalMat, xSign * COURT.halfWidth, COURT.glassHeight, -8);
    box(0.09, 0.09, COURT.sideGlassLength, metalMat, xSign * COURT.halfWidth, COURT.glassHeight, 8);
  }

  // ---- Malla metálica: sobre los cristales y laterales centrales ----
  const fenceBaseTexture = track(makeFenceTexture());
  let meshPanels = 0;
  const fence = (w: number, h: number, x: number, y: number, z: number, rotationY: number) => {
    const texture = fenceBaseTexture.clone();
    texture.needsUpdate = true;
    texture.repeat.set(Math.round(w * 2), Math.round(h * 2));
    disposables.push(texture);
    const mat = track(
      new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
    );
    const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    group.add(mesh);
    meshPanels += 1;
  };
  const upperHeight = COURT.wallHeight - COURT.glassHeight; // 1 m sobre el cristal
  fence(2 * COURT.halfWidth, upperHeight, 0, COURT.glassHeight + upperHeight / 2, -COURT.halfLength, 0);
  fence(2 * COURT.halfWidth, upperHeight, 0, COURT.glassHeight + upperHeight / 2, COURT.halfLength, 0);
  for (const xSign of [-1, 1]) {
    fence(COURT.sideGlassLength, upperHeight, xSign * COURT.halfWidth, COURT.glassHeight + upperHeight / 2, -8, Math.PI / 2);
    fence(COURT.sideGlassLength, upperHeight, xSign * COURT.halfWidth, COURT.glassHeight + upperHeight / 2, 8, Math.PI / 2);
    // Tramo central lateral completo (0–4 m), con los postes de la malla.
    fence(2 * (COURT.halfLength - COURT.sideGlassLength), COURT.wallHeight, xSign * COURT.halfWidth, COURT.wallHeight / 2, 0, Math.PI / 2);
    for (const pz of [-6, -3, 0, 3, 6]) {
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, COURT.wallHeight, 8)), metalMat);
      post.position.set(xSign * COURT.halfWidth, COURT.wallHeight / 2, pz);
      group.add(post);
    }
  }

  // ---- Vallas publicitarias perimetrales (texturas procedurales propias) ----
  const adTextures = [track(makeAdTexture(0)), track(makeAdTexture(1))];
  let adBoards = 0;
  const adBoard = (x: number, z: number, rotationY: number, variant: 0 | 1) => {
    const board = new THREE.Group();
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(6.1, 1.1, 0.08)), metalMat);
    back.position.y = 0.55;
    board.add(back);
    const face = new THREE.Mesh(
      track(new THREE.PlaneGeometry(6, 1.008)),
      track(new THREE.MeshStandardMaterial({ map: adTextures[variant], roughness: 0.6 })),
    );
    face.position.set(0, 0.55, 0.045);
    board.add(face);
    board.position.set(x, 0, z);
    board.rotation.y = rotationY;
    group.add(board);
    adBoards += 1;
  };
  [-6.4, 0, 6.4].forEach((z, i) => {
    adBoard(7.6, z, -Math.PI / 2, (i % 2) as 0 | 1);
    adBoard(-7.6, z, Math.PI / 2, ((i + 1) % 2) as 0 | 1);
  });
  [-3.2, 3.2].forEach((x, i) => {
    adBoard(x, 12.8, Math.PI, (i % 2) as 0 | 1);
    adBoard(x, -12.8, 0, ((i + 1) % 2) as 0 | 1);
  });

  // ---- Gradas y público instanciado (geometría propia, sin GLB) ----
  const standsGroup = new THREE.Group();
  group.add(standsGroup);
  const stepDepth = 0.95;
  const stepHeight = 0.5;
  // Gradas laterales (x = ±): 3 peldaños que suben alejándose de la pista.
  for (const xSign of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(stepDepth, stepHeight * (i + 1), 20.5)), standMat);
      step.position.set(xSign * (9.3 + i * stepDepth), (stepHeight * (i + 1)) / 2, 0);
      step.receiveShadow = true;
      standsGroup.add(step);
    }
  }
  // Grada de fondo (+z).
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(track(new THREE.BoxGeometry(20.5, stepHeight * (i + 1), stepDepth)), standMat);
    step.position.set(0, (stepHeight * (i + 1)) / 2, 13.6 + i * stepDepth);
    step.receiveShadow = true;
    standsGroup.add(step);
  }

  const crowdGroup = new THREE.Group();
  group.add(crowdGroup);
  const bodyGeo = track(new THREE.CylinderGeometry(0.155, 0.2, 0.62, 6));
  const headGeo = track(new THREE.SphereGeometry(0.125, 8, 6));
  const bodyMat = track(new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  const headMat = track(new THREE.MeshStandardMaterial({ roughness: 0.7 }));
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, CROWD_TOTAL);
  const heads = new THREE.InstancedMesh(headGeo, headMat, CROWD_TOTAL);
  const rand = mulberry32(20261104);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let crowdIndex = 0;
  const seatFigure = (x: number, stepTop: number, z: number) => {
    const jx = (rand() - 0.5) * 0.14;
    const jz = (rand() - 0.5) * 0.14;
    dummy.position.set(x + jx, stepTop + 0.31, z + jz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(crowdIndex, dummy.matrix);
    bodies.setColorAt(crowdIndex, color.set(SHIRT_COLORS[Math.floor(rand() * SHIRT_COLORS.length)] as string));
    dummy.position.y = stepTop + 0.75;
    dummy.updateMatrix();
    heads.setMatrixAt(crowdIndex, dummy.matrix);
    heads.setColorAt(crowdIndex, color.set(SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)] as string));
    crowdIndex += 1;
  };
  for (const xSign of [-1, 1]) {
    for (let row = 0; row < CROWD_ROWS; row++) {
      const x = xSign * (9.3 + row * stepDepth);
      const top = stepHeight * (row + 1);
      for (let k = 0; k < CROWD_PER_ROW; k++) {
        seatFigure(x, top, -9.24 + k * 0.56);
      }
    }
  }
  for (let row = 0; row < CROWD_ROWS; row++) {
    const z = 13.6 + row * stepDepth;
    const top = stepHeight * (row + 1);
    for (let k = 0; k < CROWD_PER_ROW; k++) {
      seatFigure(-9.24 + k * 0.56, top, z);
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  crowdGroup.add(bodies, heads);

  // ---- Focos perimetrales (decoración; brillan sobre todo de noche) ----
  const floodMat = track(new THREE.MeshStandardMaterial({ color: 0x11141a, emissive: 0xfff6d8, emissiveIntensity: 1.6, roughness: 0.4 }));
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.09, 7, 8)), metalMat);
      pole.position.set(xSign * 7.6, 3.5, zSign * 12.4);
      group.add(pole);
      const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.3, 0.1)), floodMat);
      head.position.set(xSign * 7.6, 7.05, zSign * 12.4);
      head.lookAt(0, 0.4, 0);
      group.add(head);
    }
  }

  let crowd = true;
  return {
    group,
    glassPanels,
    meshPanels,
    adBoards,
    crowdCount: CROWD_TOTAL,
    applySurface(next: Surface) {
      floorMat.color.set(next.courtColor);
      apronMat.color.set(next.apronColor);
      lineMat.color.set(next.lineColor);
    },
    setCrowdVisible(visible: boolean) {
      crowd = visible;
      crowdGroup.visible = visible;
    },
    crowdVisible() {
      return crowd;
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
