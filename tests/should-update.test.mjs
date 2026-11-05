import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRunUpdate} from '../scripts/should-update.mjs';
const now=new Date('2026-11-05T10:17:00Z');
const today={quizzes:[{date:'2026-11-05'}]},yesterday={quizzes:[{date:'2026-11-04'}]};

test('Un tentativo di recupero genera il quiz mancante',()=>{
  assert.equal(shouldRunUpdate({event:'schedule',archive:yesterday,published:yesterday,now}),true);
});
test('I tentativi successivi non ricompilano un quiz già pubblicato',()=>{
  assert.equal(shouldRunUpdate({event:'schedule',archive:today,published:today,now}),false);
});
test('Un quiz salvato ma non pubblicato viene recuperato',()=>{
  assert.equal(shouldRunUpdate({event:'schedule',archive:today,published:yesterday,now}),true);
  assert.equal(shouldRunUpdate({event:'schedule',archive:today,published:null,now}),true);
});
test('Prima delle 11 non parte un recupero, mentre i lanci manuali aggiornano sempre',()=>{
  assert.equal(shouldRunUpdate({event:'schedule',archive:yesterday,published:yesterday,now:new Date('2026-11-05T09:17:00Z')}),false);
  for(const event of ['push','workflow_dispatch'])assert.equal(shouldRunUpdate({event,archive:today,published:today,now}),true);
});
