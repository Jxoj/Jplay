/**
 * JPLAY — script.js
 * Bulletproof nav: Settings WILL open.
 * ?test=true uses fake data, no network needed.
 */
'use strict';

/* ── TEST MODE ──────────────────────────────────── */
var TEST_MODE = false;
try { TEST_MODE = window.location.search.indexOf('test=true') !== -1; } catch(e) {}

/* ── PASS RESET FLAG ────────────────────────────── */
/* Visiting ?passreset=true bypasses / disables all JplaySecurity checks  */
var PASS_RESET_MODE = false;
try { PASS_RESET_MODE = window.location.search.indexOf('passreset=true') !== -1; } catch(e) {}

/* ── FAKE DATA ──────────────────────────────────── */
var FAKE_GAMES = [
  { id:1, title:'Cosmic Blaster',  category:'Action',   featured:true,  plays:9800, color:'#1a1060', description:'A fast-paced space shooter.'        },
  { id:2, title:'Puzzle Master',   category:'Puzzle',   featured:true,  plays:7400, color:'#0d3060', description:'Mind-bending puzzle challenges.'     },
  { id:3, title:'Speed Racer',     category:'Racing',   featured:false, plays:6100, color:'#3d1010', description:'High-speed track racing.'            },
  { id:4, title:'Tower Defense X', category:'Strategy', featured:false, plays:5500, color:'#0d2a10', description:'Build towers, stop the horde.'       },
  { id:5, title:'Dungeon Crawl',   category:'RPG',      featured:true,  plays:8200, color:'#2a1040', description:'Explore procedural dungeons.'        },
  { id:6, title:'Neon Dash',       category:'Arcade',   featured:false, plays:4800, color:'#001a30', description:'Dodge neon obstacles at speed.'      },
  { id:7, title:'Word Hunt',       category:'Puzzle',   featured:false, plays:3200, color:'#1a2a00', description:'Find hidden words fast.'             },
  { id:8, title:'Sky Fortress',    category:'Action',   featured:false, plays:4100, color:'#0a1a3a', description:'Aerial combat strategy.'             },
];

var FAKE_WALLPAPERS = [
  { name:'Deep Space',   color:'linear-gradient(135deg,#0a0a2a,#1a0a3a)', url:'', thumbnail:'' },
  { name:'Ocean Dark',   color:'linear-gradient(135deg,#001a30,#003050)', url:'', thumbnail:'' },
  { name:'Forest Night', color:'linear-gradient(135deg,#0a1a0a,#0a2a0a)', url:'', thumbnail:'' },
  { name:'Ember',        color:'linear-gradient(135deg,#2a0a00,#1a1000)', url:'', thumbnail:'' },
];

/* ── STATE ──────────────────────────────────────── */
var state = {
  games: [], sections: [], wallpapers: [],
  sortBy: 'default', searchQuery: '', currentPage: 'home',
  rippleEnabled: true, reactivity: 60, animationsEnabled: true,
  modalOpen: false, detailOpen: false, currentGame: null,
  library: [], customBgUrl: null, selectedWallpaperUrl: null,
  bgDim: 0.55, bgBlur: 0, gamesLoaded: false,
};

var DEFAULT_SECTIONS = [
  { id:'featured', title:'Featured',  tag:"Editor's Pick", filter:'featured' },
  { id:'popular',  title:'Popular',   tag:'Popular',       filter:'popular'  },
  { id:'all',      title:'All Games', tag:null,            filter:'all'      },
];

/* ── HELPERS ────────────────────────────────────── */
function el(id)         { return document.getElementById(id); }
function mk(tag, cls)   { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
function inLib(id)      { return state.library.indexOf(id) !== -1; }
function addLib(id)     { if (!inLib(id)) state.library.push(id); }
function remLib(id)     { state.library = state.library.filter(function(x){ return x !== id; }); }

function isMobileSidebarMode() {
  return window.matchMedia('(max-width: 640px)').matches;
}

/* ── PAGE SWITCHING ─────────────────────────────── */
/*
  We use inline style display rather than classList.hidden
  so there is zero ambiguity — no CSS specificity battles.
*/
function showPage(page) {
  ['home','library','settings'].forEach(function(p) {
    var pageEl = el('page-' + p);
    if (!pageEl) return;
    pageEl.style.display = (p === page) ? '' : 'none';
  });
}

function resetPagesScroll() {
  var wrap = document.querySelector('.pages-wrap');
  if (wrap) wrap.scrollTop = 0;
}

function setTopbarForPage(page) {
  var searchArea = el('topbar-search-area');
  var sortMenu   = el('sort-menu');
  var sortBtn    = el('sort-btn');
  var randomBtn  = el('random-btn');
  var sortDrop   = el('sort-dropdown');
  var isContent  = page === 'home' || page === 'library';

  if (searchArea) searchArea.style.visibility = isContent ? '' : 'hidden';
  if (sortMenu)   sortMenu.style.display = page === 'home' ? '' : 'none';
  if (sortBtn)    sortBtn.style.display = page === 'home' ? '' : 'none';
  if (randomBtn)  randomBtn.style.display = page === 'home' ? '' : 'none';
  if (sortDrop && page !== 'home') sortDrop.classList.remove('open');
}

function forceShowPage(page) {
  ['home','library','settings'].forEach(function(p) {
    var pageEl = el('page-' + p);
    if (!pageEl) return;
    if (p === page) pageEl.style.setProperty('display', 'flex', 'important');
    else pageEl.style.setProperty('display', 'none', 'important');
  });
}

function navigateTo(page) {
  if (['home','library','settings'].indexOf(page) === -1) return;
  state.currentPage = page;

  /* Sidebar active highlight */
  var btns = document.querySelectorAll('.sidebar-item[data-page]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-page') === page);
  }

  /* Show/hide pages with inline style — no .hidden needed */
  showPage(page);

  /* Topbar label */
  var lbl = el('topbar-page-title');
  if (lbl) lbl.textContent = { home:'Home', library:'Library', settings:'Settings' }[page] || page;

  setTopbarForPage(page);
  resetPagesScroll();

  if (page === 'library') renderLibrary();
}

