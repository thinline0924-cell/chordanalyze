/* =========================================================
   画面を組み立てる・操作に応える
   ページは URL の # で切り替える(#top #diatonic #progression #chord #tension #scale)
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// ブラウザに覚えさせる設定(使えない環境でも止まらない)
const store = {
  get(k, d) { try { const v = localStorage.getItem('cn:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cn:' + k, JSON.stringify(v)); } catch (e) { /* 保存できなくても続ける */ } },
};
const S = {
  key: store.get('key', 0),                 // 主音(0=C … 11=B)
  label: store.get('label', 'deg'),         // 図の文字:deg 度数 / note 音名
  tab: store.get('tab', 'pop'),             // 進行のタブ
  dmode: store.get('dmode', 'major'),       // ダイアトニックの種類
  dsize: store.get('dsize', 4),             // 3和音 / 4和音
  open: new Set(),                          // 開いている行
  drOpen: null,                             // ドロワーで開いているページ
  panel: null,                              // 詳細パネルのコード
  scrollTo: null,                           // 描いたあとに移動する場所
  // 分析
  song: store.get('last', null),            // いま分析している曲(コードだけ。歌詞は持たない)
  ana: null,                                // 分析の結果
  av: 'orig',                               // 譜面の表示:orig 原曲キー / sel 選んだキー
  impUrl: '', pasteText: '', anaPaste: false, anaBusy: false, anaErr: '', bmNote: '',
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
if (!(S.key >= 0 && S.key < 12)) S.key = 0;
if (!CATS.some(c => c[0] === S.tab)) S.tab = 'pop';

const PAGES = [
  { id: 'top', en: 'Home', ja: 'ホーム' },
  { id: 'diatonic', en: 'Diatonic', ja: 'ダイアトニック', n: DIATONIC.length },
  { id: 'progression', en: 'Progression', ja: '進行', n: PROGS.length },
  { id: 'chord', en: 'Chord', ja: 'コードの使い所', n: USES.length },
  { id: 'tension', en: 'Tension', ja: 'テンション', n: TENSION_ITEMS.length + 1 },
  { id: 'scale', en: 'Scale', ja: 'スケール', n: SCALES.length },
  { id: 'analyze', en: 'Analyze', ja: '分析' },
];
const PREFIX = { progression: 'p-', chord: 'u-', tension: 't-', scale: 's-' };
const INDEX = [
  { page: 'diatonic', items: DIATONIC.map(d => [d.id, d.name]) },
  { page: 'progression', groups: CATS.map(([c, lab]) => [lab, SUBS[c].map(([sid, name]) => ['@' + c + '.' + sid, name, PROGS.filter(p => p.cat === c && p.sub === sid).length])]) },
  { page: 'chord', items: USES.map(u => [u.id, u.name]) },
  { page: 'tension', items: [...TENSION_ITEMS.map(t => [t.id, t.name]), ['guide', 'ドミナントのテンションの選び方']] },
  { page: 'scale', items: [...SCALES.map(s => [s.id, s.name]), ['map', 'コードとスケールの対応表']], cols2: true },
];
const pageOf = () => { const h = location.hash.slice(1).split('=')[0]; return PAGES.some(p => p.id === h) ? h : 'top'; };
const pad = n => String(n).padStart(2, '0');
const catName = id => CATS.find(c => c[0] === id)[1];
const keyLabel = mode => tonicName(S.key, mode) + (mode === 'minor' ? 'm' : '');
const keyMeta = mode => `Key<b>${keyLabel(mode || 'major')}</b>`;

/* ---------- ヘッダー ---------- */
function renderNav() {
  const cur = pageOf();
  // ナビ:マウスを乗せる(キーボードなら Tab で入る)と、そのページの項目の一覧(索引)が下に開く
  $('#gnav').innerHTML = PAGES.slice(1).map((p, i, arr) => {
    const col = INDEX.find(c => c.page === p.id);
    return `<div class="gn-item${col ? ' has-drop' : ''}${i >= arr.length - 3 ? ' is-right' : ''}"><a href="#${p.id}"${cur === p.id ? ' aria-current="page"' : ''}>${p.en}${p.n ? `<sup>${p.n}</sup>` : ''}</a>${col ? `<div class="gn-drop${col.groups || col.cols2 ? ' wide' : ''}"><div class="gn-drop-h"><span class="ja">${p.ja}</span><a href="#${p.id}">ページを開く</a></div>${indexBody(col)}</div>` : ''}</div>`;
  }).join('');
  // ドロワー(スマホのメニュー):ページごとに、中の項目を開いて見られる
  $('#drNav').innerHTML = PAGES.map(p => {
    const col = INDEX.find(c => c.page === p.id), open = S.drOpen === p.id;
    return `<li class="${open ? 'is-open' : ''}"><div class="dr-row"><a href="#${p.id}"><span class="ja">${p.ja}</span><span class="en">${p.en}${p.n ? ' ' + p.n : ''}</span></a>${col ? `<button class="dr-tg" data-dr="${p.id}" aria-expanded="${open}" aria-label="${p.ja}の項目を${open ? '閉じる' : '開く'}"><span class="pm" aria-hidden="true"></span></button>` : ''}</div>${col && open ? `<div class="dr-sub">${indexBody(col)}</div>` : ''}</li>`;
  }).join('');
}
function renderKeys() {
  $('#keys').innerHTML = KEY_MAJ.map(([L, a], i) => `<button role="radio" aria-checked="${i === S.key}" data-key="${i}">${nn(L, a)}</button>`).join('');
}
function indexBody(col) {
  const link = (page, [id, name, n]) => `<li><a href="#${page}" data-go="${page}:${id}">${name}${n != null ? `<sup>${n}</sup>` : ''}</a></li>`;
  return col.groups
    ? `<div class="cols2">${col.groups.map(([lab, items]) => `<div class="grp-h">${lab}</div>` + items.map(it => `<ul>${link(col.page, it)}</ul>`).join('')).join('')}</div>`
    : col.cols2
      ? `<div class="cols2">${col.items.map(it => `<ul>${link(col.page, it)}</ul>`).join('')}</div>`
      : `<ul>${col.items.map(it => link(col.page, it)).join('')}</ul>`;
}
/* ---------- 共通の部品 ---------- */
function chordBtn(t, mode, top, extra = '') {
  const c = chordOf(t, S.key, mode);
  const d = top && top !== c.degree ? `${c.degree}<em>${top}</em>` : c.degree;
  return `<button class="ch" data-tok="${t}" data-mode="${mode}"${extra} title="${c.name}"><span class="d">${d}</span><span class="n">${c.name}</span></button>`;
}
function chartHTML(src, mode, pid) {
  let ci = 0;
  const bars = src.split('|').map(b => b.trim().split(/\s+/));
  return `<div class="chart">${bars.map(b => `<div class="bar">${b.map(t => chordBtn(t, mode, null, pid ? ` data-pid="${pid}" data-ci="${ci++}"` : '')).join('')}</div>`).join('')}</div>`;
}
const playBtn = id => `<button class="sbtn" data-play="${id}">${Organ.playingId === id ? '<i class="sq"></i>停止' : '<i class="tri"></i>再生'}</button>`;
const labelSeg = () => `<div class="seg" role="group" aria-label="図の文字"><button aria-pressed="${S.label === 'deg'}" data-label="deg">度数</button><button aria-pressed="${S.label === 'note'}" data-label="note">音名</button></div>`;
function crumb(items) {
  return `<nav class="crumb" aria-label="現在地">${items.map((it, i) => (i ? '<span class="sep">›</span>' : '') + (it[1] ? `<a href="${it[1]}">${it[0]}</a>` : `<span>${it[0]}</span>`)).join('')}</nav>`;
}
function head(en, ja, meta = '') {
  return `<div class="ph"><div><div class="eyebrow">${en}</div><h1>${ja}</h1></div>${meta ? `<div class="ph-meta">${meta}</div>` : ''}</div>`;
}
function pager(cur) {
  const i = PAGES.findIndex(p => p.id === cur), prev = PAGES[i - 1], next = PAGES[i + 1];
  const a = (p, dir) => (p ? `<a href="#${p.id}"><span class="en">${dir === 'prev' ? '← Prev' : 'Next →'}</span><span class="ja">${p.ja}</span></a>` : '');
  return `<nav class="pager" aria-label="前後のページ">${a(prev, 'prev')}${a(next, 'next')}</nav>`;
}

/* ---------- 進行の行 ---------- */
function progRow(p, i) {
  const el = 'p-' + p.id, open = S.open.has(el);
  return `<article class="row${open ? ' is-open' : ''}" id="${el}">
  <div class="no">${pad(i + 1)}</div>
  <div class="nm"><button class="nm-btn" data-toggle="${el}" aria-expanded="${open}"><span class="t">${p.name}</span><span class="pm" aria-hidden="true"></span></button>
    <div class="k"><span class="en">Key ${keyLabel(p.mode)}</span> ・ ${p.mood}</div></div>
  <div class="cw">${chartHTML(p.bars, p.mode, 'p:' + p.id)}</div>
  <div class="act">${playBtn('p:' + p.id)}</div>
  ${open ? `<dl class="det"><dt>使い所</dt><dd>${p.use}</dd><dt>解説</dt><dd>${p.note}</dd>${p.vars.map(([lab, b]) => `<dt>変形</dt><dd><p>${lab}</p>${chartHTML(b, p.mode)}</dd>`).join('')}
    ${(p.songs || []).length ? `<dt>名前の由来</dt><dd>${p.songs.map(([t, a]) => `<p class="song"><span>${esc(t)} / ${esc(a)}</span>${extLinks(t + ' ' + a, t + ' ' + a)}</p>`).join('')}</dd>` : ''}
    <dt>曲を探す</dt><dd><p class="song">${extLinks(searchWord(p) + (p.cat === 'jazz' ? ' ジャズ' : ' 使われている曲'), searchWord(p))}<span class="note-s">この進行が使われている曲を、外部サイトで検索します</span></p></dd></dl>` : ''}
</article>`;
}
// 外部サイト(YouTube・Spotify)の検索ページへのリンク
const extLinks = (yt, sp) => `<a class="ext" href="https://www.youtube.com/results?search_query=${encodeURIComponent(yt)}" target="_blank" rel="noopener">YouTube</a><a class="ext" href="https://open.spotify.com/search/${encodeURIComponent(sp)}" target="_blank" rel="noopener">Spotify</a>`;
// 検索に使う言葉:「1645進行」のような数字の呼び名があればそれを使う
function searchWord(p) {
  const num = p.alias.find(a => /^\d{3,4}$/.test(a));
  if (num) return num + '進行';
  if (/^[ⅠⅡⅢⅣⅤⅥⅦ][ⅠⅡⅢⅣⅤⅥⅦm7–M]+ 進行$/.test(p.name)) return p.name.replace(/[^ⅠⅡⅢⅣⅤⅥⅦ]/g, '').replace(/[ⅠⅡⅢⅣⅤⅥⅦ]/g, ch => 'ⅠⅡⅢⅣⅤⅥⅦ'.indexOf(ch) + 1) + '進行';
  return p.name;
}

/* ---------- スケールの行 ---------- */
function scaleRow(sc, i) {
  const el = 's-' + sc.id, open = S.open.has(el), r = scaleOf(sc, S.key), pid = 's:' + sc.id;
  return `<article class="row${open ? ' is-open' : ''}" id="${el}">
  <div class="no">${pad(i + 1)}</div>
  <div class="nm"><button class="nm-btn" data-toggle="${el}" aria-expanded="${open}"><span class="t">${sc.name}</span><span class="pm" aria-hidden="true"></span></button>
    <div class="k"><span class="en">${sc.en}</span> ・ ${sc.feel}</div></div>
  <div class="cw"><div class="strip">${r.tones.map((t, j) => `<span data-pid="${pid}" data-si="${j}"><i>${t.label}</i><b>${t.name}</b></span>`).join('')}</div></div>
  <div class="act">${playBtn(pid)}</div>
  ${open ? `<dl class="det"><dt>合うコード</dt><dd>${sc.fit}</dd><dt>解説</dt><dd>${sc.note}</dd>
    <dt>譜面</dt><dd><div class="figs-s"><div>${staffScaleSVG(r, sc.name)}</div></div></dd>
    <dt>指板</dt><dd><div class="fbw">${fretSVG(scaleMarks(r, S.label), sc.name + ' の指板')}</div></dd></dl>` : ''}
</article>`;
}

/* ---------- ページ ---------- */
// ホーム:6つのページへの入口。ページの説明と、よく使う項目へのリンクを並べる
const HOME = [
  { id: 'progression', desc: 'J-POP・Jazz・終止・転調の進行を、度数と実際のコードで', links: () => CATS.map(([c, l]) => ['progression:@' + c, l, PROGS.filter(p => p.cat === c).length]) },
  { id: 'diatonic', desc: 'メジャーと3種類のマイナーの和音と機能', links: () => DIATONIC.map(d => ['diatonic:' + d.id, d.name]) },
  { id: 'chord', desc: 'セカンダリードミナントや裏コードなどの効かせ方', links: () => USES.slice(0, 5).map(u => ['chord:' + u.id, u.name]) },
  { id: 'tension', desc: 'コードごとに使えるテンションと、避ける音', links: () => [['tension:dom', '7(ドミナント)'], ['tension:M7', 'M7'], ['tension:m7', 'm7'], ['tension:guide', 'ドミナントの選び方']] },
  { id: 'scale', desc: 'モード・ペンタ・オルタードなどと、コードとの対応', links: () => [['scale:dorian', 'ドリアン'], ['scale:mixo', 'ミクソリディアン'], ['scale:minpenta', 'マイナーペンタ'], ['scale:altered', 'オルタード'], ['scale:map', '対応表']] },
  { id: 'analyze', desc: 'U-FRET の URL や ChordWiki から、曲の進行を分析', links: () => [['analyze:', 'URL を貼って分析']] },
];
function pageTop() {
  return `<div class="home-hd"><h1 class="eyebrow">Contents</h1></div>
    <ol class="home">${HOME.map((h, i) => {
      const pg = PAGES.find(p => p.id === h.id);
      return `<li class="home-row"><span class="no">${pad(i + 1)}</span>
        <a class="home-t" href="#${h.id}"><span class="en">${pg.en}${pg.n ? `<sup>${pg.n}</sup>` : ''}</span><span class="ja">${pg.ja}</span></a>
        <p class="home-d">${h.desc}</p>
        <div class="home-l">${h.links().map(([go, name, n]) => `<a href="#${go.split(':')[0]}" data-go="${go}">${name}${n != null ? `<sup>${n}</sup>` : ''}</a>`).join('')}</div>
        <a class="home-arw" href="#${h.id}" aria-label="${pg.ja}を開く"></a></li>`;
    }).join('')}</ol>`;
}
function pageProg() {
  let n = 0;
  const groups = SUBS[S.tab].map(([sid, name]) => ({ sid, name, list: PROGS.filter(p => p.cat === S.tab && p.sub === sid) })).filter(g => g.list.length);
  return crumb([['ホーム', '#top'], ['進行', '#progression'], [catName(S.tab)]]) + head('Progression', '進行', keyMeta()) +
    `<div class="tabs" role="tablist">${CATS.map(([id, lab]) => `<button role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${lab}<sup>${PROGS.filter(p => p.cat === id).length}</sup></button>`).join('')}</div>
     <nav class="subnav" aria-label="分類">${groups.map(g => `<button data-jump="g-${S.tab}-${g.sid}">${g.name}<sup>${g.list.length}</sup></button>`).join('')}</nav>
     ${S.tab === 'mod' ? '<p class="note-s">度数とコード名は転調前のキーで書いています</p>' : ''}
     ${groups.map(g => `<section class="pgrp" id="g-${S.tab}-${g.sid}"><h2 class="pgrp-h">${g.name}<sup>${g.list.length}</sup></h2>
       <div class="rows">${g.list.map(p => progRow(p, n++)).join('')}</div></section>`).join('')}` + pager('progression');
}
function pageDiatonic() {
  const d = DIATONIC.find(x => x.id === S.dmode) || DIATONIC[0];
  const toks = diatonicToks(d, S.dsize);
  const chords = toks.map(t => chordOf(t, S.key, d.mode));
  return crumb([['ホーム', '#top'], ['ダイアトニック', '#diatonic'], [d.name]]) + head('Diatonic', 'ダイアトニック', keyMeta(d.mode)) +
    `<div class="tabs" role="tablist">${DIATONIC.map(x => `<button role="tab" aria-selected="${x.id === d.id}" data-dmode="${x.id}">${x.name}</button>`).join('')}</div>
     <div class="bar-tools"><div class="seg" role="group" aria-label="和音の数"><button aria-pressed="${S.dsize === 3}" data-dsize="3">3和音</button><button aria-pressed="${S.dsize === 4}" data-dsize="4">4和音</button></div></div>
     <div class="dtw"><table class="dt">
      <thead><tr><th></th>${chords.map(c => `<th>${c.degree}</th>`).join('')}</tr></thead>
      <tbody>
       <tr><th>音階</th>${chords.map(c => `<td class="en">${c.root.name}</td>`).join('')}</tr>
       <tr><th>コード</th>${toks.map(t => `<td class="c">${chordBtn(t, d.mode).replace(/<span class="d">.*?<\/span>/, '')}</td>`).join('')}</tr>
       <tr><th>機能</th>${d.fn.map(f => `<td><span class="fn fn-${f}">${f}</span></td>`).join('')}</tr>
       <tr><th>構成音</th>${chords.map(c => `<td class="en">${c.tones.map(t => t.name).join(' ')}</td>`).join('')}</tr>
      </tbody></table></div>
     <div class="legend"><span>T トニック(落ち着く)</span><span>SD サブドミナント(広がる)</span><span>D ドミナント(戻りたくなる)</span></div>
     <p class="note-s">${d.sub}</p>` + pager('diatonic');
}
const TRI = { '4,7': '', '3,7': 'm', '3,6': 'dim', '4,8': 'aug' };
const SEV = { '4,7,11': 'M7', '4,7,10': '7', '3,7,10': 'm7', '3,6,10': 'm7(b5)', '3,6,9': 'dim7', '3,7,11': 'mM7', '4,8,11': 'augM7' };
const RN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function diatonicToks(d, size) {
  return d.s.map((root, i) => {
    const iv = k => mod(d.s[(i + k) % 7] - root, 12);
    const q = size === 3 ? TRI[[iv(2), iv(4)].join()] : SEV[[iv(2), iv(4), iv(6)].join()];
    const alt = root - MAJ[i];
    return (alt < 0 ? 'b' : alt > 0 ? '#' : '') + RN[i] + q;
  });
}
function pageChord() {
  return crumb([['ホーム', '#top'], ['コードの使い所']]) + head('Chord', 'コードの使い所', keyMeta()) +
    `<div class="rows">${USES.map((u, i) => `<section class="blk" id="u-${u.id}"><div class="no">${pad(i + 1)}</div>
      <div><h2>${u.name}</h2><p class="lead">${u.lead}</p><p class="body">${u.body}</p></div>
      <div class="blk-r"><div><div class="sub-h">代表的なコード</div><div class="mem">${u.list.map(([lab, t]) => chordBtn(t, 'major', lab)).join('')}</div></div>
       <div>${u.ex.map(([lab, b, m]) => `<div class="ex"><div class="sub-h">例:${lab}</div>${chartHTML(b, m || 'major')}</div>`).join('')}</div></div>
    </section>`).join('')}</div>` + pager('chord');
}
function tensionTable(c) {
  const stw = { ok: '使える', cond: '条件付き', avoid: '避ける' };
  return `<table class="tt"><tbody>${tensionsOf(c).map(t => `<tr><td class="c1">${t.lab}</td><td class="c2">${t.name}</td><td class="c3 st-${t.st}">${stw[t.st]}</td><td class="c4">${t.note}</td></tr>`).join('')}</tbody></table>`;
}
function pageTension() {
  const scName = id => SCALES.find(s => s.id === id).name;
  return crumb([['ホーム', '#top'], ['テンション']]) + head('Tension', 'テンション', keyMeta()) +
    `<p class="note-s">キーの主音をルートにして表示しています。「避ける」はコードの音と半音でぶつかる音(アボイドノート)。</p>
     <div class="rows">${TENSION_ITEMS.map((t, i) => {
       const c = chordOf('I' + t.q, S.key, 'major');
       return `<section class="blk" id="t-${t.id}"><div class="no">${pad(i + 1)}</div>
        <div><h2>${t.name}</h2><p class="lead">${t.lead}</p></div>
        <div class="blk-r"><div><div class="sub-h">${c.name} のテンション</div>${tensionTable(c)}</div>
         <div><div class="sub-h">よく使う形</div><div class="mem">${t.forms.map(q => chordBtn('I' + q, 'major')).join('')}</div></div></div>
       </section>`;
     }).join('')}
     <section class="blk" id="t-guide"><div class="no">${pad(TENSION_ITEMS.length + 1)}</div>
      <div><h2>ドミナントのテンションの選び方</h2><p class="lead">Ⅴ7 などのドミナント7th は、どこへ進むかでテンションとスケールを選ぶ。</p>
       <p class="body">迷ったら、メジャーへ進むなら 9・13、マイナーへ進むなら ♭9・♭13。</p></div>
      <div class="blk-r"><table class="tt"><thead><tr><th>場面</th><th>例</th><th>テンション</th><th>スケール</th></tr></thead><tbody>
       ${DOM_GUIDE.map(([scene, t, ten, sc]) => `<tr><td class="c4" style="color:var(--ink)">${scene}</td><td style="width:96px">${chordBtn(t, 'major')}</td><td class="en">${ten}</td><td><a href="#scale" data-go="scale:${sc}">${scName(sc)}</a></td></tr>`).join('')}
      </tbody></table></div></section></div>` + pager('tension');
}
function pageScale() {
  const scName = id => SCALES.find(s => s.id === id).name;
  return crumb([['ホーム', '#top'], ['スケール']]) + head('Scale', 'スケール', keyMeta()) +
    `<div class="bar-tools"><span class="note-s">キーの主音から始めて表示しています</span>${labelSeg()}</div>
     <div class="rows">${SCALES.map(scaleRow).join('')}</div>
     <section class="sec" id="s-map" style="scroll-margin-top:150px"><div class="eyebrow">Chord-Scale</div><h2>コードとスケールの対応表</h2>
      <table class="tt"><thead><tr><th>コード</th><th>スケール</th><th>場面</th></tr></thead><tbody>
       ${SCALE_MAP.map(([t, m, sc, scene]) => `<tr><td style="width:120px">${chordBtn(t, m)}</td><td><a href="#scale" data-go="scale:${sc}">${scName(sc)}</a></td><td class="c4">${scene}</td></tr>`).join('')}
      </tbody></table></section>` + pager('scale');
}

/* ---------- 分析のページ ---------- */
const anaShift = () => (S.ana ? mod(S.key - S.ana.key.pc, 12) : 0);
const anaKp = b => (S.av === 'sel' ? mod(b.key.pc + anaShift(), 12) : b.key.pc);
const anaKeyName = (b, kp) => S.av === 'sel' ? tonicName(kp, b.key.mode) + (b.key.mode === 'minor' ? 'm' : '') : b.key.name;
function setSong(song) {
  S.song = song;
  try { S.ana = Analyzer.analyzeSong(song); } catch (e) { S.ana = null; S.anaErr = e.message; }
  store.set('last', song);
}
async function importUrl(url) {
  S.impUrl = url; S.anaErr = ''; S.anaBusy = true; render();
  try {
    const r = await fetch('/api/import?url=' + encodeURIComponent(url));
    let j = null;
    try { j = await r.json(); } catch (e) { /* JSON でないとき */ }
    if (!r.ok || !j) throw new Error(j && j.error ? j.error : r.status === 404
      ? '読み込み用のサーバーが見つかりません。このサイトを Render の「Web サービス」として公開しているか確かめてください(README の手順)。'
      : '曲のページを読み込めませんでした。少し待ってから、もう一度試してください。');
    setSong(j);
    S.scrollTo = 'a-res';
  } catch (e) {
    S.anaErr = e instanceof TypeError
      ? '読み込み用のサーバーにつながりませんでした。インターネット接続を確かめてください。パソコンで index.html を直接開いているときは、この機能は使えません。'
      : e.message;
  } finally { S.anaBusy = false; render(); }
}
function analyzePasted() {
  const t = $('#impText') ? $('#impText').value : S.pasteText;
  S.pasteText = t; S.anaErr = '';
  const song = Analyzer.parsePasted(t);
  if (!song.sections.length) { S.anaErr = 'コードが見つかりませんでした。「C G Am F」や「[C]歌詞」の形で貼り付けてください。'; render(); return; }
  setSong(song); S.scrollTo = 'a-res'; render();
}
const SRC = { ufret: 'U-FRET', chordwiki: 'ChordWiki', paste: '貼り付け' };
function pageAnalyze() {
  if (S.song && !S.ana && !S.anaErr) { try { S.ana = Analyzer.analyzeSong(S.song); } catch (e) { S.ana = null; } }
  const r = S.ana;
  let h = crumb([['ホーム', '#top'], ['分析']]) + head('Analyze', '分析', r ? `Key<b>${esc(r.key.name)}</b>` : '');
  h += `<form class="imp" id="impForm" autocomplete="off" novalidate>
    <label class="sub-h" for="impUrl">U-FRET の曲のページの URL</label>
    <div class="imp-row"><input id="impUrl" type="url" inputmode="url" placeholder="https://www.ufret.jp/song.php?data=…" value="${esc(S.impUrl)}">
      <button class="btn-dark" type="submit"${S.anaBusy ? ' disabled' : ''}>${S.anaBusy ? '読み込み中' : '分析する'}<span class="arw r" aria-hidden="true"></span></button></div>
    <p class="note-s">歌詞は読み込まず、コードだけを使います。ChordWiki はサーバーから読めないので、下のブックマークレットか貼り付けを使います。</p>
    ${S.anaErr ? `<p class="err" role="alert">${esc(S.anaErr)}</p>` : ''}
    <button type="button" class="lnk" data-paste-toggle aria-expanded="${S.anaPaste}">コードを貼り付けて分析する</button>
    <div class="bmk"><div class="sub-h">ブックマークレット(U-FRET・ChordWiki)</div>
      <div class="bmk-row"><a class="bm" href="${esc(bookmarkletHref(location.origin))}" data-bm title="ブックマークバーにドラッグして登録">CHORD NOTE で分析</a>
      <p class="note-s">この枠をブックマークバーへドラッグして登録します。U-FRET か ChordWiki の曲のページを開いて押すと、ここで分析します。</p></div>
      <button type="button" class="lnk" data-bm-copy>スマホで登録する(コードをコピー)</button>
      ${S.bmNote ? `<p class="note-s" role="status">${esc(S.bmNote)}</p>` : ''}</div>
    ${S.anaPaste ? `<div class="paste"><textarea id="impText" rows="7" placeholder="例&#10;[Aメロ]&#10;C G Am F&#10;FM7 G7 Em7 Am">${esc(S.pasteText)}</textarea><button type="button" class="sbtn" data-paste-go>貼り付けたコードを分析する</button></div>` : ''}
  </form>`;
  if (r) h += anaResult(r);
  return h + pager('analyze');
}
function anaResult(r) {
  const sg = S.song;
  const selName = tonicName(mod(r.key.pc + anaShift(), 12), r.key.mode) + (r.key.mode === 'minor' ? 'm' : '');
  let h = `<section class="song-hd" id="a-res">
    <div class="song-t"><div class="eyebrow">Song</div><h2>${esc(sg.title || '貼り付けたコード')}</h2>
      <p class="note-s">${esc(sg.artist)}${sg.artist ? ' ・ ' : ''}${SRC[sg.source] || ''}${sg.url ? ` ・ <a href="${esc(sg.url)}" target="_blank" rel="noopener">元のページ</a>` : ''}</p></div>
    <div class="song-act"><div class="seg" role="group" aria-label="譜面のキー"><button aria-pressed="${S.av === 'orig'}" data-av="orig">原曲キー ${esc(r.key.name)}</button><button aria-pressed="${S.av === 'sel'}" data-av="sel">選んだキー ${esc(selName)}</button></div></div></section>`;
  // 譜面の中の位置:b.seq(同じコードの連続を1つにした並び)の番号 → b.items の範囲
  const spans = r.blocks.map(b => {
    const start = b.seq.map(x => b.items.indexOf(x));
    return (at, len) => [start[at], (start[at + len] != null ? start[at + len] : b.items.length) - 1];
  });
  // 流れ
  h += `<section class="sec"><div class="eyebrow">Flow</div><h2>流れ</h2>
    <div class="flow-sum">${r.flow.summary.map(l => `<p>${esc(l)}</p>`).join('')}</div>
    <ol class="flow">${r.flow.blocks.map((b, i) => `<li><span class="no">${pad(i + 1)}</span><button class="flow-l" data-jump="a-b${i}">${esc(b.label)}</button><span class="grp">${esc(b.group)}</span><p>${esc(b.text)}</p></li>`).join('')}</ol></section>`;
  // 聴きどころ
  h += `<section class="sec"><div class="eyebrow">Highlights</div><h2>聴きどころ</h2>
    <ol class="hl">${r.highlights.map((x, i) => `<li><span class="no">${pad(i + 1)}</span><p>${esc(x.text)}</p>${x.go ? `<a href="#${x.go.split(':')[0]}" data-go="${x.go}">理論を見る</a>` : '<span></span>'}</li>`).join('')}</ol></section>`;
  // 譜面
  h += `<section class="sec"><div class="eyebrow">Sheet</div><h2>譜面</h2>
    <p class="note-s legend2"><span class="mk-br">線</span>知られている進行 <span class="mk-a">下線</span>技法が見つかったコード <span class="mk-o">点線</span>ダイアトニック以外</p>`;
  r.blocks.forEach((b, bi) => {
    const kp = anaKp(b), pid = 'a:' + bi, span = spans[bi];
    const marks = new Map();
    b.tech.filter(t => t.kind !== 'perfect').forEach(t => b.seq.slice(t.at, t.at + t.len).forEach(x => marks.set(x, (marks.get(x) || []).concat(Analyzer.KIND[t.kind].name))));
    // 進行のくくり(D):項目の番号 → どの進行の範囲か
    const brs = b.progs.map(p => { const [a, z] = span(p.from, p.to - p.from + 1); return { a, z, p }; });
    const brOf = ii => brs.find(x => ii >= x.a && ii <= x.z);
    const lines = [];
    b.items.forEach((x, ii) => { (lines[x.li] = lines[x.li] || []).push([x, ii]); });
    h += `<div class="ablk" id="a-b${bi}"><div class="ablk-h"><span class="no">${pad(bi + 1)}</span><b>${esc(r.flow.blocks[bi].label)}</b><span class="grp">${esc(b.group)}</span>
      <span class="note-s">Key ${esc(anaKeyName(b, kp))}</span>
      ${playBtn(pid)}</div>
      ${lines.filter(Boolean).map(line => `<div class="aline${line.some(([, ii]) => brOf(ii)) ? ' has-br' : ''}">${line.map(([x, ii], k) => {
        const br = brOf(ii);
        // くくりの両端の印は、進行の本当の始まりと終わりだけ(行をまたぐときは途中を開いたままにする)
        const brc = br ? ` br${ii === br.a ? ' br-s' : ''}${ii === br.z ? ' br-e' : ''}` : '';
        const brl = br && ii === br.a ? `<a class="br-l" href="#progression" data-go="progression:${br.p.id}">${esc(br.p.name)}</a>` : '';
        if (x.bad) return `<div class="cell${brc}">${brl}<span class="ch bad" data-pid="${pid}" data-ci="${ii}"><span class="d">?</span><span class="n">${esc(x.sym)}</span></span></div>`;
        const name = S.av === 'sel' ? chordOf(x.tok, kp, b.key.mode).name : Analyzer.pretty(x.sym);
        const mk = marks.get(x);
        return `<div class="cell${brc}">${brl}<button class="ch${mk ? ' is-mark' : !x.dia ? ' is-out' : ''}" data-tok="${esc(x.tok)}" data-mode="${b.key.mode}" data-kp="${kp}" data-pid="${pid}" data-ci="${ii}" title="${esc(mk ? mk.join('・') : name)}"><span class="d">${esc(x.deg)}</span><span class="n">${esc(name)}</span></button></div>`;
      }).join('')}</div>`).join('')}</div>`;
  });
  h += `</section>`;
  // 技法の一覧
  const byKind = {};
  r.tech.forEach(t => (byKind[t.kind] = byKind[t.kind] || []).push(t));
  const kinds = Object.keys(byKind).sort((a, b) => Analyzer.KIND[b].w - Analyzer.KIND[a].w);
  h += `<section class="sec"><div class="eyebrow">Techniques</div><h2>使われている技法</h2>
    ${kinds.length || r.mods.length ? `<table class="tt"><thead><tr><th>技法</th><th>回数</th><th>場所</th><th>コード(度数)</th></tr></thead><tbody>
    ${r.mods.map(m => `<tr><td>${m.go ? `<a href="#progression" data-go="${m.go}">転調(${esc(m.name)})</a>` : `転調(${esc(m.name)})`}</td><td class="en">1</td><td class="c4">ブロック${m.block + 1}</td><td class="c4">${esc(m.from.name)} → ${esc(m.to.name)}</td></tr>`).join('')}
    ${kinds.map(k => { const list = byKind[k], K = Analyzer.KIND[k]; return `<tr><td><a href="#${K.go.split(':')[0]}" data-go="${K.go}">${K.name}</a></td><td class="en">${list.length}</td><td class="c4">${[...new Set(list.map(t => t.block + 1))].map(n => 'ブロック' + n).join('・')}</td><td class="c4">${esc([...new Set(list.map(t => t.label))].slice(0, 4).join('、'))}</td></tr>`; }).join('')}
    </tbody></table>` : '<p class="note-s">特別な技法は見つかりませんでした。</p>'}</section>`;
  return h;
}

function render() {
  const pg = pageOf();
  renderNav();
  const view = $('#view');
  view.innerHTML = { top: pageTop, progression: pageProg, diatonic: pageDiatonic, chord: pageChord, tension: pageTension, scale: pageScale, analyze: pageAnalyze }[pg]();
  if (S.scrollTo) {
    const el = document.getElementById(S.scrollTo);
    S.scrollTo = null;
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('is-flash'); }
  }
  markCurrent();
}
function rerenderRow(el) {
  const node = document.getElementById(el);
  if (!node) return;
  const i = parseInt(node.querySelector('.no').textContent, 10) - 1;
  if (el.startsWith('p-')) node.outerHTML = progRow(PROGS.find(p => 'p-' + p.id === el), i);
  else node.outerHTML = scaleRow(SCALES.find(s => 's-' + s.id === el), i);
  markCurrent();
}

