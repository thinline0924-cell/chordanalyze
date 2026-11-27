/* =========================================================
   曲の分析(ルールで判定する。AI は使わない)
   1. コード記号(Cmaj7、F#m7-5、B♭/D など)を読む
   2. キーを判定する(ブロックごとにも見て、転調を見つける)
   3. 度数にする(サイトの他のページと同じ書き方 IVM7 など)
   4. 進行の一覧(data.js)と照らし合わせる
   5. 技法(セカンダリードミナント、裏コード、借用…)を見つける
   6. 「流れ」と「聴きどころ」の文章を作る
   使うもの:theory.js(mod, MAJ, Q, parseTok, chordOf, degLabel, tonicName)と data.js(PROGS)
   ========================================================= */
const Analyzer = (() => {
  const LIDX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const ROMN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const SEMI2DEG = { 0: [1, 0], 1: [2, -1], 2: [2, 0], 3: [3, -1], 4: [3, 0], 5: [4, 0], 6: [4, 1], 7: [5, 0], 8: [6, -1], 9: [6, 0], 10: [7, -1], 11: [7, 0] };

  /* ---------- 1. コード記号を読む ---------- */
  // コードの種類のまとまり:maj メジャー / dom ドミナント7th / min マイナー / hd m7(♭5) / dim / aug / sus
  function famOf(q) {
    if (/^7/.test(q)) return q === '7sus4' ? 'dom' : 'dom';
    if (q === 'sus4' || q === 'sus2') return 'sus';
    if (q === 'm7(b5)') return 'hd';
    if (q === 'dim' || q === 'dim7') return 'dim';
    if (q === 'aug' || q === 'augM7') return 'aug';
    if (/^m/.test(q)) return 'min';
    return 'maj';
  }
  function parseSymbol(raw) {
    let s = String(raw).trim()
      .replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[＋]/g, '+').replace(/[－−]/g, '-')
      .replace(/\s+/g, '').replace(/on(?=[A-G])/, '/');
    if (!s || /^N\.?C\.?$/i.test(s)) return null;
    const m = /^([A-G])([#b]?)(.*)$/.exec(s);
    if (!m) return null;
    let rest = m[3], bass = null;
    const bm = /\/([A-G])([#b]?)$/.exec(rest);
    if (bm) { bass = { L: LIDX[bm[1]], a: bm[2] === '#' ? 1 : bm[2] === 'b' ? -1 : 0 }; rest = rest.slice(0, bm.index); }
    if (/[^A-Za-z0-9#b+\-()△Δ°øφ,.\/]/.test(rest)) return null;   // 知らない文字が入っていたら読まない
    const L = LIDX[m[1]], a = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    let q = rest, minor = false, dim = false, hd = false, aug = false, maj7 = false, sev = false, six = false, sus = 0, power = false;
    const t = new Set();
    if (/^(mM|mmaj|mMaj|m△|mΔ|m\(M|m\(maj|minmaj)/.test(q)) { minor = true; maj7 = true; q = q.replace(/^(min|m)\(?(M|maj|Maj|△|Δ)7?\)?/, ''); }
    else if (/^(min|m(?!aj)|-)/.test(q)) { minor = true; q = q.replace(/^(min|m|-)/, ''); }
    if (/^(dim|°|o(?![a-z]))/.test(q)) { dim = true; q = q.replace(/^(dim|°|o)/, ''); }
    else if (/^(ø|φ)/.test(q)) { hd = true; q = q.replace(/^(ø|φ)7?/, ''); sev = true; }
    else if (/^(aug|\+(?![0-9]))/.test(q)) { aug = true; q = q.replace(/^(aug|\+)/, ''); }
    let mm;
    if (!maj7 && (mm = /^(M|maj|Maj|MA|△|Δ)(7|9|11|13)?/.exec(q))) {
      maj7 = true; q = q.slice(mm[0].length);
      if (mm[2] === '9') t.add('9'); if (mm[2] === '11') { t.add('9'); t.add('11'); } if (mm[2] === '13') { t.add('9'); t.add('13'); }
    } else if ((mm = /^(7|9|11|13)/.exec(q))) {
      sev = true; q = q.slice(mm[0].length);
      if (mm[1] === '9') t.add('9'); if (mm[1] === '11') { t.add('9'); t.add('11'); } if (mm[1] === '13') { t.add('9'); t.add('13'); }
    } else if ((mm = /^6(\/?9|\(9\))?/.exec(q))) {
      six = true; q = q.slice(mm[0].length); if (mm[1]) t.add('9');
    } else if (/^5$/.test(q)) { power = true; q = ''; }
    if (/sus2/.test(q)) sus = 2; else if (/sus4?/.test(q)) sus = 4;
    q = q.replace(/sus[24]?/, '').replace(/add/g, '');
    for (const x of q.matchAll(/([b#+\-]?)(13|11|9|7|5)/g)) {
      const acc = x[1] === 'b' || x[1] === '-' ? 'b' : x[1] === '#' || x[1] === '+' ? '#' : '';
      if (x[2] === '7') { if (!sev && !maj7) sev = true; continue; }
      if (x[2] === '5') { if (acc === 'b') t.add('b5'); else if (acc === '#') aug = true; continue; }
      t.add(acc + x[2]);
    }
    if (t.has('b5') && minor && sev) hd = true;
    let qk;
    if (sus) qk = sev ? '7sus4' : sus === 2 ? 'sus2' : 'sus4';
    else if (hd) qk = 'm7(b5)';
    else if (dim) qk = sev || maj7 ? 'dim7' : 'dim';
    else if (minor && t.has('b5')) qk = 'dim';
    else if (aug) qk = maj7 ? 'augM7' : sev ? '7(#5)' : 'aug';
    else if (minor) qk = maj7 ? 'mM7' : sev ? (t.has('11') ? 'm7(11)' : t.has('9') ? 'm7(9)' : 'm7') : six ? 'm6' : t.has('9') ? 'madd9' : 'm';
    else if (maj7) qk = t.has('#11') ? 'M7(#11)' : t.has('9') ? 'M7(9)' : 'M7';
    else if (sev) qk = t.has('b9') ? '7(b9)' : t.has('#9') ? '7(#9)' : t.has('#11') ? '7(#11)' : t.has('b13') ? '7(b13)' : t.has('13') ? '7(13)' : t.has('9') ? '7(9)' : '7';
    else if (six) qk = t.has('9') ? '6(9)' : '6';
    else qk = t.has('9') ? 'add9' : '';
    const pc = mod(NAT[L] + a, 12);
    if (bass) bass.pc = mod(NAT[bass.L] + bass.a, 12);
    if (bass && bass.pc === pc) bass = null;
    return { sym: raw, L, a, pc, q: qk, fam: famOf(qk), bass, power };
  }
  const pretty = s => String(s).replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭').replace(/\(b/g, '(♭').replace(/,b/g, ',♭');

  /* ---------- 2. キーの判定 ----------
     メジャーキーの主音 T を 12通り試し、ダイアトニックに合うか・Ⅴ→Ⅰ があるか・Ⅰ で終わるかで点を付ける */
  const EXPECT = { 0: ['maj'], 2: ['min'], 4: ['min'], 5: ['maj'], 7: ['dom', 'maj', 'sus'], 9: ['min'], 11: ['hd', 'dim'] };
  function fit(c, T) {
    const rel = mod(c.pc - T, 12), e = EXPECT[rel];
    if (!e) return c.fam === 'sus' ? -0.3 : -0.6;
    if (e.includes(c.fam)) return 1;
    if (c.fam === 'sus') return 0.6;
    return c.fam === 'dom' ? 0.1 : 0.2;
  }
  function keyScore(cs, T) {
    let s = 0;
    cs.forEach((c, i) => {
      s += fit(c, T) * (c.w || 1);
      const n = cs[i + 1];
      if (!n) return;
      const r1 = mod(c.pc - T, 12), r2 = mod(n.pc - T, 12);
      if (r1 === 7 && ['dom', 'maj', 'sus'].includes(c.fam) && r2 === 0 && n.fam === 'maj') s += 1.2;
      if (r1 === 4 && (c.fam === 'dom' || c.fam === 'maj') && r2 === 9 && n.fam === 'min') s += 0.8;
    });
    const first = cs[0], last = cs[cs.length - 1];
    if (mod(last.pc - T, 12) === 0 && last.fam === 'maj') s += 1.5;
    if (mod(last.pc - T, 12) === 9 && last.fam === 'min') s += 1;
    if (mod(first.pc - T, 12) === 0) s += 0.5;
    return s;
  }
  function bestKey(cs, hintT) {
    let T = 0, best = -Infinity;
    for (let k = 0; k < 12; k++) {
      const s = keyScore(cs, k) + (k === hintT ? 0.12 * cs.length : 0);
      if (s > best + 1e-9) { best = s; T = k; }
    }
    return { T, score: best };
  }
  function modeOf(cs, T) {
    const r = c => mod(c.pc - T, 12);
    let maj = 0, min = 0;
    const first = cs[0], last = cs[cs.length - 1];
    if (r(last) === 0 && last.fam === 'maj') maj += 2;
    if (r(last) === 9 && last.fam === 'min') min += 2;
    if (r(first) === 0 && first.fam === 'maj') maj += 1;
    if (r(first) === 9 && first.fam === 'min') min += 1;
    cs.forEach((c, i) => {
      const n = cs[i + 1]; if (!n) return;
      if (r(c) === 7 && r(n) === 0 && n.fam === 'maj') maj += 1;
      if (r(c) === 4 && (c.fam === 'dom' || c.fam === 'maj') && r(n) === 9 && n.fam === 'min') min += 1;
    });
    min += (cs.filter(c => r(c) === 9 && c.fam === 'min').length - cs.filter(c => r(c) === 0 && c.fam === 'maj').length) * 0.15;
    return min > maj + 0.5 ? 'minor' : 'major';
  }
  // 主音の名前は、なるべく曲の中の書き方(F♯ か G♭ か)に合わせる
  function makeKey(Tmaj, mode, all) {
    const pc = mode === 'minor' ? mod(Tmaj + 9, 12) : Tmaj;
    const c = all.find(x => x.pc === pc);
    const tL = c ? c.L : tonic(pc, mode)[0];
    const name = (c ? pretty(LETTERS_[c.L] + (c.a > 0 ? '#' : c.a < 0 ? 'b' : '')) : tonicName(pc, mode)) + (mode === 'minor' ? 'm' : '');
    return { Tmaj, mode, pc, tL, name };
  }
  const LETTERS_ = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const sameKey = (a, b) => a.pc === b.pc && a.mode === b.mode;

  /* ---------- 3. 度数 ---------- */
  // 半音の位置から、ふつうの書き方の度数にする(♭Ⅱ7・♭Ⅶ など)。ディミニッシュは上がる形(♯Ⅰdim7・♯Ⅳdim7)
  function degOf(pc, key, fam) {
    const rel = mod(pc - key.pc, 12);
    const dimLike = fam === 'dim' || fam === 'hd';
    if (dimLike && [1, 3, 6, 8].includes(rel)) return { 1: '#I', 3: '#II', 6: '#IV', 8: '#V' }[rel];
    if (rel === 6) return fam === 'dom' ? 'bV' : '#IV';
    const [deg, acc] = SEMI2DEG[rel];
    return (acc < 0 ? 'b' : acc > 0 ? '#' : '') + ROMN[deg - 1];
  }
  const tokenOf = (c, key) => degOf(c.pc, key, c.fam) + c.q + (c.bass ? '/' + degOf(c.bass.pc, key, '') : '');

  /* ---------- 4. 進行の一覧との照合(柔軟な照合) ----------
     曲のコードは、そのままでは一覧の進行と1対1に並ばないことが多い。そこで:
       1. 同じルート・同じベースのコードが続いたら、1つのまとまりにする(Gsus4→G→G7 は「Ⅴ」ひとつ、Am→AmM7→Am7 は「Ⅵm」ひとつ)
       2. 進行の途中に入る経過的なコードは飛ばしてよい(1つの進行で2つまで):
          次へ向かうドミナント(セカンダリードミナント・裏コード)、ツーファイブの「ツー」、ディミニッシュ、オーギュメント、sus4
       3. 似た響きへの置き換えを許す(Ⅲm の代わりに Ⅲ7 など)
     飛ばし・置き換えには減点を付け、減点が少ない並びを選ぶ。飛ばしや置き換えを使ったものは「変形」とする */
  const dedupe = (arr, k) => arr.filter((x, i) => i === 0 || k(arr[i - 1]) !== k(x));
  const GROUP_MAJ = ['maj', 'dom', 'sus'], GROUP_DIM = ['hd', 'dim'];
  // コードの種類どうしの「近さ」:0 は同じ、Infinity は別物
  function famCost(a, b) {
    if (a === b) return 0;
    if ((GROUP_MAJ.includes(a) && GROUP_MAJ.includes(b)) || (GROUP_DIM.includes(a) && GROUP_DIM.includes(b))) return 0.15;
    if ((a === 'min' && b === 'hd') || (a === 'hd' && b === 'min')) return 0.4;   // Ⅱm7 ⇔ Ⅱm7(♭5)
    if ((a === 'min' && b === 'dom') || (a === 'dom' && b === 'min')) return 0.6;   // Ⅲm ⇔ Ⅲ7 など(メジャーの3和音への置き換えは別物とみなす)
    return Infinity;
  }
  const setCost = (A, B) => { let c = Infinity; A.forEach(a => B.forEach(b => (c = Math.min(c, famCost(a, b))))); return c; };
  // 同じルート・同じベースのコードの連続を1つにまとめる。first・last は元の並び(b.seq)の位置
  function toEvents(list) {
    const ev = [];
    list.forEach((x, i) => {
      const last = ev[ev.length - 1];
      if (last && last.rel === x.rel && last.bass === x.bass) { last.fams.add(x.fam); last.last = i; }
      else ev.push({ rel: x.rel, bass: x.bass, fams: new Set([x.fam]), first: i, last: i });
    });
    return ev;
  }
  // 一覧の進行が同じ並びのくり返し(循環進行の Ⅰ–Ⅵ–Ⅱ–Ⅴ ×2 など)なら、1回分だけで照らし合わせる。
  // ただし1回分が3つより短くなるもの(2コードのくり返し)は、そのまま
  function oneCycle(ev) {
    const same = (a, b) => a.rel === b.rel && [...a.fams].join() === [...b.fams].join();
    for (let k = 3; k <= ev.length / 2; k++) {
      if (ev.length % k === 0 && ev.every((e, i) => same(e, ev[i % k]))) return ev.slice(0, k);
    }
    return ev;
  }
  let PATTERNS = null;
  function patterns() {
    if (PATTERNS) return PATTERNS;
    PATTERNS = PROGS.filter(p => p.cat === 'pop' || p.cat === 'jazz').map(p => {
      const toks = p.bars.split('|').join(' ').trim().split(/\s+/);
      const shift = p.mode === 'minor' ? 9 : 0;   // 照合はメジャーキー(平行調のメジャー)の主音から測る
      const list = toks.map(t => {
        const c = chordOf(t, 0, p.mode);
        return { rel: mod(c.root.pc + shift, 12), bass: mod((c.bass ? c.bass.pc : c.root.pc) + shift, 12), fam: famOf(c.q) };
      });
      return { id: p.id, name: p.name, mood: p.mood, seq: oneCycle(toEvents(list)) };
    }).filter(p => p.seq.length >= 3);
    return PATTERNS;
  }
  const MAX_COST = 1.2, MAX_SKIPS = 2, SKIP_COST = 0.4;
  // 飛ばしてよい経過的なコードか(p は、そのあとに来るはずの進行のコード)
  function ornamental(e, p) {
    const to = mod(p.rel - e.rel, 12);
    if (e.fams.has('dim') || e.fams.has('hd') || e.fams.has('aug')) return true;
    if (e.fams.size === 1 && e.fams.has('sus')) return true;
    if (e.fams.has('dom') && (to === 5 || to === 11)) return true;   // 次へ向かうドミナント・裏コード
    return false;
  }
  // 曲の s 番目のまとまりから、進行 P がいちばん少ない減点で当てはまる形を探す
  function bestFrom(E, s, P) {
    let best = null;
    const go = (i, j, cost, skips, subs) => {
      if (cost > Math.min(MAX_COST, 0.3 * P.length)) return;   // 短い進行ほど、崩れを許す幅を小さくする
      if (j === P.length) { if (!best || cost < best.cost) best = { end: i - 1, cost, skips, subs }; return; }
      if (i >= E.length) return;
      const e = E[i], p = P[j];
      if (e.rel === p.rel) {
        const c = setCost(e.fams, p.fams);
        if (c < Infinity) go(i + 1, j + 1, cost + c, skips, subs + (c >= 0.4 ? 1 : 0));
      }
      if (j > 0 && skips < MAX_SKIPS) {
        const nx = E[i + 1];
        const two = e.fams.has('min') && nx && nx.fams.has('dom') && mod(nx.rel - e.rel, 12) === 5 && mod(p.rel - nx.rel, 12) === 5;
        if (ornamental(e, p) || two) go(i + 1, j, cost + SKIP_COST, skips + 1, subs);
      }
    };
    go(s, 0, 0, 0, 0);
    return best;
  }
  // seq:b.seq(rel・fam・bpc を持つ)。戻り値の from・to は b.seq の位置
  function matchProgs(seq) {
    const E = toEvents(seq.map(x => ({ rel: x.rel, bass: x.bpc != null ? mod(x.bpc - (x.pc - x.rel), 12) : x.rel, fam: x.fam })));
    const found = [];
    patterns().forEach(p => {
      for (let s = 0; s < E.length; s++) {
        const r = bestFrom(E, s, p.seq);
        if (!r) continue;
        const loose = r.skips > 0 || r.subs > 0;
        found.push({ id: p.id, name: p.name, label: p.name + (loose ? '(変形)' : ''), mood: p.mood, loose, cost: r.cost,
          s, e: r.end, len: p.seq.length, from: E[s].first, to: E[r.end].last });
      }
    });
    // 長い進行・減点の少ないものを優先し、重ならないように選ぶ
    found.sort((a, b) => b.len - a.len || a.cost - b.cost || a.s - b.s);
    const used = new Set(), keep = [];
    found.forEach(f => {
      for (let k = f.s; k <= f.e; k++) if (used.has(k)) return;
      for (let k = f.s; k <= f.e; k++) used.add(k);
      keep.push(f);
    });
    return keep.sort((a, b) => a.from - b.from);
  }

  /* ---------- 5. 技法を見つける ---------- */
  const KIND = {
    modulation: { name: '転調', w: 10 },
    tritone: { name: '裏コード', w: 7, go: 'chord:tritone' },
    extdom: { name: 'エクステンデッドドミナント', w: 6, go: 'progression:extdom' },
    passdim: { name: 'パッシングディミニッシュ', w: 6, go: 'chord:passdim' },
    chromdown: { name: '半音下降のベース', w: 6, go: 'progression:chromdown' },
    backdoor: { name: 'バックドア進行', w: 6, go: 'progression:backdoor' },
    deceptive6: { name: '♭Ⅵ への偽終止', w: 6, go: 'progression:deceptive6' },
    sdm: { name: 'サブドミナントマイナー', w: 5, go: 'chord:sdm' },
    borrow: { name: '借用和音', w: 5, go: 'chord:borrow' },
    cliche: { name: 'クリシェ', w: 5, go: 'chord:cliche' },
    secdom: { name: 'セカンダリードミナント', w: 4, go: 'chord:secdom' },
    bassdown: { name: 'ベースの下降', w: 4, go: 'progression:bassdown' },
    bassup: { name: 'ベースの上昇', w: 3, go: 'chord:slash' },
    aug: { name: 'オーギュメント', w: 4, go: 'chord:aug' },
    deceptive: { name: '偽終止', w: 3, go: 'progression:deceptive' },
    twofive: { name: 'ツーファイブ', w: 2, go: 'progression:j251' },
    sus: { name: 'sus4 の溜め', w: 2, go: 'chord:sus4' },
    plagal: { name: '変格終止', w: 2, go: 'progression:plagal' },
    perfect: { name: 'ドミナントモーション', w: 1, go: 'progression:perfect' },
  };
  function findTech(seq, key, bi) {
    const out = [];
    const add = (kind, at, len, label) => out.push({ kind, block: bi, at, len, label });
    const minorKey = key.mode === 'minor';
    seq.forEach((c, i) => {
      const n = seq[i + 1], p = seq[i - 1];
      const step = n ? mod(n.pc - c.pc, 12) : null;
      // ドミナントの働き
      if (n && (c.fam === 'dom' || (c.fam === 'maj' && [2, 4, 9, 11].includes(c.rel)))) {
        const primary = minorKey ? c.rel === 4 : c.rel === 7;
        if (step === 5 && !primary && n.fam !== 'dim') add('secdom', i, 2, c.deg + '→' + n.deg);
        if (c.fam === 'dom' && step === 11 && !primary) add('tritone', i, 2, c.deg + '→' + n.deg);
      }
      if (n && c.fam === 'dom' && step === 5) {
        const nn2 = seq[i + 2];
        if (n.fam === 'dom' && nn2 && mod(nn2.pc - n.pc, 12) === 5 && !(p && p.fam === 'dom' && mod(c.pc - p.pc, 12) === 5)) add('extdom', i, 3, c.deg + '→' + n.deg + '→' + nn2.deg);
      }
      if (n && c.fam === 'min' && (n.fam === 'dom' || n.fam === 'sus') && step === 5) add('twofive', i, 2, c.deg + '→' + n.deg);
      if (n && c.fam === 'hd' && n.fam === 'dom' && step === 5) add('twofive', i, 2, c.deg + '→' + n.deg);
      // 終止
      if (n && !minorKey && c.rel === 7 && ['dom', 'maj', 'sus'].includes(c.fam)) {
        if (n.rel === 0 && n.fam === 'maj') add('perfect', i, 2, c.deg + '→' + n.deg);
        // 偽終止は Ⅴ7(はっきりしたドミナント)のときだけ。Ⅴ→Ⅵm は Ⅰ–Ⅴ–Ⅵm–Ⅳ などの一部としてよく出るため
        if (c.fam === 'dom' && n.rel === 9 && n.fam === 'min') add('deceptive', i, 2, c.deg + '→' + n.deg);
        if (c.fam === 'dom' && n.rel === 8 && n.fam === 'maj') add('deceptive6', i, 2, c.deg + '→' + n.deg);
      }
      if (!n && !minorKey && c.rel === 0 && p && p.rel === 5) add('plagal', i - 1, 2, p.deg + '→' + c.deg);
      // 借用・サブドミナントマイナー(メジャーキーのとき)
      if (!minorKey) {
        if ((c.rel === 5 && c.fam === 'min') || (c.rel === 2 && c.fam === 'hd')) add('sdm', i, 1, c.deg);
        else if (c.rel === 10 && (c.fam === 'dom' || c.fam === 'maj')) {
          if (n && n.rel === 0 && n.fam === 'maj' && c.fam === 'dom') add('backdoor', i, 2, c.deg + '→' + n.deg);
          else add('borrow', i, 1, c.deg);
        } else if ((c.rel === 8 || c.rel === 3 || c.rel === 1) && c.fam === 'maj') add('borrow', i, 1, c.deg);
        else if (c.rel === 7 && c.fam === 'min') add('borrow', i, 1, c.deg);
      }
      // ディミニッシュ・オーギュメント・sus4
      if (c.fam === 'dim' && p && n) {
        const b0 = p.bpc, b1 = c.bpc, b2 = n.bpc;
        if ((mod(b1 - b0, 12) === 1 && mod(b2 - b1, 12) === 1) || (mod(b0 - b1, 12) === 1 && mod(b1 - b2, 12) === 1)) add('passdim', i - 1, 3, p.deg + '→' + c.deg + '→' + n.deg);
      }
      if (c.fam === 'aug' && !(p && p.pc === c.pc && n && n.pc === c.pc)) add('aug', i, 1, c.deg);
      if ((c.q === 'sus4' || c.q === '7sus4') && n && n.pc === c.pc && n.fam !== 'sus') add('sus', i, 2, c.deg + '→' + n.deg);
    });
    // クリシェ:同じルートのまま、1音だけが半音ずつ動く
    for (let i = 0; i < seq.length - 2; i++) {
      let j = i;
      while (j + 1 < seq.length && seq[j + 1].pc === seq[i].pc && seq[j + 1].q !== seq[j].q && !seq[j + 1].bass) j++;
      if (j - i >= 2) {
        const qs = seq.slice(i, j + 1).map(x => x.q).join(',');
        if (/m,mM7,m7|mM7,m7,m6|^,aug|aug,6|,M7,7|M7,7,|m,m\(?M7/.test(qs) || /^(m|madd9),mM7/.test(qs) || /(^|,)(|add9),aug/.test(qs) || /(^|,)(|M7),M7,7/.test(qs)) { add('cliche', i, j - i + 1, seq.slice(i, j + 1).map(x => x.deg).join('→')); i = j; }
      }
    }
    // ベースライン:3つ以上続けて、半音または全音で同じ向きに動く(分数コードを含むとき)
    let i = 0;
    while (i < seq.length - 2) {
      const dir = mod(seq[i + 1].bpc - seq[i].bpc, 12);
      const down = dir === 11 || dir === 10, up = dir === 1 || dir === 2;
      if (!down && !up) { i++; continue; }
      let j = i + 1, chrom = dir === 11 || dir === 1;
      while (j + 1 < seq.length) {
        const d = mod(seq[j + 1].bpc - seq[j].bpc, 12);
        if (down ? (d === 11 || d === 10) : (d === 1 || d === 2)) { if (!(d === 11 || d === 1)) chrom = false; j++; } else break;
      }
      const run = seq.slice(i, j + 1);
      if (run.length >= 3 && run.some(x => x.bass)) {
        const line = run.map(x => x.bname).join('→');
        if (down && chrom && run.length >= 3) add('chromdown', i, run.length, line);
        else if (down && run.length >= 4) add('bassdown', i, run.length, line);
        else if (up && run.length >= 4) add('bassup', i, run.length, line);
      }
      i = j;
    }
    return out;
  }

  /* ---------- 全体 ---------- */
  function analyzeSong(song) {
    const blocks = song.sections.map((s, bi) => {
      const items = [];
      s.lines.forEach((line, li) => line.forEach((sym, ci) => {
        const c = parseSymbol(sym);
        const t = song.timing && song.timing[bi] && song.timing[bi][li] ? song.timing[bi][li][ci] : null;
        items.push(c ? { ...c, li, ci, t } : { sym, li, ci, t, bad: true });
      }));
      return { label: s.label || '', items, lines: s.lines.length };
    });
    const all = blocks.flatMap(b => b.items.filter(x => !x.bad));
    if (all.length < 2) throw new Error('コードが少なすぎて分析できません。');
    // 音源に合わせた時刻があれば、コードの長さを求め、キーの判定で長いコードほど重く数える
    const timed = blocks.flatMap(b => b.items).filter(x => typeof x.t === 'number');
    if (timed.length >= 4) {
      const end = song.audio && song.audio.duration ? song.audio.duration : timed[timed.length - 1].t + 2;
      timed.forEach((x, i) => (x.dur = Math.max(0, (i + 1 < timed.length ? timed[i + 1].t : end) - x.t)));
      const ds = timed.map(x => x.dur).filter(d => d > 0).sort((a, b) => a - b), med = ds[Math.floor(ds.length / 2)] || 1;
      timed.forEach(x => (x.w = Math.min(2.5, Math.max(0.4, x.dur / med))));
    }
    const hint = song.keyHint ? (song.keyHint.mode === 'minor' ? mod(song.keyHint.pc + 3, 12) : song.keyHint.pc) : undefined;
    const g = bestKey(all, hint);
    const gKey = makeKey(g.T, modeOf(all, g.T), all);
    // ブロックごとのキー(4つ以上コードがあり、はっきり別のキーに合うときだけ転調とみなす)
    let prevKey = gKey;
    blocks.forEach(b => {
      const cs = b.items.filter(x => !x.bad);
      let key = prevKey;
      if (cs.length >= 4) {
        const bk = bestKey(cs);
        const cur = keyScore(cs, gKey.Tmaj);
        if (bk.T !== gKey.Tmaj && bk.score - cur >= Math.max(1.5, cs.length * 0.2)) key = makeKey(bk.T, modeOf(cs, bk.T), cs.concat(all));
        else key = gKey;
      }
      b.key = key; prevKey = key;
    });
    // 度数・分析用の並び
    const outCount = { n: 0, total: 0 };
    blocks.forEach((b, bi) => {
      const key = b.key;
      b.items.forEach(x => {
        if (x.bad) return;
        x.tok = tokenOf(x, key);
        x.deg = degLabel(x.tok);
        x.rel = mod(x.pc - key.Tmaj, 12);
        x.bpc = x.bass ? x.bass.pc : x.pc;
        x.bname = x.bass ? pretty(LETTERS_[x.bass.L] + (x.bass.a > 0 ? '#' : x.bass.a < 0 ? 'b' : '')) : pretty(LETTERS_[x.L] + (x.a > 0 ? '#' : x.a < 0 ? 'b' : ''));
        const e = EXPECT[x.rel];
        x.dia = !!(e && e.includes(x.fam)) || (key.mode === 'minor' && ((x.rel === 4 && ['dom', 'maj'].includes(x.fam)) || (x.rel === 8 && x.fam === 'dim')));
        outCount.total++; if (!x.dia) outCount.n++;
      });
      b.seq = dedupe(b.items.filter(x => !x.bad), x => x.sym);
      b.progs = matchProgs(b.seq);
      b.tech = findTech(b.seq, key, bi);
    });
    // 転調
    const mods = [];
    blocks.forEach((b, i) => {
      if (i === 0) return;
      const a = blocks[i - 1].key;
      if (!sameKey(a, b.key)) mods.push({ block: i, from: a, to: b.key, ...modName(a, b.key) });
    });
    // 同じ進行のブロックに同じ記号(A、B…)を付ける
    const sig = b => b.seq.map(x => x.tok).join(' ');
    const groups = [];
    blocks.forEach(b => {
      const s = sig(b);
      let gi = groups.findIndex(x => x.sig === s);
      if (gi < 0 && s) gi = groups.findIndex(x => similar(x.sig, s));
      if (gi < 0) { groups.push({ sig: s, letter: String.fromCharCode(65 + groups.length % 26), count: 0 }); gi = groups.length - 1; b.variant = false; }
      else b.variant = groups[gi].sig !== s;
      b.group = groups[gi].letter + (b.variant ? '′' : '');
      groups[gi].count++;
    });
    const tech = blocks.flatMap(b => b.tech);
    const res = { key: gKey, blocks, mods, tech, groups, outRatio: outCount.total ? outCount.n / outCount.total : 0, total: outCount.total };
    res.flow = flowText(res);
    res.highlights = highlights(res);
    return res;
  }
  function similar(a, b) {
    const x = a.split(' '), y = b.split(' ');
    if (Math.abs(x.length - y.length) > Math.max(2, x.length * 0.3)) return false;
    let same = 0; const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) if (x[i] === y[i]) same++;
    return n >= 3 && same / Math.max(x.length, y.length) >= 0.7;
  }
  const MODNAME = { 1: '半音上', 2: '全音上', 3: '短3度上', 4: '長3度上', 5: '4度上', 6: '増4度上', 7: '5度上', 8: '長3度下', 9: '短3度下', 10: '全音下', 11: '半音下' };
  const MODGO = { 1: 'progression:up1', 2: 'progression:up2', 3: 'progression:upm3', 5: 'progression:subdominant', 7: 'progression:dominant', 8: 'progression:direct' };
  function modName(a, b) {
    if (a.pc === b.pc) return { name: '同主調', go: 'progression:parallel', semis: 0 };
    if (a.Tmaj === b.Tmaj) return { name: '平行調', go: 'progression:relative', semis: mod(b.pc - a.pc, 12) };
    const s = mod(b.pc - a.pc, 12);
    return { name: MODNAME[s], go: MODGO[s] || null, semis: s };
  }

  /* ---------- 6. 文章 ---------- */
  const uniq = arr => [...new Set(arr)];
  const blkName = (b, i) => b.label ? `${b.label}(ブロック${i + 1})` : `ブロック${i + 1}`;
  function endText(b) {
    const last = b.seq[b.seq.length - 1];
    if (!last) return '';
    const r = mod(last.pc - b.key.pc, 12);
    if (r === 0 && (last.fam === 'maj' || last.fam === 'min')) return `${last.deg} に戻って落ち着く。`;
    if (b.key.mode === 'major' && last.rel === 7) return `${last.deg} で止めて、次へつなぐ(半終止)。`;
    if (b.key.mode === 'minor' && last.rel === 4) return `${last.deg} で止めて、次へつなぐ(半終止)。`;
    if (b.key.mode === 'major' && last.rel === 9 && last.fam === 'min') return `${last.deg} で終わり、余韻を残す。`;
    if (last.rel === 5) return `${last.deg} で終わり、浮いたまま次へ渡す。`;
    return `${last.deg} で終わる。`;
  }
  function flowText(res) {
    const { blocks, key, mods, groups } = res;
    const order = blocks.map(b => b.group).join(' ');
    const most = groups.filter(g => g.count >= 2).sort((a, b) => b.count - a.count)[0];
    const lines = [];
    lines.push(`Key ${key.name}(${key.mode === 'major' ? 'メジャー' : 'マイナー'})。${blocks.length} ブロック、コード ${res.total} 個。ダイアトニック以外のコードは ${Math.round(res.outRatio * 100)}%。`);
    lines.push(`並び:${order}` + (most ? `。いちばん多く出てくるのは ${most.letter}(${most.count}回)。` : '。'));
    if (mods.length) lines.push('転調:' + mods.map(m => `ブロック${m.block + 1}で ${m.from.name}→${m.to.name}(${m.name})`).join('、') + '。');
    const per = blocks.map((b, i) => {
      const parts = [];
      const firstSame = blocks.findIndex(x => x.group === b.group);
      const mod0 = mods.find(m => m.block === i);
      if (mod0) parts.push(`Key ${b.key.name} に転調(${mod0.name})。`);
      if (firstSame < i && !b.variant) { parts.push(`ブロック${firstSame + 1} と同じ進行。`); return { label: blkName(b, i), group: b.group, text: parts.join('') }; }
      if (firstSame < i && b.variant) parts.push(`ブロック${firstSame + 1} を少し変えた形。`);
      const names = uniq(b.progs.map(p => p.name));
      if (names.length) {
        const cnt = id => b.progs.filter(p => p.id === id).length;
        parts.push(uniq(b.progs.map(p => p.id)).map(id => { const p = b.progs.find(x => x.id === id && !x.loose) || b.progs.find(x => x.id === id); return p.label + (cnt(id) > 1 ? `(${cnt(id)}回)` : ''); }).join('、') + 'を使う。');
      } else if (b.seq.length) {
        parts.push(`${b.seq[0].deg} から始まる。`);
      }
      const kinds = uniq(b.tech.filter(t => !['perfect', 'twofive'].includes(t.kind)).map(t => KIND[t.kind].name));
      if (kinds.length) parts.push(kinds.slice(0, 3).join('・') + 'が入る。');
      parts.push(endText(b));
      return { label: blkName(b, i), group: b.group, text: parts.join('') };
    });
    return { summary: lines, blocks: per };
  }
  function where(list) {
    const bs = uniq(list.map(x => x.block + 1));
    return bs.length > 3 ? `ブロック${bs.slice(0, 3).join('・')} など` : `ブロック${bs.join('・')}`;
  }
  function highlights(res) {
    const H = [];
    const byKind = {};
    res.tech.forEach(t => (byKind[t.kind] = byKind[t.kind] || []).push(t));
    const labels = list => uniq(list.map(x => x.label)).slice(0, 3).join('、');
    res.mods.forEach(m => {
      const late = m.block >= res.blocks.length * 0.6;
      const up = m.semis >= 1 && m.semis <= 3;
      H.push({ score: 10 + (late && up ? 3 : 0), go: m.go, text: `ブロック${m.block + 1}で Key ${m.from.name} から ${m.to.name} へ転調(${m.name})。` + (late && up ? '終盤でキーを上げて、盛り上がりを一段高めている。' : '景色をがらりと変えている。') });
    });
    const T = {
      tritone: l => `${labels(l)} の裏コードで、ベースを半音でなめらかに下ろしている。`,
      extdom: l => `${labels(l)} とドミナント7th を5度下へ連ね、ぐいぐい戻ってくる流れを作っている。`,
      passdim: l => `${labels(l)} のパッシングディミニッシュで、ベースを半音でつないでいる。`,
      chromdown: l => `ベースが半音ずつ下がるライン(${labels(l)})が、胸にしみる流れを作っている。`,
      backdoor: l => `${labels(l)} のバックドア進行で、Ⅴ7 を通らずにやわらかく解決している。`,
      deceptive6: l => `${labels(l)} で ♭Ⅵ へ偽終止し、意外な明るさを出している。`,
      sdm: l => `${labels(l)}(サブドミナントマイナー)で、切なさを足している。`,
      borrow: l => `${labels(l)}(同主調からの借用)で、明るさの中に影を差している。`,
      cliche: l => `${labels(l)} のクリシェで、同じコードの中に動きを作っている。`,
      secdom: l => `${labels(l)} のセカンダリードミナントで、次のコードへの引きを強めている。`,
      bassdown: l => `分数コードでベースを順に下げ(${labels(l)})、なめらかにつないでいる。`,
      bassup: l => `分数コードでベースを順に上げ(${labels(l)})、高まりを作っている。`,
      aug: l => `${labels(l)} のオーギュメントで、次へ進む力を足している。`,
      deceptive: l => `${labels(l)} の偽終止で、終わると見せて先へ続けている。`,
      twofive: l => `ツーファイブを ${l.length} 回使い、ジャズ寄りの流れを作っている。`,
      sus: l => `${labels(l)} で sus4 を3度に解決させ、溜めを作っている。`,
    };
    Object.entries(byKind).forEach(([k, list]) => {
      if (!T[k]) return;
      if (k === 'twofive' && list.length < 3) return;
      H.push({ score: KIND[k].w + Math.min(list.length, 4) * 0.5, go: KIND[k].go, text: T[k](list) + `(${where(list)})` });
    });
    // 有名な進行
    const progs = {};
    res.blocks.forEach((b, i) => b.progs.forEach(p => (progs[p.id] = progs[p.id] || { p, blocks: [] }).blocks.push(i)));
    Object.values(progs).forEach(({ p, blocks }) => {
      const big = p.len >= 4;
      H.push({ score: (big ? 3.5 : 2) + Math.min(blocks.length, 4) * 0.3, go: 'progression:' + p.id, text: `${p.name}(${p.mood})を ${where(blocks.map(b => ({ block: b })))} で使っている。` });
    });
    if (res.outRatio >= 0.25) H.push({ score: 4, text: `ダイアトニック以外のコードが ${Math.round(res.outRatio * 100)}% あり、色彩の多い進行になっている。` });
    if (!H.length || (res.outRatio < 0.05 && !res.mods.length)) H.push({ score: 1.5, text: 'ほぼダイアトニックコードだけで組み立てた、素直で覚えやすい進行。' });
    return H.sort((a, b) => b.score - a.score).slice(0, 6);
  }

  /* ---------- 貼り付けたテキストを読む ---------- */
  const SECTION_WORD = /^\s*[【\[{(（]?\s*(?:c:|comment:)?\s*(イントロ|Aメロ|Bメロ|Cメロ|Dメロ|サビ|大サビ|落ちサビ|間奏|アウトロ|エンディング|Intro|Verse|Pre-?Chorus|Chorus|Bridge|Interlude|Outro)\s*[0-9０-９]*\s*[】\]})）]?/i;
  function parsePasted(text) {
    const sections = [{ label: '', lines: [] }];
    String(text).split(/\r?\n/).forEach(raw => {
      const sw = SECTION_WORD.exec(raw);
      const br = [...raw.matchAll(/\[([^\]]+)\]/g)].map(x => x[1]).filter(x => parseSymbol(x));
      let chords = br;
      if (!chords.length) chords = raw.split(/[\s|│｜　]+/).filter(w => /^[A-G][#b♯♭]?[^\s]*$/.test(w) && parseSymbol(w));
      if (sw && !chords.length) { sections.push({ label: sw[1], lines: [] }); return; }
      if (!chords.length) { if (!raw.trim()) sections.push({ label: '', lines: [] }); return; }
      sections[sections.length - 1].lines.push(chords);
    });
    return { title: '', artist: '', source: 'paste', url: '', sections: sections.filter(s => s.lines.length) };
  }

  return { parseSymbol, analyzeSong, parsePasted, pretty, KIND };
})();
if (typeof module !== 'undefined') module.exports = Analyzer;