function safeNavigateTo(page) {
  if (['home','library','settings'].indexOf(page) === -1) return;
  try {
    navigateTo(page);
  } catch (err) {
    console.warn('[Jplay] navigateTo failed, applying fallback:', err && err.message ? err.message : err);

    state.currentPage = page;
    showPage(page);

    var btns = document.querySelectorAll('.sidebar-item[data-page]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-page') === page);
    }

    var lbl = el('topbar-page-title');
    if (lbl) lbl.textContent = { home:'Home', library:'Library', settings:'Settings' }[page] || page;

    setTopbarForPage(page);
    resetPagesScroll();

    if (page === 'library') renderLibrary();
  }
}

window.JplayOpenSettings = function() {
  safeNavigateTo('settings');
  forceShowPage('settings');
  setTopbarForPage('settings');
  resetPagesScroll();
};

window.JplayDebugPageState = function() {
  var home = el('page-home');
  var lib = el('page-library');
  var settings = el('page-settings');
  return {
    currentPage: state.currentPage,
    homeDisplay: home ? home.style.display : null,
    libraryDisplay: lib ? lib.style.display : null,
    settingsDisplay: settings ? settings.style.display : null,
    settingsVisible: !!(settings && settings.offsetParent !== null),
    settingsChildren: settings ? settings.children.length : null,
    pagesWrapScrollTop: (function(){ var wrap = document.querySelector('.pages-wrap'); return wrap ? wrap.scrollTop : null; })(),
    sortMenuDisplay: (function(){ var menu = el('sort-menu'); return menu ? menu.style.display : null; })(),
    sortButtonDisplay: (function(){ var sortBtn = el('sort-btn'); return sortBtn ? sortBtn.style.display : null; })(),
    sortDropdownParent: (function(){ var dd = el('sort-dropdown'); return dd && dd.parentElement ? dd.parentElement.id || dd.parentElement.className : null; })()
  };
};

/* ── DATA ───────────────────────────────────────── */
var API_BASE  = 'https://jxoplay.netlify.app';

function loadGames() {
  if (TEST_MODE) {
    state.games = FAKE_GAMES;
    state.sections = DEFAULT_SECTIONS;
    state.gamesLoaded = true;
    renderHome();
    return;
  }
  fetch(API_BASE + '/games/all.json')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data) {
      state.games    = Array.isArray(data) ? data : (data.games    || []);
      state.sections = Array.isArray(data) ? DEFAULT_SECTIONS : (data.sections || DEFAULT_SECTIONS);
      state.gamesLoaded = true;
      renderHome();
      if (typeof window.renderRecentlyPlayed === 'function') window.renderRecentlyPlayed();
    })
    .catch(function(e) {
      console.warn('[Jplay] Games load failed:', e.message);
      state.games = []; state.sections = DEFAULT_SECTIONS;
      state.gamesLoaded = true;
      renderHome();
    });
}

function loadWallpapers() {
  if (TEST_MODE) {
    state.wallpapers = FAKE_WALLPAPERS;
    renderWallpaperPicker();
    return;
  }
  fetch(API_BASE + '/wallpapers/all.json')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data) { state.wallpapers = data; renderWallpaperPicker(); })
    .catch(function(e) {
      console.warn('[Jplay] Wallpapers load failed:', e.message);
      state.wallpapers = [];
      renderWallpaperPicker();
    });
}

/* ── BACKGROUND ─────────────────────────────────── */
function applyBackground() {
  var layer  = el('bg-image-layer'); if (!layer) return;
  var srcEl  = el('bg-source-select');
  var src    = srcEl ? srcEl.value : 'image';
  if      (src === 'image')                           layer.style.backgroundImage = "url('assets/imgs/background.jpg')";
  else if (src === 'custom' && state.customBgUrl)     layer.style.backgroundImage = "url('" + state.customBgUrl + "')";
  else if (src === 'wallpaper' && state.selectedWallpaperUrl) layer.style.backgroundImage = "url('" + state.selectedWallpaperUrl + "')";
  else if (src === 'color')                           layer.style.backgroundImage = 'none';
  layer.style.filter = state.bgBlur > 0 ? 'blur(' + state.bgBlur + 'px)' : '';
  document.documentElement.style.setProperty('--bg-dim', state.bgDim);
}

