/* =========================================================
   音(オルガン風)。ブラウザの Web Audio だけで鳴らす。音源ファイルなし
   サイン波を倍音ごとに重ね(ドローバーオルガンの考え方)、ゆるいトレモロをかける
   ========================================================= */
const Organ = {
  ctx: null, master: null, session: null, timers: [], playingId: null, onStop: null,

  init() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    const ac = (this.ctx = new C());
    const comp = ac.createDynamicsCompressor();
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    const trem = ac.createGain(); trem.gain.value = 0.9;
    const lfo = ac.createOscillator(); lfo.frequency.value = 5.6;
    const depth = ac.createGain(); depth.gain.value = 0.07;
    lfo.connect(depth).connect(trem.gain); lfo.start();
    this.master = ac.createGain(); this.master.gain.value = 0.55;
    this.master.connect(lp).connect(trem).connect(comp).connect(ac.destination);
    return ac;
  },
  newSession() {
    const ac = this.ctx;
    if (this.session) { const g = this.session; g.gain.setTargetAtTime(0, ac.currentTime, 0.03); setTimeout(() => g.disconnect(), 400); }
    this.session = ac.createGain(); this.session.connect(this.master);
    return this.session;
  },
  // 鳴らす音:倍音の重ね方(ドローバーオルガンの考え方)
  PARTIALS: [[1, 1], [2, 0.5], [3, 0.26], [4, 0.14], [6, 0.06], [8, 0.03]],
  note(midis, t, dur, dest) {
    const ac = this.ctx, amp = 0.15 / Math.sqrt(midis.length);
    midis.forEach(m => {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.02);
      g.gain.setValueAtTime(amp, t + Math.max(0.03, dur - 0.05));
      g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
      g.connect(dest);
      this.PARTIALS.forEach(([h, a]) => {
        if (f * h > 7000) return;
        const o = ac.createOscillator(); o.frequency.value = f * h;
        const og = ac.createGain(); og.gain.value = a;
        o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.12);
      });
    });
  },
  ready() { if (!this.init()) return false; this.ctx.resume(); return true; },

  // コードの音の並べ方:ベース(G2〜F♯3)の上に、構成音をすべて B3〜A♯4 の1オクターブに収めて重ねる(転回形)。
  // キーによって音域が上下しないので、どのコードも同じくらいの大きさに聞こえる
  // (低い音域で鳴らすと、スマホやノートPCのスピーカーでは小さく聞こえるため)
  voicing(c) {
    const LO = 59;
    const ups = [...new Set(c.tones.map(t => t.pc))].map(pc => LO + mod(pc - LO, 12)).sort((a, b) => a - b);
    const bass = 43 + mod((c.bass ? c.bass.pc : c.root.pc) - 7, 12);
    return [bass, ...ups];
  },
  chord(c) {
    if (!this.ready()) return;
    this.stop();
    this.note(this.voicing(c), this.ctx.currentTime + 0.02, 1.2, this.newSession());
  },
  // steps: [{midis, dur}]。onStep(i) は鳴らす瞬間に呼ばれる
  sequence(id, steps, onStep) {
    if (this.playingId === id) { this.stop(); return; }
    if (!this.ready()) return;
    this.stop();
    const dest = this.newSession(), t0 = this.ctx.currentTime + 0.05;
    let at = 0;
    this.playingId = id;
    steps.forEach((st, i) => {
      this.note(st.midis, t0 + at, st.dur - 0.04, dest);
      const when = at;
      this.timers.push(setTimeout(() => onStep && onStep(i), (when + 0.05) * 1000));
      at += st.dur;
    });
    this.timers.push(setTimeout(() => this.stop(true), (at + 0.3) * 1000));
  },
  stop(natural) {
    this.timers.forEach(clearTimeout); this.timers = [];
    const was = this.playingId; this.playingId = null;
    if (was && !natural && this.session) this.session.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    if (was && this.onStop) this.onStop(was);
  },
};
