import {env} from 'cloudflare:workers';
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import {McpServer} from '@modelcontextprotocol/server';
import {createMcpHandler,getMcpAuthContext} from 'agents/mcp/server';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {z} from 'zod';
import {documentsApi} from './documents';
import {websiteApi} from './site-api';
import type {SiteEnv} from './site-common';

interface MCPEnv extends SiteEnv {
 OAUTH_KV:KVNamespace;
 MCP_RESOURCE:string;
 ACCESS_CLIENT_ID:string;
 ACCESS_CLIENT_SECRET:string;
 ACCESS_AUTHORIZATION_URL:string;
 ACCESS_TOKEN_URL:string;
 ACCESS_JWKS_URL:string;
 ACCESS_ISSUER:string;
 ALLOWED_EMAILS:string;
}
type Identity={email:string;name:string;sub:string};
const internalOrigin='https://proposal.studio.remotebusinesspartner.com.au';
const publicId=z.string().uuid();
const toText=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
function authorizeEmail(email:string,bindings:MCPEnv){
 const allowed=(bindings.ALLOWED_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowed.length||!allowed.includes(email.toLowerCase()))throw new Error('This account is not authorized to use Proposal Studio.');
 return email.toLowerCase();
}
async function callInternal(path:string,method:'GET'|'POST'|'PUT',email:string,body?:unknown){
 const bindings=env as MCPEnv;
 authorizeEmail(email,bindings);
 const headers=new Headers();
 if(body!==undefined)headers.set('Content-Type','application/json');
 const request=new Request(internalOrigin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 // Reuse the exact APIs as the staff application, not an independent data store.
 const response=path.startsWith('/api/documents/')&&path.includes('/website')||path.startsWith('/api/website-templates')
  ?await websiteApi(request,bindings,email)
  :await documentsApi(request,bindings,email);
 const result=await response.json() as any;
 if(!response.ok)throw new Error((result?.error||'Request failed')+' (HTTP '+response.status+')');
 return result;
}
function server(){
 const props=getMcpAuthContext()?.props as Identity|undefined;
 if(!props?.email)throw new Error('OAuth sign-in is required.');
 const email=authorizeEmail(props.email,env as MCPEnv);
 const s=new McpServer({name:'RBP Proposal Studio',version:'1.0.0'});
 const add=(name:string,description:string,inputSchema:any,fn:(input:any)=>Promise<unknown>,write=false)=>{
  s.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!write,destructiveHint:false,openWorldHint:false}},async(input:any)=>{
   try{return toText(await fn(input));}catch(err){return {...toText({error:err instanceof Error?err.message:'Request failed'}),isError:true};}
  });
 };
 const limit=z.number().int().min(1).max(200).optional();
 add('list_proposals','List existing proposal documents including status, client, id and revision.',z.object({limit}),async({limit}:any)=>(await callInternal('/api/documents','GET',email)).slice(0,limit||50));
 add('list_clients','Find existing clients to use when creating a proposal.',z.object({search:z.string().max(120).optional()}),async({search}:any)=>(await callInternal('/api/clients','GET',email)).filter((x:any)=>!search||JSON.stringify({name:x.name,tradingName:x.tradingName}).toLowerCase().includes(search.toLowerCase())).slice(0,75));
 add('list_brands','List available brands and their standard settings.',z.object({}),async()=>callInternal('/api/brands','GET',email));
 add('list_templates','List document templates and their IDs; use one with an existing brand and client to create a proposal.',z.object({}),async()=>callInternal('/api/templates','GET',email));
 add('get_proposal','Read a proposal including sections, pricing, current document version and status.',z.object({documentId:publicId}),async({documentId}:any)=>callInternal('/api/documents/'+documentId,'GET',email));
 add('get_proposal_site','Read editable website layout, published link status, section issues and client responses.',z.object({documentId:publicId}),async({documentId}:any)=>callInternal('/api/documents/'+documentId+'/website','GET',email));
 add('create_proposal_from_template','Create an internal DRAFT proposal from an active template, client and brand. Never publishes or emails it.',z.object({templateId:publicId,clientId:publicId,brandId:publicId}),async(input:any)=>callInternal('/api/documents/from-template','POST',email,input),true);
 add('create_proposal','Create an internal DRAFT proposal from a complete document object matching the Proposal Studio schema. Read an existing proposal or template first for the required structure.',z.object({data:z.record(z.string(),z.unknown())}),async({data}:any)=>callInternal('/api/documents','POST',email,{data}),true);
 add('save_proposal','Update an existing draft/review document. Supply the COMPLETE data object and expectedVersion from get_proposal. Version mismatch rejects edits.',z.object({documentId:publicId,expectedVersion:z.number().int().nonnegative(),data:z.record(z.string(),z.unknown())}),async({documentId,...input}:any)=>callInternal('/api/documents/'+documentId,'PUT',email,input),true);
 add('edit_proposal_section','Edit one section by id, preserving other sections and all document data. Only draft/review documents can be edited.',z.object({documentId:publicId,sectionId:publicId,title:z.string().max(180).optional(),body:z.string().max(40000).optional()}),async({documentId,sectionId,title,body}:any)=>{
  const current=await callInternal('/api/documents/'+documentId,'GET',email);
  const item=current.data.sections.find((x:any)=>x.id===sectionId);
  if(!item)throw Error('Section not found.');
  if(title===undefined&&body===undefined)throw Error('Supply a title or body.');
  const sections=current.data.sections.map((x:any)=>x.id!==sectionId?x:{...x,...(title!==undefined?{title}:{}),...(body!==undefined?{body}:{})});
  return callInternal('/api/documents/'+documentId,'PUT',email,{expectedVersion:current.version,data:{...current.data,sections}});
 },true);
 add('save_proposal_site','Save a complete website layout: theme, hero, tabs, sections and blocks. First get_proposal_site and supply expectedWebsiteVersion and expectedDocumentVersion. Never publishes.',z.object({documentId:publicId,expectedWebsiteVersion:z.number().int().nonnegative(),expectedDocumentVersion:z.number().int().nonnegative(),config:z.record(z.string(),z.unknown())}),async({documentId,expectedWebsiteVersion,expectedDocumentVersion,config}:any)=>callInternal('/api/documents/'+documentId+'/website','PUT',email,{expectedVersion:expectedWebsiteVersion,expectedDocumentVersion,config}),true);
 add('list_website_templates','List reusable website designs.',z.object({}),async()=>callInternal('/api/website-templates','GET',email));
 add('create_website_template','Save a reusable website layout template (removes private document sections and attachments).',z.object({name:z.string().min(1).max(180),config:z.record(z.string(),z.unknown())}),async(input:any)=>callInternal('/api/website-templates','POST',email,input),true);
 return s;
}
const handler=createMcpHandler(server);
const apiHandler={fetch(request:Request,bindings:MCPEnv,ctx:ExecutionContext){return handler(request,bindings,ctx)}} satisfies ExportedHandler<MCPEnv>;
function randomState(){return crypto.randomUUID()+'-'+crypto.randomUUID();}
function cookie(request:Request,name:string){return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);}
const stateCookie='__Host-rbp-oauth-state';
const stateHeader=(value:string,maxAge:number)=>stateCookie+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge;
const oauthFailure=(message:string,status=400)=>new Response(message,{status,headers:{'Cache-Control':'no-store'}});
const b64url=(buffer:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function oauthHandler(request:Request,bindings:MCPEnv){
 const url=new URL(request.url);
 if(url.pathname==='/authorize'&&request.method==='GET'){
  const parsed=await (bindings as any).OAUTH_PROVIDER.parseAuthRequest(request);
  if(!parsed?.clientId)return oauthFailure('Invalid OAuth client.');
  if(!bindings.ACCESS_CLIENT_ID||!bindings.ACCESS_AUTHORIZATION_URL||!bindings.ACCESS_ISSUER||!bindings.ALLOWED_EMAILS)return oauthFailure('OAuth is not configured.',503);
  const state=randomState();
  const verifier=b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const challenge=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  await bindings.OAUTH_KV.put('mcp-state:'+state,JSON.stringify({parsed,verifier}),{expirationTtl:600});
  const upstream=new URL(bindings.ACCESS_AUTHORIZATION_URL);
  upstream.searchParams.set('response_type','code');
  upstream.searchParams.set('client_id',bindings.ACCESS_CLIENT_ID);
  upstream.searchParams.set('redirect_uri',new URL('/callback',request.url).href);
  upstream.searchParams.set('scope','openid email profile');
  upstream.searchParams.set('state',state);
  upstream.searchParams.set('code_challenge_method','S256');
  upstream.searchParams.set('code_challenge',challenge);
  return new Response(null,{status:302,headers:{Location:upstream.toString(),'Set-Cookie':stateHeader(state,600),'Cache-Control':'no-store'}});
 }
 if(url.pathname==='/callback'&&request.method==='GET'){
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||!code||cookie(request,stateCookie)!==state)return oauthFailure('Invalid OAuth state.');
  const serialized=await bindings.OAUTH_KV.get('mcp-state:'+state);
  if(!serialized)return oauthFailure('OAuth state expired.');
  await bindings.OAUTH_KV.delete('mcp-state:'+state);
  const stored=JSON.parse(serialized) as {parsed:any;verifier:string};
  const exchange=await fetch(bindings.ACCESS_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:bindings.ACCESS_CLIENT_ID,client_secret:bindings.ACCESS_CLIENT_SECRET,redirect_uri:new URL('/callback',request.url).href,code_verifier:stored.verifier})});
  if(!exchange.ok)return oauthFailure('Access sign-in could not be completed.',401);
  const token=await exchange.json() as {id_token?:string};
  if(!token.id_token)return oauthFailure('Access identity token missing.',401);
  const issuer=bindings.ACCESS_ISSUER.replace(/\/$/,'');
  const {payload}=await jwtVerify(token.id_token,createRemoteJWKSet(new URL(bindings.ACCESS_JWKS_URL)),{issuer,audience:bindings.ACCESS_CLIENT_ID});
  if(typeof payload.email!=='string'||typeof payload.sub!=='string')return oauthFailure('Identity is incomplete.',403);
  const email=authorizeEmail(payload.email,bindings);
  const identity:Identity={email,name:typeof payload.name==='string'?payload.name:email,sub:payload.sub};
  const result=await (bindings as any).OAUTH_PROVIDER.completeAuthorization({request:stored.parsed,userId:identity.sub,scope:stored.parsed.scope,props:identity,metadata:{label:identity.name}});
  const redirect=new Response(null,{status:302,headers:{Location:result.redirectTo,'Cache-Control':'no-store','Set-Cookie':stateHeader('',0)}});
  return redirect;
 }
 return oauthFailure('Not found.',404);
}
export default new OAuthProvider<MCPEnv>({
 apiRoute:'/mcp',apiHandler,
 authorizeEndpoint:'/authorize',
 tokenEndpoint:'/token',
 clientRegistrationEndpoint:'/register',
 defaultHandler:{fetch:(req:Request,bindings:MCPEnv)=>oauthHandler(req,bindings)},
 resourceMetadata:{resource:(env as MCPEnv).MCP_RESOURCE}
});
