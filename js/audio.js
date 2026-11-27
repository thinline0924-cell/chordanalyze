/* =========================================================
   音源の分析(ブラウザの中だけで行う。音はサーバーに送らない。AI は使わない)
   1. 音を 22050Hz・1チャンネルにする(ブラウザの OfflineAudioContext)
   2. 短い区切りごとに、12の音名の強さ(クロマ)を求める(高音側と、ベース側)
   3. 音の立ち上がり(オンセット)から、テンポと拍の位置を求める
   4. 拍ごとにクロマをまとめ、次のどちらかを行う
      ・コード譜があるとき:コード譜の順番を守ったまま、拍に当てはめる(譜面合わせ)
      ・ないとき:和音の形(テンプレート)と比べてコードを推定する
   5. 曲全体のクロマから、キーを推定する
   ========================================================= */
const AudioAna = (() => {
  const SR = 22050;
  const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const tick = () => new Promise(r => setTimeout(r, 0));   // 画面が固まらないよう、ときどき手を離す

  /* ---------- 0. 読み込み(ブラウザのみ) ---------- */
  async function decode(arrayBuffer) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    let buf;
    try {
      buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(arrayBuffer, res, rej); if (p && p.then) p.then(res, rej); });
    } finally { if (ctx.close) ctx.close(); }
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, Math.max(1, Math.ceil(buf.duration * SR)), SR);
    const src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start(0);
    const out = await off.startRendering();
    return { pcm: out.getChannelData(0), duration: buf.duration };
  }

  /* ---------- FFT(高速フーリエ変換:音を周波数ごとの強さに分ける) ---------- */
  const fftCache = {};
  function fftPlan(n) {
    if (fftCache[n]) return fftCache[n];
    const rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), win = new Float64Array(n);
    for (let i = 0, bits = Math.log2(n); i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
    for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return (fftCache[n] = { rev, cos, sin, win, re: new Float64Array(n), im: new Float64Array(n) });
  }
  // pcm の start から n 個に窓をかけて FFT し、振幅(n/2 個)を mag に入れる
  function spectrum(pcm, start, n, mag) {
    const P = fftPlan(n), { rev, cos, sin, win, re, im } = P;
    for (let i = 0; i < n; i++) { const j = rev[i], s = start + i; re[j] = (s >= 0 && s < pcm.length ? pcm[s] : 0) * win[i]; im[j] = 0; }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = sin[k * step], a = i + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
    for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  }

  /* ---------- 2. クロマ ---------- */
  const CH = { N: 8192, HOP: 2048 };
  function binMap(n, fLo, fHi) {
    const map = [];
    for (let k = 1; k < n / 2; k++) {
      const f = k * SR / n;
      if (f < fLo || f > fHi) continue;
      const m = 69 + 12 * Math.log2(f / 440), d = Math.abs(m - Math.round(m));
      const w = Math.max(0, 1 - 2.5 * d);   // 半音の真ん中に近い周波数ほど重く数える
      if (w > 0) map.push([k, ((Math.round(m) % 12) + 12) % 12, w]);
    }
    return map;
  }
  async function chroma(pcm, onProgress) {
    const { N, HOP } = CH, mag = new Float64Array(N / 2);
    const treble = binMap(N, 110, 2000), bass = binMap(N, 41, 200);
    const frames = Math.max(1, Math.floor(pcm.length / HOP));
    const T = [], B = [], E = [];
    for (let f = 0; f < frames; f++) {
      spectrum(pcm, f * HOP - N / 2 + HOP / 2, N, mag);
      const t = new Float64Array(12), b = new Float64Array(12);
      treble.forEach(([k, pc, w]) => (t[pc] += w * Math.sqrt(mag[k])));
      bass.forEach(([k, pc, w]) => (b[pc] += w * Math.sqrt(mag[k])));
      let e = 0; for (let i = f * HOP; i < Math.min(pcm.length, (f + 1) * HOP); i++) e += pcm[i] * pcm[i];
      T.push(t); B.push(b); E.push(Math.sqrt(e / HOP));
      if (f % 150 === 0) { onProgress && onProgress(f / frames); await tick(); }
    }
    return { T, B, E, fps: SR / HOP };
  }

  /* ---------- 3. テンポと拍 ---------- */
  const ON = { N: 1024, HOP: 256 };
  async function onsetEnvelope(pcm, onProgress) {
    const { N, HOP } = ON, mag = new Float64Array(N / 2), prev = new Float64Array(N / 2);
    const frames = Math.max(1, Math.floor(pcm.length / HOP));
    const env = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
      spectrum(pcm, f * HOP - N / 2, N, mag);
      let s = 0;
      for (let k = 2; k < N / 2; k++) { const v = Math.log1p(100 * mag[k]); const d = v - prev[k]; if (d > 0) s += d; prev[k] = v; }
      env[f] = s;
      if (f % 2000 === 0) { onProgress && onProgress(f / frames); await tick(); }
    }
    // ゆるやかな変化を引いて、立ち上がりだけを残す
    const fps = SR / HOP, w = Math.round(fps * 0.5), out = new Float64Array(frames);
    let acc = 0; const q = [];
    for (let i = 0; i < frames; i++) { acc += env[i]; q.push(env[i]); if (q.length > w) acc -= q.shift(); out[i] = Math.max(0, env[i] - acc / q.length); }
    let m = 0, v = 0; out.forEach(x => (m += x)); m /= frames; out.forEach(x => (v += (x - m) * (x - m)));
    const sd = Math.sqrt(v / frames) || 1;
    for (let i = 0; i < frames; i++) out[i] /= sd;
    return { env: out, fps };
  }
  function tempo(env, fps) {
    const lo = Math.floor(fps * 60 / 200), hi = Math.ceil(fps * 60 / 55);
    let best = lo, bestV = -Infinity;
    for (let L = lo; L <= hi; L++) {
      let s = 0; for (let i = L; i < env.length; i++) s += env[i] * env[i - L];
      s /= (env.length - L);
      const bpm = 60 * fps / L, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.9, 2));
      if (s * w > bestV) { bestV = s * w; best = L; }
    }
    return best;   // 1拍のフレーム数
  }
  // 動的計画法で拍の位置を決める(テンポに沿いつつ、立ち上がりの強い所を選ぶ)
  function beats(env, fps) {
    const P = tempo(env, fps), n = env.length, score = new Float64Array(n), from = new Int32Array(n).fill(-1);
    const ALPHA = 60;
    for (let t = 0; t < n; t++) {
      let best = 0, arg = -1;
      for (let p = t - 2 * P; p <= t - Math.round(P / 2); p++) {
        if (p < 0) continue;
        const v = score[p] - ALPHA * Math.pow(Math.log((t - p) / P), 2);
        if (arg < 0 || v > best) { best = v; arg = p; }
      }
      score[t] = env[t] + (arg >= 0 ? Math.max(0, best) : 0);
      from[t] = arg >= 0 && best > 0 ? arg : -1;
    }
    let t = n - 1, bestEnd = -Infinity;
    for (let i = Math.max(0, n - P); i < n; i++) if (score[i] > bestEnd) { bestEnd = score[i]; t = i; }
    const out = [];
    while (t >= 0) { out.push(t); t = from[t]; }
    out.reverse();
    // 最初の拍より前も、同じ間隔で埋める(曲の頭の拍)
    while (out.length && out[0] - P >= 0) out.unshift(out[0] - P);
    return { frames: out, bpm: 60 * fps / P, times: out.map(f => f / fps) };
  }

  /* ---------- 4. 拍ごとのクロマ ---------- */
  function beatChroma(ch, beatTimes, duration) {
    const bounds = [...beatTimes, duration];
    const out = [];
    for (let i = 0; i < beatTimes.length; i++) {
      const a = Math.floor(bounds[i] * ch.fps), z = Math.max(a + 1, Math.floor(bounds[i + 1] * ch.fps));
      const t = new Float64Array(12), b = new Float64Array(12);
      let e = 0, n = 0;
      for (let f = a; f < z && f < ch.T.length; f++) { for (let k = 0; k < 12; k++) { t[k] += ch.T[f][k]; b[k] += ch.B[f][k]; } e += ch.E[f]; n++; }
      const nt = Math.hypot(...t) || 1, mb = Math.max(...b) || 1;
      out.push({ t: beatTimes[i], end: bounds[i + 1], tre: t.map(x => x / nt), bas: b.map(x => x / mb), energy: n ? e / n : 0 });
    }
    // 無音に近い拍:曲全体の大きさにくらべて小さいもの
    const es = out.map(x => x.energy).sort((a, b) => a - b), ref = es[Math.floor(es.length * 0.9)] || 1;
    out.forEach(x => (x.silent = x.energy < ref * 0.06));
    return out;
  }

  /* ---------- 和音の形(テンプレート) ---------- */
  // 楽器の音には倍音が混ざる(C を鳴らすと、3倍の G、5倍の E も少し鳴る)ので、テンプレートにも入れておく
  const HARM = [[0, 1], [7, 0.35], [4, 0.15]];
  function template(rootPc, semis, bassPc) {
    const v = new Float64Array(12);
    semis.forEach((s, i) => { const w = i === 3 ? 0.6 : i > 3 ? 0.35 : 1; HARM.forEach(([h, a]) => (v[(rootPc + s + h) % 12] += w * a)); });
    const n = Math.hypot(...v) || 1;
    return { v: v.map(x => x / n), bass: bassPc == null ? rootPc : bassPc };
  }
  const cosSim = (a, b) => { let s = 0; for (let i = 0; i < 12; i++) s += a[i] * b[i]; return s; };
  const emit = (bt, tp) => bt.silent ? 0.1 : cosSim(bt.tre, tp.v) + 0.25 * bt.bas[tp.bass];

  /* ---------- 4a. 音だけからコードを推定 ---------- */
  const RQ = [['', [0, 4, 7], 0], ['m', [0, 3, 7], 0], ['7', [0, 4, 7, 10], 0.04], ['M7', [0, 4, 7, 11], 0.05], ['m7', [0, 3, 7, 10], 0.04]];
  const RNAME = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  function recognize(bc) {
    const states = [];
    for (let r = 0; r < 12; r++) RQ.forEach(([q, semis, prior]) => {
      states.push({ sym: RNAME[r] + q, tp: template(r, semis), prior });
      // 3和音は、ベースが3度・5度の形(C/E、C/G など)も候補にする
      if (semis.length === 3) [semis[1], semis[2]].forEach(s => states.push({ sym: RNAME[r] + q + '/' + RNAME[(r + s) % 12], tp: template(r, semis, (r + s) % 12), prior: prior + 0.06 }));
    });
    states.push({ sym: null, tp: null, prior: 0 });   // 音のない所
    const S = states.length, NB = bc.length;
    const sc = (b, s) => states[s].tp ? (bc[b].silent ? -1 : emit(bc[b], states[s].tp) - states[s].prior) : (bc[b].silent ? 1 : 0.2);
    // 1回目:どの拍でも同じ重さで切り替えを許す。2回目:小節の頭(4拍ごと)で切り替わりやすくする
    const run = (changeCost) => {
      let prev = new Float64Array(S), back = [];
      for (let s = 0; s < S; s++) prev[s] = sc(0, s);
      for (let b = 1; b < NB; b++) {
        let bestS = 0; for (let s = 1; s < S; s++) if (prev[s] > prev[bestS]) bestS = s;
        const cur = new Float64Array(S), bk = new Int16Array(S), cc = changeCost(b);
        for (let s = 0; s < S; s++) {
          const stay = prev[s], move = prev[bestS] - cc;
          if (stay >= move) { cur[s] = stay; bk[s] = s; } else { cur[s] = move; bk[s] = bestS; }
          cur[s] += sc(b, s);
        }
        back.push(bk); prev = cur;
      }
      let s = 0; for (let k = 1; k < S; k++) if (prev[k] > prev[s]) s = k;
      const path = new Array(NB); path[NB - 1] = s;
      for (let b = NB - 1; b > 0; b--) { s = back[b - 1][s]; path[b - 1] = s; }
      return path;
    };
    let path = run(() => 0.35);
    // 小節の頭を決める:コードが切り替わる拍の位置(4で割ったあまり)のうち、いちばん多いもの
    const cnt = [0, 0, 0, 0];
    for (let b = 1; b < NB; b++) if (path[b] !== path[b - 1]) cnt[b % 4]++;
    const phase = cnt.indexOf(Math.max(...cnt));
    path = run(b => ((b - phase) % 4 + 4) % 4 === 0 ? 0.2 : ((b - phase) % 4 + 4) % 4 === 2 ? 0.4 : 0.6);
    return { labels: path.map(s => states[s].sym), phase };
  }
  // 拍ごとのコード → 譜面(4小節で1行、2行で1ブロック)と、それぞれのコードの時刻
  function toSong(bc, rec, name) {
    const { labels, phase } = rec, sections = [], timing = [];
    let line = [], lineT = [], lines = [], linesT = [], prev = null;
    const flushLine = () => { if (line.length) { lines.push(line); linesT.push(lineT); } line = []; lineT = []; };
    const flushSec = () => { flushLine(); if (lines.length) { sections.push({ label: '', lines }); timing.push(linesT); } lines = []; linesT = []; };
    for (let b = 0; b < bc.length; b++) {
      // 小節の番号は、最初の小節の頭(phase 番目の拍)を 0 として数える。それより前(弱起)は最初の行に入れる
      const bar = Math.floor((b - phase) / 4);
      if (b > phase && (b - phase) % 4 === 0) { if (bar % 8 === 0) flushSec(); else if (bar % 4 === 0) flushLine(); }
      const sym = labels[b];
      if (sym && sym !== prev) { line.push(sym); lineT.push(Math.round(bc[b].t * 100) / 100); }
      prev = sym;
    }
    flushSec();
    return { title: name || '音源', artist: '', source: 'audio', url: '', sections, timing };
  }

  /* ---------- 4b. コード譜を音に合わせる(順番は守ったまま、拍に当てはめる) ---------- */
  function align(bc, song, parse) {
    const items = [];
    song.sections.forEach((s, si) => s.lines.forEach((l, li) => l.forEach((sym, ci) => {
      const c = parse(sym);
      const tp = c ? template(c.pc, (Q[c.q] || Q['']).iv.map(([, x]) => x % 12), c.bass ? c.bass.pc : c.pc) : null;
      items.push({ si, li, ci, tp });
    })));
    const n = items.length, NB = bc.length, PRE = 0.3, ADV = 0.05, SKIP = 0.6;
    if (!n || !NB) return null;
    // 状態:0=曲の前、1..n=コード、n+1=曲のあと
    const S = n + 2, e = (b, s) => (s === 0 || s === n + 1) ? (bc[b].silent ? 0.8 : PRE) : items[s - 1].tp ? emit(bc[b], items[s - 1].tp) : PRE;
    let prev = new Float64Array(S).fill(-Infinity);
    prev[0] = e(0, 0); prev[1] = e(0, 1); if (n > 1) prev[2] = e(0, 2) - SKIP;
    const back = [];
    for (let b = 1; b < NB; b++) {
      const cur = new Float64Array(S).fill(-Infinity), bk = new Int32Array(S);
      for (let s = 0; s < S; s++) {
        let v = prev[s], from = s;
        if (s >= 1 && prev[s - 1] - ADV > v) { v = prev[s - 1] - ADV; from = s - 1; }
        if (s >= 2 && s <= n && prev[s - 2] - SKIP > v) { v = prev[s - 2] - SKIP; from = s - 2; }   // コード譜のコードを1つ飛ばす
        if (v === -Infinity) continue;
        cur[s] = v + e(b, s); bk[s] = from;
      }
      back.push(bk); prev = cur;
    }
    let s = prev[n + 1] >= prev[n] ? n + 1 : n;
    const path = new Array(NB); path[NB - 1] = s;
    for (let b = NB - 1; b > 0; b--) { s = back[b - 1][s]; path[b - 1] = s; }
    // それぞれのコードの最初の拍の時刻。飛ばされたコードは次のコードと同じ時刻にする
    const first = new Array(n).fill(null);
    let fit = 0, fitN = 0;
    path.forEach((st, b) => { if (st >= 1 && st <= n) { if (first[st - 1] == null) first[st - 1] = bc[b].t; if (!bc[b].silent && items[st - 1].tp) { fit += emit(bc[b], items[st - 1].tp); fitN++; } } });
    for (let i = n - 2; i >= 0; i--) if (first[i] == null) first[i] = first[i + 1];
    const end = bc[NB - 1].end;
    for (let i = 0; i < n; i++) if (first[i] == null) first[i] = end;
    const timing = song.sections.map(sec => sec.lines.map(l => l.map(() => 0)));
    items.forEach((it, i) => (timing[it.si][it.li][it.ci] = Math.round(first[i] * 100) / 100));
    return { timing, fit: fitN ? fit / fitN : 0 };
  }

  /* ---------- 5. キーの推定(クルムハンスルのキープロファイル) ---------- */
  const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KMIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) {
    const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12;
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < 12; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
    return s / Math.sqrt(sa * sb || 1);
  }
  function key(bc) {
    const tot = new Float64Array(12);
    // 倍音のぶん(5度上・長3度上に混ざる音)を差し引いてから足し合わせる
    bc.forEach(x => {
      if (x.silent) return;
      for (let k = 0; k < 12; k++) {
        const v = x.tre[k] - 0.35 * x.tre[(k + 5) % 12] - 0.15 * x.tre[(k + 8) % 12];
        tot[k] += Math.max(0, v) * x.energy + 0.5 * x.bas[k] * x.energy;
      }
    });
    let best = null;
    for (let t = 0; t < 12; t++) for (const [mode, prof] of [['major', KMAJ], ['minor', KMIN]]) {
      const r = corr([...tot], prof.map((_, i) => prof[(i - t + 12) % 12]));
      if (!best || r > best.r) best = { pc: t, mode, r };
    }
    return best;
  }

  /* ---------- まとめ ---------- */
  // song があれば譜面合わせ、なければ推定。戻り値は分析に使う曲(timing と keyHint 付き)
  async function analyzeFile(arrayBuffer, { song, name, onProgress, parse }) {
    const step = (a, b) => p => onProgress && onProgress(a + (b - a) * p);
    step(0, 0.05)(0);
    const { pcm, duration } = await decode(arrayBuffer);
    if (duration < 5) throw new Error('音源が短すぎます(5秒以上の曲を選んでください)。');
    if (duration > 15 * 60) throw new Error('音源が長すぎます(15分までにしてください)。');
    const on = await onsetEnvelope(pcm, step(0.05, 0.35));
    const bt = beats(on.env, on.fps);
    const ch = await chroma(pcm, step(0.35, 0.85));
    const bc = beatChroma(ch, bt.times, duration);
    step(0.85, 1)(0.2); await tick();
    const k = key(bc);
    let out, fit = null;
    if (song) {
      const al = align(bc, song, parse);
      if (!al) throw new Error('コード譜を音に合わせられませんでした。');
      out = { ...song, timing: al.timing }; fit = al.fit;
    } else {
      out = toSong(bc, recognize(bc), name);
      if (!out.sections.length) throw new Error('音からコードを読み取れませんでした。');
    }
    out.keyHint = { pc: k.pc, mode: k.mode, name: NOTE[k.pc] + (k.mode === 'minor' ? 'm' : '') };
    out.audio = { duration, bpm: Math.round(bt.bpm), fit };
    step(0, 1)(1);
    return out;
  }

  return { SR, decode, spectrum, chroma, onsetEnvelope, beats, beatChroma, template, recognize, toSong, align, key, analyzeFile };
})();
if (typeof module !== 'undefined') module.exports = AudioAna;
