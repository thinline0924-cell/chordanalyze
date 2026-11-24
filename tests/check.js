/* データと計算の点検。使い方:node tests/check.js
   - すべての進行・例のコードが読めるか(12キー × メジャー/マイナー)
   - 押さえ方の音が、すべてそのコードの構成音か
   - ID の重複、スケールの参照先があるか */
const T = require('../js/theory.js');
const D = require('../js/data.js');
let bad = 0;
const fail = (...m) => { bad++; console.log('NG', ...m); };
const toks = s => s.split('|').join(' ').trim().split(/\s+/);

const all = [];
D.PROGS.forEach(p => { toks(p.bars).forEach(t => all.push([t, p.mode, p.id])); p.vars.forEach(v => toks(v[1]).forEach(t => all.push([t, p.mode, p.id + '(変形)']))); });
D.USES.forEach(u => { u.list.forEach(([, t]) => all.push([t, 'major', u.id])); u.ex.forEach(([, b, m]) => toks(b).forEach(t => all.push([t, m || 'major', u.id]))); });
D.TENSION_ITEMS.forEach(t => { all.push(['I' + t.q, 'major', t.id]); t.forms.forEach(q => all.push(['I' + q, 'major', t.id])); });
D.DOM_GUIDE.forEach(([, t]) => all.push([t, 'major', 'guide']));
D.SCALE_MAP.forEach(([t, m]) => all.push([t, m, 'map']));
for (const [t, m, where] of all) {
  for (let k = 0; k < 12; k++) {
    try {
      const c = T.chordOf(t, k, m);
      if (c.name.includes('♭♭') || c.name.includes('♯♯')) fail(where, t, k, c.name);
    } catch (e) { fail(where, t, e.message); break; }
  }
}
// 押さえ方
for (const q in T.Q) {
  for (const [SH, ri, nm] of [[T.SH6, 0, '6弦'], [T.SH5, 1, '5弦']]) {
    const sh = SH[q];
    if (!sh) continue;
    const semis = new Set(T.Q[q].iv.map(([, s]) => s % 12));
    sh.forEach((o, i) => {
      if (o == null) return;
      const rel = T.mod(T.OPEN6[i] - T.OPEN6[ri] + o, 12);
      if (!semis.has(rel)) fail('押さえ方', q, nm, (6 - i) + '弦');
    });
    const fr = sh.filter(o => o != null);
    if (Math.max(...fr) - Math.min(...fr) > 4) fail('押さえ方が広すぎる', q, nm);
    if (sh[ri] !== 0) fail('ルートの弦が 0 でない', q, nm);
  }
}
// ID・参照
const dup = a => a.filter((x, i) => a.indexOf(x) !== i);
dup(D.PROGS.map(p => p.id)).forEach(x => fail('進行のIDが重複', x));
dup(D.SCALES.map(s => s.id)).forEach(x => fail('スケールのIDが重複', x));
const sid = new Set(D.SCALES.map(s => s.id));
D.DOM_GUIDE.forEach(r => sid.has(r[3]) || fail('スケールがない', r[3]));
D.SCALE_MAP.forEach(r => sid.has(r[2]) || fail('スケールがない', r[2]));
D.PROGS.forEach(p => D.CATS.some(c => c[0] === p.cat) || fail('分類がない', p.id));
// スケール:7音のものは文字(C〜B)が重ならない
D.SCALES.filter(s => new Set(s.iv.map(v => v[0])).size === s.iv.length).forEach(s => { for (let k = 0; k < 12; k++) { const r = T.scaleOf(s, k); if (new Set(r.tones.map(t => t.L)).size !== r.tones.length) fail('スケールのつづり', s.id, k, r.tones.map(t => t.name).join(' ')); } });

/* ---------- 分析 ---------- */
Object.assign(globalThis, T, D);
const A = require('../js/analyze.js');
const P = require('../lib/parse.js');
// コード記号の読み取り
const SYM = { 'Cmaj7': 'M7', 'C△7': 'M7', 'Cm7-5': 'm7(b5)', 'Cø': 'm7(b5)', 'C7(#9)': '7(#9)', 'C7-9': '7(b9)', 'C9': '7(9)', 'Cm9': 'm7(9)',
  'CM9': 'M7(9)', 'C13': '7(13)', 'C6/9': '6(9)', 'Cadd9': 'add9', 'Csus4': 'sus4', 'C7sus4': '7sus4', 'Caug': 'aug', 'C+': 'aug', 'C7+5': '7(#5)',
  'Cdim': 'dim', 'Cdim7': 'dim7', 'CmM7': 'mM7', 'Cm(maj7)': 'mM7', 'B♭add9': 'add9', 'F#m7(11)': 'm7(11)', 'Cm6': 'm6', 'C(9)': 'add9' };
