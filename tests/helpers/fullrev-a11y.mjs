import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
export const samples=[
 {kind:'choice',activity:16,round:0,path:'u5-01'},
 {kind:'number',activity:5,round:3,path:'u2-03'},
 {kind:'order',activity:11,round:0,path:'u4-02'},
 {kind:'sheet',activity:8,round:0,path:'u2-06'}
];
export async function openActivity(t,sample,{width=360,height=800}={}){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
 const errors=[],external=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  // 網路邊界完全攔截；只提供 repo 的程式與合成資料。
  if(url.origin!==base){external.push(url.origin);return route.abort();}
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><script src="/assets/xp.js"></script><body></body></html>'});
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-u206-sheet)?\.mjs)$/.test(url.pathname))return route.abort();
  const baseline=process.env.YBS_A11Y_BASELINE_DIR;
  const source=baseline&&['/assets/fullrev-shell.mjs','/assets/fullrev-activities.mjs','/assets/shell.css','/assets/fullrev-shell.css','/assets/fullrev-volunteer-sheet.css'].includes(url.pathname)
   ?new URL(url.pathname.split('/').at(-1),'file://'+baseline.replace(/\/$/,'')+'/'):new URL('../..'+url.pathname,import.meta.url);
  let body=await readFile(source,'utf8');
  if(url.pathname==='/assets/shell.css')body=body.replace(/^@import.*$/gm,'');
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body});
 });
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 t.after(()=>{assert.deepEqual(errors,[],'無瀏覽器錯誤');assert.deepEqual(external,[],'無對外連線');});
 await page.goto(base+'/115-g9/'+sample.path+'/');
 await page.evaluate(async sample=>{
  const {harness,response,snapshot,record,opened}=await import('/tests/fixtures/fullrev.mjs');
  const {sheetQuestion,syntheticSolution}=await import('/tests/fixtures/fullrev-u206-sheet.mjs');
  const {MANAGED_ACTIVITIES,activityConfig}=await import('/assets/fullrev-activities.mjs');
  const {mountActivity}=await import('/assets/fullrev-ui.mjs');
  const a=MANAGED_ACTIVITIES.find(a=>a.activity===sample.activity);
  window.ACTIVITIES=[{...a,course:'115-g9',week:a.activity,codes:[],openedAt:opened}];window.isActivityOpen=()=>true;
  const app=window.app=await harness();app.state.owner=false;
  const result=r=>record(r,{activity:a.activity,unit:a.unit});
  app.state.snapshot=snapshot(Array.from({length:sample.round},(_,r)=>result(r)));
  sessionStorage.setItem(`ybs:fullrev:round:${app.client.project}:115-g9:${a.activity}:synthetic-student`,String(sample.round));
  const question=slot=>sample.kind==='sheet'?sheetQuestion(sample.round,slot):{
   slot,title:'合成鍵盤驗收',instruction:'依題面完成這組挑戰。',
   type:sample.kind==='number'?'minimum-bits-v1':'finite-bank-v1',
   data:sample.kind==='number'?{n:slot?7:15}:sample.kind==='choice'
    ?{mode:'classify',rows:[`第 ${slot+1} 組：依規則分類甲`,`第 ${slot+1} 組：依規則分類乙`],options:['類別甲','類別乙']}
    :{mode:'order',cards:[`第 ${slot+1} 組封包乙`,`第 ${slot+1} 組封包甲`,`第 ${slot+1} 組封包丙`]}
  };
  const answer=slot=>sample.kind==='number'?{b:slot?3:4,m:slot?7:15}:sample.kind==='choice'?[0,1]:[1,0,2];
  app.state.fetcher=async(url,init)=>{
   const body=JSON.parse(init.body),slot=body.slot||0,q=question(slot);
   if(!url.endsWith('/answer'))return Response.json(response(0,{question:question(0)}));
   // 合成判分實際核對答案，錯答不得通過。工作單核對完整操作與狀態。
   const correct=JSON.stringify(body.answer)===JSON.stringify(sample.kind==='sheet'?syntheticSolution(q):answer(slot));
   if(!correct)return Response.json(response(slot,{nextSeq:body.seq+1,question:q,correct:false,feedback:'請重新核對你的答案。'}));
   if(slot===0)return Response.json(response(1,{nextSeq:body.seq+1,question:question(1),correct:true}));
   app.state.snapshot=snapshot([...app.state.snapshot.records,result(sample.round)]);
   return Response.json({completed:true,resultId:result(sample.round).resultId});
  };
  await mountActivity({client:Promise.resolve(app.client),cfg:activityConfig({course:'115-g9',week:a.activity,title:a.title})});
  await app.login();
 },sample);
 await page.locator('#g-isme').waitFor({state:'visible'});await activate(page,'#g-isme');
 await page.locator('#stage [data-question-type],#stage[data-question-type]').waitFor();
 return page;
}
// 操作一律以 Tab 尋找控制，再送鍵；不使用 click/fill/selectOption/focus 或 DOM 代填。
export async function tabTo(page,selector){
 const target=typeof selector==='string'?page.locator(selector):selector;
 await target.waitFor({state:'visible'});
 for(let i=0;i<160;i++){
  if(await target.evaluate(e=>e===document.activeElement))return target;
  await page.keyboard.press('Tab');
 }
 assert.fail('Tab 無法到達 '+(typeof selector==='string'?selector:await target.getAttribute('id')));
}
export async function activate(page,selector){await tabTo(page,selector);await page.keyboard.press('Enter');}
export async function typeInto(page,selector,value){await tabTo(page,selector);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(String(value));}
export async function choose(page,selector,index){
 await tabTo(page,selector);await page.keyboard.press('Home');
 for(let k=0;k<=index;k++)await page.keyboard.press('ArrowDown');
 await page.keyboard.press('Tab');
}
export async function fillAnswers(page,sample,{slot=0,wrong=false}={}){
 if(sample.kind==='choice'){
  await activate(page,`[data-row="0"][data-choice="${wrong?1:0}"]`);
  // 訂正時第二列原答案仍在；按下已選項會取消選擇。
  if(await page.locator('[data-row="1"][data-choice="1"]').getAttribute('aria-pressed')!=='true')await activate(page,'[data-row="1"][data-choice="1"]');
 }else if(sample.kind==='number'){
  await typeInto(page,'[data-answer-field="b"]',wrong?2:slot?3:4);
  await typeInto(page,'[data-answer-field="m"]',slot?7:15);
 }else if(sample.kind==='order'){
  while(await page.locator('[data-slot-index]').count())await activate(page,page.locator('[data-slot-index]').first());
  for(const index of wrong?[0,1,2]:[1,0,2])await activate(page,`[data-pool-index="${index}"]`);
 }else{
  const fields=page.locator('#stage select');
  await choose(page,fields.nth(0),wrong?0:1);await choose(page,fields.nth(1),0);
  for(let k=0;k<4;k++)await choose(page,fields.nth(k+2),k);
 }
}
