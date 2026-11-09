// 真實 DOM + 動態核心載入；本機 UTF-8 伺服器與合成 Firebase，不接外部服務。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,base;
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"></head><body>
<script>
const TEACHER={remembered:()=>false,remember(){}};
const ACTIVITIES=[1,2].map(week=>({course:'115-g9',week,codes:['資D-IV-1'],rounds:['甲','乙','丙','丁']}));
const activityOpenAt=()=>Date.now()-864e5,isActivityOpen=()=>true;
let records=[0,1,2,3].map(round=>({uid:'synthetic-one',activity:1,round,passedAt:Date.now()}));
let profile=null,status,login,resolveRead;
const waiting=new Promise(resolve=>resolveRead=resolve);
let loaded=false;
const auth={get currentUser(){return profile}};
const db={collection:path=>{if(path!=='ybsCourses/115-g9/attempts')throw Error('unexpected path');return {where:(field,op,uid)=>{
  if(field!=='uid'||op!=='=='||uid!==profile.uid)throw Error('unexpected query');
  return {get:async()=>{if(!loaded)await waiting;return {metadata:{fromCache:false},docs:records.map(data=>({data:()=>data}))}}}
}}}};
const YBS={enabled:()=>true,profile:()=>profile,
  button:(el,cb)=>{login=cb;el.innerHTML='<button id="mock-login">登入合成帳號</button>';el.querySelector('button').onclick=()=>{profile={uid:'synthetic-one',email:'synthetic@example.invalid'};cb(profile)}},
  whoami:async()=>({ok:true,student:{cls:999,seat:1}}),status:cb=>{status=cb},flush(){},guest(){},logout:()=>{profile=null},
  submit:item=>{window.submissions.push(item)},firebaseSession:async()=>({db,auth})};
