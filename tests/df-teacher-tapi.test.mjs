// 執行教師頁實際程式與事件處理器；DOM、API 均為合成資料，禁止外連。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../115-df/teacher/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const responses={
  '200':()=>new Response('{"ok":true}',{status:200}),
  '201':()=>new Response('{"ok":true}',{status:201}),
  '401':()=>new Response('{"ok":true}',{status:401}),
  '500':()=>new Response('{"ok":true}',{status:500}),
  '非 JSON':()=>new Response('<html>synthetic error</html>',{status:200}),
  '網路錯誤':()=>{throw new Error('synthetic network failure');},
};
function setup(response){
  const elements=new Map(), messages=[], requests=[];
  class Element {
    constructor(){this.hidden=false;this.textContent='';this.style={};this.dataset={};this.classList={add(){},remove(){}};}
    set innerHTML(value){
      this.markup=value;
      for(const m of value.matchAll(/id="([^"]+)"/g)) elements.set('#'+m[1],new Element());
      this.buttons=[...value.matchAll(/<button\b([^>]*)>/g)].map(m=>{
        const b=new Element();
        for(const a of m[1].matchAll(/data-([\w-]+)="([^"]*)"/g)) b.dataset[a[1]]=a[2];
        return b;
      });
    }
    get innerHTML(){return this.markup||'';}
    appendChild(){}
    addEventListener(){}
    focus(){}
  }
  const get=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s);};
  const context=vm.createContext({
    document:{querySelector:get,querySelectorAll:s=>s==='#ctl button'?get('#ctl').buttons||[]:[],
      createElement:()=>new Element(),body:{append:n=>messages.push(n.textContent)},addEventListener(){}},
    location:{protocol:'https:',hostname:'synthetic.github.io'},
    DFTeacherCloud(){},confirm:()=>true,prompt:()=>'RESET',
    EventSource:class{addEventListener(){}},setInterval(){},setTimeout(){},
    fetch:async(url,options)=>{
      if(url==='/api/t/info')return new Response('{"urls":["http://synthetic.invalid"]}');
      // 不提供任何實際網路 fallback；非預期路徑直接失敗。
      assert.ok(['/api/t/seat','/api/t/release','/api/t/reset'].includes(url));
      requests.push({url,...options});return response();
    },
  });
  vm.runInContext(scripts,context,{filename:'115-df/teacher/index.html',timeout:1000});
  const evaluate=code=>vm.runInContext(code,context,{timeout:1000});
  return {get,evaluate,messages,requests};
}

for(const [name,response] of Object.entries(responses)){
  const success=name==='200'||name==='201';
  test(`tapi：${name} ${success?'回傳 JSON':'拒絕成功'}`,async()=>{
    const t=setup(response);
    t.evaluate("TOKEN='synthetic-token'");
    const result=t.evaluate("tapi('seat',{k:'A-999-1',action:'free'})");
    if(success)assert.equal((await result).ok,true);
    else await assert.rejects(result);
    assert.equal(t.requests[0].url,'/api/t/seat');
    assert.equal(t.requests[0].method,'POST');
    assert.equal(t.requests[0].headers['Content-Type'],'application/json');
    assert.equal(t.requests[0].headers['x-token'],'synthetic-token');
    assert.deepEqual(JSON.parse(t.requests[0].body),{k:'A-999-1',action:'free'});
  });
  for(const action of ['free','delete','release','reset']){
    test(`實際 ${action} 事件：${name} ${success?'維持原成功行為':'顯示失敗且保留狀態'}`,async()=>{
      const t=setup(response);
      assert.equal(await t.evaluate("goLive('synthetic-token')"),true);
      t.evaluate(`const synthetic=stub({cls:'999',seat:1,lastSeen:0});
        R.set(key(synthetic),synthetic); L.set(key(synthetic),{cur:1,lastSeen:0,idleMs:0});
        detail(synthetic); liveUI();`);
      const before=t.get('#ctl').innerHTML;
      const button=action==='release'?t.get('#ctl').buttons[0]:t.get({free:'#sf',delete:'#sd',reset:'#rst'}[action]);
      // await 真實事件函式也驗證錯誤已處理，不會留下未處理的 rejection。
      await button.onclick();
      assert.equal(t.requests.length,1);
      const request=t.requests[0];
      const body=JSON.parse(request.body);
      if(action==='free'||action==='delete'){
        assert.equal(request.url,'/api/t/seat');
        assert.deepEqual(body,{k:'A-999-1',action});
      }else if(action==='release'){
        assert.equal(request.url,'/api/t/release');
        assert.deepEqual(body,{stage:'b2',on:true});
      }else{
        assert.equal(request.url,'/api/t/reset');
        assert.deepEqual(body,{confirm:'RESET'});
      }
      assert.equal(t.get('#drawer').hidden,success&&action==='delete');
      assert.equal(t.evaluate('R.size'),success&&action==='reset'?0:1);
      assert.equal(t.evaluate('L.size'),success&&action==='reset'?0:1);
      // 公布狀態仍以伺服器快照為準，不因請求結果自行改成成功。
      assert.equal(t.evaluate('REL.b2.all'),false);
      assert.equal(t.get('#ctl').innerHTML,before);
      if(success){
        assert.deepEqual(t.messages,action==='free'?['已釋放，學生可以重新登入']:[]);
      }else{
        assert.equal(t.messages.length,1);
        assert.match(t.messages[0],/失敗/);
        assert.doesNotMatch(t.messages[0],/已釋放|synthetic|token/);
      }
    });
  }
}
