import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProposalSite} from '../src/ProposalSite';
import {demoSnapshot} from '../shared/website-demo';
import type {ClientResponse,PublicSnapshot} from '../shared/website';
interface Payload {snapshot:PublicSnapshot;expiresAt:string;finalResponse:{action:string;createdAt:string}|null}
interface ErrorPayload {error?:string}
function ClientApp(){
  const path=location.pathname,token=path.match(/^\/p\/([0-9a-f]{64})\/?$/)?.[1];
  const[data,setData]=useState<Payload|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(!token)return;
    const controller=new AbortController();
    fetch(`/api/p/${token}`,{signal:controller.signal,cache:'no-store',credentials:'omit'}).then(async r=>{
      const body=await r.json() as Payload & ErrorPayload;
      if(!r.ok)throw new Error(body.error||'Proposal unavailable.');
      if(!body.snapshot?.document||!body.snapshot?.website)throw new Error('The proposal response is incomplete.');
      setData(body);
      document.title=`${body.snapshot.document.title.replace(/\n/g,' ')} | ${body.snapshot.document.business.name}`;
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message)});
    return()=>controller.abort();
  },[token]);
  if(path==='/demo')return <ProposalSite snapshot={demoSnapshot()} preview previewLabel="Example proposal - synthetic content, not a commercial offer"/>;
  if(!token||error||!data)return <div className="proposal-site"><main className="ps-main" style={{paddingTop:100,paddingBottom:100}}><p className="ps-eyebrow">Client proposals</p><h1>{error?'Proposal unavailable':token?'Opening your proposal...':'Your proposal, in one place.'}</h1><p>{error||(!token?'Open the private proposal link provided to you. Client proposals are not publicly listed.':'Loading the published proposal.')}</p></main></div>;
  const base=`/api/p/${token}`;
  const respond=async(input:ClientResponse):Promise<{action:string}>=>{
    const r=await fetch(`${base}/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),credentials:'omit'});
    const body=await r.json() as {action?:string;error?:string};
    if(!r.ok)throw new Error(body.error||'Could not record your response.');
    if(!body.action)throw new Error('The response confirmation is incomplete.');
    return {action:body.action};
  };
  return <ProposalSite snapshot={data.snapshot} logoUrl={`${base}/logo`} resourceUrl={id=>`${base}/attachments/${id}`} pdfUrl={`${base}/pdf`} finalResponse={data.finalResponse} onRespond={respond}/>;
}
createRoot(document.getElementById('root')!).render(<ClientApp/>);
