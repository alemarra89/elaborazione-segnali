import test from 'node:test';
import assert from 'node:assert/strict';
import { importQuestions } from '../scripts/import-questions.mjs';

const header = ['Capitolo','Domanda','Risposta 1','Risposta 2','Risposta 3','Risposta 4','Risposta Esatta','Note'];
const catalog = [{id:1,title:'Primo capitolo'},{id:2,title:'Secondo capitolo'}];
const source = rows=>({rows:[[],header,...rows],fetchedAt:'2026-11-05T10:00:00Z'});
const question = (chapter,number)=>[String(chapter),`Domanda ${number}`,'A','B','C','D','C',''];
const ten = Array.from({length:10},(_,i)=>question(1,i+1));

test('Un capitolo completo è disponibile, uno vuoto rimane visibile e disabilitato',()=>{
  const result = importQuestions(source([...ten,...Array.from({length:10},()=>['2'])]),catalog);
  assert.equal(result.questions.length,10);
  assert.equal(result.chapters[0].available,true);
  assert.deepEqual([result.chapters[1].questionCount,result.chapters[1].available,result.chapters[1].status],[0,false,'empty']);
  assert.equal(result.questions[0].correctIndex,2);
});

test('Un capitolo incompleto non entra nel set dei quiz',()=>{
  const result = importQuestions(source(ten.slice(0,9)),catalog);
  assert.equal(result.questions.length,0);
  assert.equal(result.chapters[0].questionCount,9);
  assert.equal(result.chapters[0].status,'incomplete');
});

test('Una soluzione mancante o ambigua disabilita il capitolo e indica la riga',()=>{
  for (const bad of [ ['1','Domanda','A','B','C','D','E'], ['1','Domanda','A','B','C','C','C'] ]) {
    const result = importQuestions(source([...ten.slice(0,9),bad]),catalog);
    assert.equal(result.questions.length,0);
    assert.equal(result.chapters[0].issues[0].row,12);
  }
});

test('Le posizioni delle domande rimangono stabili in presenza di righe ancora vuote',()=>{
  const rows = [...ten];
  rows[3] = ['1'];
  const result = importQuestions(source(rows),catalog);
  assert.equal(result.chapters[0].status,'incomplete');
  rows[3] = question(1,4);
  const complete = importQuestions(source(rows),catalog);
  assert.equal(complete.questions[4].id,'1-5');
});

test('Intestazioni errate, capitoli sconosciuti e più di 10 righe interrompono l’importazione',()=>{
  assert.throws(()=>importQuestions({rows:[['Altro']]},catalog),/Intestazioni/);
  assert.throws(()=>importQuestions(source([question(99,1)]),catalog),/Capitolo non riconosciuto/);
  assert.throws(()=>importQuestions(source([...ten,question(1,11)]),catalog),/più di 10/);
});

test('La versione cambia con i contenuti ma non con la data del download',()=>{
  const a = source(ten);
  const b = {...a,fetchedAt:'2026-11-06T10:00:00Z'};
  assert.equal(importQuestions(a,catalog).version,importQuestions(b,catalog).version);
  const changed = structuredClone(a);
  changed.rows[2][1] = 'Domanda corretta';
  assert.notEqual(importQuestions(a,catalog).version,importQuestions(changed,catalog).version);
});
