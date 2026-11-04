import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,makeSession,remaining,finish,mistakeQuestions,matches,dateInRome,dailyIsDue,dailyState,streak} from '../src/quiz.js';
import {addDailyQuiz} from '../scripts/generate-daily.mjs';
const questions=Array.from({length:40},(_,i)=>({id:`1-${i+1}`,chapterId:1,number:i+1,text:`Incertezza dell’unità ${i+1}`,options:['a','b','c','d'],correctIndex:2,note:''}));
const session=(mode='chapter',now=0)=>makeSession(mode,questions.slice(0,10),{now,id:'test'});

test('Estrazione senza duplicati e senza modificare il set di origine',()=>{
  const original=structuredClone(questions),draw=sample(questions,30);
  assert.equal(draw.length,30);assert.equal(new Set(draw.map(q=>q.id)).size,30);assert.deepEqual(questions,original);assert.equal(sample(questions,100).length,40);
});
test('Punteggio con risposte corrette, errate e non date, nessuna penalità',()=>{
  const quiz=session();quiz.answers={'1-1':2,'1-2':0};const result=finish(quiz,50000);
  assert.deepEqual([result.correct,result.incorrect,result.unanswered,result.durationSeconds],[1,1,8,50]);assert.equal(result.timedOut,false);
});
test('Timer assoluto, con scadenza e durata massima anche dopo la chiusura',()=>{
  const quiz=session('exam',1000);assert.equal(remaining(quiz,2000),1799);assert.equal(remaining(quiz,4000000),0);
  const result=finish(quiz,4000000);assert.equal(result.durationSeconds,1800);assert.equal(result.finishedAt,1801000);assert.equal(result.timedOut,true);
  assert.equal(remaining(session(),1000000),null);
});
test('L’ultimo esito corretto risolve un errore; le risposte vuote entrano nel ripasso',()=>{
  const first=session();first.answers={'1-1':0};const old=finish(first,100);
  assert.equal(mistakeQuestions([old],questions).length,10);
  const second=makeSession('mistakes',[questions[0]],{now:200,id:'next'});second.answers={'1-1':2};
  assert.equal(mistakeQuestions([finish(second,300),old],questions).length,9);
});
test('Sessioni e risultati conservano una copia delle domande anche dopo correzioni al dataset',()=>{
  const copied=structuredClone(questions);const quiz=makeSession('daily',copied,{id:'snapshot'});copied[0].correctIndex=0;
  assert.equal(quiz.questions[0].correctIndex,2);const result=finish(quiz);quiz.questions[0].text='Cambiato';assert.notEqual(result.questions[0].text,'Cambiato');
});
test('Ricerca senza distinzione di accenti, maiuscole e apostrofi',()=>{
  assert.equal(matches(questions[0],"INCERTEZZA DELL'UNITA"),true);assert.equal(matches(questions[0],'inesistente'),false);
});
test('Il quiz giornaliero parte alle 11 a Roma in inverno e in estate',()=>{
  assert.equal(dailyIsDue(new Date('2026-11-05T09:59:59Z')),false);assert.equal(dailyIsDue(new Date('2026-11-05T10:00:00Z')),true);
  assert.equal(dailyIsDue(new Date('2026-07-05T08:59:59Z')),false);assert.equal(dailyIsDue(new Date('2026-07-05T09:00:00Z')),true);
  assert.equal(dateInRome(new Date('2026-11-05T23:30:00Z')),'2026-11-06');
});
test('Archivio giornaliero idempotente e con domande congelate',()=>{
  const dataset={version:'a',questions:structuredClone(questions)},archive={quizzes:[]};
  assert.equal(addDailyQuiz(archive,dataset,new Date('2026-11-05T09:00:00Z')).created,false);
  const first=addDailyQuiz(archive,dataset,new Date('2026-11-05T10:05:00Z'));
  assert.equal(first.created,true);assert.equal(first.archive.quizzes[0].questions.length,10);
  assert.equal(new Set(first.archive.quizzes[0].questions.map(q=>q.id)).size,10);
  const snapshot=structuredClone(first.archive);
  dataset.questions.forEach(q=>q.text='Modificato');
  const repeat=addDailyQuiz(first.archive,dataset,new Date('2026-11-05T12:00:00Z'));
  assert.equal(repeat.created,false);assert.deepEqual(repeat.archive,snapshot);
  const tomorrow=addDailyQuiz(first.archive,dataset,new Date('2026-11-06T10:00:00Z'));assert.equal(tomorrow.archive.quizzes.length,2);assert.deepEqual(tomorrow.archive.quizzes[1],snapshot.quizzes[0]);
});
test('Nessun quiz giornaliero con meno di 10 domande disponibili',()=>{
  assert.throws(()=>addDailyQuiz({quizzes:[]},{version:'a',questions:questions.slice(0,9)},new Date('2026-11-05T10:00:00Z')),/almeno 10/);
});
test('Stati giornalieri e serie persistono anche senza lo storico dei tentativi',()=>{
  const state={history:[],dailyProgress:{'2026-11-04':{completedAt:1},'2026-11-03':{completedAt:1}},dailyDrafts:{'2026-11-05':{id:'draft'}}};
  assert.equal(dailyState('2026-11-04',state).status,'completed');assert.equal(dailyState('2026-11-05',state).status,'in-progress');assert.equal(dailyState('2026-11-06',state).status,'todo');
  assert.equal(streak(state.dailyProgress,'2026-11-05'),2);assert.equal(streak(state.dailyProgress,'2026-11-06'),0);
});