/* ── WALLPAPER PICKER ───────────────────────────── */
function renderWallpaperPicker() {
  var grid = el('wallpaper-grid'); if (!grid) return;
  grid.innerHTML = '';
  if (!state.wallpapers.length) { grid.innerHTML = '<span class="wallpaper-empty">No wallpapers available</span>'; return; }
  state.wallpapers.forEach(function(wp) {
    var card  = mk('div','wallpaper-card');
    if (wp.color) card.style.background = wp.color;
    var img   = mk('img'); img.src = wp.thumbnail || wp.url || ''; img.alt = wp.name; img.loading = 'lazy';
    var lbl   = mk('span','wallpaper-label'); lbl.textContent = wp.name;
    card.appendChild(img); card.appendChild(lbl);
    card.addEventListener('click', function() {
      grid.querySelectorAll('.wallpaper-card').forEach(function(c){ c.classList.remove('selected'); });
      card.classList.add('selected');
      state.selectedWallpaperUrl = wp.url;
      var sel = el('bg-source-select'); if (sel) sel.value = 'wallpaper';
      var wpz = el('wallpaper-picker-zone'); if (wpz) wpz.style.display = '';
      var upz = el('bg-upload-zone');       if (upz) upz.style.display = 'none';
      applyBackground();
    });
    grid.appendChild(card);
  });
}

/* ── CANVAS PARTICLES ───────────────────────────── */
var bgCanvas, ctx2d, canvasW, canvasH, particles = [], canvasRipples = [];

function resizeCanvas() {
  if (!bgCanvas) return;
  canvasW = bgCanvas.width  = window.innerWidth;
  canvasH = bgCanvas.height = window.innerHeight;
}
function initParticles() {
  particles = [];
  if (!canvasW) return;
  var n = Math.floor(canvasW * canvasH / 20000);
  for (var i = 0; i < n; i++) {
    particles.push({ x:Math.random()*canvasW, y:Math.random()*canvasH,
      r:Math.random()*1.1+0.3, vx:(Math.random()-0.5)*0.16, vy:(Math.random()-0.5)*0.16, a:Math.random()*0.25+0.05 });
  }
}
function drawCanvas() {
  if (!ctx2d) return;
  ctx2d.clearRect(0,0,canvasW,canvasH);
  var base = (state.reactivity/100)*0.38+0.04;
  particles.forEach(function(p) {
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<0)p.x=canvasW; if(p.x>canvasW)p.x=0;
    if(p.y<0)p.y=canvasH; if(p.y>canvasH)p.y=0;
    ctx2d.beginPath(); ctx2d.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx2d.fillStyle='rgba(59,130,246,'+(p.a*base*2.8)+')'; ctx2d.fill();
  });
  for (var i=canvasRipples.length-1;i>=0;i--) {
    var rp=canvasRipples[i]; rp.radius+=rp.speed; rp.alpha-=rp.decay;
    if(rp.alpha<=0){canvasRipples.splice(i,1);continue;}
    ctx2d.beginPath(); ctx2d.arc(rp.x,rp.y,rp.radius,0,Math.PI*2);
    ctx2d.strokeStyle='rgba(59,130,246,'+rp.alpha+')'; ctx2d.lineWidth=1.5; ctx2d.stroke();
  }
  requestAnimationFrame(drawCanvas);
}
function spawnRipple(x,y) {
  var t=state.reactivity/100;
  canvasRipples.push({x:x,y:y,radius:0,alpha:0.5*t,speed:3+t*4.5,decay:0.012*(2-t)});
}
function spawnDOM(x,y) {
  var size=80+Math.random()*40, r=mk('div','ripple');
  r.style.cssText='left:'+(x-size/2)+'px;top:'+(y-size/2)+'px;width:'+size+'px;height:'+size+'px';
  var rc=el('ripple-container'); if(rc) rc.appendChild(r);
  r.addEventListener('animationend',function(){r.remove();},{once:true});
}