/* ---------- コード詳細パネル ---------- */
function openPanel(tok, mode, kp) {
  S.panel = { tok, mode, kp };   // kp:分析の譜面から開いたときだけ、その曲のキー
  renderPanel();
  $('#panel').hidden = false;
  document.body.classList.add('has-panel');
  markCurrent();
}
function closePanel() {
  S.panel = null;
  $('#panel').hidden = true;
  document.body.classList.remove('has-panel');
  markCurrent();
}
function markCurrent() {
  $$('.ch.is-current').forEach(b => b.classList.remove('is-current'));
  if (!S.panel) return;
  $$(`.ch[data-tok="${CSS.escape(S.panel.tok)}"][data-mode="${S.panel.mode}"]`).forEach(b => b.classList.add('is-current'));
}
function renderPanel() {
  if (!S.panel) return;
  const kp = S.panel.kp != null ? S.panel.kp : S.key;
  const c = chordOf(S.panel.tok, kp, S.panel.mode);
  $('#panel').innerHTML = `
  <div class="p-hd"><span class="eyebrow">Chord</span><button class="p-close" data-close>閉じる</button></div>
  <div class="p-title"><div><h2>${c.name}</h2><div class="p-meta"><span>${c.degree}</span><span>Key <span class="en">${tonicName(kp, S.panel.mode) + (S.panel.mode === 'minor' ? 'm' : '')}</span></span></div></div>
    <button class="sbtn" data-playchord><i class="tri"></i>再生</button></div>
  <table class="tones"><tr><th>音名</th>${c.tones.map(t => `<td>${t.name}</td>`).join('')}</tr><tr><th>度数</th>${c.tones.map(t => `<td>${t.label}</td>`).join('')}</tr></table>
  ${c.bass ? `<p class="p-note">ベースは ${c.bass.name}${c.bass.label ? `(${c.bass.label})` : ''}。押さえ方は上の ${c.root.name}${Q[c.q].d} の形。</p>` : ''}
  <div class="p-sec"><span class="p-h">譜面と押さえ方</span>${labelSeg()}</div>
  <div class="figs">
    <figure>${staffChordSVG(c)}<figcaption>五線譜</figcaption></figure>
    <figure>${diagSVG(c, 6, S.label)}<figcaption>6弦ルート</figcaption></figure>
    <figure>${diagSVG(c, 5, S.label)}<figcaption>5弦ルート</figcaption></figure>
  </div>
  <div class="p-sec"><span class="p-h">指板<small>0–15f</small></span></div>
  <div class="fbw">${fretSVG(chordMarks(c, S.label), c.name + ' の指板')}</div>
  <div class="p-sec"><span class="p-h">テンション</span></div>
  ${tensionTable(c)}`;
}

