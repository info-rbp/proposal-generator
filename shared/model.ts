import { z } from 'zod';

export const SCHEMA_VERSION=1;
export const kinds=['proposal','tender-response','rfq','capability'] as const;
export const statuses=['draft','review','approved','issued'] as const;
export const brandTypes=['internal','client'] as const;
const text=(max=1000)=>z.string().max(max);
const idOrBlank=z.union([z.string().uuid(),z.literal('')]);

export const businessSchema=z.object({
  name:text(180),legalName:text(180).optional(),abn:text(40),address:text(500),email:text(180),phone:text(80),website:text(240),
  colour:z.string().regex(/^#[0-9a-fA-F]{6}$/),secondaryColour:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColour:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),textColour:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily:text(100).optional(),coverStyle:text(80).optional(),logoAssetId:z.string().uuid().optional()
});
export const clientSchema=z.object({
  name:text(180),tradingName:text(180).optional(),abn:text(40).optional(),contact:text(180),email:text(180),phone:text(80).optional(),
  address:text(500),website:text(240).optional()
});
export const sectionSchema=z.object({id:z.string().uuid(),title:text(180),body:text(40000),required:z.boolean()});
export const priceSchema=z.object({id:z.string().uuid(),description:text(1000),unit:text(40),quantity:z.string().regex(/^\d{1,6}(\.\d{0,3})?$/),rate:z.string().regex(/^\d{1,9}(\.\d{0,2})?$/),discountBps:z.number().int().min(0).max(10000),taxBps:z.number().int().min(0).max(10000),optional:z.boolean()});

// A proposal can carry several mutually exclusive, self-contained commercial offers.
// These optional fields are deliberately backward-compatible with schemaVersion 1.
export const commercialOptionSchema=z.object({
  id:z.string().uuid(),title:text(180),summary:text(10000),
  model:z.enum(['subscription','payg','fixed','custom']),
  pricingMode:z.enum(['committed','rate_card','illustrative']),
  lines:z.array(priceSchema).max(200),
  scope:text(30000),exclusions:text(15000),paymentTerms:text(12000),billingNotes:text(12000),recommended:z.boolean()
});
export const clauseSchema=z.object({
  id:z.string().uuid(),title:text(180),body:text(30000),required:z.boolean()
});
export const proposalScheduleSchema=z.object({
  id:z.string().uuid(),title:text(180),body:text(40000),
  optionIds:z.array(z.string().uuid()).max(12),required:z.boolean()
});
export type CommercialOption=z.infer<typeof commercialOptionSchema>;
export type ProposalClause=z.infer<typeof clauseSchema>;
export type ProposalSchedule=z.infer<typeof proposalScheduleSchema>;
export function commercialTotals(option:CommercialOption){return totals(option.lines)}

export const requirementSchema=z.object({id:z.string().uuid(),reference:text(100),question:text(12000),source:text(500),mandatory:z.boolean(),evidenceRequired:z.boolean(),evidenceIds:z.array(z.string().uuid()).max(50),response:text(40000),wordLimit:z.number().int().min(0).max(20000),reviewed:z.boolean()});
const date=z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v),'Use YYYY-MM-DD');
export const sourceSchema=z.object({brandId:z.string().uuid(),clientId:z.string().uuid(),templateId:z.string().uuid(),templateVersion:z.number().int().min(1)}).optional();

