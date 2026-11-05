import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {dateInRome,dailyIsDue} from '../src/quiz.js';

export function shouldRunUpdate({event,archive,published,now=new Date()}) {
  if(event!=='schedule')return true;
  if(!dailyIsDue(now))return false;
  const today=dateInRome(now);
  const exists=data=>Array.isArray(data?.quizzes)&&data.quizzes.some(quiz=>quiz.date===today);
  // A committed quiz alone is insufficient: publication may have failed.
  return !exists(archive)||!exists(published);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const event=process.env.GITHUB_EVENT_NAME||'workflow_dispatch';
    const archive=JSON.parse(await readFile(new URL('../data/daily.json',import.meta.url),'utf8'));
    let published=null;
    if(event==='schedule'&&dailyIsDue()){
      try{
        const response=await fetch(`https://alemarra89.github.io/elaborazione-segnali/data/daily.json?check=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(response.ok)published=await response.json();
      }catch{console.log('Pubblicazione non verificabile: verrà tentato il recupero.');}
    }
    const run=shouldRunUpdate({event,archive,published});
    if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`should_run=${run}\n`);
    console.log(run?'Aggiornamento necessario: eseguo importazione e pubblicazione.':'Quiz di oggi già pubblicato o non ancora dovuto: nessuna nuova pubblicazione.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
