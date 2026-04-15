/**
 * JBAR.JS — Jplay Game Bar + Multi-Session + Volume + Security + Setup + Recently Played
 * Alt+J to toggle · Games open in new about:blank windows via iframe · JBar manages them remotely
 */
'use strict';

var JBar = (function () {

  var sessions       = [];
  var activeSession  = null;
  var jbarVisible    = false;
  var jbarTimeout    = null;
  var jbarAltJMode   = false; /* true when opened explicitly via Alt+J */
  var bgAudio        = null;
  var bgVol          = 0.4;
  var bgMuted        = false;
  var clockInterval  = null;
  var bridgeChannel  = null;

  /* ── NEW-TAB MODE ── */
  function getNewTabMode() {
    try {
      var v = localStorage.getItem('__jplay_newtab_mode__');
      return v === null ? true : v === '1';
    } catch(e) { return true; }
  }
  function setNewTabMode(v) {
    try { localStorage.setItem('__jplay_newtab_mode__', v ? '1' : '0'); } catch(e) {}
  }

  /* ── Storage ── */
  var STORE = {
    get: function(k)    { try { return JSON.parse(localStorage.getItem('__jplay_'+k+'__')); } catch(e) { return null; } },
    set: function(k, v) { try { localStorage.setItem('__jplay_'+k+'__', JSON.stringify(v)); } catch(e) {} },
  };

  /* ══ RECENTLY PLAYED ══ */
  function addRecentlyPlayed(game) {
    var recent = STORE.get('recently_played') || [];
    recent = recent.filter(function(r) { return r.id !== game.id; });
    recent.unshift({ id: game.id, title: game.title, icon: game.icon, category: game.category, color: game.color, background: game.background, description: game.description, url: game.url, plays: game.plays });
    if (recent.length > 10) recent = recent.slice(0, 10);
    STORE.set('recently_played', recent);
    if (typeof window.renderRecentlyPlayed === 'function') window.renderRecentlyPlayed();
  }
  function getRecentlyPlayed() { return STORE.get('recently_played') || []; }

  /* ══ BACKGROUND MUSIC ══ */
  function initBgMusic() {
    bgVol = STORE.get('bg_vol') !== null ? STORE.get('bg_vol') : 0.4;
    bgAudio = new Audio('assets/sounds/background.mp3');
    bgAudio.volume = bgVol;
    bgAudio.loop   = false;
    bgAudio.addEventListener('ended', function () {
      fadeAudio(bgAudio, bgVol, 0, 800, function () {
        bgAudio.currentTime = 0;
        setTimeout(function () {
          fadeAudio(bgAudio, 0, bgVol, 800, function () { bgAudio.play().catch(function(){}); });
          bgAudio.play().catch(function(){});
        }, 600);
      });
    });
    document.addEventListener('click', function startBg() {
      bgAudio.play().catch(function(){});
      document.removeEventListener('click', startBg);
    }, { once: true });
  }

  function fadeAudio(audio, from, to, duration, cb) {
    var steps = 30, step = (to - from) / steps, delay = duration / steps, count = 0;
    var timer = setInterval(function () {
      count++;
      audio.volume = Math.max(0, Math.min(1, from + step * count));
      if (count >= steps) { clearInterval(timer); if (cb) cb(); }
    }, delay);
  }

  function pauseBgMusic() {
    if (!bgAudio || bgAudio.paused) return;
    fadeAudio(bgAudio, bgAudio.volume, 0, 500, function () { bgAudio.pause(); });
  }

  function resumeBgMusic() {
    if (!bgAudio || sessions.length > 0) return;
    bgAudio.play().catch(function(){});
    fadeAudio(bgAudio, 0, bgVol, 600, function(){});
  }

  function setBgVol(v) {
    bgVol = Math.max(0, Math.min(1, v));
    STORE.set('bg_vol', bgVol);
    if (bgAudio && !bgAudio.paused) bgAudio.volume = bgVol;
    var slider = document.getElementById('jbar-bg-vol-slider');
    if (slider) slider.value = Math.round(bgVol * 100);
    var val = document.getElementById('jbar-bg-vol-val');
    if (val) val.textContent = Math.round(bgVol * 100) + '%';
  }

  /* ══ POPUP HTML BUILDER ══
     Generates the full HTML for the about:blank popup window.
     The popup contains a full-screen iframe pointing to the game URL,
      plus a script that forwards hotkeys and mouse-at-bottom to the opener
      via postMessage, and listens for volume/close commands. */
  function buildPopupHTML(gameUrl, gameTitle) {
    var escaped = gameUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var innerScript = [
      '(function(){',
      '  var __jplayBridge = null;',
      '  try { __jplayBridge = new BroadcastChannel("__jplay_bridge__"); } catch(x) {}',
      '  function __jplayEmit(msg){',
      '    var sent = false;',
      '    try { if (window.opener) { window.opener.postMessage(msg, "*"); sent = true; } } catch(x) {}',
      '    if (!sent) { try { if (__jplayBridge) __jplayBridge.postMessage(msg); } catch(x) {} }',
      '  }',
      '  function __jplayStealth(){',
      '    try{if(window.opener&&window.opener.Hackwize&&typeof window.opener.Hackwize.hide==="function"){window.opener.Hackwize.hide();}}catch(x){}',
      '    __jplayEmit({type:"__jplay_stealth__"});',
      '  }',
      '  function __jplayIsEditable(target){',
      '    if(!target) return false;',
      '    var tag = (target.tagName || "").toUpperCase();',
      '    return !!target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";',
      '  }',
      '  document.addEventListener("keydown",function(e){',
      '    if(e.altKey&&(e.key==="j"||e.key==="J")){',
      '      e.preventDefault();',
      '      __jplayEmit({type:"__jplay_altj__"});',
      '    }',
      '    if(e.key==="0"&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!__jplayIsEditable(e.target)){',
      '      e.preventDefault();',
      '      __jplayStealth();',
      '    }',
      '  },true);',
      '  window.addEventListener("keydown",function(e){',
      '    if(e.key==="0"&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!__jplayIsEditable(e.target)){',
      '      e.preventDefault();',
      '      __jplayStealth();',
      '    }',
      '  },true);',
      '  document.addEventListener("mousemove",function(e){',
      '    if(e.clientY>window.innerHeight-80){',
      '      __jplayEmit({type:"__jplay_mousebottom__"});',
      '    }',
      '  });',
      '  var frameBridgeCode="(function(){if(window.__jplay_game_bridge_injected__)return;window.__jplay_game_bridge_injected__=true;function __jplayIsEditable(t){if(!t)return false;var tag=(t.tagName||\\\"\\\").toUpperCase();return !!t.isContentEditable||tag===\\\"INPUT\\\"||tag===\\\"TEXTAREA\\\"||tag===\\\"SELECT\\\";}document.addEventListener(\\\"keydown\\\",function(e){if(e.altKey&&(e.key===\\\"j\\\"||e.key===\\\"J\\\")){e.preventDefault();try{window.top.opener.postMessage({type:\\\"__jplay_altj__\\\"},\\\"*\\\");}catch(x){}}if(e.key===\\\"0\\\"&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!__jplayIsEditable(e.target)){e.preventDefault();try{if(window.top&&window.top.opener&&window.top.opener.Hackwize&&typeof window.top.opener.Hackwize.hide===\\\"function\\\"){window.top.opener.Hackwize.hide();}}catch(x){}try{window.top.opener.postMessage({type:\\\"__jplay_stealth__\\\"},\\\"*\\\");}catch(x){}}},true);document.addEventListener(\\\"mousemove\\\",function(e){if(e.clientY>window.innerHeight-80){try{window.top.opener.postMessage({type:\\\"__jplay_mousebottom__\\\"},\\\"*\\\");}catch(x){}}});})();";',
      '  var fr=document.getElementById("gf");',
      '  if(fr){',
      '    fr.addEventListener("keydown",function(e){',
      '      if(e.key==="0"&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!__jplayIsEditable(e.target)){',
      '        e.preventDefault();',
      '        __jplayStealth();',
      '      }',
      '    },true);',
      '    fr.addEventListener("load",function(){',
      '      try{',
      '        var d=fr.contentDocument||fr.contentWindow.document;',
      '        var s=d.createElement("script");',
      '        s.textContent=frameBridgeCode;',
      '        d.body.appendChild(s);',
      '      }catch(ex){}',
      '    });',
      '  }',
      '  window.addEventListener("message",function(e){',
      '    if(!e.data)return;',
      '    if(e.data.type==="jplay_volume"&&fr){',
      '      try{fr.contentWindow.postMessage({type:"jplay_volume",volume:e.data.volume},"*");}catch(x){}',
      '    }',
      '    if(e.data.type==="jplay_close"){window.close();}',
      '  });',
      '  window.addEventListener("beforeunload",function(){',
      '    __jplayEmit({type:"__jplay_win_closed__",id:window.__jplay_sess_id__});',
      '  });',
      '})();'
    ].join('');

    return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' + (gameTitle || 'Jplay Game') + '</title>' +
      '<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#000}' +
      '#gf{position:absolute;inset:0;width:100%;height:100%;border:none}</style></head>' +
      '<body><iframe id="gf" src=\'' + escaped + '\' allowfullscreen allow="autoplay; fullscreen; payment"></iframe>' +
      '<script>' + innerScript + '<\/script></body></html>';
  }

  /* ══ SESSION MANAGEMENT ══ */
  function buildGameUrl(game) {
    var url = game.url || '';
    var pwInput = document.getElementById('global-password-input');
    var pw = pwInput ? pwInput.value.trim() : '';
    if (pw) url += (url.indexOf('?') === -1 ? '?' : '&') + 'password=' + encodeURIComponent(pw);
    return url;
  }

  function openGame(game) {
    if (!game) return;
    addRecentlyPlayed(game);
    pauseBgMusic();

    /* Check existing session */
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].game.id === game.id) { switchTo(sessions[i].id); return; }
    }

    if (getNewTabMode()) {
      openGameNewTab(game);
    } else {
      openGameInline(game);
    }
  }

  function openGameNewTab(game) {
    var gameUrl = buildGameUrl(game);
    var popup = window.open('about:blank', '_blank');
    if (!popup) {
      /* Popup blocked — fallback to inline */
      openGameInline(game);
      return;
    }

    var id = 'sess_' + Date.now();
    popup.__jplay_sess_id__ = id;

    /* Write the popup HTML */
    try {
      popup.document.open();
      popup.document.write(buildPopupHTML(gameUrl, game.title));
      popup.document.close();
    } catch(e) {}

    var sess = { id: id, game: game, win: popup, vol: 1.0, newTab: true };
    sessions.push(sess);

    /* Poll for manual window close */
    var pollTimer = setInterval(function() {
      if (!popup.closed) return;
      clearInterval(pollTimer);
      for (var j = 0; j < sessions.length; j++) {
        if (sessions[j].id === id) { sessions.splice(j, 1); break; }
      }
      if (activeSession === id) {
        activeSession = sessions.length ? sessions[sessions.length - 1].id : null;
      }
      if (sessions.length === 0) resumeBgMusic();
      updateJbarInfo();
      renderSwitcher();
    }, 800);
    sess._pollTimer = pollTimer;

    try { popup.focus(); } catch(e) {}
    activeSession = id;
    updateJbarInfo();
    renderSwitcher();
  }

  function openGameInline(game) {
    var id     = 'sess_' + Date.now();
    var iframe = document.createElement('iframe');
    iframe.className       = 'jplay-game-iframe';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'autoplay; fullscreen; payment');
    iframe.src = buildGameUrl(game);

    var container = document.getElementById('jplay-game-container');
    if (container) container.appendChild(iframe);

    var sess = { id: id, game: game, iframe: iframe, vol: 1.0, newTab: false };
    sessions.push(sess);

    iframe.addEventListener('load', function () {
      injectAltJIntoIframe(iframe);
      setTimeout(reclaimKeyboardFocus, 50);
    });
    setTimeout(reclaimKeyboardFocus, 100);

    switchToInline(id);
  }

  function switchTo(id) {
    var sess = null;
    for (var j = 0; j < sessions.length; j++) {
      if (sessions[j].id === id) { sess = sessions[j]; break; }
    }
    if (!sess) return;
    activeSession = id;

    if (sess.newTab) {
      if (!sess.win.closed) { try { sess.win.focus(); } catch(e) {} }
      var overlay = document.getElementById('jplay-fullscreen-overlay');
      if (overlay) overlay.classList.remove('active');
    } else {
      switchToInline(id);
    }

    updateJbarInfo();
    closeSwitcher();
    closeJbarPanels();
    var detailOv = document.getElementById('detail-overlay');
    if (detailOv) detailOv.classList.remove('open');
    document.body.style.overflow = '';
  }

  function switchToInline(id) {
    for (var i = 0; i < sessions.length; i++) {
      if (!sessions[i].newTab && sessions[i].iframe) sessions[i].iframe.style.display = 'none';
    }
    var sess = null;
    for (var j = 0; j < sessions.length; j++) {
      if (sessions[j].id === id) { sess = sessions[j]; break; }
    }
    if (!sess || sess.newTab) return;
    activeSession = id;
    sess.iframe.style.display = 'block';
    var overlay = document.getElementById('jplay-fullscreen-overlay');
    if (overlay) overlay.classList.add('active');
    updateJbarInfo();
    closeSwitcher();
    closeJbarPanels();
    var detailOv = document.getElementById('detail-overlay');
    if (detailOv) detailOv.classList.remove('open');
    document.body.style.overflow = '';
  }

  function closeGame(id) {
    var idx = -1;
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return;
    var sess = sessions[idx];

    if (sess.newTab) {
      if (sess._pollTimer) clearInterval(sess._pollTimer);
      if (!sess.win.closed) {
        try { sess.win.postMessage({ type: 'jplay_close' }, '*'); } catch(e) {}
        setTimeout(function() { try { if (!sess.win.closed) sess.win.close(); } catch(e2) {} }, 200);
      }
    } else {
      if (sess.iframe) { sess.iframe.src = 'about:blank'; sess.iframe.remove(); }
    }

    sessions.splice(idx, 1);

    if (sessions.length === 0) {
      activeSession = null;
      var overlay = document.getElementById('jplay-fullscreen-overlay');
      if (overlay) overlay.classList.remove('active');
      resumeBgMusic();
    } else {
      switchTo(sessions[sessions.length - 1].id);
    }
    updateJbarInfo();
  }

  function closeActiveGame() {
    if (!activeSession) return;
    closeGame(activeSession);
  }

  function getActiveSession() {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === activeSession) return sessions[i];
    }
    return null;
  }

  /* ── Key-intercept overlay (inline mode) ── */
  var keyInterceptEl = null;
  function buildKeyInterceptOverlay() {
    if (keyInterceptEl) return;
    keyInterceptEl = document.createElement('div');
    keyInterceptEl.id = 'jplay-key-intercept';
    keyInterceptEl.setAttribute('tabindex', '-1');
    keyInterceptEl.style.cssText = 'position:fixed;inset:0;z-index:9;pointer-events:none;outline:none;background:transparent';
    keyInterceptEl.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault(); e.stopPropagation();
        if (jbarVisible) hideJbar(); else showJbar('altj');
      }
      if (e.key === '0' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof Hackwize !== 'undefined' && typeof Hackwize.hide === 'function') {
          Hackwize.hide();
        }
      }
    }, true);
    document.body.appendChild(keyInterceptEl);
  }

  function injectAltJIntoIframe(iframe) {
    var script = '(function(){if(window.__jplay_game_bridge_injected__)return;window.__jplay_game_bridge_injected__=true;function __jplayIsEditable(t){if(!t)return false;var tag=(t.tagName||"").toUpperCase();return !!t.isContentEditable||tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";}document.addEventListener("keydown",function(e){if(e.altKey&&(e.key==="j"||e.key==="J")){e.preventDefault();try{window.top.postMessage({type:"__jplay_altj__"},"*");}catch(ex){}}if(e.key==="0"&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!__jplayIsEditable(e.target)){e.preventDefault();try{if(window.top&&window.top.Hackwize&&typeof window.top.Hackwize.hide==="function"){window.top.Hackwize.hide();}}catch(ex){}try{window.top.postMessage({type:"__jplay_stealth__"},"*");}catch(ex){}}},true);document.addEventListener("mousemove",function(e){if(e.clientY>window.innerHeight-80){try{window.top.postMessage({type:"__jplay_mousebottom__"},"*");}catch(ex){}}});})();';
    try {
      var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (doc && doc.body) {
        var s = doc.createElement('script');
        s.textContent = script;
        doc.body.appendChild(s);
      }
    } catch(ex) {}
  }

  function reclaimKeyboardFocus() {
    buildKeyInterceptOverlay();
    if (keyInterceptEl) { try { keyInterceptEl.focus({ preventScroll: true }); } catch(e) {} }
  }

  var _focusPollTimer = null;
  function startFocusPoll() {
    if (_focusPollTimer) return;
    _focusPollTimer = setInterval(function () {
      if (sessions.length === 0) return;
      var ae = document.activeElement;
      if (ae && ae.tagName === 'IFRAME') reclaimKeyboardFocus();
    }, 300);
  }

  /* ══ JBAR UI ══ */
  /* intent: 'altj'  = explicit Alt+J toggle — never auto-hides
             'mouse' = mouse-at-bottom trigger — auto-hides after 4 s
             (omitted) = default, auto-hides                          */
  function showJbar(intent) {
    jbarVisible = true;
    jbarAltJMode = (intent === 'altj');
    var bar = document.getElementById('jbar');
    if (bar) bar.classList.add('visible');
    if (intent === 'altj') {
      clearTimeout(jbarTimeout);
      jbarTimeout = null;
    } else {
      resetJbarHideTimer();
    }
  }

  function hideJbar() {
    jbarVisible = false;
    jbarAltJMode = false;
    clearTimeout(jbarTimeout);
    jbarTimeout = null;
    var bar = document.getElementById('jbar');
    if (bar) {
      bar.classList.add('hiding');
      setTimeout(function () {
        bar.classList.remove('visible');
        bar.classList.remove('hiding');
        closeJbarPanels();
      }, 300);
    } else { closeJbarPanels(); }
  }

  function resetJbarHideTimer() {
    clearTimeout(jbarTimeout);
    jbarTimeout = setTimeout(function () { if (jbarVisible) hideJbar(); }, 4000);
  }

  function updateJbarInfo() {
    var sess     = getActiveSession();
    var icon     = document.getElementById('jbar-game-icon');
    var name     = document.getElementById('jbar-game-name');
    var backBtn  = document.getElementById('jbar-back-btn');
    var reloadBtn= document.getElementById('jbar-reload-btn');
    var noGame   = document.getElementById('jbar-no-game');
    if (sess) {
      if (icon)  { icon.src = sess.game.icon || ''; icon.style.display = sess.game.icon ? 'block' : 'none'; }
      if (name)  name.textContent = sess.game.title || 'Unknown Game';
      if (backBtn)   backBtn.removeAttribute('disabled');
      if (reloadBtn) reloadBtn.removeAttribute('disabled');
      if (noGame) noGame.style.display = 'none';
    } else {
      if (icon)  icon.style.display = 'none';
      if (name)  name.textContent = 'No Game Launched';
      if (backBtn)   backBtn.setAttribute('disabled', '');
      if (reloadBtn) reloadBtn.setAttribute('disabled', '');
      if (noGame) noGame.style.display = 'block';
    }
  }

  function startClock() {
    function tick() {
      var el = document.getElementById('jbar-clock');
      if (!el) return;
      var now = new Date(), h = now.getHours(), m = now.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      el.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }
    tick();
    clockInterval = setInterval(tick, 60000);
  }

  /* ══ PANELS ══ */
  function closeJbarPanels() {
    var vp = document.getElementById('jbar-vol-panel');
    var sp = document.getElementById('jbar-switcher-panel');
    if (vp) vp.classList.remove('open');
    if (sp) sp.classList.remove('open');
  }

  function toggleVolPanel() {
    var vp = document.getElementById('jbar-vol-panel');
    if (!vp) return;
    var sp = document.getElementById('jbar-switcher-panel');
    if (sp) sp.classList.remove('open');
    vp.classList.toggle('open');
    renderVolPanel();
    resetJbarHideTimer();
  }

  function renderVolPanel() {
    var bgSlider = document.getElementById('jbar-bg-vol-slider');
    if (bgSlider) bgSlider.value = Math.round(bgVol * 100);
    var bgVal = document.getElementById('jbar-bg-vol-val');
    if (bgVal)  bgVal.textContent = Math.round(bgVol * 100) + '%';

    var gameVols = document.getElementById('jbar-game-vols');
    if (!gameVols) return;
    gameVols.innerHTML = '';

    if (sessions.length === 0) {
      gameVols.innerHTML = '<div class="jbar-vol-empty">No games open</div>';
      return;
    }

    sessions.forEach(function (sess) {
      var row = document.createElement('div');
      row.className = 'jbar-vol-game-row';

      var icon = document.createElement('img');
      icon.className = 'jbar-vol-game-icon';
      icon.src = sess.game.icon || '';
      icon.style.display = sess.game.icon ? 'block' : 'none';

      var fb = document.createElement('div');
      fb.className = 'jbar-vol-game-fb';
      fb.textContent = (sess.game.title || '?').slice(0, 2).toUpperCase();
      fb.style.display = sess.game.icon ? 'none' : 'flex';

      var info = document.createElement('div');
      info.className = 'jbar-vol-game-info';
      info.textContent = sess.game.title || '';
      if (sess.newTab) {
        var badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.65rem;color:var(--text3);margin-left:4px;opacity:0.7';
        badge.textContent = '↗ tab';
        info.appendChild(badge);
      }

      var slider = document.createElement('input');
      slider.type = 'range'; slider.min = 0; slider.max = 100;
      slider.value = Math.round(sess.vol * 100);
      slider.className = 'jbar-vol-slider';

      var val = document.createElement('span');
      val.className = 'jbar-vol-val';
      val.textContent = Math.round(sess.vol * 100) + '%';

      ;(function (s, sl, v) {
        sl.addEventListener('input', function () {
          s.vol = sl.value / 100;
          v.textContent = sl.value + '%';
          if (s.newTab) {
            if (!s.win.closed) {
              try { s.win.postMessage({ type: 'jplay_volume', volume: s.vol }, '*'); } catch(e) {}
            }
          } else if (s.iframe) {
            try { s.iframe.contentWindow.postMessage({ type: 'jplay_volume', volume: s.vol }, '*'); } catch(e) {}
          }
        });
      })(sess, slider, val);

      row.appendChild(icon); row.appendChild(fb); row.appendChild(info);
      row.appendChild(slider); row.appendChild(val);
      gameVols.appendChild(row);
    });
  }

  /* ══ GAME SWITCHER ══ */
  function openSwitcher() {
    var sp = document.getElementById('jbar-switcher-panel');
    if (!sp) return;
    var vp = document.getElementById('jbar-vol-panel');
    if (vp) vp.classList.remove('open');
    sp.classList.add('open');
    renderSwitcher();
    resetJbarHideTimer();
  }

  function closeSwitcher() {
    var sp = document.getElementById('jbar-switcher-panel');
    if (sp) sp.classList.remove('open');
  }

  function renderSwitcher() {
    var grid = document.getElementById('jbar-switcher-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var addCard = document.createElement('div');
    addCard.className = 'jbar-switcher-card jbar-switcher-add';
    addCard.innerHTML = '<div class="jbar-switcher-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div><span>New Game</span>';
    addCard.addEventListener('click', function () {
      closeSwitcher(); hideJbar();
      if (typeof safeNavigateTo === 'function') safeNavigateTo('home');
      var overlay = document.getElementById('jplay-fullscreen-overlay');
      if (overlay) overlay.classList.remove('active');
    });
    grid.appendChild(addCard);

    sessions.forEach(function (sess) {
      var card = document.createElement('div');
      card.className = 'jbar-switcher-card' + (sess.id === activeSession ? ' active' : '');

      var thumb = document.createElement('div');
      thumb.className = 'jbar-switcher-thumb';
      thumb.style.position = 'relative';
      if (sess.game.background) {
        thumb.style.backgroundImage = "url('" + sess.game.background + "')";
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
      } else {
        thumb.style.background = 'linear-gradient(135deg,' + (sess.game.color || '#1a2a4a') + ' 0%,#0a0c10 100%)';
      }
      var thumbLabel = document.createElement('div');
      thumbLabel.className = 'jbar-switcher-thumb-label';
      thumbLabel.textContent = (sess.game.title || '??').slice(0, 2).toUpperCase();
      thumb.appendChild(thumbLabel);

      if (sess.newTab) {
        var tabIcon = document.createElement('div');
        tabIcon.style.cssText = 'position:absolute;top:4px;right:4px;font-size:0.6rem;background:rgba(59,130,246,0.75);color:#fff;border-radius:3px;padding:1px 4px;line-height:1.4;font-weight:700';
        tabIcon.textContent = '↗';
        thumb.appendChild(tabIcon);
      }

      var label = document.createElement('span');
      label.className = 'jbar-switcher-label';
      label.textContent = sess.game.title || '';

      var closeBtn = document.createElement('button');
      closeBtn.className = 'jbar-switcher-close';
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      closeBtn.title = 'Close';
      ;(function (sid) {
        closeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          closeGame(sid);
          renderSwitcher();
        });
      })(sess.id);

      card.appendChild(thumb); card.appendChild(label); card.appendChild(closeBtn);
      ;(function (sid) {
        card.addEventListener('click', function () { switchTo(sid); });
      })(sess.id);
      grid.appendChild(card);
    });
  }

  /* ══ DOM CONSTRUCTION ══ */
  function buildDOM() {
    var overlay = document.createElement('div');
    overlay.id = 'jplay-fullscreen-overlay';

    var container = document.createElement('div');
    container.id = 'jplay-game-container';
    overlay.appendChild(container);

    var sentinel = document.createElement('div');
    sentinel.id = 'jplay-jbar-sentinel';
    sentinel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:60px;z-index:10;pointer-events:all;background:transparent;cursor:default';
    sentinel.addEventListener('mousemove', function () {
      var ov = document.getElementById('jplay-fullscreen-overlay');
      if (ov && ov.classList.contains('active')) showJbar('mouse');
    });
    overlay.appendChild(sentinel);

    var bar = document.createElement('div');
    bar.id = 'jbar';
    bar.innerHTML = [
      '<div class="jbar-left">',
        '<img id="jbar-game-icon" class="jbar-game-icon" src="" alt="" style="display:none"/>',
        '<span id="jbar-game-name" class="jbar-game-name">No Game Launched</span>',
        '<span id="jbar-no-game" class="jbar-no-game-tag">No game launched</span>',
      '</div>',
      '<div class="jbar-center">',
        '<button id="jbar-back-btn" class="jbar-btn" title="Go Back" disabled>',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
        '</button>',
        '<button id="jbar-reload-btn" class="jbar-btn" title="Reload Game" disabled>',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>',
        '</button>',
        '<button id="jbar-vol-btn" class="jbar-btn" title="Volume">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
        '</button>',
        '<button id="jbar-switch-btn" class="jbar-btn" title="Game Switcher">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="8" height="6" rx="1"/><rect x="14" y="3" width="8" height="6" rx="1"/><rect x="2" y="15" width="8" height="6" rx="1"/><rect x="14" y="15" width="8" height="6" rx="1"/></svg>',
        '</button>',
        '<button id="jbar-exit-btn" class="jbar-btn jbar-exit" title="Exit Game">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '</button>',
      '</div>',
      '<div class="jbar-right">',
        '<span id="jbar-clock" class="jbar-clock">12:00 AM</span>',
      '</div>',
      '<div id="jbar-vol-panel" class="jbar-panel">',
        '<div class="jbar-panel-title">Volume</div>',
        '<div class="jbar-vol-row">',
          '<span class="jbar-vol-label">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
            'Background Music',
          '</span>',
          '<input type="range" id="jbar-bg-vol-slider" class="jbar-vol-slider" min="0" max="100" value="40"/>',
          '<span id="jbar-bg-vol-val" class="jbar-vol-val">40%</span>',
        '</div>',
        '<div class="jbar-panel-sep"></div>',
        '<div class="jbar-panel-subtitle">Game Volume</div>',
        '<div id="jbar-game-vols"></div>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    document.body.appendChild(bar);

    var switcherPanel = document.createElement('div');
    switcherPanel.id = 'jbar-switcher-panel';
    switcherPanel.className = 'jbar-switcher-panel';
    switcherPanel.innerHTML = [
      '<div class="jbar-switcher-header">',
        '<span>Open Games</span>',
        '<button id="jbar-switcher-close-btn" class="jbar-switcher-close-panel">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '</button>',
      '</div>',
      '<div id="jbar-switcher-grid" class="jbar-switcher-grid"></div>',
    ].join('');
    document.body.appendChild(switcherPanel);

    wireEvents();
    startClock();
    updateJbarInfo();
  }

  function wireEvents() {
    function handleBridgeMessage(data) {
      if (!data) return;
      if (data.type === '__jplay_altj__') {
        if (jbarVisible) hideJbar(); else showJbar('altj');
      }
      if (data.type === '__jplay_mousebottom__') {
        showJbar('mouse');
      }
      if (data.type === '__jplay_stealth__') {
        if (typeof Hackwize !== 'undefined' && typeof Hackwize.hide === 'function') {
          Hackwize.hide();
        }
      }
      if (data.type === '__jplay_win_closed__' && data.id) {
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i].id === data.id) { closeGame(data.id); break; }
        }
      }
    }

    if (!bridgeChannel && typeof BroadcastChannel !== 'undefined') {
      try {
        bridgeChannel = new BroadcastChannel('__jplay_bridge__');
        bridgeChannel.addEventListener('message', function(e){ handleBridgeMessage(e.data); });
      } catch(e) {}
    }

    window.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        if (jbarVisible) hideJbar(); else showJbar('altj');
      }
    }, true);

    window.addEventListener('message', function (e) {
      handleBridgeMessage(e.data);
    });

    window.addEventListener('blur', function () {
      for (var i = 0; i < sessions.length; i++) {
        if (!sessions[i].newTab && sessions[i].iframe) injectAltJIntoIframe(sessions[i].iframe);
      }
      setTimeout(reclaimKeyboardFocus, 0);
    });

    startFocusPoll();

    document.addEventListener('mousemove', function (e) {
      var hasInline = sessions.some(function(s){ return !s.newTab; });
      if (!hasInline) return;
      var ov = document.getElementById('jplay-fullscreen-overlay');
      if (!ov || !ov.classList.contains('active')) return;
      if (e.clientY > window.innerHeight - 80) showJbar('mouse');
    });

    var bar = document.getElementById('jbar');
    if (bar) {
      bar.addEventListener('mouseenter', function () { clearTimeout(jbarTimeout); });
      bar.addEventListener('mouseleave', function () { if (sessions.length > 0 && !jbarAltJMode) resetJbarHideTimer(); });
    }

    var backBtn = document.getElementById('jbar-back-btn');
    if (backBtn) backBtn.addEventListener('click', function () {
      var sess = getActiveSession();
      if (!sess) return;
      if (sess.newTab) { try { sess.win.history.back(); } catch(e) {} }
      else { try { sess.iframe.contentWindow.history.back(); } catch(e) {} }
      resetJbarHideTimer();
    });

    var reloadBtn = document.getElementById('jbar-reload-btn');
    if (reloadBtn) reloadBtn.addEventListener('click', function () {
      var sess = getActiveSession();
      if (!sess) return;
      if (sess.newTab) { try { sess.win.location.reload(); } catch(e) {} }
      else { sess.iframe.src = buildGameUrl(sess.game); }
      resetJbarHideTimer();
    });

    var volBtn = document.getElementById('jbar-vol-btn');
    if (volBtn) volBtn.addEventListener('click', function () { toggleVolPanel(); });

    var bgSlider = document.getElementById('jbar-bg-vol-slider');
    if (bgSlider) bgSlider.addEventListener('input', function () { setBgVol(bgSlider.value / 100); });

    var switchBtn = document.getElementById('jbar-switch-btn');
    if (switchBtn) switchBtn.addEventListener('click', function () { openSwitcher(); });

    var switchClose = document.getElementById('jbar-switcher-close-btn');
    if (switchClose) switchClose.addEventListener('click', function () { closeSwitcher(); resetJbarHideTimer(); });

    var exitBtn = document.getElementById('jbar-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', function () { closeActiveGame(); hideJbar(); });
  }

  function init() {
    buildDOM();
    initBgMusic();
  }

  return {
    init:               init,
    openGame:           openGame,
    switchTo:           switchTo,
    closeGame:          closeActiveGame,
    closeGameById:      closeGame,
    getRecentlyPlayed:  getRecentlyPlayed,
    addRecentlyPlayed:  addRecentlyPlayed,
    showJbar:           showJbar,
    hideJbar:           hideJbar,
    isJbarVisible:      function() { return jbarVisible; },
    pauseBg:            pauseBgMusic,
    resumeBg:           resumeBgMusic,
    sessions:           sessions,
    getNewTabMode:      getNewTabMode,
    setNewTabMode:      setNewTabMode,
  };
})();

