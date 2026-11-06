import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {sendDailyPush,validPushDevice,SITE} from '../scripts/send-daily-push.mjs';
import {createPushStore,encodeFields,decodeFields} from '../scripts/push-store.mjs';
import {pushAvailability,createPushNotifications} from '../src/push-notifications.js';

const publicKey='B'.repeat(87),now=new Date('2026-11-06T10:10:00Z');
const archive={quizzes:[{date:'2026-11-06',createdAt:'2026-11-06T10:01:00Z'}]};
function device(endpoint='https://web.push.apple.com/test'){
  return {id:createHash('sha256').update(endpoint).digest('hex'),uid:'owner',endpoint,p256dh:'B'.repeat(87),auth:'A'.repeat(22),publicKey};
}
function memoryStore(devices=[device()]){
  const deliveries=new Map(),removed=[];
  return {deliveries,removed,listDevices:async()=>devices.filter(d=>!removed.includes(d.id)),getDelivery:async id=>deliveries.get(id),
    async claim(id,date,claimedAt){if(deliveries.has(id))return false;deliveries.set(id,{state:'sending',date,claimedAt});return true;},
    sent:async(id,date)=>deliveries.set(id,{state:'sent',date}),release:async id=>deliveries.delete(id),removeDevice:async id=>removed.push(id)};
}
test('Invia una sola volta per quiz e dispositivo, con un collegamento al sito',async()=>{
  const store=memoryStore([device(),device('https://fcm.googleapis.com/test')]),sent=[];
  const args={archive,store,publicKey,now,send:async(...params)=>sent.push(params)};
  assert.equal((await sendDailyPush(args)).sent,2);
  assert.equal((await sendDailyPush(args)).alreadySent,2);
  assert.equal(sent.length,2);
  assert.equal(JSON.parse(sent[0][1]).url,SITE+'#/giornalieri');
  assert.ok(sent[0][2].TTL>0&&sent[0][2].TTL<86400);
});
test('Non invia prima delle 11, per un quiz mancante o con data futura',async()=>{
  let calls=0;
  for(const [when,data] of [[new Date('2026-11-06T09:59:00Z'),archive],[now,{quizzes:[]}],[now,{quizzes:[{date:'2026-11-06',createdAt:'2026-11-06T12:00:00Z'}]}]]){
    await sendDailyPush({archive:data,store:memoryStore(),publicKey,now:when,send:async()=>calls++});
  }
  assert.equal(calls,0);
});
test('Riprova un errore temporaneo senza reinviare ai dispositivi già raggiunti',async()=>{
  const store=memoryStore([device(),device('https://fcm.googleapis.com/test')]);let fail=true,calls=0;
  const args={archive,store,publicKey,now,send:async subscription=>{calls++;if(fail&&subscription.endpoint.includes('fcm'))throw {statusCode:503};}};
  assert.equal((await sendDailyPush(args)).failed,1);fail=false;
  const recovered=await sendDailyPush(args);assert.equal(recovered.sent,1);assert.equal(recovered.alreadySent,1);assert.equal(calls,3);
});
test('Rimuove le iscrizioni scadute senza stampare endpoint o credenziali',async()=>{
  for(const statusCode of [404,410]){
    const store=memoryStore();const result=await sendDailyPush({archive,store,publicKey,now,send:async()=>{throw {statusCode};}});
    assert.equal(result.expired,1);assert.equal(store.removed.length,1);assert.equal(store.deliveries.size,0);
  }
});
test('Una ricevuta in corso viene recuperata solo dopo la scadenza del blocco',async()=>{
  const store=memoryStore(),id=`2026-11-06_${device().id}`;let calls=0;
  store.deliveries.set(id,{state:'sending',claimedAt:now.getTime()});
  const args={archive,store,publicKey,now,send:async()=>calls++};
  assert.equal((await sendDailyPush(args)).alreadySent,1);
  assert.equal((await sendDailyPush({...args,now:new Date(now.getTime()+16*60000)})).sent,1);assert.equal(calls,1);
});
test('Blocca destinazioni estranee, porte, credenziali negli URL e chiavi non corrispondenti',()=>{
  assert.equal(validPushDevice(device(),publicKey),true);
  assert.equal(validPushDevice(device('https://updates.push.services.mozilla.com/wpush/test'),publicKey),true);
  for(const url of ['http://web.push.apple.com/test','https://web.push.apple.com.attacker.test/x','https://127.0.0.1/test','https://web.push.apple.com:444/test','https://user:pass@web.push.apple.com/test'])assert.equal(validPushDevice(device(url),publicKey),false);
  assert.equal(validPushDevice({...device(),id:'a'.repeat(64)},publicKey),false);
  assert.equal(validPushDevice(device(),'C'.repeat(87)),false);
});
test('Legge tutte le pagine Firestore e non divulga il corpo degli errori',async()=>{
  const calls=[];
  const store=createPushStore({projectId:'demo',token:'fake',fetcher:async url=>{
    calls.push(url);return {ok:true,status:200,json:async()=>({documents:[{name:'projects/demo/databases/(default)/documents/pushDevices/'+calls.length,fields:encodeFields({uid:'owner'})}],...(calls.length===1?{nextPageToken:'next'}:{})})};
  }});
  assert.equal((await store.listDevices()).length,2);assert.match(calls[1],/pageToken=next/);
  assert.deepEqual(decodeFields(encodeFields({state:'sent',claimedAt:42})),{state:'sent',claimedAt:42});
  const denied=createPushStore({projectId:'demo',token:'fake',fetcher:async()=>({ok:false,status:403,json:async()=>({secret:'do not display'})})});
  await assert.rejects(denied.listDevices(),error=>error.message==='Archivio notifiche: HTTP 403.');
});
test('Su iOS richiede l’installazione; negli altri browser controlla le API disponibili',()=>{
  const win={isSecureContext:true,Notification:{},PushManager:{},matchMedia:()=>({matches:false})};
  const nav={userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1,serviceWorker:{}};
  assert.equal(pushAvailability({window:win,navigator:nav}),'install');
  assert.equal(pushAvailability({window:win,navigator:{...nav,standalone:true}}),'supported');
  assert.equal(pushAvailability({window:{...win,PushManager:undefined,isSecureContext:false},navigator:{...nav,standalone:true}}),'unsupported');
});
test('La sottoscrizione parte dal tocco, gli errori sono riprovabili e la disattivazione rimuove prima il record remoto',async()=>{
  const saved={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),Notification:globalThis.Notification};
  const events=[],subscription={toJSON:()=>({endpoint:'https://web.push.apple.com/test'}),unsubscribe:async()=>events.push('unsubscribe')};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,userAgent:'Chrome',platform:'Win32',serviceWorker:{}}});
  globalThis.window={isSecureContext:true,Notification:{},PushManager:{}};globalThis.Notification={permission:'default'};
  try{
    const push=createPushNotifications({publicKey,getRegistration:()=>({active:{},pushManager:{subscribe:()=>{events.push('subscribe');return Promise.resolve(subscription);},getSubscription:async()=>subscription}}),getAccount:()=>({uid:'owner'}),
      saveSubscription:async()=>events.push('save'),removeSubscription:async()=>events.push('remove'),onChange:()=>{}});
    const pending=push.enable();assert.equal(events[0],'subscribe');await pending;
    assert.equal(push.getState().code,'enabled');await push.disable();
    assert.deepEqual(events,['subscribe','save','remove','unsubscribe']);
    const fail=createPushNotifications({publicKey,getRegistration:()=>({active:{},pushManager:{subscribe:async()=>subscription}}),getAccount:()=>({uid:'owner'}),saveSubscription:async()=>{throw new Error('offline');},onChange:()=>{}});
    await fail.enable();assert.equal(fail.getState().code,'error');assert.equal(fail.getState().busy,false);
  }finally{
    if(saved.window===undefined)delete globalThis.window;else globalThis.window=saved.window;
    if(saved.navigator)Object.defineProperty(globalThis,'navigator',saved.navigator);else delete globalThis.navigator;
    if(saved.Notification===undefined)delete globalThis.Notification;else globalThis.Notification=saved.Notification;
  }
});
test('Il service worker mostra la notifica e apre solo il percorso interno dei quiz',async()=>{
  const handlers={},notifications=[],opened=[];
  const worker={location:{href:SITE+'sw.js'},addEventListener:(name,callback)=>handlers[name]=callback,
    registration:{showNotification:async(...args)=>notifications.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
  const code=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8')).replace('__PRECACHE__','[]');
  vm.runInNewContext(code,{self:worker,URL,caches:{}});
  let pending;
  handlers.push({data:{json:()=>({date:'2026-11-06',url:'https://attacker.test/'})},waitUntil:promise=>pending=promise});await pending;
  assert.equal(notifications.length,1);assert.equal(notifications[0][1].tag,'segnali-daily-2026-11-06');
  handlers.notificationclick({notification:{close(){}},waitUntil:promise=>pending=promise});await pending;
  assert.deepEqual(opened,[SITE+'#/giornalieri']);
});
