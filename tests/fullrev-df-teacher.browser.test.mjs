import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSite} from '../tools/build-fullrev-site.mjs';
import {config as fixtureConfig} from './fixtures/fullrev.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
test('DF release preserves old Firebase owner login, roster and report queries',async t=>{
 if(!process.env.YBS_WORKER_SOURCE&&process.env.CI){t.skip('略過：需私有來源，由 Console 發布前在本機執行');return;}
 const dir=await mkdtemp(join(tmpdir(),'ybs-pr8-df-teacher-')),output=join(dir,'public');let server,browser,page;const errors=[];
 const config={...fixtureConfig,readModelModule:'/assets/fullrev-read-model.mjs'},calls=[];
 try{
  await buildSite({output,config,workerSource:process.env.YBS_WORKER_SOURCE});
  server=createServer(async(req,res)=>{try{
   const path=new URL(req.url,'http://localhost').pathname,file=resolve(output,'.'+path+(path.endsWith('/')?'index.html':''));
   if(!file.startsWith(output+'/'))throw Error('outside');
   const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'};
   const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();page.setDefaultTimeout(6000);
  page.on('pageerror',e=>errors.push(e.message));
  const sdk=`(()=>{
   window.__pr8AuthEvents=[];const observers=new Set(),auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged(fn){observers.add(fn);queueMicrotask(()=>fn(auth.currentUser));return()=>observers.delete(fn);},
    async signInWithPopup(){__pr8AuthEvents.push('login');auth.currentUser={uid:'synthetic-owner',getIdToken:async()=> 'synthetic-owner'};for(const fn of observers)await fn(auth.currentUser);},
    async signOut(){__pr8AuthEvents.push('logout');auth.currentUser=null;for(const fn of observers)await fn(null);}};
   const payload=JSON.stringify({app:'DF-investigation',appVersion:'1.0',version:'A',cls:999,seat:60,log:[],problem:'Synthetic report',exports:[]});
   const db={doc:()=>({get:async()=>({exists:true,data:()=>({ownerUid:'synthetic-owner'})})}),collection(path){
    if(path.endsWith('/roster')){window.__legacyRosterReads=(window.__legacyRosterReads||0)+1;return {get:async()=>({docs:[{data:()=>({cls:701,seat:1})},{data:()=>({cls:701,seat:2})}]})};}
    return {where:()=>({get:async()=>({docs:[{id:'synthetic-student_s1',data:()=>({uid:'synthetic-student',session:1,cls:701,seat:1,schemaVersion:1,encoding:'ascii-json',payload,updatedAt:{toDate:()=>new Date('2026-11-01T00:00:00Z')}})}]})})};}};
   function GoogleAuthProvider(){this.setCustomParameters=()=>{};}
   window.firebase={apps:[],initializeApp(options,name){const app={options,name,auth:()=>auth,firestore:()=>db};firebase.apps.push(app);return app;},auth:{Auth:{Persistence:{SESSION:'session'}},GoogleAuthProvider}};
  })();`;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===base){if(url.pathname==='/assets/legacy-df/config.js')return route.fulfill({contentType:'text/javascript',body:'const YBS_FULLREV_CONFIG='+JSON.stringify({...config,courses:['115-g9']})+';'});return route.continue();}
   if(url.origin==='https://www.gstatic.com')return route.fulfill({contentType:'text/javascript',body:url.pathname.endsWith('firebase-app-compat.js')?sdk:''});
   if(url.origin===config.workerOrigin){
    calls.push({path:url.pathname,body:route.request().postDataJSON(),authorization:route.request().headers().authorization});
    assert.equal(url.pathname,'/df-roster');
    return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':base},body:JSON.stringify({schemaVersion:1,sourceProject:config.firebase.projectId,course:'115-df',members:[{cls:701,seat:1},{cls:701,seat:2}]})});
   }
   return route.abort();
  });
  await page.goto(base+'/115-df/teacher/');await page.getByRole('button',{name:'Google 教師登入',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('cloud-read').disabled);
  await page.locator('#cloud-read').click();await page.waitForFunction(()=>document.getElementById('cloud-status').textContent.includes('已讀取 1'));
  assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('#cloud-roster').innerText(),/701-2/);
  assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>window.__legacyRosterReads),1);assert.equal(await page.evaluate(()=>YBS.fullrev),undefined);
  assert.deepEqual(await page.evaluate(()=>firebase.apps.map(a=>({name:a.name,project:a.options.projectId,domain:a.options.authDomain}))),[{name:'df-teacher',project:'class-score-86020',domain:'class-score-86020.firebaseapp.com'}]);
  await page.locator('#cloud-logout').click();await page.waitForFunction(()=>document.getElementById('cloud-status').textContent==='已登出，記憶體報告已清除。');
  assert.equal(await page.locator('tbody tr').count(),0);assert.equal(await page.evaluate(()=>__pr8AuthEvents.filter(e=>e==='logout').length),1);assert.deepEqual(errors,[]);
 }catch(error){t.diagnostic(JSON.stringify({errors,calls:calls.map(c=>({path:c.path,body:c.body})),auth:page&&await page.evaluate(()=>({events:window.__pr8AuthEvents,apps:firebase.apps.map(a=>({name:a.name,uid:a.auth().currentUser?.uid}))})),body:page&&await page.locator('body').innerText()}));throw error;}finally{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
