// ============================================================
// Pádel 3D (réplica clean-room) — Regresión E2E completa (Fase 8)
//
// Una sola pasada por la batería clave de todo el juego contra
// `vite preview` (lo arranca y lo cierra el propio script):
//
//   Escritorio (1280×800)
//     1  Menú y escena cargan (__GAME_READY__, probe de escena)
//     2  C3: sin ?hooks=1 los hooks que fuerzan estado NO existen
//        y los probes de lectura sí (política de depuración)
//     3  C4: en el menú la escena va en bajo consumo (lowPower)
//     4  Audio perezoso: sin gesto, ctxState 'none' y contadores a 0
//     5  Tienda sin monedas: clic de UI despierta el audio y el
//        botón de compra de un artículo caro está deshabilitado
//     6  Personalizar: grupo «Modo de juego» presente
//     7  Pista en Entrenamiento: grada SONORA real (M1: nodos
//        creados y arrancados), sin controles táctiles en
//        escritorio, ayuda de teclado visible (HUD intacto)
//     8  Entrenamiento: saque de aguja válido (__padelTestServe) y
//        disparo de audio del bote
//     9  Partido: la IA devuelve ≥2 bolas (semilla 42,
//        __padelTestLaunchAtAI)
//    10  Repetición: __padelTestReplay + rótulo en el DOM + tecla V
//    11  C5: la pausa mueve el foco al panel y Continuar lo devuelve
//    12  Efectos: __padelWin deja partículas activas
//    13  Set guiado completo (vía normal, __padelTestWinPoint):
//        6-0, economía exacta 672 🪙 a nivel Medio y panel de fin
//    14  Persistencia: wallet/stats en localStorage y tras recargar
//    15  Tienda: comprar y equipar «Naranja Tour» (80 🪙)
//    16  Torneo: run creado y guardado; Semifinal ganada 4-0 (+528),
//        panel que dice «Torneo (Semifinal)» (M3) y run a la Final
//    17  A4+M3: con R sobre el panel, el partido nuevo es la Final
//        DE LA CARRERA; al campeonar, el panel dice «Torneo
//        (Final)», bonus 200 y carrera cerrada
//    18  Audio: mute con M persiste en game.muted y congela los
//        contadores; desmuteo correcto
//    19  A1: sin WebGL, aviso de incompatibilidad visible, menú y
//        tienda usables y botón de reintento
//    20  M4: con Ayudas=No desaparecen aguja, ayuda y medidor; con
//        Repeticiones=Sí el punto se repite solo
//    21  Cero errores de consola en la sesión principal
//
//   Móvil emulado (390×844, hasTouch, isMobile)
//    22  Controles táctiles visibles (joystick, GOLPE, utilidades)
//    23  HUD compacto: ayuda/etiqueta/chips secundarios ocultos,
//        marcador visible y sin solapes joystick/franja inferior
//    24  Joystick con eventos táctiles reales (CDP): el jugador
//        se desplaza (probe)
//    25  Saque por toques: GOLPE lanza la aguja (visible) y el
//        segundo toque saca (contador 'serve')
//    26  Botón ⏸ táctil: pausa el partido y muestra el panel
//    27  Horizontal 844×390 (M5): mismo tratamiento compacto por
//        altura — sin solapes y sin textos de escritorio
//    28  Cero errores de consola en las sesiones móviles
//
// Uso (máquina limpia, desde la raíz del repo):
//   npm ci
//   npx playwright install chromium
//   npm run test:e2e
// Sale con código 0 si TODO pasa y 1 si algún check falla.
//
// Notas:
// - La batería navega a /?hooks=1: los hooks que FUERZAN estado
//   (__padelTest*, __padelWin…) solo existen con ese parámetro (o en
//   dev). Es una política de DEPURACIÓN, no de seguridad — ver el
//   README. Los probes de solo lectura funcionan siempre.
// - Se lanza el Chromium COMPLETO que instala Playwright
//   (channel 'chromium'): el headless-shell no basta para WebGL.
//   Adaptaciones locales SOLO por variable de entorno (nunca en el
//   código commiteado): PLAYWRIGHT_CHROMIUM_PATH para usar otro
//   ejecutable de Chromium concreto.
// - Con SwiftShader el juego corre más lento que en tiempo real:
//   TODO se espera por estado (waitForFunction con { polling: 100 })
//   y los partidos se guían con los hooks de test del propio juego,
//   que puntúan por la vía normal.
// - Los contadores de audio son disparos lógicos (ver
//   FASE6_INFORME.md §1.3): verifican el cableado, no la escucha.
//   La grada (M1) se verifica por el estado REAL de sus nodos
//   (crowdNodesCreated/crowdStarted del probe), no por contadores.
// ============================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/?hooks=1`;
const BASE_PLAIN = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(PROJECT, 'e2e', 'screenshots');

