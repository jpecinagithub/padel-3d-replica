// Significado REAL de los ajustes «Ayudas» y «Repeticiones» (Fase 8 ·
// M4). Hasta la Fase 7 existían en los ajustes y se mostraban en el
// menú, pero el motor no los consumía: no cambiaban nada.
//
// Semántica implementada (documentada también en REGLAMENTO.md):
// - Ayudas = Sí (assist 1): se ven las guías visuales de juego —
//   la aguja del saque con su zona dulce y su pie explicativo, los
//   mensajes contextuales de ayuda del HUD (controles y «qué sigue»
//   tras cada punto) y el medidor SUPERGOLPE. Con «No» se ocultan.
//   El mensaje de estado del rally (p. ej. «¡Saque perfecto!») se ve
//   siempre: es información del juego, no una ayuda.
// - Repeticiones = Sí (replays 1): tras cada punto del partido se
//   reproduce automáticamente la repetición breve del punto, además
//   de la manual con V. Con «No», solo la manual.
//
// Módulo puro: CourtView decide qué pintar y Match cuándo repetir.

import type { Settings } from '../state/store';

export interface GuideFlags {
  /** Aguja del saque con zona dulce (y su pie). */
  needle: boolean;
  /** Mensajes contextuales de ayuda (controles, «qué sigue»). */
  help: boolean;
  /** Medidor SUPERGOLPE del HUD. */
  superMeter: boolean;
  /** Repetición automática tras cada punto (además de la manual con V). */
  autoReplay: boolean;
}

export function guidesFor(settings: Pick<Settings, 'assist' | 'replays'>): GuideFlags {
  const assist = settings.assist === 1;
  return {
    needle: assist,
    help: assist,
    superMeter: assist,
    autoReplay: settings.replays === 1,
  };
}
