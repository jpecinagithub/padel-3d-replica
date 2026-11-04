// Creación protegida de la escena 3D (Fase 8 · A1).
//
// Si WebGL no está disponible, `new THREE.WebGLRenderer()` lanza una
// excepción. Sin captura, el error rompía el efecto de montaje y la
// app entera desaparecía (body vacío): ni menú, ni tienda, ni ajustes.
// Con esta captura, SceneCanvas muestra un aviso de incompatibilidad
// con botón de reintento y la UI sigue viva sin el decorado 3D.

export type SceneCreation<T> = { ok: true; value: T } | { ok: false; error: string };

export function tryCreateScene<T>(factory: () => T): SceneCreation<T> {
  try {
    return { ok: true, value: factory() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
