/*
 * Offline documents page (public/offline-docs.html): lists what the client kept on THIS device with "Oflayn saxla"
 * (src/lib/offlineDocs.ts) — the appointment card(s) and the documents — straight from Cache Storage, so it works
 * without internet. Files open from the cache through the service worker (/__offline/doc/<id>) or, when no worker
 * controls the page, as a blob URL. Items older than 30 days are not shown (the worker deletes them).
 */
(function () {
  'use strict';
  var CACHE = 'tv-offline-v1';
  var INDEX = '/__offline/index.json';
  var KEEP_MS = 30 * 24 * 60 * 60 * 1000;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var el = function (tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  };
  var fresh = function (savedAt) {
    return savedAt && Date.now() - new Date(savedAt).getTime() <= KEEP_MS;
  };
  var size = function (b) {
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  };

  var openDoc = function (id) {
    return caches.open(CACHE).then(function (c) {
      return c.match('/__offline/doc/' + id);
    }).then(function (res) {
      if (!res) return;
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 60000);
      });
    });
  };

  var render = function (idx) {
    if (!idx) return;
    var L = idx.labels || {};
    if (idx.lang) document.documentElement.lang = idx.lang;
    if (L.title) {
      $('title').textContent = L.title;
      document.title = 'Triad Vision — ' + L.title;
    }
    if (L.privacy) $('privacy').textContent = L.privacy;
    if (L.back) $('back').textContent = L.back;
    if (L.empty) $('empty-text').textContent = L.empty;

    var docs = (idx.docs || []).filter(function (d) {
      return fresh(d.savedAt);
    });
    var appt = idx.appointment && fresh(idx.appointment.savedAt) ? idx.appointment : null;

    var host = $('appointment');
    host.textContent = '';
    if (appt && appt.cases && appt.cases.length) {
      appt.cases.forEach(function (c) {
        if (!c.appointment && !(c.cards && c.cards.length)) return;
        var s = el('section');
        s.appendChild(el('h2', null, (L.appointment || 'Termin') + (c.who ? ' — ' + c.who : '')));
        var dl = el('dl');
        dl.appendChild(el('dt', null, L.caseNo || '№'));
        dl.appendChild(el('dd', null, c.number));
        if (idx.holder) {
          dl.appendChild(el('dt', null, L.holder || ''));
          dl.appendChild(el('dd', null, idx.holder));
        }
        if (c.appointment) {
          dl.appendChild(el('dt', null, L.when || ''));
          dl.appendChild(el('dd', null, c.appointment.at));
          if (c.appointment.place) {
            dl.appendChild(el('dt', null, L.place || ''));
            dl.appendChild(el('dd', null, c.appointment.place));
          }
        }
        s.appendChild(dl);
        (c.cards || []).forEach(function (k) {
          var card = el('div', { class: 'card' });
          card.appendChild(el('strong', null, k.text));
          card.appendChild(el('span', null, k.at + (k.detail ? ' · ' + k.detail : '') + (k.place ? ' · ' + k.place : '')));
          s.appendChild(card);
        });
        if (L.savedAt) s.appendChild(el('p', { class: 'note' }, L.savedAt.replace('{date}', new Date(appt.savedAt).toLocaleString(idx.lang || undefined))));
        host.appendChild(s);
      });
    }

    var list = $('docs');
    list.textContent = '';
    if (L.documents) $('docs-title').textContent = L.documents;
    docs.forEach(function (d) {
      var li = el('li');
      var row = el('div', { class: 'doc' });
      var name = el('span');
      name.appendChild(document.createTextNode(d.title || d.name));
      name.appendChild(el('small', null, (d.title ? d.name + ' · ' : '') + size(d.size) + (d.caseNumber ? ' · ' + d.caseNumber : '')));
      row.appendChild(name);
      var a = el('a', { class: 'btn', href: '/__offline/doc/' + encodeURIComponent(d.id), target: '_blank', rel: 'noopener' }, L.open || 'Open');
      a.addEventListener('click', function (e) {
        // Without a controlling service worker the URL would hit the network: open from the cache instead.
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
          e.preventDefault();
          openDoc(d.id);
        }
      });
      row.appendChild(a);
      li.appendChild(row);
      list.appendChild(li);
    });
    $('docs-section').hidden = docs.length === 0;
    $('empty').hidden = docs.length > 0 || host.childNodes.length > 0;
  };

  if (!('caches' in window)) return;
  caches
    .has(CACHE)
    .then(function (has) {
      if (!has) return null;
      return caches.open(CACHE).then(function (c) {
        return c.match(INDEX);
      });
    })
    .then(function (res) {
      return res ? res.json() : null;
    })
    .then(render)
    .catch(function () {
      /* nothing kept or storage blocked: the empty state stays */
    });
})();
