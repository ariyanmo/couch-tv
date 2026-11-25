/* ESTATE AI service worker: offline app shell. All data lives in IndexedDB. */
const VERSION = 'a0f4c84f04';
const CACHE = 'estate-ai-' + VERSION;
// Replaced at build time with the list of built files.
const PRECACHE = ["./","./assets/AreaCalc-DMpJSDWH.js","./assets/Copilot-CiC7LsS-.js","./assets/Dashboard-DiyUu9Aq.js","./assets/Elevations-WoB-CJ2N.js","./assets/Inspection-aU5hpoLc.js","./assets/Listing-Dsd87fPx.js","./assets/Overview-CDTDSfj4.js","./assets/Photos-D3S7rUst.js","./assets/PlanCanvas-Bv7dOsJP.js","./assets/PlanEditor-B22BuHiy.js","./assets/PlanSVG-CYbAP8Fx.js","./assets/RoomEditor-C79PJjTb.js","./assets/Scanner-CnKIomPb.js","./assets/Settings-D9cQBSWm.js","./assets/Staging-D2Ka3XX2.js","./assets/Studio-Bti81_ll.js","./assets/ThreeView-DmiDmspy.js","./assets/Viewer3D-D-4Y39Lu.js","./assets/backup-DW-g7fXo.js","./assets/calc-BJen2QzV.js","./assets/copilot-DUq1bJn8.js","./assets/export-125IZzkJ.js","./assets/html2canvas-fMrU3NQZ.js","./assets/image-RAZVrMS0.js","./assets/index-B5gsNQJv.css","./assets/index-DuiGA3gI.js","./assets/index.es-D5qp0RIu.js","./assets/pdf-Cs0zhDOk.js","./assets/purify.es-Ddo9-xRH.js","./assets/rolldown-runtime-XKyaHtl9.js","./assets/server.browser-DYN-ig2X.js","./assets/units-CAWzeJmG.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon.svg","./index.html","./manifest.webmanifest"] || ['./', './index.html'];

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
