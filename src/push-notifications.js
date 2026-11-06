export function pushAvailability({window:win=window,navigator:nav=navigator}={}){
  const ios=/iPad|iPhone|iPod/.test(nav.userAgent)||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
  if(ios&&!win.matchMedia('(display-mode: standalone)').matches&&!nav.standalone)return 'install';
  return win.isSecureContext&&'Notification'in win&&'PushManager'in win&&'serviceWorker'in nav?'supported':'unsupported';
}

export function createPushNotifications({publicKey,getRegistration,getAccount,saveSubscription,removeSubscription,onChange}){
  let current={code:'loading',busy:false},subscription=null;
  const update=next=>{current={...current,...next};onChange(current);};
  function requirements(){
    const availability=pushAvailability();
    if(availability==='install')return {code:'install',message:'Su iPhone e iPad aggiungi l’app alla schermata Home, poi aprila dalla sua icona.'};
    if(availability==='unsupported')return {code:'unsupported',message:'Questo browser non supporta le notifiche. Su iPhone serve iOS 16.4 o successivo e l’app aggiunta alla Home.'};
    if(!publicKey)return {code:'unconfigured',message:'Le notifiche saranno disponibili al termine della configurazione.'};
    if(!getAccount())return {code:'signed-out',message:'Accedi con Google per attivare le notifiche su questo dispositivo.'};
    if(!getRegistration()?.active)return {code:'loading',message:'Preparazione delle notifiche…'};
    if(Notification.permission==='denied')return {code:'denied',message:'Le notifiche sono bloccate. Puoi consentirle nelle impostazioni delle notifiche dell’app o del browser.'};
    return null;
  }
  async function refresh(){
    if(current.busy)return;
    const requirement=requirements();
    if(requirement){update(requirement);return;}
    try{
      subscription=await getRegistration().pushManager.getSubscription();
      // Re-save existing subscriptions after a sign-in, a rules deployment or a network failure.
      if(subscription){await saveSubscription(subscription.toJSON(),publicKey);update({code:'enabled',message:'Riceverai un avviso quando il quiz del giorno è pubblicato, anche con l’app chiusa.'});}
      else update({code:'disabled',message:'Un avviso quando il nuovo quiz è pronto, normalmente dopo le 11. L’orario può variare.'});
    }catch{update({code:'error',message:'Non riesco a confermare l’attivazione. Controlla la connessione e riprova.'});}
  }
  async function enable(){
    if(current.busy)return;
    const requirement=requirements();if(requirement){update(requirement);return;}
    if(!navigator.onLine){update({code:'error',message:'Per attivare le notifiche serve una connessione.'});return;}
    try{
      // Call subscribe directly in the tap handler, before any asynchronous work: required on iOS.
      const pending=getRegistration().pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
      update({busy:true,code:'enabling',message:'Attivazione delle notifiche…'});
      subscription=await pending;
      await saveSubscription(subscription.toJSON(),publicKey);
      update({code:'enabled',message:'Notifiche attive su questo dispositivo. Puoi disattivarle qui in qualsiasi momento.'});
    }catch{
      update(Notification.permission==='denied'?{code:'denied',message:'Notifiche non consentite. Puoi cambiarlo nelle impostazioni dell’app o del browser.'}:{code:'error',message:'Attivazione non completata. Controlla la connessione e riprova.'});
    }finally{update({busy:false});}
  }
  async function disable(){
    if(current.busy)throw new Error('Attendi il completamento dell’attivazione delle notifiche.');
    const reg=getRegistration();if(!reg?.pushManager)return;
    update({busy:true});
    try{
      subscription=await reg.pushManager.getSubscription();
      if(subscription){
        // Disable delivery at the sender first; don't leave an active server record after logout.
        await removeSubscription(subscription.toJSON());
        await subscription.unsubscribe();subscription=null;
      }
      update({code:'disabled',message:'Notifiche disattivate su questo dispositivo.'});
    }catch{update({code:'error',message:'Disattivazione non completata. Controlla la connessione e riprova.'});throw new Error('Non riesco a disattivare le notifiche. Controlla la connessione e riprova.');}
    finally{update({busy:false});}
  }
  return {refresh,enable,disable,getState:()=>current};
}
