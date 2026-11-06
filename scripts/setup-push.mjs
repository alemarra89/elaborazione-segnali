import {mkdir,readFile,writeFile} from 'node:fs/promises';
import webpush from 'web-push';

const root=new URL('../',import.meta.url),privateFile=new URL('.local/web-push-keys.json',root);
await mkdir(new URL('.local/',root),{recursive:true});
let keys;
try{keys=JSON.parse(await readFile(privateFile,'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;keys=webpush.generateVAPIDKeys();await writeFile(privateFile,JSON.stringify(keys)+'\n',{flag:'wx',mode:0o600});}
if(!keys.publicKey||!keys.privateKey)throw new Error('Configurazione privata delle notifiche incompleta.');
await writeFile(new URL('public/push-config.json',root),JSON.stringify({publicKey:keys.publicKey},null,2)+'\n');
console.log('Chiave pubblica preparata. La chiave privata resta nella directory locale ignorata dal repository.');
