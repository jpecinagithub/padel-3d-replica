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

/**
 * Valla publicitaria (~750×126, la proporción de las del original) con una
 * marca inventada de la réplica. Dos variantes que se alternan en la pista.
 */
export function makeAdTexture(variant: 0 | 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(750, 126);
  if (variant === 0) {
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
 * Rejilla de la malla metálica: fondo transparente y alambres claros en
 * retícula cuadrada. Se usa con repetición según el tamaño del panel.
 */
export function makeFenceTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(198, 210, 222, 0.95)';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 0);
  ctx.lineTo(64, 128);
  ctx.moveTo(0, 64);
  ctx.lineTo(128, 64);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Rejilla fina para la red (hilos oscuros con la cinta blanca aparte). */
export function makeNetTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(96, 96);
  ctx.clearRect(0, 0, 96, 96);
  ctx.strokeStyle = 'rgba(18, 22, 28, 0.92)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 96, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
