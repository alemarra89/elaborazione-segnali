export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
export const matches = (question,search) => normalize(search).split(' ').every(term=>normalize([question.text,...question.options].join(' ')).includes(term));
export function sample(items,count,random=Math.random) {
  const pool=[...items];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,Math.min(count,pool.length));
}
export function makeSession(mode,questions,{now=Date.now(),chapterId=null,dailyDate=null,id=globalThis.crypto.randomUUID()}={}) {
  return {id,mode,chapterId,dailyDate,questions:structuredClone(questions),answers:{},position:0,startedAt:now,expiresAt:mode==='exam'?now+1800000:null};
}
export function remaining(session,now=Date.now()){return session.expiresAt===null?null:Math.min(1800,Math.max(0,Math.ceil((session.expiresAt-now)/1000)));}
export function status(question,answers){return answers[question.id]===undefined?'unanswered':answers[question.id]===question.correctIndex?'correct':'incorrect';}
export function finish(session,now=Date.now()) {
  const finishedAt=session.expiresAt===null?now:Math.min(now,session.expiresAt);
  const states=session.questions.map(q=>status(q,session.answers));
  return {...structuredClone(session),finishedAt,durationSeconds:Math.max(0,Math.floor((finishedAt-session.startedAt)/1000)),timedOut:session.expiresAt!==null&&now>=session.expiresAt,correct:states.filter(s=>s==='correct').length,incorrect:states.filter(s=>s==='incorrect').length,unanswered:states.filter(s=>s==='unanswered').length};
}
export function mistakeQuestions(history,currentQuestions) {
  const latest=new Map();
  for(const attempt of [...history].sort((a,b)=>a.finishedAt-b.finishedAt))for(const q of attempt.questions)latest.set(q.id,{question:q,wrong:status(q,attempt.answers)!=='correct'});
  const current=new Map(currentQuestions.map(q=>[q.id,q]));
  return [...latest.values()].filter(entry=>entry.wrong).map(entry=>current.get(entry.question.id)??entry.question);
}
export function dateInRome(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function hourInRome(now=new Date()){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',hourCycle:'h23'}).format(now));}
export function dailyIsDue(now=new Date()){return hourInRome(now)>=11;}
export function dailyState(date,state) {
  if(state.dailyProgress?.[date])return {status:'completed',...state.dailyProgress[date]};
  if(state.session?.dailyDate===date||state.dailyDrafts?.[date])return {status:'in-progress'};
  return {status:'todo'};
}
export function previousDate(date){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
export function streak(progress,today=dateInRome()) {
  let day=progress[today]?today:previousDate(today),count=0;
  while(progress[day]){count++;day=previousDate(day);}return count;
}
export const formatTime=seconds=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
