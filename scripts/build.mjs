import {mkdir,readFile,writeFile,cp,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),out=new URL('dist/',root);
await mkdir(out,{recursive:true});
await cp(new URL('public/',root),out,{recursive:true});
await cp(new URL('src/',root),new URL('src/',out),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('src/app.js',root))],bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,outfile:fileURLToPath(new URL('src/app.js',out))});
await mkdir(new URL('data/',out),{recursive:true});
for(const name of ['questions.json','daily.json'])await cp(new URL(`data/${name}`,root),new URL(`data/${name}`,out));
const files=[];
async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isDirectory())await walk(new URL(entry.name+'/',dir),path+'/');else if(path!=='sw.js')files.push(path);}}
await walk(out);
const hash=createHash('sha256');
for(const file of files.sort())hash.update(file).update(await readFile(new URL(file,out)));
const version=hash.digest('hex').slice(0,16);
const worker=(await readFile(new URL('public/sw.js',root),'utf8')).replaceAll('__VERSION__',version).replace('__PRECACHE__',JSON.stringify(files.map(path=>'./'+path)));
await writeFile(new URL('sw.js',out),worker);
await writeFile(new URL('.nojekyll',out),'');
// Publish only the explicit application assets, never source configuration or credentials.
for(const file of files){const text=await readFile(new URL(file,out));if(/-----BEGIN (RSA )?PRIVATE KEY-----|"(?:private_key|privateKey|access_token|refresh_token)"\s*:/.test(text.toString('utf8')))throw new Error(`Dati riservati rilevati in ${file}.`);}
console.log(`PWA pronta in dist/ · versione ${version} · ${files.length} risorse offline.`);
