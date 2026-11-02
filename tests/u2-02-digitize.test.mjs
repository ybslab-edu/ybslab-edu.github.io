import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../115-g9/u2-02/index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function setup(){
  const context=vm.createContext({SHELL:x=>x,PICK:(r,a)=>a[Math.floor(r()*a.length)],requestAnimationFrame:()=>{},document:{}});
  vm.runInContext(script,context,{timeout:1000});
  return code=>vm.runInContext(code,context,{timeout:5000});
}
// 小型作答區替身：只替代 DOM 和繪圖，實際 view、表單與判題仍使用頁面原碼。
class Stage{
  constructor(){this.nodes=new Map();this.value='';this.isConnected=true;this.width=640;this.height=220;}
  set innerHTML(s){this.nodes.clear();this.insertAdjacentHTML('beforeend',s)}
  insertAdjacentHTML(_,s){for(const m of s.matchAll(/<(canvas|select|input|div|p)\b([^>]*)>/g)){
    const id=m[2].match(/id="([^"]+)"/)?.[1];const n=new Stage();
    if(id)this.nodes.set(id,n);this.lastElementChild=n;
  }}
  querySelector(s){return this.nodes.get(s.slice(1))}
  getContext(){return new Proxy({}, {get:()=>()=>{}})}
}

test('四關、週次、結語與活動登記同步；不使用音訊 API',()=>{
  const run=setup(),cfg=run('APP');assert.equal(cfg.week,4);assert.equal(cfg.termWeek,10);
  assert.equal(cfg.finale,'全部完成！下一站：燈牌只有亮和暗，數字到底怎麼存？');
  assert.deepEqual(Array.from(cfg.rounds,r=>[r.name,r.lv]),[['聲音取樣',1],['影像像素',1],['影片組成',2],['錄滿一整場',2]]);
  assert.doesNotMatch(script,/AudioContext|webkitAudioContext|AudioWorklet|new\s+Audio\b|createOscillator|getUserMedia|speechSynthesis|<audio/i);
  const data=JSON.parse(readFileSync(new URL('../assets/activities.json',import.meta.url),'utf8'));
  assert.deepEqual(data.activities.find(a=>a.course==='115-g9'&&a.week===4).rounds,Array.from(cfg.rounds,r=>r.name));
});

test('所有聲音題皆有最小解；窮舉設定驗證錯誤與比較次數；常數亂數產生有界',()=>{
  const run=setup();run(`
    for(const cycles of [2,3,4])for(const phase of [0,.7,1.4])for(const target of [91,93,95]){
      const i={cycles,phase,target},b=soundBest(i);if(!b)throw Error('無解');let solutions=0;
      for(const rate of SR)for(const levels of QL){const a={rate,levels,compared:2},m=soundMetrics(i,rate,levels);
        const expected=m.score>=target&&m.bytes===b.bytes;
        if((ROUNDS[0].check(i,a)===true)!==expected)throw Error('最小解判定錯誤');
        if(ROUNDS[0].check(i,{...a,compared:1})===true)throw Error('未比較通過');if(expected)solutions++;
      }if(!solutions)throw Error('無解');
    }
    for(const r of ROUNDS)for(const constant of [0,.5,.999999])for(let k=0;k<100;k++)r.gen(()=>constant);
  `);
});

test('影像與影片所有設定有唯一解，錯答及未比較不通過',()=>{
  const run=setup();run(`
    for(const random of [0,.4,.99]){const i=ROUNDS[1].gen(()=>random);let count=0;
      for(const res of RES)for(const colors of COLORS){const a={res,colors,compared:2};const ok=ROUNDS[1].check(i,a)===true;
        if(ok!==(res===i.minRes&&colors===i.minColors))throw Error('像素判定');if(ok)count++;
        if(ROUNDS[1].check(i,{...a,compared:1})===true)throw Error('未比較');
      }if(count!==1)throw Error('影像解數');
    }
    for(const target of [12,24,30])for(const seconds of [2,3,5])for(const fps of FPS){
      const i={target,seconds},a={fps,one:fps,total:fps*seconds,parts:'1',compared:2};
      if((ROUNDS[2].check(i,a)===true)!==(fps===target))throw Error('影片判定');
      for(const wrong of [{one:null},{total:a.total+1},{parts:'0'},{parts:'2'},{compared:1}])
        if(ROUNDS[2].check(i,{...a,...wrong})===true)throw Error('影片錯答通過');
    }
  `);
});

