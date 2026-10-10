import './style.css';
import { SHEETS, GROUND, ARENA, SOUNDS, MUSIC } from './config.js';
import { loadSheets, buildGround } from './assets.js';
import { Sound } from './audio.js';
import { loadRecords, saveRun } from './records.js';
import { Bag } from './bag.js';
import { Hud, fmtTime } from './hud.js';
import { Game } from './game.js';

const $ = id => document.getElementById(id);
const hud = new Hud();
hud.showOverlay('2048 Looter Shooter', 'Loading…', 'Start', false);

const keys = {};
const bag = new Bag($('bd'), $('hamB'));
const sound = new Sound(SOUNDS, MUSIC);

try {
  await document.fonts?.ready;
  const [sheets, ground] = await Promise.all([
    loadSheets(SHEETS), buildGround(GROUND, ARENA.w, ARENA.h), sound.load(),
  ]);
  boot(sheets, ground);
} catch (err) {
  hud.showOverlay('Could not load the game', String(err.message || err), 'Start', false);
  throw err;
}

function boot(sheets, ground) {
  const game = new Game({ canvas: $('cv'), stage: $('stage'), sheets, ground, bag, hud, keys, sound });
  addEventListener('pointerdown', () => sound.unlock());
  addEventListener('keydown', () => sound.unlock());

  const syncMute = () => { $('muteB').textContent = sound.muted ? 'Sound: off [M]' : 'Sound: on [M]'; };
  const toggleMute = () => { sound.toggleMute(); syncMute(); };
  $('muteB').onclick = toggleMute;
  syncMute();
  bag.onChange = () => { hud.setWeapon(bag.weapon(), bag.count()); game.onBagChange(); };
  bag.onChange();

  const canAct = () => game.state === 'play' && !game.paused;
  const slide = dir => {
    if (!canAct()) return;
    if (bag.hammerMode) return bag.moveCursor(dir);
    const merges = bag.slide(dir);
    if (merges) game.onMerges(merges);
  };
  const hammer = () => {
    if (!canAct()) return;
    if (bag.hammerMode) smash(bag.cursor);
    else bag.toggleHammer();
  };
  const smash = i => {
    if (canAct() && bag.smash(i)) sound.play('explosion', { volume: 0.4, pitch: 1.6 });
  };

  function primary() {
    sound.unlock();
    if (game.paused) { game.paused = false; sound.duckMusic(false); hud.hideOverlay(); return; }
    if (game.state === 'title' || game.state === 'dead') { hud.hideOverlay(); game.start(); }
  }
  function togglePause() {
    if (game.state !== 'play' && game.state !== 'spawning') return;
    game.paused = !game.paused;
    sound.duckMusic(game.paused);
    if (game.paused) hud.showOverlay('Paused', 'Catch your breath. The enemies will wait.', 'Resume');
    else hud.hideOverlay();
  }

  const recordsLine = r => r.time ? `Best: ${fmtTime(r.time)} · tile ${r.tile} · ${r.kills} kills · ${r.score} pts` : '';
  hud.setRecords(recordsLine(loadRecords()));

  game.onGameOver = reason => {
    const run = { time: Math.floor(game.t), tile: game.best, kills: game.kills, score: game.score };
    const { records, beaten } = saveRun(run);
    hud.setRecords(recordsLine(records));
    const row = (label, key, text) =>
      `<dt>${label}</dt><dd class="${beaten[key] ? 'new' : ''}">${text}${beaten[key] ? ' ★ new best' : ''}</dd>`;
    hud.showOverlay(reason, `<dl class="runstats">
      ${row('Time', 'time', fmtTime(run.time))}
      ${row('Best tile', 'tile', run.tile)}
      ${row('Kills', 'kills', run.kills)}
      ${row('Score', 'score', run.score)}
      <dt>Gun</dt><dd>${bag.weapon().name}</dd>
    </dl>`, 'Play again');
  };

  hud.onPrimary = primary;
  const best = loadRecords();
  hud.showOverlay('2048 Looter Shooter',
    'Enemies drop tiles. Your gun is only as strong as your highest tile. Merge your bag while you stay alive.'
    + (best.time ? `<br><br><span class="res">Your best: ${fmtTime(best.time)} · tile ${best.tile}</span>` : ''), 'Start');

  $('hamB').onclick = hammer;
  $('pauseB').onclick = togglePause;
  bag.onSwipe = slide;
  bag.onTap = smash;

  const ARROWS = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3 };
  addEventListener('keydown', e => {
    if (e.code in ARROWS) { e.preventDefault(); if (!e.repeat) slide(ARROWS[e.code]); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && !hud.overlayOpen) hammer(); return; }
    if (e.code === 'Escape' && bag.hammerMode) { bag.toggleHammer(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (e.code === 'Enter' && hud.overlayOpen) { e.preventDefault(); primary(); return; }
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.addEventListener('visibilitychange', () => {
    sound.setHidden(document.hidden);
    if (document.hidden && !game.paused) togglePause();
  });
  if (document.hidden) sound.setHidden(true);

  // Touch / mouse: hold in the arena to walk toward the pointer.
  const cv = $('cv');
  const aim = e => { const r = cv.getBoundingClientRect(); game.touchTarget = game.toWorld(e.clientX - r.left, e.clientY - r.top); };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); aim(e); });
  cv.addEventListener('pointermove', e => { if (game.touchTarget) aim(e); });
  cv.addEventListener('pointerup', () => { game.touchTarget = null; });
  cv.addEventListener('pointercancel', () => { game.touchTarget = null; });

  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    game.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__game = game; // handy for poking at it from the console
}
