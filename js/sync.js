/* =========================================================
   音源・YouTube と譜面の同期
   - 音源ファイル:<audio> で再生(速度を下げても音の高さは変わらない)
   - YouTube:埋め込みプレーヤー(YouTube の IFrame API)。音は分析できないので、時刻はタップで合わせる
   - 再生中は、譜面のいま鳴っているコードを光らせ、画面の下に「いま/次」のコードを大きく出す
   - タップで合わせる:再生しながら、コードが変わるところでタップすると、そのコードの時刻を記録する
   時刻は曲のデータ(song.timing:ブロック→行→コード の入れ子)に入れる
   ========================================================= */
const Sync = {
  kind: null,          // 'audio' | 'youtube' | null
  audio: null, yt: null, ytId: null, ytReady: false, ytPromise: null,
  rate: 1, tap: false, cursor: 0, items: [], nowIdx: -1, raf: 0,
  onChange: null,      // 時刻を変えたとき(タップ)に呼ぶ:曲を保存するため
  nameOf: null,        // (bi, ii) → 表示するコード名

  /* ---------- 音のもと ---------- */
  setAudio(url) {
    this.clear();
    const a = this.audio || (this.audio = document.getElementById('syncAudio'));
    a.src = url; a.preservesPitch = true; a.webkitPreservesPitch = true; a.playbackRate = this.rate;
    a.onplay = a.onpause = a.onended = () => this.paint(true);
    this.kind = 'audio';
    this.show();
  },
  loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (this.ytPromise) return this.ytPromise;
    this.ytPromise = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => rej(new Error('YouTube の読み込みに失敗しました。通信を確かめてください。'));
      document.head.appendChild(s);
    });
    return this.ytPromise;
  },
  async setYouTube(id) {
    this.clear();
    this.kind = 'youtube'; this.ytId = id; this.ytReady = false;
    this.show();
    await this.loadYT();
    const box = document.getElementById('ytPlayer');
    this.yt = new YT.Player(box, {
      videoId: id, width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { this.ytReady = true; try { this.yt.setPlaybackRate(this.rate); } catch (e) { /* 速度を変えられない動画もある */ } this.paint(true); },
        onStateChange: () => this.paint(true),
      },
    });
  },
  clear() {
    if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); }
    if (this.yt && this.yt.destroy) { try { this.yt.destroy(); } catch (e) { /* もう消えている */ } }
    this.yt = null; this.ytReady = false; this.kind = null; this.tap = false; this.nowIdx = -1;
    const dock = document.getElementById('ytDock'); if (dock) dock.innerHTML = '<div id="ytPlayer"></div>';
    this.hide();
  },

  /* ---------- 再生の操作 ---------- */
  time() {
    if (this.kind === 'audio') return this.audio.currentTime || 0;
    if (this.kind === 'youtube' && this.ytReady) return this.yt.getCurrentTime() || 0;
    return 0;
  },
  duration() {
    if (this.kind === 'audio') return isFinite(this.audio.duration) ? this.audio.duration : 0;
    if (this.kind === 'youtube' && this.ytReady) return this.yt.getDuration() || 0;
    return 0;
  },
  playing() {
    if (this.kind === 'audio') return !this.audio.paused && !this.audio.ended;
    if (this.kind === 'youtube' && this.ytReady) return this.yt.getPlayerState() === 1;
    return false;
  },
  toggle() {
    if (this.kind === 'audio') { if (this.playing()) this.audio.pause(); else this.audio.play().catch(() => {}); }
    if (this.kind === 'youtube' && this.ytReady) { if (this.playing()) this.yt.pauseVideo(); else this.yt.playVideo(); }
  },
  pause() {
    if (this.kind === 'audio') this.audio.pause();
    if (this.kind === 'youtube' && this.ytReady) this.yt.pauseVideo();
  },
  seek(t) {
    t = Math.max(0, t);
    if (this.kind === 'audio') this.audio.currentTime = t;
    if (this.kind === 'youtube' && this.ytReady) this.yt.seekTo(t, true);
    this.paint(true);
  },
  setRate(r) {
    this.rate = r;
    if (this.kind === 'audio') this.audio.playbackRate = r;
    if (this.kind === 'youtube' && this.ytReady) { try { this.yt.setPlaybackRate(r); } catch (e) { /* 速度を変えられない動画もある */ } }
    this.paint(true);
  },

  /* ---------- 時刻の一覧 ---------- */
  // song.timing から、[{bi, ii, t}] の一覧を作る(bi:ブロック、ii:ブロックの中の何番目のコードか)
  rebuild(song) {
    const items = [];
    (song ? song.sections : []).forEach((sec, bi) => {
      let ii = 0;
      sec.lines.forEach((line, li) => line.forEach((sym, ci) => {
        const t = song.timing && song.timing[bi] && song.timing[bi][li] ? song.timing[bi][li][ci] : null;
        items.push({ bi, ii: ii++, li, ci, t: typeof t === 'number' ? t : null });
      }));
    });
    this.items = items;
    this.nowIdx = -1;
    if (this.cursor >= items.length) this.cursor = 0;
  },
  hasTiming() { return this.items.some(x => x.t != null); },
  indexAt(t) {
    let idx = -1;
    this.items.forEach((x, i) => { if (x.t != null && x.t <= t + 0.05) idx = i; });
    return idx;
  },
  // タップ:いまのコード(cursor)の時刻を記録し、あとのコードも同じだけずらす
  tapNow(song) {
    if (!this.items.length) return;
    const t = Math.max(0, this.time() - 0.08 * this.rate);   // 押すのが少し遅れるぶんを引く
    const it = this.items[this.cursor];
    const delta = it.t != null ? t - it.t : null;
    it.t = t;
    for (let i = this.cursor + 1; i < this.items.length; i++) {
      const x = this.items[i];
      if (x.t != null && delta != null) x.t = Math.max(t, x.t + delta);
      else if (x.t != null && x.t < t) x.t = t;
    }
    this.cursor = Math.min(this.items.length - 1, this.cursor + 1);
    this.writeBack(song);
    this.paint(true);
  },
  setCursor(bi, ii) {
    const i = this.items.findIndex(x => x.bi === bi && x.ii === ii);
    if (i >= 0) this.cursor = i;
    this.paint(true);
  },
  writeBack(song) {
    song.timing = song.sections.map(sec => sec.lines.map(l => l.map(() => null)));
    this.items.forEach(x => { song.timing[x.bi][x.li][x.ci] = x.t == null ? null : Math.round(x.t * 100) / 100; });
    if (this.onChange) this.onChange(song);
  },

  /* ---------- 画面 ---------- */
  show() { document.body.classList.add('has-player'); document.body.classList.toggle('has-yt', this.kind === 'youtube'); this.start(); },
  hide() { document.body.classList.remove('has-player', 'has-yt'); cancelAnimationFrame(this.raf); this.raf = 0; },
  start() { if (!this.raf) { const loop = () => { this.paint(false); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); } },
  fmt(t) { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); },
  cellOf(x) { return x ? document.querySelector(`.ch[data-pid="a:${x.bi}"][data-ci="${x.ii}"]`) : null; },
  paint(force) {
    if (!this.kind) return;
    const bar = document.getElementById('pbar');
    if (!bar) return;
    if (bar.offsetHeight && bar.offsetHeight !== this.pbh) { this.pbh = bar.offsetHeight; document.documentElement.style.setProperty('--pbh', this.pbh + 'px'); }
    const t = this.time(), d = this.duration(), playing = this.playing();
    const idx = this.indexAt(t);
    // ボタンと時刻
    const pb = bar.querySelector('[data-sync-play]');
    if (pb) pb.innerHTML = playing ? '<i class="sq"></i>' : '<i class="tri"></i>';
    const tm = bar.querySelector('.pb-time'); if (tm) tm.textContent = `${this.fmt(t)} / ${this.fmt(d)}`;
    const sk = bar.querySelector('#pbSeek'); if (sk && document.activeElement !== sk) { sk.max = d || 1; sk.value = t; }
    bar.querySelectorAll('[data-sync-rate]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.syncRate === this.rate)));
    const tb = bar.querySelector('[data-sync-tapmode]'); if (tb) tb.setAttribute('aria-pressed', String(this.tap));
    bar.classList.toggle('is-tap', this.tap);
    // いま/次のコード
    if (force || idx !== this.nowIdx) {
      this.nowIdx = idx;
      document.querySelectorAll('.ch.is-now, .ch.is-cursor').forEach(c => c.classList.remove('is-now', 'is-cursor'));
      const now = this.items[idx], next = this.items.slice(idx + 1).find(x => x.t != null) || (this.tap ? this.items[this.cursor] : null);
      const nm = x => (x && this.nameOf ? this.nameOf(x.bi, x.ii) : '');
      const nEl = bar.querySelector('.pb-now'), xEl = bar.querySelector('.pb-next');
      if (nEl) nEl.textContent = now ? nm(now) : (this.hasTiming() ? '—' : 'タップで合わせてください');
      if (xEl) xEl.textContent = this.tap ? `次にタップ:${nm(this.items[this.cursor]) || '—'}` : (next ? `次 ${nm(next)}` : '');
      const cell = this.cellOf(now);
      if (cell) cell.classList.add('is-now');
      if (this.tap) { const cc = this.cellOf(this.items[this.cursor]); if (cc) cc.classList.add('is-cursor'); }
      // 再生中は、いまのコードが見える位置まで自動で送る
      if (cell && playing && !this.tap) {
        const r = cell.getBoundingClientRect(), top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdh')) || 100) + 8;
        const bottom = innerHeight - bar.offsetHeight - (document.getElementById('ytDock').offsetHeight || 0) - 8;
        if (r.top < top || r.bottom > bottom) window.scrollBy({ top: r.top - (top + (bottom - top) * 0.3), behavior: 'smooth' });
      }
    }
  },
};
if (typeof module !== 'undefined') module.exports = Sync;
