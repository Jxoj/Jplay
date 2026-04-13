'use strict';

/**
 * HACKWIZE.JS
 * Tab cloaking + disappear mode + no-history mode.
 */
const Hackwize = (function () {

  const STORAGE_KEY = '__jplay_hackwize_cfg__';
  const SESSION_KEY = '__jplay_no_history_ready__';

  const DEFAULTS = {
    title:            'Home',
    favicon:          'https://ssl.gstatic.com/classroom/favicon.png',
    redirectUrl:      'https://classroom.google.com',
    hideKey:          '0',
    noHistoryEnabled: true,
    mimicSite:        'google_classroom',
    mimicCustomUrl:   '',
    mimicUser:        '',
    mimicColor:       '#1a73e8',
  };

  let _cfg              = Object.assign({}, DEFAULTS);
  let _disappearEnabled = true;
  let _isHidden         = false;
  let _toastTimer       = null;
  let _redirectTab      = null; /* reference to the tab opened on hide() */

  /* ─── PUBLIC: init ──────────────────────────────────────────────────────── */
  function init(options) {
    _cfg = Object.assign({}, DEFAULTS, _loadPersisted(), options || {});
    _applyCloak(_cfg.title, _cfg.favicon);
    _registerKeyHandler();
    _registerPostMessageHandler();
    _syncInputsFromConfig();

    if (_cfg.noHistoryEnabled && !_isNoHistoryContext()) {
      _openNoHistoryWindow();
    }
  }

  /* ─── PUBLIC: setCloak ──────────────────────────────────────────────────── */
  function setCloak(title, faviconUrl) {
    _applyCloak(
      title      != null ? title      : _cfg.title,
      faviconUrl != null ? faviconUrl : _cfg.favicon
    );
  }

  /* ─── PUBLIC: hide ──────────────────────────────────────────────────────── */
  function hide() {
    if (_isHidden) return;
    _isHidden = true;

    _setAppVisible(false);
    _showMimicOverlay();

    /* Open redirect URL and keep a reference so we can close it on restore */
    var url = _readRedirectUrl();
    if (url) {
      try {
        _redirectTab = window.open(url, '_blank', 'noopener');
      } catch (e) {
        _redirectTab = null;
      }
    }

    try {
      if (window.top && window.top !== window) window.top.blur();
      else window.blur();
    } catch (e) {}
  }

  /* ─── PUBLIC: restore ───────────────────────────────────────────────────── */
  function restore() {
    if (!_isHidden) return;
    _isHidden = false;

    _hideMimicOverlay();
    _setAppVisible(true);

    /* Close the redirect tab that was opened when hiding */
    if (_redirectTab) {
      try { _redirectTab.close(); } catch (e) {}
      _redirectTab = null;
    }

    try { window.focus(); } catch (e) {}
  }

  /* ─── PUBLIC: misc setters ──────────────────────────────────────────────── */
  function setDisappearMode(enabled) { _disappearEnabled = !!enabled; }

  function setRedirectUrl(url) {
    _cfg.redirectUrl = (url || '').trim() || DEFAULTS.redirectUrl;
    _savePersisted();
  }

  function setNoHistory(enabled) {
    _cfg.noHistoryEnabled = !!enabled;
    _savePersisted();
  }

  function setMimicSite(siteKey) {
    _cfg.mimicSite = (siteKey || '').trim() || DEFAULTS.mimicSite;
    _savePersisted();
    _syncInputsFromConfig();
  }

  function setMimicCustomUrl(url) {
    _cfg.mimicCustomUrl = (url || '').trim();
    _savePersisted();
  }

  function setMimicUser(user) {
    _cfg.mimicUser = (user || '').trim();
    _savePersisted();
  }

  function setMimicColor(color) {
    _cfg.mimicColor = (color || '').trim() || DEFAULTS.mimicColor;
    _savePersisted();
  }

  function getSettings() {
    return {
      title:            _cfg.title,
      favicon:          _cfg.favicon,
      redirectUrl:      _cfg.redirectUrl,
      hideKey:          _cfg.hideKey,
      noHistoryEnabled: !!_cfg.noHistoryEnabled,
      mimicSite:        _cfg.mimicSite,
      mimicCustomUrl:   _cfg.mimicCustomUrl || '',
      mimicUser:        _cfg.mimicUser || '',
      mimicColor:       _cfg.mimicColor || DEFAULTS.mimicColor,
    };
  }

  function openInBlank() { _openNoHistoryWindow(); }

  /* ─── PRIVATE: postMessage bridge ──────────────────────────────────────── */
  function _registerPostMessageHandler() {
    window.addEventListener('message', function (e) {
      if (e.data === 'hw:restore' && _isHidden && _disappearEnabled) {
        restore();
      }
    });
  }

  /* ─── PRIVATE: no-history core ──────────────────────────────────────────── */
  function _isNoHistoryContext() {
    var qs = new URLSearchParams(window.location.search);
    if (qs.get('hwblank') === '1') return true;
    try { return window.self !== window.top; } catch (e) { return false; }
  }

  function _openNoHistoryWindow() {
    /* Guard only applies inside the shell window (hwblank=1) to prevent
       the iframe from trying to spawn another shell on init. On a fresh
       top-level page load we always want to (re-)open the shell. */
    if (_isNoHistoryContext() && sessionStorage.getItem(SESSION_KEY) === '1') return;
    if (!_isNoHistoryContext()) sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.setItem(SESSION_KEY, '1');

    try {
      var shellWin = window.open('about:blank', '_blank');
      if (!shellWin) {
        sessionStorage.removeItem(SESSION_KEY);
        _notify('Enable pop-ups for No History mode to work, or turn it off in Settings.');
        return;
      }

      var jplayUrl = new URL(window.location.href);
      jplayUrl.searchParams.set('hwblank', '1');

      shellWin.document.open('text/html', 'replace');
      shellWin.document.write(_buildShellHtml(jplayUrl.toString()));
      shellWin.document.close();
      try { shellWin.focus(); } catch (e) {}

      var redirectUrl = _readRedirectUrl();
      if (redirectUrl) {
        try { window.location.replace(redirectUrl); }
        catch (e) { window.location.href = redirectUrl; }
      }

    } catch (err) {
      sessionStorage.removeItem(SESSION_KEY);
      _notify('No History mode failed. Enable pop-ups or disable it in Settings.');
    }
  }

  function _buildShellHtml(frameSrc) {
    var safe = _escAttr(frameSrc);
    return [
      '<!DOCTYPE html>',
      '<html><head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">',
      '<title>Home</title>',
      '<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#0a0c10}iframe{display:block;width:100%;height:100%;border:none}</style>',
      '</head><body>',
      '<iframe src="' + safe + '" allowfullscreen allow="autoplay;fullscreen;clipboard-write"></iframe>',
      '</body></html>',
    ].join('');
  }

  /* ─── PRIVATE: mimic overlay ────────────────────────────────────────────── */
  function _setAppVisible(visible) {
    ['.sidebar', '.app-shell'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      el.style.transition    = 'opacity 0.15s ease';
      el.style.opacity       = visible ? '1' : '0';
      el.style.pointerEvents = visible ? '' : 'none';
    });
  }

  function _showMimicOverlay() {
    var overlay = document.getElementById('hackwize-mimic-overlay');
    var frame, focusTrap;

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hackwize-mimic-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1600;display:none;background:#f8f9fa;';

      frame = document.createElement('iframe');
      frame.id = 'hackwize-mimic-frame';
      frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#fff;';
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation');

      focusTrap = document.createElement('div');
      focusTrap.id = 'hackwize-focus-trap';
      focusTrap.tabIndex = -1;
      focusTrap.style.cssText = 'position:absolute;inset:0;z-index:1;background:transparent;pointer-events:none;outline:none;';

      overlay.appendChild(frame);
      overlay.appendChild(focusTrap);
      document.body.appendChild(overlay);
    } else {
      frame     = document.getElementById('hackwize-mimic-frame');
      focusTrap = document.getElementById('hackwize-focus-trap');
    }

    if (frame) {
      frame.src = _resolveMimicUrl();

      frame.onload = function () {
        /* Same-origin: inject postMessage bridge */
        try {
          var doc = frame.contentDocument || frame.contentWindow.document;
          if (doc && !doc.__hwBridge) {
            doc.__hwBridge = true;
            doc.addEventListener('keydown', function (e) {
              if (e.key === _cfg.hideKey) {
                e.preventDefault();
                try { window.parent.postMessage('hw:restore', '*'); } catch (_) {}
              }
            }, true);
          }
        } catch (e) { /* cross-origin — silent */ }

        if (focusTrap) { try { focusTrap.focus(); } catch (_) {} }
      };
    }

    overlay.style.display = 'block';

    if (focusTrap) {
      setTimeout(function () { try { focusTrap.focus(); } catch (_) {} }, 50);
    }
  }

  function _hideMimicOverlay() {
    var overlay   = document.getElementById('hackwize-mimic-overlay');
    var frame     = document.getElementById('hackwize-mimic-frame');
    var focusTrap = document.getElementById('hackwize-focus-trap');
    if (frame)     frame.src = 'about:blank';
    if (overlay)   overlay.style.display = 'none';
    if (focusTrap) focusTrap.blur();
  }

  function _resolveMimicUrl() {
    var selectEl = document.getElementById('mimic-site-select');
    var customEl = document.getElementById('mimic-custom-url');
    var selected = (selectEl && selectEl.value) || _cfg.mimicSite;

    var base;
    if (selected === 'custom') {
      var custom = (customEl && customEl.value.trim()) || _cfg.mimicCustomUrl || '';
      base = custom ? _normalizeUrl(custom) : _defaultMimicUrl();
    } else {
      base = _defaultMimicUrl();
    }

    /* Append user + color params for fakesites that support them */
    var user  = (document.getElementById('mimic-user-input')  && document.getElementById('mimic-user-input').value.trim())  || _cfg.mimicUser  || '';
    var color = (document.getElementById('mimic-color-input') && document.getElementById('mimic-color-input').value.trim()) || _cfg.mimicColor || DEFAULTS.mimicColor;

    /* Only append to same-origin fakesites (starts with our origin or is relative) */
    if (base.startsWith(window.location.origin) || base.startsWith('fakesites/')) {
      var url = new URL(base, window.location.href);
      if (user)  url.searchParams.set('user', user);
      if (color) url.searchParams.set('color', color.replace('#', ''));
      return url.toString();
    }

    return base;
  }

  function _defaultMimicUrl() {
    return new URL('fakesites/google_classroom.html', window.location.href).href;
  }

  /* ─── PRIVATE: helpers ──────────────────────────────────────────────────── */
  function _readRedirectUrl() {
    var inp = document.getElementById('redirect-url');
    var raw = (inp && inp.value.trim()) || _cfg.redirectUrl;
    return _normalizeUrl(raw);
  }

  function _normalizeUrl(value) {
    var v = (value || '').trim();
    if (!v) return '';
    if (/^(https?:|file:|about:|data:|\/{1,2}|\.{1,2}\/)/i.test(v)) return v;
    return 'https://' + v;
  }

  function _escAttr(s) {
    return String(s)
      .replace(/&/g,  '&amp;')
      .replace(/"/g,  '&quot;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;');
  }

  function _notify(message) {
    var toast = document.getElementById('hackwize-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hackwize-toast';
      toast.style.cssText = [
        'position:fixed', 'right:18px', 'bottom:18px', 'z-index:1700',
        'max-width:360px', 'padding:12px 14px', 'border-radius:10px',
        'background:rgba(12,18,28,0.92)', 'color:#e2e8f0',
        'font:500 13px/1.45 DM Sans,Arial,sans-serif',
        'border:1px solid rgba(148,163,184,0.38)',
        'box-shadow:0 10px 30px rgba(0,0,0,0.4)',
        'opacity:0', 'transform:translateY(8px)',
        'transition:opacity 0.2s ease,transform 0.2s ease',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent     = message;
    toast.style.opacity   = '1';
    toast.style.transform = 'translateY(0)';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(8px)';
    }, 5600);
  }

  /* ─── PRIVATE: persistence ──────────────────────────────────────────────── */
  function _loadPersisted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var p = JSON.parse(raw);
      return (p && typeof p === 'object') ? p : {};
    } catch (e) { return {}; }
  }

  function _savePersisted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        title:            _cfg.title,
        favicon:          _cfg.favicon,
        redirectUrl:      _cfg.redirectUrl,
        hideKey:          _cfg.hideKey,
        noHistoryEnabled: !!_cfg.noHistoryEnabled,
        mimicSite:        _cfg.mimicSite,
        mimicCustomUrl:   _cfg.mimicCustomUrl || '',
        mimicUser:        _cfg.mimicUser || '',
        mimicColor:       _cfg.mimicColor || DEFAULTS.mimicColor,
      }));
    } catch (e) {}
  }

  function _syncInputsFromConfig() {
    var redirectInput = document.getElementById('redirect-url');
    if (redirectInput && !_hasValue(redirectInput.value))
      redirectInput.value = _cfg.redirectUrl;

    var noHistoryToggle = document.getElementById('no-history-toggle');
    if (noHistoryToggle) noHistoryToggle.checked = !!_cfg.noHistoryEnabled;

    var mimicSelect = document.getElementById('mimic-site-select');
    if (mimicSelect) mimicSelect.value = _cfg.mimicSite || 'google_classroom';

    var mimicCustom = document.getElementById('mimic-custom-url');
    if (mimicCustom && !_hasValue(mimicCustom.value))
      mimicCustom.value = _cfg.mimicCustomUrl || '';

    var customRow = document.getElementById('mimic-custom-row');
    if (customRow && mimicSelect)
      customRow.style.display = mimicSelect.value === 'custom' ? '' : 'none';

    var userInput = document.getElementById('mimic-user-input');
    if (userInput && !_hasValue(userInput.value))
      userInput.value = _cfg.mimicUser || '';

    var colorInput = document.getElementById('mimic-color-input');
    if (colorInput) colorInput.value = _cfg.mimicColor || DEFAULTS.mimicColor;

    var colorPreview = document.getElementById('mimic-color-preview');
    if (colorPreview) colorPreview.style.background = _cfg.mimicColor || DEFAULTS.mimicColor;
  }

  function _hasValue(v) { return !!(v && String(v).trim()); }

  /* ─── PRIVATE: cloak ────────────────────────────────────────────────────── */
  function _applyCloak(title, faviconUrl) {
    if (title) document.title = title;
    if (faviconUrl) {
      /* Remove any existing favicon links first to force reload */
      document.querySelectorAll('link[rel~="icon"]').forEach(function(l) { l.parentNode.removeChild(l); });
      var link     = document.createElement('link');
      link.id      = 'favicon';
      link.rel     = 'icon';
      link.type    = 'image/png';
      link.href    = faviconUrl + (faviconUrl.indexOf('?') === -1 ? '?' : '&') + '_hw=' + Date.now();
      document.head.appendChild(link);
    }
  }

  /* ─── PRIVATE: key handler ──────────────────────────────────────────────── */
  function _registerKeyHandler() {
    document.addEventListener('keydown', function (e) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (!_isHidden && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;

      if (e.key === _cfg.hideKey && _disappearEnabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (_isHidden) restore(); else hide();
      }
    }, true);
  }

  /* ─── EXPORTS ───────────────────────────────────────────────────────────── */
  return {
    init,
    setCloak,
    hide,
    restore,
    setDisappearMode,
    openInBlank,
    setRedirectUrl,
    setNoHistory,
    setMimicSite,
    setMimicCustomUrl,
    setMimicUser,
    setMimicColor,
    getSettings,
  };

})();
