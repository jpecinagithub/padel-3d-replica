// Construcción de la pista de pádel (REPLICA_SPEC §5.2, §5.6).
// Toda la geometría es propia y procedural: suelo con líneas, red con
// cinta, cristales, malla metálica, vallas publicitarias con texturas
// generadas, gradas y público instanciado. Nada procede del original.

import * as THREE from 'three';
import type { Surface } from '../state/modes';
import { COURT, CROWD_PLAN, CROWD_TOTAL, STAND } from './courtConstants';
import { makeAdTexture, makeCourtGrainTexture, makeFenceTexture, makeNetTexture } from './textures';

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
  /** Fase 10: opacidad de los conos de luz de los focos según el ambiente. */
  setFloodCones(opacity: number): void;
  /** Fase 10: reacción visual de la grada al cerrar un punto. */
  crowdCheer(big: boolean): void;
  /** Fase 10: avanza la animación de celebración de la grada. */
  update(dt: number): void;
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

  // Fase 10: el suelo de juego lleva grano procedural y un brillo
  // sutil de entorno (roughness baja + envMap) en vez de clearcoat:
  // el coste por fragmento del Physical se dispara en render por
  // software y el Standard da el mismo reflejo suave en la práctica.
  const grainTexture = track(makeCourtGrainTexture());
  grainTexture.repeat.set(2, 4);
  const apronGrain = grainTexture.clone();
  apronGrain.needsUpdate = true;
  apronGrain.repeat.set(4, 6);
  disposables.push(apronGrain);
  const floorMat = track(
    new THREE.MeshStandardMaterial({
      color: surface.courtColor,
      map: grainTexture,
      roughness: 0.5,
      metalness: 0.05,
      envMapIntensity: 0.8,
    }),
  );
  const apronMat = track(new THREE.MeshLambertMaterial({ color: surface.apronColor, map: apronGrain }));
  const lineMat = track(new THREE.MeshStandardMaterial({ color: surface.lineColor, roughness: 0.8 }));
  const metalMat = track(new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.55, metalness: 0.45 }));
  const glassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x9fc4de,
      transparent: true,
      opacity: 0.16,
      roughness: 0.08,
      metalness: 0.1,
      // Fase 10: más presencia del reflejo del entorno en el cristal.
      envMapIntensity: 1.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const standMat = track(new THREE.MeshLambertMaterial({ color: 0x1c2940 }));

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
  // Fase 10: baldosa de 4×4 celdas → malla de ~2,2 cm en la red.
  netTexture.repeat.set(114, 9);
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
  // Marcos de los cristales (Fase 10: perfil más grueso y travesaño
  // intermedio a 1,5 m, como los cerramientos reales).
  for (const zSign of [-1, 1]) {
    for (const px of [-5, -2.5, 0, 2.5, 5]) {
      box(0.11, COURT.glassHeight, 0.11, metalMat, px, COURT.glassHeight / 2, zSign * COURT.halfLength);
    }
    box(2 * COURT.halfWidth + 0.1, 0.11, 0.11, metalMat, 0, COURT.glassHeight, zSign * COURT.halfLength);
    box(2 * COURT.halfWidth + 0.1, 0.08, 0.08, metalMat, 0, 1.5, zSign * COURT.halfLength);
  }
  for (const xSign of [-1, 1]) {
    box(0.11, 0.11, COURT.sideGlassLength, metalMat, xSign * COURT.halfWidth, COURT.glassHeight, -8);
    box(0.11, 0.11, COURT.sideGlassLength, metalMat, xSign * COURT.halfWidth, COURT.glassHeight, 8);
    box(0.08, 0.08, COURT.sideGlassLength, metalMat, xSign * COURT.halfWidth, 1.5, -8);
    box(0.08, 0.08, COURT.sideGlassLength, metalMat, xSign * COURT.halfWidth, 1.5, 8);
  }

  // ---- Malla metálica: sobre los cristales y laterales centrales ----
  const fenceBaseTexture = track(makeFenceTexture());
  let meshPanels = 0;
  const fence = (w: number, h: number, x: number, y: number, z: number, rotationY: number) => {
    const texture = fenceBaseTexture.clone();
    texture.needsUpdate = true;
    // Fase 10: baldosa de 4×4 celdas y repetición ×5 → celda de ~5 cm.
    texture.repeat.set(Math.round(w * 5), Math.round(h * 5));
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
  // Fase 10: rotan las cuatro marcas inventadas de la réplica.
  const adTextures = [track(makeAdTexture(0)), track(makeAdTexture(1)), track(makeAdTexture(2)), track(makeAdTexture(3))];
  let adBoards = 0;
  const adBoard = (x: number, z: number, rotationY: number, variant: 0 | 1 | 2 | 3) => {
    const board = new THREE.Group();
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(6.1, 1.1, 0.08)), metalMat);
    back.position.y = 0.55;
    board.add(back);
    const face = new THREE.Mesh(
      track(new THREE.PlaneGeometry(6, 1.008)),
      track(new THREE.MeshLambertMaterial({ map: adTextures[variant] })),
    );
    face.position.set(0, 0.55, 0.045);
    board.add(face);
    board.position.set(x, 0, z);
    board.rotation.y = rotationY;
    group.add(board);
    adBoards += 1;
  };
  [-6.4, 0, 6.4].forEach((z, i) => {
    adBoard(7.6, z, -Math.PI / 2, (i % 4) as 0 | 1 | 2 | 3);
    adBoard(-7.6, z, Math.PI / 2, ((i + 1) % 4) as 0 | 1 | 2 | 3);
  });
  [-3.2, 3.2].forEach((x, i) => {
    adBoard(x, 12.8, Math.PI, ((i + 2) % 4) as 0 | 1 | 2 | 3);
    adBoard(x, -12.8, 0, ((i + 3) % 4) as 0 | 1 | 2 | 3);
  });

  // ---- Gradas (Fase 10): 10 peldaños en los 4 lados, con muro y
  // remate superior; cierran el recinto como en el modelo. ----
  const standsGroup = new THREE.Group();
  group.add(standsGroup);
  const wallMat = track(new THREE.MeshLambertMaterial({ color: 0x141d2e }));
  const rimMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1a2436, emissive: 0x8fb4dd, emissiveIntensity: 0.35, roughness: 0.6 }),
  );
  const latLen = 2 * STAND.lateralHalf + 2 * STAND.stepDepth;
  const backLen = 2 * STAND.backHalf + 2 * STAND.stepDepth;
  const wallH = STAND.rows * STAND.stepHeight + 0.9;
  for (let i = 0; i < STAND.rows; i++) {
    const h = STAND.stepHeight * (i + 1);
    for (const xSign of [-1, 1]) {
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(STAND.stepDepth, h, latLen)), standMat);
      step.position.set(xSign * (STAND.lateralStart + i * STAND.stepDepth + STAND.stepDepth / 2), h / 2, 0);
      step.receiveShadow = true;
      standsGroup.add(step);
    }
    for (const zSign of [-1, 1]) {
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(backLen, h, STAND.stepDepth)), standMat);
      step.position.set(0, h / 2, zSign * (STAND.backStart + i * STAND.stepDepth + STAND.stepDepth / 2));
      step.receiveShadow = true;
      standsGroup.add(step);
    }
  }
  for (const xSign of [-1, 1]) {
    const wall = new THREE.Mesh(track(new THREE.BoxGeometry(0.3, wallH, latLen)), wallMat);
    wall.position.set(xSign * (STAND.lateralStart + STAND.rows * STAND.stepDepth + 0.15), wallH / 2, 0);
    standsGroup.add(wall);
    const rim = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.07, latLen)), rimMat);
    rim.position.set(wall.position.x, wallH + 0.035, 0);
    standsGroup.add(rim);
  }
  for (const zSign of [-1, 1]) {
    const wall = new THREE.Mesh(track(new THREE.BoxGeometry(backLen, wallH, 0.3)), wallMat);
    wall.position.set(0, wallH / 2, zSign * (STAND.backStart + STAND.rows * STAND.stepDepth + 0.15));
    standsGroup.add(wall);
    const rim = new THREE.Mesh(track(new THREE.BoxGeometry(backLen, 0.07, 0.36)), rimMat);
    rim.position.set(0, wallH + 0.035, wall.position.z);
    standsGroup.add(rim);
  }

  // ---- Público (Fase 10): 1.754 figuras instanciadas sobre el plan
  // determinista de courtConstants (4 gradas × 10 filas, con pasillos
  // y huecos). Cuerpo y cabeza comparten matriz; un subconjunto lleva
  // brazos en alto y es el que se levanta cuando cae un punto. ----
  const crowdGroup = new THREE.Group();
  group.add(crowdGroup);
  // Geometría deliberadamente ligera: a la distancia de la grada una
  // cápsula de 5 lados y una esfera de 5×4 se leen igual que las
  // densas, y el coste por vértice manda en el render por software.
  const bodyGeo = track(new THREE.CapsuleGeometry(0.155, 0.34, 1, 5));
  bodyGeo.translate(0, 0.42, 0);
  const headGeo = track(new THREE.SphereGeometry(0.105, 5, 4));
  headGeo.translate(0, 0.97, 0);
  const armGeoL = track(new THREE.CapsuleGeometry(0.045, 0.3, 1, 4));
  armGeoL.translate(0, 0.19, 0);
  armGeoL.rotateZ(0.45);
  const armGeoR = track(new THREE.CapsuleGeometry(0.045, 0.3, 1, 4));
  armGeoR.translate(0, 0.19, 0);
  armGeoR.rotateZ(-0.45);
  const bodyMat = track(new THREE.MeshLambertMaterial({}));
  const headMat = track(new THREE.MeshLambertMaterial({}));
  const armMat = track(new THREE.MeshLambertMaterial({}));
  const bodies = track(new THREE.InstancedMesh(bodyGeo, bodyMat, CROWD_TOTAL));
  const heads = track(new THREE.InstancedMesh(headGeo, headMat, CROWD_TOTAL));
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  const rand = mulberry32(91517);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const baseMatrices: THREE.Matrix4[] = [];
  const shirtColors: THREE.Color[] = [];
  const armsUpIdx: number[] = [];
  CROWD_PLAN.forEach((seat, i) => {
    dummy.position.set(seat.x, seat.topY + 0.05, seat.z);
    dummy.rotation.set(0, seat.facing, 0);
    dummy.scale.set(1, seat.standing ? 1 : 0.78, 1);
    dummy.updateMatrix();
    baseMatrices.push(dummy.matrix.clone());
    bodies.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    const shirt = new THREE.Color(SHIRT_COLORS[Math.floor(rand() * SHIRT_COLORS.length)] as string);
    shirtColors.push(shirt);
    bodies.setColorAt(i, shirt);
    heads.setColorAt(i, color.set(SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)] as string));
    if (seat.armsUp) armsUpIdx.push(i);
  });
  const armsL = track(new THREE.InstancedMesh(armGeoL, armMat, armsUpIdx.length));
  const armsR = track(new THREE.InstancedMesh(armGeoR, armMat, armsUpIdx.length));
  armsL.frustumCulled = false;
  armsR.frustumCulled = false;
  const armBaseL: THREE.Matrix4[] = [];
  const armBaseR: THREE.Matrix4[] = [];
  const shoulder = new THREE.Matrix4();
  armsUpIdx.forEach((seatIdx, j) => {
    shoulder.makeTranslation(-0.21, 0.6, 0.03);
    armBaseL.push((baseMatrices[seatIdx] as THREE.Matrix4).clone().multiply(shoulder));
    armsL.setMatrixAt(j, armBaseL[j] as THREE.Matrix4);
    armsL.setColorAt(j, shirtColors[seatIdx] as THREE.Color);
    shoulder.makeTranslation(0.21, 0.6, 0.03);
    armBaseR.push((baseMatrices[seatIdx] as THREE.Matrix4).clone().multiply(shoulder));
    armsR.setMatrixAt(j, armBaseR[j] as THREE.Matrix4);
    armsR.setColorAt(j, shirtColors[seatIdx] as THREE.Color);
  });
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  armsL.instanceMatrix.needsUpdate = true;
  armsR.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  if (armsL.instanceColor) armsL.instanceColor.needsUpdate = true;
  if (armsR.instanceColor) armsR.instanceColor.needsUpdate = true;
  crowdGroup.add(bodies, heads, armsL, armsR);

  // Celebración: temporizador con envolvente senoidal; solo el
  // subconjunto de brazos en alto bota (cuerpo, cabeza y brazos se
  // desplazan juntos en Y, sin tocar el plan ni las matrices base).
  let cheerLeft = 0;
  let cheerDuration = 1;
  let cheerElapsed = 0;
  const tmpM = new THREE.Matrix4();
  const tmpT = new THREE.Matrix4();
  const crowdSystem = {
    cheer(big: boolean) {
      cheerDuration = big ? 3.4 : 2.4;
      cheerLeft = cheerDuration;
    },
    update(dt: number) {
      cheerElapsed += dt;
      if (cheerLeft <= 0 || !crowdGroup.visible) return;
      cheerLeft = Math.max(0, cheerLeft - dt);
      const amp = Math.sin((1 - cheerLeft / cheerDuration) * Math.PI);
      for (let j = 0; j < armsUpIdx.length; j++) {
        const seatIdx = armsUpIdx[j] as number;
        const seat = CROWD_PLAN[seatIdx];
        if (!seat) continue;
        const bob = Math.abs(Math.sin(cheerElapsed * 9 + seat.phase)) * 0.055 * amp;
        tmpT.makeTranslation(0, bob, 0);
        tmpM.multiplyMatrices(tmpT, armBaseL[j] as THREE.Matrix4);
        armsL.setMatrixAt(j, tmpM);
        tmpM.multiplyMatrices(tmpT, armBaseR[j] as THREE.Matrix4);
        armsR.setMatrixAt(j, tmpM);
        tmpM.multiplyMatrices(tmpT, baseMatrices[seatIdx] as THREE.Matrix4);
        bodies.setMatrixAt(seatIdx, tmpM);
        heads.setMatrixAt(seatIdx, tmpM);
      }
      armsL.instanceMatrix.needsUpdate = true;
      armsR.instanceMatrix.needsUpdate = true;
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
  };

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

  // ---- Conos de luz de los focos (Fase 10): conos translúcidos
  // aditivos desde cada cabezal hacia la pista; la opacidad la manda
  // el preset de ambiente (0 de día). ----
  const coneMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const coneGroup = new THREE.Group();
  group.add(coneGroup);
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const headPos = new THREE.Vector3(xSign * 7.6, 7.0, zSign * 12.4);
      const target = new THREE.Vector3(xSign * 2.2, 0, zSign * 3.6);
      const axis = headPos.clone().sub(target);
      const len = axis.length() * 0.85;
      const cone = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 2.7, len, 20, 1, true)), coneMat);
      cone.position.copy(headPos).add(target).multiplyScalar(0.5);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
      coneGroup.add(cone);
    }
  }

  // ---- Bancos de equipo junto a la red (Fase 10) ----
  const benchMat = track(new THREE.MeshStandardMaterial({ color: 0x2b3a52, roughness: 0.8 }));
  for (const xSign of [-1, 1]) {
    box(0.42, 0.42, 2.4, benchMat, xSign * (COURT.halfWidth + 1.05), 0.21, 0);
    box(0.48, 0.07, 2.5, metalMat, xSign * (COURT.halfWidth + 1.05), 0.455, 0);
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
    setFloodCones(opacity: number) {
      coneMat.opacity = opacity;
      coneGroup.visible = opacity > 0.005;
    },
    crowdCheer(big: boolean) {
      crowdSystem.cheer(big);
    },
    update(dt: number) {
      crowdSystem.update(dt);
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