// ---------- utilidades de check ----------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function step(name, fn) {
  try {
    const r = await fn();
    if (typeof r === 'object' && r !== null && 'ok' in r) check(name, r.ok, r.detail ?? '');
    else check(name, r !== false, '');
  } catch (err) {
    check(name, false, String(err?.message ?? err).split('\n')[0].slice(0, 220));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- servidor vite preview ----------
function startPreview() {
  const viteBin = path.join(PROJECT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn('node', [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: PROJECT,
    stdio: 'ignore',
  });
  return child;
}
async function waitPreview() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(BASE_PLAIN);
      if (r.ok) return;
    } catch { /* aún no */ }
    await sleep(500);
  }
  throw new Error('vite preview no arrancó en 40 s');
}

// ---------- helpers de página ----------
const probe = (page) => page.evaluate(() => window.__padelProbe());
const sceneProbe = (page) => page.evaluate(() => window.__padelSceneProbe());
const lsGet = (page, key) => page.evaluate((k) => {
  const raw = localStorage.getItem(k);
  return raw === null ? null : JSON.parse(raw);
}, key);
async function waitReady(page, url = BASE) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { polling: 100, timeout: 90_000 });
}
async function enterCourt(page) {
  await page.getByRole('button', { name: /Jugar partido/ }).click();
  await page.waitForSelector('.court-hud', { timeout: 30_000 });
}
async function selectMode(page, idx) {
  await page.locator('.mode-selector button').nth(idx).click();
}
async function waitMatchActive(page, timeout = 60_000) {
  await page.waitForFunction(() => {
    const p = window.__padelProbe();
    return p && 'match' in p && p.active;
  }, null, { polling: 100, timeout });
}
/** Juega puntos guiados (vía normal de puntuación) hasta el fin del partido. */
async function playGuidedMatch(page, cap = 600) {
  let p = await probe(page);
  let calls = 0;
  while (!(p && 'match' in p && p.match.over) && calls < cap) {
    p = await page.evaluate(() => window.__padelTestWinPoint());
    calls++;
    await sleep(30);
  }
  return p;
}

