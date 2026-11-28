// Shared by the release builder, scanner and publish smoke. No network access.
import {resourceAttributes} from './set-asset-version.mjs';
const origin='https://release.invalid';
const decodeHTML=s=>s.replace(/&amp;/g,'&').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)));
const asset=/\.(?:m?js|css|json|svg|png|jpe?g|gif|webp|woff2?)$/i;

export function resourceReferences(path,text){
 const refs=new Map(),add=(raw,start,html=false)=>refs.set(start,{raw,start,end:start+raw.length,html});
 if(path.endsWith('.html'))for(const {raw,start} of resourceAttributes(text))add(raw,start,true);
 // Includes literal static/dynamic imports, runtime src/href and config URLs.
 if(/\.(?:html|m?js)$/.test(path)){
  for(const m of text.matchAll(/(['"`])((?:\.{1,2}\/|\/|assets\/)[^'"`\s<>]+?\.(?:m?js|css|json|svg|png|jpe?g|gif|webp|woff2?)(?:[?#][^'"`\s<>]*)?)\1/g)){
   // A suffix appended to an external base is not a standalone local URL.
   if(/\+\s*$/.test(text.slice(Math.max(0,m.index-40),m.index)))continue;
   const start=m.index+1;if(!refs.has(start))add(m[2],start);
  }
  for(const m of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(['"])([^'"]+)\1/g)){
   const start=m.index+m[0].indexOf(m[1])+1;if(!refs.has(start))add(m[2],start);
  }
 }
 if(/\.(?:html|css)$/.test(path)){
  for(const m of text.matchAll(/\burl\(\s*(?:(["'])(.*?)\1|([^\s)'";]+))\s*\)|@import\s+(["'])(.*?)\4/g)){
   const raw=m[2]??m[3]??m[5],start=m.index+m[0].indexOf(raw);if(!refs.has(start))add(raw,start);
  }
 }
 return [...refs.values()].sort((a,b)=>a.start-b.start);
}
function localResource(path,ref){
 const raw=ref.html?decodeHTML(ref.raw):ref.raw;
 if(/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(raw))return null;
 const url=new URL(raw,origin+'/'+path);
 return {url,path:decodeURIComponent(url.pathname).slice(1)};
}
export function versionResources(path,text,releaseId,pinned){
 if(pinned.has(path))return text;
 for(const ref of resourceReferences(path,text).reverse()){
  const local=localResource(path,ref);if(!local||!asset.test(local.path)||pinned.has(local.path))continue;
  const [base,fragment]=ref.raw.split('#'),[pathname,query='']=base.split('?');
  const params=new URLSearchParams(ref.html?decodeHTML(query):query);params.set('v',releaseId);
  const value=pathname+'?'+params.toString().replace(/&/g,ref.html?'&amp;':'&')+(fragment===undefined?'':'#'+fragment);
  text=text.slice(0,ref.start)+value+text.slice(ref.end);
 }
 return text;
}
export function releaseResources(files,{releaseId,readModelModule,pinned=new Set()}){
 if(!/^[a-f0-9]{64}$/.test(releaseId))throw Error('release_id_missing');
 const paths=new Set(files.map(f=>f.path)),resources=new Map();
 function add(path,ref){
  const local=localResource(path,ref);if(!local||!asset.test(local.path))return;
  if(!paths.has(local.path))throw Error('release_resource_missing:'+path+':'+ref.raw);
  if(!pinned.has(path)&&!pinned.has(local.path)&&
   (local.url.searchParams.getAll('v').length!==1||local.url.searchParams.get('v')!==releaseId))throw Error('release_resource_version:'+path+':'+ref.raw);
  const url=local.url.pathname+local.url.search;
  resources.set(url,{url,path:local.path});
 }
 for(const file of files){
  if(file.path.endsWith('.html')){
   resources.set('/'+file.path,{url:'/'+file.path,path:file.path});
   if(file.path.endsWith('index.html')){const url='/'+file.path.slice(0,-10);resources.set(url,{url,path:file.path});}
  }
  if(!/\.(?:html|m?js|css)$/.test(file.path))continue;
  // These exact compatibility scripts were already byte-checked by scanRelease.
  // Their disabled fullrev branches contain imports relative to the original location.
  if(pinned.has(file.path)&&/\.m?js$/.test(file.path))continue;
  const text=file.bytes.toString('utf8');
  // The only nonliteral import is the validated public read-model URL.
  if(!pinned.has(file.path))for(const m of text.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)){
   const expression=m[1].trim();
   if(/^(['"])[^'"\r\n]+\1$/.test(expression))continue;
   if(file.path!=='assets/fullrev-client.mjs'||expression!=='url.href'||
    !text.includes('const url=new URL(config.readModelModule,location.href);'))throw Error('release_dynamic_resource_unknown:'+file.path);
   add(file.path,{raw:readModelModule});
  }
  for(const ref of resourceReferences(file.path,text))add(file.path,ref);
 }
 return [...resources.values()].sort((a,b)=>a.url<b.url?-1:a.url>b.url?1:0);
}
