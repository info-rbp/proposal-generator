import { z } from 'zod';
import { totals, type Attachment, type DocumentData, type PriceLine } from './model';

const text = (max: number) => z.string().max(max);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const blockKinds = ['text', 'callout', 'cards', 'timeline', 'faq', 'stats', 'image'] as const;
export const tabKinds = ['home', 'sections', 'pricing', 'terms', 'attachments', 'requirements', 'response', 'custom'] as const;
export const blockSchema = z.object({
  id: identifier, kind: z.enum(blockKinds), title: text(180), body: text(40000),
  items: z.array(z.object({ title: text(180), body: text(10000) })).max(30),
  attachmentId: z.string().uuid().optional(), caption: text(500).optional()
}).strict();
export const tabSchema = z.object({
  id: identifier, label: text(60).min(1), kind: z.enum(tabKinds), enabled: z.boolean(),
  sectionIds: z.array(z.string().uuid()).max(60), blocks: z.array(blockSchema).max(40)
}).strict();
export const websiteSchema = z.object({
  schemaVersion: z.literal(1), designBrief: text(10000),
  theme: z.object({
    preset: z.enum(['editorial', 'corporate', 'minimal']), primary: colour, accent: colour,
    background: colour, text: colour, font: z.enum(['sans', 'serif']),
    radius: z.enum(['square', 'soft', 'round']), density: z.enum(['comfortable', 'compact']),
    hero: z.enum(['split', 'centred', 'simple'])
  }).strict(),
  home: z.object({ eyebrow: text(120), title: text(240), introduction: text(8000), ctaLabel: text(80), ctaTabId: identifier }).strict(),
  tabs: z.array(tabSchema).min(1).max(20), publicAttachmentIds: z.array(z.string().uuid()).max(100),
  allowResponses: z.boolean(), allowPrint: z.boolean()
}).strict().superRefine((site, ctx) => {
  if (site.tabs[0]?.kind !== 'home' || !site.tabs[0]?.enabled) ctx.addIssue({code:'custom', message:'The first tab must be an enabled home page.'});
  if (site.tabs.filter(t => t.kind === 'home').length !== 1) ctx.addIssue({code:'custom', message:'Use exactly one home page.'});
  if (new Set(site.tabs.map(t => t.id)).size !== site.tabs.length) ctx.addIssue({code:'custom', message:'Tab identifiers must be unique.'});
  for (const tab of site.tabs) if (new Set(tab.blocks.map(b => b.id)).size !== tab.blocks.length) ctx.addIssue({code:'custom', message:'Block identifiers must be unique within each tab.'});
  if (!site.tabs.some(t => t.id === site.home.ctaTabId && t.enabled)) ctx.addIssue({code:'custom', message:'The home button must point to an enabled tab.'});
  if (site.allowResponses && !site.tabs.some(t => t.kind === 'response' && t.enabled)) ctx.addIssue({code:'custom', message:'Enable a response tab or disable client responses.'});
  if (JSON.stringify(site).length > 400000) ctx.addIssue({code:'custom', message:'Website layout is too large.'});
});
export type WebsiteConfig = z.infer<typeof websiteSchema>;
export type SiteTab = z.infer<typeof tabSchema>;
export type SiteBlock = z.infer<typeof blockSchema>;
export const newId = () => crypto.randomUUID();
export function newTab(kind: SiteTab['kind'], label: string = kind): SiteTab {
  return {id:newId(),label,kind,enabled:true,sectionIds:[],blocks:[]};
}
export function newBlock(kind: SiteBlock['kind']): SiteBlock {
  return {id:newId(),kind,title:'New section',body:'',items:[]};
}
export function defaultWebsite(d: DocumentData): WebsiteConfig {
  const home = {...newTab('home','Overview'),id:'home'};
  const scope = {...newTab('sections','Our proposal'),id:'proposal'};
  const pricing = {...newTab('pricing','Investment'),id:'investment'};
  const terms = {...newTab('terms','Terms & schedules'),id:'terms'};
  const files = {...newTab('attachments','Resources'),id:'resources'};
  const response = {...newTab('response','Your response'),id:'response'};
  const tabs = [home,scope,pricing,terms,files];
  if (d.requirements.length) tabs.push({...newTab('requirements','Requirements'),id:'requirements'});
  tabs.push(response);
  return {schemaVersion:1,designBrief:'',theme:{preset:'editorial',primary:d.business.colour || '#173D3A',accent:d.business.accentColour || '#B08B4F',background:'#F6F5F1',text:'#162D2B',font:'sans',radius:'soft',density:'comfortable',hero:'split'},home:{eyebrow:'A proposal prepared for you',title:'{{title}}',introduction:'Prepared for {{client.name}}. Explore the proposed approach, investment and next steps using the tabs below.',ctaLabel:'Explore your proposal',ctaTabId:'proposal'},tabs,publicAttachmentIds:[],allowResponses:true,allowPrint:true};
}
export function applyPreset(site: WebsiteConfig, preset: WebsiteConfig['theme']['preset']): WebsiteConfig {
  const palettes = {editorial:{primary:'#173D3A',accent:'#B08B4F',background:'#F6F5F1',text:'#162D2B',font:'serif' as const,hero:'split' as const},corporate:{primary:'#17365D',accent:'#2A6FAD',background:'#F3F6FA',text:'#182B45',font:'sans' as const,hero:'split' as const},minimal:{primary:'#202020',accent:'#666666',background:'#FFFFFF',text:'#202020',font:'sans' as const,hero:'simple' as const}};
  return {...site,theme:{...site.theme,...palettes[preset],preset}};
}
export function websiteIssues(d: DocumentData, site: WebsiteConfig, attachments: Attachment[]): string[] {
  const parsed = websiteSchema.safeParse(site);
  if (!parsed.success) return parsed.error.issues.map(i => i.message);
  const out: string[] = [], tabs = site.tabs.filter(t=>t.enabled), ids = new Set(attachments.map(a=>a.id));
  const contentTabs=tabs.filter(t=>t.kind==='sections');
  const allSections=contentTabs.some(t=>!t.sectionIds.length);
  const selectedSections=new Set(contentTabs.flatMap(t=>t.sectionIds));
  for(const s of d.sections) if(s.required&&!allSections&&!selectedSections.has(s.id)) out.push(`Required section is hidden: ${s.title}`);
  for(const tab of tabs) for(const id of tab.sectionIds) if(!d.sections.some(s=>s.id===id)) out.push(`A section in ${tab.label} no longer exists.`);
  for(const id of site.publicAttachmentIds) if(!ids.has(id)) out.push('A selected resource no longer exists.');
  for(const tab of tabs) for(const block of tab.blocks) if(block.kind==='image' && (!block.attachmentId || !site.publicAttachmentIds.includes(block.attachmentId) || !attachments.some(a=>a.id===block.attachmentId&&/^image\/(png|jpeg)$/.test(a.mime)))) out.push(`Choose an explicitly shared PNG/JPEG for ${block.title || 'the image block'}.`);
  if((d.lines.length||(d.commercialOptions||[]).length)&&!tabs.some(t=>t.kind==='pricing')) out.push('Include an Investment tab so the client can review the pricing.');
  if((d.terms.trim()||(d.clauses||[]).length||(d.schedules||[]).length)&&!tabs.some(t=>t.kind==='terms')) out.push('Include a Terms tab so the client can review all terms and schedules.');
  if(d.requirements.some(r=>r.mandatory)&&!tabs.some(t=>t.kind==='requirements')) out.push('Include a Requirements tab for mandatory tender responses.');
  return [...new Set(out)];
}
export interface PublicSnapshot {
  schemaVersion: 1; revision: number; publishedAt: string;
  document: Pick<DocumentData,'kind'|'title'|'reference'|'date'|'validUntil'|'preparedBy'|'currency'> & {
    business: Pick<DocumentData['business'],'name'|'legalName'|'abn'|'email'|'phone'|'address'>;
    client: {name:string}; sections: Array<{id:string;title:string;body:string}>;
    lines: PriceLine[]; commercialOptions: NonNullable<DocumentData['commercialOptions']>;
    terms:string; clauses:Array<{id:string;title:string;body:string}>;
    schedules:Array<{id:string;title:string;body:string;optionIds:string[]}>;
    requirements:Array<{id:string;reference:string;question:string;response:string; evidenceIds:string[]}>;
  };
  website: Omit<WebsiteConfig,'designBrief'>;
  attachments: Array<Pick<Attachment,'id'|'name'|'mime'|'size'>>;
  hasLogo:boolean; hasPdf:boolean;
}
export function makeSnapshot(d: DocumentData, site: WebsiteConfig, attachments: Attachment[], revision=1, publishedAt=new Date().toISOString(), hasPdf=false): PublicSnapshot {
  const tabs=site.tabs.filter(t=>t.enabled), has=(kind:SiteTab['kind'])=>tabs.some(t=>t.kind===kind);
  const sectionTabs=tabs.filter(t=>t.kind==='sections'), all=sectionTabs.some(t=>!t.sectionIds.length), sectionIds=new Set(sectionTabs.flatMap(t=>t.sectionIds));
  const {designBrief:_brief,...safeSite}=structuredClone(site);
  safeSite.tabs=tabs.map(t=>structuredClone(t));
  const shared=attachments.filter(a=>site.publicAttachmentIds.includes(a.id));
  const sharedIds=new Set(shared.map(a=>a.id));
  // An old whole-document PDF must not bypass the website's content exclusions.
  const completeDocumentVisible=d.sections.every(s=>all||sectionIds.has(s.id))&&(!d.requirements.length||has('requirements'))&&(!(d.lines.length||(d.commercialOptions||[]).length)||has('pricing'))&&(!(d.terms||(d.clauses||[]).length||(d.schedules||[]).length)||has('terms'));
  return {schemaVersion:1,revision,publishedAt,document:{kind:d.kind,title:d.title,reference:d.reference,date:d.date,validUntil:d.validUntil,preparedBy:d.preparedBy,currency:d.currency,business:{name:d.business.name,legalName:d.business.legalName,abn:d.business.abn,email:d.business.email,phone:d.business.phone,address:d.business.address},client:{name:d.client.name},sections:d.sections.filter(s=>all||sectionIds.has(s.id)).map(({id,title,body})=>({id,title,body})),lines:has('pricing')?structuredClone(d.lines):[],commercialOptions:has('pricing')?structuredClone(d.commercialOptions||[]):[],terms:has('terms')?d.terms:'',clauses:has('terms')?(d.clauses||[]).map(({id,title,body})=>({id,title,body})):[],schedules:has('terms')?(d.schedules||[]).map(({id,title,body,optionIds})=>({id,title,body,optionIds:[...optionIds]})):[],requirements:has('requirements')?d.requirements.map(({id,reference,question,response,evidenceIds})=>({id,reference,question,response,evidenceIds:evidenceIds.filter(id=>sharedIds.has(id))})):[]},website:safeSite,attachments:shared.map(({id,name,mime,size})=>({id,name,mime,size})),hasLogo:!!(d.business.logoAssetId&&d.source?.brandId),hasPdf:hasPdf&&site.allowPrint&&completeDocumentVisible};
}
export function interpolate(value:string,d:PublicSnapshot['document']):string {
  const fields:Record<string,string>={'title':d.title,'client.name':d.client.name,'business.name':d.business.name,'reference':d.reference,'validUntil':d.validUntil,'preparedBy':d.preparedBy};
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g,(match,key)=>fields[key]??match);
}
export const responseSchema=z.object({
  action:z.enum(['accepted','declined','changes_requested']),name:z.string().trim().min(1).max(180),email:z.string().trim().email().max(254),message:text(8000),
  optionId:z.string().uuid().optional(),optionalLineIds:z.array(z.string().uuid()).max(200),consent:z.boolean(),idempotencyKey:z.string().uuid()
}).strict();
export type ClientResponse=z.infer<typeof responseSchema>;
export function selectedPricing(snapshot:PublicSnapshot, optionId?:string, optionalLineIds:string[]=[]){
  const options=snapshot.document.commercialOptions;
  if(options.length&&!optionId) throw new Error('Choose a commercial option.');
  const option=options.find(o=>o.id===optionId);
  if(optionId&&!option) throw new Error('Unknown commercial option.');
  const lines=option?option.lines:snapshot.document.lines;
  if(new Set(optionalLineIds).size!==optionalLineIds.length||optionalLineIds.some(id=>!lines.some(l=>l.id===id&&l.optional))) throw new Error('Invalid optional item selection.');
  const chosen=lines.filter(l=>!l.optional||optionalLineIds.includes(l.id)).map(l=>({...l,optional:false}));
  const mode=option?.pricingMode||'committed';
  return {optionId:option?.id||null,optionTitle:option?.title||null,pricingMode:mode,currency:snapshot.document.currency,optionalLineIds,total:mode==='committed'?totals(chosen):null,lines:chosen};
}
export function readableDate(value:string){return value?new Date(value.length===10?`${value}T12:00:00+08:00`:value).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'Australia/Perth'}):'Not specified'}
export function contrastText(hex:string){const n=hex.replace('#',''),v=[0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]>.179?'#111111':'#FFFFFF'}