/* ---------- 音 ---------- */
Organ.onStop = id => {
  $$(`[data-pid="${id}"].is-playing`).forEach(x => x.classList.remove('is-playing'));
  setPlayBtn(id, false);
};
function setPlayBtn(id, on) {
  $$(`[data-play="${CSS.escape(id)}"]`).forEach(b => (b.innerHTML = on ? '<i class="sq"></i>停止' : '<i class="tri"></i>再生'));
}
function highlight(id, attr, i) {
  $$(`[data-pid="${id}"].is-playing`).forEach(x => x.classList.remove('is-playing'));
  const el = document.querySelector(`[data-pid="${id}"][${attr}="${i}"]`);
  if (el) el.classList.add('is-playing');
}
function play(id) {
  const [kind, key] = id.split(':');
  let steps, attr;
  if (kind === 'a') {
    const b = S.ana && S.ana.blocks[+key];
    if (!b) return;
    const kp = anaKp(b);
    steps = b.items.map(x => ({ midis: x.bad ? [] : Organ.voicing(chordOf(x.tok, kp, b.key.mode)), dur: 0.8 }));
    Organ.sequence(id, steps, i => highlight(id, 'data-ci', i));
    if (Organ.playingId === id) setPlayBtn(id, true);
    return;
  }
  if (kind === 'p') {
    const p = PROGS.find(x => x.id === key), BAR = 1.4;
    steps = [];
    p.bars.split('|').forEach(b => {
      const toks = b.trim().split(/\s+/);
      toks.forEach(t => steps.push({ midis: Organ.voicing(chordOf(t, S.key, p.mode)), dur: BAR / toks.length }));
    });
    attr = 'data-ci';
  } else {
    const sc = SCALES.find(x => x.id === key), r = scaleOf(sc, S.key);
    const base = 55 + mod(r.root.pc - 7, 12);
    const up = [...r.tones.map((t, j) => ({ m: base + t.semi, j })), { m: base + 12, j: 0 }];
    const seq = [...up, ...up.slice(0, -1).reverse()];
    steps = seq.map(x => ({ midis: [x.m], dur: 0.26, j: x.j }));
    attr = 'data-si';
    const js = steps.map(s => s.j);
    const was = Organ.playingId;
    Organ.sequence(id, steps, i => highlight(id, attr, js[i]));
    if (Organ.playingId === id) setPlayBtn(id, true); else if (was) setPlayBtn(was, false);
    return;
  }
  Organ.sequence(id, steps, i => highlight(id, attr, i));
  if (Organ.playingId === id) setPlayBtn(id, true);
}

