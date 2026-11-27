// 實際頁面 + 共用 shell，只有 DOM/儲存是替身；不載入登入或網路。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {Element} from './fixtures/activity-dom.mjs';
// 學期週次以台灣日期為準，避免主機時區的日光節約時間影響日期差。
process.env.TZ='Asia/Taipei';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registrySource=read('assets/activities.js');
const registry=vm.runInNewContext(registrySource+'\n;({activities:ACTIVITIES,validateActivities})');
const syntheticActivity=()=>({course:'synthetic',week:1,title:'合成活動',track:'必修',date:'2026-09-07',
  href:'synthetic/a/',codes:[],rounds:['合成關卡'],node:'合成節點',topic:'合成主題',why:'合成動機',because:'合成發展',so:'合成綜合'});
test('正式活動登記全數通過校驗，課程與活動序號索引沒有遺失資料',()=>{
  assert.equal(registry.activities.length,31);
  assert.doesNotThrow(()=>registry.validateActivities(registry.activities));
  for(const course of new Set(registry.activities.map(a=>a.course))){
    const list=registry.activities.filter(a=>a.course===course);
    assert.equal(Object.keys(Object.fromEntries(list.map(a=>[a.week,a]))).length,list.length);
  }
});
test('同課程重複活動序號明確報錯，跨課程可共用序號且不改動輸入',()=>{
  const first=syntheticActivity(),second={...first,href:'synthetic/b/'};
  assert.throws(()=>registry.validateActivities([first,second]),/ACTIVITIES\[1\].*synthetic \/ 1.*重複 course\/week.*ACTIVITIES\[0\]/);
  const list=[first,{...second,course:'synthetic-other',unit:0,also:['2026-09-14']}];
  const before=JSON.stringify(list);
  assert.doesNotThrow(()=>registry.validateActivities(list));
  assert.equal(JSON.stringify(list),before);
});
test('載入登記資料時即校驗，呼叫端尚未建索引就攔截重複序號',()=>{
  const source=registrySource.replace('const ACTIVITIES = [','const ACTIVITIES = [\n'+JSON.stringify(syntheticActivity())+','+JSON.stringify(syntheticActivity())+',');
  assert.throws(()=>vm.runInNewContext(source),/重複 course\/week/);
});
for(const field of Object.keys(syntheticActivity())){
  test(`活動必要欄位 ${field} 缺漏或空值時明確報錯`,()=>{
    for(const value of [undefined,null,'','   ']){
      const a=syntheticActivity();
      if(value===undefined)delete a[field];else a[field]=value;
      assert.throws(()=>registry.validateActivities([a]),new RegExp(`ACTIVITIES\\[0\\].*${field} 缺漏或格式錯誤`));
    }
  });
}
test('活動序號、陣列與選填欄位拒絕無效型別及範圍',()=>{
  for(const [field,values] of Object.entries({week:[0,-1,1.5,'1',NaN,Infinity,Number.MAX_SAFE_INTEGER+1],codes:[{},[null],['']],
    rounds:[[],[''],[1],Array(7).fill('合成關卡')],unit:[null,-1,1.5,'0',Number.MAX_SAFE_INTEGER+1],also:[null,'2026-09-14',['']]})){
    for(const value of values)assert.throws(()=>registry.validateActivities([{...syntheticActivity(),[field]:value}]),new RegExp(`${field} 缺漏或格式錯誤`));
  }
  for(const value of [null,undefined,1,'合成'])assert.throws(()=>registry.validateActivities([value]),/活動資料 缺漏或格式錯誤/);
});
for(const field of ['codes','rounds','also']){
  test(`活動 ${field} 拒絕全空槽、首端、中間及尾端空槽`,()=>{
    for(const value of [Array(2),[,'合成文字'],['合成文字',,'合成文字'],['合成文字',,]]){
      assert.throws(()=>registry.validateActivities([{...syntheticActivity(),[field]:value}]),
        new RegExp(`ACTIVITIES\\[0\\].*${field} 缺漏或格式錯誤`));
    }
  });
}
test('活動必要文字欄位拒絕非字串輸入',()=>{
  for(const field of ['course','title','track','date','href','node','topic','why','because','so']){
    for(const value of [1,true,{},['合成文字']]){
      assert.throws(()=>registry.validateActivities([{...syntheticActivity(),[field]:value}]),
        new RegExp(`${field} 缺漏或格式錯誤`));
    }
  }
});
test('活動允許六關及安全整數上限，並保留合法空陣列',()=>{
  assert.doesNotThrow(()=>registry.validateActivities([{...syntheticActivity(),
    rounds:Array(6).fill('合成關卡'),week:Number.MAX_SAFE_INTEGER,unit:Number.MAX_SAFE_INTEGER,also:[]}]));
});
// 執行原工具，僅以記憶體檔案替身提供合成資料，不覆寫 repo 的 JSON。
function generateRegistry(activities,check){
  generateRegistrySource('const ACTIVITIES = '+JSON.stringify(activities)+';',check);
}
function generateRegistrySource(source,check){
  const original='原有輸出\n';let output=original,stdout='';
  const toolUrl=new URL('../tools/activities-json.mjs',import.meta.url);
  const context={vm,URL,toolUrl,fileURLToPath,process:{argv:['node',fileURLToPath(toolUrl)]},
    readFileSync(url){
      assert.equal(url.href,new URL('../assets/activities.js',toolUrl).href);
      return source;
    },
    writeFileSync(url,value){
      assert.equal(url.href,new URL('../assets/activities.json',toolUrl).href);output=value;
    },
    console:{log(...args){stdout+=args.join(' ')+'\n';}}
  };
  let status=0,stderr='';
  try{
    vm.runInNewContext(read('tools/activities-json.mjs').replace(/^import .*;$/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url','toolUrl'),context,{timeout:1000});
  }catch(error){status=1;stderr=String(error.stack||error);}
  check({status,stderr,stdout},output,original);
}
const generatorActivity=(extra={})=>({course:'synthetic-a',week:1,title:'合成活動',href:'synthetic-a/u0-01/',rounds:['合成關卡'],...extra});
test('活動登記與產生器整合：載入校驗先攔下重複時仍列出兩筆來源且不覆寫',()=>{
  const first=syntheticActivity(),second={...first,href:'synthetic/b/',title:'合成活動二'};
  const source=registrySource.replace('const ACTIVITIES = [',
    'const ACTIVITIES = [\n'+JSON.stringify(first)+','+JSON.stringify(second)+',');
  generateRegistrySource(source,(result,output,original)=>{
    assert.equal(result.status,1);
    for(const field of ['assets/activities.js','ACTIVITIES[0]','ACTIVITIES[1]',first.href,second.href,first.title,second.title]){
      assert.ok(result.stderr.includes(field),result.stderr);
    }
    assert.equal(output,original);
  });
});
test('活動登記：拒絕活動與關卡陣列空洞，指出來源且不覆寫 JSON',()=>{
  const entry=JSON.stringify(generatorActivity());
  const cases=[
    [`[,${entry}]`,'ACTIVITIES[0]'],
    [`[${entry},,]`,'ACTIVITIES[1]'],
    ['Array(2)','ACTIVITIES[0]'],
    ...[["[,'合成關卡']",0],["['合成關卡',,]",1],['Array(2)',0]].map(([rounds,index])=>[
      `[{...${entry},rounds:${rounds}}]`,'ACTIVITIES[0]',`rounds[${index}]`,generatorActivity().href
    ])
  ];
  for(const [entries,...fields] of cases)generateRegistrySource(`const ACTIVITIES = ${entries};`,(result,output,original)=>{
    assert.equal(result.status,1,entries+' 應拒絕輸出');
    for(const field of ['assets/activities.js',...fields])assert.ok(result.stderr.includes(field),result.stderr);
    assert.equal(output,original);
  });
});
test('活動登記：缺少必要欄位時指出來源且不覆寫 JSON',()=>{
  for(const field of ['course','week','title','href','rounds']){
    const entry=generatorActivity();delete entry[field];
    generateRegistry([generatorActivity({course:'synthetic-other'}),entry],(result,output,original)=>{
      assert.equal(result.status,1,field+' 應拒絕輸出');
      assert.ok(result.stderr.includes('assets/activities.js'),result.stderr);
      assert.ok(result.stderr.includes('ACTIVITIES[1]'),result.stderr);
      assert.ok(result.stderr.includes(field),result.stderr);
      if(field!=='href')assert.ok(result.stderr.includes(entry.href),result.stderr);
      assert.equal(output,original);
    });
  }
});
test('活動登記：拒絕無效清單、項目與必要欄位值',()=>{
  const cases=[
    [null,'ACTIVITIES'],[{},'ACTIVITIES'],[[null],'ACTIVITIES[0]'],[[[]],'ACTIVITIES[0]'],
    ...[{course:''},{title:'  '},{href:42},{week:'1'},{week:0},{week:1.5},{rounds:[]},{rounds:'關卡'},{rounds:['']}]
      .map(extra=>[[generatorActivity(extra)],Object.keys(extra)[0]])
  ];
  for(const [entries,field] of cases)generateRegistry(entries,(result,output,original)=>{
    assert.equal(result.status,1,field);
    assert.ok(result.stderr.includes('assets/activities.js'),result.stderr);
    assert.ok(result.stderr.includes(field),result.stderr);
    assert.equal(output,original);
  });
});
test('活動登記：重複 course/week 指出兩筆來源且不覆寫 JSON',()=>{
  generateRegistry([generatorActivity(),generatorActivity({href:'synthetic-a/u0-02/'})],(result,output,original)=>{
    assert.equal(result.status,1);
    for(const source of ['assets/activities.js','ACTIVITIES[0]','ACTIVITIES[1]','synthetic-a/u0-01/','synthetic-a/u0-02/','synthetic-a/1'])assert.ok(result.stderr.includes(source),result.stderr);
    assert.equal(output,original);
  });
});
test('活動登記：不同課程可共用 week，保留順序、選填預設與輸出格式',()=>{
  const entries=[generatorActivity({week:2,unit:0,date:'2026-01-01',track:'必修',also:['2026-01-08']}),generatorActivity({course:'synthetic-b',week:2,href:'synthetic-b/a/'})];
  generateRegistry(entries,(result,output)=>{
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'activities.json: 2 activities\n');
    const expected={v:1,note:'generated from assets/activities.js by tools/activities-json.mjs',activities:entries.map(a=>({course:a.course,week:a.week,title:a.title,unit:a.unit??null,track:a.track||'',date:a.date||'',also:a.also||[],rounds:a.rounds}))};
    assert.equal(output,JSON.stringify(expected,null,1)+'\n');
  });
});
const shell=read('assets/shell.js');
const seeds=[1,7,42,2026,0x12345678,0x7fffffff,0x80000000,0xffffffff];
function activity(dir,captureConfig=false){
  const html=read(`115-g9/${dir}/index.html`),body=new Element('body');
  const context=vm.createContext({document:{body,addEventListener(){},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},
    window:{},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>false,remember(){}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,
    matchMedia:()=>({matches:true})});
  const run=(source,timeout=1000)=>vm.runInContext(source,context,{timeout});
  // 控制 Math.random（自訂活動也會用到），同時限制傳入 gen 的 rnd 呼叫數。
  run(`let state=1,calls=0;function rnd(){if(++calls>100000)throw Error('產題亂數超過 100000 次');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}Math.random=rnd;`);
  // 僅擷取傳入的設定，仍執行原始 shell，供頁面後續 DOM 初始化使用。
  const entry='const SHELL = (cfg) => {';
  if(captureConfig)assert.ok(shell.includes(entry));
  run((captureConfig?shell.replace(entry,entry+'globalThis.activityConfig=cfg;'):shell)+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {run,context};
}
const dirs=readdirSync(new URL('../115-g9/',import.meta.url)).filter(d=>/^u\d+-\d+$/.test(d)&&read(`115-g9/${d}/index.html`).includes('assets/shell.js'));
test('使用 shell 活動清單完整（新增活動會自動納入）',()=>assert.equal(dirs.length,30));

const plain=v=>JSON.parse(JSON.stringify(v));
const catalog=vm.runInNewContext(read('assets/curriculum.js')+'\n'+read('assets/activities.js')+
  '\n;({activities:ACTIVITIES,courses:COURSES,curricula:CURRICULA,termWeekOf})',{}, {timeout:1000});
test('正式活動目錄：必要欄位、合法日期、課程／課綱引用及課程內活動 ID 唯一',()=>{
  const ids=new Set(),hrefs=new Set();
  const codes=new Set(catalog.curricula.flatMap(c=>c.strands.flatMap(s=>s.items.map(i=>i.code))));
  assert.ok(catalog.activities.length>0);
  for(const a of catalog.activities){
    const id=`${a.course}/${a.week}`,course=catalog.courses.find(c=>c.id===a.course);
    assert.ok(course,id+' 已登記課程');
    for(const key of ['title','href','node','topic','why','because','so'])
      assert.ok(typeof a[key]==='string'&&a[key].trim(),id+' '+key);
    assert.ok(Number.isInteger(a.week)&&a.week>0,id+' 活動序號');
    assert.equal(ids.has(id),false,id+' 不重複');ids.add(id);
    assert.equal(hrefs.has(a.href),false,a.href+' 不重複');hrefs.add(a.href);
    assert.ok(a.href.startsWith(course.path),id+' 頁面屬於課程');
    assert.match(a.href,/^[\w-]+\/[\w-]+\/$/);
    assert.ok(read(a.href+'index.html').length>0,id+' 頁面存在');
    assert.ok(a.unit===undefined||(Number.isInteger(a.unit)&&a.unit>=0),id+' 單元');
    assert.ok(['必修','選修'].includes(a.track),id+' track');
    assert.ok(Array.isArray(a.rounds)&&a.rounds.length>=1&&a.rounds.length<=6,id+' 關卡數');
    assert.ok(a.rounds.every(r=>typeof r==='string'&&r.trim()),id+' 關卡名稱');
    assert.ok(Array.isArray(a.codes)&&a.codes.every(c=>codes.has(c)),id+' 課綱代碼');
    assert.ok(a.also===undefined||Array.isArray(a.also),id+' 重複上課日期');
    for(const date of [a.date,...(a.also||[])]){
      assert.match(date,/^\d{4}-\d{2}-\d{2}$/,id+' 日期格式');
      assert.equal(new Date(date+'T00:00:00Z').toISOString().slice(0,10),date,id+' 有效日期');
      assert.ok(catalog.termWeekOf({date})>=1,id+' 日期位於學期內');
    }
  }
});

test('公開 activities.json 與唯一登記處逐筆同序一致，且只含公開欄位',()=>{
  const data=JSON.parse(read('assets/activities.json'));
  assert.deepEqual(Object.keys(data).sort(),['activities','note','v']);
  assert.equal(data.v,1);
  assert.deepEqual(data.activities,plain(catalog.activities.map(a=>({
    course:a.course,week:a.week,title:a.title,unit:a.unit??null,track:a.track||'',
    date:a.date||'',also:a.also||[],rounds:a.rounds||[]
  }))));
});

test('所有 shell 活動頁與目錄雙向對應：課程、活動 ID、學期週次、選填單元與關卡數',()=>{
  const entries=catalog.activities.filter(a=>a.course==='115-g9');
  assert.deepEqual(Array.from(entries,a=>a.href).sort(),dirs.map(d=>`115-g9/${d}/`).sort());
  for(const a of entries){
    const cfg=activity(a.href.split('/')[1],true).run('activityConfig');
    if(cfg.unit!==undefined)assert.equal(cfg.unit,a.unit,a.href+' 選填單元');
    // 頁面可使用較完整的顯示名稱；計分對應以課程、活動 ID 與關卡索引為準。
    assert.deepEqual({course:cfg.course,week:cfg.week,termWeek:cfg.termWeek,rounds:cfg.rounds.length},
      {course:a.course,week:a.week,termWeek:catalog.termWeekOf(a),rounds:a.rounds.length},a.href);
  }
});

test('合成日期：活動序號不影響學期週次，週日／週一與跨學期邊界及重複上課標籤',()=>{
  const api=vm.runInNewContext(read('assets/activities.js')+'\n;({termWeekOf,datesOf,termWeekLabel})',{
    TERMS:[{start:'2026-11-02',weeks:3},{start:'2027-02-08',weeks:2}]
  },{timeout:1000});
  for(const [date,expected] of [['2026-11-01',null],['2026-11-02',1],['2026-11-08',1],
    ['2026-11-09',2],['2026-11-22',3],['2026-11-23',null],['2027-02-08',1],['2027-02-22',null]])
    assert.equal(api.termWeekOf({date,week:99}),expected,date);
  assert.equal(api.termWeekOf(null),null);assert.equal(api.termWeekOf({week:99}),null);
  const a={week:99,date:'2026-11-16',also:['2026-11-02','2026-11-09']},before=plain(a);
  assert.deepEqual(plain(api.datesOf(a)),['2026-11-02','2026-11-09','2026-11-16']);
  assert.equal(api.termWeekLabel(a),'第 1–3 週');
  assert.equal(api.termWeekLabel({date:'2026-11-02',also:['2026-11-08']}),'第 1 週');
  assert.equal(api.termWeekLabel({date:'2026-12-01'}),'');
  assert.deepEqual(a,before,'查詢不改動登記資料');
  const noTerms=vm.runInNewContext(read('assets/activities.js')+'\n;termWeekOf');
  assert.equal(noTerms({date:'2026-11-02',week:99}),null);
});
for(const dir of dirs){
  test(`${dir}：所有實際 gen/view/fill/get/check，多種子有界產題、正解與錯答`,()=>{
    const {run,context}=activity(dir);
    const count=run('APP.rounds.length');
    assert.equal(count,dir==='u2-03'?5:4,dir+' 關卡數；合計 121 關');
    for(let index=0;index<count;index++)for(const seed of seeds){
      context.index=index;context.seed=seed;
      const result=run(`(()=>{
        state=seed;calls=0;const r=APP.rounds[index],inst=r.gen(rnd),el=document.getElementById('stage');el.innerHTML='';
        const h=r.view(inst,el,{changed(){},attempt(){},esc:s=>String(s)});
        if(typeof h.fill!=='function')throw Error('無通用解答：缺 fill');
        h.fill();const answer=h.get();
        const good=r.check(inst,answer)===true;
        // 排序改成反向排列；其他答案改為負值／錯字。集合題移除一項，避免只是換序仍正確。
        const wrong=v=>Array.isArray(v)?(v.length>1&&new Set(v).size===v.length?[...v].reverse():v.map(wrong)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,k==='powerOff'?x:wrong(x)])):typeof v==='number'?-999999:typeof v==='boolean'?!v:'明顯錯答';
        const badAnswer=(('${dir}'==='u4-01'&&index===1)||('${dir}'==='u4-03'&&index===2)||('${dir}'==='u4-05'&&index===2))?answer.slice(1):wrong(answer);
        return {good,bad:r.check(inst,badAnswer)===true,ready:!h.ready||h.ready(),calls};
      })()`);
      assert.equal(result.good,true,`${dir} 關 ${index+1} seed ${seed} 教師正解`);
      assert.equal(result.ready,true,`${dir} 關 ${index+1} seed ${seed} 正解可送出`);
      assert.equal(result.bad,false,`${dir} 關 ${index+1} seed ${seed} 錯答`);
      assert.ok(result.calls<=100000);
    }
  });
}

// rnd 的契約只有 [0,1)，固定 0 是可重現的退化來源；不是一般種子一定卡住的宣稱。
test('u1-01 第一關在固定亂數 0 時有重抽上限',()=>{
  activity('u1-01').run('APP.rounds[0].gen(()=>0)',50);
});

// 使用正式登記、日期函式與鎖；時鐘、DOM 及缺漏資料皆為合成，不載入網路。
function activityLock({sub='u2-03',now='2026-11-08T23:58:59.999+08:00',curriculum=true,alter=''}={}){
  const elements=[],events={};
  const context=vm.createContext({
    Date:class extends Date {static now(){return Date.parse(now);}},
    location:{pathname:`/115-g9/${sub}/`},
    document:{readyState:'loading',body:{appendChild:e=>elements.push(e)},
      createElement:()=>({style:{}}),getElementById:()=>({}),
      addEventListener:(name,fn)=>{events[name]=fn;}}
  });
  const run=source=>vm.runInContext(source,context,{timeout:1000});
  // 活動頁先載入 lock，curriculum 與 activities 在 DOM 完成前才載入。
  run(read('assets/lock.js'));
  if(curriculum)run(read('assets/curriculum.js'));
  run(read('assets/activities.js'));
  run(alter);
  events.DOMContentLoaded();
  return {locked:elements.length===1,run};
}

test('活動序號與資料夾編號不決定開放；date 的台灣週日毫秒邊界才決定',()=>{
  for(const week of [1,5,30,undefined])for(const [now,locked] of [
    ['2026-11-08T23:58:59.999+08:00',true],
    ['2026-11-08T23:59:00.000+08:00',false]
  ]){
    const h=activityLock({now,alter:`ACTIVITIES.find(a=>a.href==='115-g9/u2-03/').week=${week};`});
    assert.equal(h.locked,locked,`week=${week}, now=${now}`);
  }
});

test('非 OPEN 活動缺登記、缺日期或日期無效時保持鎖定',()=>{
  for(const alter of [
    "ACTIVITIES.splice(ACTIVITIES.findIndex(a=>a.href==='115-g9/u2-03/'),1);",
    ...[undefined,'','bad','2026-02-30'].map(date=>
      `ACTIVITIES.find(a=>a.href==='115-g9/u2-03/').date=${JSON.stringify(date)};`)
  ])assert.equal(activityLock({now:'2028-01-01T00:00:00Z',alter}).locked,true,alter);
});

test('OPEN 保留提早開放政策，不依賴活動日期或活動登記',()=>{
  for(const alter of ['',"ACTIVITIES.length=0;",
    "delete ACTIVITIES.find(a=>a.href==='115-g9/u2-02/').date;"]){
    assert.equal(activityLock({sub:'u2-02',now:'2026-01-01T00:00:00Z',alter}).locked,false,alter);
  }
});

test('缺少課程資料或課程登記時，日期與 OPEN 均不能放行',()=>{
  for(const sub of ['u2-02','u2-03'])for(const options of [
    {curriculum:false},
    {alter:"COURSES.splice(COURSES.findIndex(c=>c.id==='115-g9'),1);"},
    {alter:"delete COURSES.find(c=>c.id==='115-g9').open;"}
  ])assert.equal(activityLock({sub,now:'2028-01-01T00:00:00Z',...options}).locked,true,`${sub} ${JSON.stringify(options)}`);
});

test('活動清單缺漏 href 的項目不使鎖拋錯，也不阻擋後續有效登記',()=>{
  for(const entry of [null,{}, {course:'115-g9'}, {course:'115-g9',href:42}]){
    const alter=`ACTIVITIES.unshift(${JSON.stringify(entry)});`;
    for(const [now,locked] of [['2026-11-08T23:58:59.999+08:00',true],['2026-11-08T23:59:00+08:00',false]]){
      assert.equal(activityLock({now,alter}).locked,locked,`${JSON.stringify(entry)} ${now}`);
    }
  }
});
