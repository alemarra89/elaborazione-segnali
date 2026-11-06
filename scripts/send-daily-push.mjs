import {readFile} from 'node:fs/promises';
import {createHash,createECDH} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import webpush from 'web-push';
import {dateInRome,dailyIsDue} from '../src/quiz.js';
import {createPushStore,serviceAccountToken} from './push-store.mjs';

export const SITE='https://alemarra89.github.io/elaborazione-segnali/';
export function validPushDevice(device,publicKey){
  try{
    const url=new URL(device.endpoint),host=url.hostname;
    return /^[a-f0-9]{64}$/.test(device.id)&&device.id===createHash('sha256').update(device.endpoint).digest('hex')
      &&url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&!url.hash
      &&(host==='fcm.googleapis.com'||host.endsWith('.push.apple.com')||host.endsWith('.push.services.mozilla.com'))
      &&device.publicKey===publicKey&&typeof device.uid==='string'&&device.uid.length>0
      &&/^[A-Za-z0-9_-]{87}$/.test(device.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(device.auth);
  }catch{return false;}
}
export async function sendDailyPush({archive,store,send,publicKey,now=new Date()}){
  const result={sent:0,alreadySent:0,expired:0,failed:0,invalid:0};
  const date=dateInRome(now);
  if(!dailyIsDue(now)||!archive?.quizzes?.some(quiz=>quiz.date===date&&Date.parse(quiz.createdAt)<=now.getTime()))return result;
  for(const device of await store.listDevices()){
    if(!validPushDevice(device,publicKey)){result.invalid++;continue;}
    const id=`${date}_${device.id}`,previous=await store.getDelivery(id);
    if(previous?.state==='sent'){result.alreadySent++;continue;}
    if(previous){
      if(now.getTime()-previous.claimedAt<15*60*1000){result.alreadySent++;continue;}
      await store.release(id);
    }
    if(!await store.claim(id,date,now.getTime())){result.alreadySent++;continue;}
    const payload={title:'Il quiz di oggi è pronto',body:'Dieci domande per il tuo ripasso di Elaborazione dei segnali.',date,tag:`segnali-daily-${date}`,url:`${SITE}#/giornalieri`};
    try{
      const midnight=new Date(now); // Expire queued messages at the next Rome date, not 24 hours later.
      let ttl=0;while(ttl<86400&&dateInRome(new Date(midnight.getTime()+(ttl+60)*1000))===date)ttl+=60;
      await send({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify(payload),{TTL:Math.max(60,ttl),urgency:'normal',topic:`segnali-${date}`,timeout:15000});
    }catch(error){
      if([404,410].includes(error.statusCode)){await store.removeDevice(device.id);result.expired++;}
      else result.failed++;
      await store.release(id);continue;
    }
    // Keep the claim if recording acceptance fails: a recovery run waits for the lease before retrying.
    await store.sent(id,date);result.sent++;
  }
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(!dailyIsDue()){
      console.log('Non sono ancora le 11 a Roma: nessuna notifica da inviare.');
      process.exit(0);
    }
    const config=JSON.parse(await readFile(new URL('../public/push-config.json',import.meta.url),'utf8'));
    const credentialText=process.env.PUSH_SERVICE_ACCOUNT_JSON,privateKey=process.env.VAPID_PRIVATE_KEY;
    if(!credentialText||!privateKey)throw new Error('Configurare PUSH_SERVICE_ACCOUNT_JSON e VAPID_PRIVATE_KEY nei segreti GitHub prima di inviare le notifiche.');
    let credential;
    try{credential=JSON.parse(credentialText);}catch{throw new Error('Il segreto PUSH_SERVICE_ACCOUNT_JSON non contiene un JSON valido.');}
    const firebase=JSON.parse(await readFile(new URL('../public/firebase-config.json',import.meta.url),'utf8'));
    if(credential.project_id!==firebase.firebase.projectId)throw new Error('Progetto del mittente diverso dal progetto Firebase.');
    const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(Buffer.from(privateKey,'base64url'));
    if(ecdh.getPublicKey().toString('base64url')!==config.publicKey)throw new Error('Le chiavi pubblica e privata delle notifiche non corrispondono.');
    const response=await fetch(`${SITE}data/daily.json?push=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Quiz pubblicato non verificabile: nessuna notifica inviata.');
    const archive=await response.json();
    if(!archive.quizzes?.some(quiz=>quiz.date===dateInRome()))throw new Error('Quiz di oggi non ancora online: nessuna notifica inviata.');
    const token=await serviceAccountToken(credential);
    const store=createPushStore({projectId:credential.project_id,token});
    webpush.setVapidDetails('mailto:'+firebase.allowedEmail,config.publicKey,privateKey);
    const result=await sendDailyPush({archive,store,publicKey:config.publicKey,send:(...args)=>webpush.sendNotification(...args)});
    console.log(JSON.stringify(result));
    if(result.failed||result.invalid)throw new Error('Alcune notifiche non sono state inviate; controllare la configurazione. Gli invii falliti verranno ritentati al prossimo controllo.');
  }catch(error){console.error(error instanceof TypeError?'Connessione al servizio notifiche non riuscita.':error.message);process.exitCode=1;}
}
