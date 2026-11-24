/* =========================================================
   ブックマークレット(ブックマークに登録して使う小さなプログラム)
   U-FRET や ChordWiki の曲のページを開いて押すと、
   そのページからコードだけを取り出し(歌詞は捨てる)、CHORD NOTE の分析ページを開く。
   データは URL の # の後ろに入れて渡す(# の後ろはサーバーに送られない)。
   ChordWiki はサーバーからの読み込みを Cloudflare で止めているため、この方法で読む。

   注意:登録したときに改行が消えても動くように、
   「//」のコメントは書かず、文の終わりには必ず ; を付ける
   ========================================================= */
function chordNoteGrab(ORIGIN) {
  var host = location.hostname;
  var isUF = /(^|\.)ufret\.jp$/.test(host);
  var isCW = /(^|\.)chordwiki\.org$/.test(host);
  if (!isUF && !isCW) { alert('U-FRET か ChordWiki の曲のページを開いてから押してください。'); return; }
  var secs = [{ label: '', lines: [] }];
  var cur = secs[0];
  var newSec = function (label) {
    if (cur.lines.length) { cur = { label: label || '', lines: [] }; secs.push(cur); }
    else if (label) { cur.label = label; }
  };
  var isNC = function (c) { return /^N\.?\s*C\.?$/i.test(c); };
  var CHORD = /^[A-G][#b♯♭]?[^\s]{0,20}$/;
  var title = '', artist = '';
  if (isUF) {
    var d = null;
    try { d = ufret_chord_datas; } catch (e) { d = null; }
    if (!d || !d.length) { alert('U-FRET の曲のページ(コード譜が表示されているページ)で押してください。'); return; }
    d.forEach(function (line) {
      var cs = [];
      String(line).replace(/\[([^\]]*)\]/g, function (m, c) { c = c.trim(); if (c && !isNC(c)) { cs.push(c); } return ''; });
      var rest = String(line).replace(/\[[^\]]*\]/g, '').trim();
      if (cs.length) { cur.lines.push(cs); } else if (!rest) { newSec(''); }
    });
    var head = document.title.split(/\s+ギターコード|\s+-\s+U-FRET/)[0];
    var i = head.lastIndexOf(' / ');
    if (i > 0) { title = head.slice(0, i).trim(); artist = head.slice(i + 3).trim(); } else { title = head.trim(); }
  } else {
    var root = document.querySelector('main') || document.body;
    var last = null;
    var skip = 'nav,header,footer,aside,form,[class*="dict"],[class*="diagram"],[class*="fingering"],[class*="menu"]';
    root.querySelectorAll('[class*="chord"],[class*="comment"]').forEach(function (el) {
      if (el.closest(skip)) { return; }
      var cl = String(el.className || '');
      if (/comment/i.test(cl) && !/chord/i.test(cl)) {
        var t0 = el.textContent.replace(/\s+/g, ' ').trim();
        if (t0.length && t0.length <= 30) { newSec(t0); last = null; }
        return;
      }
      if (el.children.length) { return; }
      var t = el.textContent.replace(/\s+/g, '').trim();
      if (!CHORD.test(t) && !isNC(t)) { return; }
      if (isNC(t)) { return; }
      var box = el.closest('p,li,tr,div') || el.parentNode;
      if (box !== last) { cur.lines.push([]); last = box; }
      cur.lines[cur.lines.length - 1].push(t);
    });
    var h1 = document.querySelector('h1');
    title = h1 ? h1.textContent.trim() : document.title;
    var sub = document.querySelector('.subtitle, h2');
    artist = sub ? sub.textContent.trim() : '';
  }
  secs = secs.filter(function (s) { return s.lines.length; });
  if (!secs.length) { alert('このページからコードを見つけられませんでした。CHORD NOTE の「コードを貼り付けて分析する」を使ってください。'); return; }
  var song = { title: title.slice(0, 100), artist: artist.slice(0, 100), source: isUF ? 'ufret' : 'chordwiki', url: location.href.split('#')[0], sections: secs };
  var to = ORIGIN + '/#analyze=' + encodeURIComponent(JSON.stringify(song));
  var w = window.open(to, '_blank');
  if (!w) { location.href = to; }
}

// 登録用の「javascript:…」の文字列を作る(改行と余分な空白を詰めて1行にする)
function bookmarkletHref(origin) {
  const body = chordNoteGrab.toString()
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*/m, '')
    .replace(/\n\s*/g, ' ');
  return 'javascript:' + encodeURIComponent('(' + body + ')(' + JSON.stringify(origin) + ');void 0');
}

if (typeof module !== 'undefined') module.exports = { chordNoteGrab, bookmarkletHref };
