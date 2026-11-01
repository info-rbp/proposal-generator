import{Document,Packer,Paragraph,Table,TableCell,TableRow,HeadingLevel,TextRun,WidthType}from'docx';
import{calculateLine,money,totals,type DocumentData}from'../../shared/model';
import{renderPdf}from'./pdf-renderer';

async function brandLogo(d:DocumentData){const brandId=d.source?.brandId,assetId=d.business.logoAssetId;if(!brandId||!assetId)return null;try{const r=await fetch('/api/brand-assets/'+brandId+'/'+assetId,{credentials:'same-origin'});if(!r.ok)return null;const type=r.headers.get('content-type')||'';return{bytes:new Uint8Array(await r.arrayBuffer()),format:type.includes('png')?'PNG':'JPEG' as 'PNG'|'JPEG'}}catch{return null}}

export async function pdfBlob(d:DocumentData){
 return renderPdf(d,await brandLogo(d))
}

export async function wordBlob(d:DocumentData){
 const children:(Paragraph|Table)[]=[new Paragraph({text:d.title,heading:HeadingLevel.TITLE}),new Paragraph('Prepared for '+d.client.name),new Paragraph(d.reference+' | '+d.date)];
 for(const s of d.sections)children.push(new Paragraph({text:s.title,heading:HeadingLevel.HEADING_1}),new Paragraph(s.body||''));
 if(d.lines.length && !d.commercialOptions?.length){children.push(new Paragraph({text:'Pricing',heading:HeadingLevel.HEADING_1}));children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:['Description','Qty','Rate','Total'].map(x=>new TableCell({children:[new Paragraph({children:[new TextRun({text:x,bold:true})]})]}))}),...d.lines.map(l=>new TableRow({children:[l.description,l.quantity,money(Number(l.rate)*100,d.currency),money(calculateLine(l).net,d.currency)].map(x=>new TableCell({children:[new Paragraph(x)]}))}))]}))}
 for(const [i,o] of (d.commercialOptions||[]).entries()){
  children.push(new Paragraph({text:'Commercial option '+(i+1)+': '+o.title,heading:HeadingLevel.HEADING_1}));
  if(o.recommended)children.push(new Paragraph({text:'Recommended option'}));
  for(const [title,value] of [['Overview',o.summary],['Scope and inclusions',o.scope],['Exclusions',o.exclusions]]){
    if(value)children.push(new Paragraph({text:title,heading:HeadingLevel.HEADING_2}),new Paragraph(value));
  }
  if(o.lines.length){
    children.push(new Paragraph({text:o.pricingMode==='rate_card'?'Pay-as-you-go rates':'Pricing — '+(o.pricingMode==='illustrative'?'illustrative':'committed'),heading:HeadingLevel.HEADING_2}));
    children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
      new TableRow({children:['Description','Qty','Rate','Amount'].map(x=>new TableCell({children:[new Paragraph({children:[new TextRun({text:x,bold:true})]})]}))}),
      ...o.lines.map(l=>new TableRow({children:[l.description,l.quantity+' '+l.unit,money(Math.round(Number(l.rate)*100),d.currency),money(calculateLine(l).net,d.currency)].map(x=>new TableCell({children:[new Paragraph(x)]}))}))
    ]}));
    if(o.pricingMode==='committed'){
      const t=totals(o.lines);
      children.push(new Paragraph({text:'Option total excluding GST: '+money(t.net,d.currency)+' | GST: '+money(t.tax,d.currency)+' | Including GST: '+money(t.total,d.currency)}));
    }else children.push(new Paragraph({text:'Rates are indicative or usage based, not a committed total.'}));
  }
  if(o.paymentTerms)children.push(new Paragraph({text:'Payment terms',heading:HeadingLevel.HEADING_2}),new Paragraph(o.paymentTerms));
  if(o.billingNotes)children.push(new Paragraph({text:'Billing notes',heading:HeadingLevel.HEADING_2}),new Paragraph(o.billingNotes));
 }
 for(const [i,c] of (d.clauses||[]).entries())children.push(new Paragraph({text:(i+1)+'. '+c.title,heading:HeadingLevel.HEADING_2}),new Paragraph(c.body));
 for(const [i,sc] of (d.schedules||[]).entries()){
  children.push(new Paragraph({text:'Schedule '+(i+1)+': '+sc.title,heading:HeadingLevel.HEADING_1}));
  if(sc.optionIds.length)children.push(new Paragraph({text:'Applicable options: '+(d.commercialOptions||[]).filter(o=>sc.optionIds.includes(o.id)).map(o=>o.title).join(', ')}));
  children.push(new Paragraph(sc.body));
 }
 for(const r of d.requirements)children.push(new Paragraph({text:r.reference+': '+r.question,heading:HeadingLevel.HEADING_2}),new Paragraph(r.response||''));
 if(d.terms)children.push(new Paragraph({text:'Commercial terms',heading:HeadingLevel.HEADING_1}),new Paragraph(d.terms));
 return Packer.toBlob(new Document({sections:[{children}]}))
}
