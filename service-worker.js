const CACHE='russisch-vokabeltrainer-v24';
const ASSETS=['./','./index.html','./styles.css','./data.js','./app.js','./features.js','./speaking.js','./forms.js','./audio-toggle.js','./stable-voice.js','./forms-voice.js','./update-helper.js','./exercise-packages.js','./import-code.js','./standard-a1a2-data.js','./standard-b1-data.js','./standard-pack.js','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/voice-persistence.js')||url.pathname.endsWith('/mic-recovery.js')||url.pathname.endsWith('/feedback-recovery.js')){
    event.respondWith(Promise.resolve(new Response('/* disabled: replaced by stable voice controller */',{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})));
    return;
  }
  if(url.pathname.includes('/private-packs/')){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match('./index.html'))));
});
