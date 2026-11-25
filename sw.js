/* ESTATE AI service worker: offline app shell. All data lives in IndexedDB. */
const VERSION = '978e6e986e';
const CACHE = 'estate-ai-' + VERSION;
// Replaced at build time with the list of built files.
const PRECACHE = ["./","./assets/AreaCalc-BDJQqwY9.js","./assets/Copilot-B6ZrPEQk.js","./assets/Dashboard-BXRNovXB.js","./assets/Elevations-C-rMgfNO.js","./assets/Inspection-m0Zncp--.js","./assets/Listing-BENN_3qR.js","./assets/Overview-CVAgPmGF.js","./assets/Photos-1TLiDh1k.js","./assets/PlanCanvas-Bv7dOsJP.js","./assets/PlanEditor-DXtYHXn4.js","./assets/PlanSVG-CYbAP8Fx.js","./assets/RoomEditor-BmvKFoKz.js","./assets/Scanner-GEuPhI8h.js","./assets/Settings-cgqIexQo.js","./assets/Staging-Dym2C5HO.js","./assets/Studio-F1kJRwRI.js","./assets/ThreeView-DmiDmspy.js","./assets/Viewer3D-BEj0UMhD.js","./assets/backup-DW-g7fXo.js","./assets/calc-BJen2QzV.js","./assets/copilot-DUq1bJn8.js","./assets/export-125IZzkJ.js","./assets/html2canvas-fMrU3NQZ.js","./assets/image-RAZVrMS0.js","./assets/index-Bh-5FXzN.css","./assets/index-DSYZSSK7.js","./assets/index.es-BQSxdk4o.js","./assets/pdf-DcG9vv2g.js","./assets/purify.es-Ddo9-xRH.js","./assets/rolldown-runtime-XKyaHtl9.js","./assets/server.browser-DYN-ig2X.js","./assets/units-CAWzeJmG.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon.svg","./index.html","./manifest.webmanifest"] || ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('estate-ai-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache other sites (e.g. a local AI endpoint)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreVary: true }).then((r) => r || caches.match('./', { ignoreVary: true }))));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
