/* ESTATE AI service worker: offline app shell. All data lives in IndexedDB. */
const VERSION = 'ed4b4f7040';
const CACHE = 'estate-ai-' + VERSION;
// Replaced at build time with the list of built files.
const PRECACHE = ["./","./assets/AreaCalc-Bh2VknTg.js","./assets/Copilot-I2MGCTrZ.js","./assets/Dashboard-D3m_QEun.js","./assets/Elevations-05dooIZt.js","./assets/Inspection-DxqyZBhN.js","./assets/Listing-BOdShbkk.js","./assets/Overview-DpgTEkGf.js","./assets/Photos-CaWSvYH7.js","./assets/PlanCanvas-Bv7dOsJP.js","./assets/PlanEditor-CMHaMz6X.js","./assets/PlanSVG-dQeyfhkO.js","./assets/RoomEditor-oNuGgLP2.js","./assets/Scanner-CtfGskHt.js","./assets/Settings-CyMqRhmn.js","./assets/Staging-nmauPTSC.js","./assets/Studio-DGv2lBoH.js","./assets/ThreeView-DmiDmspy.js","./assets/Viewer3D-CLuyHXVk.js","./assets/backup-DW-g7fXo.js","./assets/calc-BJen2QzV.js","./assets/copilot-DUq1bJn8.js","./assets/export-ZKglaZZB.js","./assets/html2canvas-fMrU3NQZ.js","./assets/image-RAZVrMS0.js","./assets/index-CSmcbvOd.css","./assets/index-GGr3ZMnS.js","./assets/index.es-Cou3crQV.js","./assets/pdf-CBLtG2TI.js","./assets/purify.es-Ddo9-xRH.js","./assets/rolldown-runtime-XKyaHtl9.js","./assets/server.browser-DYN-ig2X.js","./assets/units-CAWzeJmG.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon.svg","./index.html","./manifest.webmanifest"] || ['./', './index.html'];

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
