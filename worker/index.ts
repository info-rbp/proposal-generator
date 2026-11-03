import documents from './documents';
import {isWebsiteApi,websiteApi} from './site-api';
import {HttpError,jsonReply,staffUser,type SiteEnv} from './site-common';
import {previewAsset} from './preview-assets';
export default {async fetch(req:Request,env:SiteEnv){
  const path=new URL(req.url).pathname;
  if(!isWebsiteApi(path))return documents.fetch(req,env);
  try{const email=await staffUser(req,env);const asset=path.match(/^\/api\/documents\/([0-9a-f-]+)\/website\/preview-assets\/([0-9a-f-]+)$/);if(asset&&req.method==='GET')return await previewAsset(env,asset[1],asset[2]);return await websiteApi(req,env,email)}catch(e){if(e instanceof HttpError)return jsonReply({error:e.message},e.status);console.error('Website API failed',e instanceof Error?e.name:'error');return jsonReply({error:'The website service is unavailable. Reload and try again.'},500)}
}} satisfies ExportedHandler<SiteEnv>;
