// All tuning lives here. World units are art pixels; +y is up.

export const VIEW_HEIGHT = 300;            // world pixels visible vertically (rounded to an integer zoom)
export const ARENA = { w: 1536, h: 1536 };

export const PLAYER = { speed: 120, hp: 100, radius: 8, invuln: 0.6, magnet: 48, pickup: 16 };
export const FIRE_RANGE = 240;
export const BULLET = { speed: 420, life: 0.8 };
export const MUZZLE = { x: 16, y: 19 };     // gun tip relative to the feet anchor, facing right
export const BODY_Y = 15;                   // body centre above the feet, for hit tests
export const LOCK_GRACE = 5;                // seconds to find a hammer once the bag locks
export const MAX_HAMMERS = 3;
export const HAMMER_SLOWMO = 0.25;

// ---------- Sprite sheets ----------
// frames are [row, col] cells; anchor is the feet position inside a cell (px from top-left).
const row = (r, n) => Array.from({ length: n }, (_, c) => [r, c]);

export const SHEETS = {
  soldier: {
    url: 'soldier/Black_Soldier.png', cellW: 116, cellH: 67, anchor: [64, 64],
    anims: {
      idle:  { frames: row(0, 3), fps: 5, loop: true },
      shoot: { frames: row(3, 2), fps: 14, loop: false },
      walk:  { frames: [...row(5, 3), ...row(6, 3), ...row(7, 2)], fps: 12, loop: true },
      death: { frames: [...row(11, 3), ...row(12, 3), ...row(13, 1)], fps: 10, loop: false },
    },
  },
  respawn: {
    url: 'soldier/Black_Soldier_Respaw.png', cellW: 174, cellH: 152, anchor: [79, 146],
    anims: { spawn: { frames: [...row(0, 3), ...row(1, 3), ...row(2, 3)], fps: 14, loop: false } },
  },
  explosion: {
    url: 'effects/explosion1.png', cellW: 64, cellH: 64, anchor: [32, 32],
    anims: { play: { frames: row(0, 8), fps: 18, loop: false } },
  },
  smoke: {
    url: 'effects/smokeburst1.png', cellW: 64, cellH: 64, anchor: [32, 32],
    anims: { play: { frames: row(0, 10), fps: 16, loop: false } },
  },
  blood: {
    url: 'effects/burstsplatterred.png', cellW: 64, cellH: 64, anchor: [32, 32],
    anims: { play: { frames: row(0, 10), fps: 20, loop: false } },
  },
};

// Floor: 64x64 regions picked from ground.png, weighted.
export const GROUND = {
  url: 'environment/ground.png',
  tiles: [
    { rect: [128, 0, 64, 64], weight: 12 },
    { rect: [64, 0, 64, 64], weight: 1 },
  ],
};

// ---------- Audio ----------
// throttle: min seconds between two plays of the same sound; voices: max overlapping copies.
export const SOUNDS = {
  gun:       { url: 'sound/gun1.mp3',       volume: 0.22, throttle: 0.045, voices: 6 },
  pickup:    { url: 'sound/pickup1.mp3',    volume: 0.45, throttle: 0.03,  voices: 4 },
  explosion: { url: 'sound/explosion1.mp3', volume: 0.2, throttle: 0.08,  voices: 3 },
  death:     { url: 'sound/death1.mp3',     volume: 0.16, throttle: 0.07,  voices: 4 },
};
export const MUSIC = { url: 'sound/Mega%20Bot%20Bay.ogg', volume: 0.3, duckedVolume: 0.1 };
export const DEATH_SFX = { grunt: 'death', runner: 'death', gunner: 'death', brute: 'explosion' };

