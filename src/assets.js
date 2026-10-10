import * as THREE from 'three';
import { TILE_COLORS, tierOf } from './config.js';

const loader = new THREE.TextureLoader();

function pixelTex(t) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load ' + url));
    img.src = url;
  });
}

export async function loadSheets(sheets) {
  const out = {};
  await Promise.all(Object.entries(sheets).map(async ([key, s]) => {
    out[key] = pixelTex(await loader.loadAsync(s.url));
  }));
  return out;
}

// Paints the whole arena floor once from weighted 64x64 tiles.
export async function buildGround(cfg, w, h) {
  const img = await loadImage(cfg.url);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const total = cfg.tiles.reduce((a, t) => a + t.weight, 0);
  for (let y = 0; y < h; y += 64) {
    for (let x = 0; x < w; x += 64) {
      let r = Math.random() * total, tile = cfg.tiles[0];
      for (const t of cfg.tiles) { if ((r -= t.weight) < 0) { tile = t; break; } }
      const [sx, sy, sw, sh] = tile.rect;
      g.drawImage(img, sx, sy, sw, sh, x, y, 64, 64);
    }
  }
  // Darken the outer rim so the arena edge reads as a boundary.
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(4, 5, 10, ${0.5 - i * 0.1})`;
    g.fillRect(i * 4, i * 4, w - i * 8, 4); g.fillRect(i * 4, h - 4 - i * 4, w - i * 8, 4);
    g.fillRect(i * 4, i * 4, 4, h - i * 8); g.fillRect(w - 4 - i * 4, i * 4, 4, h - i * 8);
  }
  return pixelTex(new THREE.CanvasTexture(c));
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function shadowTexture() {
  const [c, g] = canvas(32, 32);
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(0,0,0,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture() {
  const [c, g] = canvas(32, 32);
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Loot tile: a little 2048 tile with its number, coloured by rarity.
export function tileTexture(v) {
  const [c, g] = canvas(48, 48);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect(2, 4, 44, 44, 7); g.fill();
  g.fillStyle = TILE_COLORS[tierOf(v)];
  g.beginPath(); g.roundRect(2, 1, 44, 43, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(3, 2, 42, 41, 6); g.stroke();
  const d = String(v).length;
  g.fillStyle = '#fff';
  g.font = `700 ${d >= 4 ? 14 : d === 3 ? 18 : 24}px "JetBrains Mono", Consolas, monospace`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(v, 24, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Pixel-art hammer pickup, drawn on a 16px grid.
export function hammerTexture() {
  const [c, g] = canvas(16, 16);
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(7, 6, 2, 9, '#2a1d10');        // handle outline
  px(7, 6, 2, 8, '#a8743a');        // handle
  px(2, 1, 12, 6, '#1b1406');       // head outline
  px(3, 2, 10, 4, '#ffcc33');       // head
  px(3, 2, 10, 1, '#fff2b0');       // highlight
  const t = new THREE.CanvasTexture(c);
  return pixelTex(t);
}
