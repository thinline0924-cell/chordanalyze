/* =========================================================
   音楽理論の計算
   - 移調(キーの主音を変えると、度数から実際の音名を出す)
   - 音名のつづり(C♯ と D♭ の書き分け)
   - コード・スケールの構成音、テンション、ギターの押さえ方
   画面の部品は使わない(tests/check.js から Node でも読める)
   ========================================================= */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NAT = [0, 2, 4, 5, 7, 9, 11];        // 幹音(♯♭なし)の高さ
const MAJ = [0, 2, 4, 5, 7, 9, 11];        // メジャースケールの各度数の高さ
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];
const RNUM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
const ACCS = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '♯♯' };

// 主音のつづり [文字の番号, 変化記号]。メジャーはフラット優先、マイナーはよく使う形(C♯m、F♯m、G♯m)
const KEY_MAJ = [[0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0]];
const KEY_MIN = [[0,0],[0,1],[1,0],[2,-1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[6,-1],[6,0]];

const mod = (n, m) => ((n % m) + m) % m;
const nn = (L, a) => LETTERS[L] + ACCS[a];

// ♭♭・♯♯ は読みやすい形に直す。root=true のとき(コードのルート)は C♭・F♭・E♯・B♯ も直す
function simplify(L, a, root) {
  const pc = mod(NAT[L] + a, 12), n = NAT.indexOf(pc);
  if (root && a !== 0 && n >= 0) return [n, 0];
  if (Math.abs(a) < 2) return [L, a];
  if (n >= 0) return [n, 0];
  return a < 0 ? [NAT.indexOf(mod(pc + 1, 12)), -1] : [NAT.indexOf(mod(pc - 1, 12)), 1];
}
function spell(L, pc, root) {
  let a = mod(pc - NAT[L], 12);
  if (a > 6) a -= 12;
  return simplify(L, a, root);
}
const tonic = (keyPc, mode) => (mode === 'minor' ? KEY_MIN : KEY_MAJ)[keyPc];
function tonicName(keyPc, mode) { const [L, a] = tonic(keyPc, mode); return nn(L, a); }

/* ---------- コードの種類 ----------
   iv: [度数, 主音からの半音]。d: 表示名 */
const Q = {
  '':        { d: '',        iv: [[1,0],[3,4],[5,7]] },
  'm':       { d: 'm',       iv: [[1,0],[3,3],[5,7]] },
  '7':       { d: '7',       iv: [[1,0],[3,4],[5,7],[7,10]] },
  'M7':      { d: 'M7',      iv: [[1,0],[3,4],[5,7],[7,11]] },
  'm7':      { d: 'm7',      iv: [[1,0],[3,3],[5,7],[7,10]] },
  'mM7':     { d: 'mM7',     iv: [[1,0],[3,3],[5,7],[7,11]] },
  'm7(b5)':  { d: 'm7(♭5)',  iv: [[1,0],[3,3],[5,6],[7,10]] },
  'dim':     { d: 'dim',     iv: [[1,0],[3,3],[5,6]] },
  'dim7':    { d: 'dim7',    iv: [[1,0],[3,3],[5,6],[7,9]] },
  'aug':     { d: 'aug',     iv: [[1,0],[3,4],[5,8]] },
  'augM7':   { d: 'M7(♯5)',  iv: [[1,0],[3,4],[5,8],[7,11]] },
  '7(#5)':   { d: '7(♯5)',   iv: [[1,0],[3,4],[5,8],[7,10]] },
  'sus4':    { d: 'sus4',    iv: [[1,0],[4,5],[5,7]] },
  '7sus4':   { d: '7sus4',   iv: [[1,0],[4,5],[5,7],[7,10]] },
  'sus2':    { d: 'sus2',    iv: [[1,0],[2,2],[5,7]] },
  '6':       { d: '6',       iv: [[1,0],[3,4],[5,7],[6,9]] },
  'm6':      { d: 'm6',      iv: [[1,0],[3,3],[5,7],[6,9]] },
  'add9':    { d: 'add9',    iv: [[1,0],[3,4],[5,7],[9,14]] },
  'madd9':   { d: 'madd9',   iv: [[1,0],[3,3],[5,7],[9,14]] },
  '6(9)':    { d: '6(9)',    iv: [[1,0],[3,4],[5,7],[6,9],[9,14]] },
  'M7(9)':   { d: 'M7(9)',   iv: [[1,0],[3,4],[5,7],[7,11],[9,14]] },
  'M7(#11)': { d: 'M7(♯11)', iv: [[1,0],[3,4],[5,7],[7,11],[11,18]] },
  'm7(9)':   { d: 'm7(9)',   iv: [[1,0],[3,3],[5,7],[7,10],[9,14]] },
  'm7(11)':  { d: 'm7(11)',  iv: [[1,0],[3,3],[5,7],[7,10],[11,17]] },
  '7(9)':    { d: '7(9)',    iv: [[1,0],[3,4],[5,7],[7,10],[9,14]] },
  '7(b9)':   { d: '7(♭9)',   iv: [[1,0],[3,4],[5,7],[7,10],[9,13]] },
  '7(#9)':   { d: '7(♯9)',   iv: [[1,0],[3,4],[5,7],[7,10],[9,15]] },
  '7(#11)':  { d: '7(♯11)',  iv: [[1,0],[3,4],[5,7],[7,10],[11,18]] },
  '7(13)':   { d: '7(13)',   iv: [[1,0],[3,4],[5,7],[7,10],[13,21]] },
  '7(b13)':  { d: '7(♭13)',  iv: [[1,0],[3,4],[5,7],[7,10],[13,20]] },
};
const DEF = { 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };
function ivLabel(num, semi) {
  if (num === 1) return 'R';
  const d = semi - DEF[num];
  return (d < 0 ? '♭'.repeat(-d) : '♯'.repeat(d)) + num;
}

/* ---------- 度数で書いたコード(例 "bVII7" "IVm7(b5)" "V/VII")を読む ---------- */
const TOK = /^([b#]?)(VII|VI|V|IV|III|II|I)([^/]*)(?:\/([b#]?)(VII|VI|V|IV|III|II|I))?$/;
const accOf = s => (s === 'b' ? -1 : s === '#' ? 1 : 0);
const accSym = n => (n < 0 ? '♭' : n > 0 ? '♯' : '');
function parseTok(t) {
  const m = TOK.exec(t);
  if (!m || !(m[3] in Q)) throw new Error('読めないコード: ' + t);
  return { acc: accOf(m[1]), deg: RNUM[m[2]], q: m[3], bass: m[5] ? { acc: accOf(m[4]), deg: RNUM[m[5]] } : null };
}
function degLabel(t) {
  const p = parseTok(t);
  return accSym(p.acc) + ROMAN[p.deg - 1] + Q[p.q].d + (p.bass ? '/' + accSym(p.bass.acc) + ROMAN[p.bass.deg - 1] : '');
}
function degreeNote(keyPc, mode, deg, acc) {
  const [tL] = tonic(keyPc, mode);
  const L = mod(tL + deg - 1, 7), pc = mod(keyPc + MAJ[deg - 1] + acc, 12);
  const [l, a] = spell(L, pc, true);
  return { L: l, a, pc, name: nn(l, a) };
}
function chordOf(t, keyPc, mode) {
  const p = parseTok(t);
  const r = degreeNote(keyPc, mode, p.deg, p.acc);
  const tones = Q[p.q].iv.map(([num, semi]) => {
    const [l, a] = spell(mod(r.L + num - 1, 7), mod(r.pc + semi, 12));
    return { num, semi, label: ivLabel(num, semi), L: l, a, pc: mod(r.pc + semi, 12), name: nn(l, a) };
  });
  let bass = null;
  if (p.bass) {
    const b = degreeNote(keyPc, mode, p.bass.deg, p.bass.acc);
    const tt = tones.find(x => x.pc === b.pc);
    bass = { ...b, label: tt ? tt.label : '' };
  }
  return { tok: t, q: p.q, root: r, tones, bass, degree: degLabel(t), name: r.name + Q[p.q].d + (bass ? '/' + bass.name : '') };
}

/* ---------- テンション [表記, 半音, 扱い, ひとこと] ----------
   扱い:ok 使える / cond 条件付き / avoid 避ける(コードの音と半音でぶつかる) */
const T_DOM = [['♭9',13,'ok','短調へ解決するとき'],['9',14,'ok',''],['♯9',15,'ok','ブルージーに'],['11',17,'avoid','3度とぶつかる'],['♯11',18,'ok','解決しない 7th(♭Ⅶ7・裏コード)'],['♭13',20,'ok','短調へ解決するとき'],['13',21,'ok','']];
const T_M7 = [['9',14,'ok',''],['11',17,'avoid','3度とぶつかる'],['♯11',18,'ok','ⅣM7(リディアン)で特に'],['13',21,'ok','']];
const T_m7 = [['9',14,'cond','Ⅲm7 では避ける'],['11',17,'ok',''],['13',21,'cond','Ⅱm7(ドリアン)のとき']];
const T_6 = [['9',14,'ok',''],['♯11',18,'ok','']];
const TENS = {
  '': [['9',14,'ok','add9 として'],['11',17,'avoid','3度とぶつかる'],['13',21,'ok','6 として']],
  'M7': T_M7, 'M7(9)': T_M7, 'M7(#11)': T_M7,
  'm': [['9',14,'ok',''],['11',17,'ok',''],['13',21,'cond','Ⅱm(ドリアン)のとき']],
  'madd9': [['11',17,'ok',''],['13',21,'cond','Ⅱm(ドリアン)のとき']],
  'm7': T_m7, 'm7(9)': T_m7, 'm7(11)': T_m7,
  'mM7': [['9',14,'ok',''],['11',17,'ok',''],['13',21,'ok','']],
  '7': T_DOM, '7(9)': T_DOM, '7(b9)': T_DOM, '7(#9)': T_DOM, '7(#11)': T_DOM, '7(13)': T_DOM, '7(b13)': T_DOM,
  '7(#5)': [['9',14,'ok','ホールトーン'],['♭9',13,'ok','オルタード'],['♯9',15,'ok','オルタード'],['♯11',18,'ok','']],
  'm7(b5)': [['9',14,'cond','ロクリアン♮2 のとき'],['11',17,'ok',''],['♭13',20,'ok','']],
  'dim': [['9',14,'ok',''],['11',17,'ok',''],['♭13',20,'ok','']],
  'dim7': [['9',14,'ok','各構成音の全音上'],['11',17,'ok',''],['♭13',20,'ok',''],['M7',23,'ok','']],
  'aug': [['9',14,'ok',''],['♯11',18,'ok','ホールトーン']],
  'augM7': [['9',14,'ok',''],['♯11',18,'ok','']],
  'sus4': [['9',14,'ok',''],['13',21,'ok','']],
  'sus2': [['11',17,'ok',''],['13',21,'ok','']],
  '7sus4': [['♭9',13,'ok',''],['9',14,'ok',''],['13',21,'ok','']],
  '6': T_6, '6(9)': T_6,
  'm6': [['9',14,'ok',''],['11',17,'ok','']],
  'add9': [['11',17,'avoid','3度とぶつかる'],['13',21,'ok','']],
};
function tensionsOf(c) {
  const have = new Set(c.tones.map(t => t.pc));
  return (TENS[c.q] || []).map(([lab, semi, st, note]) => {
    const num = parseInt(lab.replace(/[^0-9]/g, ''), 10);
    const pc = mod(c.root.pc + semi, 12);
    const [l, a] = spell(mod(c.root.L + num - 1, 7), pc);
    return { lab, name: nn(l, a), st, note, inChord: have.has(pc) };
  });
}

/* ---------- ギターの押さえ方 ----------
   ルートの弦のフレットからのずれ(6弦→1弦の順、null はミュート) */
const SH6 = {
  '':[0,2,2,1,0,0], 'm':[0,2,2,0,0,0], '7':[0,2,0,1,0,0], 'M7':[0,null,1,1,0,null], 'm7':[0,2,0,0,0,0],
  'mM7':[0,null,1,0,0,null], 'm7(b5)':[0,null,0,0,-1,null], 'dim':[0,null,null,0,-1,0], 'dim7':[0,null,-1,0,-1,null],
  'aug':[0,null,2,1,1,null], 'augM7':[0,null,1,1,1,null], '7(#5)':[0,null,0,1,1,null],
  'sus4':[0,2,2,2,0,0], '7sus4':[0,2,0,2,0,0], 'sus2':[0,2,4,4,0,0], '6':[0,null,-1,1,0,null], 'm6':[0,null,-1,0,0,null],
  'add9':[0,null,2,1,0,2], '6(9)':[0,null,-1,1,2,2], 'M7(9)':[0,null,1,1,0,2], 'M7(#11)':[0,null,1,1,-1,null],
  'm7(9)':[0,null,0,0,0,2], 'm7(11)':[0,0,0,0,0,null], '7(9)':[0,null,0,1,0,2], '7(b9)':[0,null,0,1,0,1],
  '7(#9)':[0,null,0,1,null,3], '7(#11)':[0,null,0,1,-1,null], '7(13)':[0,null,0,1,2,null], '7(b13)':[0,null,0,1,1,null],
};
const SH5 = {
  '':[null,0,2,2,2,0], 'm':[null,0,2,2,1,0], '7':[null,0,2,0,2,0], 'M7':[null,0,2,1,2,0], 'm7':[null,0,2,0,1,0],
  'mM7':[null,0,2,1,1,0], 'm7(b5)':[null,0,1,0,1,null], 'dim':[null,0,1,2,1,null], 'dim7':[null,0,1,-1,1,null],
  'aug':[null,0,3,2,2,null], 'augM7':[null,0,3,1,2,null], '7(#5)':[null,0,null,0,2,1],
  'sus4':[null,0,2,2,3,0], '7sus4':[null,0,2,0,3,0], 'sus2':[null,0,2,2,0,0], '6':[null,0,2,2,2,2], 'm6':[null,0,2,2,1,2],
  'add9':[null,0,2,4,2,0], 'madd9':[null,0,2,4,1,null], '6(9)':[null,0,-1,-1,0,0], 'M7(9)':[null,0,-1,1,0,null],
  'M7(#11)':[null,0,1,1,2,null], 'm7(9)':[null,0,-2,0,0,null], 'm7(11)':[null,0,0,0,1,null], '7(9)':[null,0,-1,0,0,0],
  '7(b9)':[null,0,-1,0,-1,null], '7(#9)':[null,0,-1,0,1,null], '7(#11)':[null,0,1,0,2,null], '7(13)':[null,0,-1,0,null,2],
  '7(b13)':[null,0,-1,0,null,1],
};
const OPEN6 = [4, 9, 2, 7, 11, 4]; // 6弦→1弦の開放弦の音(E A D G B E)

function shapeFrets(c, rs) {
  const sh = (rs === 6 ? SH6 : SH5)[c.q];
  if (!sh) return null;
  const ri = rs === 6 ? 0 : 1;
  const rf = mod(c.root.pc - OPEN6[ri], 12);
  let fr = sh.map(o => (o == null ? null : rf + o));
  if (Math.min(...fr.filter(f => f != null)) < 0) fr = fr.map(f => (f == null ? null : f + 12));
  return { sh, fr, ri };
}

/* ---------- スケール ----------
   iv: [度数, 半音, 表示(省略時は度数から)] */
function scaleOf(sc, keyPc) {
  // 主音の書き方を2通り(♭と♯)試して、♭♭・♯♯が出ず、♯♭の少ないほうを選ぶ(例:E♭ ロクリアンより D♯ ロクリアン)
  const n = NAT.indexOf(keyPc);
  const pref = tonic(keyPc, sc.mode);
  // 同じ文字が2回出るスケール(ブルース・オルタードなど)は、キーのふつうの書き方のまま
  const hepta = new Set(sc.iv.map(v => v[0])).size === sc.iv.length;
  const cands = n >= 0 || !hepta ? [pref] : [pref, [NAT.indexOf(mod(keyPc + 1, 12)), -1], [NAT.indexOf(mod(keyPc - 1, 12)), 1]];
  const build = ([tL]) => sc.iv.map(([num, semi, lab]) => {
    const pc = mod(keyPc + semi, 12), L = mod(tL + num - 1, 7);
    let a = mod(pc - NAT[L], 12); if (a > 6) a -= 12;
    return { num, semi, pc, L, a, lab };
  });
  const score = ts => ts.reduce((s, t) => s + Math.abs(t.a) + (Math.abs(t.a) >= 2 ? 100 : 0), 0);
  let best = null, bestScore = Infinity;
  cands.forEach(c => { const ts = build(c), sc0 = score(ts); if (sc0 < bestScore) { best = ts; bestScore = sc0; } });
  const tones = best.map(t => {
    const [l, a] = simplify(t.L, t.a, !hepta);
    return { num: t.num, semi: t.semi, pc: t.pc, L: l, a, name: nn(l, a), label: t.lab || (t.num === 1 ? '1' : ivLabel(t.num, t.semi)) };
  });
  return { tones, root: tones[0] };
}

if (typeof module !== 'undefined') {
  module.exports = { LETTERS, NAT, MAJ, ROMAN, KEY_MAJ, KEY_MIN, Q, TENS, SH6, SH5, OPEN6, mod, nn, spell, tonic, tonicName,
    parseTok, degLabel, chordOf, tensionsOf, shapeFrets, scaleOf };
}