/* ── TILE / CARD FACTORY ────────────────────────── */
function bmkSVG(f) {
  return '<svg viewBox="0 0 24 24" fill="'+(f?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
}
function createTile(game) {
  var tile = mk('div','game-tile');
  tile.style.animationDelay = (Math.random()*0.18)+'s';

  var bg = mk('div','tile-bg');
  if (game.background) { bg.style.backgroundImage="url('"+game.background+"')"; bg.style.backgroundSize='cover'; bg.style.backgroundPosition='center'; }
  else { bg.style.background='linear-gradient(135deg,'+(game.color||'#1a2a4a')+' 0%,#0a0c10 100%)'; }

  var fallback = mk('div','tile-bg-fallback');
  fallback.textContent = (game.title||'??').slice(0,2).toUpperCase();

  var overlay  = mk('div','tile-overlay');
  var lib      = inLib(game.id);
  var bookmark = mk('button','tile-bookmark'+(lib?' saved':''));
  bookmark.title = lib ? 'Remove from Library' : 'Save to Library';
  bookmark.innerHTML = bmkSVG(lib);
  bookmark.addEventListener('click', function(e) {
    e.stopPropagation();
    if (inLib(game.id)) remLib(game.id); else addLib(game.id);
    var now = inLib(game.id);
    bookmark.className = 'tile-bookmark'+(now?' saved':'');
    bookmark.title = now ? 'Remove from Library' : 'Save to Library';
    bookmark.innerHTML = bmkSVG(now);
  });

  var content = mk('div','tile-content');
  var cat = mk('span','tile-category'); cat.textContent = game.category||'';
  var ttl = mk('span','tile-title');   ttl.textContent = game.title||'';
  var hint = mk('div','tile-play-hint');
  hint.innerHTML = '<svg viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>Play Now';
  content.appendChild(cat); content.appendChild(ttl); content.appendChild(hint);

  tile.appendChild(bg); tile.appendChild(fallback); tile.appendChild(overlay);
  tile.appendChild(bookmark); tile.appendChild(content);
  tile.addEventListener('click', function(){ openDetail(game); });
  return tile;
}
function createSkel() {
  var s=mk('div','game-tile skeleton-tile'); s.appendChild(mk('div','skel-shimmer')); return s;
}

/* ── DETAIL PANEL ───────────────────────────────── */
function openDetail(game) {
  state.currentGame = game; state.detailOpen = true;
  var dbg = el('detail-bg');
  if (dbg) dbg.style.background = game.background
    ? "url('"+game.background+"') center/cover no-repeat"
    : 'linear-gradient(135deg,'+(game.color||'#1a2a4a')+' 0%,#0a0c10 100%)';
  var ico = el('detail-icon');
  if (ico) { ico.src=game.icon||''; ico.style.display=game.icon?'':'none'; }
  var dt=el('detail-title');    if(dt) dt.textContent=game.title||'';
  var dc=el('detail-category'); if(dc) dc.textContent=game.category||'';
  var dd=el('detail-desc');     if(dd) dd.textContent=game.description||'No description.';
  var ov=el('detail-overlay');  if(ov) ov.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeDetail() {
  var ov=el('detail-overlay'); if(ov) ov.classList.remove('open');
  state.detailOpen=false; document.body.style.overflow='';
}

/* ── LIBRARY ────────────────────────────────────── */
function renderLibrary() {
  var grid=el('library-grid'), empty=el('library-empty'), cnt=el('library-count');
  if (!grid) return;
  grid.innerHTML='';
  var saved=state.games.filter(function(g){ return inLib(g.id); });
  if (empty) empty.style.display = saved.length ? 'none' : '';
  if (cnt)   cnt.textContent     = saved.length ? saved.length+' saved' : '';
  saved.forEach(function(g,i){ var t=createTile(g); t.style.animationDelay=(i*0.04)+'s'; grid.appendChild(t); });
}

/* ── HOME RENDER ────────────────────────────────── */
function getFiltered() {
  var list=state.games.slice();
  if (state.searchQuery) {
    var q=state.searchQuery.toLowerCase();
    list=list.filter(function(g){ return (g.title||'').toLowerCase().indexOf(q)>=0||(g.category||'').toLowerCase().indexOf(q)>=0; });
  }
  if (state.sortBy==='az')      list.sort(function(a,b){return(a.title||'').localeCompare(b.title||'');});
  if (state.sortBy==='za')      list.sort(function(a,b){return(b.title||'').localeCompare(a.title||'');});
  if (state.sortBy==='popular') list.sort(function(a,b){return(b.plays||0)-(a.plays||0);});
  if (state.sortBy==='newest')  list.sort(function(a,b){return b.id>a.id?1:-1;});
  return list;
}
function gamesFor(section, all) {
  if (section.filter==='featured') return state.games.filter(function(g){return g.featured;});
  if (section.filter==='popular')  return state.games.slice().sort(function(a,b){return(b.plays||0)-(a.plays||0);}).slice(0,8);
  if (section.filter==='all')      return all;
  return all.filter(function(g){return(g.category||'').toLowerCase()===(section.filter||'').toLowerCase();});
}
function renderHome() {
  var homeEl=el('page-home'); if(!homeEl) return;
  var wrap=el('home-sections');
  if (!wrap) { wrap=mk('div',''); wrap.id='home-sections'; homeEl.appendChild(wrap); }
  wrap.innerHTML='';
  var all=(state.sections.length?state.sections:DEFAULT_SECTIONS);
  var filtered=getFiltered();
  all.forEach(function(sec) {
    var games=gamesFor(sec,filtered);
    if (state.gamesLoaded && games.length===0 && sec.filter!=='all') return;
    var s=mk('section','section');
    var hdr=mk('div','section-header');
    var h2=mk('h2','section-title'); h2.textContent=sec.title; hdr.appendChild(h2);
    if (sec.tag) { var tag=mk('span','section-tag'); tag.textContent=sec.tag; hdr.appendChild(tag); }
    if (sec.filter==='all') {
      var cnt=mk('span','section-count'); cnt.id='game-count';
      cnt.textContent=state.gamesLoaded?(filtered.length+' game'+(filtered.length!==1?'s':'')):'';
      hdr.appendChild(cnt);
    }
    s.appendChild(hdr);
    var isFeat=sec.filter==='featured';
    var grid=mk('div',isFeat?'tiles-row featured-row':'tiles-grid');
    if (!state.gamesLoaded) {
      for(var i=0;i<(isFeat?3:6);i++) grid.appendChild(createSkel());
    } else if (games.length===0) {
      var nr=mk('div','no-results');
      nr.innerHTML='<p>'+(state.searchQuery?'No games found':'Games coming soon')+'</p><span>'+(state.searchQuery?'Try a different term':'Check back later')+'</span>';
      s.appendChild(nr);
    } else {
      games.forEach(function(g,i){ var t=createTile(g); t.style.animationDelay=(i*0.03)+'s'; grid.appendChild(t); });
    }
    s.appendChild(grid); wrap.appendChild(s);
  });
  /* Inject recently played after sections render */
  if (typeof window.renderRecentlyPlayed === 'function') window.renderRecentlyPlayed();
}

/* ── GAME MODAL → delegated to JBar ──────────────── */
function openGame(game) {
  if (!game) return;
  state.currentGame = game;
  if (typeof JBar !== 'undefined') {
    JBar.openGame(game);
  }
}
function closeModal() {
  if (typeof JBar !== 'undefined') JBar.closeGame();
}

/* ── MAIN INIT ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  /* ── Wire sidebar buttons ── */
  var sideBtns = document.querySelectorAll('.sidebar-item[data-page]');
  for (var i=0; i<sideBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        safeNavigateTo(btn.getAttribute('data-page'));
        if (isMobileSidebarMode()) document.body.classList.remove('sidebar-open');
      });
    })(sideBtns[i]);
  }

  /* ── Sidebar collapse ── */
  var tog = el('sidebar-toggle');
  if (tog) {
    tog.addEventListener('click', function() {
      if (isMobileSidebarMode()) {
        document.body.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
      }
    });
  }

  /* ── Canvas ── */
  bgCanvas = el('bg-canvas');
  if (bgCanvas) { ctx2d = bgCanvas.getContext('2d'); }
  resizeCanvas(); initParticles();
  if (ctx2d) requestAnimationFrame(drawCanvas);
  window.addEventListener('resize', function(){ resizeCanvas(); initParticles(); });

  /* ── Click effects ── */
  document.addEventListener('click', function(e) {
    if (state.rippleEnabled) spawnDOM(e.clientX, e.clientY);
    if (state.reactivity)    spawnRipple(e.clientX, e.clientY);
  });

  /* ── Background controls ── */
  applyBackground();
  var bgSel = el('bg-source-select');
  if (bgSel) bgSel.addEventListener('change', function(e) {
    var upz=el('bg-upload-zone'), wpz=el('wallpaper-picker-zone');
    if (upz) upz.style.display = e.target.value==='custom'    ? '' : 'none';
    if (wpz) wpz.style.display = e.target.value==='wallpaper' ? '' : 'none';
    applyBackground();
  });
  var dimSlider=el('bg-dim-slider');
  if (dimSlider) dimSlider.addEventListener('input', function(e){
    state.bgDim=parseInt(e.target.value)/100;
    var v=el('bg-dim-value'); if(v) v.textContent=e.target.value+'%';
    applyBackground();
  });
  var blurSlider=el('bg-blur-slider');
  if (blurSlider) blurSlider.addEventListener('input', function(e){
    state.bgBlur=parseInt(e.target.value);
    var v=el('bg-blur-value'); if(v) v.textContent=e.target.value+'px';
    applyBackground();
  });

  /* File upload */
  var bgFile=el('bg-file-input'), dropArea=el('upload-drop-area'), preview=el('upload-preview');
  function handleFile(file) {
    if (!file||!file.type.startsWith('image/')) return;
    if (state.customBgUrl) URL.revokeObjectURL(state.customBgUrl);
    state.customBgUrl=URL.createObjectURL(file);
    var pi=el('upload-preview-img'); if(pi) pi.src=state.customBgUrl;
    var pn=el('upload-preview-name'); if(pn) pn.textContent=file.name;
    if(dropArea) dropArea.style.display='none';
    if(preview)  preview.style.display='';
    var sel=el('bg-source-select'); if(sel) sel.value='custom';
    var upz=el('bg-upload-zone'); if(upz) upz.style.display='';
    applyBackground();
  }
  var bb=el('upload-browse-btn');  if(bb) bb.addEventListener('click', function(e){e.stopPropagation();if(bgFile)bgFile.click();});
  var cb=el('upload-change-btn');  if(cb) cb.addEventListener('click', function(e){e.stopPropagation();if(bgFile)bgFile.click();});
  if (bgFile) bgFile.addEventListener('change', function(e){handleFile(e.target.files[0]);bgFile.value='';});
  if (dropArea) {
    dropArea.addEventListener('click',    function(){if(bgFile)bgFile.click();});
    dropArea.addEventListener('dragover', function(e){e.preventDefault();dropArea.classList.add('drag-over');});
    dropArea.addEventListener('dragleave',function(){dropArea.classList.remove('drag-over');});
    dropArea.addEventListener('drop',     function(e){e.preventDefault();dropArea.classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});
  }

  /* ── Detail panel ── */
  var dClose=el('detail-close-btn'); if(dClose) dClose.addEventListener('click', closeDetail);
  var dOv=el('detail-overlay');
  if (dOv) dOv.addEventListener('click', function(e){ if(e.target===dOv) closeDetail(); });
  var dPlay=el('detail-play-btn');
  if (dPlay) dPlay.addEventListener('click', function(){ closeDetail(); openGame(state.currentGame); });

  /* ── Modal (legacy, not used) ── */
  var mClose=el('modal-close-btn');  if(mClose)  mClose.addEventListener('click', closeModal);

  /* ── Settings controls ── */
  var thSel=el('theme-select');       if(thSel)  thSel.addEventListener('change',  function(e){ document.body.dataset.theme   = e.target.value; });
  var denSel=el('density-select');    if(denSel) denSel.addEventListener('change', function(e){ document.body.dataset.density = e.target.value; });
  var ripTog=el('ripple-toggle');     if(ripTog) ripTog.addEventListener('change', function(e){ state.rippleEnabled = e.target.checked; });

  /* New-tab mode toggle */
  var ntTog = el('newtab-mode-toggle');
  if (ntTog) {
    /* Sync initial state from JBar */
    if (typeof JBar !== 'undefined') ntTog.checked = JBar.getNewTabMode();
    ntTog.addEventListener('change', function(e) {
      if (typeof JBar !== 'undefined') JBar.setNewTabMode(e.target.checked);
    });
  }
  var animTog=el('animations-toggle');
  if (animTog) animTog.addEventListener('change', function(e){
    state.animationsEnabled=e.target.checked;
    document.body.dataset.animations=e.target.checked?'on':'off';
  });
  var reactSl=el('reactivity-slider');
  if (reactSl) reactSl.addEventListener('input', function(e){
    state.reactivity=parseInt(e.target.value);
    var rv=el('reactivity-value'); if(rv) rv.textContent=e.target.value;
  });

  /* Tab title / favicon → Hackwize */
  var tabTi=el('tab-title-input');
  if (tabTi) tabTi.addEventListener('input', function(e){
    var fav=el('favicon-input');
    if (typeof Hackwize!=='undefined') Hackwize.setCloak(e.target.value, fav?fav.value:undefined);
    else document.title=e.target.value||'Jplay';
  });
  var favIn=el('favicon-input');
  if (favIn) favIn.addEventListener('input', function(e){
    var ti=el('tab-title-input');
    if (typeof Hackwize!=='undefined') Hackwize.setCloak(ti?ti.value:undefined, e.target.value);
  });

  /* Hackwize stealth controls */
  var redirectInput = el('redirect-url');
  var noHistoryToggle = el('no-history-toggle');
  var mimicSiteSelect = el('mimic-site-select');
  var mimicCustomInput = el('mimic-custom-url');
  var mimicCustomRow = el('mimic-custom-row');

  function syncMimicCustomRow() {
    if (!mimicCustomRow || !mimicSiteSelect) return;
    mimicCustomRow.style.display = mimicSiteSelect.value === 'custom' ? '' : 'none';
  }

  function syncHackwizeSettingsUI() {
    if (typeof Hackwize === 'undefined' || typeof Hackwize.getSettings !== 'function') return;
    var cfg = Hackwize.getSettings();
    if (redirectInput && cfg.redirectUrl) redirectInput.value = cfg.redirectUrl;
    if (noHistoryToggle) noHistoryToggle.checked = cfg.noHistoryEnabled !== false;
    if (mimicSiteSelect && cfg.mimicSite) mimicSiteSelect.value = cfg.mimicSite;
    if (mimicCustomInput && cfg.mimicCustomUrl != null) mimicCustomInput.value = cfg.mimicCustomUrl;
    syncMimicCustomRow();
  }

  if (redirectInput) redirectInput.addEventListener('input', function(e) {
    if (typeof Hackwize !== 'undefined' && typeof Hackwize.setRedirectUrl === 'function') {
      Hackwize.setRedirectUrl(e.target.value);
    }
  });
  if (noHistoryToggle) noHistoryToggle.addEventListener('change', function(e) {
    if (typeof Hackwize !== 'undefined' && typeof Hackwize.setNoHistory === 'function') {
      Hackwize.setNoHistory(e.target.checked);
    }
  });
  if (mimicSiteSelect) mimicSiteSelect.addEventListener('change', function(e) {
    syncMimicCustomRow();
    if (typeof Hackwize !== 'undefined' && typeof Hackwize.setMimicSite === 'function') {
      Hackwize.setMimicSite(e.target.value);
    }
  });
  if (mimicCustomInput) mimicCustomInput.addEventListener('input', function(e) {
    if (typeof Hackwize !== 'undefined' && typeof Hackwize.setMimicCustomUrl === 'function') {
      Hackwize.setMimicCustomUrl(e.target.value);
    }
  });
  syncMimicCustomRow();

  /* Password */
  var pwIn=el('global-password-input'), pwTog=el('password-toggle-btn'), pwSt=el('password-status');
  function updPw() { if(pwSt) { if(pwIn&&pwIn.value.trim()){pwSt.textContent='● Active';pwSt.className='password-status active';}else{pwSt.textContent='○ Inactive';pwSt.className='password-status';} } }
  if(pwIn){updPw();pwIn.addEventListener('input',updPw);}
  if(pwTog&&pwIn) pwTog.addEventListener('click',function(){pwIn.type=pwIn.type==='password'?'text':'password';});

  /* Reset */
  var rstBtn=el('reset-settings-btn');
  if (rstBtn) rstBtn.addEventListener('click', function() {
    document.body.dataset.theme='dark'; document.body.dataset.density='normal'; document.body.dataset.animations='on';
    state.rippleEnabled=true; state.reactivity=60; state.animationsEnabled=true; state.bgDim=0.55; state.bgBlur=0;
    var resets={'theme-select':'dark','density-select':'normal','reactivity-slider':'60','bg-dim-slider':'55','bg-blur-slider':'0','tab-title-input':'Home','favicon-input':'https://ssl.gstatic.com/classroom/favicon.png','bg-source-select':'image','redirect-url':'https://classroom.google.com','global-password-input':'','mimic-site-select':'google_classroom','mimic-custom-url':''};
    for (var id in resets) { var e2=el(id); if(e2) e2.value=resets[id]; }
    var rv=el('reactivity-value');if(rv)rv.textContent='60';
    var dv=el('bg-dim-value');    if(dv)dv.textContent='55%';
    var bv=el('bg-blur-value');   if(bv)bv.textContent='0px';
    var rt=el('ripple-toggle');   if(rt)rt.checked=true;
    var at=el('animations-toggle');if(at)at.checked=true;
    var nt=el('newtab-mode-toggle');if(nt){nt.checked=true;if(typeof JBar!=='undefined')JBar.setNewTabMode(true);}
    var nh=el('no-history-toggle'); if(nh) nh.checked=true;
    var upz=el('bg-upload-zone');  if(upz)upz.style.display='none';
    var wpz=el('wallpaper-picker-zone');if(wpz)wpz.style.display='none';
    var mcr=el('mimic-custom-row'); if(mcr) mcr.style.display='none';
    updPw(); applyBackground();
    if (typeof Hackwize!=='undefined') {
      Hackwize.setCloak('Home','https://ssl.gstatic.com/classroom/favicon.png');
      if (typeof Hackwize.setRedirectUrl === 'function') Hackwize.setRedirectUrl('https://classroom.google.com');
      if (typeof Hackwize.setNoHistory === 'function') Hackwize.setNoHistory(true);
      if (typeof Hackwize.setMimicSite === 'function') Hackwize.setMimicSite('google_classroom');
      if (typeof Hackwize.setMimicCustomUrl === 'function') Hackwize.setMimicCustomUrl('');
    }
  });

  /* ── Search ── */
  var srch=el('search-input');
  if (srch) srch.addEventListener('input', function(e){
    state.searchQuery=e.target.value.trim();
    if (state.currentPage==='home')    renderHome();
    else if(state.currentPage==='library') renderLibrary();
  });

  /* ── Sort ── */
  var srtBtn=el('sort-btn');
  if (srtBtn) srtBtn.addEventListener('click', function(e){ e.stopPropagation(); var dd=el('sort-dropdown'); if(dd)dd.classList.toggle('open'); });
  var srtOpts=document.querySelectorAll('.sort-option');
  for (var j=0;j<srtOpts.length;j++) {
    (function(btn){ btn.addEventListener('click',function(e){
      e.stopPropagation(); state.sortBy=btn.getAttribute('data-sort');
      for(var k=0;k<srtOpts.length;k++) srtOpts[k].classList.remove('active');
      btn.classList.add('active');
      var dd=el('sort-dropdown'); if(dd)dd.classList.remove('open');
      renderHome();
    }); })(srtOpts[j]);
  }
  document.addEventListener('click', function(){ var dd=el('sort-dropdown'); if(dd)dd.classList.remove('open'); });

  /* ── Random ── */
  var rndBtn=el('random-btn');
  if (rndBtn) rndBtn.addEventListener('click', function(){
    if (!state.games.length) return;
    openDetail(state.games[Math.floor(Math.random()*state.games.length)]);
  });

  /* ── Keyboard ── */
  document.addEventListener('keydown', function(e) {
    var tag=document.activeElement?document.activeElement.tagName:'';
    var inInput=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    if (e.key==='/'&&!inInput) { e.preventDefault(); if(state.currentPage!=='home')safeNavigateTo('home'); var si=el('search-input');if(si)si.focus(); }
    if (e.key==='Escape') {
      if (typeof JBar !== 'undefined' && JBar.isJbarVisible && JBar.isJbarVisible()) { JBar.hideJbar(); }
      else if(state.detailOpen) closeDetail();
    }
    /* 0 handled by hackwize.js capture phase */
  });

  /* ── START ── */
  state.sections = DEFAULT_SECTIONS;

  /* Hide all pages first, then show home */
  ['home','library','settings'].forEach(function(p){
    var pageEl=el('page-'+p);
    if (pageEl) pageEl.style.display='none';
  });

  safeNavigateTo('home');
  renderHome(); /* skeletons immediately */

  /* Hackwize: cloak + stealth + no-history mode */
  if (typeof Hackwize!=='undefined') {
    Hackwize.init();
    syncHackwizeSettingsUI();
  }

  /* ── JBar init ── */
  if (typeof JBar !== 'undefined') JBar.init();

  /* ── Security check (show lock screen if configured) ── */
  /* ?passreset=true skips the lock entirely and wipes stored credentials   */
  if (PASS_RESET_MODE) {
    /* Clear any stored PIN / password so the user can set a new one */
    try {
      if (typeof JplaySecurity !== 'undefined' && typeof JplaySecurity.clearCredentials === 'function') {
        JplaySecurity.clearCredentials();
      } else {
        /* Fallback: nuke every localStorage key that looks security-related */
        var keysToNuke = [];
        for (var ki = 0; ki < localStorage.length; ki++) {
          var lk = localStorage.key(ki);
          if (lk && /pin|pass|lock|auth|security/i.test(lk)) keysToNuke.push(lk);
        }
        keysToNuke.forEach(function(k){ localStorage.removeItem(k); });
      }
    } catch(e) { console.warn('[Jplay] passreset cleanup error:', e); }

    /* Show a brief on-screen banner so the user knows it worked */
    (function() {
      var banner = document.createElement('div');
      banner.id = 'passreset-banner';
      banner.style.cssText = [
        'position:fixed','top:16px','left:50%','transform:translateX(-50%)',
        'background:#1e40af','color:#fff','padding:10px 22px','border-radius:8px',
        'font-family:inherit','font-size:0.85rem','z-index:99999',
        'box-shadow:0 4px 20px rgba(0,0,0,0.5)','pointer-events:none'
      ].join(';');
      banner.textContent = '🔓 Security reset — you can now set a new PIN or password in Settings.';
      document.body.appendChild(banner);
      setTimeout(function(){ if(banner.parentNode) banner.parentNode.removeChild(banner); }, 5000);
    })();

  } else if (typeof JplaySecurity !== 'undefined') {
    JplaySecurity.check();
  }

  /* ── Inject Security settings panel ── */
  if (typeof JplaySecurity !== 'undefined') {
    var secCol = document.querySelector('.settings-col:last-child');
    if (secCol) {
      var resetRow = secCol.querySelector('.settings-reset-row');
      var secPanel = JplaySecurity.buildSettingsPanel();
      if (resetRow) secCol.insertBefore(secPanel, resetRow);
      else secCol.appendChild(secPanel);
    }
  }

  /* ── Setup screen ── */
  if (typeof JplaySetup !== 'undefined') JplaySetup.show();

  /* ── Recently played renderer ── */
  window.renderRecentlyPlayed = function() {
    var homeEl = el('page-home');
    var sections = el('home-sections');
    if (!sections) return;
    var recent = (typeof JBar !== 'undefined') ? JBar.getRecentlyPlayed() : [];
    var existing = el('recently-played-section');
    if (existing) existing.remove();
    if (recent.length === 0) return;

    var sec = mk('section','section');
    sec.id = 'recently-played-section';
    var hdr = mk('div','section-header');
    var h2 = mk('h2','section-title'); h2.textContent = 'Recently Played';
    var tag = mk('span','section-tag'); tag.textContent = 'Last Played';
    hdr.appendChild(h2); hdr.appendChild(tag);
    var row = mk('div','recently-played-row');
    recent.forEach(function(g) {
      var tile = mk('div','recent-tile');
      var bg = mk('div','recent-tile-bg');
      if (g.background) { bg.style.backgroundImage = "url('" + g.background + "')"; }
      else { bg.style.background = 'linear-gradient(135deg,' + (g.color||'#1a2a4a') + ' 0%,#0a0c10 100%)'; }
      var overlay = mk('div','recent-tile-overlay');
      var lbl = mk('span','recent-tile-label'); lbl.textContent = g.title || '';
      tile.appendChild(bg); tile.appendChild(overlay); tile.appendChild(lbl);
      tile.addEventListener('click', function() { openGame(g); });
      row.appendChild(tile);
    });
    sec.appendChild(hdr); sec.appendChild(row);
    /* Insert before first section */
    var firstSection = sections.querySelector('section');
    if (firstSection) sections.insertBefore(sec, firstSection);
    else sections.appendChild(sec);
  };

  /* Load data */
  if (TEST_MODE) {
    console.log('[Jplay] TEST MODE active');
    state.games=FAKE_GAMES; state.sections=DEFAULT_SECTIONS;
    state.wallpapers=FAKE_WALLPAPERS; state.gamesLoaded=true;
    renderHome();
    renderWallpaperPicker();
    window.renderRecentlyPlayed();
  } else {
    loadGames(); loadWallpapers();
  }

}); /* end DOMContentLoaded */