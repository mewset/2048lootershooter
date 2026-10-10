import * as THREE from 'three';

const geoCache = new WeakMap();

// One animated quad cut from a sprite sheet. The quad's origin is the sheet's anchor (feet),
// so placing it at (x, y) puts the character's feet there and flipping mirrors around them.
export class SheetSprite {
  constructor(sheet, texture) {
    let geo = geoCache.get(sheet);
    if (!geo) {
      geo = new THREE.PlaneGeometry(sheet.cellW, sheet.cellH);
      geo.translate(sheet.cellW / 2 - sheet.anchor[0], sheet.anchor[1] - sheet.cellH / 2, 0);
      geoCache.set(sheet, geo);
    }
    this.sheet = sheet;
    this.map = texture.clone(); // shares the image/GPU upload, own UV offset
    this.uw = sheet.cellW / texture.image.width;
    this.vh = sheet.cellH / texture.image.height;
    this.map.repeat.set(this.uw, this.vh);
    this.material = new THREE.MeshBasicMaterial({ map: this.map, transparent: true, depthWrite: false, alphaTest: 0.01 });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.anim = null;
    this.frame = -1;
    this.t = 0;
    this.speed = 1;
    this.done = false;
    this.flip = false;
    this.scale = 1;
  }

  play(name, restart = false) {
    if (this.anim === name && !restart) return;
    this.anim = name;
    this.t = 0;
    this.done = false;
    this.setFrame(0);
  }

  setFrame(i) {
    const [r, c] = this.sheet.anims[this.anim].frames[i];
    this.frame = i;
    this.map.offset.set(c * this.uw, 1 - (r + 1) * this.vh);
  }

  update(dt) {
    const a = this.sheet.anims[this.anim];
    this.t += dt * this.speed;
    let f = Math.floor(this.t * a.fps);
    if (f >= a.frames.length) {
      if (a.loop) f %= a.frames.length;
      else { f = a.frames.length - 1; this.done = true; }
    }
    if (f !== this.frame) this.setFrame(f);
  }

  place(x, y, z = -y) {
    this.mesh.position.set(x, y, z);
    this.mesh.scale.set(this.flip ? -this.scale : this.scale, this.scale, 1);
  }

  dispose() {
    this.material.dispose();
    this.map.dispose();
  }
}
