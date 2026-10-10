// Web Audio wrapper: decoded one-shot effects with throttling/voice caps, plus a looping music track.
const MUTE_KEY = '2048ls-muted';

export class Sound {
  constructor(sounds, music) {
    this.defs = sounds;
    this.musicDef = music;
    this.buffers = {};
    this.last = {};
    this.active = {};
    this.musicSrc = null;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = music.volume;
    this.musicGain.connect(this.master);
    let muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }
    this.setMuted(muted);
  }

  async load() {
    const entries = [...Object.entries(this.defs), ['__music', this.musicDef]];
    await Promise.all(entries.map(async ([name, def]) => {
      try {
        const res = await fetch(def.url);
        this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        console.warn(`Sound "${name}" failed to load`, err); // the game still runs without it
      }
    }));
  }

  // Browsers only allow audio after a user gesture; call this from a click/keypress.
  unlock() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Silence everything while the tab is hidden (otherwise a background tab keeps playing music).
  setHidden(hidden) {
    if (hidden) this.ctx.suspend();
    else this.ctx.resume();
  }

  play(name,{ volume = 1, pitch = 1, jitter = 0.06 } = {}) {
    const buf = this.buffers[name], def = this.defs[name];
    if (!buf || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < def.throttle) return;
    if ((this.active[name] ?? 0) >= def.voices) return;
    this.last[name] = now;
    this.active[name] = (this.active[name] ?? 0) + 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * jitter);
    const gain = this.ctx.createGain();
    gain.gain.value = def.volume * volume;
    src.connect(gain).connect(this.master);
    src.onended = () => { this.active[name]--; };
    src.start();
  }

  startMusic() {
    const buf = this.buffers.__music;
    if (!buf || this.musicSrc) return;
    this.musicSrc = this.ctx.createBufferSource();
    this.musicSrc.buffer = buf;
    this.musicSrc.loop = true;
    this.musicSrc.connect(this.musicGain);
    this.musicSrc.start();
  }

  duckMusic(on) {
    const v = on ? this.musicDef.duckedVolume : this.musicDef.volume;
    this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  setMuted(m) {
    this.muted = m;
    this.master.gain.value = m ? 0 : 1;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage blocked */ }
  }

  toggleMute() { this.setMuted(!this.muted); }
}
