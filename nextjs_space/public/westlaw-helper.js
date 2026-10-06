/*
 * AZ Court Rules - Browser Helper
 * Paste into the developer console of a govt.westlaw.com tab opened with the app's
 * "Open WestLaw" button. Requests then use the
 * user's own browser, IP address and Cloudflare clearance. Talks to the app tab
 * (window.opener) with postMessage; falls back to standalone download mode.
 */
(function () {
  'use strict';

  var BASE = 'https://govt.westlaw.com';
  var appOrigin = window.__AZR_APP_ORIGIN ||
    (document.currentScript && document.currentScript.src ? new URL(document.currentScript.src).origin : '');

  if (location.hostname !== 'govt.westlaw.com') {
    alert('AZ Rules Helper: open https://govt.westlaw.com/azrules/ first, then run the helper on that page.');
    return;
  }

  if (window.__AZR_HELPER) {
    window.__AZR_HELPER.show();
    window.__AZR_HELPER.announce();
    return;
  }

  var opener = null;
  try { opener = window.opener && !window.opener.closed ? window.opener : null; } catch (e) { opener = null; }

  var cancelled = false;
  var busy = false;
  var challengeGate = null;

  // ---------- UI ----------
  var panel = document.createElement('div');
  panel.id = 'azr-helper-panel';
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;width:380px;max-height:80vh;z-index:2147483647;' +
    'background:#0f172a;color:#e2e8f0;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;border-radius:12px;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;';
  panel.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b">' +
    '<strong style="font-size:14px">AZ Rules Helper</strong>' +
    '<button id="azr-close" style="background:none;border:0;color:#94a3b8;font-size:18px;cursor:pointer" title="Hide">×</button></div>' +
    '<div id="azr-status" style="padding:10px 14px;border-bottom:1px solid #1e293b"></div>' +
    '<div id="azr-challenge" style="display:none;padding:10px 14px;border-bottom:1px solid #1e293b;background:#422006">' +
    '<div style="margin-bottom:6px;color:#fde68a">WestLaw is asking for a human check. Complete it below, then click Resume.</div>' +
    '<iframe id="azr-frame" style="width:100%;height:320px;border:0;border-radius:8px;background:#fff"></iframe>' +
    '<button id="azr-resume" style="margin-top:8px;width:100%;padding:8px;border:0;border-radius:8px;background:#f59e0b;color:#111;font-weight:600;cursor:pointer">I\'ve completed the check — Resume</button></div>' +
    '<div id="azr-list" style="display:none;overflow:auto;max-height:260px;padding:6px 8px"></div>' +
    '<div id="azr-log" style="overflow:auto;max-height:180px;padding:8px 14px;font:11px/1.4 ui-monospace,Menlo,monospace;color:#94a3b8"></div>';
  document.body.appendChild(panel);

  var $ = function (id) { return document.getElementById(id); };
  $('azr-close').onclick = function () { panel.style.display = 'none'; };
  $('azr-resume').onclick = function () {
    $('azr-challenge').style.display = 'none';
    $('azr-frame').src = 'about:blank';
    if (challengeGate) { var g = challengeGate; challengeGate = null; g.resolve(); }
  };

  function setStatus(html) { $('azr-status').innerHTML = html; }
  function log(msg) {
    var el = $('azr-log');
    var line = document.createElement('div');
    line.textContent = msg;
    el.appendChild(line);
    while (el.childNodes.length > 200) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function post(msg) {
    if (!opener || !appOrigin) return;
    msg.source = 'azr-helper';
    try { opener.postMessage(msg, appOrigin); } catch (e) { /* app tab closed */ }
  }

  function progress(message, pct) {
    if (message) log(message);
    post({ type: 'log', message: message, progress: pct });
  }

  // ---------- Fetching ----------
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function isChallenge(res, html) {
    if (res.headers.get('cf-mitigated') === 'challenge') return true;
    if ((res.status === 403 || res.status === 503) && /challenge-platform|cf-chl|Just a moment/i.test(html || '')) return true;
    return false;
  }

  function waitForHuman(url) {
    if (!challengeGate) {
      var gate = {};
      gate.promise = new Promise(function (resolve) { gate.resolve = resolve; });
      challengeGate = gate;
      panel.style.display = 'flex';
      $('azr-challenge').style.display = 'block';
      $('azr-frame').src = url;
      progress('🧑 Human check required - complete it in the WestLaw tab helper panel, then click Resume', null);
      post({ type: 'challenge' });
    }
    return challengeGate.promise;
  }

  async function fetchHtml(url, timeoutMs) {
    for (var attempt = 0; attempt < 3; attempt++) {
      if (cancelled) throw new Error('Cancelled');
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      var res, html;
      try {
        res = await fetch(url, { credentials: 'include', signal: controller.signal });
        html = await res.text();
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('Request timed out after ' + timeoutMs / 1000 + 's');
        throw e;
      }
      clearTimeout(timer);
      if (isChallenge(res, html)) { await waitForHuman(url); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return new DOMParser().parseFromString(html, 'text/html');
    }
    throw new Error('Human check was not cleared');
  }

  function absUrl(href) { return /^https?:/i.test(href) ? href : BASE + href; }
  function text(doc, sel) { var el = doc.querySelector(sel); return el ? el.textContent.trim() : ''; }

  // ---------- Parsers (mirror lib/scraper.ts) ----------
  async function fetchIndex() {
    var doc = await fetchHtml(BASE + '/azrules/Index', 15000);
    var out = [];
    doc.querySelectorAll('ul.co_genericWhiteBox li a').forEach(function (a) {
      var title = a.textContent.trim();
      var href = a.getAttribute('href') || '';
      var m = href.match(/guid=([A-Z0-9]+)/i);
      if (href && title && m) out.push({ title: title, guid: m[1], url: absUrl(href), type: 'category' });
    });
    return out;
  }

  async function scrapeCategory(guid, timeoutMs) {
    var url = BASE + '/azrules/Browse/Home/Arizona/ArizonaCourtRules/ArizonaStatutesCourtRules?guid=' + guid +
      '&transitionType=CategoryPageItem&contextData=(sc.Default)';
    var doc = await fetchHtml(url, timeoutMs);
    var items = [];
    doc.querySelectorAll('ul.co_genericWhiteBox li a').forEach(function (a) {
      var title = a.textContent.trim();
      var href = a.getAttribute('href') || '';
      if (!href || !title) return;
      var isDoc = href.indexOf('/Document/') !== -1;
      var m = href.match(/guid=([A-Z0-9]+)/i) || href.match(/Document\/([A-Z0-9]+)/i);
      if (m) items.push({ title: title, guid: m[1], url: absUrl(href), type: isDoc ? 'document' : 'category' });
    });
    return items;
  }

  var BLOCKS = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'dt', 'dd', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'hr'];

  async function scrapeDocument(guid, timeoutMs) {
    var url = BASE + '/azrules/Document/' + guid +
      '?viewType=FullText&originationContext=documenttoc&transitionType=CategoryPageItem&contextData=(sc.Default)';
    var doc = await fetchHtml(url, timeoutMs);
    var title = text(doc, '#co_docHeaderTitleLine #title') || text(doc, '#co_docHeaderTitleLine') || 'Untitled';
    var docEl = doc.querySelector('#co_document');
    var rawHtml = docEl ? docEl.innerHTML : '';
    var content = '';
    if (docEl) {
      docEl.querySelectorAll('script, style').forEach(function (n) { n.remove(); });
      docEl.querySelectorAll(BLOCKS.join(',')).forEach(function (n) {
        n.before(doc.createTextNode('\n'));
        n.after(doc.createTextNode('\n'));
      });
      content = docEl.textContent || '';
      content = content.replace(/[^\S\n]+/g, ' ');
      content = content.replace(/\n\s*\n/g, '\n\n');
      content = content.split('\n').map(function (l) { return l.trim(); }).join('\n');
      content = content.replace(/\n{3,}/g, '\n\n').trim();
    }
    return {
      guid: guid,
      title: title,
      url: url,
      citation: text(doc, '.co_cites'),
      codeSetName: text(doc, '#codeSetName'),
      titleDescription: text(doc, '#titleDesc'),
      currentness: text(doc, '.co_currentness'),
      content: content,
      rawHtml: rawHtml,
      scrapedAt: new Date().toISOString(),
    };
  }

  function trunc(s, n) { n = n || 60; return s.length > n ? s.substring(0, n) + '...' : s; }

  async function scrapeRuleSet(guid, title, opts) {
    var delayMs = Math.max(0, Math.min(1000, Number(opts.delayMs) || 0));
    var concurrency = [1, 3, 5, 10].indexOf(Number(opts.concurrency)) !== -1 ? Number(opts.concurrency) : 3;
    var timeoutMs = 15000;
    var start = Date.now();
    var items = [];
    var totalDocs = 0, totalCats = 0;

    progress('🚀 Starting scrape (your browser connection) for: ' + trunc(title), 2);
    progress('⚙️ Settings: ' + delayMs + 'ms delay, ' + timeoutMs / 1000 + 's timeout, ' + concurrency + ' threads', 2);
    progress('📊 Phase 1/2: Discovering structure (counting documents)...', 3);

    async function discover(catGuid, catTitle, path, depth) {
      if (cancelled) throw new Error('Cancelled');
      progress('  '.repeat(Math.min(depth, 3)) + '🔍 Discovering: ' + trunc(catTitle), Math.min(45, 5 + totalCats + totalDocs / 10));
      await sleep(delayMs);
      var children = await scrapeCategory(catGuid, timeoutMs);
      var nodes = [];
      var cur = path.concat([catTitle]);
      for (var i = 0; i < children.length; i++) {
        var it = children[i];
        if (it.type === 'document') {
          totalDocs++;
          items.push({ guid: it.guid, title: it.title, parentPath: cur });
          nodes.push({ title: it.title, guid: it.guid, url: it.url, type: 'document' });
        } else {
          totalCats++;
          var sub = await discover(it.guid, it.title, cur, depth + 1);
          nodes.push({ title: it.title, guid: it.guid, url: it.url, type: 'category', children: sub });
        }
      }
      return nodes;
    }

    var structure = await discover(guid, title, [], 0);
    progress('✓ Discovery complete: Found ' + totalDocs + ' documents in ' + totalCats + ' categories', 50);
    progress('📥 Phase 2/2: Downloading documents (' + concurrency + ' parallel)...', 51);

    var documents = [];
    var done = 0, failed = 0, next = 0;
    async function worker() {
      while (next < items.length) {
        if (cancelled) return;
        var it = items[next++];
        if (delayMs > 0) await sleep(delayMs);
        done++;
        var pct = 51 + Math.floor((done / Math.max(1, totalDocs)) * 48);
        var pathStr = it.parentPath.length > 1 ? trunc(it.parentPath[it.parentPath.length - 1], 25) + ' > ' : '';
        progress('📄 [' + done + '/' + totalDocs + '] ' + pathStr + trunc(it.title, 40), pct);
        try {
          documents.push(await scrapeDocument(it.guid, timeoutMs));
        } catch (e) {
          if (cancelled) return;
          failed++;
          progress('⚠️ Failed: ' + trunc(it.title, 35) + ' - ' + (e.message || 'Unknown error'), pct);
        }
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(concurrency, items.length); w++) workers.push(worker());
    await Promise.all(workers);
    if (cancelled) throw new Error('Cancelled');

    var elapsed = ((Date.now() - start) / 1000).toFixed(1);
    progress('✅ Scrape complete! ' + done + ' documents in ' + elapsed + 's' + (failed ? ' (' + failed + ' failed)' : ''), 100);

    return {
      title: title,
      guid: guid,
      url: BASE + '/azrules/Browse/Home/Arizona/ArizonaCourtRules/ArizonaStatutesCourtRules?guid=' + guid,
      scrapedAt: new Date().toISOString(),
      structure: structure,
      documents: documents,
      metadata: { totalDocuments: documents.length, totalCategories: totalCats },
    };
  }

  function download(data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data.title || 'rules').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // ---------- Jobs ----------
  async function runScrape(job, standalone) {
    if (busy) { log('A job is already running.'); return; }
    busy = true; cancelled = false;
    setStatus('⏳ Scraping <b>' + trunc(job.title, 50) + '</b>… keep this tab open.');
    try {
      var data = await scrapeRuleSet(job.guid, job.title, job);
      if (standalone) {
        download(data);
        setStatus('✅ Done - JSON downloaded. Upload it in the app viewer.');
      } else {
        post({ type: 'complete', data: data });
        setStatus('✅ Done - results sent to the app tab. You can switch back.');
      }
    } catch (e) {
      var msg = e.message === 'Cancelled' ? 'Scrape cancelled' : 'Scrape failed: ' + (e.message || 'Unknown error');
      log(msg);
      post({ type: 'error', message: msg });
      setStatus('⚠️ ' + msg);
    } finally {
      busy = false;
    }
  }

  async function runRetry(docs) {
    if (busy) return;
    busy = true; cancelled = false;
    var succeeded = [], failedList = [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      progress('🔁 Retrying [' + (i + 1) + '/' + docs.length + '] ' + trunc(d.title, 40), null);
      try { succeeded.push({ guid: d.guid, document: await scrapeDocument(d.guid, 15000) }); }
      catch (e) { failedList.push({ guid: d.guid, title: d.title, error: e.message || 'Unknown error' }); }
      await sleep(300);
    }
    post({ type: 'retry-result', succeeded: succeeded, failed: failedList });
    busy = false;
  }

  async function sendIndex() {
    try {
      var list = await fetchIndex();
      post({ type: 'index', ruleSets: list });
      log('Sent ' + list.length + ' rule sets to the app.');
      return list;
    } catch (e) {
      post({ type: 'index-error', message: e.message });
      log('Could not load index: ' + e.message);
      return [];
    }
  }

  async function showStandaloneList() {
    setStatus('Not connected to the app. To connect, close this tab and use the app\'s "Open WestLaw" button, then paste the code again there. Or pick a rule set below: the JSON downloads here and you can upload it in the app viewer.');
    var list = await fetchIndex().catch(function (e) { log('Could not load index: ' + e.message); return []; });
    var box = $('azr-list');
    box.style.display = 'block';
    box.innerHTML = '';
    list.forEach(function (rs) {
      var b = document.createElement('button');
      b.textContent = rs.title;
      b.style.cssText = 'display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px;border:0;border-radius:6px;background:#1e293b;color:#e2e8f0;cursor:pointer;font:12px system-ui';
      b.onclick = function () { runScrape({ guid: rs.guid, title: rs.title, delayMs: 200, concurrency: 1 }, true); };
      box.appendChild(b);
    });
  }

  window.addEventListener('message', function (e) {
    if (!appOrigin || e.origin !== appOrigin) return;
    var m = e.data || {};
    if (m.source !== 'azr-app') return;
    if (m.type === 'index') sendIndex();
    else if (m.type === 'scrape') runScrape(m, false);
    else if (m.type === 'retry') runRetry(m.documents || []);
    else if (m.type === 'cancel') { cancelled = true; if (challengeGate) { $('azr-resume').click(); } }
    else if (m.type === 'ping') post({ type: 'ready' });
  });

  window.__AZR_HELPER = {
    show: function () { panel.style.display = 'flex'; },
    announce: function () { if (opener) post({ type: 'ready' }); },
  };

  if (opener && appOrigin) {
    setStatus('🟢 Connected to the app. Choose a rule set in the app tab - scraping will run here using your connection.');
    post({ type: 'ready' });
  } else {
    showStandaloneList();
  }
})();