export const documentSchema=z.object({
  schemaVersion:z.literal(SCHEMA_VERSION),kind:z.enum(kinds),title:text(240),reference:text(100),date,validUntil:date,preparedBy:text(180),
  currency:z.enum(['AUD','NZD','USD','GBP','EUR']),business:businessSchema,client:clientSchema,source:sourceSchema,
  sections:z.array(sectionSchema).min(1).max(60),lines:z.array(priceSchema).max(200),requirements:z.array(requirementSchema).max(200),terms:text(30000),
  commercialOptions:z.array(commercialOptionSchema).max(12).optional(),clauses:z.array(clauseSchema).max(80).optional(),schedules:z.array(proposalScheduleSchema).max(80).optional(),
  tender:z.object({closingLocal:text(30),timezone:text(80),submissionInstructions:text(10000),addenda:text(10000)})
}).superRefine((d,ctx)=>{
  for(const key of ['sections','lines','requirements'] as const){const a=d[key];if(new Set(a.map(x=>x.id)).size!==a.length)ctx.addIssue({code:'custom',path:[key],message:'Duplicate identifiers are not allowed'})}
  for(const key of ['commercialOptions','clauses','schedules'] as const){const a=d[key]||[];if(new Set(a.map(x=>x.id)).size!==a.length)ctx.addIssue({code:'custom',path:[key],message:'Duplicate identifiers are not allowed'})}
  const optionIds=new Set((d.commercialOptions||[]).map(o=>o.id));
  for(const [i,o] of (d.commercialOptions||[]).entries()){
    if(new Set(o.lines.map(l=>l.id)).size!==o.lines.length)ctx.addIssue({code:'custom',path:['commercialOptions',i,'lines'],message:'Duplicate pricing line identifiers are not allowed'});
  }
  for(const [i,sch] of (d.schedules||[]).entries())for(const id of sch.optionIds)if(!optionIds.has(id))ctx.addIssue({code:'custom',path:['schedules',i,'optionIds'],message:'Schedule references a removed commercial option'});
  if(JSON.stringify(d).length>700000)ctx.addIssue({code:'custom',message:'Document is too large; use attachments for source material'})
});

