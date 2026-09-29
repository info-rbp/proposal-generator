import test from'node:test';import assert from'node:assert/strict';
import{calculateLine,finalIssues,totals,type BrandRecord,type ClientRecord,type TemplateRecord}from'../shared/model';
import{blankDocument,documentFromTemplate}from'../shared/templates';
const id='00000000-0000-4000-8000-000000000001';

test('pricing uses decimal-safe rounding',()=>{const line={id,description:'Service',unit:'hour',quantity:'1.005',rate:'100.00',discountBps:0,taxBps:1000,optional:false};assert.deepEqual(calculateLine(line),{net:10050,tax:1005,total:11055});assert.equal(totals([line]).total,11055)});
test('optional lines do not enter committed total',()=>{const line={id,description:'Option',unit:'item',quantity:'1',rate:'50.00',discountBps:0,taxBps:1000,optional:true};assert.equal(totals([line]).total,0)});
test('tender review catches missing mandatory response',()=>{const d=blankDocument('tender-response');d.title='Tender';d.reference='T-1';d.preparedBy='User';d.client.name='Buyer';d.tender.closingLocal='2026-10-01T17:00';d.tender.submissionInstructions='Portal';d.sections.forEach(s=>s.body='Complete');d.requirements=[{id,reference:'1.1',question:'Confirm',source:'Schedule',mandatory:true,evidenceRequired:false,evidenceIds:[],response:'',wordLimit:50,reviewed:false}];const issues=finalIssues(d);assert.ok(issues.some(x=>x.includes('mandatory response')));assert.ok(issues.some(x=>x.includes('needs review')))});

test('document creation snapshots reusable master data',()=>{
 const brand:BrandRecord={id:'00000000-0000-4000-8000-000000000010',type:'internal',name:'RBP',legalName:'Remote Business Partner Pty Ltd',abn:'11 222 333 444',address:'Perth WA',email:'info@example.com',phone:'08 0000 0000',website:'example.com',primaryColour:'#123b3a',secondaryColour:'#ffffff',accentColour:'#d9a441',textColour:'#172322',fontFamily:'Inter',coverStyle:'bold',defaultPreparedBy:'Gianpaulo Coletti',defaultTerms:'Standard terms',archived:false,logoAssetId:'00000000-0000-4000-8000-000000000011',createdAt:'2026-09-29T00:00:00Z',updatedAt:'2026-09-29T00:00:00Z'};
 const client:ClientRecord={id:'00000000-0000-4000-8000-000000000020',name:'Client Co',tradingName:'Client',abn:'55 666 777 888',contact:'Alex',email:'alex@example.com',phone:'0400000000',address:'Perth WA',website:'client.example',defaultBrandId:brand.id,currency:'AUD',paymentTerms:'7 days',validityDays:30,notes:'',tags:['priority'],accountManager:'GP',archived:false,createdAt:'2026-09-29T00:00:00Z',updatedAt:'2026-09-29T00:00:00Z'};
 const data=blankDocument('proposal');data.terms='';
 const template:TemplateRecord={id:'00000000-0000-4000-8000-000000000030',parentTemplateId:undefined,clientId:'',brandId:'',kind:'proposal',name:'Consulting',description:'',version:3,active:true,data,createdAt:'2026-09-29T00:00:00Z',updatedAt:'2026-09-29T00:00:00Z'};
 const doc=documentFromTemplate(template,brand,client);
 assert.equal(doc.business.name,'RBP');assert.equal(doc.business.logoAssetId,brand.logoAssetId);assert.equal(doc.client.name,'Client Co');assert.equal(doc.preparedBy,'Gianpaulo Coletti');assert.equal(doc.terms,'Standard terms');assert.equal(doc.source?.templateVersion,3);
 brand.name='Changed later';client.name='Changed client';template.data.title='Changed template';
 assert.equal(doc.business.name,'RBP');assert.equal(doc.client.name,'Client Co');assert.notEqual(doc.title,'Changed template');
});
