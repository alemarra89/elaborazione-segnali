import {sample,makeSession,remaining,finish,status,mistakeQuestions,matches,normalize,dateInRome,dailyState,streak,formatTime} from './quiz.js';
import {createCloudSync} from './cloud-sync.js';
import {emptyStudy} from './sync-model.js';
import {createPushNotifications} from './push-notifications.js';

const KEY='segnali.study.v1';
const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=escape;
const paths={home:'M3 10l9-7 9 7v10H3z M9 20v-7h6v7',book:'M3 4h6a4 4 0 013 2 4 4 0 013-2h6v16h-6a4 4 0 00-3 1 4 4 0 00-3-1H3z M12 6v15',calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h1 M12 14h1 M16 14h1 M8 17h1 M12 17h1',exam:'M2 8l10-5 10 5-10 5z M6 10v6c4 4 8 4 12 0v-6 M22 8v8',bookmark:'M6 3h12v18l-6-4-6 4z',history:'M3 11a9 9 0 119 10 M3 3v8h8 M12 7v6l4 2',arrow:'M5 12h14 M13 6l6 6-6 6',back:'M19 12H5 M11 6l-6 6 6 6',check:'M5 12l4 4L19 6',clock:'M21 12a9 9 0 11-18 0 9 9 0 0118 0 M12 7v5l3 2',search:'M20 20l-5-5 M17 10a7 7 0 11-14 0 7 7 0 0114 0',refresh:'M20 7A9 9 0 103 15 M20 3v5h-5',download:'M12 3v12 M6 9l6 6 6-6 M4 16v5h16v-5',layers:'M3 7l9-4 9 4-9 4z M3 12l9 4 9-4 M3 17l9 4 9-4',x:'M6 6l12 12 M18 6L6 18',lock:'M5 10h14v11H5z M8 10V7a4 4 0 018 0v3',spark:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',info:'M21 12a9 9 0 11-18 0 9 9 0 0118 0 M12 11v6 M12 7v1'};
const icon=(name,size=19)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.book}"/></svg>`;
const tag=(text,tone='')=>`<span class="tag ${tone}">${escape(text)}</span>`;
const button=(text,action,extra='',kind='')=>`<button class="button ${kind}" data-action="${action}" ${extra}>${escape(text)}</button>`;
const link=(text,route,kind='secondary',end=true)=>`<a class="button ${kind}" href="#/${route}">${escape(text)}${end?icon('arrow',16):''}</a>`;
const textLink=(text,route)=>`<a class="text-link" href="#/${route}">${escape(text)}${icon('arrow',14)}</a>`;
const pageTitle=(label,title,description='',right='')=>`<header class="page-heading"><div><div class="eyebrow">${escape(label)}</div><h1>${escape(title)}</h1>${description?`<p>${escape(description)}</p>`:''}</div>${right}</header>`;
const section=(title,description='',right='')=>`<div class="section-heading"><div><h2>${escape(title)}</h2>${description?`<p>${escape(description)}</p>`:''}</div>${right}</div>`;
const empty=(title,text,name='book',action='')=>`<div class="card empty">${icon(name,32)}<h2>${escape(title)}</h2><p>${escape(text)}</p>${action}</div>`;
const dateLabel=(date,options={day:'numeric',month:'long'})=>new Intl.DateTimeFormat('it-IT',{...options,timeZone:'Europe/Rome'}).format(new Date(`${date}T12:00:00Z`));
const dateTime=value=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(new Date(value));
let state=emptyStudy(),stateKey=KEY,cloud=null,account=null;
let cloudStatus={code:'loading',message:'',pending:0,lastSynced:null};
let storageError='',dataset,archive={quizzes:[]},registration,installPrompt,toastTimer,screenFilter='all',search='',chapterFilter='all',resultFilter='all',ripassoTab='mistakes';
let lastRoute='',busy=false;
let push=null,pushStatus={code:'loading',busy:false,message:'Preparazione delle notifiche…'};
try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved){
    if(!Array.isArray(saved.history)||!Array.isArray(saved.favorites)||!saved.dailyProgress||!saved.dailyDrafts)throw new Error('Formato dei progressi non riconosciuto');
    state=saved;
  }
}catch{storageError='Non riesco a leggere i progressi salvati. I nuovi tentativi rimarranno in memoria finché il salvataggio non sarà disponibile.';}
function save(sync=true){
  try{localStorage.setItem(stateKey,JSON.stringify(state));storageError='';}
  catch{storageError='Salvataggio sul dispositivo non disponibile. Mantieni aperta questa pagina per conservare le risposte.';}
  if(sync)cloud?.publish(state);
}
function loadStudy(key){
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.history)&&Array.isArray(saved.favorites)&&saved.dailyProgress&&saved.dailyDrafts)return {...emptyStudy(),...saved};}catch{}
  return null;
}
function switchAccount(user){
  account=user;stateKey=user?`${KEY}.account.${user.uid}`:KEY;
  if(user){
    if(!localStorage.getItem(KEY+'.before-cloud'))try{localStorage.setItem(KEY+'.before-cloud',localStorage.getItem(KEY)||JSON.stringify(state));}catch{}
    state=loadStudy(stateKey)||loadStudy(KEY)||emptyStudy();
  }else state=loadStudy(KEY)||emptyStudy();
  save(false);if(!checkExpiry())renderPreservingView();
  void push?.refresh();
}
function syncLabel(){return cloudStatus.code==='loading'?'Preparazione…':cloudStatus.code==='signed-out'?'Solo su questo dispositivo':cloudStatus.code==='connecting'?'Connessione…':cloudStatus.code==='pending'?'Modifiche da inviare':cloudStatus.code==='offline'?'In attesa della rete':cloudStatus.code==='error'?'Sincronizzazione sospesa':'Sincronizzato';}
function syncStatusMarkup(){return `<span class="dot ${['error','offline','pending'].includes(cloudStatus.code)?'offline':''}"></span><span>${escape(syncLabel())}</span>`;}
function renderPreservingView(){
  const y=window.scrollY,focused=document.activeElement,id=focused?.id,start=focused?.selectionStart,end=focused?.selectionEnd;
  render();window.scrollTo(0,y);
  if(id){const replacement=document.getElementById(id);replacement?.focus({preventScroll:true});if(typeof replacement?.setSelectionRange==='function'&&start!==null&&start!==undefined)replacement.setSelectionRange(start,end);}
}
function updateCloudStatus(next){
  cloudStatus={...next,lastSynced:next.lastSynced||cloudStatus.lastSynced};
  document.querySelectorAll('.sync-status').forEach(el=>{el.innerHTML=syncStatusMarkup();});
  if(route()==='account')renderPreservingView();
  renderBanners();
}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function route(){return location.hash.replace(/^#\/?/,'')||'home';}
function go(path){if(route()===path)render();else location.hash='/'+path;}
function showDialog(title,text,actions){
  dialog.innerHTML=`<div class="spread"><h2 id="dialog-title">${escape(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Chiudi">${icon('x')}</button></div><p>${escape(text)}</p>${actions.map((action,index)=>`<button class="button ${index?'secondary':''}" data-dialog-choice="${index}">${escape(action.text)}</button>`).join('')}`;
  dialog.querySelectorAll('[data-dialog-choice]').forEach(el=>el.addEventListener('click',()=>{dialog.close();actions[Number(el.dataset.dialogChoice)].run();}));
  dialog.showModal();
}
function getAttempt(id){return state.history.find(a=>a.id===id)||Object.values(state.dailyProgress).map(p=>p.attempt).find(a=>a?.id===id);}
function quizName(attempt){return attempt.mode==='daily'?`Ripasso del ${dateLabel(attempt.dailyDate)}`:attempt.mode==='exam'?'Simulazione d’esame':attempt.mode==='mistakes'?'Ripasso degli errori':`Quiz del capitolo ${attempt.chapterId}`;}
function completeSession(automatic=false){
  if(!state.session)return;
  if(dialog.open)dialog.close();
  const result=finish(state.session);
  state.history=[result,...state.history.filter(a=>a.id!==result.id)].slice(0,100);
  if(result.dailyDate){
    const old=state.dailyProgress[result.dailyDate];
    state.dailyProgress[result.dailyDate]={attempt:result,completedAt:result.finishedAt,firstCompletedAt:old?.firstCompletedAt??result.finishedAt,bestCorrect:Math.max(old?.bestCorrect??0,result.correct)};
    delete state.dailyDrafts[result.dailyDate];
  }
  state.session=null;save();
  go('risultato/'+result.id);
  if(automatic)toast('Tempo scaduto: simulazione consegnata automaticamente.');
}
function checkExpiry(){if(state.session?.expiresAt&&remaining(state.session)===0){completeSession(true);return true;}return false;}
function begin(mode,value){
  if(checkExpiry())return;
  let questions,chapterId=null,dailyDate=null,draft=null;
  if(mode==='chapter'){
    chapterId=Number(value);if(!dataset.chapters.find(c=>c.id===chapterId)?.available)return;
    questions=dataset.questions.filter(q=>q.chapterId===chapterId);
  }else if(mode==='exam'){if(dataset.questions.length<30){toast('Servono almeno 30 domande disponibili.');return;}questions=sample(dataset.questions,30);}
  else if(mode==='mistakes'){questions=sample(mistakeQuestions(state.history,dataset.questions),30);}
  else if(mode==='daily'){
    const quiz=visibleDaily().find(q=>q.date===value);if(!quiz)return;
    dailyDate=value;draft=state.dailyDrafts[value];questions=quiz.questions;
  }
  if(!questions?.length)return;
  if(state.session&&((mode==='daily'&&state.session.dailyDate===dailyDate)||(mode==='chapter'&&state.session.mode===mode&&state.session.chapterId===chapterId))){go('quiz');return;}
  const start=()=>{
    if(state.session?.dailyDate)state.dailyDrafts[state.session.dailyDate]=structuredClone(state.session);
    state.session=draft?structuredClone(draft):makeSession(mode,questions,{chapterId,dailyDate});
    if(dailyDate)delete state.dailyDrafts[dailyDate];save();go('quiz');
  };
  if(state.session){showDialog('Hai un quiz in corso','Puoi riprenderlo oppure iniziare questo quiz. I quiz giornalieri in corso vengono conservati; gli altri quiz non consegnati saranno abbandonati.',[{text:'Riprendi il quiz in corso',run:()=>go('quiz')},{text:'Inizia questo quiz',run:start},{text:'Annulla',run:()=>{}}]);return;}
  if(mode==='daily'&&state.dailyProgress[dailyDate]&&!draft){showDialog('Ripeti il quiz giornaliero','Le domande restano le stesse. Salveremo il nuovo risultato e conserveremo lo stato di completamento e il punteggio migliore.',[{text:'Ripeti il quiz',run:start},{text:'Annulla',run:()=>{}}]);return;}
  start();
}
function visibleDaily(){return archive.quizzes.filter(q=>new Date(q.createdAt).getTime()<=Date.now()).sort((a,b)=>b.date.localeCompare(a.date));}
function chapterProgress(id){const attempts=state.history.filter(a=>a.mode==='chapter'&&a.chapterId===id);return {count:attempts.length,last:attempts[0],best:attempts.length?Math.max(...attempts.map(a=>a.correct)):0};}
function chapterCard(chapter){
  const progress=chapterProgress(chapter.id);
  return `<article class="card chapter-card ${chapter.available?'':'disabled'}"><div class="spread"><span class="chapter-number">${String(chapter.id).padStart(2,'0')}</span>${chapter.available?tag(progress.count?'Affrontato':'Disponibile',progress.count?'good':''):tag(chapter.status==='empty'?'In arrivo':`${chapter.questionCount}/10 domande`)}</div><h3>${chapter.available?`<a href="#/capitolo/${chapter.id}">${escape(chapter.title)}</a>`:escape(chapter.title)}</h3>${chapter.available?`<div class="progress" aria-label="Miglior punteggio ${progress.best} su 10"><span style="width:${progress.best*10}%"></span></div><div class="card-bottom"><span>${progress.count?`Migliore: ${progress.best}/10`:'10 domande · Senza timer'}</span><a href="#/capitolo/${chapter.id}" aria-label="Apri capitolo ${chapter.id}">${icon('arrow',16)}</a></div>`:`<div class="card-bottom">${icon('lock',13)}<span>${chapter.status==='empty'?'Domande non ancora caricate':'In attesa di 10 domande complete'}</span></div>`}</article>`;
}
function stat(label,value,name){return `<div class="stat"><div class="stat-label">${escape(label)}${icon(name,16)}</div><div class="stat-value">${escape(value)}</div></div>`;}
function dailyButton(quiz,kind='secondary small'){
  const progress=dailyState(quiz.date,state);
  return progress.status==='completed'?`<a class="button ${kind}" href="#/risultato/${progress.attempt.id}">Vedi risultato ${icon('arrow',14)}</a>`:button(progress.status==='in-progress'?'Riprendi':'Fai il quiz','start',`data-mode="daily" data-value="${quiz.date}"`,kind);
}
function home(){
  const total=state.history.reduce((sum,a)=>sum+a.questions.length,0),correct=state.history.reduce((sum,a)=>sum+a.correct,0);
  const ready=dataset.chapters.filter(c=>c.available),done=new Set(state.history.filter(a=>a.mode==='chapter').map(a=>a.chapterId));
  const next=ready.find(c=>!done.has(c.id))||ready[0];
  const today=visibleDaily().find(q=>q.date===dateInRome());
  const dailyProgress=today?dailyState(today.date,state):null;
  const mistakes=mistakeQuestions(state.history,dataset.questions);
  return `${pageTitle('Il tuo percorso di preparazione','Facciamo spazio allo studio.','Elaborazione dei segnali, un passo alla volta.',tag(`${ready.length} capitoli disponibili su 45`))}
  <section class="hero"><div class="grow"><div class="eyebrow row gap8"><span class="dot"></span>La teoria diventa pratica</div><h2>Trova il tuo ritmo.<br>Allena ciò che sai.</h2><p>Esplora le domande, ripassa un capitolo e torna ogni giorno per dieci domande nuove da affrontare.</p>${next?link(done.size?'Continua il percorso':'Inizia dal primo capitolo','capitolo/'+next.id,''):''}</div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit"></div><svg viewBox="0 0 200 140"><path d="M10 70H190 M100 12V128" stroke="#a7cee9" stroke-width="1"/><path d="M13 70c15-66 29-66 44 0s29 66 43 0 29-66 44 0 29 66 43 0" fill="none" stroke="#2b6c9a" stroke-width="3.2" stroke-linecap="round"/><circle cx="100" cy="70" r="5" fill="#fff" stroke="#2b6c9a" stroke-width="2"/></svg><span class="tiny-label">Un segnale, un passo avanti.</span></div></section>
  <section class="daily-callout"><div><div class="eyebrow">Il tuo appuntamento quotidiano</div><h3>${today?(dailyProgress.status==='completed'?'Il ripasso di oggi è fatto.':'Dieci domande, ogni giorno.'):'Il prossimo ripasso ti aspetta.'}</h3><p>${today?`${dateLabel(today.date)} · 10 domande · Senza timer${dailyProgress.status==='completed'?` · ${dailyProgress.attempt.correct}/10 risposte corrette`:''}`:'Un nuovo quiz viene preparato ogni giorno dalle 11:00. Gli aggiornamenti possono richiedere qualche minuto.'}</p></div>${today?dailyButton(today,''):link('Apri i quiz giornalieri','giornalieri','secondary')}</section>
  ${state.session?`<div class="card mt spread wrap"><div><div class="row gap8">${icon('clock',17)}<strong class="small">Hai un quiz in corso</strong></div><p class="muted small" style="margin-top:7px">${Object.keys(state.session.answers).length}/${state.session.questions.length} risposte salvate · ${state.session.expiresAt?`<span data-timer>${formatTime(remaining(state.session))}</span> rimanenti`:'Nessun limite di tempo'}</p></div>${link('Riprendi il quiz','quiz','secondary')}</div>`:''}
  <div class="stats">${stat('Domande disponibili',dataset.questions.length,'layers')}${stat('Capitoli affrontati',`${done.size}/45`,'book')}${stat('Quiz completati',state.history.length,'check')}${stat('Risposte corrette',total?Math.round(correct/total*100)+'%':'—','history')}</div>
  ${section('Come vuoi allenarti?','Scegli il ritmo che fa per te.')}
  <div class="two-col"><article class="card training-card"><div class="spread"><span class="tile-icon">${icon('book',24)}</span>${tag('Al tuo ritmo')}</div><h2>Quiz per capitolo</h2><p>Dieci domande, senza timer. Concentrati su un argomento e verifica ciò che hai imparato.</p>${link('Scegli un capitolo','capitoli')}</article><article class="card training-card exam"><div class="spread"><span class="tile-icon">${icon('exam',24)}</span>${tag('30 minuti')}</div><h2>Simulazione d’esame</h2><p>Trenta domande casuali dai capitoli disponibili. Una nuova selezione a ogni tentativo.</p>${link('Prepara la simulazione','esame')}</article></div>
  ${section('Il prossimo capitolo','Il programma cresce insieme ai tuoi appunti.',textLink('Tutti i capitoli','capitoli'))}<div class="three-col">${dataset.chapters.slice(Math.min(Math.max((next?.id||1)-1,0),42),Math.min(Math.max((next?.id||1)-1,0),42)+3).map(chapterCard).join('')}</div>
  ${mistakes.length?`<div class="card mt stack"><div class="row">${icon('refresh',21)}<h2>Ripartiamo dagli errori</h2></div><p class="muted small">${mistakes.length} domande da rivedere. Una risposta corretta nel prossimo quiz le toglierà dal ripasso.</p>${textLink('Vai al tuo ripasso','ripasso')}</div>`:''}
  ${state.history.length?section('I tuoi ultimi tentativi','',textLink('Apri lo storico','storico'))+state.history.slice(0,3).map(attemptRow).join(''):''}`;
}
function searchBox(placeholder='Cerca una domanda o una risposta…'){return `<label class="search">${icon('search',18)}<span class="sr-only">${escape(placeholder)}</span><input type="search" id="search" placeholder="${attr(placeholder)}" value="${attr(search)}" autocomplete="off"></label>`;}
function chaptersPage(){return `${pageTitle('Il programma','Un capitolo alla volta.','Tutti i 45 capitoli del corso. Quelli in arrivo si abiliteranno automaticamente dopo l’aggiornamento delle domande.')}
  <div class="toolbar">${searchBox('Cerca un capitolo, una domanda o una risposta…')}<label><span class="sr-only">Filtra capitoli</span><select class="select" id="chapter-filter"><option value="all" ${chapterFilter==='all'?'selected':''}>Tutti i capitoli</option><option value="ready" ${chapterFilter==='ready'?'selected':''}>Disponibili</option><option value="empty" ${chapterFilter==='empty'?'selected':''}>In arrivo</option><option value="done" ${chapterFilter==='done'?'selected':''}>Affrontati</option></select></label></div><div id="chapter-results">${chapterResults()}</div>`;}
function chapterResults(){
  const filtered=dataset.chapters.filter(c=>{
    const textMatch=!search||normalize(`${c.id} ${c.title}`).includes(normalize(search))||dataset.questions.some(q=>q.chapterId===c.id&&matches(q,search));
    return textMatch&&(chapterFilter==='all'||chapterFilter==='ready'&&c.available||chapterFilter==='empty'&&!c.available||chapterFilter==='done'&&chapterProgress(c.id).count>0);
  });
  return filtered.length?`<p class="muted small" style="margin-bottom:15px">${filtered.length} capitoli${search?' trovati':''}</p><div class="chapter-grid">${filtered.map(chapterCard).join('')}</div>`:empty('Nessun capitolo trovato','Prova a cambiare la ricerca o il filtro.','search');
}
function questionCard(q,{selected,study=false,review=false,position=q.number}={}){
  const show=study||review,favorite=state.favorites.includes(q.id),result=status(q,{[q.id]:selected});
  return `<article class="card question-card" data-question-id="${q.id}"><div class="spread"><div class="row wrap gap8"><span class="eyebrow">Domanda ${position}${show?` · Cap. ${q.chapterId}`:''}</span>${review?tag(result==='correct'?'Corretta':result==='incorrect'?'Da ripassare':'Non risposta',result==='correct'?'good':result==='incorrect'?'error':'warm'):''}</div><button class="icon-button ${favorite?'selected':''}" data-action="favorite" data-id="${q.id}" aria-label="${favorite?'Rimuovi dai preferiti':'Aggiungi ai preferiti'}" aria-pressed="${favorite}">${icon('bookmark',18)}</button></div><div class="question-text">${escape(q.text)}</div>
  <div class="options" ${!show?'role="radiogroup" aria-label="Risposte alla domanda '+position+'"':''}>${q.options.map((option,i)=>{
    const correct=show&&i===q.correctIndex,wrong=review&&selected===i&&i!==q.correctIndex,chosen=!show&&selected===i;
    const body=`<span class="letter">${correct?icon('check',14):wrong?icon('x',14):String.fromCharCode(65+i)}</span><span class="grow">${escape(option)}${correct?`<span class="option-note" style="display:block">Risposta esatta${review&&selected===i?' · La tua risposta':''}</span>`:wrong?'<span class="option-note" style="display:block">La tua risposta</span>':''}</span>${chosen?icon('check',16):''}`;
    return show?`<div class="option ${correct?'correct':wrong?'incorrect':''}">${body}</div>`:`<button class="option interactive ${chosen?'chosen':''}" role="radio" aria-checked="${chosen}" tabindex="${selected===undefined?i===0?0:-1:selected===i?0:-1}" data-action="answer" data-value="${i}">${body}</button>`;
  }).join('')}</div>${show&&q.note?`<p class="question-note">${escape(q.note)}</p>`:''}${show?`<div class="question-source">${escape(dataset.chapters.find(c=>c.id===q.chapterId)?.title||'Capitolo '+q.chapterId)}</div>`:''}</article>`;
}
function chapterPage(id){
  const chapter=dataset.chapters.find(c=>c.id===Number(id));
  if(!chapter)return notFound();
  if(!chapter.available)return `${pageTitle('Capitolo '+chapter.id,chapter.title)}${empty('Questo capitolo è in arrivo','Il capitolo si abiliterà quando il foglio conterrà tutte le 10 domande complete.','lock',link('Torna ai capitoli','capitoli'))}`;
  return `<a class="back-link" href="#/capitoli">${icon('back',14)}Tutti i capitoli</a>${pageTitle('Capitolo '+chapter.id,chapter.title,'Leggi le domande e le soluzioni oppure mettiti alla prova con un quiz senza timer.')}
  <div class="card spread wrap" style="margin-bottom:24px"><div><strong class="small">10 domande · Senza timer</strong><p class="muted small">Un punto per risposta corretta, nessuna penalità.</p></div>${button('Inizia il quiz di capitolo','start',`data-mode="chapter" data-value="${chapter.id}"`)}</div><div class="toolbar">${searchBox('Cerca in questo capitolo…')}</div><div id="study-results">${studyResults(dataset.questions.filter(q=>q.chapterId===chapter.id))}</div>`;
}
function studyResults(questions){const filtered=questions.filter(q=>matches(q,search));return filtered.length?filtered.map(q=>questionCard(q,{study:true})).join(''):empty('Nessuna domanda trovata','Prova a cambiare i termini della ricerca.','search');}
function examPage(){return `${pageTitle('Mettiti alla prova','La tua simulazione d’esame.','Una selezione casuale dai capitoli già disponibili, per misurare la tua preparazione.')}
  <div class="two-col"><div class="card stack"><span class="tile-icon" style="align-self:flex-start">${icon('exam',30)}</span><h2>Trenta domande.<br>Trenta minuti per te.</h2><p class="muted small">Puoi passare da una domanda all’altra e modificare le risposte fino alla consegna. Non vedrai le soluzioni durante il quiz.</p><div class="stats" style="grid-template-columns:1fr 1fr;margin:0">${stat('Domande casuali',30,'layers')}${stat('Tempo a disposizione','30:00','clock')}</div>${button('Inizia la simulazione','start','data-mode="exam"'+(dataset.questions.length<30?' disabled':''))}</div><div class="card stack"><h2>Prima di cominciare</h2><p class="muted small">Ogni risposta corretta vale 1 punto. Risposte sbagliate e non date valgono 0: nessuna penalità.</p><p class="muted small">Il timer continua anche chiudendo l’app. Alla scadenza, la simulazione viene consegnata automaticamente; se l’app è chiusa, il risultato viene finalizzato alla riapertura.</p><p class="muted small">Le risposte sono salvate sul dispositivo. Puoi riprendere il quiz dal punto in cui l’hai lasciato.</p><div class="notice">Il set attuale comprende ${dataset.questions.length} domande da ${dataset.chapters.filter(c=>c.available).length} capitoli.</div></div></div>`;}
function dailyRow(quiz){
  const progress=dailyState(quiz.date,state),done=progress.status==='completed',started=progress.status==='in-progress';
  const parts=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',timeZone:'Europe/Rome'}).formatToParts(new Date(quiz.date+'T12:00:00Z'));
  return `<article class="list-row"><div class="daily-date">${parts.find(p=>p.type==='day').value}<span>${escape(parts.find(p=>p.type==='month').value)}</span></div><div class="grow"><h3>${quiz.date===dateInRome()?'Il quiz di oggi':`Ripasso del ${dateLabel(quiz.date,{day:'numeric',month:'long',year:'numeric'})}`}</h3><p>10 domande · Senza timer${done?` · Completato il ${dateTime(progress.completedAt)}`:''}</p></div>${tag(done?'Completato':started?'In corso':'Da fare',done?'good':started?'warm':'')}${done?`<span class="score">${progress.attempt.correct}<span class="muted small">/10</span></span>`:''}${dailyButton(quiz)}${done?button('Ripeti','start',`data-mode="daily" data-value="${quiz.date}"`,'secondary small'):''}</article>`;
}
function dailyPage(){
  const quizzes=visibleDaily(),completed=quizzes.filter(q=>dailyState(q.date,state).status==='completed').length;
  const today=quizzes.find(q=>q.date===dateInRome());
  return `${pageTitle('La costanza conta','Dieci domande, ogni giorno.','Il tuo archivio di ripasso: un quiz nuovo dalle 11:00 e tutti i giorni precedenti sempre a disposizione.',tag('Ore 11:00 · Italia'))}
  <div class="stats" style="margin:0 0 24px">${stat('Quiz disponibili',quizzes.length,'calendar')}${stat('Completati',completed,'check')}${stat('Da recuperare',quizzes.length-completed,'history')}${stat('Giorni consecutivi',streak(state.dailyProgress),'spark')}</div>
  ${!today?'<div class="notice">Il quiz di oggi non è ancora disponibile. La preparazione parte alle 11:00, ora italiana, e la pubblicazione può richiedere qualche minuto. Usa “Aggiorna” per controllare se è arrivato.</div>':''}
  <div class="toolbar"><label><span class="sr-only">Filtra quiz giornalieri</span><select id="daily-filter" class="select"><option value="all" ${screenFilter==='all'?'selected':''}>Tutti i quiz</option><option value="todo" ${screenFilter==='todo'?'selected':''}>Da fare</option><option value="in-progress" ${screenFilter==='in-progress'?'selected':''}>In corso</option><option value="completed" ${screenFilter==='completed'?'selected':''}>Completati</option></select></label><span class="muted small grow">I quiz mantengono le domande estratte quel giorno.</span>${button('Aggiorna','refresh','','secondary small')}</div><div id="daily-results">${dailyResults()}</div>`;
}
function dailyResults(){const filtered=visibleDaily().filter(q=>screenFilter==='all'||dailyState(q.date,state).status===screenFilter);return filtered.length?filtered.map(dailyRow).join(''):empty(screenFilter==='all'?'Il primo ripasso sta arrivando.':'Nessun quiz in questo elenco.',screenFilter==='all'?'Qui troverai i quiz giornalieri, anche nei giorni in cui non apri l’app.':'Puoi cambiare filtro per vedere gli altri quiz.','calendar');}
function quizPage(){
  const session=state.session;if(!session)return `${pageTitle('Allenamento','Nessun quiz in corso.')}${empty('Scegli il prossimo passo.','Puoi allenarti su un capitolo, recuperare un quiz giornaliero o fare una simulazione.','book',link('Scegli un capitolo','capitoli'))}`;
  const i=Math.max(0,Math.min(session.position,session.questions.length-1)),q=session.questions[i],answered=Object.keys(session.answers).length;
  return `${pageTitle(session.mode==='exam'?'Simulazione d’esame':'Il tuo allenamento',quizName(session),session.mode==='exam'?'Il tempo continua a scorrere anche se esci da questa schermata.':'Prenditi il tempo che ti serve. Le risposte restano modificabili fino alla consegna.')}
  <div class="quiz-layout"><div class="quiz-body"><div class="spread" style="margin-bottom:14px"><span class="quiz-counter">Domanda ${i+1} di ${session.questions.length}</span>${tag(`${answered} risposte salvate`)}</div>${questionCard(q,{selected:session.answers[q.id],position:i+1})}<div class="quiz-footer">${button('Precedente','position',`data-value="${i-1}" ${i===0?'disabled':''}`,'secondary')}${i===session.questions.length-1?button('Consegna quiz','submit'):button('Successiva','position',`data-value="${i+1}"`)}</div>${session.answers[q.id]!==undefined?`<button class="icon-button small" data-action="clear-answer">${icon('x',14)}Cancella questa risposta</button>`:''}</div>
  <aside class="card quiz-panel"><div class="eyebrow">${session.expiresAt?'Tempo rimanente':'Il tuo ritmo'}</div>${session.expiresAt?`<div class="timer" data-timer role="timer" aria-label="Tempo rimanente">${formatTime(remaining(session))}</div>`:'<p class="small" style="margin-top:8px">Nessun limite di tempo</p>'}<div class="question-grid" aria-label="Vai a una domanda">${session.questions.map((q,j)=>`<button class="question-index ${session.answers[q.id]!==undefined?'answered':''} ${j===i?'current':''}" data-action="position" data-value="${j}" aria-label="Domanda ${j+1}${session.answers[q.id]!==undefined?', risposta salvata':', senza risposta'}" ${j===i?'aria-current="step"':''}>${j+1}</button>`).join('')}</div><div class="legend">Azzurro: risposta salvata.<br>Bordo blu: domanda corrente.</div><div class="progress" style="margin:17px 0"><span style="width:${answered/session.questions.length*100}%"></span></div>${button('Consegna quiz','submit','','secondary small')}<p class="muted" style="font-size:10px;margin-top:12px">${storageError?'Salvataggio non disponibile.':'Risposte salvate su questo dispositivo.'}</p></aside></div>`;
}
function attemptRow(attempt){return `<article class="list-row"><span class="tile-icon">${icon(attempt.mode==='exam'?'exam':attempt.mode==='daily'?'calendar':attempt.mode==='mistakes'?'refresh':'book',20)}</span><div class="grow"><h3><a href="#/risultato/${attempt.id}">${escape(quizName(attempt))}</a></h3><p>${dateTime(attempt.finishedAt)} · ${formatTime(attempt.durationSeconds)}${attempt.timedOut?' · Tempo scaduto':''}</p></div><span class="score">${attempt.correct}<span class="muted small">/${attempt.questions.length}</span></span><a class="icon-button" href="#/risultato/${attempt.id}" aria-label="Vedi risultato del ${attr(dateTime(attempt.finishedAt))}">${icon('arrow',17)}</a></article>`;}
function resultPage(id){
  const attempt=getAttempt(id);if(!attempt)return `${pageTitle('Risultati','Tentativo non disponibile.')}${empty('Questo risultato non è nello storico.','Sono conservati gli ultimi 100 tentativi e l’ultimo risultato di ogni quiz giornaliero.','history',link('Apri lo storico','storico'))}`;
  return `<a href="#/storico" class="back-link">${icon('back',14)}Tutti i risultati</a>${pageTitle('Il tuo risultato',quizName(attempt),`${dateTime(attempt.finishedAt)} · Durata ${formatTime(attempt.durationSeconds)}`)}${attempt.timedOut?'<div class="notice warning">Il tempo è scaduto: la simulazione è stata consegnata automaticamente.</div>':''}
  <section class="result-hero"><div class="score-circle"><strong>${attempt.correct}<span style="font-size:22px">/${attempt.questions.length}</span></strong><span>${Math.round(attempt.correct/attempt.questions.length*100)}% corrette</span></div><div class="stack"><div><div class="eyebrow">Ogni tentativo è un passo avanti</div><h2 style="margin-top:10px">${attempt.correct===attempt.questions.length?'Tutte le risposte al posto giusto.':'Facciamo il punto.'}</h2></div><p class="muted small">${attempt.correct===attempt.questions.length?'Ottimo lavoro. Continua a ripassare per mantenere il ritmo.':'Rivedi le soluzioni e dedica un po’ di attenzione alle domande da ripassare.'}</p><div class="row wrap">${button('Ripeti il quiz','repeat',`data-id="${attempt.id}"`,'secondary small')}${textLink('Vai al ripasso','ripasso')}</div></div></section>
  <div class="result-stats"><div class="card result-stat good"><strong>${attempt.correct}</strong><span>Corrette</span></div><div class="card result-stat bad"><strong>${attempt.incorrect}</strong><span>Sbagliate</span></div><div class="card result-stat blank"><strong>${attempt.unanswered}</strong><span>Non risposte</span></div></div>
  ${section('Rivedi le tue risposte')}<div class="tabs" role="group" aria-label="Filtra risultati">${[['all','Tutte'],['correct','Corrette'],['incorrect','Sbagliate'],['unanswered','Non risposte']].map(([value,label])=>`<button class="tab ${resultFilter===value?'active':''}" data-action="result-filter" data-value="${value}" aria-pressed="${resultFilter===value}">${label}</button>`).join('')}</div><div id="result-questions">${resultQuestions(attempt)}</div>`;
}
function resultQuestions(attempt){const questions=attempt.questions.map((q,i)=>({q,number:i+1})).filter(({q})=>resultFilter==='all'||status(q,attempt.answers)===resultFilter);return questions.length?questions.map(({q,number})=>questionCard(q,{review:true,selected:attempt.answers[q.id],position:number})).join(''):empty('Nessuna risposta in questo gruppo.','Scegli un altro filtro per continuare il ripasso.','check');}
function reviewPage(){
  const mistakes=mistakeQuestions(state.history,dataset.questions);
  return `${pageTitle('Il tuo ripasso','Conserva ciò che conta.','Ritrova i preferiti e torna sulle domande da ripassare. L’ultimo esito di ogni domanda determina se resta tra gli errori.')}
  <div class="tabs" role="group" aria-label="Scegli il ripasso"><button class="tab ${ripassoTab==='mistakes'?'active':''}" data-action="review-tab" data-value="mistakes" aria-pressed="${ripassoTab==='mistakes'}">Errori da ripassare (${mistakes.length})</button><button class="tab ${ripassoTab==='favorites'?'active':''}" data-action="review-tab" data-value="favorites" aria-pressed="${ripassoTab==='favorites'}">Preferiti (${state.favorites.length})</button></div>
  ${ripassoTab==='mistakes'&&mistakes.length?`<div class="card spread wrap" style="margin-bottom:20px"><div><strong class="small">Un’altra occasione per imparare.</strong><p class="muted small">Fino a 30 domande, senza timer. Le risposte corrette risolvono gli errori precedenti.</p></div>${button('Inizia il ripasso','start','data-mode="mistakes"')}</div>`:''}
  <div class="toolbar">${searchBox()}</div><div id="review-results">${reviewResults()}</div>`;
}
function reviewResults(){
  let questions;
  if(ripassoTab==='mistakes')questions=mistakeQuestions(state.history,dataset.questions);
  else{
    const all=new Map();for(const attempt of [...state.history].reverse())for(const q of attempt.questions)all.set(q.id,q);for(const q of dataset.questions)all.set(q.id,q);
    questions=state.favorites.map(id=>all.get(id)).filter(Boolean);
  }
  if(!questions.length)return empty(ripassoTab==='mistakes'?'Nessun errore da ripassare.':'I tuoi preferiti iniziano qui.',ripassoTab==='mistakes'?'Le risposte sbagliate o non date compariranno qui dopo un quiz.':'Premi il segnalibro accanto a una domanda per ritrovarla in questa sezione.',ripassoTab==='mistakes'?'check':'bookmark');
  return studyResults(questions);
}
function historyPage(){
  return `${pageTitle('I tuoi progressi','Ogni tentativo racconta qualcosa.','Ritrova gli ultimi 100 quiz, i punteggi e le risposte. I risultati giornalieri restano anche nel loro archivio.')}
  <div class="toolbar"><label><span class="sr-only">Filtra storico</span><select class="select" id="history-filter">${[['all','Tutti i tentativi'],['daily','Quiz giornalieri'],['chapter','Quiz di capitolo'],['exam','Simulazioni'],['mistakes','Ripasso degli errori']].map(([value,label])=>`<option value="${value}" ${screenFilter===value?'selected':''}>${label}</option>`).join('')}</select></label><span class="muted small">${state.history.length} tentativi salvati su questo dispositivo</span></div><div id="history-results">${historyResults()}</div>`;
}
function historyResults(){const attempts=state.history.filter(a=>screenFilter==='all'||a.mode===screenFilter);return attempts.length?attempts.map(attemptRow).join(''):empty('Il tuo percorso comincia da qui.','I risultati appariranno dopo la consegna di un quiz.','history',link('Scegli un capitolo','capitoli'));}
function accountPage(){
  const saved=Object.values(state.savedSessions||{}).filter(session=>session.id!==state.session?.id);
  return `${pageTitle('Il tuo spazio personale','Lo studio ti segue.','Accedi con lo stesso account Google su tutti i dispositivi per ritrovare quiz, risultati e preferiti.')}
  <div class="two-col"><section class="card stack"><span class="tile-icon" style="align-self:flex-start">${icon('refresh',26)}</span><h2>${account?'I tuoi progressi, insieme.':'Un account, tutti i dispositivi.'}</h2>${account?`<p class="small"><strong>${escape(account.email)}</strong></p><div class="connection sync-status">${syncStatusMarkup()}</div>${cloudStatus.message?`<p class="muted small">${escape(cloudStatus.message)}</p>`:''}<p class="muted small">${cloudStatus.lastSynced?'Ultima sincronizzazione: '+dateTime(cloudStatus.lastSynced):'Il primo collegamento unisce i progressi di questo dispositivo a quelli già salvati.'}</p><div class="row wrap">${button('Riprova sincronizzazione','retry-sync','','secondary small')}${button('Esci dall’account','sign-out','','secondary small')}</div>`:`<p class="muted small">I progressi già presenti su questo dispositivo verranno uniti a quelli del tuo account. Una copia locale dei dati esistenti sarà conservata.</p>${button('Accedi con Google','sign-in',!cloud?'disabled':'')}<p class="muted small">La sincronizzazione è riservata ad alemarra89@gmail.com. Puoi continuare a studiare senza accedere.</p>${cloudStatus.message?`<div class="notice warning">${escape(cloudStatus.message)}</div>`:''}`}</section>
  <section class="card stack"><h2>Anche quando sei offline.</h2><p class="muted small">Le risposte vengono salvate subito sul dispositivo. Quando torna la connessione, le modifiche in attesa vengono inviate al tuo account.</p><p class="muted small">Puoi riprendere un quiz da un altro dispositivo. Se modifichi la stessa risposta su due dispositivi, prevale l’ultima modifica ricevuta dal server. Una consegna già registrata non può essere riaperta da una vecchia sessione offline.</p><p class="muted small">Senza accesso restano disponibili i progressi locali. Dopo l’uscita, i progressi del tuo account si ritrovano accedendo di nuovo.</p><div class="notice">Piano Firebase Spark, senza fatturazione. Se la quota gratuita è esaurita, lo studio continua in locale finché la sincronizzazione torna disponibile.</div></section></div>
  <section class="card stack mt" aria-labelledby="push-title"><h2 id="push-title">Il quiz è pronto? Ti avvisiamo.</h2><p class="muted small">Attiva un avviso su questo dispositivo quando il quiz giornaliero è pubblicato. Toccando la notifica apri i quiz giornalieri.</p><p class="small" role="status">${escape(pushStatus.message)}</p><div class="row wrap">${['disabled','error','enabling'].includes(pushStatus.code)?button(pushStatus.busy?'Attivazione…':'Attiva notifiche','enable-push',pushStatus.busy?'disabled':''):''}${pushStatus.code==='enabled'||pushStatus.code==='error'?button('Disattiva su questo dispositivo','disable-push',pushStatus.busy?'disabled':'','secondary small'):''}</div></section>
  ${account&&saved.length?section('Quiz sospesi sui tuoi dispositivi')+saved.map(session=>`<article class="list-row"><span class="tile-icon">${icon('book',20)}</span><div class="grow"><h3>${escape(quizName(session))}</h3><p>${Object.keys(session.answers).length}/${session.questions.length} risposte salvate${session.expiresAt?' · Il timer continua a scorrere':''}</p></div>${button('Riprendi','resume-saved',`data-id="${session.id}"`,'secondary small')}</article>`).join(''):''}`;
}
function notFound(){return pageTitle('Il tuo spazio di studio','Questa pagina non esiste.')+empty('Torniamo allo studio.','Puoi ripartire dalla panoramica.','home',link('Vai alla panoramica','home'));}
const nav=[['home','Panoramica','Home','home'],['capitoli','I capitoli','Capitoli','book'],['giornalieri','Quiz giornalieri','Ogni giorno','calendar'],['esame','Simulazione d’esame','Esame','exam'],['ripasso','Il mio ripasso','Ripasso','bookmark'],['storico','Storico risultati','Storico','history']];
function render(){
  if(!dataset)return;
  const path=route(),[page,id]=path.split('/');
  if(path!==lastRoute){search='';screenFilter='all';resultFilter='all';lastRoute=path;}
  const active=page==='capitolo'?'capitoli':page==='risultato'?'storico':page==='quiz'?(state.session?.mode==='daily'?'giornalieri':state.session?.mode==='exam'?'esame':state.session?.mode==='mistakes'?'ripasso':'capitoli'):page;
  const pending=visibleDaily().filter(q=>dailyState(q.date,state).status!=='completed').length;
  const navLinks=mobile=>nav.map(([key,title,short,name])=>`<a href="#/${key}" class="${mobile?'':'nav-link '}${active===key?'active':''}" ${active===key?'aria-current="page"':''}>${icon(name,mobile?20:18)}<span>${mobile?short:title}</span>${!mobile&&key==='giornalieri'&&pending?`<span class="count">${pending}</span>`:''}</a>`).join('');
  let body;
  try{body=page==='home'?home():page==='capitoli'?chaptersPage():page==='capitolo'?chapterPage(id):page==='esame'?examPage():page==='giornalieri'?dailyPage():page==='quiz'?quizPage():page==='risultato'?resultPage(id):page==='ripasso'?reviewPage():page==='storico'?historyPage():page==='account'?accountPage():notFound();}
  catch(error){console.error('Impossibile mostrare la pagina.',error);body=empty('Non riesco ad aprire questa schermata.','I tuoi progressi restano salvati. Prova a tornare alla panoramica.','info',link('Panoramica','home'));}
  app.innerHTML=`<div class="layout"><aside class="sidebar"><a class="brand" href="#/home"><img src="./icons/icon.svg" alt=""><div><div class="brand-title">Segnali</div><div class="brand-sub">IL TUO SPAZIO DI STUDIO</div></div></a><div class="eyebrow nav-heading">La tua preparazione</div><nav class="navigation" aria-label="Navigazione principale">${navLinks(false)}</nav><div class="sidebar-note"><div class="row gap8">${icon('book',17)}<strong class="small">Un capitolo alla volta.</strong></div><p>45 capitoli, un percorso.<br>${dataset.questions.length} domande già a disposizione.</p><div class="progress" style="margin-top:13px"><span style="width:${dataset.chapters.filter(c=>c.available).length/45*100}%"></span></div></div><div class="sidebar-bottom">ELABORAZIONE DEI SEGNALI</div></aside><div class="workspace"><header class="topbar"><span class="muted small">La tua scrivania di studio</span><a href="#/home" class="brand"><img src="./icons/icon.svg" alt=""><span class="brand-title">Segnali</span></a><div class="top-actions"><span class="connection"><span class="dot ${navigator.onLine?'':'offline'}"></span><span>${navigator.onLine?'Studio personale':'Disponibile offline'}</span></span><button class="icon-button" data-action="refresh" aria-label="Aggiorna domande e quiz" title="Aggiorna domande e quiz">${icon('refresh',17)}</button><button class="icon-button" data-action="install" aria-label="Installa l’app">${icon('download',17)}<span class="install-label small">Installa</span></button></div></header><div id="banners">${banners()}</div><main class="content" id="main" tabindex="-1">${body}<footer class="footer"><span>Segnali · Uno spazio per imparare, provare e ripassare.</span><span>Domande aggiornate: ${dateTime(dataset.fetchedAt)}</span></footer></main></div></div><nav class="mobile-nav" aria-label="Navigazione compatta">${navLinks(true)}</nav>`;
  const connection=document.querySelector('.top-actions .connection');
  connection.classList.add('sync-status');connection.innerHTML=syncStatusMarkup();
  document.querySelector('.top-actions').insertAdjacentHTML('beforeend',`<a class="account-link" href="#/account" aria-label="${account?'Il mio account':'Accedi e sincronizza'}" title="${escape(syncLabel())}">${icon('lock',17)}<span>${account?'Account':'Accedi'}</span></a>`);
}
function banners(){return `${storageError?`<div class="banner error" role="alert">${escape(storageError)}</div>`:''}${account&&cloudStatus.code==='error'?`<div class="banner error" role="status"><span>${escape(cloudStatus.message)}</span><a href="#/account">Sincronizzazione</a></div>`:''}${registration?.waiting?`<div class="banner"><span>Una nuova versione dell’app è pronta. Le risposte salvate saranno conservate.</span>${button('Aggiorna app','activate-update','','secondary small')}</div>`:''}`;}
function renderBanners(){const el=document.querySelector('#banners');if(el)el.innerHTML=banners();}
function submit(){
  if(!state.session||checkExpiry())return;
  const unanswered=state.session.questions.length-Object.keys(state.session.answers).length;
  showDialog('Consegniamo il quiz?',unanswered?`Ci sono ${unanswered} domande senza risposta. Puoi tornare al quiz oppure consegnare comunque: le risposte mancanti valgono 0 punti.`:'Hai risposto a tutte le domande. Dopo la consegna potrai vedere il risultato e le soluzioni.',[{text:'Consegna e vedi il risultato',run:()=>completeSession()},{text:'Torna al quiz',run:()=>{}}]);
}
async function refreshData(showToast=true){
  if(busy)return;busy=true;
  if(showToast)toast('Controllo gli aggiornamenti…');
  try{
    const [nextData,nextArchive]=await Promise.all(['questions','daily'].map(async name=>{
      const response=await fetch(`./data/${name}.json`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Download non disponibile');return response.json();
    }));
    if(!Array.isArray(nextData.questions)||!Array.isArray(nextData.chapters)||!Array.isArray(nextArchive.quizzes))throw new Error('Formato non riconosciuto');
    const changed=dataset.version!==nextData.version||JSON.stringify(archive)!==JSON.stringify(nextArchive)||dataset.fetchedAt!==nextData.fetchedAt;
    dataset=nextData;archive=nextArchive;
    if(changed&&route()!=='quiz'&&!document.querySelector('#search:focus'))render();
    await registration?.update();
    if(showToast)toast(changed?'Domande e quiz aggiornati.':'Stai usando gli ultimi dati disponibili.');
  }catch{if(showToast)toast('Aggiornamento non disponibile. Puoi continuare con i contenuti già scaricati.');}
  finally{busy=false;}
}
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip')){event.preventDefault();const main=document.querySelector('#main');main?.focus();main?.scrollIntoView();return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const {action,value,mode,id}=target.dataset;
  if(action==='close-dialog'){dialog.close();return;}
  if(action==='sign-in'){
    try{await cloud?.login();}catch(error){toast(error.message);}return;
  }
  if(action==='sign-out'){
    showDialog('Esci dall’account?','I progressi sincronizzati rimangono nel tuo account. Su questo dispositivo tornerai ai progressi locali precedenti all’accesso e le notifiche saranno disattivate.',[{text:'Esci dall’account',run:async()=>{try{if(cloud.pending())throw new Error('Attendi la sincronizzazione dei progressi prima di uscire.');await push?.disable();await cloud.logout();}catch(error){toast(error.message);}}},{text:'Resta connesso',run:()=>{}}]);return;
  }
  if(action==='enable-push'){await push?.enable();return;}
  if(action==='disable-push'){try{await push?.disable();}catch(error){toast(error.message);}return;}
  if(action==='retry-sync'){try{await cloud?.retry();}catch{toast('Sincronizzazione non disponibile. Le modifiche restano sul dispositivo.');}return;}
  if(action==='resume-saved'){
    const saved=state.savedSessions?.[id];if(!saved)return;
    if(state.session)state.savedSessions[state.session.id]=structuredClone(state.session);
    state.session=structuredClone(saved);delete state.savedSessions[id];
    if(saved.dailyDate)delete state.dailyDrafts[saved.dailyDate];
    save();if(!checkExpiry())go('quiz');return;
  }
  if(action==='favorite'){
    const favorite=state.favorites.includes(id);state.favorites=favorite?state.favorites.filter(item=>item!==id):[...state.favorites,id];save();
    target.classList.toggle('selected',!favorite);target.setAttribute('aria-pressed',String(!favorite));target.setAttribute('aria-label',favorite?'Aggiungi ai preferiti':'Rimuovi dai preferiti');
    if(route()==='ripasso'&&ripassoTab==='favorites'){const position=window.scrollY;render();window.scrollTo(0,position);}renderBanners();return;
  }
  if(action==='start'){begin(mode,value);return;}
  if(action==='answer'){
    if(!state.session||checkExpiry())return;
    const q=state.session.questions[state.session.position];state.session.answers[q.id]=Number(value);save();const position=window.scrollY;render();window.scrollTo(0,position);document.querySelector(`[data-action="answer"][data-value="${value}"]`)?.focus({preventScroll:true});return;
  }
  if(action==='clear-answer'){
    if(!state.session||checkExpiry())return;delete state.session.answers[state.session.questions[state.session.position].id];save();const y=window.scrollY;render();window.scrollTo(0,y);return;
  }
  if(action==='position'){
    if(!state.session||checkExpiry())return;state.session.position=Math.max(0,Math.min(Number(value),state.session.questions.length-1));save();render();document.querySelector('.question-card')?.scrollIntoView({block:'start',behavior:'instant'});document.querySelector('.option[tabindex="0"]')?.focus({preventScroll:true});return;
  }
  if(action==='submit'){submit();return;}
  if(action==='repeat'){const attempt=getAttempt(id);if(attempt)begin(attempt.mode,attempt.dailyDate||attempt.chapterId);return;}
  if(action==='result-filter'){resultFilter=value;const y=window.scrollY;render();window.scrollTo(0,y);document.querySelector(`[data-action="result-filter"][data-value="${value}"]`)?.focus({preventScroll:true});return;}
  if(action==='review-tab'){ripassoTab=value;search='';render();document.querySelector(`[data-action="review-tab"][data-value="${value}"]`)?.focus({preventScroll:true});return;}
  if(action==='refresh'){await refreshData();return;}
  if(action==='activate-update'){save();registration?.waiting?.postMessage({type:'ACTIVATE_UPDATE'});return;}
  if(action==='install'){
    if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}
    else showDialog('Il tuo spazio di studio, a portata di mano.','Dal menu del browser scegli “Installa app” o “Aggiungi alla schermata Home”. Su iPhone e iPad apri il sito in Safari, premi Condividi e poi “Aggiungi alla schermata Home”. Dopo il primo caricamento potrai usare i contenuti scaricati anche offline.',[{text:'Ho capito',run:()=>{}}]);
  }
});
document.addEventListener('input',event=>{
  if(event.target.id!=='search')return;search=event.target.value;
  const [page,id]=route().split('/');
  if(page==='capitoli')document.querySelector('#chapter-results').innerHTML=chapterResults();
  if(page==='capitolo')document.querySelector('#study-results').innerHTML=studyResults(dataset.questions.filter(q=>q.chapterId===Number(id)));
  if(page==='ripasso')document.querySelector('#review-results').innerHTML=reviewResults();
});
document.addEventListener('change',event=>{
  if(event.target.id==='chapter-filter'){chapterFilter=event.target.value;document.querySelector('#chapter-results').innerHTML=chapterResults();}
  if(event.target.id==='daily-filter'){screenFilter=event.target.value;document.querySelector('#daily-results').innerHTML=dailyResults();}
  if(event.target.id==='history-filter'){screenFilter=event.target.value;document.querySelector('#history-results').innerHTML=historyResults();}
});
document.addEventListener('keydown',event=>{
  if(event.target.matches('[role="radio"]')&&['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(event.key)){
    event.preventDefault();let value=Number(event.target.dataset.value);value=event.key==='Home'?0:event.key==='End'?3:(value+(['ArrowDown','ArrowRight'].includes(event.key)?1:3))%4;document.querySelector(`[data-action="answer"][data-value="${value}"]`)?.click();
  }
});
window.addEventListener('hashchange',()=>{if(checkExpiry())return;render();window.scrollTo(0,0);document.querySelector('#main')?.focus({preventScroll:true});});
window.addEventListener('online',()=>{render();refreshData(false);});
window.addEventListener('offline',render);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(!checkExpiry())refreshData(false);void push?.refresh();}});
window.addEventListener('storage',event=>{
  if(event.key===stateKey&&event.newValue){
    try{const updated=JSON.parse(event.newValue);if(Array.isArray(updated.history)&&Array.isArray(updated.favorites)&&updated.dailyProgress&&updated.dailyDrafts){state=updated;cloud?.rebase(state);if(!checkExpiry())render();toast('Progressi aggiornati da un’altra scheda.');}}
    catch{toast('Impossibile leggere i progressi dell’altra scheda.');}
  }
});
let lastDay=dateInRome();
setInterval(()=>{
  if(!dataset||checkExpiry())return;
  if(state.session?.expiresAt){const seconds=remaining(state.session);document.querySelectorAll('[data-timer]').forEach(el=>{el.textContent=formatTime(seconds);el.classList.toggle('urgent',seconds<=60);});}
  const today=dateInRome();if(today!==lastDay){lastDay=today;render();refreshData(false);}
},1000);
setInterval(()=>{if(document.visibilityState==='visible')refreshData(false);},300000);
async function init(){
  try{
    [dataset,archive]=await Promise.all(['questions','daily'].map(async name=>{const response=await fetch(`./data/${name}.json`,{cache:'no-cache'});if(!response.ok)throw new Error('Download non disponibile');return response.json();}));
    if(!Array.isArray(dataset.questions)||!Array.isArray(archive.quizzes))throw new Error('Dati non validi');
    if(!checkExpiry())render();
    try{
      const response=await fetch('./firebase-config.json',{cache:'no-cache'});
      if(!response.ok)throw new Error('Configurazione non disponibile');
      const config=await response.json();
      const localEmulator=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).has('emulator');
      cloud=createCloudSync({config,getState:()=>state,onAccount:switchAccount,onStatus:updateCloudStatus,emulators:localEmulator?{host:'127.0.0.1'}:null,onRemote:next=>{
        const oldSession=state.session?.id;state=next;save(false);
        if(oldSession&&route()==='quiz'&&!next.session&&getAttempt(oldSession)){go('risultato/'+oldSession);return;}
        if(!checkExpiry())renderPreservingView();
        if(oldSession&&oldSession!==next.session?.id)toast('Il quiz in corso è stato aggiornato da un altro dispositivo.');
      }});
      if(route()==='account')renderPreservingView();
    }catch{updateCloudStatus({code:'error',message:'Collegamento all’account non disponibile. Puoi continuare a studiare in locale.',pending:0});}
    if('serviceWorker'in navigator){
      registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      if(registration.waiting)renderBanners();
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)renderBanners();});});
      let reloading=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload();});
      navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='OPEN_DAILY'){void refreshData(false);go('giornalieri');}});
      registration=await navigator.serviceWorker.ready;
      toast('Il tuo spazio di studio è pronto anche offline.');
      let pushConfig={};
      try{const response=await fetch('./push-config.json',{cache:'no-cache'});if(response.ok)pushConfig=await response.json();}catch{}
      push=createPushNotifications({publicKey:pushConfig.publicKey,getRegistration:()=>registration,getAccount:()=>account,
        saveSubscription:(subscription,key)=>cloud.savePushSubscription(subscription,key),removeSubscription:subscription=>cloud.removePushSubscription(subscription),
        onChange:next=>{pushStatus=next;if(route()==='account')renderPreservingView();}});
      void push.refresh();
    }
  }catch(error){
    if(dataset&&archive){toast('I quiz sono disponibili. La modalità offline non è ancora pronta.');return;}
    app.innerHTML=`<main class="content">${empty('Non riesco a caricare le domande.','Per il primo accesso serve una connessione. Controlla la rete e riprova.','info',button('Riprova','retry'))}</main>`;
    document.querySelector('[data-action="retry"]')?.addEventListener('click',()=>location.reload());
  }
}
init();
