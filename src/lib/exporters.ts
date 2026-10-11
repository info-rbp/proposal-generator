import{Document,Packer,Paragraph,Table,TableCell,TableRow,HeadingLevel,TextRun,WidthType}from'docx';
import{calculateLine,money,type DocumentData}from'../../shared/model';
import{renderPdf}from'./pdf-renderer';

async function brandLogo(d:DocumentData){const brandId=d.source?.brandId,assetId=d.business.logoAssetId;if(!brandId||!assetId)return null;try{const r=await fetch('/api/brand-assets/'+brandId+'/'+assetId,{credentials:'same-origin'});if(!r.ok)return null;const type=r.headers.get('content-type')||'';return{bytes:new Uint8Array(await r.arrayBuffer()),format:type.includes('png')?'PNG':'JPEG' as 'PNG'|'JPEG'}}catch{return null}}

export async function pdfBlob(d:DocumentData){
 return renderPdf(d,await brandLogo(d))
}

export async function wordBlob(d:DocumentData){
 const children:(Paragraph|Table)[]=[new Paragraph({text:d.title,heading:HeadingLevel.TITLE}),new Paragraph('Prepared for '+d.client.name),new Paragraph(d.reference+' | '+d.date)];
 for(const s of d.sections)children.push(new Paragraph({text:s.title,heading:HeadingLevel.HEADING_1}),new Paragraph(s.body||''));
 if(d.lines.length){children.push(new Paragraph({text:'Pricing',heading:HeadingLevel.HEADING_1}));children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:['Description','Qty','Rate','Total'].map(x=>new TableCell({children:[new Paragraph({children:[new TextRun({text:x,bold:true})]})]}))}),...d.lines.map(l=>new TableRow({children:[l.description,l.quantity,money(Number(l.rate)*100,d.currency),money(calculateLine(l).net,d.currency)].map(x=>new TableCell({children:[new Paragraph(x)]}))}))]}))}
 for(const r of d.requirements)children.push(new Paragraph({text:r.reference+': '+r.question,heading:HeadingLevel.HEADING_2}),new Paragraph(r.response||''));
 if(d.terms)children.push(new Paragraph({text:'Commercial terms',heading:HeadingLevel.HEADING_1}),new Paragraph(d.terms));
 return Packer.toBlob(new Document({sections:[{children}]}))
}