window.submissions=[];
window.confirmCloud=()=>{loaded=true;resolveRead();status('ok')};
window.uploadCloud=()=>{for(const item of submissions){if(!records.some(r=>r.activity===item.activity&&r.round===item.round))records.push({uid:profile.uid,activity:item.activity,round:item.round,passedAt:Date.now()})}status('ok')};
localStorage.setItem('it9:w1:999-1',JSON.stringify({mask:15,tries:[2,2,2,2],time:1}));
localStorage.setItem('ybs:xp:115-g9:seat:999-1',JSON.stringify({1:{passes:{0:{passedAt:Date.now()}}}}));
localStorage.setItem('ybs:xp:115-g9:uid:synthetic-one',JSON.stringify({2:{passes:{0:{passedAt:Date.now()}}}}));
</script>
<script src="/assets/shell.js"></script><script>let n=0;const APP=SHELL({course:'115-g9',week:2,title:'合成手機標題列與成長紀錄',rounds:[0,1,2,3].map(i=>({name:'合成關卡'+i,lv:1,now:'目前',goal:'目標',gen:()=>({n:++n}),view:()=>({get:()=>null}),check:()=>true}))});</script></body></html>`;
before(async()=>{
  // 比照 activity-header.browser：readFile 以原始位元組送出資源；HTML 明確宣告 UTF-8。
  server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/115-g9/u2-03/')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
    if(!['/assets/shell.js','/assets/xp.js','/assets/shell.css'].includes(path))return res.writeHead(404).end();
    try{res.writeHead(200,{'Content-Type':(path.endsWith('.css')?'text/css':'text/javascript')+'; charset=utf-8'});res.end(await readFile(new URL('..'+path,import.meta.url)))}
    catch{res.end()}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
for(const [width,reduced,dark] of [[1440,false,false],[390,false,true],[320,true,true]])for(const account of [true,false]){
  test(`${account?'帳號雲端 XP':'班座登入提示'}：${width}px、減少動態 ${reduced}、深色 ${dark}`,async()=>{
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference',colorScheme:dark?'dark':'light'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
      await page.goto(base+'/115-g9/u2-03/');
      await page.waitForFunction(()=>typeof YBSXP!=='undefined');
      assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
      if(account){
        await page.click('#mock-login');
        await page.locator('#g-isme').waitFor({state:'visible'});
        assert.equal(await page.locator('#g-whotext').textContent(),'你是 999 班 1 號，對嗎？');
        await page.click('#g-isme');
        assert.equal(await page.locator('#xp-total').textContent(),'載入中…');
        assert.equal(await page.locator('#xp-progress').isVisible(),false);
        await page.evaluate(()=>confirmCloud());
        await page.waitForFunction(()=>document.getElementById('xp-total').textContent==='80 XP');
        assert.equal(await page.locator('#xp-link').isVisible(),true);
        assert.equal(await page.locator('#xp-progress').isVisible(),true);
        assert.equal(await page.locator('#xp-link').getAttribute('aria-disabled'),null);
        assert.equal(await page.locator('#xp-link').getAttribute('href'),'../me/');
        assert.equal(await page.locator('#xp-link').getAttribute('tabindex'),null);
      }else{
        await page.click('#g-manual');
        await page.fill('#in-cls','999');await page.fill('#in-seat','1');
        await page.click('#g-next');
        assert.equal(await page.locator('#g-confirm').textContent(),'你是 999 班 1 號，對嗎？');
        await page.click('#g-go');
        assert.equal(await page.locator('#xp-link').isVisible(),false);
        assert.equal(await page.locator('#xp-progress').isVisible(),false);
        assert.equal(await page.locator('#xp-login-hint').isVisible(),true);
        assert.equal(await page.locator('#xp-login-hint').textContent(),'用帳號登入就能累積等級');
      }
      for(let i=0;i<4;i++){
        await page.evaluate(i=>{APP.load(i);document.getElementById('b-send').click();document.getElementById('b-send').click()},i);
        if(account){
          assert.equal(await page.locator('#xp-total').textContent(),(80+i*15)+' XP','未確認的本機過關不加 XP');
          assert.match(await page.locator('#verdict').textContent(),/XP 待雲端紀錄確認/);
          await page.evaluate(()=>uploadCloud());
          await page.waitForFunction(expected=>document.getElementById('xp-total').textContent===expected,(i===3?160:95+i*15)+' XP');
        }else assert.doesNotMatch(await page.locator('#verdict').textContent(),/XP|升級/);
      }
      if(account){
        assert.equal(await page.locator('#xp-total').textContent(),'160 XP');
        assert.match(await page.locator('#verdict').textContent(),/\+10 過關、\+5 準時、\+20 全過/);
        assert.match(await page.locator('.xp-title-card').textContent(),/升級！Lv 2編碼學徒/);
        assert.equal(await page.locator('.xp-title-card').evaluate(el=>getComputedStyle(el).animationName),reduced?'none':'xp-arrive');
      }
      assert.equal(await page.evaluate(()=>localStorage.getItem('ybs:xp:115-g9:seat:999-1')),null);
      assert.deepEqual(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('it9:w2:999-1')))).then(keys=>keys.sort()),['mask','time','tries']);
      const layout=await page.locator('header.top').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));assert.ok(layout.scroll<=layout.width+1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await page.locator('#score').count(),0);assert.deepEqual(errors,[]);
    }finally{await page.close()}
  });
}

test('登入還原雲端綠勾並保存，只增不減；重新整理及重做不再上傳',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  await page.goto(base+'/115-g9/u2-03/');
  await page.evaluate(()=>{
    localStorage.clear();
    records=[{uid:'synthetic-one',activity:2,round:2,passedAt:Date.now()}];
  });
  await page.click('#mock-login');await page.click('#g-isme');
  assert.equal(await page.locator('#rounds button.passed').count(),0);
  await page.evaluate(()=>confirmCloud());
  await page.waitForFunction(()=>document.querySelectorAll('#rounds button.passed').length===1);
  assert.match(await page.locator('#rounds button[data-i="2"]').innerText(),/✓/);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('it9:w2:999-1')).mask),4);
  await page.evaluate(()=>{APP.load(2);document.getElementById('b-send').click();document.getElementById('b-send').click()});
  assert.equal(await page.evaluate(()=>submissions.length),0);
  await page.evaluate(()=>{records=[];status('ok')});
  await page.waitForFunction(()=>document.getElementById('xp-total').textContent==='0 XP');
  assert.equal(await page.locator('#rounds button.passed').count(),1);
  await page.reload();await page.click('#mock-login');await page.click('#g-isme');
  assert.match(await page.locator('#rounds button[data-i="2"]').innerText(),/✓/);
  await page.evaluate(()=>{records=[{uid:'synthetic-one',activity:2,round:0}];confirmCloud()});
  await page.waitForFunction(()=>document.querySelectorAll('#rounds button.passed').length===2);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('it9:w2:999-1')).mask),5);
});

test('雲端讀取未完成就換人登入，舊帳號紀錄不會套到新帳號',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  await page.goto(base+'/115-g9/u2-03/');
  await page.evaluate(()=>{
    localStorage.clear();
    db.collection=()=>({where:(field,op,uid)=>({get:async()=>{
      await waiting;
      return {metadata:{fromCache:false},docs:[{data:()=>({uid,activity:2,round:uid==='synthetic-one'?0:3})}]};
    }})});
  });
  await page.click('#mock-login');await page.click('#g-isme');
  await page.click('#b-swap');
  await page.evaluate(()=>{
    profile={uid:'synthetic-two',email:'synthetic-two@example.invalid'};
    YBS.whoami=async()=>({ok:true,student:{cls:999,seat:2}});
    login(profile);
  });
  await page.click('#g-isme');await page.evaluate(()=>confirmCloud());
  await page.waitForFunction(()=>document.querySelectorAll('#rounds button.passed').length===1);
  assert.match(await page.locator('#rounds button[data-i="3"]').innerText(),/✓/);
  assert.doesNotMatch(await page.locator('#rounds button[data-i="0"]').innerText(),/✓/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('it9:w2:999-1')),null);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('it9:w2:999-2')).mask),8);
});
