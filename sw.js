const CACHE="control-laboral-v1";
const APP=[
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/storage.js",
  "./js/calendar.js",
  "./js/utils.js",
  "./js/calculos.js",
  "./js/francos.js",
  "./js/marcaciones.js",
  "./js/feriados.js",
  "./js/ui.js",
  "./assets/icon.svg"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  if(new URL(event.request.url).origin===location.origin){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
  }
});
