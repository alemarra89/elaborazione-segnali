import {createSign} from 'node:crypto';

export function encodeFields(value){
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,typeof item==='number'?{integerValue:String(item)}:{stringValue:String(item)}]));
}
export function decodeFields(fields={}){
  return Object.fromEntries(Object.entries(fields).map(([key,item])=>[key,'integerValue'in item?Number(item.integerValue):item.stringValue]));
}
export async function serviceAccountToken(credential,fetcher=fetch){
  if(credential.type!=='service_account')throw new Error('Credenziale del mittente non valida.');
  const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const endpoint='https://oauth2.googleapis.com/token';
  const payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:credential.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:endpoint,iat:now,exp:now+3600})}`;
  const assertion=payload+'.'+createSign('RSA-SHA256').update(payload).sign(credential.private_key,'base64url');
  const response=await fetcher(endpoint,{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Autenticazione del mittente non riuscita (${response.status}).`);
  const data=await response.json();if(!data.access_token)throw new Error('Token del mittente mancante.');return data.access_token;
}
export function createPushStore({projectId,token,fetcher=fetch}){
  const base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  async function request(path,method='GET',body){
    const response=await fetcher(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    if(!response.ok){const error=new Error(`Archivio notifiche: HTTP ${response.status}.`);error.status=response.status;throw error;}
    return response.status===204?{}:response.json();
  }
  return {
    async listDevices(){
      const documents=[];let page='';
      do{const result=await request('/pushDevices?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''));documents.push(...(result.documents||[]));page=result.nextPageToken||'';}while(page);
      return documents.map(doc=>({id:doc.name.split('/').at(-1),...decodeFields(doc.fields)}));
    },
    async hasCompletedDailyQuiz(uid,date){
      // Read existing results so this also works for clients released before this check.
      const results=await request(`/users/${encodeURIComponent(uid)}:runQuery`,'POST',{structuredQuery:{
        from:[{collectionId:'records'}],select:{fields:[{fieldPath:'payload'}]},
        where:{fieldFilter:{field:{fieldPath:'kind'},op:'EQUAL',value:{stringValue:'attempt'}}}
      }});
      if(!Array.isArray(results)||results.some(result=>result.error))throw new Error('Completamento del quiz non verificabile.');
      for(const result of results){
        if(!result.document)continue; // An empty query returns only its read time.
        let attempt;
        try{attempt=JSON.parse(result.document.fields?.payload?.stringValue);}
        catch{throw new Error('Completamento del quiz non verificabile.');}
        if(attempt?.dailyDate===date&&Number.isFinite(attempt.finishedAt))return true;
      }
      return false;
    },
    async getDelivery(id){try{return decodeFields((await request('/pushDeliveries/'+id)).fields);}catch(error){if(error.status===404)return null;throw error;}},
    async claim(id,date,now){
      try{await request('/pushDeliveries?documentId='+id,'POST',{fields:encodeFields({state:'sending',date,claimedAt:now})});return true;}
      catch(error){if(error.status===409)return false;throw error;}
    },
    async sent(id,date){await request('/pushDeliveries/'+id,'PATCH',{fields:encodeFields({state:'sent',date})});},
    async release(id){try{await request('/pushDeliveries/'+id,'DELETE');}catch(error){if(error.status!==404)throw error;}},
    async removeDevice(id){try{await request('/pushDevices/'+id,'DELETE');}catch(error){if(error.status!==404)throw error;}}
  };
}
