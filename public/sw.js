const CACHE='segnali-__VERSION__';
const ASSETS=__PRECACHE__;
const BASE=new URL('./',self.location.href).href;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('segnali-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  const date=/^\d{4}-\d{2}-\d{2}$/.test(payload.date||'')?payload.date:null;
  event.waitUntil(self.registration.showNotification('Il quiz di oggi è pronto',{
    body:'Dieci domande per il tuo ripasso di Elaborazione dei segnali.',
    icon:new URL('icons/icon-192.png',BASE).href,badge:new URL('icons/icon-192.png',BASE).href,
    tag:date?`segnali-daily-${date}`:'segnali-daily',
    data:{url:new URL('#/giornalieri',BASE).href}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL('#/giornalieri',BASE).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>client.url.startsWith(BASE));
    if(existing){
      // Reuse the app window; navigation preserves any in-progress quiz and answers.
      const focused=await existing.focus();focused?.postMessage({type:'OPEN_DAILY'});
    }else await self.clients.openWindow(target);
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!event.request.url.startsWith(BASE))return;
  const relative=event.request.url.slice(BASE.length).split('?')[0];
  if(relative.startsWith('data/')){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(event.request,{signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw new Error('Data unavailable');
        const body=await response.clone().json();
        if(relative==='data/questions.json'&&(!Array.isArray(body.questions)||!Array.isArray(body.chapters)))throw new Error('Invalid data');
        if(relative==='data/daily.json'&&!Array.isArray(body.quizzes))throw new Error('Invalid archive');
        await cache.put(new Request(url.origin+url.pathname),response.clone());return response;
      }catch{const saved=await cache.match(url.origin+url.pathname);return saved||Response.error();}
    })());return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate')return (await cache.match(new URL('index.html',BASE)))||fetch(event.request);
    const saved=await cache.match(url.origin+url.pathname);
    return saved||fetch(event.request);
  })());
});
