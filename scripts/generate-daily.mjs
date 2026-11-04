import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomInt} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {dateInRome,dailyIsDue,sample} from '../src/quiz.js';
const root=new URL('../',import.meta.url);
export function addDailyQuiz(archive,dataset,now=new Date()) {
  const date=dateInRome(now);
  if(!dailyIsDue(now)||archive.quizzes.some(quiz=>quiz.date===date))return {archive,created:false};
  if(dataset.questions.length<10)throw new Error('Servono almeno 10 domande valide per il quiz giornaliero.');
  const questions=sample(dataset.questions,10,()=>randomInt(0,0x100000000)/0x100000000);
  const quiz={date,createdAt:now.toISOString(),datasetVersion:dataset.version,questions:structuredClone(questions)};
  return {archive:{...archive,quizzes:[...archive.quizzes,quiz].sort((a,b)=>b.date.localeCompare(a.date))},created:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const dataset=JSON.parse(await readFile(new URL('data/questions.json',root),'utf8'));
    const archive=JSON.parse(await readFile(new URL('data/daily.json',root),'utf8'));
    const result=addDailyQuiz(archive,dataset);
    if(result.created){const tmp=new URL('data/daily.json.tmp',root);await writeFile(tmp,JSON.stringify(result.archive,null,2)+'\n');await rename(tmp,new URL('data/daily.json',root));}
    console.log(result.created?'Creato e archiviato il quiz giornaliero.':'Nessun nuovo quiz: non sono ancora le 11 a Roma oppure quello di oggi esiste già.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