// ---------- Enemies ----------
// tint multiplies the (dark) soldier sprite in linear space, so values above 1 brighten it.
// ai: 'chase' runs at where the player will be in `lead` seconds (cuts off circle-kiting),
//     'gunner' keeps its distance and shoots telegraphed bullets, 'charger' winds up and dashes.
export const ENEMIES = {
  grunt:  { hp: 6,   speed: 50, dmg: 10, radius: 9,  scale: 1,    tint: [4, 0.7, 0.7], animSpeed: 1,
            ai: 'chase', lead: 0.4 },
  runner: { hp: 3.5, speed: 95, dmg: 6,  radius: 8,  scale: 0.85, tint: [4, 2.4, 0.5], animSpeed: 1.6,
            ai: 'chase', lead: 1.1 },
  gunner: { hp: 5,   speed: 44, dmg: 8,  radius: 9,  scale: 1,    tint: [0.7, 3.2, 2.4], animSpeed: 1,
            ai: 'gunner', range: 150, fireEvery: 2.4, aimTime: 0.55, shotSpeed: 140, shotDmg: 9, lead: 0.3 },
  brute:  { hp: 26,  speed: 34, dmg: 22, radius: 14, scale: 1.45, tint: [2.6, 1, 3.6], animSpeed: 0.7,
            ai: 'charger', lead: 0.3, chargeRange: 150, windup: 0.6, dashSpeed: 280, dashTime: 0.45, recover: 0.7, chargeEvery: 2.5 },
};

// Spawns favour the direction the player is running, so a big loop runs into fresh enemies.
export const SPAWN_AHEAD_CHANCE = 0.55;
export const SPAWN_AHEAD_SPREAD = 1.2;  // radians

// Ring waves: a circle of grunts appears around the player every so often.
export const RING = { start: 30, every: 35, base: 10, perMinute: 6 };

// Which effects play when each enemy type dies.
export const DEATH_FX = {
  grunt: ['blood', 'smoke'],
  runner: ['blood'],
  gunner: ['blood', 'smoke'],
  brute: ['explosion', 'smoke', 'blood'],
};
export const FX_SCALE = { explosion: 1.3, smoke: 0.9, blood: 0.8 };

export function rollEnemyType(t) {
  const r = Math.random();
  if (t > 45 && r < 0.10) return 'brute';
  if (t > 25 && r < 0.28) return 'gunner';
  if (t > 15 && r < 0.55) return 'runner';
  return 'grunt';
}
export const enemyHpMul = t => 1 + t / 25 + (t / 60) ** 2 * 0.5;
export const enemySpeedMul = t => 1 + Math.min(0.6, t / 400);
export const spawnInterval = t => Math.max(0.2, 1.25 - t * 0.011) * (0.6 + Math.random() * 0.8);

export function dropFor(type) {
  const r = Math.random();
  if (type === 'boss') return 0; // boss loot is handled separately (BOSS.loot)
  if (type === 'brute') return r < 0.35 ? 8 : 4;
  if (type === 'runner') return r < 0.5 ? 2 : 0;
  if (type === 'gunner') return r < 0.3 ? 4 : r < 0.9 ? 2 : 0;
  return r < 0.12 ? 4 : r < 0.85 ? 2 : 0;
}
export const HAMMER_CHANCE = { grunt: 0.035, runner: 0.06, gunner: 0.06, brute: 0.3 };