Object.entries(SYM).forEach(([s, q]) => { const c = A.parseSymbol(s); if (!c || c.q !== q) fail('コード記号', s, c && c.q); });
if (A.parseSymbol('N.C.') !== null) fail('N.C. を読んでしまう');
if (A.parseSymbol('C/E').bass.pc !== 4) fail('分数コードのベース');
// 作例:Aメロ(Ⅰ–Ⅴ–Ⅵm–Ⅳ)、Bメロ(ツーファイブとⅥ7)、サビ(王道・Ⅳm6・裏コード・♯Ⅰdim7)、ラスト(半音上へ転調)
const song = { sections: [
  { label: 'Aメロ', lines: [['C', 'G', 'Am', 'F'], ['C', 'G', 'Am', 'F']] },
  { label: 'Bメロ', lines: [['Dm7', 'G7', 'CM7', 'A7'], ['Dm7', 'G7', 'C', 'C']] },
  { label: 'サビ', lines: [['FM7', 'G7', 'Em7', 'Am'], ['Fm6', 'Bb7', 'CM7', 'C#dim7'], ['Dm7', 'Db7', 'CM7']] },
  { label: 'ラスト', lines: [['Db', 'Ab', 'Bbm', 'Gb'], ['Db', 'Ab', 'Bbm', 'Gb'], ['Ebm7', 'Ab7', 'Db', 'Db']] },
] };
const r = A.analyzeSong(song);
if (r.key.name !== 'C' || r.key.mode !== 'major') fail('キーの判定', r.key.name);
if (!(r.mods.length === 1 && r.mods[0].block === 3 && r.mods[0].semis === 1 && r.mods[0].to.name === 'D♭')) fail('転調の判定', JSON.stringify(r.mods.map(m => [m.block, m.semis, m.to.name])));
const kinds = new Set(r.tech.map(t => t.kind));
['secdom', 'tritone', 'sdm', 'backdoor', 'passdim', 'twofive'].forEach(k => kinds.has(k) || fail('技法が見つからない', k));
if (!r.blocks[0].progs.some(p => p.id === 'axis')) fail('Ⅰ–Ⅴ–Ⅵm–Ⅳ 進行が見つからない');
if (!r.blocks[2].progs.some(p => p.id === 'oudou')) fail('王道進行が見つからない');
if (r.blocks[1].items[3].deg !== 'Ⅵ7') fail('度数', r.blocks[1].items[3].deg);
if (!r.highlights.length || !/転調/.test(r.highlights[0].text)) fail('聴きどころの先頭が転調でない');
// マイナーキーの曲
const rm = A.analyzeSong({ sections: [{ label: '', lines: [['Am', 'Dm', 'E7', 'Am'], ['F', 'G', 'E7', 'Am']] }] });
if (rm.key.name !== 'Am') fail('マイナーキーの判定', rm.key.name);
// 貼り付け
const ps = A.parsePasted('【Aメロ】\nC G Am F\n[Dm7]あ[G7]い\n\nサビ\nFM7 G7 Em7 Am');
if (ps.sections.length !== 2 || ps.sections[0].label !== 'Aメロ' || ps.sections[0].lines[1].join() !== 'Dm7,G7') fail('貼り付けの読み取り', JSON.stringify(ps.sections));
// 曲のページの読み取り(歌詞が残らないこと)
const uf = P.parseUfret('<title>曲名 / 歌手  ギターコード - U-FRET</title><script>var ufret_chord_datas = ["[C]\\u3000[G]\\r","[Am]歌詞[F]歌詞\\r","\\r","[Dm7]歌詞[G7]\\r"];</script>');
if (!(uf.title === '曲名' && uf.artist === '歌手' && uf.sections.length === 2 && uf.sections[0].lines[1].join() === 'Am,F')) fail('U-FRET の読み取り', JSON.stringify(uf));
if (JSON.stringify(uf).includes('歌詞')) fail('U-FRET の歌詞が残っている');
const cw = P.parseChordWiki('<h1 class="title">曲名</h1><h2 class="subtitle">歌手</h2><p class="comment">サビ</p><p class="line"><span class="chord">C</span><span class="word">歌詞</span><span class="chord">G</span></p><p class="line"></p><p class="line"><span class="chord">Am</span></p>');
if (!(cw.title === '曲名' && cw.sections[0].label === 'サビ' && cw.sections.length === 2)) fail('ChordWiki の読み取り', JSON.stringify(cw));
if (JSON.stringify(cw).includes('歌詞')) fail('ChordWiki の歌詞が残っている');
['https://www.ufret.jp/song.php?data=41', 'https://ch.chordwiki.org/wiki.cgi?c=view&t=abc', 'チェリー / スピッツ ギターコード - U-FRET https://www.ufret.jp/song.php?data=41', 'https://ch.chordwiki.org/wiki.cgi?c=view&t=%E3%83%81&key=2&symbol='].forEach(u => { try { P.checkUrl(u); } catch (e) { fail('URL を受け付けない', u); } });
['https://example.com/', 'file:///etc/passwd', 'https://www.ufret.jp/../song.php?data=1x', 'http://169.254.169.254/'].forEach(u => { try { P.checkUrl(u); fail('URL を通してしまう', u); } catch (e) { /* OK */ } });

console.log(bad ? `NG ${bad} 件` : `OK(コード ${all.length} 個 × 12キー、進行 ${D.PROGS.length} 件、スケール ${D.SCALES.length} 件、分析のテスト)`);
process.exit(bad ? 1 : 0);
