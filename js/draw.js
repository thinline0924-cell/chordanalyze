/* =========================================================
   図を描く(SVG)
   押さえ方(コードダイアグラム)・指板・五線譜
   色は style.css の .s-〇〇 で付ける
   ========================================================= */
const SVGS = {
  dot(x, y, r, label, root) {
    return root
      ? `<circle class="s-fill" cx="${x}" cy="${y}" r="${r}"/><text class="s-txt-p" x="${x}" y="${y + 3}" font-size="8.5" text-anchor="middle">${label}</text>`
      : `<circle class="s-paper s-stroke" cx="${x}" cy="${y}" r="${r}" stroke-width="1"/><text class="s-txt" x="${x}" y="${y + 3}" font-size="8.5" text-anchor="middle">${label}</text>`;
  },
};

// 音の高さ(pc)に付ける文字。度数か音名か
function chordLabel(c, pc, labelMode) {
  const t = c.tones.find(x => x.pc === pc);
  if (!t) return c.bass && c.bass.pc === pc ? (labelMode === 'deg' ? 'B' : c.bass.name) : '';
  return labelMode === 'deg' ? t.label : t.name;
}

/* ---------- 押さえ方(縦のダイアグラム) ---------- */
function diagSVG(c, rs, labelMode) {
  const s0 = shapeFrets(c, rs);
  if (!s0) return '<div class="nodiag">この形はなし</div>';
  const { sh, fr, ri } = s0;
  const fretted = fr.filter(f => f != null && f > 0);
  const maxF = Math.max(...fretted, 1);
  const start = maxF <= 4 ? 1 : Math.min(...fretted);
  const rows = Math.max(4, maxF - start + 1);
  const L = 34, T = 26, SX = 18, SY = 23, W = L + 5 * SX + 14, H = T + rows * SY + 8;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.name} ${rs}弦ルートの押さえ方">`;
  for (let k = 0; k <= rows; k++)
    s += `<line class="s-line" x1="${L}" x2="${L + 5 * SX}" y1="${T + k * SY}" y2="${T + k * SY}" stroke-width="${k === 0 && start === 1 ? 3 : 1}"/>`;
  for (let i = 0; i < 6; i++)
    s += `<line class="s-line" x1="${L + i * SX}" x2="${L + i * SX}" y1="${T}" y2="${T + rows * SY}" stroke-width="1"/>`;
  if (start > 1) s += `<text class="s-txt-s" x="${L - 12}" y="${T + SY * 0.5 + 4}" font-size="10" text-anchor="end">${start}f</text>`;
  // セーハ(人差し指で複数の弦を押さえる)
  const rootF = fr[ri];
  const zeros = sh.map((o, i) => (o === 0 ? i : -1)).filter(i => i >= 0);
  if (rootF > 0 && zeros.length >= 2) {
    const a = Math.min(...zeros), b = Math.max(...zeros);
    let ok = b - a >= 2;
    for (let i = a; i <= b; i++) if (sh[i] == null || sh[i] < 0) ok = false;
    if (ok) {
      const y = T + (rootF - start + 0.5) * SY;
      s += `<line class="s-barre" x1="${L + a * SX}" x2="${L + b * SX}" y1="${y}" y2="${y}" stroke-width="15"/>`;
    }
  }
  fr.forEach((f, i) => {
    const x = L + i * SX;
    if (f == null) { s += `<text class="s-txt-s" x="${x}" y="${T - 8}" font-size="11" text-anchor="middle">×</text>`; return; }
    const pc = mod(OPEN6[i] + f, 12), l = chordLabel(c, pc, labelMode), root = pc === c.root.pc;
    if (f === 0) {
      s += `<circle class="s-paper s-stroke" cx="${x}" cy="${T - 11}" r="6.5" stroke-width="1"/><text class="s-txt" x="${x}" y="${T - 8.4}" font-size="7" text-anchor="middle">${l}</text>`;
      return;
    }
    s += SVGS.dot(x, T + (f - start + 0.5) * SY, 8.2, l, root);
  });
  return s + '</svg>';
}

/* ---------- 指板(横長、0〜15フレット) ----------
   marks: [{pc, label, root}] */
