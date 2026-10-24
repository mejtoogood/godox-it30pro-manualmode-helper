/* v1.3: network-first updates, with offline fallbacks; local calibration data untouched. */
const CACHE='flash-meter-v1.3.0';
const ASSETS=['./','./index.html','./styles.css?v=1.3.0','./core.mjs','./app.js?v=1.3.0','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const scopePath=new URL(self.registration.scope).pathname;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('flash-meter-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(scopePath))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request,{cache:'no-store'});
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch(error){
      const saved=await cache.match(event.request);
      if(saved)return saved;
      if(event.request.mode==='navigate'){
        const fallback=await cache.match('./index.html');
        if(fallback)return fallback;
      }
      throw error;
    }
  })());
});