// ---------- Weapons ----------
// One per highest-tile level (index = log2 of the tile). Base damage grows with the level and base
// fire rate with the bag's total; each gun then multiplies those and adds its own behaviour:
//   pellets/spread  fan of shots          parallel  side-by-side barrels (px apart)
//   jitter          random aim wobble     pierce    extra enemies a shot passes through
//   splash          explosion radius on hit (deals 60% damage around it)
//   range           how far shots fly     size/stretch  bullet look
export const WEAPONS = [
  null,
  { name: 'Pea Shooter',   trait: 'Single shot',             dmgMul: 1,    rateMul: 1,   speed: 420, range: 240 },
  { name: 'Rusty Pistol',  trait: 'Heavier single shot',     dmgMul: 1.15, rateMul: 1,   speed: 440, range: 250 },
  { name: 'Scrap SMG',     trait: 'Rapid fire',              dmgMul: 0.55, rateMul: 2.2, speed: 460, range: 230, jitter: 0.12 },
  { name: 'Twin Uzis',     trait: 'Twin barrels',            dmgMul: 0.55, rateMul: 2,   speed: 460, range: 230, pellets: 2, parallel: 8, jitter: 0.08 },
  { name: 'Pump Shotgun',  trait: '7-pellet spread',         dmgMul: 0.5,  rateMul: 0.45, speed: 380, range: 150, pellets: 7, spread: 0.11, jitter: 0.04 },
  { name: 'Rail Carbine',  trait: 'Pierces 5 enemies',       dmgMul: 1.8,  rateMul: 0.5, speed: 900, range: 320, pierce: 5, size: 0.8, stretch: 4 },
  { name: 'Plasma Rifle',  trait: 'Explosive bolts',         dmgMul: 1.1,  rateMul: 0.8, speed: 300, range: 260, splash: 30, size: 1.6 },
  { name: 'Storm Cannon',  trait: 'Piercing scatter',        dmgMul: 0.6,  rateMul: 0.5, speed: 470, range: 200, pellets: 9, spread: 0.12, pierce: 1 },
  { name: 'Void Repeater', trait: 'Rapid piercing',          dmgMul: 0.7,  rateMul: 2,   speed: 700, range: 300, pierce: 3, jitter: 0.05, stretch: 3 },
  { name: 'Sunbreaker',    trait: 'Triple explosive',        dmgMul: 1.2,  rateMul: 0.7, speed: 360, range: 260, pellets: 3, spread: 0.18, splash: 45, size: 1.8 },
  { name: 'THE 2048',      trait: 'Everything at once',      dmgMul: 1,    rateMul: 1.4, speed: 650, range: 300, pellets: 5, spread: 0.1, pierce: 3, splash: 35, size: 1.6 },
];
const MAX_WEAPON = WEAPONS.length - 1;
export const weaponName = l => l > MAX_WEAPON ? `THE 2048 +${l - MAX_WEAPON}` : WEAPONS[l].name;

export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const TILE_COLORS = ['#5a6172', '#3faa58', '#3a78d4', '#9a4fd6', '#ee8a22', '#ff2f6a'];
export const BULLET_COLORS = ['#cfd6e6', '#5be07a', '#5a9cff', '#b77bff', '#ffa640', '#ff4f86'];

export function tierOf(v) {
  const l = Math.log2(v);
  return l <= 2 ? 0 : l <= 4 ? 1 : l <= 6 ? 2 : l <= 8 ? 3 : l <= 10 ? 4 : 5;
}

export function weaponFromBoard(cells) {
  const max = Math.max(2, ...cells), l = Math.log2(max), sum = cells.reduce((a, v) => a + v, 0) || 2;
  const def = WEAPONS[Math.min(l, MAX_WEAPON)];
  return {
    max, l, tier: tierOf(max), def, name: weaponName(l), trait: def.trait,
    dmg: Math.max(1, Math.round(3 * Math.pow(1.55, l - 1) * def.dmgMul)),
    rate: Math.min(16, (2 + 0.6 * Math.log2(sum)) * def.rateMul),
    pellets: def.pellets ?? 1,
  };
}

// ---------- Boss ----------
// Appears at `first` seconds, then every `every` seconds. Uses the charger AI plus radial bullet bursts.
// Drops loot[n] for the n-th boss (last entry repeats) and some hammers.
export const BOSS = {
  name: 'The Warden', first: 90, every: 120,
  loot: [32, 64, 128, 256, 512], hammers: 2, lootLife: 30,
  // While the boss lives: normal spawns are this many times slower, and never more than
  // maxNearby regular enemies within nearbyRadius of the player. When it spawns, everything
  // beyond that is despawned (no loot, no kills).
  spawnSlowdown: 4, maxNearby: 10, nearbyRadius: 260,
};
ENEMIES.boss = {
  hp: 300, speed: 30, dmg: 30, radius: 22, scale: 2.4, tint: [3.6, 2.6, 0.5], animSpeed: 0.6,
  ai: 'boss', lead: 0.3, chargeRange: 200, windup: 0.8, dashSpeed: 320, dashTime: 0.5, recover: 1, chargeEvery: 4,
  burstEvery: 3.5, burstWindup: 0.6, burstCount: 14, shotSpeed: 95, shotDmg: 12,
};
DEATH_FX.boss = ['explosion', 'smoke', 'blood'];
DEATH_SFX.boss = 'explosion';
HAMMER_CHANCE.boss = 0;
