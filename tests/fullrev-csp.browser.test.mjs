import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSite} from '../tools/build-fullrev-site.mjs';
import {config as fixtureConfig} from './fixtures/fullrev.mjs';

test('release CSP permits gapi script, auth iframe and token/Worker fetches offline',async t=>{
 if(workerCISkip){t.skip(workerCISkip);return;}
 assert.ok(workerSource,'本機 CSP 驗收需設定 YBS_WORKER_SOURCE');
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 const config={...fixtureConfig,readModelModule:'/assets/fullrev-read-model.mjs'};
 const dir=await mkdtemp(join(tmpdir(),'ybs-csp-browser-')),output=join(dir,'site');
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await buildSite({output,config,workerSource});
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'}),base='http://127.0.0.1:8765';
 let html;const requests=[];
 // All requests are fulfilled or aborted here; no external service is contacted.
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());requests.push(url.href);
  if(url.origin===base&&request.isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});
  if(url.href==='https://apis.google.com/js/api.js')return route.fulfill({contentType:'text/javascript',body:'window.gapiLoaded=true;'});
  if(url.origin===`https://${config.firebase.projectId}.firebaseapp.com`)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>synthetic auth iframe</title>'});
  if([config.workerOrigin,'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com'].includes(url.origin))return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
  return route.abort();
 });
 const page=await context.newPage();
 for(const path of ['115-g9/u2-05/index.html','115-g9/me/index.html','115-g9/teacher/index.html','115-g9/teacher/report/index.html','115-g9/w01/index.html','115-g9/w30/index.html']){
  // Isolate the built policy from app/redirect behavior while keeping it verbatim.
  html=(await readFile(join(output,path),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<meta\b[^>]*http-equiv="refresh"[^>]*>/gi,'');
  await page.goto(base+'/'+path);
  await page.addScriptTag({url:'https://apis.google.com/js/api.js'});
  assert.equal(await page.evaluate(()=>window.gapiLoaded),true,path);
  const endpoints=[config.workerOrigin,'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com'];
  assert.deepEqual(await page.evaluate(async endpoints=>Promise.all(endpoints.map(async url=>(await fetch(url+'/synthetic')).ok)),endpoints),[true,true,true],path);
  const frameUrl=`https://${config.firebase.projectId}.firebaseapp.com/__/auth/iframe`;
  await page.evaluate(url=>{const f=document.createElement('iframe');f.src=url;document.body.append(f);},frameUrl);
  assert.equal(await page.frameLocator('iframe').locator('title').textContent(),'synthetic auth iframe',path);
  // Unrelated scripts stay blocked by the same policy.
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const s=document.createElement('script');s.src='https://unrelated.invalid/script.js';s.onload=()=>resolve(false);s.onerror=()=>resolve(true);document.head.append(s);})),true,path);
 }
 assert.ok(requests.some(url=>url.endsWith('/__/auth/iframe')));
 assert.ok(!requests.some(url=>url.startsWith('https://unrelated.invalid/')));
});
