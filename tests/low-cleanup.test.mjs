import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('assets/shell.js');
const df=read('115-df/a/index.html');
const map=read('map/index.html');
const run=(source,context={})=>vm.runInNewContext(source,context,{timeout:1000});

function activity(){
  const html=read('115-g9/u1-01/index.html');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const context=vm.createContext({});
  vm.runInContext(shell.slice(shell.indexOf('// 常用小工具'))+'\nconst SHELL=cfg=>cfg;\n'+scripts.join('\n'),context);
  return context;
}

test('分類產題：一般亂數逐題等同原抽樣、答案有解且拒絕錯答',()=>{
  const c=activity();
  for(let seed=1;seed<=300;seed++){
    c.seed=seed;
    assert.equal(vm.runInContext(`(()=>{
      const random=()=>{let s=seed;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296}};
      return [[0,DEV,2,4],[2,NEWDEV,2,4],[3,SYM,1,3]].every(([i,items,k,n])=>{
        const rnd=random();let p,attempt=0;
        do{p=SAMPLE(rnd,items,6);attempt++}while(!allIn(p,k,n)&&attempt<128);
        if(!allIn(p,k,n))throw Error('一般亂數意外到上限');
        const inst=ROUNDS[i].gen(random()),answer=inst.items.map(x=>x[k]),wrong=[...answer];
        wrong[0]=(wrong[0]+1)%n;
        return JSON.stringify(inst.items)===JSON.stringify(p) && ROUNDS[i].check(inst,answer)===true && ROUNDS[i].check(inst,wrong)!==true;
      });
    })()`,c,{timeout:1000}),true,`seed ${seed}`);
  }
});

test('分類產題：持續缺類別時最多重抽 128 次，後備題目不重複且可解',()=>{
  const c=activity();
  for(const value of [0,0.5,0.999999]){
    c.value=value;
    assert.equal(vm.runInContext(`(()=>{
      return [[0,DEV,2,4],[2,NEWDEV,2,4],[3,SYM,1,3]].every(([i,items,k,n])=>{
        let calls=0;const rnd=()=>{if(++calls>128*(items.length-1))throw Error('超過抽樣上限');return value};
        const inst=ROUNDS[i].gen(rnd);
        const wrong=inst.items.map(x=>(x[k]+1)%n);
        return inst.items.length===6 && new Set(inst.items).size===6 && inst.items.every(x=>items.includes(x)) && allIn(inst.items,k,n)
          && ROUNDS[i].check(inst,inst.items.map(x=>x[k]))===true && ROUNDS[i].check(inst,wrong)!==true;
      });
    })()`,c,{timeout:1000}),true);
  }
  // 人為讓 SAMPLE 永遠漏類別，保證走到後備路徑並精確驗證上限。
  const forced=vm.createContext({});
  const helper=read('115-g9/u1-01/index.html').match(/function sampleAll[\s\S]*?\n}/)[0];
  vm.runInContext(`let calls=0;const allIn=p=>new Set(p.map(x=>x[1])).size===3;
    const SAMPLE=(rnd,items)=>{calls++;return items.filter(x=>x[1]!==2).slice(0,6)};
    ${helper}
    const items=Array.from({length:9},(_,i)=>[i,Math.floor(i/3)]);
    const result=sampleAll(()=>0,items,1,3);`,forced);
  assert.equal(vm.runInContext('calls===128 && result.length===6 && allIn(result)',forced),true);
});

test('地圖：畸形 hash 不拋例外，合法百分比編碼仍可解碼',()=>{
  const source=map.slice(map.indexOf('const h='),map.indexOf('/* 等高線底圖'));
  for(const hash of ['#%','#%E0%A4%A','#%ZZ','#%FF','#S-IV-2','#%53-IV-2']){
    const opened=[];
    assert.doesNotThrow(()=>run(source,{location:{hash},open:(...args)=>opened.push(args)}));
    assert.deepEqual(opened,hash.includes('IV')?[['資S-IV-2',true]]:[]);
  }
});

test('地圖：儲存的 view 僅接受 radial／lines，非法切換不改畫面',()=>{
  const source=map.slice(map.indexOf('const savedView='),map.indexOf('const lvOf='));
  for(const saved of [null,'','bad','toString','radial','lines'])for(const width of [500,1000]){
    assert.equal(run(source+'\nview',{pref:()=>saved,innerWidth:width}),['radial','lines'].includes(saved)?saved:(width>=760?'radial':'lines'));
  }
  const setView=map.slice(map.indexOf('function setView('),map.indexOf('function setCur('));
  assert.equal(run(`let view='lines';${setView};setView('bad');view`,{keep:()=>assert.fail('非法值不應儲存'),$:()=>assert.fail('非法值不應更新畫面')}),'lines');
});

function formHandler(source,start,end,inputs,extra={}){
  let handler;
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,{value:inputs[id]??'',addEventListener:(_event,fn)=>{handler=fn}});
    return elements.get(id);
  };
  run(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),{$,...extra});
  handler({preventDefault(){}});
}

test('專題登入：班級 100–9999、座號 1–60，保留全形／前零及教師解答入口',()=>{
  for(const [cls,seat,ans,ok] of [
    ['100','1',false,true],['999','60',false,true],['７０１','０１',false,true],['701','059',false,true],
    ['099','1',false,false],['1000','1',false,true],['10000','1',false,false],['701','0',false,false],['701','61',false,false],
    ['777','77',false,false],['777','77',true,true],['701','77',true,false],['701','1.5',false,false]
  ]){
    let started=false;
    formHandler(df,"$('#lf').addEventListener('submit'","  $('#imp').addEventListener",{'#lf-cls':cls,'#lf-seat':seat},{ANS:ans,toast(){},startAs(){started=true}});
    assert.equal(started,ok,`${cls}/${seat}, ANS=${ans}`);
  }
});

test('專題留言：座號 1–60，保留正規化與原本留言判定',()=>{
  const start="$('#cf').addEventListener('submit'";
  for(const [seat,ok] of [['1',true],['60',true],['０２',true],['0',false],['61',false],['99',false],['-1',false],['1.5',false]]){
    const S={seat:'30',gallery:{comments:[]}};
    formHandler(df,start,"  $('#next').onclick",{'#c-seat':seat,'#c-tx':'合成留言內容，提出支持證據。','#c-ev':'E01','#c-st':'我同意'},
      {S,now:()=>123,toast(){},log(){},save(){},pGallery(){}});
    assert.equal(S.gallery.comments.length,ok?1:0,seat);
  }
});

test('外框名單：僅合法班座可進入確認，異常資料改手動填寫',async()=>{
  const source=shell.slice(shell.indexOf('  function showLogin()'),shell.indexOf("  $('g-notme').onclick"));
  for(const [cls,seat,ok] of [[100,1,true],[999,60,true],['701','01',true],[99,1,false],[1000,1,false],[701,0,false],[701,61,false],[701,1.5,false],['701x',1,false],[701,null,false]]){
    const elements=new Map();let login;
    const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,value:'',focus(){}});return elements.get(id)};
    run(source+'\nshowLogin();',{$,YBS:{button:(_el,fn)=>{login=fn},whoami:async()=>({ok:true,student:{cls,seat}})},sessionStorage:{getItem:()=>null}});
    await login({email:'synthetic@example.invalid'});
    assert.equal($('g-whobtns').hidden,!ok,`${cls}/${seat}`);
    assert.equal($('g-form').hidden,ok,`${cls}/${seat}`);
  }
});
