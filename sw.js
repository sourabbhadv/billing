/* Laxmi AI Billing - offline service worker
   Put this file next to index.html (same folder, same name: sw.js).
   Change VERSION whenever you upload a new index.html so phones pick it up. */
var VERSION = 'v1';
var CACHE = 'laxmi-billing-' + VERSION;

/* Only same-site files go in the install list. If any of these is missing
   we still install (each file is added on its own), so one bad name can never
   break offline mode. */
var SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('laxmi-billing-') === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isApi(url) {
  /* never cache live data / login / AI calls */
  return /supabase\.co|generativelanguage\.googleapis\.com|api\.groq\.com|accounts\.google\.com|wa\.me/.test(url.hostname + url.pathname)
    && !/\/storage\/v1\/object\/public\//.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (isApi(url)) return;

  /* 1) Opening the app (page load): show the cached page instantly, refresh it in the background */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match('./index.html').then(function (cached) {
          var net = fetch(req).then(function (res) {
            if (res && res.ok && res.type === 'basic') c.put('./index.html', res.clone());
            return res;
          }).catch(function () { return null; });
          if (cached) { e.waitUntil(net); return cached; }
          return net.then(function (res) {
            return res || new Response('<h3 style="font-family:sans-serif;padding:20px">Offline. Open the app once with internet so it can save itself.</h3>',
              { headers: { 'Content-Type': 'text/html' } });
          });
        });
      })
    );
    return;
  }

  /* 2) Everything else (icons, Supabase script, fonts, pako, qrcode): cache-first, fill cache as it is used */
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit || Response.error(); });
    })
  );
});
