import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc}=require('firebase/firestore');
import assert from 'node:assert/strict';
const env=await initializeTestEnvironment({projectId:'demo-segnali',firestore:{host:'127.0.0.1',port:8085,rules:await readFile('firestore.rules','utf8')}});
const owner=env.authenticatedContext('owner',{email:'alemarra89@gmail.com',email_verified:true}).firestore();
const other=env.authenticatedContext('other',{email:'other@example.com',email_verified:true}).firestore();
const unverified=env.authenticatedContext('owner',{email:'alemarra89@gmail.com',email_verified:false}).firestore();
const anonymous=env.unauthenticatedContext().firestore();
const ref=(db,id)=>doc(db,'users','owner','records',id);
try{
  const favorite={kind:'favorite',questionId:'1-1',active:true};
  await assertSucceeds(setDoc(ref(owner,'favorite_1-1'),favorite));
  await assertSucceeds(getDoc(ref(owner,'favorite_1-1')));
  for(const db of [other,unverified,anonymous]){await assertFails(getDoc(ref(db,'favorite_1-1')));await assertFails(setDoc(ref(db,'favorite_1-1'),favorite));}
  await assertFails(setDoc(doc(owner,'users','other','records','favorite_1-1'),favorite));
  await assertFails(setDoc(ref(owner,'anything'),{kind:'unknown'}));
  const session={kind:'session',payload:'{"id":"example"}',answers:{},position:0,phase:'active'};
  await assertSucceeds(setDoc(ref(owner,'session_example'),session));
  await assertSucceeds(setDoc(ref(owner,'session_example'),{answers:{'1-1':0}},{merge:true}));
  await assertSucceeds(setDoc(ref(owner,'session_example'),{answers:{'1-2':2}},{merge:true}));
  assert.deepEqual((await getDoc(ref(owner,'session_example'))).data().answers,{'1-1':0,'1-2':2});
  await assertSucceeds(setDoc(ref(owner,'session_example'),{answers:{'1-1':null}},{merge:true}));
  await assertSucceeds(updateDoc(ref(owner,'session_example'),{phase:'completed'}));
  await assertFails(updateDoc(ref(owner,'session_example'),{phase:'active'}));
  await assertFails(setDoc(ref(owner,'session_example'),{answers:{'1-1':3}},{merge:true}));
  const attempt={kind:'attempt',payload:'{"id":"example"}',finishedAt:1000};
  await assertSucceeds(setDoc(ref(owner,'attempt_example'),attempt));
  await assertSucceeds(setDoc(ref(owner,'attempt_example'),attempt,{merge:true}));
  await assertFails(updateDoc(ref(owner,'attempt_example'),{payload:'changed'}));
  await assertFails(deleteDoc(ref(owner,'attempt_example')));
  console.log('Regole verificate: proprietario, altri account, accesso anonimo, email non verificata, risposte indipendenti, sessioni chiuse e risultati immutabili.');
}finally{await env.cleanup();}