export const brandInputSchema=z.object({
  type:z.enum(brandTypes),name:text(180).min(1),legalName:text(180),abn:text(40),address:text(500),email:text(180),phone:text(80),website:text(240),
  primaryColour:z.string().regex(/^#[0-9a-fA-F]{6}$/),secondaryColour:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColour:z.string().regex(/^#[0-9a-fA-F]{6}$/),textColour:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily:text(100),coverStyle:text(80),defaultPreparedBy:text(180),defaultTerms:text(30000),archived:z.boolean()
});
export const clientInputSchema=z.object({
  name:text(180).min(1),tradingName:text(180),abn:text(40),contact:text(180),email:text(180),phone:text(80),address:text(500),website:text(240),
  defaultBrandId:idOrBlank,currency:z.enum(['AUD','NZD','USD','GBP','EUR']),paymentTerms:text(1000),validityDays:z.number().int().min(0).max(3650),
  notes:text(10000),tags:z.array(text(80)).max(50),accountManager:text(180),archived:z.boolean()
});
export const templateInputSchema=z.object({
  name:text(180).min(1),description:text(1000),kind:z.enum(kinds),brandId:idOrBlank,clientId:idOrBlank,active:z.boolean(),data:documentSchema
}).superRefine((t,ctx)=>{if(t.data.kind!==t.kind)ctx.addIssue({code:'custom',path:['data','kind'],message:'Template document type must match template type'})});

export type DocumentData=z.infer<typeof documentSchema>;
export type PriceLine=z.infer<typeof priceSchema>;
export type Kind=typeof kinds[number];
export type Status=typeof statuses[number];
export type BrandInput=z.infer<typeof brandInputSchema>;
export type ClientInput=z.infer<typeof clientInputSchema>;
export type TemplateInput=z.infer<typeof templateInputSchema>;
export type BrandRecord=BrandInput&{id:string;logoAssetId?:string;createdAt:string;updatedAt:string};
export type ClientRecord=ClientInput&{id:string;createdAt:string;updatedAt:string};
export type TemplateRecord=TemplateInput&{id:string;parentTemplateId?:string;version:number;createdAt:string;updatedAt:string};

export interface Attachment{id:string;name:string;mime:string;size:number;createdAt:string}
export interface DocumentRecord{id:string;rootId:string;revision:number;version:number;status:Status;data:DocumentData;attachments:Attachment[];createdAt:string;updatedAt:string;createdBy:string;updatedBy:string;approvedBy?:string;approvedAt?:string;issuedAt?:string;pdfSha256?:string}
export interface DocumentSummary{id:string;rootId:string;revision:number;version:number;status:Status;kind:Kind;title:string;client:string;reference:string;updatedAt:string}

export const words=(s:string)=>s.trim()?s.trim().split(/\s+/u).length:0;
function scaled(s:string,p:number){const[w,f='']=s.split('.');return BigInt(w)*10n**BigInt(p)+BigInt((f+'0'.repeat(p)).slice(0,p))}
const round=(n:bigint,d:bigint)=>(n+d/2n)/d;
const safe=(n:bigint)=>{if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount too large');return Number(n)};
export function calculateLine(l:PriceLine){const p=priceSchema.parse(l);const gross=round(scaled(p.quantity,3)*scaled(p.rate,2),1000n),discount=round(gross*BigInt(p.discountBps),10000n),net=gross-discount,tax=round(net*BigInt(p.taxBps),10000n);return{net:safe(net),tax:safe(tax),total:safe(net+tax)}}
export function totals(lines:PriceLine[]){
  let net=0n;
  const taxBuckets=new Map<number,bigint>();
  for(const l of lines.filter(x=>!x.optional)){
    const parsed=priceSchema.parse(l);
    const lineNet=BigInt(calculateLine(parsed).net);
    net+=lineNet;
    taxBuckets.set(parsed.taxBps,(taxBuckets.get(parsed.taxBps)||0n)+lineNet);
  }
  // Calculate tax once on the aggregated taxable base per rate. This avoids
  // accumulating one-cent differences across individually rounded lines.
  let tax=0n;
  for(const [basis,bucket] of taxBuckets)tax+=round(bucket*BigInt(basis),10000n);
  return{net:safe(net),tax:safe(tax),total:safe(net+tax)}
}
export const money=(c:number,currency='AUD')=>new Intl.NumberFormat('en-AU',{style:'currency',currency,currencyDisplay:'code'}).format(c/100);
export function finalIssues(d:DocumentData,attachments:Attachment[]=[]){
  const parsed=documentSchema.safeParse(d);if(!parsed.success)return parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
  const out:string[]=[];
  for(const[label,value]of[['Document title',d.title],['Reference',d.reference],['Date',d.date],['Prepared by',d.preparedBy],['Business name',d.business.name],['Client / audience',d.client.name]])if(!value.trim())out.push(`${label} is required.`);
  if(d.validUntil&&d.date&&d.validUntil<d.date)out.push('Valid-until date cannot precede the document date.');
  for(const s of d.sections){if(!s.title.trim())out.push('Every section needs a title.');if(s.required&&!s.body.trim())out.push(`Complete the required section: ${s.title}.`)}
  try{totals(d.lines);for(const o of d.commercialOptions||[])commercialTotals(o)}catch{out.push('Correct invalid pricing values.')}
  if(d.kind==='proposal'){
    for(const [i,o] of (d.commercialOptions||[]).entries()){
      if(!o.title.trim())out.push(`Commercial option ${i+1} needs a title.`);
      if(!o.paymentTerms.trim())out.push(`${o.title||`Option ${i+1}`}: payment terms are required.`);
      if(o.pricingMode==='committed'&&!o.lines.some(l=>!l.optional))out.push(`${o.title||`Option ${i+1}`}: add at least one committed pricing line.`);
      if(o.pricingMode==='rate_card'&&!o.lines.length)out.push(`${o.title||`Option ${i+1}`}: add its PAYG rates.`);
    }
    for(const c of d.clauses||[])if(c.required&&!c.body.trim())out.push(`Complete the required term: ${c.title}.`);
    for(const sch of d.schedules||[])if(sch.required&&!sch.body.trim())out.push(`Complete the required schedule: ${sch.title}.`);
  }
  if(d.kind==='tender-response'&&!d.requirements.length)out.push('Add tender requirements before review.');
  if((d.kind==='tender-response'||d.kind==='rfq')&&(!d.tender.closingLocal||!d.tender.submissionInstructions.trim()))out.push('Record closing time and submission instructions.');
  for(const r of d.requirements){if(r.mandatory&&!r.response.trim())out.push(`${r.reference||'Requirement'}: mandatory response is missing.`);if(r.mandatory&&!r.reviewed)out.push(`${r.reference||'Requirement'}: response needs review.`);if(r.wordLimit&&words(r.response)>r.wordLimit)out.push(`${r.reference}: response exceeds ${r.wordLimit} words.`);if(r.evidenceRequired&&!r.evidenceIds.length)out.push(`${r.reference}: supporting evidence is required.`);if(r.evidenceIds.some(id=>!attachments.some(a=>a.id===id)))out.push(`${r.reference}: linked attachment is missing.`)}
  return[...new Set(out)]
}