/* ---------- 検索 ---------- */
const SEARCH = [];
function buildSearch() {
  PROGS.forEach(p => {
    const deg = p.bars.split('|').join(' ').trim().split(/\s+/).map(degLabel).join(' ');
    SEARCH.push({ label: p.name, sub: '進行 / ' + catName(p.cat), hay: [p.name, ...p.alias, deg, catName(p.cat), p.mood].join(' '), go: ['progression', p.id] });
  });
  DIATONIC.forEach(d => SEARCH.push({ label: d.name, sub: 'ダイアトニック', hay: 'ダイアトニック ' + d.name, go: ['diatonic', d.id] }));
  USES.forEach(u => SEARCH.push({ label: u.name, sub: 'コードの使い所', hay: u.name + ' ' + u.lead, go: ['chord', u.id] }));
  TENSION_ITEMS.forEach(t => SEARCH.push({ label: t.name, sub: 'テンション', hay: 'テンション ' + t.name, go: ['tension', t.id] }));
  SEARCH.push({ label: 'ドミナントのテンションの選び方', sub: 'テンション', hay: 'ドミナント テンション オルタード', go: ['tension', 'guide'] });
  SCALES.forEach(s => SEARCH.push({ label: s.name, sub: 'スケール', hay: [s.name, s.en, s.fit].join(' '), go: ['scale', s.id] }));
  SEARCH.push({ label: 'コードとスケールの対応表', sub: 'スケール', hay: 'コードスケール 対応表', go: ['scale', 'map'] });
  SEARCH.push({ label: '曲の分析', sub: '分析', hay: '分析 曲 u-fret ufret chordwiki コード譜 url', go: ['analyze', ''] });
  SEARCH.forEach(x => (x.hay = x.hay.toLowerCase()));
}
let lastResults = [];
function showResults(input, box) {
  const q = input.value.trim().toLowerCase();
  if (!q) { box.hidden = true; lastResults = []; return; }
  lastResults = SEARCH.filter(x => x.hay.includes(q)).slice(0, 16);
  box.innerHTML = lastResults.length
    ? lastResults.map((r, i) => `<button data-res="${i}"${i === 0 ? ' class="is-active"' : ''}><span>${r.label}</span><small>${r.sub}</small></button>`).join('')
    : '<div class="none">見つかりません</div>';
  box.hidden = false;
}
function clearSearch() { ['#q', '#q2'].forEach(s => ($(s).value = '')); ['#qr', '#qr2'].forEach(s => ($(s).hidden = true)); lastResults = []; }