test('第四關三組獨立驗算及所有容量長度：不足、次佳、縮短時間、錯數字皆失敗',()=>{
  const run=setup();
  for(const [cap,minutes,q,need,max] of [[16,90,0,9000,160],[32,90,1,22500,128],[64,150,2,60000,160]]){
    assert.equal(run(`ROUNDS[3].check({cap:${cap},minutes:${minutes}},{q:${q},duration:${minutes},need:${need},max:${max}})`),true);
  }
  run(`for(const cap of [16,32,64])for(const minutes of [60,90,120,150]){
    const i={cap,minutes};let count=0;
    for(let q=0;q<3;q++){const a={q,duration:minutes,need:minutes*QUALITY[q].rate,max:Math.floor(cap*1000/QUALITY[q].rate)};
      const expected=QUALITY[q].rate*minutes<=cap*1000&&(q===2||QUALITY[q+1].rate*minutes>cap*1000);
      if((ROUNDS[3].check(i,a)===true)!==expected)throw Error('容量判定');if(expected)count++;
      for(const wrong of [{need:a.need+1},{need:null},{max:a.max+1},{max:null},{duration:minutes-15},{duration:minutes+15}])
        if(ROUNDS[3].check(i,{...a,...wrong})===true)throw Error('錯誤計算通過');
    }if(count!==1)throw Error('沒有唯一最佳畫質');
  }
  for(const text of ['', '24abc','2.4','-1','Infinity','1e2','9007199254740992'])if(integer(text)!==null)throw Error('整數驗證');`);
});

test('四關實際 view：初始不可送出、教師填答可過、輸入後即時更新',()=>{
  const run=setup();run('globalThis.stages=[]');
  for(let ri=0;ri<4;ri++){
    const stage=new Stage();let changes=0;
    const round=run('ROUNDS')[ri],i=round.gen(()=>.5),handle=round.view(i,stage,{changed:()=>changes++});
    assert.equal(handle.ready(),false);assert.notEqual(round.check(i,handle.get()),true);
    handle.fill();assert.equal(handle.ready(),true);assert.equal(round.check(i,handle.get()),true);
    if(ri===0){stage.querySelector('#sample-rate').value='8';stage.querySelector('#sample-rate').onchange();assert.ok(changes>0);assert.match(stage.querySelector('#sample-stat').textContent,/接近度/)}
    if(ri===1){stage.querySelector('#image-res').value='16';stage.querySelector('#image-res').onchange();assert.ok(changes>0);assert.match(stage.querySelector('#image-stat').textContent,/資料量/)}
  }
});

test('沿用真實 shell 判題流程：錯答重設、每關兩組不同資料、四關完整結束',()=>{
  const run=setup(),shell=readFileSync(new URL('../assets/shell.js',import.meta.url),'utf8');
  const judging=shell.slice(shell.indexOf('const shellCreateJudging ='),shell.indexOf('// 保存既有進度'));
  // 取用未修改的共用判題函式，DOM 呈現與儲存以合成物件隔離。
  const create=run(judging+'\nshellCreateJudging'),rounds=run('ROUNDS');
  const verdict={querySelector:()=>({textContent:''}),innerHTML:'',hidden:true},done=new Set();let uploads=0,saves=0,draw=0;
  const state={cfg:{finale:'全部完成！下一站：燈牌只有亮和暗，數字到底怎麼存？'},
    $:id=>id==='verdict'?verdict:null,esc:String,R:rounds,done,teacher:false,level:1,streak:0,
    prog:{mask:0,time:0},attempt(){},renderStreak(){},renderRounds(){},saveProg(){saves++},upload(){uploads++},
    fresh(){const random=draw++%2?0.99999:0;this.inst=rounds[this.ri].gen(()=>random);this.handle=rounds[this.ri].view(this.inst,new Stage(),{changed(){}})},
  };
  const {submit}=create(state);
  for(let ri=0;ri<4;ri++){
    state.ri=ri;state.level=rounds[ri].lv;state.streak=0;state.fresh();
    assert.equal(state.handle.ready(),false);submit();assert.equal(state.streak,0);
    state.handle.fill();const first=JSON.stringify(state.inst);submit();
    assert.equal(state.streak,1);assert.equal(done.has(ri),false);assert.notEqual(JSON.stringify(state.inst),first);
    // 新題未作答就送出必須歸零，不能沿用上一題的設定。
    submit();assert.equal(state.streak,0);assert.equal(done.has(ri),false);
    state.handle.fill();submit();assert.equal(state.streak,1);
    state.handle.fill();submit();assert.equal(done.has(ri),true);
  }
  assert.equal(state.prog.mask,15);assert.equal(uploads,4);assert.equal(saves,4);
  assert.match(verdict.innerHTML,/全部完成！下一站：燈牌只有亮和暗/);
});
