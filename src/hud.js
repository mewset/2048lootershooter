import { RARITY, weaponName } from './config.js';

const $ = id => document.getElementById(id);
const fmtTime = t => (t / 60 | 0) + ':' + String(t % 60 | 0).padStart(2, '0');

// Everything drawn as DOM on top of (or beside) the WebGL canvas.
export class Hud {
  constructor() {
    this.layer = $('fx');
    this.texts = [];
    this.pool = [];
    this.last = {};
    this.bannerT = 0;
    this.onPrimary = null;
    $('ovB').onclick = () => this.onPrimary?.();
  }

  setHP(hp, max) {
    const v = Math.ceil(hp);
    if (this.last.hp === v) return;
    this.last.hp = v;
    $('hpFill').style.width = (100 * hp / max) + '%';
    $('hpFill').classList.toggle('low', hp / max < 0.3);
    $('hpText').textContent = v + ' HP';
  }

  setClock(t, kills) {
    const s = fmtTime(t);
    if (this.last.time !== s) { this.last.time = s; $('time').textContent = s; }
    if (this.last.kills !== kills) { this.last.kills = kills; $('kills').textContent = kills + ' kills'; }
  }

  setWeapon(w, bagCount) {
    const color = `var(--t${w.tier})`;
    $('wN').textContent = w.name; $('wN').style.color = color;
    $('wR').textContent = RARITY[w.tier] + ' · tile ' + w.max; $('wR').style.color = color;
    $('wT').textContent = w.trait;
    $('sD').textContent = w.dmg;
    $('sF').textContent = w.rate.toFixed(1);
    $('sP').textContent = w.pellets;
    $('sB').textContent = bagCount + '/16';
    const nl = w.l + 1;
    $('wX').textContent = `Next: ${2 ** nl} → ${weaponName(nl)}`;
  }

  setBoss(name, frac) {
    const key = name ? name + Math.round(frac * 200) : null;
    if (this.last.boss === key) return;
    this.last.boss = key;
    $('bossBar').hidden = !name;
    if (!name) return;
    $('bossName').textContent = name;
    $('bossFill').style.width = Math.max(0, frac * 100) + '%';
  }

  setRecords(text) {
    $('records').textContent = text;
    $('records').hidden = !text;
  }

  banner(text, sub, color) {
    $('bannerT').textContent = text;
    $('bannerT').style.color = color;
    $('bannerS').textContent = sub;
    $('banner').hidden = false;
    $('banner').style.opacity = 1;
    this.bannerT = 1.8;
  }

  tick(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      $('banner').style.opacity = Math.min(1, this.bannerT * 1.5);
      if (this.bannerT <= 0) $('banner').hidden = true;
    }
  }

  setLock(text, urgent) {
    if (this.last.lock === text) return;
    this.last.lock = text;
    $('lockWarn').hidden = !text;
    if (text) {
      $('lockMsg').textContent = text;
      $('lockSub').hidden = !urgent;
    }
  }

  setHammerHint(on) {
    if (this.last.hammer === on) return;
    this.last.hammer = on;
    $('hammerHint').hidden = !on;
  }

  floatText(x, y, text, color, size = 12) {
    const el = this.pool.pop() || Object.assign(document.createElement('div'), { className: 'ft' });
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = size + 'px';
    this.layer.appendChild(el);
    this.texts.push({ el, x, y, life: 0.7 });
    if (this.texts.length > 70) this.texts[0].life = 0;
  }

  updateTexts(dt, toScreen) {
    for (const t of this.texts) {
      t.life -= dt;
      t.y += 26 * dt;
      const [sx, sy] = toScreen(t.x, t.y);
      t.el.style.transform = `translate(${sx | 0}px, ${sy | 0}px) translate(-50%, -50%)`;
      t.el.style.opacity = Math.min(1, t.life * 3);
    }
    if (this.texts.some(t => t.life <= 0)) {
      this.texts = this.texts.filter(t => {
        if (t.life > 0) return true;
        t.el.remove();
        this.pool.push(t.el);
        return false;
      });
    }
  }

  clearTexts() {
    for (const t of this.texts) { t.el.remove(); this.pool.push(t.el); }
    this.texts = [];
  }

  get overlayOpen() { return !$('ov').hidden; }

  showOverlay(title, html, button, enabled = true) {
    $('ovT').textContent = title;
    $('ovP').innerHTML = html;
    $('ovB').textContent = button;
    $('ovB').disabled = !enabled;
    $('ov').hidden = false;
    if (enabled) $('ovB').focus();
  }

  hideOverlay() { $('ov').hidden = true; }
}

export { fmtTime };
