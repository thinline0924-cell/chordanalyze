/* =========================================================
   曲のページからコードだけを取り出す(サーバー側で使う)
   歌詞は著作物なので、ここで捨てて画面には送らない
   対応:U-FRET(www.ufret.jp/song.php?data=数字)
         ChordWiki(ch.chordwiki.org/wiki.cgi?...&t=曲名)
   ========================================================= */

// 貼られた URL を調べて、読みに行く URL を決める。対応外ならエラー
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { throw userError('URL の形になっていません。曲のページのアドレスをそのまま貼ってください。'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw userError('URL の形になっていません。');
  const host = u.hostname.toLowerCase();
  if (host === 'www.ufret.jp' || host === 'ufret.jp' || host === 'm.ufret.jp') {
    const id = u.searchParams.get('data') || '';
    if (u.pathname === '/song.php' && /^\d{1,8}$/.test(id)) return { kind: 'ufret', url: 'https://www.ufret.jp/song.php?data=' + id };
    throw userError('U-FRET の曲のページ(song.php?data=… で終わるアドレス)を貼ってください。');
  }
  if (host === 'ch.chordwiki.org') {
    const t = u.searchParams.get('t') || '';
    if (u.pathname === '/wiki.cgi' && t && t.length <= 200) return { kind: 'chordwiki', url: 'https://ch.chordwiki.org/wiki.cgi?c=view&t=' + encodeURIComponent(t) };
    throw userError('ChordWiki の曲のページ(wiki.cgi?…&t=曲名 のアドレス)を貼ってください。');
  }
  throw userError('対応しているのは U-FRET と ChordWiki の曲のページです。');
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

/* ---------- ChordWiki ----------
   <p class="line"><span class="chord">C</span><span class="word">歌詞</span>…</p>
   <p class="comment">サビ</p> が見出し。空の行がブロックの区切り */
function parseChordWiki(html) {
  const sections = [];
  let found = false;
  const re = /<p\s+class="(line|comment)"[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    found = true;
    if (m[1].toLowerCase() === 'comment') { newSection(sections, stripTags(m[2]).slice(0, 40)); continue; }
    const chords = [...m[2].matchAll(/<span\s+class="chord"[^>]*>([\s\S]*?)<\/span>/gi)].map(x => stripTags(x[1])).filter(c => c && !isNC(c));
    if (chords.length) pushLine(sections, chords);
    else if (!stripTags(m[2])) newSection(sections, '');
  }
  if (!found) return null;
  const title = (/<h1[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1];
  const sub = (/<h2[^>]*class="subtitle"[^>]*>([\s\S]*?)<\/h2>/i.exec(html) || [])[1];
  const key = /Original\s*Key\s*[:：]\s*([A-G][#♯b♭]?m?)/i.exec(stripTags(html));
  return { title: title ? stripTags(title) : '', artist: sub ? stripTags(sub) : '', keyHint: key ? key[1] : '', sections: cleanSections(sections) };
}

function parsePage(kind, html) {
  const r = kind === 'ufret' ? parseUfret(html) : parseChordWiki(html);
  if (!r || !r.sections.length) throw userError('このページからコードを見つけられませんでした。相手のサイトのページの作りが変わった可能性があります。');
  return r;
}

module.exports = { checkUrl, parsePage, parseUfret, parseChordWiki };
