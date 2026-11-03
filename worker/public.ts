import {responseSchema,selectedPricing,type PublicSnapshot} from '../shared/website';
import {checkOrigin,HttpError,jsonBody,jsonReply,safeFilename,type SiteEnv} from './site-common';

export const publicHeaders={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()', 'X-Frame-Options':'DENY'
};
function secure(response:Response){const headers=new Headers(response.headers);for(const[k,v]of Object.entries(publicHeaders))headers.set(k,v);if((headers.get('content-type')||'').includes('text/html'))headers.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,headers})}
async function publication(env:SiteEnv,token:string){const row:any=await env.DB.prepare('SELECT * FROM proposal_publications WHERE share_token=? AND revoked_at IS NULL AND expires_at>?').bind(token,new Date().toISOString()).first();if(!row)throw new HttpError('This proposal link is unavailable, expired or withdrawn.',404);return row}
async function asset(env:SiteEnv,row:any,kind:string,id?:string){const assets=JSON.parse(row.assets_json);const snapshot=JSON.parse(row.snapshot_json) as PublicSnapshot;let key:string|undefined,mime='',name='';if(kind==='logo'){key=assets.logoKey}else if(kind==='pdf'&&snapshot.hasPdf&&snapshot.website.allowPrint){key=assets.pdfKey;mime='application/pdf';name=snapshot.document.reference+'.pdf'}else if(kind==='attachments'&&id&&snapshot.attachments.some(a=>a.id===id)){const entry=assets.files[id];key=entry?.key;mime=entry?.mime;name=entry?.name}if(!key)throw new HttpError('Resource not found.',404);const obj=await env.DOCUMENT_STORAGE.get(key);if(!obj)throw new HttpError('Resource not found.',404);mime=mime||obj.httpMetadata?.contentType||'application/octet-stream';const image=/^image\/(png|jpeg)$/.test(mime);return new Response(obj.body,{headers:{'Content-Type':mime,'Content-Disposition':`${image?'inline':'attachment'}; filename="${safeFilename(name||'logo')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}
export async function publicApi(req:Request,env:SiteEnv){
  const path=new URL(req.url).pathname,m=req.method;
  if(path==='/api/health'&&m==='GET'){await env.DB.prepare('SELECT id FROM proposal_publications LIMIT 1').first();return jsonReply({ok:true,service:'proposal-client',schemaVersion:1,release:'web-proposals-v1'})}
  const match=path.match(/^\/api\/p\/([0-9a-f]{64})(?:\/(responses|logo|pdf|attachments)(?:\/([0-9a-f-]+))?)?$/);if(!match)throw new HttpError('Not found.',404);
  const row=await publication(env,match[1]),kind=match[2],id=match[3];
  if(!kind&&m==='GET'){
    const snapshot=JSON.parse(row.snapshot_json) as PublicSnapshot;
    const final:any=await env.DB.prepare("SELECT action,created_at FROM proposal_responses WHERE publication_id=? AND action IN ('accepted','declined') LIMIT 1").bind(row.id).first();
    const now=new Date().toISOString();await env.DB.prepare('UPDATE proposal_publications SET view_count=view_count+1,first_viewed_at=COALESCE(first_viewed_at,?),last_viewed_at=? WHERE id=?').bind(now,now,row.id).run();
    return jsonReply({snapshot,expiresAt:row.expires_at,finalResponse:final?{action:final.action,createdAt:final.created_at}:null});
  }
  if(['logo','pdf','attachments'].includes(kind)&&m==='GET')return asset(env,row,kind,id);
  if(kind==='responses'&&m==='POST'){
    checkOrigin(req,true);const raw=await jsonBody(req,20000),parsed=responseSchema.safeParse(raw);if(!parsed.success)throw new HttpError(parsed.error.issues.map(i=>i.message).join(' '),422);const input=parsed.data,snapshot=JSON.parse(row.snapshot_json) as PublicSnapshot;
    if(!snapshot.website.allowResponses||!snapshot.website.tabs.some(t=>t.kind==='response'&&t.enabled))throw new HttpError('Responses are disabled.',403);
    const existing:any=await env.DB.prepare('SELECT id,action FROM proposal_responses WHERE publication_id=? AND idempotency_key=?').bind(row.id,input.idempotencyKey).first();if(existing)return jsonReply({id:existing.id,action:existing.action,received:true});
    if(input.action==='accepted'&&!input.consent)throw new HttpError('Confirm that you have reviewed the proposal and its terms.',422);
    if(input.action==='changes_requested'&&!input.message.trim())throw new HttpError('Describe the changes you need.',422);
    if(input.action==='accepted'&&snapshot.document.validUntil&&new Date(`${snapshot.document.validUntil}T23:59:59+08:00`).getTime()<Date.now())throw new HttpError('The proposal validity period has ended. Request an updated proposal.',409);
    let selection:unknown={};if(input.action==='accepted'){try{selection=selectedPricing(snapshot,input.optionId,input.optionalLineIds)}catch(e){throw new HttpError((e as Error).message,422)}}
    const window=Math.floor(Date.now()/600000);const limit=await env.DB.prepare('INSERT INTO proposal_response_limits(publication_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(publication_id) DO UPDATE SET window_start=excluded.window_start,attempts=CASE WHEN proposal_response_limits.window_start=excluded.window_start THEN proposal_response_limits.attempts+1 ELSE 1 END WHERE proposal_response_limits.window_start<>excluded.window_start OR proposal_response_limits.attempts<10 RETURNING attempts').bind(row.id,window).first();if(!limit)throw new HttpError('Too many responses. Please try again later.',429);
    const responseId=crypto.randomUUID(),now=new Date().toISOString();
    const r=await env.DB.prepare("INSERT INTO proposal_responses(id,publication_id,action,name,email,message,selection_json,snapshot_sha256,idempotency_key,created_at) SELECT ?,id,?,?,?,?,?,?,?,? FROM proposal_publications WHERE id=? AND share_token=? AND revoked_at IS NULL AND expires_at>? AND NOT EXISTS(SELECT 1 FROM proposal_responses WHERE publication_id=? AND action IN ('accepted','declined')) ON CONFLICT(publication_id,idempotency_key) DO NOTHING").bind(responseId,input.action,input.name,input.email,input.message,JSON.stringify(selection),row.snapshot_sha256,input.idempotencyKey,now,row.id,match[1],now,row.id).run();
    if(!r.meta.changes){const prior:any=await env.DB.prepare('SELECT id,action FROM proposal_responses WHERE publication_id=? AND idempotency_key=?').bind(row.id,input.idempotencyKey).first();if(prior)return jsonReply({id:prior.id,action:prior.action,received:true});throw new HttpError('This proposal has already received a final response or is no longer available.',409)}
    return jsonReply({id:responseId,action:input.action,received:true},201);
  }
  throw new HttpError('Method not allowed.',405);
}
export default {async fetch(req:Request,env:SiteEnv){try{
  const p=new URL(req.url).pathname;
  if(p.startsWith('/api/'))return secure(await publicApi(req,env));
  if(p==='/robots.txt')return secure(new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain'}}));
  if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError('Method not allowed.',405);
  if(p==='/'||p==='/demo'||/^\/p\/[0-9a-f]{64}\/?$/.test(p)||p.startsWith('/assets/'))return secure(await env.ASSETS.fetch(req));
  throw new HttpError('Not found.',404);
}catch(e){if(e instanceof HttpError)return secure(jsonReply({error:e.message},e.status));console.error('Public proposal service failure',e instanceof Error?e.name:'error');return secure(jsonReply({error:'The proposal service is temporarily unavailable.'},503))}}} satisfies ExportedHandler<SiteEnv>;
