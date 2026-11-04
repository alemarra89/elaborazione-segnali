import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readGoogleSheet } from './read-google-sheet.mjs';

const root = new URL('../', import.meta.url);
const expectedHeaders = ['Capitolo','Domanda','Risposta 1','Risposta 2','Risposta 3','Risposta 4','Risposta Esatta','Note'];
const clean = value => String(value ?? '').trim();

export function importQuestions(source, chapterCatalog) {
  const rows = source.rows;
  const headerIndex = rows.findIndex(row=>expectedHeaders.slice(0,7).every((header,i)=>clean(row[i])===header));
  if (headerIndex === -1) throw new Error('Intestazioni del foglio non riconosciute: importazione interrotta.');
  const groups = new Map(chapterCatalog.map(chapter=>[chapter.id,{...chapter,slots:0,questions:[],issues:[]}]));
  for (let rowIndex = headerIndex+1; rowIndex<rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row.some(value=>clean(value))) continue;
    const chapterId = Number(clean(row[0]));
    const chapter = groups.get(chapterId);
    if (!chapter) throw new Error(`Capitolo non riconosciuto alla riga ${rowIndex+1}.`);
    const number = ++chapter.slots;
    if (number > 10) throw new Error(`Il capitolo ${chapterId} contiene più di 10 righe di domande.`);
    const text = clean(row[1]);
    if (!row.slice(1,7).some(value=>clean(value))) continue;
    const options = [2,3,4,5].map(index=>clean(row[index]));
    const answer = clean(row[6]);
    const matches = options.map((option,index)=>option===answer ? index : -1).filter(index=>index>=0);
    if (!text || !options.every(Boolean) || !answer || matches.length!==1) {
      chapter.issues.push({row:rowIndex+1,number,message:'Domanda incompleta o risposta esatta non univoca tra le quattro opzioni.'});
      continue;
    }
    chapter.questions.push({id:`${chapterId}-${number}`,chapterId,number,text,options,correctIndex:matches[0],note:clean(row[7])});
  }
  const chapters = [...groups.values()].map(({slots,questions,issues,...chapter})=>({
    ...chapter,
    questionCount:questions.length,
    available:questions.length===10 && issues.length===0,
    status:questions.length===10 && issues.length===0 ? 'ready' : questions.length===0 && issues.length===0 ? 'empty' : 'incomplete',
    issues
  }));
  const ready = new Set(chapters.filter(chapter=>chapter.available).map(chapter=>chapter.id));
  // Draft chapters stay in the catalogue, but their questions never enter quiz pools.
  const questions = [...groups.values()].filter(chapter=>ready.has(chapter.id)).flatMap(chapter=>chapter.questions);
  const version = createHash('sha256').update(JSON.stringify({chapters,questions})).digest('hex').slice(0,16);
  return {
    version,
    fetchedAt:source.fetchedAt,
    source:{spreadsheetId:source.spreadsheetId,sheetId:source.sheetId,title:source.title,sheet:source.sheet},
    chapters,
    questions
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const source = process.argv.includes('--from-cache')
      ? JSON.parse(await readFile(new URL('.local/google-sheet.json',root),'utf8'))
      : await readGoogleSheet(process.argv[2]);
    const catalog = JSON.parse(await readFile(new URL('data/chapters.json',root),'utf8'));
    const result = importQuestions(source,catalog);
    // A successful HTTP response must not silently replace existing data with an empty set.
    if (result.questions.length===0) throw new Error('Nessun capitolo completo: dataset precedente conservato.');
    await mkdir(new URL('data/',root),{recursive:true});
    const staging = new URL('data/questions.json.tmp',root);
    await writeFile(staging,JSON.stringify(result,null,2)+'\n');
    await rename(staging,new URL('data/questions.json',root));
    console.log(JSON.stringify({questions:result.questions.length,readyChapters:result.chapters.filter(c=>c.available).length,emptyChapters:result.chapters.filter(c=>c.status==='empty').length,incompleteChapters:result.chapters.filter(c=>c.status==='incomplete').length,issues:result.chapters.flatMap(c=>c.issues)},null,2));
  } catch (error) {
    console.error(error instanceof TypeError ? 'Connessione a Google non riuscita: dataset precedente conservato.' : error.message);
    process.exitCode = 1;
  }
}
