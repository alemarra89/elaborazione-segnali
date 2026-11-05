import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStudy,changesForSync,migrationForSync,compactOperations,projectCloudRecords} from '../src/sync-model.js';
import {makeSession,finish} from '../src/quiz.js';
import {createJournal} from '../src/sync-journal.js';
const questions=Array.from({length:10},(_,i)=>({id:`1-${i+1}`,chapterId:1,number:i+1,text:'Una domanda',options:['A','B','C','D'],correctIndex:0,note:''}));
const quiz=()=>makeSession('daily',questions,{id:'quiz-1',dailyDate:'2026-11-05',now:1000});
function apply(records,operations){const result=new Map(structuredClone([...records]));for(const operation of operations){const before=result.get(operation.id);result.set(operation.id,{...before,...operation.data,...(before?.answers||operation.data.answers?{answers:{...before?.answers,...operation.data.answers}}:{})});}return result;}

test('Due dispositivi rispondono a domande diverse senza sovrascriversi',()=>{
  const base={...emptyStudy(),session:quiz()},records=apply(new Map(),changesForSync(emptyStudy(),base));
  const a=structuredClone(base),b=structuredClone(base);a.session.answers['1-1']=0;b.session.answers['1-2']=2;
  const joined=apply(apply(records,changesForSync(base,a)),changesForSync(base,b));
  assert.deepEqual(projectCloudRecords(base,joined).session.answers,{'1-1':0,'1-2':2});
});
test('La cancellazione di una risposta si propaga senza cancellare le altre',()=>{
  const base={...emptyStudy(),session:quiz()};base.session.answers={'1-1':0,'1-2':2};
  const records=apply(new Map(),changesForSync(emptyStudy(),base)),next=structuredClone(base);delete next.session.answers['1-1'];
  const projected=projectCloudRecords(base,apply(records,changesForSync(base,next)));
  assert.deepEqual(projected.session.answers,{'1-2':2});
});
test('Un vecchio preferito locale non riappare se è stato rimosso da un altro dispositivo',()=>{
  const local={...emptyStudy(),favorites:['1-1','1-2']},records=new Map([['favorite_1-1',{kind:'favorite',questionId:'1-1',active:false}]]);
  const migration=migrationForSync(local,records);assert.equal(migration.some(op=>op.id==='favorite_1-1'),false);
  assert.deepEqual(projectCloudRecords(local,apply(records,migration)).favorites,['1-2']);
});
test('Tentativi locali e remoti vengono uniti per identificativo senza duplicati',()=>{
  const attempt=finish(quiz(),9000),other={...attempt,id:'quiz-2',finishedAt:10000};
  const local={...emptyStudy(),history:[attempt]},remote=apply(new Map(),changesForSync(emptyStudy(),{...emptyStudy(),history:[attempt,other]}));
  const merged=projectCloudRecords(local,remote);assert.deepEqual(merged.history.map(a=>a.id),['quiz-2','quiz-1']);
  assert.equal(migrationForSync(merged,remote).length,0);
});
test('Una sessione completata altrove non viene riaperta da dati locali precedenti',()=>{
  const base={...emptyStudy(),session:quiz()},attempt=finish(base.session,9000);
  const remote=apply(new Map(),changesForSync(emptyStudy(),{...emptyStudy(),history:[attempt]}));
  remote.set('control',{kind:'control',activeSessionId:'quiz-1'});
  const merged=projectCloudRecords(base,remote);assert.equal(merged.session,null);assert.equal(merged.history[0].id,'quiz-1');assert.deepEqual(merged.dailyDrafts,{});
});
test('La consegna locale ancora da importare chiude la corrispondente sessione cloud',()=>{
  const session=quiz(),remote=apply(new Map(),changesForSync(emptyStudy(),{...emptyStudy(),session}));
  const local={...emptyStudy(),history:[finish(session,9000)]};
  assert.equal(migrationForSync(local,remote).find(op=>op.id==='session_quiz-1').data.phase,'completed');
});
test('Il puntatore condiviso riprende il quiz giusto e conserva gli altri sospesi',()=>{
  const first=quiz(),second={...quiz(),id:'quiz-2',dailyDate:'2026-11-04'};
  const remote=apply(new Map(),changesForSync(emptyStudy(),{...emptyStudy(),session:second,dailyDrafts:{'2026-11-05':first}}));
  const merged=projectCloudRecords(emptyStudy(),remote);assert.equal(merged.session.id,'quiz-2');assert.equal(merged.dailyDrafts['2026-11-05'].id,'quiz-1');assert.equal(merged.savedSessions['quiz-1'].id,'quiz-1');
});
test('I risultati giornalieri sopravvivono al limite di 100 tentativi',()=>{
  const attempts=Array.from({length:105},(_,i)=>({...finish(quiz(),9000+i),id:`quiz-${i}`,dailyDate:i===0?'2026-11-01':null}));
  const remote=apply(new Map(),changesForSync(emptyStudy(),{...emptyStudy(),history:attempts}));
  const merged=projectCloudRecords(emptyStudy(),remote);assert.equal(merged.history.length,100);assert.equal(merged.dailyProgress['2026-11-01'].attempt.id,'quiz-0');
});
test('La coda compatta modifiche alla stessa risposta e conserva quelle ad altre domande',()=>{
  const operations=compactOperations([{id:'session_x',data:{answers:{'1-1':0}}},{id:'session_x',data:{answers:{'1-2':1}}},{id:'session_x',data:{answers:{'1-1':null}}}]);
  assert.deepEqual(operations[0].data.answers,{'1-1':null,'1-2':1});
});
test('Il diario locale conserva separatamente operazioni di due schede e di due account',()=>{
  const map=new Map(),storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
  const first=createJournal(storage),second=createJournal(storage);
  first.append('owner',[{id:'a',data:{active:true}}]);second.append('owner',[{id:'b',data:{active:false}}]);second.append('other',[{id:'c',data:{active:false}}]);
  assert.equal(first.list('owner').length,2);first.remove(first.list('owner').slice(0,1));assert.equal(second.list('owner').length,1);assert.equal(first.list('other').length,1);
});
