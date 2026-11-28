const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
const number=n=>n===null?'—':Number(n.toFixed(2)).toString();
export function validItemHealth(v,{project,course,classKey,activity}){
 const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
 const ratio=n=>n===null||Number.isFinite(n)&&n>=0&&n<=1;
 const seen=new Set();
 return v?.schemaVersion===1&&v.sourceProject===project&&v.course===course&&v.classKey===classKey
  &&v.activity===activity&&v.coverage==='formal-observed-v1'&&count(v.population)&&v.population<=60
  &&count(v.readCost)&&v.readCost<=210&&(v.since===null||typeof v.since==='string'&&Number.isFinite(Date.parse(v.since)))
  &&Array.isArray(v.rows)&&v.rows.length<=363&&v.rows.every(r=>{
   const key=[r.activity,r.round,r.slot].join(':');if(seen.has(key))return false;seen.add(key);
   return Number.isInteger(r.activity)&&r.activity>=1&&r.activity<=30&&(activity===null||r.activity===activity)
    &&Number.isInteger(r.round)&&r.round>=0&&r.round<=4&&[null,0,1].includes(r.slot)
    &&['started','attempted','attempts','wrong','passed','pending','wrongPeople','stuck'].every(k=>count(r[k]))
    &&r.started<=v.population&&r.attempted<=r.started&&r.passed<=r.attempted&&r.wrong<=r.attempts
    &&r.pending<=r.started&&r.wrongPeople<=r.attempted&&r.stuck<=r.started&&ratio(r.firstPassRate)
    &&(r.averageAttempts===null||Number.isFinite(r.averageAttempts)&&r.averageAttempts>=0);
  });
}
export function mountItemHealth(p,{classKey,activity,activities,explain}){
 const box=node('section');box.className='item-health';box.setAttribute('aria-labelledby','item-health-heading');
 const heading=node('h2','題目健檢');heading.id='item-health-heading';
 const intro=node('p','使用上方班級代碼與活動篩選，按「讀取題目健檢」查看各關及兩個題組。僅計入啟用統計後、目前題庫版本與重置後的正式帳號作答；不含訪客、舊站與教師示範。');
 const notice=node('p','正式作答每次送出都記錄計數，包含尚未過關者的錯答。相同作答票序號、題組與判定的重送只計一次；未完成作答票包含仍在作答、逾時與切換離開者。「—」表示沒有可計算的資料。');
 const read=node('button','讀取題目健檢');read.type='button';read.className='btn';
 const status=node('p','請選擇班級與活動後讀取。');status.setAttribute('role','status');status.id='item-health-status';
 const content=node('div');box.append(heading,intro,notice,read,status,content);p.root.append(box);
 let generation=0,busy=false;
 const controls=()=>{read.disabled=busy||!p.client.state().profile?.owner;};
 function clear(){generation++;busy=false;content.replaceChildren();status.textContent='篩選或身分已變更，請重新讀取題目健檢。';controls();}
 function render(value){
  content.replaceChildren();
  const label=activity.value?activities.find(a=>String(a.week)===activity.value)?.title||'所選活動':'全部活動';
  status.textContent=`${classKey.value.trim()} · ${label} · 名冊 ${value.population} 人 · 本次讀取 ${value.readCost} 筆。`+
   (value.since?`統計最早起點：${new Date(value.since).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}；各關起點可能不同。`:'目前沒有啟用後的統計，無法回推先前嘗試。');
  if(!value.since)return;
  const ranked=value.rows.filter(r=>r.slot===null&&r.started>0).sort((a,b)=>b.stuck-a.stuck||b.wrongPeople-a.wrongPeople||a.activity-b.activity||a.round-b.round).slice(0,5);
  const title=r=>{const a=activities.find(a=>a.week===r.activity);return `${a?.title||'活動 '+r.activity} · 第 ${r.round+1} 關 ${a?.rounds[r.round]||''}`;};
  if(ranked.length){const list=node('ol');content.append(node('h3','開始後尚未過關最多的關卡'));
   for(const r of ranked)list.append(node('li',`${title(r)}：尚未過關 ${r.stuck} 人、曾錯答 ${r.wrongPeople} 人${r.pending?'；含 '+r.pending+' 人有未完成作答票':''}`));content.append(list);}
  content.append(node('p','人數以名冊主體計，每關每人一次；人次為送出答案次數，含重答。整關須完成兩組；首次通過率＝首次嘗試即通過的人數／已作答人數，平均嘗試數＝作答人次／已作答人數。整關首次通過另須只開啟一次。'));
  const table=node('table'),head=node('thead'),hr=node('tr'),body=node('tbody');
  table.append(node('caption','各關／題組作答統計；「尚未過關」也包含剛開始作答者，不代表題目一定有問題。'));
  for(const text of ['關卡／題組','關卡開始人數','已作答人數','作答人次','錯答次數','通過人數','首次通過率','平均嘗試數','曾錯答人數','尚未過關','未完成作答票人數']){const th=node('th',text);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
  for(const r of value.rows){
   const tr=node('tr'),th=node('th',title(r)+(r.slot===null?' · 整關':` · 第 ${r.slot+1} 題組`));th.scope='row';tr.append(th);
   const unknown=r.started===0,rate=unknown||r.firstPassRate===null?'—':number(r.firstPassRate*100)+'%';
   for(const v of [r.started,r.attempted,r.attempts,r.wrong,r.passed,rate,number(r.averageAttempts),r.wrongPeople,r.stuck,r.pending])tr.append(node('td',unknown?'—':v));
   body.append(tr);
  }
  table.append(body);const scroll=node('div');scroll.className='teacher-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','題目健檢統計表，可橫向捲動');scroll.append(table);content.append(scroll);
 }
 read.onclick=async()=>{
  if(busy||!p.active())return;
  const scope={classKey:classKey.value.trim(),activity:activity.value?Number(activity.value):null};
  clear();const n=generation;busy=true;controls();status.textContent='正在讀取題目健檢…';
  try{const value=await p.client.itemHealth(scope);if(p.active()&&n===generation)render(value);}
  catch(e){if(p.active()&&n===generation){content.replaceChildren();status.textContent='題目健檢讀取失敗，未顯示部分統計。'+explain(e);}}
  finally{if(p.active()&&n===generation){busy=false;controls();}}
 };
 p.cleanup(clear);controls();return {clear};
}