/* ══════════════════════════════════════════════
   SECURITY / LOCK SCREEN
══════════════════════════════════════════════ */
var JplaySecurity = (function () {
  var STORE = {
    get: function(k)    { try { return JSON.parse(localStorage.getItem('__jplay_sec_'+k+'__')); } catch(e) { return null; } },
    set: function(k, v) { try { localStorage.setItem('__jplay_sec_'+k+'__', JSON.stringify(v)); } catch(e) {} },
    del: function(k)    { try { localStorage.removeItem('__jplay_sec_'+k+'__'); } catch(e) {} },
  };
  function getConfig() { return STORE.get('config') || { type: null, value: null, wallpaper: null }; }
  function saveConfig(cfg) { STORE.set('config', cfg); }

  function check() {
    var cfg = getConfig();
    if (!cfg.type || !cfg.value) return;
    showLockScreen(cfg);
  }

  function showLockScreen(cfg) {
    var ls = document.createElement('div');
    ls.id = 'jplay-lockscreen';
    if (cfg.wallpaper) {
      ls.style.backgroundImage = "url('" + cfg.wallpaper + "')";
      ls.style.backgroundSize = 'cover';
      ls.style.backgroundPosition = 'center';
    }
    var overlay = document.createElement('div');
    overlay.className = 'lockscreen-overlay';
    var box = document.createElement('div');
    box.className = 'lockscreen-box';
    var clockDiv = document.createElement('div');
    clockDiv.className = 'lockscreen-clock';
    function updateClock() {
      var now = new Date(), h = now.getHours(), m = now.getMinutes();
      var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
      clockDiv.innerHTML = '<span class="lc-time">' + h + ':' + (m<10?'0':'') + m + '</span><span class="lc-ampm"> ' + ap + '</span>';
    }
    updateClock(); setInterval(updateClock, 10000);
    var title = document.createElement('div');
    title.className = 'lockscreen-title'; title.textContent = 'Jplay is locked';
    var sub = document.createElement('div');
    sub.className = 'lockscreen-sub';
    sub.textContent = cfg.type === 'pin' ? 'Enter your PIN' : 'Enter your password';
    var input = document.createElement('input');
    input.type = cfg.type === 'pin' ? 'number' : 'password';
    input.className = 'lockscreen-input';
    input.placeholder = cfg.type === 'pin' ? '● ● ● ●' : 'Password…';
    input.setAttribute('inputmode', cfg.type === 'pin' ? 'numeric' : 'text');
    input.setAttribute('autocomplete', 'off');
    var err = document.createElement('div'); err.className = 'lockscreen-err';
    var unlockBtn = document.createElement('button');
    unlockBtn.className = 'lockscreen-btn'; unlockBtn.textContent = 'Unlock';
    function attempt() {
      if (input.value.trim() === String(cfg.value)) {
        box.classList.add('unlock-anim');
        setTimeout(function () { ls.classList.add('fade-out'); setTimeout(function () { ls.remove(); }, 600); }, 400);
      } else {
        err.textContent = 'Incorrect ' + (cfg.type === 'pin' ? 'PIN' : 'password');
        input.value = ''; box.classList.add('shake');
        setTimeout(function () { box.classList.remove('shake'); }, 500);
      }
    }
    unlockBtn.addEventListener('click', attempt);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') attempt(); });
    box.appendChild(clockDiv); box.appendChild(title); box.appendChild(sub);
    box.appendChild(input); box.appendChild(err); box.appendChild(unlockBtn);
    overlay.appendChild(box); ls.appendChild(overlay);
    document.body.appendChild(ls);
    setTimeout(function () { input.focus(); }, 300);
  }

  function buildSettingsPanel() {
    var cfg = getConfig();
    var card = document.createElement('div');
    card.className = 'settings-card'; card.id = 'settings-security-card';
    card.innerHTML = [
      '<div class="settings-card-label">Security</div>',
      '<div class="setting-row">',
        '<div class="setting-info"><span class="setting-name">Enable Lock Screen</span><span class="setting-desc">Require PIN or password to open Jplay</span></div>',
        '<label class="toggle"><input type="checkbox" id="sec-enabled-toggle"' + (cfg.type ? ' checked' : '') + '/><span class="toggle-track"><span class="toggle-thumb"></span></span></label>',
      '</div>',
      '<div class="setting-row" id="sec-type-row"' + (cfg.type ? '' : ' style="display:none"') + '>',
        '<div class="setting-info"><span class="setting-name">Lock Type</span><span class="setting-desc">PIN (numeric) or Password (text)</span></div>',
        '<select class="setting-select" id="sec-type-select">',
          '<option value="pin"' + (cfg.type === 'pin' ? ' selected' : '') + '>PIN</option>',
          '<option value="password"' + (cfg.type === 'password' ? ' selected' : '') + '>Password</option>',
        '</select>',
      '</div>',
      '<div class="setting-row" id="sec-value-row"' + (cfg.type ? '' : ' style="display:none"') + '>',
        '<div class="setting-info"><span class="setting-name">PIN / Password</span><span class="setting-desc">Set your unlock code</span></div>',
        '<div class="password-input-wrap">',
          '<input type="password" class="setting-input password-field" id="sec-value-input" placeholder="Set PIN or password…" value="' + (cfg.value || '') + '" autocomplete="new-password"/>',
          '<button class="password-toggle-btn" id="sec-val-toggle-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>',
        '</div>',
      '</div>',
      '<div class="setting-row" id="sec-wp-row"' + (cfg.type ? '' : ' style="display:none"') + '>',
        '<div class="setting-info"><span class="setting-name">Lock Screen Wallpaper</span><span class="setting-desc">Background on the lock screen</span></div>',
        '<button class="upload-browse-btn" id="sec-wp-btn">Choose…</button>',
      '</div>',
      '<div id="sec-wp-preview-row" style="display:' + (cfg.wallpaper ? '' : 'none') + ';padding:8px 0">',
        '<img id="sec-wp-preview" src="' + (cfg.wallpaper || '') + '" style="width:80px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--border2)"/>',
      '</div>',
      '<div class="setting-row" id="sec-save-row"' + (cfg.type ? '' : ' style="display:none"') + ' style="border-bottom:none;padding-bottom:0">',
        '<div class="setting-info"><span class="setting-name"></span></div>',
        '<button class="upload-browse-btn" id="sec-save-btn">Save Security Settings</button>',
      '</div>',
      '<div id="sec-status" style="font-size:0.75rem;color:#4ade80;padding:6px 0;display:none">✓ Saved</div>',
    ].join('');
    setTimeout(function () { wireSecurityPanel(cfg); }, 0);
    return card;
  }

  function wireSecurityPanel(cfg) {
    var toggle = document.getElementById('sec-enabled-toggle');
    var typeRow = document.getElementById('sec-type-row');
    var valueRow = document.getElementById('sec-value-row');
    var wpRow = document.getElementById('sec-wp-row');
    var saveRow = document.getElementById('sec-save-row');
    function toggleRows(show) {
      [typeRow, valueRow, wpRow, saveRow].forEach(function (r) { if (r) r.style.display = show ? '' : 'none'; });
    }
    if (toggle) toggle.addEventListener('change', function () { toggleRows(toggle.checked); });
    var valInput = document.getElementById('sec-value-input');
    var valToggle = document.getElementById('sec-val-toggle-btn');
    if (valToggle && valInput) valToggle.addEventListener('click', function () {
      valInput.type = valInput.type === 'password' ? 'text' : 'password';
    });
    var wpBtn = document.getElementById('sec-wp-btn');
    var wpPreview = document.getElementById('sec-wp-preview');
    var wpPrevRow = document.getElementById('sec-wp-preview-row');
    var _wpUrl = cfg.wallpaper || null;
    if (wpBtn) wpBtn.addEventListener('click', function () {
      showWpPicker(function (url) {
        _wpUrl = url;
        if (wpPreview) wpPreview.src = url;
        if (wpPrevRow) wpPrevRow.style.display = '';
      });
    });
    var saveBtn = document.getElementById('sec-save-btn');
    var status = document.getElementById('sec-status');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var enabled = toggle && toggle.checked;
      if (!enabled) {
        saveConfig({ type: null, value: null, wallpaper: null });
      } else {
        var typeEl = document.getElementById('sec-type-select');
        var type = typeEl ? typeEl.value : 'pin';
        var val = valInput ? valInput.value.trim() : '';
        if (!val) { if(status){status.textContent='Please enter a PIN or password.';status.style.color='#ef4444';status.style.display='';} return; }
        saveConfig({ type: type, value: val, wallpaper: _wpUrl });
      }
      if (status) { status.textContent = '✓ Saved'; status.style.color = '#4ade80'; status.style.display = ''; setTimeout(function(){ status.style.display = 'none'; }, 2000); }
    });
  }

  function showWpPicker(cb) {
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;width:min(480px,90vw);max-height:80vh;overflow-y:auto;display:flex;flex-direction:column;gap:16px';
    var title = document.createElement('div');
    title.style.cssText = 'font-family:Syne,sans-serif;font-weight:700;font-size:1rem;color:var(--text)';
    title.textContent = 'Choose Lock Screen Wallpaper';
    var subA = document.createElement('div');
    subA.style.cssText = 'font-size:0.78rem;color:var(--text3);margin-bottom:4px';
    subA.textContent = 'From Wallpapers';
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
    var wps = (typeof state !== 'undefined' && state.wallpapers) ? state.wallpapers : [];
    if (wps.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;font-size:0.78rem;color:var(--text3);padding:8px">No wallpapers loaded. Use custom URL below.</div>';
    }
    wps.forEach(function (wp) {
      var card = document.createElement('div');
      card.style.cssText = 'border-radius:8px;overflow:hidden;aspect-ratio:16/9;cursor:pointer;border:2px solid transparent;transition:border-color 0.15s';
      if (wp.color) card.style.background = wp.color;
      if (wp.url || wp.thumbnail) {
        var img = document.createElement('img');
        img.src = wp.thumbnail || wp.url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        card.appendChild(img);
      }
      card.addEventListener('click', function () { cb(wp.url || wp.thumbnail || wp.color); modal.remove(); });
      grid.appendChild(card);
    });
    var subB = document.createElement('div');
    subB.style.cssText = 'font-size:0.78rem;color:var(--text3)';
    subB.textContent = 'Or enter an image URL';
    var urlWrap = document.createElement('div');
    urlWrap.style.cssText = 'display:flex;gap:8px';
    var urlIn = document.createElement('input');
    urlIn.type = 'text'; urlIn.placeholder = 'https://example.com/image.jpg';
    urlIn.className = 'setting-input'; urlIn.style.flex = '1';
    var urlBtn = document.createElement('button');
    urlBtn.className = 'upload-browse-btn'; urlBtn.textContent = 'Use';
    urlBtn.addEventListener('click', function () { var u = urlIn.value.trim(); if (u) { cb(u); modal.remove(); } });
    urlWrap.appendChild(urlIn); urlWrap.appendChild(urlBtn);
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
    var uploadBtn = document.createElement('button');
    uploadBtn.className = 'upload-browse-btn'; uploadBtn.textContent = 'Upload Image';
    uploadBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function (e) { cb(e.target.result); modal.remove(); };
      reader.readAsDataURL(f);
    });
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'reset-btn'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { modal.remove(); });
    box.appendChild(title); box.appendChild(subA); box.appendChild(grid);
    box.appendChild(subB); box.appendChild(urlWrap);
    box.appendChild(fileInput); box.appendChild(uploadBtn); box.appendChild(cancelBtn);
    modal.appendChild(box); document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  }

  return { check: check, buildSettingsPanel: buildSettingsPanel };
})();

