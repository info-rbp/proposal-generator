import{createRemoteJWKSet,jwtVerify}from'jose';
import{brandInputSchema,clientInputSchema,documentSchema,finalIssues,templateInputSchema,totals,type Attachment,type BrandRecord,type ClientRecord,type DocumentRecord,type DocumentSummary,type Status,type TemplateRecord}from'../shared/model';
import{documentFromTemplate}from'../shared/templates';

interface Env{DB:D1Database;DOCUMENT_STORAGE:R2Bucket;ASSETS:{fetch(request:Request):Promise<Response>};TEAM_DOMAIN?:string;POLICY_AUD?:string;DEV_USER_EMAIL?:string;APPROVER_EMAILS?:string}
const JWK=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
const now=()=>new Date().toISOString();
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message:string,status=400)=>reply({error:message},status);
const match=(p:string,r:RegExp)=>p.match(r);
const parseJson=<T>(value:string,fallback:T):T=>{try{return JSON.parse(value) as T}catch{return fallback}};

async function user(req:Request,env:Env){
  const host=new URL(req.url).hostname;
  if((host==='127.0.0.1'||host==='localhost')&&env.DEV_USER_EMAIL)return env.DEV_USER_EMAIL.toLowerCase();
  if(!env.TEAM_DOMAIN||!env.POLICY_AUD)throw new Error('Cloudflare Access is not configured');
  const token=req.headers.get('Cf-Access-Jwt-Assertion');if(!token)throw new Error('Authentication required');
  const domain=env.TEAM_DOMAIN.replace(/\/$/,'');let jwks=JWK.get(domain);
  if(!jwks){jwks=createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`));JWK.set(domain,jwks)}
  const{payload}=await jwtVerify(token,jwks,{issuer:domain,audience:env.POLICY_AUD});
  const email=String(payload.email||'').toLowerCase();if(!email)throw new Error('Authenticated identity has no email');return email
}
async function audit(env:Env,id:string|undefined,actor:string,action:string,detail:unknown={}){
  await env.DB.prepare('INSERT INTO audit_log(document_id,actor,action,detail_json,created_at) VALUES(?,?,?,?,?)').bind(id||null,actor,action,JSON.stringify(detail),now()).run()
}
function validationError(result:{success:boolean;error?:{issues:Array<{path:PropertyKey[];message:string}>}}){
  if(result.success)return'';
  return result.error!.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')
}
function validateDocument(data:unknown){
  const p=documentSchema.safeParse(data);if(!p.success)throw new Error(validationError(p));totals(p.data.lines);return p.data
}
const canApprove=(email:string,env:Env)=>{const list=(env.APPROVER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return!list.length||list.includes(email)};

function rowBrand(x:any):BrandRecord{return{
  id:x.id,type:x.type,name:x.name,legalName:x.legal_name,abn:x.abn,address:x.address,email:x.email,phone:x.phone,website:x.website,
  primaryColour:x.primary_colour,secondaryColour:x.secondary_colour,accentColour:x.accent_colour,textColour:x.text_colour,fontFamily:x.font_family,
  coverStyle:x.cover_style,defaultPreparedBy:x.default_prepared_by,defaultTerms:x.default_terms,logoAssetId:x.logo_asset_id||undefined,
  archived:!!x.archived,createdAt:x.created_at,updatedAt:x.updated_at
}}
function rowClient(x:any):ClientRecord{return{
  id:x.id,name:x.name,tradingName:x.trading_name,abn:x.abn,contact:x.contact,email:x.email,phone:x.phone,address:x.address,website:x.website,
  defaultBrandId:x.default_brand_id||'',currency:x.currency,paymentTerms:x.payment_terms,validityDays:Number(x.validity_days||0),notes:x.notes,
  tags:parseJson<string[]>(x.tags_json,[]),accountManager:x.account_manager,archived:!!x.archived,createdAt:x.created_at,updatedAt:x.updated_at
}}
function rowTemplate(x:any):TemplateRecord{return{
  id:x.id,parentTemplateId:x.parent_template_id||undefined,clientId:x.client_id||'',brandId:x.brand_id||'',kind:x.kind,name:x.name,description:x.description,
  version:Number(x.version),active:!!x.active,data:JSON.parse(x.data_json),createdAt:x.created_at,updatedAt:x.updated_at
}}
async function getBrand(env:Env,id:string){const r:any=await env.DB.prepare('SELECT * FROM brands WHERE id=?').bind(id).first();return r?rowBrand(r):null}
async function getClient(env:Env,id:string){const r:any=await env.DB.prepare('SELECT * FROM clients WHERE id=?').bind(id).first();return r?rowClient(r):null}
async function getTemplate(env:Env,id:string){const r:any=await env.DB.prepare('SELECT * FROM templates WHERE id=?').bind(id).first();return r?rowTemplate(r):null}

async function files(env:Env,id:string):Promise<Attachment[]>{
  const r=await env.DB.prepare('SELECT id,name,mime,size,created_at FROM attachments WHERE document_id=? ORDER BY created_at').bind(id).all();
  return r.results.map((x:any)=>({id:x.id,name:x.name,mime:x.mime,size:x.size,createdAt:x.created_at}))
}
async function getDoc(env:Env,id:string):Promise<DocumentRecord|null>{
  const r:any=await env.DB.prepare('SELECT * FROM documents WHERE id=?').bind(id).first();if(!r)return null;
  return{id:r.id,rootId:r.root_id,revision:r.revision,version:r.version,status:r.status,data:JSON.parse(r.data_json),attachments:await files(env,id),createdAt:r.created_at,updatedAt:r.updated_at,createdBy:r.created_by,updatedBy:r.updated_by,approvedBy:r.approved_by||undefined,approvedAt:r.approved_at||undefined,issuedAt:r.issued_at||undefined,pdfSha256:r.pdf_sha256||undefined}
}
async function insertDocument(env:Env,data:ReturnType<typeof validateDocument>,email:string,detail:unknown={}){
  const id=crypto.randomUUID(),t=now();
  await env.DB.prepare('INSERT INTO documents(id,root_id,revision,version,status,kind,title,client_name,reference,data_json,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,id,1,1,'draft',data.kind,data.title,data.client.name,data.reference,JSON.stringify(data),t,t,email,email).run();
  await audit(env,id,email,'document.created',{kind:data.kind,...(detail as object)});return await getDoc(env,id)
}

async function masterApi(req:Request,env:Env,email:string,p:string,m:string){
  if(p==='/api/brands'&&m==='GET'){
    const r=await env.DB.prepare('SELECT * FROM brands ORDER BY archived,name COLLATE NOCASE').all();return reply(r.results.map(rowBrand))
  }
  if(p==='/api/brands'&&m==='POST'){
    const body=await req.json(),v=brandInputSchema.safeParse(body);if(!v.success)return fail(validationError(v),422);
    const id=crypto.randomUUID(),t=now(),b=v.data;
    await env.DB.prepare('INSERT INTO brands(id,type,name,legal_name,abn,address,email,phone,website,primary_colour,secondary_colour,accent_colour,text_colour,font_family,cover_style,default_prepared_by,default_terms,archived,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id,b.type,b.name,b.legalName,b.abn,b.address,b.email,b.phone,b.website,b.primaryColour,b.secondaryColour,b.accentColour,b.textColour,b.fontFamily,b.coverStyle,b.defaultPreparedBy,b.defaultTerms,b.archived?1:0,t,t,email,email).run();
    await audit(env,undefined,email,'brand.created',{brandId:id,name:b.name});return reply(await getBrand(env,id),201)
  }
  const bm=match(p,/^\/api\/brands\/([0-9a-f-]+)$/);
  if(bm&&m==='PUT'){
    const existing=await getBrand(env,bm[1]);if(!existing)return fail('Brand not found',404);
    const body=await req.json(),v=brandInputSchema.safeParse(body);if(!v.success)return fail(validationError(v),422);const b=v.data,t=now();
    await env.DB.prepare('UPDATE brands SET type=?,name=?,legal_name=?,abn=?,address=?,email=?,phone=?,website=?,primary_colour=?,secondary_colour=?,accent_colour=?,text_colour=?,font_family=?,cover_style=?,default_prepared_by=?,default_terms=?,archived=?,updated_at=?,updated_by=? WHERE id=?')
      .bind(b.type,b.name,b.legalName,b.abn,b.address,b.email,b.phone,b.website,b.primaryColour,b.secondaryColour,b.accentColour,b.textColour,b.fontFamily,b.coverStyle,b.defaultPreparedBy,b.defaultTerms,b.archived?1:0,t,email,bm[1]).run();
    await audit(env,undefined,email,'brand.updated',{brandId:bm[1]});return reply(await getBrand(env,bm[1]))
  }
  const bl=match(p,/^\/api\/brands\/([0-9a-f-]+)\/logo$/);
  if(bl&&m==='POST'){
    const brand=await getBrand(env,bl[1]);if(!brand)return fail('Brand not found',404);
    const form=await req.formData(),file=form.get('file');if(!(file instanceof File))return fail('Logo file is required');
    if(file.size>4*1024*1024)return fail('Logo exceeds 4 MB',413);
    if(!['image/png','image/jpeg'].includes(file.type))return fail('Logo must be PNG or JPEG',415);
    const assetId=crypto.randomUUID(),key=`brand-assets/${brand.id}/${assetId}`;
    await env.DOCUMENT_STORAGE.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{originalName:file.name}});
    await env.DB.prepare('UPDATE brands SET logo_asset_id=?,updated_at=?,updated_by=? WHERE id=?').bind(assetId,now(),email,brand.id).run();
    await audit(env,undefined,email,'brand.logo_updated',{brandId:brand.id,assetId});return reply(await getBrand(env,brand.id))
  }
  const ba=match(p,/^\/api\/brand-assets\/([0-9a-f-]+)\/([0-9a-f-]+)$/);
  if(ba&&m==='GET'){
    const obj=await env.DOCUMENT_STORAGE.get(`brand-assets/${ba[1]}/${ba[2]}`);if(!obj)return fail('Brand asset not found',404);
    return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}})
  }

  if(p==='/api/clients'&&m==='GET'){
    const r=await env.DB.prepare('SELECT * FROM clients ORDER BY archived,name COLLATE NOCASE').all();return reply(r.results.map(rowClient))
  }
  if(p==='/api/clients'&&m==='POST'){
    const body=await req.json(),v=clientInputSchema.safeParse(body);if(!v.success)return fail(validationError(v),422);const c=v.data,id=crypto.randomUUID(),t=now();
    if(c.defaultBrandId&&!await getBrand(env,c.defaultBrandId))return fail('Default brand not found',422);
    await env.DB.prepare('INSERT INTO clients(id,name,trading_name,abn,contact,email,phone,address,website,default_brand_id,currency,payment_terms,validity_days,notes,tags_json,account_manager,archived,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id,c.name,c.tradingName,c.abn,c.contact,c.email,c.phone,c.address,c.website,c.defaultBrandId||null,c.currency,c.paymentTerms,c.validityDays,c.notes,JSON.stringify(c.tags),c.accountManager,c.archived?1:0,t,t,email,email).run();
    await audit(env,undefined,email,'client.created',{clientId:id,name:c.name});return reply(await getClient(env,id),201)
  }
  const cm=match(p,/^\/api\/clients\/([0-9a-f-]+)$/);
  if(cm&&m==='PUT'){
    const existing=await getClient(env,cm[1]);if(!existing)return fail('Client not found',404);
    const body=await req.json(),v=clientInputSchema.safeParse(body);if(!v.success)return fail(validationError(v),422);const c=v.data,t=now();
    if(c.defaultBrandId&&!await getBrand(env,c.defaultBrandId))return fail('Default brand not found',422);
    await env.DB.prepare('UPDATE clients SET name=?,trading_name=?,abn=?,contact=?,email=?,phone=?,address=?,website=?,default_brand_id=?,currency=?,payment_terms=?,validity_days=?,notes=?,tags_json=?,account_manager=?,archived=?,updated_at=?,updated_by=? WHERE id=?')
      .bind(c.name,c.tradingName,c.abn,c.contact,c.email,c.phone,c.address,c.website,c.defaultBrandId||null,c.currency,c.paymentTerms,c.validityDays,c.notes,JSON.stringify(c.tags),c.accountManager,c.archived?1:0,t,email,cm[1]).run();
    await audit(env,undefined,email,'client.updated',{clientId:cm[1]});return reply(await getClient(env,cm[1]))
  }

  if(p==='/api/templates'&&m==='GET'){
    const r=await env.DB.prepare('SELECT * FROM templates ORDER BY active DESC,updated_at DESC,name COLLATE NOCASE').all();return reply(r.results.map(rowTemplate))
  }
  if(p==='/api/templates'&&m==='POST'){
    const body=await req.json(),v=templateInputSchema.safeParse(body);if(!v.success)return fail(validationError(v),422);const x=v.data,id=crypto.randomUUID(),t=now();
    if(x.brandId&&!await getBrand(env,x.brandId))return fail('Template brand not found',422);
    if(x.clientId&&!await getClient(env,x.clientId))return fail('Template client not found',422);
    await env.DB.prepare('INSERT INTO templates(id,parent_template_id,client_id,brand_id,kind,name,description,version,active,data_json,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id,null,x.clientId||null,x.brandId||null,x.kind,x.name,x.description,1,x.active?1:0,JSON.stringify(x.data),t,t,email,email).run();
    await audit(env,undefined,email,'template.created',{templateId:id,name:x.name});return reply(await getTemplate(env,id),201)
  }
  const tm=match(p,/^\/api\/templates\/([0-9a-f-]+)$/);
  if(tm&&m==='GET'){const t=await getTemplate(env,tm[1]);return t?reply(t):fail('Template not found',404)}
  if(tm&&m==='PUT'){
    const existing=await getTemplate(env,tm[1]);if(!existing)return fail('Template not found',404);
    const body=await req.json(),v=templateInputSchema.safeParse(body);if(!v.success)return fail(validationError(v),422);const x=v.data,t=now();
    if(x.brandId&&!await getBrand(env,x.brandId))return fail('Template brand not found',422);
    if(x.clientId&&!await getClient(env,x.clientId))return fail('Template client not found',422);
    await env.DB.prepare('UPDATE templates SET client_id=?,brand_id=?,kind=?,name=?,description=?,version=version+1,active=?,data_json=?,updated_at=?,updated_by=? WHERE id=?')
      .bind(x.clientId||null,x.brandId||null,x.kind,x.name,x.description,x.active?1:0,JSON.stringify(x.data),t,email,tm[1]).run();
    await audit(env,undefined,email,'template.updated',{templateId:tm[1],fromVersion:existing.version});return reply(await getTemplate(env,tm[1]))
  }
  const tv=match(p,/^\/api\/templates\/([0-9a-f-]+)\/variant$/);
  if(tv&&m==='POST'){
    const base=await getTemplate(env,tv[1]);if(!base)return fail('Template not found',404);
    const body:any=await req.json(),clientId=String(body.clientId||''),client=await getClient(env,clientId);if(!client)return fail('Client is required for a client template variant',422);
    const brandId=String(body.brandId||client.defaultBrandId||base.brandId||''),brand=brandId?await getBrand(env,brandId):null;if(brandId&&!brand)return fail('Brand not found',422);
    const name=String(body.name||`${base.name} – ${client.name}`).trim().slice(0,180);if(!name)return fail('Variant name is required',422);
    const id=crypto.randomUUID(),t=now();
    await env.DB.prepare('INSERT INTO templates(id,parent_template_id,client_id,brand_id,kind,name,description,version,active,data_json,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id,base.id,client.id,brandId||null,base.kind,name,base.description,1,1,JSON.stringify(base.data),t,t,email,email).run();
    await audit(env,undefined,email,'template.variant_created',{templateId:id,parentTemplateId:base.id,clientId:client.id});return reply(await getTemplate(env,id),201)
  }

  if(p==='/api/documents/from-template'&&m==='POST'){
    const body:any=await req.json(),brand=await getBrand(env,String(body.brandId||'')),client=await getClient(env,String(body.clientId||'')),template=await getTemplate(env,String(body.templateId||''));
    if(!brand||brand.archived)return fail('Select an active brand',422);if(!client||client.archived)return fail('Select an active client',422);if(!template||!template.active)return fail('Select an active template',422);
    if(template.brandId&&template.brandId!==brand.id)return fail('This template is assigned to a different brand',422);
    if(template.clientId&&template.clientId!==client.id)return fail('This template is assigned to a different client',422);
    const data=validateDocument(documentFromTemplate(template,brand,client));
    return reply(await insertDocument(env,data,email,{brandId:brand.id,clientId:client.id,templateId:template.id,templateVersion:template.version}),201)
  }
  return null
}

async function api(req:Request,env:Env,email:string){
  const u=new URL(req.url),p=u.pathname,m=req.method;if(p==='/api/me'&&m==='GET')return reply({email});
  const master=await masterApi(req,env,email,p,m);if(master)return master;

  if(p==='/api/documents'&&m==='GET'){
    const r=await env.DB.prepare('SELECT id,root_id,revision,version,status,kind,title,client_name,reference,updated_at FROM documents ORDER BY updated_at DESC LIMIT 200').all();
    return reply(r.results.map((x:any):DocumentSummary=>({id:x.id,rootId:x.root_id,revision:x.revision,version:x.version,status:x.status,kind:x.kind,title:x.title,client:x.client_name,reference:x.reference,updatedAt:x.updated_at})))
  }
  if(p==='/api/documents'&&m==='POST'){const body:any=await req.json(),data=validateDocument(body.data);return reply(await insertDocument(env,data,email),201)}
  const dm=match(p,/^\/api\/documents\/([0-9a-f-]+)$/);
  if(dm&&m==='GET'){const d=await getDoc(env,dm[1]);return d?reply(d):fail('Document not found',404)}
  if(dm&&m==='PUT'){
    const current=await getDoc(env,dm[1]);if(!current)return fail('Document not found',404);if(!['draft','review'].includes(current.status))return fail('Approved or issued revisions cannot be edited',409);
    const body:any=await req.json(),expected=Number(body.expectedVersion),data=validateDocument(body.data),t=now();
    const r=await env.DB.prepare("UPDATE documents SET data_json=?,kind=?,title=?,client_name=?,reference=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND status IN ('draft','review')")
      .bind(JSON.stringify(data),data.kind,data.title,data.client.name,data.reference,t,email,current.id,expected).run();
    if(!r.meta.changes)return fail('Document changed in another session',409);await audit(env,current.id,email,'document.saved',{fromVersion:expected});return reply(await getDoc(env,current.id))
  }
  const sm=match(p,/^\/api\/documents\/([0-9a-f-]+)\/status$/);
  if(sm&&m==='POST'){
    const d=await getDoc(env,sm[1]);if(!d)return fail('Document not found',404);const body:any=await req.json(),target=body.status as Status,expected=Number(body.expectedVersion);
    if(finalIssues(d.data,d.attachments).length)return fail('Resolve all review issues before changing status',422);
    if(target==='review'&&d.status!=='draft')return fail('Only drafts can enter review',409);if(target==='approved'&&d.status!=='review')return fail('Only reviewed documents can be approved',409);if(target==='approved'&&!canApprove(email,env))return fail('You are not configured as an approver',403);
    const t=now(),approval=target==='approved',r=await env.DB.prepare('UPDATE documents SET status=?,version=version+1,updated_at=?,updated_by=?,approved_by=?,approved_at=? WHERE id=? AND version=?')
      .bind(target,t,email,approval?email:null,approval?t:null,d.id,expected).run();
    if(!r.meta.changes)return fail('Document changed in another session',409);await audit(env,d.id,email,`document.${target}`);return reply(await getDoc(env,d.id))
  }
  const am=match(p,/^\/api\/documents\/([0-9a-f-]+)\/attachments$/);
  if(am&&m==='POST'){
    const d=await getDoc(env,am[1]);if(!d)return fail('Document not found',404);if(!['draft','review'].includes(d.status))return fail('Attachments are locked for this revision',409);
    const form=await req.formData(),file=form.get('file');if(!(file instanceof File))return fail('File is required');if(file.size>25*1024*1024)return fail('Attachment exceeds 25 MB',413);
    const allowed=new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg']);if(!allowed.has(file.type))return fail('Unsupported attachment type',415);
    const id=crypto.randomUUID(),key=`documents/${d.rootId}/revisions/${d.revision}/attachments/${id}`;
    await env.DOCUMENT_STORAGE.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{originalName:file.name}});
    await env.DB.prepare('INSERT INTO attachments(id,document_id,name,mime,size,r2_key,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,d.id,file.name,file.type,file.size,key,now(),email).run();
    await audit(env,d.id,email,'attachment.added',{id,name:file.name,size:file.size});return reply(await getDoc(env,d.id),201)
  }
  const ax=match(p,/^\/api\/documents\/([0-9a-f-]+)\/attachments\/([0-9a-f-]+)$/);
  if(ax&&m==='DELETE'){
    const d=await getDoc(env,ax[1]);if(!d)return fail('Document not found',404);if(!['draft','review'].includes(d.status))return fail('Attachments are locked',409);
    const row:any=await env.DB.prepare('SELECT r2_key FROM attachments WHERE id=? AND document_id=?').bind(ax[2],d.id).first();if(!row)return fail('Attachment not found',404);
    await env.DOCUMENT_STORAGE.delete(row.r2_key);await env.DB.prepare('DELETE FROM attachments WHERE id=?').bind(ax[2]).run();await audit(env,d.id,email,'attachment.removed',{id:ax[2]});return reply(await getDoc(env,d.id))
  }
  const im=match(p,/^\/api\/documents\/([0-9a-f-]+)\/issue$/);
  if(im&&m==='POST'){
    const d=await getDoc(env,im[1]);if(!d)return fail('Document not found',404);if(d.status!=='approved')return fail('Only approved revisions can be issued',409);if(finalIssues(d.data,d.attachments).length)return fail('Document is no longer issue-ready',422);
    const expected=Number(u.searchParams.get('expectedVersion')),claimed=(u.searchParams.get('sha256')||'').toLowerCase();if(expected!==d.version)return fail('Document changed in another session',409);if(req.headers.get('content-type')!=='application/pdf')return fail('Issued snapshot must be a PDF',415);
    const bytes=await req.arrayBuffer();if(bytes.byteLength>30*1024*1024)return fail('PDF exceeds 30 MB',413);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==claimed)return fail('PDF integrity check failed',422);
    const key=`documents/${d.rootId}/revisions/${d.revision}/issued-${crypto.randomUUID()}.pdf`,t=now();await env.DOCUMENT_STORAGE.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
    const r=await env.DB.prepare("UPDATE documents SET status='issued',version=version+1,issued_at=?,updated_at=?,updated_by=?,pdf_key=?,pdf_sha256=? WHERE id=? AND version=? AND status='approved'").bind(t,t,email,key,hash,d.id,expected).run();
    if(!r.meta.changes){await env.DOCUMENT_STORAGE.delete(key);return fail('Document changed while issuing',409)}await audit(env,d.id,email,'document.issued',{sha256:hash});return reply(await getDoc(env,d.id))
  }
  const pm=match(p,/^\/api\/documents\/([0-9a-f-]+)\/issued-pdf$/);
  if(pm&&m==='GET'){
    const row:any=await env.DB.prepare("SELECT pdf_key,reference,title FROM documents WHERE id=? AND status='issued'").bind(pm[1]).first();if(!row?.pdf_key)return fail('Issued PDF not found',404);
    const obj=await env.DOCUMENT_STORAGE.get(row.pdf_key);if(!obj)return fail('Issued PDF is missing from storage',404);
    const name=String(row.reference||row.title||'issued-document').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)+'.pdf';
    return new Response(obj.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'private, no-store'}})
  }
  const rm=match(p,/^\/api\/documents\/([0-9a-f-]+)\/revision$/);
  if(rm&&m==='POST'){
    const d=await getDoc(env,rm[1]);if(!d)return fail('Document not found',404);if(d.status!=='issued')return fail('New revisions are created from issued documents',409);
    const latest:any=await env.DB.prepare('SELECT MAX(revision) AS n FROM documents WHERE root_id=?').bind(d.rootId).first(),rev=Number(latest?.n||d.revision)+1,id=crypto.randomUUID(),t=now(),copy=structuredClone(d.data),map=new Map<string,string>();
    await env.DB.prepare('INSERT INTO documents(id,root_id,revision,version,status,kind,title,client_name,reference,data_json,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.rootId,rev,1,'draft',copy.kind,copy.title,copy.client.name,copy.reference,JSON.stringify(copy),t,t,email,email).run();
    for(const a of d.attachments){const old:any=await env.DB.prepare('SELECT r2_key FROM attachments WHERE id=?').bind(a.id).first();if(old){const obj=await env.DOCUMENT_STORAGE.get(old.r2_key);if(obj){const aid=crypto.randomUUID(),key=`documents/${d.rootId}/revisions/${rev}/attachments/${aid}`;map.set(a.id,aid);await env.DOCUMENT_STORAGE.put(key,obj.body,{httpMetadata:obj.httpMetadata,customMetadata:obj.customMetadata});await env.DB.prepare('INSERT INTO attachments(id,document_id,name,mime,size,r2_key,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(aid,id,a.name,a.mime,a.size,key,t,email).run()}}}
    for(const q of copy.requirements)q.evidenceIds=q.evidenceIds.map(x=>map.get(x)).filter((x):x is string=>!!x);await env.DB.prepare('UPDATE documents SET data_json=? WHERE id=?').bind(JSON.stringify(copy),id).run();
    await audit(env,id,email,'document.revision_created',{from:d.id,revision:rev});return reply(await getDoc(env,id),201)
  }
  return fail('API route not found',404)
}
export default{async fetch(req:Request,env:Env){const u=new URL(req.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);try{return await api(req,env,await user(req,env))}catch(e){const message=e instanceof Error?e.message:'Request failed';return fail(message,/Authentication|required|Access/.test(message)?401:500)}}}satisfies ExportedHandler<Env>;