function fretSVG(marks, aria) {
  const by = new Map(marks.map(m => [m.pc, m]));
  const TOP = [4, 11, 7, 2, 9, 4]; // 1弦→6弦
  const CW = 32, L = 36, T = 14, SY = 19, N = 15, W = L + N * CW + 8, H = T + 5 * SY + 30;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">`;
  [3, 5, 7, 9, 15].forEach(f => (s += `<circle class="s-inlay" cx="${L + (f - 0.5) * CW}" cy="${T + 2.5 * SY}" r="4"/>`));
  s += `<circle class="s-inlay" cx="${L + 11.5 * CW}" cy="${T + 1.5 * SY}" r="4"/><circle class="s-inlay" cx="${L + 11.5 * CW}" cy="${T + 3.5 * SY}" r="4"/>`;
  for (let f = 1; f <= N; f++) s += `<line class="s-thin" x1="${L + f * CW}" x2="${L + f * CW}" y1="${T}" y2="${T + 5 * SY}" stroke-width="1"/>`;
  s += `<line class="s-line" x1="${L}" x2="${L}" y1="${T}" y2="${T + 5 * SY}" stroke-width="3"/>`;
  for (let i = 0; i < 6; i++) s += `<line class="s-line" x1="${L - 24}" x2="${L + N * CW}" y1="${T + i * SY}" y2="${T + i * SY}" stroke-width="${0.6 + i * 0.16}"/>`;
  [3, 5, 7, 9, 12, 15].forEach(f => (s += `<text class="s-txt-s" x="${L + (f - 0.5) * CW}" y="${H - 8}" font-size="10" text-anchor="middle">${f}</text>`));
  TOP.forEach((o, i) => {
    for (let f = 0; f <= N; f++) {
      const m = by.get(mod(o + f, 12));
      if (!m) continue;
      s += SVGS.dot(f === 0 ? L - 14 : L + (f - 0.5) * CW, T + i * SY, 8.4, m.label, m.root);
    }
  });
  return s + '</svg>';
}
function chordMarks(c, labelMode) {
  const pcs = new Set(c.tones.map(t => t.pc));
  if (c.bass) pcs.add(c.bass.pc);
  return [...pcs].map(pc => ({ pc, label: chordLabel(c, pc, labelMode), root: pc === c.root.pc }));
}
function scaleMarks(sc, labelMode) {
  return sc.tones.map(t => ({ pc: t.pc, label: labelMode === 'deg' ? t.label : t.name, root: t.num === 1 && t.semi === 0 }));
}

/* ---------- 五線譜(ト音記号、調号なし) ---------- */
const STAFF = { G: 9, BOT: 86 };
const stepY = st => STAFF.BOT - (st - 30) * STAFF.G / 2; // 30 = E4(第1線)
function noteStep(midi, L, a) {
  const oct = Math.round((midi - a - NAT[L]) / 12) - 1;
  return oct * 7 + L;
}
function staffBase(W, H) {
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let k = 0; k < 5; k++) s += `<line class="s-line" x1="4" x2="${W - 4}" y1="${STAFF.BOT - k * STAFF.G}" y2="${STAFF.BOT - k * STAFF.G}" stroke-width="1"/>`;
  return s + `<text class="s-mus" x="6" y="${STAFF.BOT - STAFF.G}" font-size="${STAFF.G * 4.3}">𝄞</text>`;
}
function ledgers(x, st) {
  let s = '';
  for (let k = 28; k >= st; k -= 2) s += `<line class="s-line" x1="${x - 11}" x2="${x + 11}" y1="${stepY(k)}" y2="${stepY(k)}" stroke-width="1"/>`;
  for (let k = 40; k <= st; k += 2) s += `<line class="s-line" x1="${x - 11}" x2="${x + 11}" y1="${stepY(k)}" y2="${stepY(k)}" stroke-width="1"/>`;
  return s;
}
function noteHead(x, y) {
  return `<ellipse class="s-fill" cx="${x}" cy="${y}" rx="6.4" ry="4.4" transform="rotate(-18 ${x} ${y})"/><ellipse class="s-paper" cx="${x}" cy="${y}" rx="3.1" ry="2.2" transform="rotate(42 ${x} ${y})"/>`;
}
function accGlyph(x, y, a) {
  const g = a > 0 ? '♯' : a < 0 ? '♭' : '♮';
  return `<text class="s-mus" x="${x}" y="${y + (a > 0 ? 4.5 : 3)}" font-size="15" text-anchor="middle">${g}</text>`;
}
function staffChordSVG(c) {
  const X = 86;
  const rootMidi = 60 + NAT[c.root.L] + c.root.a;
  const notes = c.tones.map(t => ({ st: noteStep(rootMidi + t.semi, t.L, t.a), a: t.a })).sort((p, q) => p.st - q.st);
  let prev = -99, prevShift = false;
  notes.forEach(n => { n.shift = n.st - prev === 1 && !prevShift; prevShift = n.shift; prev = n.st; });
  let s = staffBase(160, 124).replace('role="img"', `role="img" aria-label="${c.name} の五線譜"`);
  notes.forEach(n => (s += ledgers(X + (n.shift ? 13 : 0), n.st)));
  notes.forEach(n => (s += noteHead(X + (n.shift ? 13 : 0), stepY(n.st))));
  const cols = [];
  notes.filter(n => n.a !== 0).sort((p, q) => q.st - p.st).forEach(n => {
    let ci = cols.findIndex(last => last - n.st >= 6);
    if (ci < 0) { ci = cols.length; cols.push(n.st); } else cols[ci] = n.st;
    s += accGlyph(X - 14 - ci * 10, stepY(n.st), n.a);
  });
  return s + '</svg>';
}
function staffScaleSVG(sc, name) {
  const r = sc.root;
  const rootMidi = 60 + NAT[r.L] + r.a;
  const tones = [...sc.tones, { ...r, semi: 12 }];
  const GAP = 26, X0 = 52, W = X0 + tones.length * GAP + 8;
  let s = staffBase(W, 124).replace('role="img"', `role="img" aria-label="${name} の五線譜"`);
  tones.forEach((t, i) => {
    const x = X0 + i * GAP, st = noteStep(rootMidi + t.semi, t.L, t.a), y = stepY(st);
    s += ledgers(x, st) + noteHead(x, y);
    if (t.a !== 0) s += accGlyph(x - 12, y, t.a);
  });
  return s + '</svg>';
}

if (typeof module !== 'undefined') module.exports = { diagSVG, fretSVG, chordMarks, scaleMarks, staffChordSVG, staffScaleSVG };