/* ══════════════════════════════════════════════
   SETUP / ONBOARDING SCREEN
══════════════════════════════════════════════ */
var JplaySetup = (function () {
  var DONE_KEY = '__jplay_setup_done__';
  var slides = [
    {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56"><polygon points="5 3 19 12 5 21 5 3" fill="rgba(59,130,246,0.2)" stroke="#3b82f6"/></svg>',
      title: 'Welcome to Jplay',
      desc:  'Your all-in-one browser gaming hub. Play hundreds of games instantly without downloads or sign-ups.',
    },
    {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56"><rect x="2" y="3" width="7" height="18" rx="1" fill="rgba(59,130,246,0.15)" stroke="#3b82f6"/><rect x="9" y="3" width="7" height="18" rx="1" fill="rgba(59,130,246,0.1)" stroke="#3b82f6"/><rect x="16" y="3" width="7" height="18" rx="1" fill="rgba(59,130,246,0.05)" stroke="#3b82f6"/></svg>',
      title: 'Games Open in New Tabs',
      desc:  'Each game launches in its own window. Use the JBar switcher to jump between games, close them, or adjust volume — all from the main tab.',
    },
    {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56"><circle cx="12" cy="12" r="10" fill="rgba(59,130,246,0.1)" stroke="#3b82f6"/><path d="M12 8v4l3 3" stroke="#3b82f6"/></svg>',
      title: 'Recently Played',
      desc:  'Jplay remembers your last 10 games so you can jump back in from the home screen any time.',
    },
    {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(59,130,246,0.1)" stroke="#3b82f6"/></svg>',
      title: 'Stealth Mode',
      desc:  'Press <kbd style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:1px 7px">0</kbd> to instantly hide Jplay and show a fake classroom site. Press again to return.<br/><br/><span style="font-size:0.7rem;color:#4a5568">Powered By Hackwize.JS — By Jxo</span>',
    },
  ];

  function show() {
    if (localStorage.getItem(DONE_KEY)) return;
    var ov = document.createElement('div');
    ov.id = 'jplay-setup-overlay';
    var box = document.createElement('div');
    box.className = 'setup-box';
    var slideArea = document.createElement('div');
    slideArea.className = 'setup-slide-area';
    var dots = document.createElement('div');
    dots.className = 'setup-dots';
    var navRow = document.createElement('div');
    navRow.className = 'setup-nav';
    var prevBtn = document.createElement('button');
    prevBtn.className = 'setup-nav-btn'; prevBtn.textContent = '← Back';
    var nextBtn = document.createElement('button');
    nextBtn.className = 'setup-nav-btn setup-nav-primary'; nextBtn.textContent = 'Next →';
    navRow.appendChild(prevBtn); navRow.appendChild(nextBtn);
    box.appendChild(slideArea); box.appendChild(dots); box.appendChild(navRow);
    ov.appendChild(box); document.body.appendChild(ov);
    var idx = 0;
    function renderSlide() {
      var s = slides[idx];
      slideArea.innerHTML = '<div class="setup-slide"><div class="setup-slide-icon">' + s.icon + '</div><h2 class="setup-slide-title">' + s.title + '</h2><p class="setup-slide-desc">' + s.desc + '</p></div>';
      dots.innerHTML = '';
      for (var i = 0; i < slides.length; i++) {
        var dot = document.createElement('div');
        dot.className = 'setup-dot' + (i === idx ? ' active' : '');
        dots.appendChild(dot);
      }
      prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = idx === slides.length - 1 ? 'Get Started!' : 'Next →';
    }
    renderSlide();
    prevBtn.addEventListener('click', function () { if (idx > 0) { idx--; renderSlide(); } });
    nextBtn.addEventListener('click', function () {
      if (idx < slides.length - 1) { idx++; renderSlide(); }
      else { localStorage.setItem(DONE_KEY, '1'); ov.classList.add('fade-out'); setTimeout(function () { ov.remove(); }, 500); }
    });
  }

  return { show: show };
})();
