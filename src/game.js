import * as THREE from 'three';
import {
  ARENA, PLAYER, ENEMIES, MUZZLE, BODY_Y, SHEETS, DEATH_FX, FX_SCALE, VIEW_HEIGHT,
  BULLET_COLORS, RARITY, LOCK_GRACE, HAMMER_SLOWMO, HAMMER_CHANCE, DEATH_SFX,
  SPAWN_AHEAD_CHANCE, SPAWN_AHEAD_SPREAD, RING, BOSS,
  enemyHpMul, enemySpeedMul, spawnInterval, rollEnemyType, dropFor,
} from './config.js';
import { SheetSprite } from './sprite.js';
import { shadowTexture, glowTexture, tileTexture, hammerTexture } from './assets.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Depth layers (camera looks down -z). Actors sort by -y so lower on screen draws in front.
const Z_FLOOR = -9000, Z_SHADOW = -8000, Z_CORPSE = -5000, Z_BULLET = 500;

export class Game {
  constructor({ canvas, stage, sheets, ground, bag, hud, keys, sound }) {
    Object.assign(this, { sheets, bag, hud, stage, keys, sound });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x06070b, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
    this.camera.position.z = 10000;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), new THREE.MeshBasicMaterial({ map: ground }));
    floor.position.set(ARENA.w / 2, ARENA.h / 2, Z_FLOOR);
    this.scene.add(floor);

    this.quad = new THREE.PlaneGeometry(1, 1);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    const glow = glowTexture();
    const additive = color => new THREE.MeshBasicMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.bulletMats = BULLET_COLORS.map(additive);
    this.flashMat = additive('#ffd84a');
    this.enemyShotMat = additive('#ff3b4a');
    const line = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
    this.aimLineMat = line('#ff3b4a');
    this.chargeLineMat = line('#ff9a2e');
    this.hammerMat = new THREE.MeshBasicMaterial({ map: hammerTexture(), transparent: true, depthWrite: false });
    this.lootMats = new Map();

    this.player = { sprite: new SheetSprite(SHEETS.soldier, sheets.soldier), shadow: this.addShadow(24) };
    this.scene.add(this.player.sprite.mesh);
    this.respawn = new SheetSprite(SHEETS.respawn, sheets.respawn);
    this.respawn.play('spawn');
    this.respawn.mesh.visible = false;
    this.scene.add(this.respawn.mesh);

    this.enemies = []; this.bullets = []; this.loot = []; this.effects = []; this.corpses = []; this.flashes = [];
    this.enemyShots = [];
    this.touchTarget = null;
    this.paused = false;
    this.state = 'title';
    this.onGameOver = null;

    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
    this.reset();
  }

  // ---------- setup ----------
  resize() {
    const r = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.floor(r.width * dpr)), ph = Math.max(1, Math.floor(r.height * dpr));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(pw, ph, false);
    this.scale = Math.max(1, Math.round(ph / VIEW_HEIGHT)); // integer zoom keeps pixels square
    this.viewW = pw / this.scale;
    this.viewH = ph / this.scale;
    this.cssScale = this.scale / dpr;
    this.cssW = r.width; this.cssH = r.height;
    Object.assign(this.camera, { left: -this.viewW / 2, right: this.viewW / 2, top: this.viewH / 2, bottom: -this.viewH / 2 });
    this.camera.updateProjectionMatrix();
  }

  addShadow(w) {
    const m = new THREE.Mesh(this.quad, this.shadowMat);
    m.scale.set(w, w * 0.4, 1);
    this.scene.add(m);
    return m;
  }

  dropActor(a) {
    this.scene.remove(a.sprite.mesh);
    a.sprite.dispose();
    if (a.shadow) this.scene.remove(a.shadow);
    this.hideLine(a);
  }

  reset() {
    for (const a of [...this.enemies, ...this.corpses]) this.dropActor(a);
    for (const o of [...this.bullets, ...this.flashes, ...this.enemyShots]) this.scene.remove(o.mesh);
    for (const l of this.loot) { this.scene.remove(l.mesh); this.scene.remove(l.shadow); }
    for (const f of this.effects) { this.scene.remove(f.mesh); f.dispose(); }
    this.enemies = []; this.bullets = []; this.loot = []; this.effects = []; this.corpses = []; this.flashes = [];
    this.enemyShots = [];
    this.ringT = RING.start;
    this.bossT = BOSS.first;
    this.boss = null;
    this.bossKills = 0;

    const p = this.player;
    Object.assign(p, { x: ARENA.w / 2, y: ARENA.h / 2, vx: 0, vy: 0, hp: PLAYER.hp, max: PLAYER.hp, inv: 0, facing: 1, moving: false });
    p.sprite.mesh.visible = true;
    p.sprite.material.opacity = 1;
    p.sprite.play('idle', true);
    this.respawn.mesh.visible = false;

    Object.assign(this, { t: 0, kills: 0, score: 0, spawnT: 1.2, fireT: 0, shootT: 0, shake: 0, lockT: 0, bagFull: 0, best: 2, deathT: 0 });
    this.camX = p.x; this.camY = p.y;
    this.hud.clearTexts();
    this.bag.reset();
  }

  start() {
    this.reset();
    this.paused = false;
    this.state = 'spawning';
    this.player.sprite.mesh.visible = false;
    this.respawn.mesh.visible = true;
    this.respawn.play('spawn', true);
    this.respawn.place(this.player.x, this.player.y);
    this.sound.startMusic();
    this.sound.duckMusic(false);
  }

  // ---------- per frame ----------
  frame(dt) {
    if (!this.paused) {
      const sdt = this.bag.hammerMode ? dt * HAMMER_SLOWMO : dt;
      if (this.state === 'spawning') {
        this.respawn.update(sdt);
        if (this.respawn.done) {
          this.respawn.mesh.visible = false;
          this.player.sprite.mesh.visible = true;
          this.state = 'play';
        }
      }
      if (this.state === 'play') this.stepPlay(sdt);
      if (this.state === 'dying') {
        this.deathT -= sdt;
        if (this.deathT <= 0) { this.state = 'dead'; this.onGameOver?.(this.deathReason); }
      }
      if (this.state === 'play' || this.state === 'dying') this.stepEnemies(sdt);
      this.stepWorld(sdt);
      this.hud.tick(sdt);
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.hud.updateTexts(this.paused ? 0 : dt, (x, y) => this.toScreen(x, y));
    this.syncHud();
  }

  stepPlay(dt) {
    this.t += dt;
    const p = this.player, k = this.keys;

    let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    let my = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    if (this.touchTarget) {
      const dx = this.touchTarget.x - p.x, dy = this.touchTarget.y - p.y, d = Math.hypot(dx, dy);
      if (d > 4) { mx = dx / d; my = dy / d; }
    }
    const ml = Math.hypot(mx, my);
    p.moving = ml > 0;
    const ox = p.x, oy = p.y;
    if (ml) { p.x += mx / ml * PLAYER.speed * dt; p.y += my / ml * PLAYER.speed * dt; }
    p.x = clamp(p.x, 12, ARENA.w - 12);
    p.y = clamp(p.y, 8, ARENA.h - 40);
    if (dt > 0) { p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt; } // enemies lead their chase with this
    p.inv = Math.max(0, p.inv - dt);

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnEnemy();
      if (this.t > 90 && Math.random() < 0.3) this.spawnEnemy();
      this.spawnT = spawnInterval(this.t) * (this.boss ? BOSS.spawnSlowdown : 1);
    }
    if (!this.boss) {
      this.ringT -= dt;
      if (this.ringT <= 0) { this.spawnRing(); this.ringT = RING.every; }
      this.bossT -= dt;
      if (this.bossT <= 0) { this.spawnBoss(); this.bossT = BOSS.every; }
    }

    const w = this.bag.weapon();
    let target = null, nd = w.def.range;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nd) { nd = d; target = e; }
    }
    if (p.moving && Math.abs(mx) > 0.2) p.facing = mx < 0 ? -1 : 1;
    else if (target) p.facing = target.x < p.x ? -1 : 1;

    this.fireT -= dt;
    this.shootT -= dt;
    if (target && this.fireT <= 0) { this.fire(w, target); this.fireT = 1 / w.rate; }

    const s = p.sprite;
    if (p.moving) s.play('walk');
    else if (this.shootT <= 0) s.play('idle');
    s.flip = p.facing < 0;
    s.mesh.visible = !(p.inv > 0 && ((p.inv * 20) | 0) % 2);

    // Tiles only get pulled in while the bag has room; otherwise they stay where they dropped.
    let blocked = false;
    const bagHasRoom = this.bag.count() < 16;
    for (const l of this.loot) {
      const dx = p.x - l.x, dy = p.y - l.y, d = Math.hypot(dx, dy);
      if (d < PLAYER.magnet && d > 0 && (l.hammer || bagHasRoom)) { l.x += dx / d * 220 * dt; l.y += dy / d * 220 * dt; }
      if (d >= PLAYER.pickup) continue;
      if (l.hammer) {
        l.life = 0;
        this.sound.play('pickup', { pitch: 1.4 });
        if (this.bag.addHammer()) this.hud.floatText(p.x, p.y + 44, '+HAMMER', '#ffcc33', 13);
        else { this.score += 50; this.hud.floatText(p.x, p.y + 44, '+50', '#ffcc33', 12); }
      } else if (this.bag.add(l.v)) {
        l.life = 0;
        this.sound.play('pickup');
      } else blocked = true;
    }
    if (blocked) this.bagFull = 0.8;
    this.bagFull = Math.max(0, this.bagFull - dt);

    if (this.bag.isLocked() && this.bag.hammers === 0) {
      this.lockT += dt;
      if (this.lockT >= LOCK_GRACE) this.killPlayer('Bag locked up');
    } else this.lockT = 0;
  }

  stepEnemies(dt) {
    const p = this.player, live = this.state === 'play';
    for (const e of this.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.cd -= dt;
      const [vx, vy] = e.T.ai === 'gunner' ? this.aiGunner(e, d, dt, live)
        : e.T.ai === 'charger' ? this.aiCharger(e, d, dt)
        : e.T.ai === 'boss' ? this.aiBoss(e, d, dt, live)
        : this.chase(e, e.T.lead);
      e.x = clamp(e.x + vx * dt, 8, ARENA.w - 8);
      e.y = clamp(e.y + vy * dt, 8, ARENA.h - 8);
      e.sprite.flip = Math.abs(vx) > 1 ? vx < 0 : dx < 0;
      const busy = e.sprite.anim === 'shoot' && !e.sprite.done;
      if (!busy) e.sprite.play(Math.hypot(vx, vy) > 1 ? 'walk' : 'idle');
      if (e.hit > 0 && (e.hit -= dt) <= 0) e.sprite.material.color.setRGB(...e.T.tint);
      if (live && d < e.r + PLAYER.radius && p.inv <= 0) this.hurtPlayer(e.dmg);
    }
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
      const a = en[i], b = en[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d <= 0 || d >= m) continue;
      // Heavier (bigger) enemies get pushed less, so the boss shoves grunts aside.
      const o = (m - d) / d, ma = a.r * a.r, mb = b.r * b.r, fa = mb / (ma + mb), fb = ma / (ma + mb);
      a.x -= dx * o * fa; a.y -= dy * o * fa; b.x += dx * o * fb; b.y += dy * o * fb;
    }
    for (const e of en) {
      e.sprite.update(dt);
      e.sprite.place(e.x, e.y);
      e.shadow.position.set(e.x, e.y, Z_SHADOW);
    }
  }

  // ---------- enemy AI (each returns a velocity) ----------
  // Run toward where the player will be in up to `lead` seconds.
  chase(e, lead, speed = e.sp) {
    const p = this.player;
    const t = Math.min(lead, Math.hypot(p.x - e.x, p.y - e.y) / speed);
    const tx = p.x + p.vx * t - e.x, ty = p.y + p.vy * t - e.y, d = Math.hypot(tx, ty) || 1;
    return [tx / d * speed, ty / d * speed];
  }

  // Keep at range, strafe, then stop, show an aim line and fire one slow bullet.
  aiGunner(e, d, dt, live) {
    const p = this.player, T = e.T;
    if (e.mode === 'aim') {
      const [ax, ay] = this.leadPoint(T.lead);
      const mx = e.x + (ax < e.x ? -1 : 1) * MUZZLE.x, my = e.y + MUZZLE.y;
      this.showLine(e, this.aimLineMat, mx, my, ax, ay + BODY_Y, 1.5);
      e.sprite.flip = ax < e.x;
      if ((e.modeT -= dt) <= 0) {
        this.hideLine(e);
        if (live) this.enemyShoot(mx, my, ax, ay + BODY_Y, T);
        e.sprite.play('shoot', true);
        e.mode = 'move';
        e.cd = T.fireEvery * (0.8 + Math.random() * 0.4);
      }
      return [0, 0];
    }
    if (e.cd <= 0 && d < T.range * 1.25 && this.onScreen(e)) {
      e.mode = 'aim';
      e.modeT = T.aimTime;
      return [0, 0];
    }
    if (d > T.range) return this.chase(e, T.lead);
    const ux = (e.x - p.x) / d, uy = (e.y - p.y) / d;
    if (d < T.range * 0.6) return [ux * e.sp, uy * e.sp];        // too close: back off
    return [-uy * e.strafe * e.sp * 0.6, ux * e.strafe * e.sp * 0.6]; // in range: circle the player
  }

  // Charger moves, plus every so often: glow up, then fire a ring of slow bullets.
  aiBoss(e, d, dt, live) {
    const T = e.T;
    e.burstCd -= dt;
    if (e.mode === 'burst') {
      const k = 1 + 1.5 * Math.abs(Math.sin(this.t * 18));
      e.sprite.material.color.setRGB(T.tint[0] * k, T.tint[1] * k, T.tint[2] * k);
      if ((e.modeT -= dt) <= 0) {
        e.sprite.material.color.setRGB(...T.tint);
        const cx = e.x, cy = e.y + BODY_Y * T.scale, off = Math.random();
        if (live) {
          for (let i = 0; i < T.burstCount; i++) {
            const a = (i + off) / T.burstCount * Math.PI * 2;
            this.enemyShoot(cx, cy, cx + Math.cos(a), cy + Math.sin(a), T);
          }
        }
        e.mode = 'move';
        e.burstCd = T.burstEvery;
      }
      return [0, 0];
    }
    if (e.mode === 'move' && e.burstCd <= 0 && this.onScreen(e)) {
      e.mode = 'burst';
      e.modeT = T.burstWindup;
      return [0, 0];
    }
    return this.aiCharger(e, d, dt);
  }

  // Walk in, then wind up (orange line shows the lane) and dash through it.
  aiCharger(e, d, dt) {
    const T = e.T;
    if (e.mode === 'windup') {
      const [ax, ay] = this.leadPoint(T.lead);
      const len = T.dashSpeed * T.dashTime, dx = ax - e.x, dy = ay - e.y, dd = Math.hypot(dx, dy) || 1;
      e.dir = [dx / dd, dy / dd];
      this.showLine(e, this.chargeLineMat, e.x, e.y + 6, e.x + e.dir[0] * len, e.y + 6 + e.dir[1] * len, 10 * T.scale);
      if ((e.modeT -= dt) <= 0) { this.hideLine(e); e.mode = 'dash'; e.modeT = T.dashTime; }
      return [0, 0];
    }
    if (e.mode === 'dash') {
      if ((e.modeT -= dt) <= 0) { e.mode = 'recover'; e.modeT = T.recover; }
      return [e.dir[0] * T.dashSpeed, e.dir[1] * T.dashSpeed];
    }
    if (e.mode === 'recover') {
      if ((e.modeT -= dt) <= 0) { e.mode = 'move'; e.cd = T.chargeEvery; }
      return [0, 0];
    }
    if (e.cd <= 0 && d < T.chargeRange && this.onScreen(e)) {
      e.mode = 'windup';
      e.modeT = T.windup;
      return [0, 0];
    }
    return this.chase(e, T.lead);
  }

  leadPoint(t) {
    const p = this.player;
    return [p.x + p.vx * t, p.y + p.vy * t];
  }

  onScreen(e) {
    return Math.abs(e.x - this.camera.position.x) < this.viewW / 2 - 8
      && Math.abs(e.y - this.camera.position.y) < this.viewH / 2 - 8;
  }

  showLine(e, mat, x1, y1, x2, y2, width) {
    if (!e.line) { e.line = new THREE.Mesh(this.quad, mat); this.scene.add(e.line); }
    const len = Math.hypot(x2 - x1, y2 - y1);
    e.line.position.set((x1 + x2) / 2, (y1 + y2) / 2, Z_BULLET - 10);
    e.line.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    e.line.scale.set(len, width, 1);
    e.line.material.opacity = 0.25 + 0.25 * Math.sin(this.t * 30) ** 2;
  }

  hideLine(e) {
    if (!e.line) return;
    this.scene.remove(e.line);
    e.line = null;
  }

  enemyShoot(x, y, tx, ty, T) {
    const a = Math.atan2(ty - y, tx - x);
    const mesh = new THREE.Mesh(this.quad, this.enemyShotMat);
    mesh.scale.set(14, 14, 1);
    mesh.position.set(x, y, Z_BULLET);
    this.scene.add(mesh);
    this.enemyShots.push({ x, y, vx: Math.cos(a) * T.shotSpeed, vy: Math.sin(a) * T.shotSpeed, dmg: T.shotDmg, life: 3, mesh });
    this.sound.play('gun', { pitch: 0.7, volume: 0.7 });
  }

  damage(e, dmg, color) {
    const ey = e.y + BODY_Y * e.T.scale;
    e.hp -= dmg;
    e.hit = 0.07;
    e.sprite.material.color.setRGB(6, 6, 6);
    this.hud.floatText(e.x + (Math.random() - 0.5) * 8, ey + 12 * e.T.scale, String(dmg), color, 11 + Math.min(9, dmg / 15));
    if (e.hp <= 0) this.killEnemy(e);
  }

  // Area damage around (x, y); `skip` is the enemy the bullet already hit directly.
  explode(x, y, radius, dmg, color, skip = null) {
    this.spawnEffect('explosion', x, y, radius / 40);
    this.sound.play('explosion', { volume: 0.5, pitch: 1.3 });
    for (const e of this.enemies) {
      if (e.dead || e === skip) continue;
      if (Math.hypot(e.x - x, e.y + BODY_Y * e.T.scale - y) < radius + e.r) this.damage(e, dmg, color);
    }
  }

  stepWorld(dt) {
    const p = this.player;
    p.sprite.update(dt);
    p.sprite.place(p.x, p.y);
    p.shadow.position.set(p.x, p.y, Z_SHADOW);
    p.shadow.visible = this.state !== 'spawning' || this.respawn.frame > 5;

    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of this.enemies) {
        if (e.dead || b.hit.has(e)) continue;
        const ey = e.y + BODY_Y * e.T.scale;
        if (Math.hypot(e.x - b.x, ey - b.y) >= e.r + b.r + 3) continue;
        b.hit.add(e);
        this.damage(e, b.dmg, b.color);
        if (b.splash) this.explode(b.x, b.y, b.splash, Math.round(b.dmg * 0.6), b.color, e);
        if (b.pierce-- <= 0) { b.life = 0; break; }
      }
      b.mesh.position.set(b.x, b.y, Z_BULLET);
      if (b.life <= 0) this.scene.remove(b.mesh);
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    this.enemies = this.enemies.filter(e => !e.dead);

    for (const s of this.enemyShots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      s.mesh.position.set(s.x, s.y, Z_BULLET);
      if (this.state === 'play' && Math.hypot(p.x - s.x, p.y + BODY_Y - s.y) < 10) {
        s.life = 0;
        if (p.inv <= 0) this.hurtPlayer(s.dmg);
      }
      if (s.life <= 0 || s.x < 0 || s.y < 0 || s.x > ARENA.w || s.y > ARENA.h) { s.life = 0; this.scene.remove(s.mesh); }
    }
    this.enemyShots = this.enemyShots.filter(s => s.life > 0);

    for (const f of this.effects) {
      f.update(dt);
      if (f.done) { this.scene.remove(f.mesh); f.dispose(); }
    }
    this.effects = this.effects.filter(f => !f.done);

    for (const c of this.corpses) {
      c.sprite.update(dt);
      c.sprite.place(c.x, c.y, Z_CORPSE);
      c.corpseT -= dt;
      if (c.corpseT < 1) c.sprite.material.opacity = Math.max(0, c.corpseT);
      if (c.corpseT <= 0) this.dropActor(c);
    }
    this.corpses = this.corpses.filter(c => c.corpseT > 0);

    for (const l of this.loot) {
      l.life -= dt;
      l.age += dt;
      const hop = Math.max(0, 1 - l.age * 3) * 10;
      l.mesh.position.set(l.x, l.y + 8 + hop + Math.sin(l.age * 4 + l.phase) * 1.5, -l.y);
      l.mesh.visible = !(l.life < 3 && ((l.life * 8) | 0) % 2);
      l.shadow.position.set(l.x, l.y, Z_SHADOW);
      if (l.life <= 0) { this.scene.remove(l.mesh); this.scene.remove(l.shadow); }
    }
    this.loot = this.loot.filter(l => l.life > 0);

    for (const f of this.flashes) {
      f.life -= dt;
      if (f.life <= 0) this.scene.remove(f.mesh);
    }
    this.flashes = this.flashes.filter(f => f.life > 0);

    this.shake = Math.max(0, this.shake - dt * 30);
  }

  // ---------- actions ----------
  // Spawns just outside the view; often in the direction the player is running.
  spawnEnemy() {
    if (this.boss && this.nearbyEnemies().length >= BOSS.maxNearby) return;
    const [x, y] = this.spawnPoint();
    if (Math.hypot(x - this.player.x, y - this.player.y) < 110) return; // pinned against a wall; skip this one
    this.addEnemy(rollEnemyType(this.t), x, y);
  }

  // A point just outside the view, biased toward where the player is heading.
  spawnPoint() {
    const p = this.player;
    const ahead = p.moving && Math.random() < SPAWN_AHEAD_CHANCE;
    const a = ahead ? Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * SPAWN_AHEAD_SPREAD : Math.random() * Math.PI * 2;
    const hw = this.viewW / 2 + 30, hh = this.viewH / 2 + 50, c = Math.cos(a), s = Math.sin(a);
    const t = Math.min(hw / Math.max(Math.abs(c), 1e-6), hh / Math.max(Math.abs(s), 1e-6));
    return [clamp(this.camX + c * t, 24, ARENA.w - 24), clamp(this.camY + s * t, 24, ARENA.h - 24)];
  }

  spawnBoss() {
    let [x, y] = this.spawnPoint();
    const p = this.player;
    if (Math.hypot(x - p.x, y - p.y) < 140) { x = ARENA.w - x; y = ARENA.h - y; } // cornered: use the far side
    // Clear the stage: keep only the nearest few regular enemies, puff the rest away.
    const keep = new Set(this.nearbyEnemies().slice(0, BOSS.maxNearby));
    for (const e of this.enemies) if (!keep.has(e)) this.despawnEnemy(e);
    this.enemies = this.enemies.filter(e => !e.dead);

    this.boss = this.addEnemy('boss', x, y);
    this.boss.burstCd = 2;
    this.hud.banner(BOSS.name.toUpperCase(), 'Boss incoming', '#ffcc33');
    this.sound.play('explosion', { volume: 1.5, pitch: 0.6, jitter: 0 });
  }

  // Regular (non-boss) enemies within BOSS.nearbyRadius, nearest first.
  nearbyEnemies() {
    const p = this.player;
    return this.enemies
      .filter(e => !e.dead && e !== this.boss)
      .map(e => [e, Math.hypot(e.x - p.x, e.y - p.y)])
      .filter(([, d]) => d < BOSS.nearbyRadius)
      .sort((a, b) => a[1] - b[1])
      .map(([e]) => e);
  }

  // Removes an enemy without it counting as a kill: no loot, no score, just a puff of smoke.
  despawnEnemy(e) {
    e.dead = true;
    this.spawnEffect('smoke', e.x, e.y + BODY_Y * e.T.scale, e.T.scale);
    this.dropActor(e);
  }

  // A closing circle of grunts around the player.
  spawnRing() {
    const p = this.player;
    const n = Math.round(RING.base + this.t / 60 * RING.perMinute);
    const r = Math.hypot(this.viewW, this.viewH) / 2 + 10, off = Math.random() * 6;
    for (let i = 0; i < n; i++) {
      const a = off + i / n * Math.PI * 2;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x > 8 && y > 8 && x < ARENA.w - 8 && y < ARENA.h - 8) this.addEnemy('grunt', x, y);
    }
    this.hud.banner('SURROUNDED', 'Break out!', '#ff4d5e');
  }

  addEnemy(type, x, y) {
    const T = ENEMIES[type];
    const sprite = new SheetSprite(SHEETS.soldier, this.sheets.soldier);
    sprite.scale = T.scale;
    sprite.speed = T.animSpeed;
    sprite.material.color.setRGB(...T.tint);
    sprite.play('walk');
    sprite.t = Math.random();
    this.scene.add(sprite.mesh);
    const hp = T.hp * enemyHpMul(this.t);
    const e = {
      type, T, x, y, r: T.radius, sp: T.speed * enemySpeedMul(this.t), hp, maxHp: hp, dmg: T.dmg, hit: 0,
      sprite, shadow: this.addShadow(24 * T.scale),
      mode: 'move', modeT: 0, cd: 1 + Math.random(), strafe: Math.random() < 0.5 ? 1 : -1, line: null,
    };
    this.enemies.push(e);
    return e;
  }

  fire(w, target) {
    const p = this.player, d = w.def, n = w.pellets;
    const mx = p.x + p.facing * MUZZLE.x, my = p.y + MUZZLE.y;
    const base = Math.atan2(target.y + BODY_Y * target.T.scale - my, target.x - mx);
    const size = (4 + w.l * 0.5) * (d.size ?? 1);
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const a = base + k * (d.spread ?? 0) + (Math.random() * 2 - 1) * (d.jitter ?? 0);
      const off = k * (d.parallel ?? 0); // side-by-side barrels
      const x = mx - Math.sin(base) * off, y = my + Math.cos(base) * off;
      const mesh = new THREE.Mesh(this.quad, this.bulletMats[w.tier]);
      mesh.scale.set(size * 2.2 * (d.stretch ?? 1), size, 1);
      mesh.rotation.z = a;
      mesh.position.set(x, y, Z_BULLET);
      this.scene.add(mesh);
      this.bullets.push({
        x, y, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed, life: d.range / d.speed,
        r: 2 + w.l * 0.3 * (d.size ?? 1), dmg: w.dmg, pierce: d.pierce ?? 0, splash: d.splash ?? 0, hit: new Set(),
        mesh, color: BULLET_COLORS[w.tier],
      });
    }
    this.shootT = 0.16;
    this.sound.play('gun', { pitch: (1.12 - w.l * 0.03) * (n > 4 ? 0.8 : 1) }); // bigger guns sound heavier
    if (p.moving) this.addFlash(mx, my);
    else p.sprite.play('shoot', true);
  }

  addFlash(x, y) {
    const mesh = new THREE.Mesh(this.quad, this.flashMat);
    mesh.scale.set(14, 14, 1);
    mesh.position.set(x, y, Z_BULLET + 1);
    this.scene.add(mesh);
    this.flashes.push({ mesh, life: 0.05 });
  }

  spawnEffect(name, x, y, scale = 1) {
    const s = new SheetSprite(SHEETS[name], this.sheets[name]);
    s.scale = scale * (FX_SCALE[name] ?? 1);
    s.flip = Math.random() < 0.5;
    s.play('play');
    s.place(x, y, -y + 60);
    this.scene.add(s.mesh);
    this.effects.push(s);
  }

  lootMat(v) {
    if (!this.lootMats.has(v)) {
      this.lootMats.set(v, new THREE.MeshBasicMaterial({ map: tileTexture(v), transparent: true, depthWrite: false }));
    }
    return this.lootMats.get(v);
  }

  dropLoot(x, y, v, hammer, life = hammer ? 12 : 10, size = 16) {
    const mesh = new THREE.Mesh(this.quad, hammer ? this.hammerMat : this.lootMat(v));
    mesh.scale.set(size, size, 1);
    this.scene.add(mesh);
    this.loot.push({ x, y, v, hammer, mesh, shadow: this.addShadow(size * 0.9), life, age: 0, phase: Math.random() * 6 });
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    this.score += 10;
    e.sprite.play('death', true);
    e.sprite.speed = 1;
    e.sprite.material.color.setRGB(...e.T.tint);
    this.hideLine(e);
    this.scene.remove(e.shadow);
    e.shadow = null;
    e.corpseT = 6;
    this.corpses.push(e);
    if (this.corpses.length > 80) { const old = this.corpses.shift(); this.dropActor(old); old.corpseT = 0; }

    for (const fx of DEATH_FX[e.type]) this.spawnEffect(fx, e.x, e.y + BODY_Y * e.T.scale, e.T.scale);
    this.sound.play(DEATH_SFX[e.type]);
    const v = dropFor(e.type);
    if (v) this.dropLoot(e.x, e.y, v, false);
    if (Math.random() < HAMMER_CHANCE[e.type]) this.dropLoot(e.x + 12, e.y - 4, 0, true);
    if (e === this.boss) this.bossDown(e);
  }

  bossDown(e) {
    this.boss = null;
    this.bossKills++;
    this.score += 500;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * 6.28, r = Math.random() * 30;
      this.spawnEffect('explosion', e.x + Math.cos(a) * r, e.y + 20 + Math.sin(a) * r, 1.2 + Math.random());
    }
    this.shake = 10;
    const tile = BOSS.loot[Math.min(this.bossKills - 1, BOSS.loot.length - 1)];
    this.dropLoot(e.x, e.y, tile, false, BOSS.lootLife, 24);
    for (let i = 0; i < BOSS.hammers; i++) this.dropLoot(e.x + (i ? 22 : -22), e.y - 6, 0, true, BOSS.lootLife);
    this.hud.banner(`${BOSS.name.toUpperCase()} DOWN`, `Dropped a ${tile} tile`, '#ffcc33');
  }

  hurtPlayer(dmg) {
    const p = this.player;
    p.hp -= dmg;
    p.inv = PLAYER.invuln;
    this.shake = 6;
    this.hud.floatText(p.x, p.y + 44, '-' + dmg, '#ff4d5e', 15);
    if (p.hp <= 0) { p.hp = 0; this.killPlayer('You died'); }
  }

  killPlayer(reason) {
    if (this.state !== 'play') return;
    const p = this.player;
    this.state = 'dying';
    this.deathReason = reason;
    this.deathT = 1.6;
    if (this.bag.hammerMode) this.bag.toggleHammer();
    p.sprite.mesh.visible = true;
    p.sprite.play('death', true);
    this.spawnEffect('blood', p.x, p.y + BODY_Y, 1);
    this.sound.play('death', { pitch: 0.75, volume: 1.6, jitter: 0 });
    this.sound.duckMusic(true);
  }

  onMerges(merges) {
    const p = this.player;
    if (merges.length) this.sound.play('pickup', { pitch: 0.9 + Math.log2(Math.max(...merges)) * 0.06, jitter: 0 });
    for (const v of merges) {
      this.score += v;
      const heal = 2 + Math.log2(v);
      p.hp = Math.min(p.max, p.hp + heal);
      this.hud.floatText(p.x, p.y + 50, `+${Math.round(heal)} HP`, '#5be08a', 12);
    }
  }

  onBagChange() {
    const w = this.bag.weapon();
    if (w.max <= this.best) return;
    this.best = w.max;
    if (this.state === 'play') this.hud.banner(w.name.toUpperCase(), `${RARITY[w.tier]} · ${w.trait}`, BULLET_COLORS[w.tier]);
  }

  // ---------- camera / screen ----------
  updateCamera(dt) {
    const p = this.player, k = 1 - Math.exp(-dt * 8);
    this.camX += (p.x - this.camX) * k;
    this.camY += (p.y + 12 - this.camY) * k;
    const hw = this.viewW / 2, hh = this.viewH / 2;
    let cx = ARENA.w > this.viewW ? clamp(this.camX, hw, ARENA.w - hw) : ARENA.w / 2;
    let cy = ARENA.h > this.viewH ? clamp(this.camY, hh, ARENA.h - hh) : ARENA.h / 2;
    if (this.shake) { cx += (Math.random() - 0.5) * this.shake; cy += (Math.random() - 0.5) * this.shake; }
    this.camera.position.x = Math.round(cx * this.scale) / this.scale;
    this.camera.position.y = Math.round(cy * this.scale) / this.scale;
  }

  toScreen(x, y) {
    return [
      (x - this.camera.position.x) * this.cssScale + this.cssW / 2,
      this.cssH / 2 - (y - this.camera.position.y) * this.cssScale,
    ];
  }

  toWorld(sx, sy) {
    return {
      x: this.camera.position.x + (sx - this.cssW / 2) / this.cssScale,
      y: this.camera.position.y - (sy - this.cssH / 2) / this.cssScale,
    };
  }

  syncHud() {
    const p = this.player, playing = this.state === 'play';
    this.hud.setHP(p.hp, p.max);
    this.hud.setClock(this.t, this.kills);
    const locked = playing && this.bag.isLocked();
    let lock = null;
    if (locked) lock = this.bag.hammers ? 'BAG LOCKED · USE YOUR HAMMER' : `BAG LOCKED · ${Math.max(0, LOCK_GRACE - this.lockT).toFixed(1)}s`;
    this.hud.setLock(lock, locked && !this.bag.hammers);
    this.hud.setHammerHint(this.bag.hammerMode);
    this.hud.setBoss(this.boss && !this.boss.dead ? BOSS.name : null, this.boss ? this.boss.hp / this.boss.maxHp : 0);
    this.bag.setFlags({ full: this.bagFull > 0 || locked, armed: this.bag.hammers > 0 && playing });
  }
}
