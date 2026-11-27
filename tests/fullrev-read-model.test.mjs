import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadModel} from '../assets/fullrev-read-model.mjs';

const project='synthetic-read-model',course='115-g9',workerOrigin='https://synthetic-read-model.workers.dev';
const scope={course,classKey:'c901'},controlVersions={gateVersion:1,classGateVersion:1};
function harness(fetcher=async()=>Response.json({state:'confirmed'})) {
 const requests=[],tokens=[];
 const user={getIdToken:async()=>{tokens.push('synthetic-token');return 'synthetic-token';}};
 const auth={currentUser:user},app={options:{projectId:project}};
 const model=createReadModel({session:async()=>({app,auth}),project,course,workerOrigin,
  fetcher:async(url,init)=>{requests.push({url,init});return fetcher(url,init);}});
 return {model,requests,tokens,user,auth,app};
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('所有端點使用當前 token、受控 POST 與原有本文格式，成功資料原樣回傳',async()=>{
 const data={state:'confirmed',records:[]},h=harness(async()=>Response.json(data));
 const calls=[
  ['roster',undefined,'df-roster',{course}],
  ['dfPreview',undefined,'df-preview',{course}],
  ['context',{...scope,activity:5,round:0},'context',{...scope,activity:5,round:0}],
  ['controls',scope,'controls',scope],
  ['page',{...scope,controlVersions},'progress',{...scope,controlVersions,cursor:null}],
  ['page',{...scope,controlVersions,cursor:'synthetic-cursor',activity:5},'progress',{...scope,controlVersions,cursor:'synthetic-cursor',activity:5}],
  ['dfContent',scope,'df-content',scope]
 ];
 for(const [method,input,path,body] of calls){
  assert.deepEqual(await h.model[method](input),data);
  const {url,init}=h.requests.at(-1);
  assert.equal(url.href,workerOrigin+'/'+path);
  assert.deepEqual(init,{method:'POST',cache:'no-store',redirect:'error',
   headers:{'content-type':'application/json',authorization:'Bearer synthetic-token'},body:JSON.stringify(body)});
 }
 assert.equal(h.tokens.length,calls.length);
});

for(const status of [200,400,429,503])for(const [label,body] of [
 ['HTML','<!doctype html><title>synthetic unavailable</title>'],['empty',''],['whitespace',' \n '],['malformed','{"error":']
])test(`${status} ${label} 本文不洩漏解析例外`,async()=>{
 const h=harness(async()=>new Response(body,{status}));
 await assert.rejects(h.model.controls(scope),{code:status===429?'retry-later':'read-model-pending'});
 assert.equal(h.requests.length,1);
});

test('204 無本文成功回應仍為 read-model-pending',async()=>{
 const h=harness(async()=>new Response(null,{status:204}));
 await assert.rejects(h.model.controls(scope),{code:'read-model-pending'});
});

for(const status of [400,429,503])for(const data of [null,{},[],false,0,'synthetic'])
test(`${status} JSON ${JSON.stringify(data)} 保留 HTTP 錯誤分類`,async()=>{
 const h=harness(async()=>Response.json(data,{status}));
 await assert.rejects(h.model.controls(scope),{code:status===429?'retry-later':'read-model-pending'});
});

test('control_changed 優先於 429，其餘非成功狀態維持既有分類',async()=>{
 for(const status of [400,409,429,503]){
  const h=harness(async()=>Response.json({error:'control_changed'},{status}));
  await assert.rejects(h.model.controls(scope),{code:'control-changed'});
 }
 for(const status of [401,403,404,500,503]){
  const h=harness(async()=>Response.json({error:'synthetic_error'},{status}));
  await assert.rejects(h.model.controls(scope),{code:'read-model-pending'});
 }
});

test('成功 JSON 不受 Content-Type 或新增 schema 限制',async()=>{
 for(const data of [null,[],false,0,'synthetic',{error:'control_changed'}]){
  const h=harness(async()=>new Response(JSON.stringify(data),{headers:{'content-type':'text/plain'}}));
  assert.deepEqual(await h.model.controls(scope),data);
 }
});

test('網路與本文讀取失敗正規化，不自動重試',async()=>{
 const h=harness(async()=>{throw new TypeError('synthetic offline');});
 await assert.rejects(h.model.controls(scope),{code:'read-model-pending'});
 assert.equal(h.requests.length,1);
 for(const status of [200,429,503]){
  const stream=new ReadableStream({start(controller){controller.error(new TypeError('synthetic body failure'));}});
  const h=harness(async()=>new Response(stream,{status}));
  await assert.rejects(h.model.controls(scope),{code:status===429?'retry-later':'read-model-pending'});
  assert.equal(h.requests.length,1);
 }
});

test('設定、課程及登入檢查仍在網路請求之前拒絕',async()=>{
 for(const origin of ['http://synthetic.workers.dev','https://example.com','https://synthetic.workers.dev/'])
  assert.throws(()=>createReadModel({workerOrigin:origin}),{code:'configuration-pending'});
 const h=harness();
 for(const method of ['context','controls','page','dfContent'])
  assert.throws(()=>h.model[method]({...scope,course:'115-df'}),{code:'invalid-course'});
 h.auth.currentUser=null;
 await assert.rejects(h.model.roster(),{code:'login-required'});
 h.auth.currentUser=h.user;h.app.options.projectId='synthetic-other-project';
 await assert.rejects(h.model.roster(),{code:'login-required'});
 assert.equal(h.requests.length,0);assert.equal(h.tokens.length,0);
});

test('等待 token 期間身份切換，不送出請求',async()=>{
 const h=harness(),started=deferred(),token=deferred();
 h.user.getIdToken=()=>{started.resolve();return token.promise;};
 const request=h.model.controls(scope);await started.promise;
 h.auth.currentUser={...h.user};token.resolve('synthetic-late-token');
 await assert.rejects(request,{code:'identity-changed'});
 assert.equal(h.requests.length,0);
});

test('等待回應期間登出，優先拒絕身份變更且不讀本文',async()=>{
 const started=deferred(),response=deferred(),h=harness(()=>{started.resolve();return response.promise;});
 const request=h.model.controls(scope);await started.promise;
 h.auth.currentUser=null;
 response.resolve({ok:false,status:429,json(){assert.fail('身份變更後不應讀取本文');}});
 await assert.rejects(request,{code:'identity-changed'});
});

for(const status of [200,429,503])for(const malformed of [false,true])
test(`解析 ${status} ${malformed?'損壞':'正常'} 本文期間身份切換優先於資料及 HTTP 分類`,async()=>{
 const started=deferred(),body=deferred();
 const h=harness(async()=>({ok:status===200,status,json:async()=>{
  started.resolve();await body.promise;
  if(malformed)throw new SyntaxError('synthetic malformed JSON');
  return {error:'control_changed'};
 }}));
 const request=h.model.controls(scope);await started.promise;
 h.auth.currentUser=status===200?null:{...h.user};body.resolve();
 await assert.rejects(request,{code:'identity-changed'});
});
