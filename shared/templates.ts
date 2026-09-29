import {SCHEMA_VERSION,type BrandRecord,type ClientRecord,type DocumentData,type Kind,type TemplateRecord}from'./model';

export const catalogue=[
  {kind:'proposal' as const,name:'Service proposal',description:'Scope, delivery approach and commercial offer.',sections:['Executive summary','Understanding your requirements','Scope and deliverables','Methodology and programme','Relevant experience','Assumptions and exclusions']},
  {kind:'tender-response' as const,name:'Tender response',description:'Requirement-by-requirement response with evidence.',sections:['Executive summary','Organisation and capability','Proposed methodology','Personnel and resources','Experience and references','Risk and quality management']},
  {kind:'rfq' as const,name:'Request for quotation',description:'Buyer-side brief inviting supplier quotations.',sections:['Project overview','Scope and specifications','Deliverables and programme','Supplier response requirements','Evaluation criteria']},
  {kind:'capability' as const,name:'Capability statement',description:'Services, experience and capacity for a defined audience.',sections:['Organisation overview','Core services','Relevant experience','People and capacity','Contact and next steps']}
];

export const todayPerth=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
export function blankDocument(kind:Kind):DocumentData{
  const t=catalogue.find(x=>x.kind===kind)!;
  return{
    schemaVersion:SCHEMA_VERSION,kind,title:t.name,reference:'',date:todayPerth(),validUntil:'',preparedBy:'',currency:'AUD',
    business:{name:'Remote Business Partner',abn:'',address:'',email:'',phone:'',website:'',colour:'#123b3a'},
    client:{name:'',contact:'',email:'',address:''},
    sections:t.sections.map((title,i)=>({id:crypto.randomUUID(),title,body:'',required:i<3})),
    lines:[],requirements:[],terms:'',tender:{closingLocal:'',timezone:'Australia/Perth',submissionInstructions:'',addenda:''}
  }
}
function addDays(date:string,days:number){if(!days)return'';const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function documentFromTemplate(template:TemplateRecord,brand:BrandRecord,client:ClientRecord):DocumentData{
  const source=structuredClone(template.data),date=todayPerth();
  source.date=date;
  source.validUntil=addDays(date,client.validityDays);
  source.preparedBy=brand.defaultPreparedBy||source.preparedBy;
  source.currency=client.currency||source.currency;
  source.reference='';
  source.business={
    name:brand.name,legalName:brand.legalName,abn:brand.abn,address:brand.address,email:brand.email,phone:brand.phone,website:brand.website,
    colour:brand.primaryColour,secondaryColour:brand.secondaryColour,accentColour:brand.accentColour,textColour:brand.textColour,
    fontFamily:brand.fontFamily,coverStyle:brand.coverStyle,logoAssetId:brand.logoAssetId
  };
  source.client={name:client.name,tradingName:client.tradingName,abn:client.abn,contact:client.contact,email:client.email,phone:client.phone,address:client.address,website:client.website};
  source.source={brandId:brand.id,clientId:client.id,templateId:template.id,templateVersion:template.version};
  if(!source.terms.trim()&&brand.defaultTerms.trim())source.terms=brand.defaultTerms;
  source.sections=source.sections.map(s=>({...s,id:crypto.randomUUID()}));
  source.lines=source.lines.map(l=>({...l,id:crypto.randomUUID()}));
  source.requirements=source.requirements.map(r=>({...r,id:crypto.randomUUID(),evidenceIds:[],reviewed:false}));
  return source
}
