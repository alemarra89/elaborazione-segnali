import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.PREVIEW_DIRECTORY||'dist'),port=Number(process.env.PORT||4173),base='/elaborazione-segnali/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
  try{
    let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(url==='/elaborazione-segnali'){res.writeHead(301,{Location:base});res.end();return;}
    if(url.startsWith(base))url=url.slice(base.length);
    const file=path.resolve(root,'.'+(url.startsWith('/')?url:'/'+url));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const target=(await stat(file)).isDirectory()?path.join(file,'index.html'):file;
    const body=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
  }catch{res.writeHead(404);res.end('Non trovato');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}${base}\nPreview PID: ${process.pid}`));
