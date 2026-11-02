const C='desk-v6',F=['./','index.html','manifest.json','icon.svg','badge.css','badge.js','desk.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
/* Network first for the desk's own files, so a fresh push shows on the very next open.
   The cache is only the offline fallback. Other sites (fonts) still come from cache when offline. */
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  const same=new URL(e.request.url).origin===location.origin;
  if(!same){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));return;}
  e.respondWith(fetch(e.request).then(n=>{if(n&&n.ok){const cp=n.clone();caches.open(C).then(c=>c.put(e.request,cp));}return n;})
    .catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));});