/* ---------- 移動 ---------- */
function go(page, id) {
  closeOverlays();
  if (page === 'diatonic') { S.dmode = id; store.set('dmode', id); }
  else if (page === 'progression' && id && id[0] === '@') {
    const [cat, sid] = id.slice(1).split('.');
    S.tab = cat; store.set('tab', cat);
    if (sid) S.scrollTo = `g-${cat}-${sid}`;
  }
  else if (id && PREFIX[page]) {
    const el = PREFIX[page] + id;
    S.scrollTo = el;
    if (page === 'progression') { S.tab = PROGS.find(p => p.id === id).cat; store.set('tab', S.tab); S.open.add(el); }
    if (page === 'scale' && id !== 'map') S.open.add(el);
  }
  if (pageOf() !== page) location.hash = page;
  else { render(); if (!S.scrollTo) window.scrollTo(0, 0); }
}
function closeOverlays() {
  $('#drawer').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false');
  clearSearch();
}

/* ---------- 操作 ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,a');
  if (!t) { if (!e.target.closest('.search')) $('#qr').hidden = true; return; }
  const d = t.dataset;
  if (d.key != null) {
    S.key = +d.key; store.set('key', S.key); Organ.stop();
    renderKeys(); render(); renderPanel();
    return;
  }
  if (d.tok) { const kp = d.kp != null ? +d.kp : null; Organ.chord(chordOf(d.tok, kp != null ? kp : S.key, d.mode)); openPanel(d.tok, d.mode, kp); return; }
  if (d.play) { play(d.play); return; }
  if (d.toggle) { S.open.has(d.toggle) ? S.open.delete(d.toggle) : S.open.add(d.toggle); rerenderRow(d.toggle); return; }
  if (d.tab) { S.tab = d.tab; store.set('tab', S.tab); Organ.stop(); render(); return; }
  if (d.dsize) { S.dsize = +d.dsize; store.set('dsize', S.dsize); render(); return; }
  if (d.dmode && !d.go) { S.dmode = d.dmode; store.set('dmode', S.dmode); render(); return; }
  if (d.label) { S.label = d.label; store.set('label', S.label); renderPanel(); if (pageOf() === 'scale') render(); return; }
  if (d.close != null) { closePanel(); return; }
  if (d.playchord != null) { Organ.chord(chordOf(S.panel.tok, S.panel.kp != null ? S.panel.kp : S.key, S.panel.mode)); return; }
  if (d.av) { S.av = d.av; render(); return; }
  if (d.pasteToggle != null) { S.anaPaste = !S.anaPaste; render(); if (S.anaPaste) $('#impText').focus(); return; }
  if (d.pasteGo != null) { analyzePasted(); return; }
  if (d.bm != null) { e.preventDefault(); S.bmNote = 'この枠は押すのではなく、ブックマークバーへドラッグして登録します。'; render(); return; }
  if (d.bmCopy != null) {
    const href = bookmarkletHref(location.origin);
    const done = () => { S.bmNote = 'コピーしました。ブラウザでこのページをブックマークに追加し、その「URL(アドレス)」の欄を、コピーした文字に置き換えて保存してください。名前は「CHORD NOTE で分析」などにします。'; render(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(href).then(done, () => { S.bmNote = 'コピーできませんでした。PC でブックマークバーへドラッグして登録してください。'; render(); });
    else { S.bmNote = 'このブラウザではコピーできません。PC でブックマークバーへドラッグして登録してください。'; render(); }
    return;
  }
  if (d.dr) { S.drOpen = S.drOpen === d.dr ? null : d.dr; renderNav(); return; }
  if (d.jump) { const el = document.getElementById(d.jump); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1700); } return; }
  if (d.go) { e.preventDefault(); const [pg, id] = d.go.split(':'); go(pg, id); return; }
  if (d.res != null) { const r = lastResults[+d.res]; if (r) go(...r.go); return; }
  if (t.id === 'menuBtn') { $('#drawer').hidden = false; t.setAttribute('aria-expanded', 'true'); $('#q2').focus({ preventScroll: true }); return; }
  if (d.drawerClose != null) { closeOverlays(); return; }
  if (t.tagName === 'A' && (t.getAttribute('href') || '').startsWith('#')) closeOverlays();
});
[['#q', '#qr'], ['#q2', '#qr2']].forEach(([i, b]) => {
  const input = $(i), box = $(b);
  input.addEventListener('input', () => showResults(input, box));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && lastResults[0]) { e.preventDefault(); go(...lastResults[0].go); } });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#panel').hidden) closePanel(); closeOverlays(); }
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'impForm') return;
  e.preventDefault();
  const v = $('#impUrl').value.trim();
  if (!v) { S.anaErr = 'URL を入れてください。'; render(); return; }
  if (/chordwiki\.org/i.test(v)) { S.impUrl = v; S.anaErr = 'ChordWiki は、相手のサイトの仕組み(Cloudflare)でサーバーから読み込めません。下の「ブックマークレット」を使うか、ページのコードを「貼り付け」てください。'; render(); return; }
  if (!S.anaBusy) importUrl(v);
});
document.addEventListener('input', e => {
  if (e.target.id === 'impUrl') S.impUrl = e.target.value;
  if (e.target.id === 'impText') S.pasteText = e.target.value;
});
// ブックマークレットから来たとき:# の後ろの曲データ(コードだけ)を読む
function takeHashSong() {
  const h = location.hash;
  if (!h.startsWith('#analyze=')) return false;
  let song = null;
  try { song = cleanSong(JSON.parse(decodeURIComponent(h.slice('#analyze='.length)))); } catch (e) { song = null; }
  history.replaceState(null, '', '#analyze');
  if (!song) { S.anaErr = 'ブックマークレットから受け取ったデータを読めませんでした。'; return true; }
  S.anaErr = ''; S.impUrl = song.url || '';
  setSong(song); S.scrollTo = 'a-res';
  return true;
}
// 受け取ったデータの形と大きさを確かめる(よその人が作ったリンクでも安全なように)
function cleanSong(x) {
  if (!x || !Array.isArray(x.sections)) return null;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  let total = 0;
  const sections = x.sections.slice(0, 200).map(sec => ({
    label: str(sec && sec.label, 40),
    lines: (Array.isArray(sec && sec.lines) ? sec.lines : []).slice(0, 200)
      .map(l => (Array.isArray(l) ? l : []).slice(0, 40).map(c => str(c, 24).trim()).filter(c => c && (total++ < 4000))).filter(l => l.length),
  })).filter(sec => sec.lines.length);
  if (!sections.length) return null;
  const url = /^https:\/\/[^\s]+$/.test(String(x.url || '')) ? str(x.url, 300) : '';
  const source = ['ufret', 'chordwiki'].includes(x.source) ? x.source : 'paste';
  return { title: str(x.title, 100), artist: str(x.artist, 100), source, url, keyHint: '', sections };
}
window.addEventListener('hashchange', () => {
  takeHashSong();
  const keep = !!S.scrollTo;
  Organ.stop(); closeOverlays(); render();
  if (!keep) window.scrollTo(0, 0);
});
function setHdh() { document.documentElement.style.setProperty('--hdh', ($('#hd > .wrap').offsetHeight + 1) + 'px'); }
window.addEventListener('resize', setHdh);

buildSearch();
renderKeys();
takeHashSong();
render();
setHdh();
if (document.fonts) document.fonts.ready.then(setHdh);
