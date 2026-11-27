// 公開模擬器只重播你的設定，不產生題目、不選取正解、不判分。
export const SHEET_MODE='form-volunteer-sheet-v2';
const VERSION='u206-sheet-v2',letters=[...'ABCDEFGHIJ'];
const clone=v=>JSON.parse(JSON.stringify(v));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const keys=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),[...ks].sort());
const int=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const member=(v,vs)=>vs.includes(v);
const unique=a=>new Set(a).size===a.length;
const list=(v,max,check)=>Array.isArray(v)&&v.length<=max&&v.every(check)&&unique(v);
export const rangeText=r=>r?`${r.fromColumn}${r.fromRow}:${r.toColumn}${r.toRow}`:'';
export function markedCells(rows,setting){
 if(!setting)return [];
 const {range:r,rule}=setting,out=[];
 for(let k=Math.max(0,r.fromRow-2);k<Math.min(rows.length,r.toRow-1);k++)for(let c=letters.indexOf(r.fromColumn);c<=letters.indexOf(r.toColumn);c++){
  const v=rows[k][c];if(rule==='empty'?v==='':typeof v==='number'&&v>5)out.push([k,c]);
 }return out;
}
export function dedupeRows(rows,columns,range={fromColumn:'A',toColumn:'J',fromRow:1,toRow:rows.length+1},hasHeader=true){
 const seen=new Set(),kept=[],removed=[];
 // 範圍之外保留；欄名不當作資料列。錯誤的欄名設定仍須重新核對。
 const start=Math.max(0,range.fromRow-2+(hasHeader&&range.fromRow>1?1:0));
 rows.forEach((row,k)=>{
  if(k<start||k>range.toRow-2){kept.push(k);return;}
  const key=JSON.stringify(columns.filter(c=>c>=range.fromColumn&&c<=range.toColumn).map(c=>c==='H'?['上午','下午'].filter(s=>String(row[7]).split('、').includes(s)).join('、'):row[letters.indexOf(c)]));
  if(seen.has(key))removed.push(k);else{seen.add(key);kept.push(k);}
 });return {kept,removed};
}
export const filterRows=(rows,group,slot)=>rows.flatMap((r,k)=>(!group||r[2]===group)&&(!slot||r[7].split('、').includes(slot))?[k]:[]);
export const demandGaps=(demand,counts)=>demand.map((n,k)=>Math.max(n-counts[k],0));
export const percentTenths=(counts,query)=>counts.reduce((a,b)=>a+b,0)?Math.round(counts[query]*1000/counts.reduce((a,b)=>a+b,0)):0;

