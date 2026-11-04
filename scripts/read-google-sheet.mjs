import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
export async function readGoogleSheet(keyPath) {
  const config = JSON.parse(await readFile(new URL('config/source.json', root), 'utf8'));
  const credentialText = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (keyPath ? await readFile(keyPath, 'utf8') : null);
  if (!credentialText) throw new Error('Indicare il percorso della chiave JSON oppure GOOGLE_SERVICE_ACCOUNT_JSON.');
  const credential = JSON.parse(credentialText);
  if (credential.type !== 'service_account' || credential.client_email !== config.serviceAccountEmail) {
    throw new Error('La chiave non appartiene all’account di servizio configurato.');
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';
  const payload = `${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:credential.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:tokenEndpoint,iat:now,exp:now+3600})}`;
  const signer = createSign('RSA-SHA256');
  signer.update(payload);
  const assertion = `${payload}.${signer.sign(credential.private_key,'base64url')}`;
  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
    signal: AbortSignal.timeout(30000)
  });
  if (!tokenResponse.ok) throw new Error(`Autenticazione Google non riuscita (HTTP ${tokenResponse.status}).`);
  const {access_token:token} = await tokenResponse.json();
  const headers = {Authorization:`Bearer ${token}`};
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  const metadataResponse = await fetch(`${endpoint}?fields=properties(title),sheets(properties(sheetId,title,gridProperties))`,{headers,signal:AbortSignal.timeout(30000)});
  if (!metadataResponse.ok) {
    const error = await metadataResponse.json().catch(()=>({}));
    const reason = error.error?.details?.find(d=>d.reason)?.reason;
    throw new Error(`Lettura del foglio non riuscita (HTTP ${metadataResponse.status}${reason ? `, ${reason}` : ''}). Controllare che Sheets API sia abilitata e che il foglio sia condiviso con l’account tecnico.`);
  }
  const metadata = await metadataResponse.json();
  const sheet = metadata.sheets.find(s=>s.properties.sheetId === config.sheetId);
  if (!sheet) throw new Error(`Scheda con gid=${config.sheetId} non trovata.`);
  const range = `'${sheet.properties.title.replaceAll("'", "''")}'`;
  const response = await fetch(`${endpoint}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,{headers,signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Lettura delle celle non riuscita (HTTP ${response.status}).`);
  const data = await response.json();
  return {fetchedAt:new Date().toISOString(),spreadsheetId:config.spreadsheetId,title:metadata.properties.title,sheet:sheet.properties.title,sheetId:config.sheetId,rows:data.values || []};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await readGoogleSheet(process.argv[2]);
    await mkdir(new URL('.local/',root),{recursive:true});
    await writeFile(new URL('.local/google-sheet.json',root), JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({title:result.title,sheet:result.sheet,rowCount:result.rows.length,preview:result.rows.slice(0,4)},null,2));
  } catch (error) {
    console.error(error instanceof TypeError ? 'Connessione a Google non riuscita.' : error.message);
    process.exitCode = 1;
  }
}
