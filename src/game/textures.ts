// Texturas procedurales de la réplica (Canvas 2D). Ninguna imagen es del
// original: las marcas de las vallas son inventadas y las rejillas se
// dibujan por código (REPLICA_SPEC §5.6, assets propios).

import * as THREE from 'three';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin contexto 2D para generar texturas');
  return [canvas, ctx];
}

/** Aleatorio determinista (mulberry32) para texturas estables. */
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

/**
 * Valla publicitaria (~750×126, la proporción de las del original) con
 * marcas inventadas de la réplica. Cuatro variantes que rotan en la
 * pista (Fase 10: se suman SOLANA y ONDARA a VOLANTIA y PALA·PRO).
 * Ningún texto procede del juego de referencia.
 */
export function makeAdTexture(variant: 0 | 1 | 2 | 3): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(750, 126);
  if (variant === 2) {
    const gradient = ctx.createLinearGradient(0, 0, 750, 0);
    gradient.addColorStop(0, '#f7c948');
    gradient.addColorStop(1, '#e8890c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 750, 126);
    ctx.fillStyle = '#1c1710';
    ctx.beginPath();
    ctx.arc(690, 22, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7c948';
    ctx.beginPath();
    ctx.arc(690, 22, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1710';
    ctx.font = '900 62px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SOLANA', 36, 54);
    ctx.font = '600 25px system-ui, sans-serif';
    ctx.fillText('aguas del sur · hidrátate', 38, 96);
  } else if (variant === 3) {
    ctx.fillStyle = '#0e3a3a';
    ctx.fillRect(0, 0, 750, 126);
    ctx.strokeStyle = 'rgba(64, 200, 180, 0.55)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      for (let x = 0; x <= 750; x += 10) {
        const y = 100 + i * 9 + Math.sin(x / 60 + i) * 5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#e8fffa';
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ONDARA', 375, 48);
    ctx.fillStyle = '#8fd8cf';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText('viaja ligero', 375, 84);
  } else if (variant === 0) {
    const gradient = ctx.createLinearGradient(0, 0, 750, 0);
    gradient.addColorStop(0, '#0d2b52');
    gradient.addColorStop(1, '#1663b8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 750, 126);
    ctx.fillStyle = '#a8e10c';
    ctx.beginPath();
    ctx.arc(78, 63, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d2b52';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('V', 78, 66);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VOLANTIA', 132, 56);
    ctx.fillStyle = '#bcd9f2';
    ctx.font = '600 25px system-ui, sans-serif';
    ctx.fillText('energía para tu club', 134, 96);
  } else {
    ctx.fillStyle = '#101604';
    ctx.fillRect(0, 0, 750, 126);
    ctx.strokeStyle = '#a8e10c';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 734, 110);
    ctx.fillStyle = '#a8e10c';
    ctx.font = '900 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PALA·PRO', 375, 54);
    ctx.fillStyle = '#f2f5fa';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText('las palas de la réplica', 375, 94);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Rejilla de la malla metálica: fondo transparente y alambres claros
 * en retícula 4×4 por baldosa (Fase 10: malla más fina — con la
 * repetición de Court.ts la celda queda en ~5 cm, la escala real del
 * cerramiento de pádel).
 */
export function makeFenceTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(198, 210, 222, 0.95)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = i * 32;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 128);
    ctx.moveTo(0, p);
    ctx.lineTo(128, p);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Rejilla fina para la red: 4×4 celdas por baldosa (Fase 10). */
export function makeNetTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(18, 22, 28, 0.92)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = i * 32;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 128);
    ctx.moveTo(0, p);
    ctx.lineTo(128, p);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Grano de la superficie de juego (Fase 10): lienzo casi blanco con
 * moteado oscuro y vetas suaves — se multiplica por el color de cada
 * superficie, así que el grano sirve para las cuatro sin variantes.
 */
export function makeCourtGrainTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = mulberry32(415);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 165 + Math.floor(rand() * 70);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${0.25 + rand() * 0.4})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1.6, 1.6);
  }
  ctx.strokeStyle = 'rgba(190, 190, 190, 0.18)';
  ctx.lineWidth = 7;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const y = rand() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + (rand() - 0.5) * 26, 176, y + (rand() - 0.5) * 26, 256, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Fachada de edificio del skyline (Fase 10): mapa de color (fachada y
 * marcos) + mapa emisivo (solo las ventanas encendidas). Dos tonos:
 * cálido y frío. La intensidad emisiva la manda el preset de ambiente.
 */
export function makeBuildingTextures(style: 'warm' | 'cool'): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const [mapCanvas, mctx] = makeCanvas(256, 512);
  const [emiCanvas, ectx] = makeCanvas(256, 512);
  const rand = mulberry32(style === 'warm' ? 77 : 131);
  mctx.fillStyle = style === 'warm' ? '#33302e' : '#2c3444';
  mctx.fillRect(0, 0, 256, 512);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 256, 512);
  const litColor = style === 'warm' ? '#ffca7a' : '#a9ccff';
  const cols = 8;
  const rows = 16;
  const cw = 256 / cols;
  const ch = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + 5;
      const y = r * ch + 6;
      const w = cw - 10;
      const h = ch - 12;
      mctx.fillStyle = 'rgba(160, 175, 200, 0.28)';
      mctx.fillRect(x, y, w, h);
      if (rand() < 0.55) {
        ectx.globalAlpha = 0.55 + rand() * 0.45;
        ectx.fillStyle = litColor;
        ectx.fillRect(x, y, w, h);
        ectx.globalAlpha = 1;
      }
    }
  }
  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emiCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

/**
 * Suelo del recinto (Fase 10): asfalto oscuro con moteado, estrellas
 * pintadas en las esquinas y el nombre genérico del juego pintado a lo
 * largo de ambos laterales, como la pintura de suelo del modelo. La
 * textura es propia; no reproduce marcas de terceros.
 */
export function makeVenueTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rand = mulberry32(2026);
  ctx.fillStyle = '#1d232e';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 15000; i++) {
    const v = 22 + Math.floor(rand() * 30);
    ctx.fillStyle = `rgba(${v + 12}, ${v + 16}, ${v + 24}, ${0.3 + rand() * 0.4})`;
    ctx.fillRect(rand() * 1024, rand() * 1024, 2, 2);
  }
  const star = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = 'rgba(240, 244, 250, 0.20)';
  star(90, 90, 52);
  star(934, 90, 52);
  star(90, 934, 52);
  star(934, 934, 52);
  star(512, 70, 40);
  star(512, 954, 40);
  ctx.fillStyle = 'rgba(240, 244, 250, 0.13)';
  ctx.font = '900 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(64, 512);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('P A D E L   3 D', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(960, 512);
  ctx.rotate(Math.PI / 2);
  ctx.fillText('P A D E L   3 D', 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