export function createSheetModel(data){
 if(data?.mode!==SHEET_MODE||data.schemaVersion!==2||data.taskVersion!==VERSION||!int(data.round,0,3))throw Error('unsupported-sheet-version');
 const d=freeze(clone(data)),ids=d.rows.map(r=>r.id),rows=d.rows.map(r=>r.cells),all=()=>[...ids],n=rows.length;
 const full={fromColumn:'A',toColumn:'J',fromRow:1,toRow:n+1};
 const defaults=()=>d.round===0?{flowChoice:'',backupChoice:'',classifications:Array(4).fill('')}:d.round===1?
  {range:null,rule:'',color:'yellow',reasonSelection:[]}:d.round===2?
  {range:clone(full),hasHeader:true,columns:[...letters],conflictChoice:''}:
  {group:'',slot:'',counts:['','',''],sourceChoice:'',titleChoice:'',percent:'',priorityJob:'',priorityReason:''};
 let controls=defaults(),ops=[],revision=0;
 const validRange=r=>keys(r,['fromColumn','toColumn','fromRow','toRow'])&&member(r.fromColumn,letters)&&member(r.toColumn,letters)&&r.fromColumn<=r.toColumn&&int(r.fromRow,1,n+1)&&int(r.toRow,r.fromRow,n+1);
 const index=(v,vs,empty=true)=>(empty&&v==='')||int(v,0,vs.length-1);
 const count=v=>typeof v==='string'&&/^(?:0|[1-9]\d?)$/.test(v)&&Number(v)<=14;
 const percentage=v=>typeof v==='string'&&/^(?:\d{1,2}(?:\.\d)?|100(?:\.0)?)$/.test(v);
 function validControls(c){
  if(!keys(c,Object.keys(defaults())))return false;
  if(d.round===0)return index(c.flowChoice,d.options.flows)&&index(c.backupChoice,d.task.backups)&&Array.isArray(c.classifications)&&c.classifications.length===4&&c.classifications.every(x=>member(x,['',...d.options.classifications]));
  if(d.round===1)return (c.range===null||validRange(c.range))&&member(c.rule,['','empty','numberGreaterThan5'])&&member(c.color,['yellow','blue','pink'])&&list(c.reasonSelection,4,x=>member(x,d.options.reasons));
  if(d.round===2)return validRange(c.range)&&typeof c.hasHeader==='boolean'&&list(c.columns,10,x=>member(x,letters))&&member(c.conflictChoice,['','reviewBoth','latest']);
  return member(c.group,['',...d.options.groups])&&member(c.slot,['',...d.options.slots])&&Array.isArray(c.counts)&&c.counts.length===3&&c.counts.every(x=>x===''||count(x))&&member(c.sourceChoice,['','filtered','originalSummary'])&&index(c.titleChoice,d.options.titles)&& (c.percent===''||percentage(c.percent))&&index(c.priorityJob,d.options.jobs)&&member(c.priorityReason,['','demandGap','fewestReplies']);
 }
 function validOp(o){
  if(!int(o?.rev,1,1000000))return false;
  const exact=ks=>keys(o,['op','rev',...ks]);
  if(d.round===1)return o.op==='format'&&exact(['range','rule','color'])&&validRange(o.range)&&member(o.rule,['empty','numberGreaterThan5'])&&member(o.color,['yellow','blue','pink'])||o.op==='exclude'&&exact(['rowIds'])&&list(o.rowIds,n,x=>member(x,ids))&&o.rowIds.length>0;
  if(d.round===2)return o.op==='dedupe'&&exact(['range','hasHeader','columns'])&&validRange(o.range)&&typeof o.hasHeader==='boolean'&&list(o.columns,10,x=>member(x,letters))&&o.columns.length>0;
  if(d.round===3)return o.op==='filter'&&exact(['group','slot'])&&member(o.group,['',...d.options.groups])&&member(o.slot,['',...d.options.slots])||o.op==='counts'&&exact(['filterRev','values'])&&int(o.filterRev,1,1000000)&&Array.isArray(o.values)&&o.values.length===3&&o.values.every(x=>int(x,0,14))||o.op==='pie'&&exact(['filterRev','countsRev','sourceChoice','titleChoice'])&&int(o.filterRev,1,1000000)&&int(o.countsRev,1,1000000)&&o.sourceChoice==='filtered'&&index(o.titleChoice,d.options.titles,false);
  return false;
 }
 const latest=op=>ops.find(o=>o.op===op);
 function analysisReset(){controls.percent='';controls.priorityJob='';controls.priorityReason='';}
 function invalidate(names){ops=ops.filter(o=>!names.includes(o.op));}
 function set(key,value){
  if(!Object.hasOwn(controls,key))return false;
  const next={...controls,[key]:clone(value)};if(!validControls(next))return false;
  if(equal(controls[key],value))return true;
  controls=next;
  if(d.round===2&&['range','hasHeader','columns'].includes(key))invalidate(['dedupe']);
  if(d.round===3){
   if(['group','slot'].includes(key)){invalidate(['filter','counts','pie']);controls.counts=['','',''];analysisReset();}
   if(key==='counts'){invalidate(['counts','pie']);analysisReset();}
   if(['sourceChoice','titleChoice'].includes(key)){invalidate(['pie']);analysisReset();}
  }return true;
 }
 function record(op,value){
  // 紀錄只保留可從初始副本重播的有效操作，無點擊次數上限。
  if(revision>=999999){ops=ops.sort((a,b)=>a.rev-b.rev).map((o,k)=>({...o,rev:k+1}));
   const f=latest('filter'),c=latest('counts'),p=latest('pie');if(c)c.filterRev=f.rev;if(p){p.filterRev=f.rev;p.countsRev=c.rev;}revision=ops.length;}
  invalidate([op]);ops.push({op,rev:++revision,...clone(value)});ops.sort((a,b)=>a.rev-b.rev);
 }
 function execute(action,rowIds=[]){
  if(![[],['format','exclude','restore'],['dedupe','undoDedupe'],['filter','clearFilter','counts','pie']][d.round].includes(action))return '不支援的操作。';
  if(action==='format'){
   if(!controls.range||!controls.rule)return '請先選擇範圍與格式規則。';
   record('format',{range:controls.range,rule:controls.rule,color:controls.color});
  }else if(action==='exclude'){
   if(!list(rowIds,n,x=>ids.includes(x))||!rowIds.length)return '請先勾選要排除的列。';
   const excluded=new Set([...(latest('exclude')?.rowIds||[]),...rowIds]);record('exclude',{rowIds:ids.filter(x=>excluded.has(x))});
  }else if(action==='restore'){
   const remaining=(latest('exclude')?.rowIds||[]).filter(x=>rowIds.length&&!rowIds.includes(x));
   invalidate(['exclude']);if(remaining.length)record('exclude',{rowIds:remaining});
  }else if(action==='dedupe'){
   if(!controls.columns.length)return '請至少選一個比對欄位。';
   record('dedupe',{range:controls.range,hasHeader:controls.hasHeader,columns:controls.columns});
  }else if(action==='undoDedupe')invalidate(['dedupe']);
  else if(action==='filter'){
   invalidate(['counts','pie']);controls.counts=['','',''];analysisReset();record('filter',{group:controls.group,slot:controls.slot});
  }else if(action==='clearFilter'){
   controls.group='';controls.slot='';return execute('filter');
  }else if(action==='counts'){
   if(!latest('filter'))return '請先套用篩選。';
   if(!controls.counts.every(count))return '請填三個 0～14 的整數，沒有回覆可填 0。';
   invalidate(['pie']);analysisReset();record('counts',{filterRev:latest('filter').rev,values:controls.counts.map(Number)});
  }else if(action==='pie'){
   if(controls.sourceChoice==='originalSummary')return '本題沒有提供原始表單摘要，請選擇可用的統計表來源。';
   if(!latest('counts'))return '請先記錄目前篩選的三個統計值。';
   if(controls.sourceChoice!== 'filtered'||controls.titleChoice==='')return '請先選擇圖表來源與標題。';
   analysisReset();record('pie',{filterRev:latest('filter').rev,countsRev:latest('counts').rev,sourceChoice:controls.sourceChoice,titleChoice:controls.titleChoice});
  }else return '不支援的操作。';
  return '';
 }
 function results(){
  const format=latest('format'),excluded=latest('exclude')?.rowIds||[],dedupe=latest('dedupe'),filter=latest('filter');
  const result=dedupe?dedupeRows(rows,dedupe.columns,dedupe.range,dedupe.hasHeader):{kept:rows.map((_,k)=>k),removed:[]};
  return {marked:markedCells(rows,format),excludedRowIds:[...excluded],removedRowIds:result.removed.map(k=>ids[k]),
   keptRowIds:d.round===1?ids.filter(x=>!excluded.includes(x)):result.kept.map(k=>ids[k]),visibleRowIds:filter?filterRows(rows,filter.group,filter.slot).map(k=>ids[k]):all()};
 }
 function get(){
  const c=controls,r=results(),f=latest('format'),du=latest('dedupe'),fi=latest('filter'),co=latest('counts'),pi=latest('pie');let state;
  if(d.round===0)state=clone(c);
  if(d.round===1)state={format:c.range&&c.rule?{range:c.range,rule:c.rule,color:c.color}:null,formatRev:f?.rev||0,excludedRowIds:r.excludedRowIds,keptRowIds:r.keptRowIds,reasonSelection:c.reasonSelection};
  if(d.round===2)state={dedupe:{range:c.range,hasHeader:c.hasHeader,columns:c.columns},dedupeRev:du?.rev||0,removedRowIds:r.removedRowIds,keptRowIds:r.keptRowIds,conflictChoice:c.conflictChoice};
  if(d.round===3)state={filter:{group:c.group,slot:c.slot},filterRev:fi?.rev||0,counts:c.counts.every(count)?c.counts.map(Number):[0,0,0],countsRev:co?.rev||0,visibleRowIds:r.visibleRowIds,sourceChoice:c.sourceChoice,titleChoice:c.titleChoice,
   chart:pi?{filterRev:pi.filterRev,countsRev:pi.countsRev,counts:[...co.values]}:null,pieRev:pi?.rev||0,percentTenths:c.percent===''?null:Math.round(Number(c.percent)*10),priorityJob:c.priorityJob,priorityReason:c.priorityReason};
  return clone({schemaVersion:2,taskVersion:VERSION,datasetToken:d.datasetToken,ops,state});
 }
 function missing(){
  const c=controls,out=[];const need=(key,reason,ok)=>{if(!ok)out.push({key,reason});};
  if(d.round===0){need('flowChoice','請選擇封存流程。',c.flowChoice!=='');need('backupChoice','請選擇備份副本。',c.backupChoice!=='');c.classifications.forEach((v,k)=>need('classification'+k,'請分類這個指定案例。',v!==''));}
  if(d.round===1){need('range','請選擇套用範圍。',!!c.range);need('rule','請選擇格式規則。',!!c.rule);}
  if(d.round===2){need('columns','請至少選一個比對欄位。',c.columns.length>0);need('conflictChoice','請選擇衝突回覆的處理方式。',!!c.conflictChoice);}
  if(d.round===3){c.counts.forEach((v,k)=>need('count'+k,'請填 0～14 的整數。',count(v)));need('sourceChoice','請選擇資料來源。',!!c.sourceChoice);need('titleChoice','請選擇圖表標題。',c.titleChoice!=='');need('percent','請填 0～100 的百分比，最多小數一位。',percentage(c.percent));need('priorityJob','請選擇優先補招職務。',c.priorityJob!=='');need('priorityReason','請選擇補招理由。',!!c.priorityReason);}
  return out;
 }
 function draft(){return clone({version:2,datasetToken:d.datasetToken,controls,ops});}
 function restoreDraft(v){
  try{
   if(JSON.stringify(v).length>10000||!keys(v,['version','datasetToken','controls','ops'])||v.version!==2||v.datasetToken!==d.datasetToken||!validControls(v.controls)||!Array.isArray(v.ops)||v.ops.length>4||!v.ops.every(validOp)||!unique(v.ops.map(o=>o.op)))return false;
   let previous=0;for(const o of v.ops){if(o.rev<=previous)return false;previous=o.rev;}
   const f=v.ops.find(o=>o.op==='filter'),c=v.ops.find(o=>o.op==='counts'),p=v.ops.find(o=>o.op==='pie');
   if(c&&(!f||c.filterRev!==f.rev||c.rev<=f.rev)||p&&(!c||p.filterRev!==f.rev||p.countsRev!==c.rev||p.rev<=c.rev))return false;
   if(f&&(f.group!==v.controls.group||f.slot!==v.controls.slot)||c&&!equal(c.values,v.controls.counts.map(Number))||p&&(p.sourceChoice!==v.controls.sourceChoice||p.titleChoice!==v.controls.titleChoice))return false;
   controls=clone(v.controls);ops=clone(v.ops);revision=previous;return true;
  }catch{return false;}
 }
 function applyTeacherSolution(a){
  if(a?.schemaVersion!==2||a.taskVersion!==VERSION||a.datasetToken!==d.datasetToken||!a.state)return false;
  const s=a.state;let c;
  if(d.round===0)c=s;
  if(d.round===1)c={range:s.format?.range||null,rule:s.format?.rule||'',color:s.format?.color||'yellow',reasonSelection:s.reasonSelection};
  if(d.round===2)c={...s.dedupe,conflictChoice:s.conflictChoice};
  if(d.round===3)c={group:s.filter?.group||'',slot:s.filter?.slot||'',counts:s.counts?.map(String),sourceChoice:s.sourceChoice,titleChoice:s.titleChoice,percent:String(s.percentTenths/10),priorityJob:s.priorityJob,priorityReason:s.priorityReason};
  const before=draft();if(!restoreDraft({version:2,datasetToken:d.datasetToken,controls:c,ops:a.ops}))return false;
  if(!equal(get(),a)){restoreDraft(before);return false;}return true;
 }
 return {data:d,get,results,missing,set,execute,draft,restoreDraft,applyTeacherSolution,controls:()=>clone(controls),operation:op=>clone(latest(op)||null)};
}

