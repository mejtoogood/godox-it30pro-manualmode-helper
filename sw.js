/* Same-origin asset-only cache: no requests for data or third-party services. */
const CACHE='flash-meter-v1.1.0';
const ASSETS=['./','./index.html','./styles.css','./core.mjs','./app.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',evt=>{evt.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',evt=>{evt.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',evt=>{
  if(evt.request.method!=='GET'||new URL(evt.request.url).origin!==self.location.origin)return;
  evt.respondWith(caches.match(evt.request).then(found=>found||fetch(evt.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(evt.request,copy));}
    return response;
  })));
});