async function main() {
  // Chromium completo de Playwright (WebGL); override local SOLO por env.
  const launchOptions = {
    channel: 'chromium',
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  };
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    delete launchOptions.channel;
  }
  const server = startPreview();
  try {
    await waitPreview();
    console.log(`vite preview en ${BASE_PLAIN} (la batería usa ?hooks=1)\n--- Escritorio ---`);
    const browser = await chromium.launch(launchOptions);

    // ================= ESCRITORIO =================
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await step('Menú y escena cargan (__GAME_READY__ + probe de escena)', async () => {
      await waitReady(page);
      const sp = await sceneProbe(page);
      const title = await page.locator('.game-title').isVisible();
      const version = await page.locator('.replica-subtitle').innerText();
      return { ok: sp.ready === true && title && /v1\.1\.0/i.test(version), detail: `objetos=${sp.objects}, "${version.trim()}"` };
    });

    await step('C3: sin ?hooks=1 no hay hooks de estado; los probes de lectura sí están', async () => {
      const plain = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p2 = await plain.newPage();
      try {
        await waitReady(p2, BASE_PLAIN);
        const hooks = await p2.evaluate(() => ({
          win: typeof window.__padelWin,
          gold: typeof window.__padelGold,
          winPoint: typeof window.__padelTestWinPoint,
          seed: typeof window.__padelTestSeed,
          probe: typeof window.__padelProbe,
          sceneProbe: typeof window.__padelSceneProbe,
        }));
        const withHooks = await page.evaluate(() => typeof window.__padelTestWinPoint);
        return {
          ok: hooks.win === 'undefined' && hooks.gold === 'undefined'
            && hooks.winPoint === 'undefined' && hooks.seed === 'undefined'
            && hooks.probe === 'function' && hooks.sceneProbe === 'function'
            && withHooks === 'function',
          detail: JSON.stringify(hooks),
        };
      } finally {
        await plain.close();
      }
    });

    await step('C4: en el menú la escena va en bajo consumo (lowPower, pixelRatio ≤ 1)', async () => {
      const sp = await sceneProbe(page);
      return { ok: sp.lowPower === true && sp.pixelRatio <= 1, detail: `lowPower=${sp.lowPower}, pixelRatio=${sp.pixelRatio}` };
    });

    await step('Audio perezoso: ctxState none y contadores a 0 antes del primer gesto', async () => {
      const sp = await sceneProbe(page);
      const total = Object.values(sp.audio.counts ?? sp.audio).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
      return { ok: sp.audio.ctxState === 'none' && total === 0, detail: `ctxState=${sp.audio.ctxState}` };
    });

    await step('Tienda sin monedas: clic de UI despierta el audio; compra cara deshabilitada', async () => {
      await page.getByRole('button', { name: /Tienda/ }).click();
      await page.waitForSelector('.shop-grid', { timeout: 20_000 });
      const sp = await sceneProbe(page);
      const card = page.locator('.shop-card', { hasText: 'Carbono FX' });
      const disabled = await card.getByRole('button', { name: /Comprar/ }).isDisabled();
      const walletTxt = await page.locator('.wallet').innerText();
      await page.getByRole('button', { name: /Volver al menú/ }).click();
      return {
        ok: sp.audio.ctxState === 'running' && (sp.audio.counts?.ui ?? sp.audio.ui ?? 0) >= 1 && disabled && /0/.test(walletTxt),
        detail: `ctxState=${sp.audio.ctxState}, monedero="${walletTxt.trim()}"`,
      };
    });

    await step('Personalizar: grupo «Modo de juego» presente (Partida rápida/Torneo/Mundial)', async () => {
      await page.getByRole('button', { name: /Personalizar partido/ }).click();
      await page.waitForSelector('.option-group', { timeout: 20_000 });
      const group = page.locator('div[role="group"][aria-label="Modo de juego"]');
      const okTorneo = await group.getByRole('button', { name: /Torneo/ }).isVisible();
      const okMundial = await group.getByRole('button', { name: /Mundial/ }).isVisible();
      await page.getByRole('button', { name: /Volver al menú/ }).click();
      return { ok: okTorneo && okMundial };
    });

    await step('Pista (Entrenamiento): grada con nodos reales sonando (M1), sin táctil en escritorio, HUD intacto', async () => {
      await enterCourt(page);
      // Se espera al estado REAL de los nodos (la escena aplica el modo
      // en un efecto posterior al primer pintado del HUD).
      await page.waitForFunction(() => {
        const a = window.__padelSceneProbe().audio;
        return a.crowdNodesCreated === true && a.crowdStarted === true;
      }, null, { polling: 100, timeout: 30_000 });
      const p = await probe(page);
      const sp = await sceneProbe(page);
      const touchCount = await page.locator('[data-testid="touch-controls"]').count();
      const helpVisible = await page.locator('.hud-help').isVisible();
      return {
        ok: p && !('match' in p) && sp.audio.crowdActive === true
          && sp.audio.crowdNodesCreated === true && sp.audio.crowdStarted === true
          && touchCount === 0 && helpVisible,
        detail: `crowdNodes=${sp.audio.crowdNodesCreated}, crowdStarted=${sp.audio.crowdStarted}, táctil=${touchCount}`,
      };
    });

    await step('Entrenamiento: saque de aguja válido y disparo de audio del bote', async () => {
      await page.evaluate(() => window.__padelTestServe(0.5));
      await page.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && p.serve && p.serve.valid === true;
      }, null, { polling: 100, timeout: 60_000 });
      const sp = await sceneProbe(page);
      const bounce = sp.audio.counts?.bounce ?? sp.audio.bounce ?? 0;
      return { ok: bounce >= 1, detail: `bounce=${bounce}` };
    });

    await step('Partido: la IA devuelve ≥2 bolas en rallies guiados (semilla 42)', async () => {
      await selectMode(page, 1);
      await waitMatchActive(page);
      await page.evaluate(() => window.__padelTestSeed(42));
      let aiHits = 0;
      for (let attempt = 0; attempt < 6 && aiHits < 2; attempt++) {
        const before = (await probe(page)).match.aiHits;
        await page.evaluate(() => window.__padelTestLaunchAtAI());
        try {
          await page.waitForFunction((prev) => {
            const p = window.__padelProbe();
            return p && 'match' in p && (p.match.aiHits > prev || p.rally.state === 'ended');
          }, before, { polling: 100, timeout: 45_000 });
        } catch { /* se reintenta el lanzamiento */ }
        aiHits = (await probe(page)).match.aiHits;
      }
      return { ok: aiHits >= 2, detail: `aiHits=${aiHits}` };
    });

    await step('Repetición: hook + rótulo en el DOM + tecla V para salir', async () => {
      await page.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && 'match' in p && p.rally.state === 'ended';
      }, null, { polling: 100, timeout: 60_000 });
      const rp = await page.evaluate(() => window.__padelTestReplay());
      // El rótulo lo pinta React en su siguiente tick (el probe es
      // instantáneo, el DOM no): se espera a que sea visible.
      let badge = false;
      try {
        await page.locator('.replay-badge').waitFor({ state: 'visible', timeout: 10_000 });
        badge = true;
      } catch { /* sin rótulo */ }
      await page.keyboard.press('v');
      await page.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && 'match' in p && p.replay.active === false;
      }, null, { polling: 100, timeout: 30_000 });
      return {
        ok: rp.replay.active === true && badge,
        detail: `active=${rp.replay.active}, frames=${rp.replay.frames}, rótulo=${badge}`,
      };
    });

    await step('C5: la pausa lleva el foco al panel y «Continuar» lo devuelve', async () => {
      await page.keyboard.press('Escape');
      await page.locator('.pause-panel').waitFor({ state: 'visible', timeout: 15_000 });
      const focusedOnOpen = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      await page.locator('.pause-panel').getByRole('button', { name: 'Continuar' }).click();
      await page.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && p.paused === false;
      }, null, { polling: 100, timeout: 15_000 });
      const focusedAfter = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      return {
        ok: focusedOnOpen === 'Continuar' && focusedAfter !== 'Continuar',
        detail: `al abrir="${focusedOnOpen}", tras continuar="${focusedAfter.slice(0, 30)}"`,
      };
    });

    await step('Efectos: __padelWin deja partículas activas', async () => {
      const beforeFx = (await sceneProbe(page)).effects;
      await page.evaluate(() => window.__padelWin());
      await page.waitForFunction((prev) => {
        const fx = window.__padelSceneProbe().effects;
        return fx.active > 0 || fx.bursts > prev;
      }, beforeFx.bursts, { polling: 100, timeout: 30_000 });
      const fx = (await sceneProbe(page)).effects;
      return { ok: fx.active > 0, detail: `partículas=${fx.active}, ráfagas=${fx.bursts}` };
    });

    await step('Set guiado completo: 6-0 y economía exacta de 672 🪙 (nivel Medio)', async () => {
      // Partido limpio garantizado: recarga (el estado anterior de
      // rallies/repetición no debe contaminar la cuenta exacta). La
      // recarga conserva el ?hooks=1 de la URL.
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__GAME_READY__ === true, null, { polling: 100, timeout: 90_000 });
      await enterCourt(page);
      await selectMode(page, 1);
      await waitMatchActive(page);
      const fresh = await probe(page);
      if (!(fresh.score.games[0] === 0 && fresh.score.games[1] === 0)) {
        return { ok: false, detail: `el partido no arrancó limpio: ${fresh.score.games}` };
      }
      const end = await playGuidedMatch(page);
      // El panel lo pinta React tras el probe: se espera su visibilidad.
      let panelVisible = false;
      try {
        await page.locator('.end-panel').waitFor({ state: 'visible', timeout: 15_000 });
        panelVisible = true;
      } catch { /* sin panel */ }
      const panelText = panelVisible ? await page.locator('.end-panel').innerText() : '';
      return {
        ok: end.match.over && end.match.winner === 'human'
          && end.score.games[0] === 6 && end.score.games[1] === 0
          && end.economy.earned === 672 && panelVisible && /Victoria/.test(panelText),
        detail: `juegos=${end.score.games}, earned=${end.economy.earned}`,
      };
    });

    await step('Persistencia del partido: wallet 672 y stats.wins=1 en localStorage', async () => {
      const wallet = await lsGet(page, 'game.padel.wallet');
      const stats = await lsGet(page, 'game.padel.stats');
      return {
        ok: wallet?.coins === 672 && stats?.wins === 1,
        detail: `coins=${wallet?.coins}, wins=${stats?.wins}, pointsWon=${stats?.pointsWon}`,
      };
    });

    await step('Persistencia tras recargar: el menú muestra 🪙 672 y «Victorias 1»', async () => {
      await page.locator('.end-panel').getByRole('button', { name: /Volver al menú/ }).click();
      await page.waitForSelector('.game-title', { timeout: 20_000 });
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__GAME_READY__ === true, null, { polling: 100, timeout: 90_000 });
      const walletTxt = await page.locator('.wallet').innerText();
      const statsTxt = await page.locator('.stats-line').innerText();
      return { ok: /672/.test(walletTxt) && /Victorias 1/.test(statsTxt), detail: `"${walletTxt.trim()}" · "${statsTxt.trim()}"` };
    });

    await step('Tienda: comprar y equipar «Naranja Tour» (80 🪙) con monedas ganadas', async () => {
      await page.getByRole('button', { name: /Tienda/ }).click();
      await page.waitForSelector('.shop-grid', { timeout: 20_000 });
      await page.getByRole('tab', { name: 'Pelotas' }).click();
      const card = page.locator('.shop-card', { hasText: 'Naranja Tour' });
      await card.getByRole('button', { name: /Comprar/ }).click();
      await page.waitForFunction(() => document.querySelector('.shop-feedback')?.textContent?.includes('Has comprado'), null, { polling: 100, timeout: 15_000 });
      await card.getByRole('button', { name: 'Equipar' }).click();
      await page.waitForFunction(() => {
        const w = JSON.parse(localStorage.getItem('game.padel.wallet'));
        return w && w.equipped && w.equipped.ball === 'ball-orange';
      }, null, { polling: 100, timeout: 15_000 });
      const wallet = await lsGet(page, 'game.padel.wallet');
      await page.getByRole('button', { name: /Volver al menú/ }).click();
      return { ok: wallet.coins === 592, detail: `coins=${wallet.coins}, equipada=${wallet.equipped.ball}` };
    });

    await step('Torneo: run creado y guardado al entrar (Semifinal, set a 4)', async () => {
      await page.getByRole('button', { name: /Personalizar partido/ }).click();
      await page.waitForSelector('.option-group', { timeout: 20_000 });
      await page.locator('div[role="group"][aria-label="Modo de juego"]').getByRole('button', { name: /Torneo/ }).click();
      await page.getByRole('button', { name: /Volver al menú/ }).click();
      await enterCourt(page);
      // Tras la recarga de persistencia el modo vuelve a Entrenamiento:
      // hay que seleccionar Partido (eso además crea el run).
      await selectMode(page, 1);
      await waitMatchActive(page);
      const run = await lsGet(page, 'game.padel.run');
      const p = await probe(page);
      return {
        ok: run?.mode === 1 && run?.round === 0 && p.match.modeId === 1 && p.score.gamesToWin === 4,
        detail: `run=${JSON.stringify(run)}, gamesToWin=${p.score.gamesToWin}`,
      };
    });

    await step('Torneo: Semifinal ganada 4-0 (+528 🪙), panel «Torneo (Semifinal)» (M3) y run a la Final', async () => {
      const end = await playGuidedMatch(page);
      await page.locator('.end-panel').waitFor({ state: 'visible', timeout: 15_000 });
      const panelText = await page.locator('.end-panel').innerText();
      const run = await lsGet(page, 'game.padel.run');
      const wallet = await lsGet(page, 'game.padel.wallet');
      return {
        ok: end.match.over && end.match.winner === 'human'
          && end.score.games[0] === 4 && end.score.games[1] === 0
          && /Torneo \(Semifinal\)/.test(panelText)
          && /Siguiente ronda: Final/.test(panelText)
          && run?.round === 1 && wallet?.coins === 1120,
        detail: `earned=${end.economy.earned}, run.round=${run?.round}, coins=${wallet?.coins}`,
      };
    });

    await step('A4: R sobre el panel abre la Final DE LA CARRERA; al campeonar, «Torneo (Final)» y +992 🪙', async () => {
      await page.keyboard.press('r');
      await page.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && 'match' in p && p.match.over === false && p.career && p.career.round === 1;
      }, null, { polling: 100, timeout: 30_000 });
      const runAfterR = await lsGet(page, 'game.padel.run');
      const end = await playGuidedMatch(page);
      await page.locator('.end-panel').waitFor({ state: 'visible', timeout: 15_000 });
      const panelText = await page.locator('.end-panel').innerText();
      const run = await lsGet(page, 'game.padel.run');
      const wallet = await lsGet(page, 'game.padel.wallet');
      const stats = await lsGet(page, 'game.padel.stats');
      return {
        ok: runAfterR?.round === 1
          && end.match.over && end.match.champion === true
          && /Torneo \(Final\)/.test(panelText) && /CAMPEÓN/.test(panelText)
          && end.economy.earned === 992 && wallet?.coins === 2112
          && run === null && stats?.torneos === 1,
        detail: `earned=${end.economy.earned}, coins=${wallet?.coins}, run=${JSON.stringify(run)}, torneos=${stats?.torneos}`,
      };
    });

    await step('Audio: mute con M persiste en game.muted y congela los contadores', async () => {
      await page.locator('.end-panel').getByRole('button', { name: /Volver al menú/ }).click();
      await page.waitForSelector('.game-title', { timeout: 20_000 });
      await enterCourt(page);
      await selectMode(page, 1);
      await waitMatchActive(page);
      await page.keyboard.press('m');
      await page.waitForFunction(() => localStorage.getItem('game.muted') === '1', null, { polling: 100, timeout: 15_000 });
      const frozen = (await sceneProbe(page)).audio;
      await page.evaluate(() => window.__padelTestLaunchAtAI());
      await sleep(4_000);
      const after = (await sceneProbe(page)).audio;
      const counts = (a) => a.counts ?? a;
      const frozenOk = counts(after).hit === counts(frozen).hit && counts(after).bounce === counts(frozen).bounce;
      await page.keyboard.press('m');
      await page.waitForFunction(() => localStorage.getItem('game.muted') === '0', null, { polling: 100, timeout: 15_000 });
      const unmuted = (await sceneProbe(page)).audio;
      return {
        ok: frozen.muted === true && frozenOk && unmuted.muted === false,
        detail: `hit ${counts(frozen).hit}→${counts(after).hit}, bounce ${counts(frozen).bounce}→${counts(after).bounce}`,
      };
    });

    await step('A1: sin WebGL hay aviso de incompatibilidad y la UI (menú/tienda) sigue usable', async () => {
      const noGl = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p2 = await noGl.newPage();
      try {
        await p2.addInitScript(() => {
          const orig = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
            if (String(type).includes('webgl')) return null;
            return orig.call(this, type, ...rest);
          };
        });
        await p2.goto(BASE, { waitUntil: 'load' });
        await p2.locator('.webgl-fallback').waitFor({ state: 'visible', timeout: 30_000 });
        const titleVisible = await p2.locator('.game-title').isVisible();
        await p2.getByRole('button', { name: /Tienda/ }).click();
        await p2.waitForSelector('.shop-grid', { timeout: 20_000 });
        // El reintento vuelve a intentarlo (y vuelve a avisar, sin WebGL).
        await p2.getByRole('button', { name: /Volver al menú/ }).click();
        await p2.getByRole('button', { name: /Reintentar el 3D/ }).click();
        await p2.locator('.webgl-fallback').waitFor({ state: 'visible', timeout: 30_000 });
        return { ok: titleVisible, detail: 'aviso + tienda OK + reintento OK' };
      } finally {
        await noGl.close();
      }
    });

    await step('M4: Ayudas=No oculta aguja/ayuda/medidor; Repeticiones=Sí repite el punto solo', async () => {
      const m4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p3 = await m4.newPage();
      try {
        await p3.addInitScript(() => {
          localStorage.setItem('game.padel.settings', JSON.stringify({ assist: 0 }));
        });
        await waitReady(p3);
        await enterCourt(p3);
        await selectMode(p3, 1);
        await waitMatchActive(p3);
        // Saque del humano con la aguja desactivada por el ajuste.
        await p3.waitForFunction(() => {
          const p = window.__padelProbe();
          return p && 'match' in p && p.rally.state === 'serve-ready' && p.match.server === 'human';
        }, null, { polling: 100, timeout: 60_000 });
        await p3.keyboard.press('Space');
        await p3.waitForFunction(() => {
          const p = window.__padelProbe();
          return p && 'match' in p && p.rally.state === 'serve-toss';
        }, null, { polling: 100, timeout: 30_000 });
        await sleep(600);
        const needleCount = await p3.locator('.needle-gauge').count();
        const meterCount = await p3.locator('.meter').count();
        const helpCount = await p3.locator('.hud-help').count();
        await p3.keyboard.press('Space'); // completar el saque para no dejar la aguja colgada
        await m4.close();

        // Segunda parte, en un contexto PROPIO: Repeticiones=Sí → el
        // punto se repite solo. (Un addInitScript se re-ejecuta en cada
        // recarga: reutilizar el contexto anterior pisaría el ajuste.)
        const m4b = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const p4 = await m4b.newPage();
        try {
          await p4.addInitScript(() => {
            localStorage.setItem('game.padel.settings', JSON.stringify({ replays: 1 }));
          });
          await waitReady(p4);
          await enterCourt(p4);
          await selectMode(p4, 1);
          await waitMatchActive(p4);
          await p4.evaluate(() => window.__padelTestSeed(42));
          await p4.evaluate(() => window.__padelTestLaunchAtAI());
          let autoReplay = true;
          try {
            await p4.waitForFunction(() => {
              const p = window.__padelProbe();
              return p && 'match' in p && p.replay.active === true;
            }, null, { polling: 100, timeout: 120_000 });
          } catch {
            autoReplay = false;
          }
          return {
            ok: needleCount === 0 && meterCount === 0 && helpCount === 0 && autoReplay,
            detail: `aguja=${needleCount}, medidor=${meterCount}, ayuda=${helpCount}, autoReplay=${autoReplay}`,
          };
        } finally {
          await m4b.close();
        }
      } catch (err) {
        await m4.close().catch(() => undefined);
        throw err;
      }
    });

    check('Escritorio: cero errores de consola en la sesión principal', consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(' | '));
    await ctx.close();

    // ================= MÓVIL =================
    console.log('--- Móvil (390×844, táctil) ---');
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const mpage = await mctx.newPage();
    const mErrors = [];
    mpage.on('console', (m) => { if (m.type() === 'error') mErrors.push(m.text()); });
    mpage.on('pageerror', (e) => mErrors.push(String(e)));

    await step('Móvil: pista en Partido con controles táctiles visibles', async () => {
      await waitReady(mpage);
      await enterCourt(mpage);
      await selectMode(mpage, 1);
      await waitMatchActive(mpage);
      const vis = await mpage.locator('[data-testid="touch-controls"]').isVisible();
      const joy = await mpage.locator('[data-testid="touch-joystick"]').isVisible();
      const hit = await mpage.locator('[data-testid="touch-hit"]').isVisible();
      return { ok: vis && joy && hit };
    });

    await step('Móvil: HUD compacto (ayuda/etiqueta/chips secundarios ocultos, marcador visible, sin solapes)', async () => {
      const helpVisible = await mpage.locator('.hud-help').isVisible();
      const labelVisible = await mpage.locator('.hud-label').isVisible();
      const optVisible = await mpage.locator('.hud-chip-opt').first().isVisible();
      // El marcador lo pinta React tras el probe del juego: se espera.
      let scoreVisible = false;
      try {
        await mpage.locator('.scoreboard').waitFor({ state: 'visible', timeout: 10_000 });
        scoreVisible = true;
      } catch { /* sin marcador */ }
      const joyBox = await mpage.locator('[data-testid="touch-joystick"]').boundingBox();
      const bottomBox = await mpage.locator('.hud-bottom').boundingBox();
      const noOverlap = joyBox && bottomBox && (joyBox.y + joyBox.height) <= bottomBox.y + 2;
      return {
        ok: !helpVisible && !labelVisible && !optVisible && scoreVisible && noOverlap,
        detail: `joystick bottom=${joyBox ? Math.round(joyBox.y + joyBox.height) : '?'} vs hud-bottom top=${bottomBox ? Math.round(bottomBox.y) : '?'}`,
      };
    });

    await mpage.screenshot({ path: path.join(SHOTS, 'fase8-hud-movil-retrato.png') });
    console.log('     captura: e2e/screenshots/fase8-hud-movil-retrato.png');

    await step('Móvil: el joystick (toques reales CDP) desplaza al jugador', async () => {
      const before = (await probe(mpage)).player.pos;
      const joyBox = await mpage.locator('[data-testid="touch-joystick"]').boundingBox();
      const cx = joyBox.x + joyBox.width / 2;
      const cy = joyBox.y + joyBox.height / 2;
      const cdp = await mctx.newCDPSession(mpage);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 42, y: cy, id: 1 }] });
      await sleep(3_000);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const after = (await probe(mpage)).player.pos;
      const moved = Math.abs(after[0] - before[0]) + Math.abs(after[2] - before[2]);
      return { ok: moved > 0.3, detail: `pos ${before.map((v) => v.toFixed(2))} → ${after.map((v) => v.toFixed(2))}` };
    });

    await step('Móvil: saque por toques (aguja visible y contador serve)', async () => {
      // Debe ser saque del humano en un punto nuevo: se espera a serve-ready.
      await mpage.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && 'match' in p && p.rally.state === 'serve-ready' && p.match.server === 'human';
      }, null, { polling: 100, timeout: 60_000 });
      const hitBox = await mpage.locator('[data-testid="touch-hit"]').boundingBox();
      const tx = hitBox.x + hitBox.width / 2;
      const ty = hitBox.y + hitBox.height / 2;
      await mpage.touchscreen.tap(tx, ty);
      await mpage.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && 'match' in p && p.rally.state === 'serve-toss';
      }, null, { polling: 100, timeout: 30_000 });
      // La aguja la pinta React en su siguiente tick: se espera su
      // visibilidad en vez de leerla en el mismo instante.
      let needleVisible = false;
      try {
        await mpage.locator('.needle-gauge').waitFor({ state: 'visible', timeout: 10_000 });
        needleVisible = true;
      } catch { /* sin aguja en el DOM */ }
      let serveCount = 0;
      for (let i = 0; i < 3; i++) {
        await mpage.touchscreen.tap(tx, ty);
        await sleep(1_800);
        const sp = await sceneProbe(mpage);
        serveCount = sp.audio.counts?.serve ?? sp.audio.serve ?? 0;
        const p = await probe(mpage);
        if (serveCount >= 1 || (p && 'match' in p && p.rally.state === 'rally')) break;
      }
      const p = await probe(mpage);
      return {
        ok: needleVisible && (serveCount >= 1 || p.rally.state === 'rally'),
        detail: `aguja=${needleVisible}, serve=${serveCount}, estado=${p.rally.state}`,
      };
    });

    await step('Móvil: el botón ⏸ táctil pausa y muestra el panel', async () => {
      await mpage.locator('[data-testid="touch-pause"]').tap();
      await mpage.waitForFunction(() => {
        const p = window.__padelProbe();
        return p && p.paused === true;
      }, null, { polling: 100, timeout: 20_000 });
      let panel = false;
      try {
        await mpage.locator('.pause-panel').waitFor({ state: 'visible', timeout: 10_000 });
        panel = true;
      } catch { /* sin panel */ }
      return { ok: panel };
    });
    await mctx.close();

    // ============ MÓVIL HORIZONTAL (M5) ============
    console.log('--- Móvil horizontal (844×390, táctil) ---');
    const lctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const lpage = await lctx.newPage();
    lpage.on('console', (m) => { if (m.type() === 'error') mErrors.push(m.text()); });
    lpage.on('pageerror', (e) => mErrors.push(String(e)));

    await step('Horizontal 844×390: HUD compacto por altura, marcador visible y sin solapes', async () => {
      await waitReady(lpage);
      await enterCourt(lpage);
      await selectMode(lpage, 1);
      await waitMatchActive(lpage);
      const helpVisible = await lpage.locator('.hud-help').isVisible();
      const labelVisible = await lpage.locator('.hud-label').isVisible();
      const optVisible = await lpage.locator('.hud-chip-opt').first().isVisible();
      let scoreVisible = false;
      try {
        await lpage.locator('.scoreboard').waitFor({ state: 'visible', timeout: 10_000 });
        scoreVisible = true;
      } catch { /* sin marcador */ }
      const joyVisible = await lpage.locator('[data-testid="touch-joystick"]').isVisible();
      const joyBox = await lpage.locator('[data-testid="touch-joystick"]').boundingBox();
      const bottomBox = await lpage.locator('.hud-bottom').boundingBox();
      const noOverlap = joyBox && bottomBox && (joyBox.y + joyBox.height) <= bottomBox.y + 2;
      const insideScreen = joyBox && (joyBox.y + joyBox.height) <= 390 + 1;
      return {
        ok: !helpVisible && !labelVisible && !optVisible && scoreVisible && joyVisible && noOverlap && insideScreen,
        detail: `joystick bottom=${joyBox ? Math.round(joyBox.y + joyBox.height) : '?'} vs hud-bottom top=${bottomBox ? Math.round(bottomBox.y) : '?'}`,
      };
    });

    await lpage.screenshot({ path: path.join(SHOTS, 'fase8-hud-movil-horizontal.png') });
    console.log('     captura: e2e/screenshots/fase8-hud-movil-horizontal.png');
    await lctx.close();

    check('Móvil: cero errores de consola en las sesiones móviles', mErrors.length === 0,
      mErrors.slice(0, 2).join(' | '));
    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== RESUMEN: ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL =====`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('ERROR FATAL de la batería:', err);
  process.exit(2);
});