const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
let serial=0;
export function renderVolunteerSheet(host,data,api={changed(){}}){
 const model=createSheetModel(data),d=model.data,prefix='sheet-'+(++serial)+'-',root=node('div');root.className='volunteer-sheet';
 const refs={},bindings=[],panels={},selected=new Set();let disposed=false;
 const numericValid=(key,v)=>key==='percent'?/^(?:\d{1,2}(?:\.\d)?|100(?:\.0)?)$/.test(v):/^(?:0|[1-9]\d?)$/.test(v)&&Number(v)<=14;
 const section=(title,body)=>{const s=node('section');s.className='sheet-panel';s.append(node('h3',title));if(body)s.append(node('p',body));root.append(s);return s;};
 const say=text=>{status.textContent=text;};
 const changed=()=>{if(!disposed)api.changed?.();};
 const update=()=>{draw();changed();};
 function button(parent,key,text,run){const b=node('button',text);b.type='button';b.className='btn';b.dataset.sheetAction=key;b.onclick=()=>{if(disposed)return;run();};parent.append(b);return b;}
 function label(parent,key,text,el){const field=node('div'),l=node('label',text);field.className='sheet-field';el.id=prefix+key;l.setAttribute('for',el.id);field.append(l,el);parent.append(field);refs[key]=el;return el;}
 function select(parent,key,text,choices,read,write){
  const el=node('select'),blank=node('option','請選擇');blank.value='';el.append(blank);
  choices.forEach(([value,text])=>{const o=node('option',text);o.value=String(value);el.append(o);});
  label(parent,key,text,el);bindings.push(()=>{el.value=String(read());});el.oninput=()=>{write(el.value);update();};return el;
 }
 function choose(parent,key,text,values,labels=values){return select(parent,key,text,values.map((v,k)=>[v,labels[k]]),()=>model.controls()[key],v=>model.set(key,v));}
 function numeric(parent,key,text,read,write,{max=14,step=1}={}){
  const el=node('input');el.type='number';el.min='0';el.max=String(max);el.step=String(step);el.inputMode=step===1?'numeric':'decimal';label(parent,key,text,el);
  bindings.push(()=>{el.value=read();});el.oninput=()=>{
   // 無效或部分輸入留在欄位，完整性驗證直接讀欄位；不造出預設的 0。
   const raw=el.value;write(raw);draw();el.value=raw;changed();
  };return el;
 }
 function check(parent,key,text,read,write){const l=node('label'),el=node('input');l.className='sheet-check';el.type='checkbox';el.id=prefix+key;l.append(el,node('span',text));parent.append(l);refs[key]=el;bindings.push(()=>{el.checked=read();});el.onchange=()=>{write(el.checked);update();};return el;}
 function action(parent,name,text,ids){return button(parent,name,text,()=>{const issue=model.execute(name,typeof ids==='function'?ids():[]);if(!issue)selected.clear();update();say(issue||'你已執行「'+text+'」。請核對工作副本與操作紀錄。');});}
 function targetText(t){const origin=id=>d.rows.findIndex(r=>r.id===id)+2;return t.length===3?`原第 ${origin(t[0])}、${origin(t[1])} 列（比較時間以外的內容）`:`${letters[t[1]]}${origin(t[0])}（${d.columns[t[1]]}）`;}
 const guide=section('你的整理任務','你協助星港策展團隊整理次元交會動漫／遊戲展的志工回覆。全部資料為虛構示意，四關各自使用獨立副本。');
 const rules=node('details');rules.append(node('summary','查看資料規格'),node('p','A～I 必填；J 熟悉度選填。期待程度是 1～5 整數。只有同意招募，且未滿 18 歲已取得家長同意的回覆才符合規格。有效重複先保留到去重階段。'));guide.append(rules);
 const status=node('p');status.className='sheet-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
 function table(parent,title,rowIds,{selectable=false,marks=[],color='yellow'}={}){
  const wrap=node('div');wrap.className='sheet-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',title+'，可水平捲動');
  const t=node('table');t.append(node('caption',title));const head=node('thead'),hr=node('tr');
  ['原列號',...(selectable?['選取']:[]),...d.columns.map((c,k)=>letters[k]+' '+c)].forEach(text=>{const th=node('th',text);th.setAttribute('scope','col');hr.append(th);});head.append(hr);t.append(head);const body=node('tbody');
  for(const id of rowIds){const k=d.rows.findIndex(r=>r.id===id),r=d.rows[k],tr=node('tr'),th=node('th',String(k+2));th.setAttribute('scope','row');tr.append(th);
   if(selectable){const td=node('td'),el=node('input');el.type='checkbox';el.setAttribute('aria-label','選取原第 '+(k+2)+' 列');el.checked=selected.has(id);el.onchange=()=>{el.checked?selected.add(id):selected.delete(id);changed();};td.append(el);tr.append(td);}
   r.cells.forEach((value,c)=>{const td=node('td',String(value));if(value==='')td.setAttribute('aria-label','空白儲存格');
    if(marks.some(([i,j])=>i===k&&j===c)){td.className='sheet-mark sheet-mark-'+color;td.append(node('small','〔已標記〕'));}tr.append(td);});body.append(tr);
  }t.append(body);wrap.append(t);parent.append(wrap);
  if(!rowIds.length)parent.append(node('p','目前沒有資料列。'));
 }
 const allIds=d.rows.map(r=>r.id);
 if(d.round===0){
  const s=section('A. 封存與辨識','收件已截止。你先核對原始回覆，再選流程、完整備份與四個指定案例的分類。');
  table(s,'原始回覆',allIds);
  select(s,'flowChoice','你會依哪個順序處理？',d.options.flows.map((v,k)=>[k,v]),()=>model.controls().flowChoice,v=>model.set('flowChoice',v===''?'':Number(v)));
  select(s,'backupChoice','哪份備份完整？其他欄位已核對，請比較筆數、首列 G 欄與末列 B 欄。',d.task.backups.map((v,k)=>[k,`${['甲','乙','丙'][k]}：${v[0]} 筆／首列 G：${v[1]||'空白'}／末列 B：${v[2]}`]),()=>model.controls().backupChoice,v=>model.set('backupChoice',v===''?'':Number(v)));
  d.task.targets.forEach((t,k)=>select(s,'classification'+k,'你如何分類 '+targetText(t)+'？',d.options.classifications.map(v=>[v,v]),()=>model.controls().classifications[k],v=>{const c=model.controls().classifications;c[k]=v;model.set('classifications',c);}));
 }
 if(d.round===1){
  const a=section('A. 標記空白儲存格',`你要標記全部資料範圍 A2:J${d.rows.length+1} 的空白。顏色只提醒，不會自動排除。`);
  const range=(fromColumn,toColumn,fromRow=2)=>({fromColumn,toColumn,fromRow,toRow:d.rows.length+1});
  const ranges=[range('A','J'),range('G','H'),range('J','J'),range('A','J',1)];
  select(a,'range','套用範圍',ranges.map((r,k)=>[k,rangeText(r)]),()=>{const c=model.controls().range;return c?ranges.findIndex(r=>equal(r,c)):'';},v=>model.set('range',v===''?null:ranges[Number(v)]));
  choose(a,'rule','格式規則',['empty','numberGreaterThan5'],['儲存格為空白','數值大於 5']);choose(a,'color','標記色',['yellow','blue','pink'],['黃色','藍色','粉紅色']);action(a,'format','套用格式');panels.format=node('p');a.append(panels.format);
  const b=section('B. 排除無效回覆','你勾選要排除的列，再執行排除。本關保留有效的完全重複回覆。');panels.counts=node('p');panels.work=node('div');b.append(panels.counts,panels.work);action(b,'exclude','排除所選資料',()=>[...selected]);action(b,'restore','全部復原');
  const details=node('details');details.append(node('summary','查看已排除區與不可改寫的原始快照'));panels.excluded=node('div');details.append(panels.excluded);table(details,'不可改寫的原始快照',allIds);b.append(details);
  const c=section('C. 確認全部排除原因',`你核對原第 ${d.rows.findIndex(r=>r.id===d.task.reasonRow)+2} 列，選出所有構成排除的原因。`);table(c,'指定列查核',[d.task.reasonRow]);
  const field=node('fieldset');field.append(node('legend','你認為有哪些排除原因？可複選。'));c.append(field);
  d.options.reasons.forEach((v,k)=>check(field,'reason'+k,v,()=>model.controls().reasonSelection.includes(v),on=>model.set('reasonSelection',d.options.reasons.filter(x=>x===v?on:model.controls().reasonSelection.includes(x)))));
 }
 if(d.round===2){
  const a=section('A. 設定移除重複工具',`你拿到已清理的獨立副本。範圍 A1:J${d.rows.length+1}，每次執行從初始副本重算，保留相同鍵值的原順序第一筆。`);
  check(a,'hasHeader','資料包含欄名',()=>model.controls().hasHeader,v=>model.set('hasHeader',v));
  const field=node('fieldset');field.append(node('legend','你要比對哪些欄位？'));a.append(field);refs.columns=field;
  button(field,'allColumns','全選欄位',()=>{model.set('columns',letters);update();});button(field,'noColumns','取消全選',()=>{model.set('columns',[]);update();});
  letters.forEach((c,k)=>check(field,'column'+c,c+' '+d.columns[k],()=>model.controls().columns.includes(c),on=>model.set('columns',letters.filter(x=>x===c?on:model.controls().columns.includes(x)))));
  action(a,'dedupe','執行移除重複資料');action(a,'undoDedupe','復原');panels.counts=node('p');a.append(panels.counts);
  const b=section('B. 核對實際結果');panels.work=node('div');b.append(panels.work);const details=node('details');details.append(node('summary','查看被移除列與初始副本'));panels.removed=node('div');details.append(panels.removed);table(details,'初始工作副本',allIds);b.append(details);
  choose(b,'conflictChoice','同代號但內容不同的回覆，你會怎麼處理？',['reviewBoth','latest'],['兩筆暫留，交窗口核對','只保留最新一筆']);
 }
 if(d.round===3){
  const a=section('A. 篩選指定的有效回覆',`你拿到已清理並去重的獨立副本。請找出 ${d.task.group}、可到 ${d.task.slot} 場的第一志願分布。兩個條件要同時符合，雙時段在本場只計一次；篩選只隱藏資料。`);
  choose(a,'group','組別等於',d.options.groups);choose(a,'slot','可到場時段包含',d.options.slots);action(a,'filter','套用篩選');action(a,'clearFilter','清除篩選');panels.counts=node('p');panels.work=node('div');a.append(panels.counts,panels.work);
  const original=node('details');original.append(node('summary','查看完整的不可改寫副本'));table(original,'完整的有效回覆副本',allIds);a.append(original);
  const b=section('B. 建立你的統計表','你依目前顯示的回覆填寫職務筆數；沒有回覆可填 0。填好後按「記錄統計」。');
  d.options.jobs.forEach((j,k)=>numeric(b,'count'+k,j+'有效回覆筆數',()=>model.controls().counts[k],v=>{const c=model.controls().counts;c[k]=v;if(!model.set('counts',c)){c[k]='';model.set('counts',c);}}));action(b,'counts','記錄統計');panels.total=node('p');b.append(panels.total);
  const c=section('C. 產生圓餅圖','你用自己輸入的統計製圖。修改篩選、統計、來源或標題後，圖表與分析會失效，請重新製圖。');
  choose(c,'sourceChoice','圖表資料來源',['filtered','originalSummary'],d.options.sources);
  select(c,'titleChoice','圖表標題',d.options.titles.map((t,k)=>[k,t]),()=>model.controls().titleChoice,v=>model.set('titleChoice',v===''?'':Number(v)));action(c,'pie','產生圓餅圖');panels.chart=node('div');panels.chart.setAttribute('aria-live','polite');c.append(panels.chart);
  numeric(c,'percent',`${d.options.jobs[d.task.query]}占有效回覆百分之幾？四捨五入到小數 1 位。`,()=>model.controls().percent,v=>{if(!model.set('percent',v))model.set('percent','');},{max:100,step:0.1});
  const e=section('D. 提出補招初步建議','你比較需求與回覆差距。這是有效回覆筆數與補招參考，不能當作實際志工人數或最終排班。');panels.demand=node('div');e.append(panels.demand);
  select(e,'priorityJob','你會優先補招哪個職務？',d.options.jobs.map((j,k)=>[k,j]),()=>model.controls().priorityJob,v=>model.set('priorityJob',v===''?'':Number(v)));
  choose(e,'priorityReason','你採用什麼理由？',['demandGap','fewestReplies'],['比較需求與回覆的正缺口','回覆筆數最少，所以一定最缺人']);
 }
 const log=section('你的有效操作紀錄','這裡只保留目前仍有效、可重新套用的操作。復原與訂正沒有次數限制。'),logList=node('ol');log.append(logList);
 function draw(sync=true){
  if(sync)bindings.forEach(run=>run());
  const c=model.controls(),r=model.results();
  if(d.round===1){const f=model.operation('format');panels.format.textContent=f?`已套用 ${rangeText(f.range)}／${f.rule==='empty'?'空白':'數值大於 5'}：${r.marked.length} 格已標記。`:'尚未套用格式。';
   if(f&&!equal({range:c.range,rule:c.rule,color:c.color},{range:f.range,rule:f.rule,color:f.color}))panels.format.textContent+=' 目前設定已修改，請重新套用。';
   panels.counts.textContent=`原始 ${allIds.length} 筆／已排除 ${r.excludedRowIds.length} 筆／剩餘 ${r.keptRowIds.length} 筆。`;
   panels.work.replaceChildren();table(panels.work,'工作副本',r.keptRowIds,{selectable:true,marks:r.marked,color:f?.color});panels.excluded.replaceChildren();table(panels.excluded,'已排除資料',r.excludedRowIds);
   r.excludedRowIds.forEach(id=>button(panels.excluded,'restoreRow','恢復原第 '+(allIds.indexOf(id)+2)+' 列',()=>{model.execute('restore',[id]);update();root.querySelector('[data-sheet-action="restore"]')?.focus();say('你已恢復這筆回覆。');}));
  }
  if(d.round===2){panels.counts.textContent=(model.operation('dedupe')?'已執行。':'尚未執行。')+`初始 ${allIds.length} 筆／移除 ${r.removedRowIds.length} 筆／剩餘 ${r.keptRowIds.length} 筆。`+(!c.hasHeader?' 請重新核對範圍與欄名設定。':'');
   panels.work.replaceChildren();table(panels.work,'工作副本保留資料',r.keptRowIds);panels.removed.replaceChildren();table(panels.removed,'本次移除資料',r.removedRowIds);
  }
  if(d.round===3){
   const f=model.operation('filter'),co=model.operation('counts'),pi=model.operation('pie');panels.counts.textContent=(f?`已篩選：${f.group||'全部組別'}／${f.slot||'全部時段'}。`:'尚未套用篩選。')+`可見 ${r.visibleRowIds.length} 筆／完整副本 ${allIds.length} 筆。`;
   panels.work.replaceChildren();table(panels.work,'目前可見的有效回覆',r.visibleRowIds);
   panels.total.textContent=co?`已記錄統計：合計 ${co.values.reduce((a,b)=>a+b,0)} 筆。`:'尚未記錄完整統計。';panels.chart.replaceChildren();
   if(pi){const counts=co.values,total=counts.reduce((a,b)=>a+b,0),figure=node('figure');figure.append(node('figcaption',d.options.titles[pi.titleChoice]+'；來源：'+d.options.sources[0]),node('p',`篩選：${f.group||'全部組別'}／${f.slot||'全部時段'}。`));
    if(total){const canvas=node('canvas');canvas.width=260;canvas.height=260;canvas.className='sheet-pie';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',d.options.jobs.map((j,k)=>`${j} ${counts[k]} 筆 ${(percentTenths(counts,k)/10).toFixed(1)}%`).join('，'));const ctx=canvas.getContext('2d');let start=-Math.PI/2;counts.forEach((v,k)=>{const end=start+v/total*Math.PI*2;ctx.fillStyle=['#79c8d8','#f5b36c','#bfafe9'][k];ctx.beginPath();ctx.moveTo(130,130);ctx.arc(130,130,122,start,end);ctx.closePath();ctx.fill();start=end;});figure.append(canvas);}
    else figure.append(node('p','合計 0 筆，沒有可繪製的比例。'));
    const ul=node('ul');d.options.jobs.forEach((j,k)=>{const li=node('li'),swatch=node('span');swatch.className='sheet-swatch sheet-job-'+k;swatch.setAttribute('aria-hidden','true');li.append(swatch,node('span',`${j}：${counts[k]} 筆，${(percentTenths(counts,k)/10).toFixed(1)}%`));ul.append(li);});figure.append(ul);panels.chart.append(figure);
   }else panels.chart.append(node('p','尚未製圖，或上游已修改。請用目前的篩選與統計重新製圖。'));
   panels.demand.replaceChildren();const t=node('table');t.append(node('caption','指定組別及場次的需求與你填寫的回覆'));const hr=node('tr');['職務','需求','你填寫的回覆','參考缺口'].forEach(v=>hr.append(node('th',v)));t.append(hr);
   const counts=c.counts.map(v=>v===''?null:Number(v));d.options.jobs.forEach((j,k)=>{const tr=node('tr');[j,d.task.demand[k],counts[k]??'尚未填寫',counts[k]===null?'尚未計算':Math.max(d.task.demand[k]-counts[k],0)].forEach(v=>tr.append(node('td',String(v))));t.append(tr);});const wrap=node('div');wrap.className='sheet-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','需求與回覆比較，可水平捲動');wrap.append(t);panels.demand.append(wrap);
  }
  logList.replaceChildren();const ops=model.get().ops;
  for(const o of ops)logList.append(node('li',({format:'套用格式 '+rangeText(o.range),exclude:'排除 '+(o.rowIds?.length||0)+' 筆',dedupe:'依所選欄位移除重複',filter:'篩選 '+(o.group||'全部組別')+'／'+(o.slot||'全部時段'),counts:'記錄你的統計',pie:'依目前篩選與統計製圖'})[o.op]));
  if(!ops.length)logList.append(node('li','目前沒有有效操作。'));
 }
 function missing(){const out=model.missing();
  // HTML number 欄位可能暫存非法／部分值，不能以模型上一個有效值送出。
  for(const [key,el] of Object.entries(refs))if(el.type==='number'){
   const v=el.value,ok=numericValid(key,v);
   if(!ok&&!out.some(f=>f.key===key))out.push({key,reason:key==='percent'?'請填 0～100 的百分比，最多小數一位。':'請填 0～14 的整數。'});
  }return out;
 }
 host.append(root);draw();
 const handle={get:()=>model.get(),ready:()=>missing().length===0,readyReason:()=>missing()[0]?.reason||'',fields:()=>missing().map(({key,reason})=>({target:refs[key]||root,reason})),
  draft:()=>({...model.draft(),selectedRowIds:[...selected],inputValues:Object.fromEntries(Object.entries(refs).filter(([,el])=>el.type==='number').map(([k,el])=>[k,el.value]))}),
  restoreDraft(value){if(!keys(value,['version','datasetToken','controls','ops','inputValues','selectedRowIds']))return false;
   const {inputValues,selectedRowIds,...saved}=value,numberKeys=Object.entries(refs).filter(([,el])=>el.type==='number').map(([k])=>k);
   if(!keys(inputValues,numberKeys)||!list(selectedRowIds,d.rows.length,id=>allIds.includes(id))||Object.values(inputValues).some(v=>typeof v!=='string'||v.length>16))return false;
   if(Object.entries(inputValues).some(([k,v])=>(numericValid(k,v)?v:'')!==(k==='percent'?saved.controls?.percent:saved.controls?.counts?.[Number(k.slice(5))])))return false;
   if(!model.restoreDraft(saved))return false;
   selected.clear();selectedRowIds.forEach(id=>selected.add(id));draw();for(const [k,v] of Object.entries(inputValues))refs[k].value=v;changed();return true;},
  dispose(){disposed=true;selected.clear();for(const el of root.querySelectorAll('button'))el.onclick=null;for(const el of root.querySelectorAll('input')){el.oninput=null;el.onchange=null;}for(const el of root.querySelectorAll('select'))el.oninput=null;root.remove();}};
 // 只有教師示範 renderer 具有此入口；解答不寫進 draft 或持久儲存。
 if(api.demonstration){
  handle.draft=()=>null;handle.restoreDraft=()=>false;
  handle.applyTeacherSolution=answer=>{if(!model.applyTeacherSolution(answer))return false;selected.clear();draw();say('你已套入教師授權的操作與說明，可逐項對照。');return true;};
 }
 return handle;
}
