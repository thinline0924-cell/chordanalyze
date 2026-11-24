/* =========================================================
   曲のページからコードだけを取り出す(サーバー側で使う)
   歌詞は著作物なので、ここで捨てて画面には送らない
   対応:U-FRET(www.ufret.jp/song.php?data=数字)
   ChordWiki はプログラムからの読み込みを止めているので、ここでは扱わない(js/bookmarklet.js で読む)
   ========================================================= */

// 貼られた URL を調べて、読みに行く URL を決める。対応外ならエラー
function checkUrl(raw) {
  // 共有でコピーすると「曲名 / 歌手 … https://…」のように文字が付くので、文章の中から URL だけを取り出す
  const text = String(raw || '').replace(/[\u3000\s]+/g, ' ').trim();
  const found = /https?:\/\/[^\s"'<>「」『』()()、。]+/i.exec(text);
  let u;
  try { u = new URL(found ? found[0] : text); } catch (e) { throw userError('URL が見つかりません。曲のページのアドレス(https:// で始まるもの)を貼ってください。'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw userError('URL の形になっていません。');
  const host = u.hostname.toLowerCase();
  if (host === 'www.ufret.jp' || host === 'ufret.jp' || host === 'm.ufret.jp') {
    const id = u.searchParams.get('data') || '';
    if (u.pathname === '/song.php' && /^\d{1,8}$/.test(id)) return { kind: 'ufret', url: 'https://www.ufret.jp/song.php?data=' + id };
    throw userError('U-FRET の曲のページ(song.php?data=… で終わるアドレス)を貼ってください。');
  }
  if (/(^|\.)chordwiki\.org$/.test(host)) {
    // ChordWiki はプログラムからの読み込みを Cloudflare で止めているので、サーバーからは読みに行かない
    throw userError('ChordWiki は、相手のサイトの仕組み(Cloudflare)でサーバーから読み込めません。分析ページの「ブックマークレット」か「貼り付け」を使ってください。');
  }
  throw userError('URL で読み込めるのは U-FRET の曲のページです。ChordWiki はブックマークレットか貼り付けを使ってください。');
}
function userError(msg) { const e = new Error(msg); e.user = true; return e; }

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
const stripTags = s => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const isNC = c => /^N\.?\s*C\.?$/i.test(c.trim());

// sections: [{ label, lines: [[コード, …], …] }]
function pushLine(sections, chords) {
  if (!sections.length) sections.push({ label: '', lines: [] });
  sections[sections.length - 1].lines.push(chords);
}
function newSection(sections, label) {
  const last = sections[sections.length - 1];
  if (last && !last.lines.length) { if (label) last.label = label; return; }
  sections.push({ label: label || '', lines: [] });
}
const cleanSections = sections => sections.filter(s => s.lines.length);

/* ---------- U-FRET ----------
   ページの中に ufret_chord_datas = ["[C]歌詞[G]歌詞\r", …] がある。空の行がブロックの区切り */
function parseUfret(html) {
  const m = /ufret_chord_datas\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!m) return null;
  let arr;
  try { arr = JSON.parse(m[1]); } catch (e) { return null; }
  const sections = [];
  arr.forEach(line => {
    const chords = [...String(line).matchAll(/\[([^\]]*)\]/g)].map(x => x[1].trim()).filter(c => c && !isNC(c));
    const text = String(line).replace(/\[[^\]]*\]/g, '').trim();
    if (!chords.length && !text) newSection(sections, '');
    else if (chords.length) pushLine(sections, chords);
  });
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
  let title = '', artist = '';
  if (t) {
    const head = stripTags(t[1]).split(/\s+ギターコード|\s+-\s+U-FRET/)[0];
    const i = head.lastIndexOf(' / ');
    if (i > 0) { title = head.slice(0, i).trim(); artist = head.slice(i + 3).trim(); } else title = head.trim();
  }
  return { title, artist, keyHint: '', sections: cleanSections(sections) };
}

function parsePage(kind, html) {
  const r = parseUfret(html);
  if (!r || !r.sections.length) throw userError('このページからコードを見つけられませんでした。相手のサイトのページの作りが変わった可能性があります。');
  return r;
}

module.exports = { checkUrl, parsePage, parseUfret };
