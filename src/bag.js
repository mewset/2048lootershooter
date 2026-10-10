import { tierOf, weaponFromBoard, MAX_HAMMERS } from './config.js';

// The inventory: a 4x4 2048 board rendered as DOM. Directions: 0 left, 1 right, 2 up, 3 down.
export class Bag {
  constructor(el, hammerBtn) {
    this.el = el;
    this.btn = hammerBtn;
    this.onChange = null;
    this.onSwipe = null;
    this.onTap = null;

    let start = null;
    el.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
        const cell = e.target.closest('.cell');
        if (cell) this.onTap?.(+cell.dataset.i);
        return;
      }
      if (this.hammerMode) return;
      this.onSwipe?.(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3));
    });
    this.reset();
  }

  reset() {
    this.cells = Array(16).fill(0);
    this.cells[5] = 2;
    this.hammers = 1;
    this.hammerMode = false;
    this.cursor = 5;
    this.render(null, new Set([5]));
  }

  weapon() { return weaponFromBoard(this.cells); }
  count() { return this.cells.filter(Boolean).length; }

  // Returns the merged values, or null if nothing moved.
  slide(dir) {
    const b = this.cells, nb = Array(16).fill(0), merged = new Set(), merges = [];
    let moved = false;
    for (let i = 0; i < 4; i++) {
      const idx = [];
      for (let j = 0; j < 4; j++) {
        const r = dir < 2 ? i : (dir === 2 ? j : 3 - j);
        const c = dir < 2 ? (dir === 0 ? j : 3 - j) : i;
        idx.push(r * 4 + c);
      }
      const vals = idx.map(k => b[k]).filter(Boolean), out = [];
      for (let k = 0; k < vals.length; k++) {
        if (k + 1 < vals.length && vals[k] === vals[k + 1]) { out.push([vals[k] * 2, true]); merges.push(vals[k] * 2); k++; }
        else out.push([vals[k], false]);
      }
      out.forEach(([v, m], j) => { nb[idx[j]] = v; if (m) merged.add(idx[j]); });
      idx.forEach(k => { if (nb[k] !== b[k]) moved = true; });
    }
    if (!moved) return null;
    this.cells = nb;
    this.render(merged);
    return merges;
  }

  add(v) {
    const empty = [];
    this.cells.forEach((x, i) => { if (!x) empty.push(i); });
    if (!empty.length) return false;
    const i = empty[Math.random() * empty.length | 0];
    this.cells[i] = v;
    this.render(null, new Set([i]));
    return true;
  }

  smash(i) {
    if (this.hammers <= 0 || !this.cells[i] || this.count() <= 1) return false;
    this.cells[i] = 0;
    this.hammers--;
    this.hammerMode = false;
    this.render();
    return true;
  }

  addHammer() {
    if (this.hammers >= MAX_HAMMERS) return false;
    this.hammers++;
    return true;
  }

  toggleHammer() {
    if (this.hammerMode) this.hammerMode = false;
    else if (this.hammers > 0) this.hammerMode = true;
    else return;
    this.render();
  }

  moveCursor(dir) {
    let r = this.cursor >> 2, c = this.cursor & 3;
    if (dir === 0) c = Math.max(0, c - 1);
    if (dir === 1) c = Math.min(3, c + 1);
    if (dir === 2) r = Math.max(0, r - 1);
    if (dir === 3) r = Math.min(3, r + 1);
    this.cursor = r * 4 + c;
    this.render();
  }

  isLocked() {
    const b = this.cells;
    if (b.includes(0)) return false;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const v = b[r * 4 + c];
      if ((c < 3 && b[r * 4 + c + 1] === v) || (r < 3 && b[r * 4 + c + 4] === v)) return false;
    }
    return true;
  }

  render(merged = null, added = null) {
    this.el.innerHTML = '';
    this.cells.forEach((v, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell' + (this.hammerMode && i === this.cursor ? ' sel' : '');
      cell.dataset.i = i;
      if (v) {
        const t = document.createElement('div'), d = String(v).length;
        t.className = 'tile t' + tierOf(v) + (d >= 4 ? ' d4' : d === 3 ? ' d3' : '')
          + (merged?.has(i) ? ' pop' : '') + (added?.has(i) ? ' new' : '');
        t.textContent = v;
        cell.appendChild(t);
      }
      this.el.appendChild(cell);
    });
    this.onChange?.();
  }

  // Per-frame state classes and the hammer button label.
  setFlags({ full, armed }) {
    this.el.classList.toggle('full', full && !this.hammerMode);
    this.el.classList.toggle('hammer', this.hammerMode);
    this.el.classList.toggle('armed', armed);
    const label = this.hammerMode ? 'Cancel [Esc]' : `Hammer ×${this.hammers} [Space]`;
    if (this.btn.textContent !== label) {
      this.btn.textContent = label;
      this.btn.disabled = !this.hammerMode && this.hammers === 0;
    }
  }
}
