// Firestore records are independent: editing one answer never replaces another
// question, a favourite, or a completed attempt from another device.
export const emptyStudy=()=>({history:[],favorites:[],session:null,dailyDrafts:{},dailyProgress:{},savedSessions:{}});
const copy=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const attemptKey=id=>`attempt_${id}`;
const sessionKey=id=>`session_${id}`;
const favoriteKey=id=>`favorite_${id}`;
export function sessionsOf(state){return Object.fromEntries([...Object.values(state.savedSessions||{}),...Object.values(state.dailyDrafts||{}),...(state.session?[state.session]:[])].map(session=>[session.id,session]));}
export function attemptsOf(state){
  const attempts=new Map();
  for(const progress of Object.values(state.dailyProgress||{}))if(progress.attempt)attempts.set(progress.attempt.id,progress.attempt);
  for(const attempt of state.history||[])attempts.set(attempt.id,attempt);
  return attempts;
}
function sessionRecord(session,phase='active'){
  const {answers,position,...snapshot}=session;
  return {kind:'session',payload:JSON.stringify(snapshot),answers:{...answers},position:position||0,phase};
}
const op=(id,data)=>({id,data});

export function changesForSync(previous,next){
  const operations=[];
  const beforeAttempts=attemptsOf(previous),afterAttempts=attemptsOf(next);
  for(const [id,attempt] of afterAttempts)if(!beforeAttempts.has(id)){
    operations.push(op(attemptKey(id),{kind:'attempt',payload:JSON.stringify(attempt),finishedAt:attempt.finishedAt}));
    operations.push(op(sessionKey(id),sessionRecord(attempt,'completed')));
  }
  const previousFavorites=new Set(previous.favorites),nextFavorites=new Set(next.favorites);
  for(const id of new Set([...previousFavorites,...nextFavorites]))if(previousFavorites.has(id)!==nextFavorites.has(id))operations.push(op(favoriteKey(id),{kind:'favorite',questionId:id,active:nextFavorites.has(id)}));
  const beforeSessions=sessionsOf(previous),afterSessions=sessionsOf(next);
  for(const [id,session] of Object.entries(afterSessions)){
    if(afterAttempts.has(id))continue;
    const before=beforeSessions[id];
    if(!before){operations.push(op(sessionKey(id),sessionRecord(session)));continue;}
    const patch={kind:'session'},answers={};
    for(const questionId of new Set([...Object.keys(before.answers),...Object.keys(session.answers)]))if(before.answers[questionId]!==session.answers[questionId])answers[questionId]=session.answers[questionId]??null;
    if(Object.keys(answers).length)patch.answers=answers;
    if(before.position!==session.position)patch.position=session.position;
    if(Object.keys(patch).length>1)operations.push(op(sessionKey(id),patch));
  }
  for(const id of Object.keys(beforeSessions))if(!afterSessions[id]&&!afterAttempts.has(id))operations.push(op(sessionKey(id),{kind:'session',phase:'abandoned'}));
  if((previous.session?.id??null)!==(next.session?.id??null))operations.push(op('control',{kind:'control',activeSessionId:next.session?.id??null}));
  return operations;
}

export function migrationForSync(local,records){
  // Existing cloud records include tombstones: an old local favourite must not
  // resurrect one removed on another device. Completed sessions remain closed.
  return changesForSync(emptyStudy(),local).filter(operation=>!records.has(operation.id)
    ||operation.data.kind==='session'&&operation.data.phase==='completed'&&records.get(operation.id)?.phase==='active'&&!records.has(attemptKey(operation.id.slice(8))));
}

export function compactOperations(operations){
  const compact=new Map();
  for(const operation of operations){
    const previous=compact.get(operation.id);
    compact.set(operation.id,{id:operation.id,data:{...previous?.data,...operation.data,...(previous?.data.answers||operation.data.answers?{answers:{...previous?.data.answers,...operation.data.answers}}:{})}});
  }
  return [...compact.values()];
}

export function projectCloudRecords(local,records){
  const result=copy(local),attempts=attemptsOf(local),favorites=new Set(local.favorites),sessions=sessionsOf(local);
  for(const [id,record] of records){
    try{
      if(record.kind==='attempt'){
        const attempt=JSON.parse(record.payload);
        if(id===attemptKey(attempt.id)&&Array.isArray(attempt.questions)&&attempt.answers&&Number.isFinite(attempt.finishedAt))attempts.set(attempt.id,attempt);
      }
      if(record.kind==='favorite'&&id===favoriteKey(record.questionId)){if(record.active)favorites.add(record.questionId);else favorites.delete(record.questionId);}
      if(record.kind==='session'){
        const sessionId=id.slice('session_'.length);
        if(record.phase!=='active'){delete sessions[sessionId];continue;}
        const session=JSON.parse(record.payload);
        if(session.id!==sessionId||!Array.isArray(session.questions))continue;
        sessions[sessionId]={...session,position:record.position||0,answers:Object.fromEntries(Object.entries(record.answers||{}).filter(([,value])=>Number.isInteger(value)&&value>=0&&value<4))};
      }
    }catch{ /* An invalid remote record cannot erase the local backup. */ }
  }
  for(const id of attempts.keys())delete sessions[id];
  result.favorites=[...favorites].sort();
  result.history=[...attempts.values()].sort((a,b)=>b.finishedAt-a.finishedAt||a.id.localeCompare(b.id)).slice(0,100);
  const allDaily=new Map();
  for(const attempt of attempts.values())if(attempt.dailyDate){const items=allDaily.get(attempt.dailyDate)||[];items.push(attempt);allDaily.set(attempt.dailyDate,items);}
  result.dailyProgress={...local.dailyProgress};
  for(const [date,items] of allDaily){
    items.sort((a,b)=>b.finishedAt-a.finishedAt||a.id.localeCompare(b.id));
    result.dailyProgress[date]={attempt:items[0],completedAt:items[0].finishedAt,firstCompletedAt:Math.min(local.dailyProgress[date]?.firstCompletedAt??Infinity,...items.map(a=>a.finishedAt)),bestCorrect:Math.max(local.dailyProgress[date]?.bestCorrect??0,...items.map(a=>a.correct))};
  }
  const control=records.get('control');
  const activeId=control?.kind==='control'?control.activeSessionId:local.session?.id;
  result.session=sessions[activeId]||null;
  result.savedSessions={};result.dailyDrafts={};
  for(const [id,session] of Object.entries(sessions))if(id!==result.session?.id){
    result.savedSessions[id]=session;
    if(session.dailyDate){
      const draft=result.dailyDrafts[session.dailyDate];
      if(!draft||draft.startedAt<session.startedAt)result.dailyDrafts[session.dailyDate]=session;
    }
  }
  return result;
}

export function stateChanged(a,b){return !same(a,b);}
