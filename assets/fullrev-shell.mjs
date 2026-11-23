// 共用活動外框：只呈現授權題面，不含題庫、答案或判題。
import {growth} from './fullrev-progress.mjs';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const text=value=>Array.isArray(value)?value.join(''):value||'';
const para=(host,value)=>{if(value){const p=node('p',text(value));host.append(p);return p;}};
// 舊活動公開說明的版面副本；不含題庫、答案或判題。
const outcomeNotes={
 "7": "<div class=\"quest-note\"><p>星港策展團隊委託你設計「次元交會動漫／遊戲展」志工報名表。你要讀懂招募需求，修好蒐集內容、表單結構與發布設定；展開「備用素材」即可查看本組委託附件。</p><p>每關答對兩組不同資料才完成；答錯可修正，不扣分。答對後按「下一組」繼續。</p></div>",
 "8": "<div class=\"quest-note\"><p>你協助虛構音樂活動團隊整理素材。全部為示意資料，不填你或別人的真實個資。</p><p>每關答對兩組不同資料才完成；答錯可修正，不扣分。同一份個人檔案分開保留第一組、第二組及任務版本，不必每次重建。</p><p>成果作答無法證明實際操作，請保留檔案讓老師巡堂抽查。設備或權限受阻時，展開「備用素材」當場作答並記錄「未實際操作」。紀錄只存在此瀏覽器，不會上傳，也不會自動完成其他關卡。</p><details><summary>既有紀錄如何對應</summary><p>原第 1～4 關依索引對應目前第 1～4 關；舊紀錄保留，但不代表已完成新版備份、條件式格式、去重與圖表實作。</p></details> <p><strong>你先依老師安排觀看 2-16、2-17、2-18，再完成四關。</strong></p></div>",
 "9": "<div class=\"quest-note\"><p>你協助虛構音樂活動團隊整理素材。全部為示意資料，不填你或別人的真實個資。</p><p>每關答對兩組不同資料才完成；答錯可修正，不扣分。同一份個人檔案分開保留第一組、第二組及任務版本，不必每次重建。</p><p>成果作答無法證明實際操作，請保留檔案讓老師巡堂抽查。設備或權限受阻時，展開「備用素材」當場作答並記錄「未實際操作」。紀錄只存在此瀏覽器，不會上傳，也不會自動完成其他關卡。</p><details><summary>既有紀錄如何對應</summary><p>原燈牌解壓縮、燈牌壓縮、失真判斷、格式選擇的第 1～4 關紀錄，仍保留在相同索引；新版第 1 關是轉換，第 2 關合併燈牌，第 3、4 關加入素材實作，舊紀錄不代表做過新增操作。</p></details> <p><strong>今天必做第 1、2 關；第 3、4 關另排時間完成。兩支影片 2-19（6:57）、2-20（8:26）都在課內完整播放。第 33 分開始獨立後測，停止教材、e 度與同儕協助；未完成操作請如實告知老師，不為趕進度勾成完成。文字轉語音由影片與配對涵蓋，不另做酷英實作。</strong></p></div>"
};
export async function mountStudentLogin({client,host,onLogin,explain}){
 const form=node('form');form.className='ybs-login';form.autocomplete='off';
 form.innerHTML=`<label>帳號<input name="account" inputmode="text" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="cgjh＋學號"></label><div><label for="activity-password">密碼</label><div class="ybs-password"><input id="activity-password" name="password" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="cgjh＋身分證字號"><input type="button" class="ybs-password-toggle" value="顯示" aria-label="顯示密碼" aria-pressed="false" aria-controls="activity-password"><svg class="ybs-password-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></div></div><button type="submit" class="btn primary">登入</button>`;
 const account=form.querySelector('[name="account"]'),password=form.querySelector('[name="password"]'),submit=form.querySelector('button'),toggle=form.querySelector('.ybs-password-toggle');
 toggle.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.value=show?'隱藏':'顯示';toggle.setAttribute('aria-label',show?'隱藏密碼':'顯示密碼');toggle.setAttribute('aria-pressed',String(show));};
 const error=node('div');error.className='gerr';error.setAttribute('role','alert');
 const secondary=node('details');secondary.className='tlogin';secondary.append(node('summary','教師／登入不了'));const actions=[submit];
 async function run(kind){
  if(submit.disabled)return;actions.forEach(b=>b.disabled=true);submit.textContent='登入中…';error.textContent='';
  try{const p=await client.login(kind,account.value,password.value);password.value='';await onLogin(p);}
  catch(e){password.value='';error.textContent=/invalid-account|auth\/(?:invalid|wrong|user-not)/.test(e.code||'')?'帳號或密碼不對，請再確認；還是不行請告訴老師。':explain(e);}
  finally{actions.forEach(b=>b.disabled=false);submit.textContent='登入';}
 }
 form.onsubmit=e=>{e.preventDefault();return run('password');};
 for(const [label,kind] of [['學生 Google 登入','google'],['老師核發訪客／本機練習','guest'],['教師 Google 登入','owner']]){const b=node('button',label);b.type='button';b.className='linkbtn';b.onclick=()=>run(kind);actions.push(b);secondary.append(b);}
 host.append(form,error,secondary);
}
export async function mountActivityShell({client:promise,cfg,mountLogin,xpCore,explain}){
 const css=node('link');css.rel='stylesheet';css.href='/assets/fullrev-shell.css?v=20261122shell';document.head.append(css);
 const activity=typeof ACTIVITIES==='undefined'?null:ACTIVITIES.find(a=>a.course===cfg.course&&a.week===cfg.week);
 const week=cfg.termWeek??(activity&&typeof termWeekOf==='function'?termWeekOf(activity):null);
 const title=week?`第 ${week} 週｜${cfg.title}`:cfg.title;
 const info=()=>cfg.rounds[round];
 const gate=node('section');gate.className='gate fullrev-activity';gate.id='gate';gate.append(node('h1',title));
 const login=node('div');login.id='g-gbtn';gate.append(login);
 const identityBox=node('div');identityBox.id='g-who';identityBox.hidden=true;identityBox.innerHTML='<p id="g-whotext" aria-live="polite"></p><div class="btns" style="justify-content:center"><button type="button" class="btn" id="g-notme">不是我</button><button type="button" class="btn primary" id="g-isme" hidden>對，開始</button></div>';gate.append(identityBox);
 const main=node('div');main.className='wrap fullrev-activity';main.id='main';main.hidden=true;
 main.innerHTML=`<header class="top"><div class="activity-heading"><div class="title-rounds"><h1 id="activity-title"></h1><nav class="rounds" id="rounds" aria-label="關卡"></nav></div><div class="who-bar"><a href="../../" class="linkbtn">← YBS Lab</a><span><b id="who"></b></span><button class="linkbtn" id="b-swap" type="button">不是我？換人</button><span class="upload-status" aria-live="polite"><span class="sync" id="sync" hidden></span><button class="sync warn" id="b-retry" type="button" hidden>重試上傳</button></span><details id="activity-tools"><summary class="linkbtn">教師／登入不了</summary></details></div></div><aside class="xp-header" id="xp-header" hidden aria-live="polite"><a href="../me/" title="查看我的成長紀錄"><b id="xp-level">成長紀錄</b><span class="xp-mono" id="xp-total">載入中…</span><progress id="xp-progress" max="1" value="0" aria-label="升級進度" hidden></progress><span class="small" id="xp-next">等待雲端紀錄</span></a></aside></header><section class="sec" id="task-instructions"><h2 class="sec-h"><span class="num">1</span>任務說明</h2><div class="order" id="says" aria-live="polite"></div></section><section class="sec"><div id="original-work"><p class="round-status" id="round-status" aria-live="polite" aria-atomic="true"></p><div class="work-heading"><h2 class="sec-h"><span class="num">2</span>動手做</h2><button class="btn" id="b-hint" type="button" title="先試著送出一次，就能看提示。" disabled>我需要提示</button></div><div id="stage"></div><div class="btns"><button class="btn primary" id="b-send" type="button" disabled>送出</button><span class="small" id="answer-status" aria-live="polite" aria-atomic="true">作答中</span><span class="streak" id="streak"></span><span class="small" id="send-hint"></span></div><section class="verdict" id="verdict" hidden aria-live="polite"></section></div><aside class="hint-ladder" id="hint-ladder" aria-label="提示階梯"><div id="hint-content" aria-live="polite" aria-atomic="true"></div></aside></section><p class="foot">© 2026 YBS Lab　<a href="../../about/#h-rights" style="color:inherit">保留所有權利，未經同意請勿轉載或改作</a></p>`;
 let clientWarmupReset=()=>{};
 // 暖身只用公開活動導覽做回想，不載入舊站答案題庫，也不上傳。
 const previous=typeof ACTIVITIES==='undefined'?[]:ACTIVITIES.filter(a=>a.course===cfg.course&&a.date&&activity?.date&&a.date<activity.date&&(typeof isActivityOpen!=='function'||isActivityOpen(a))).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
 if(previous.length){
  const warm=node('section');warm.id='warmup';warm.className='warmup';
  const resetWarmup=()=>{warm.replaceChildren(node('h2','開場暖身 '+previous.length+' 題'));para(warm,'快速複習前幾週，可隨時跳過；不影響過關、成績或 XP，答案不上傳。');
   const skip=node('button','跳過暖身'),begin=node('button','開始暖身');skip.type=begin.type='button';skip.className=begin.className='btn';skip.onclick=()=>{warm.hidden=true;};
   const show=i=>{warm.replaceChildren(node('h2','暖身 '+(i+1)+'／'+previous.length));para(warm,'回想「'+previous[i].title+'」：你用了什麼方法完成任務？');
    for(const label of ['還記得','想再複習','跳過暖身']){const b=node('button',label);b.type='button';b.className='btn';b.onclick=()=>{if(label==='跳過暖身'||i+1===previous.length)warm.hidden=true;else show(i+1);};warm.append(b);}};
   begin.onclick=()=>show(0);warm.append(skip,begin);};resetWarmup();
  main.querySelector('header').insertAdjacentHTML('afterend','<div id="warmup-slot"></div>');main.querySelector('#warmup-slot').append(warm);
  clientWarmupReset=()=>{warm.hidden=false;resetWarmup();};
 }
 const lock=node('div');lock.id='activity-lock';lock.hidden=true;
 lock.innerHTML=`<div><h1>這個活動還沒開放</h1><p>請回到 YBS Lab 首頁，做老師這週指定的活動。</p><p><a href="/">← 回 YBS Lab 首頁</a></p><p class="activity-unlock"><button type="button" class="linkbtn">教師解鎖</button></p></div>`;
 document.body.replaceChildren(gate,main,lock);
 const $=id=>main.querySelector('#'+id),status=$('sync'),send=$('b-send'),verdict=$('verdict'),stage=$('stage'),nav=$('rounds');
 $('activity-title').textContent=title;
 let client;try{client=await promise;}catch(e){para(login,explain(e));return;}
 let round=0,handle=null,last=null,key='',mode='loading',sentValue='',submitted=false,hint=0,identity='',revision=0,read=0,starting=false,reading=false,snapshot=null,result=null,before=null,lastLearning='',pairTimer=null,refreshAgain=false;
 // 開始前先選關，避免先建立第 0 關的 Worker session；重整沿用本人最後一關。
 const firstRound=Math.max(0,cfg.rounds.findIndex(r=>r.managed!==false));
 const roundKey=()=>`ybs:fullrev:round:${client.project}:${cfg.course}:${cfg.week}:${client.state().profile?.uid}`;
 const chooser=node('select');chooser.id='g-round';chooser.setAttribute('aria-label','開始關卡');
 cfg.rounds.forEach((r,i)=>{if(r.managed===false)return;const option=node('option',r.name);option.value=i;chooser.append(option);});
 const chooseLabel=node('label','開始關卡：');chooseLabel.append(chooser);identityBox.append(chooseLabel);
 function restoreRound(){
  round=firstRound;
  try{const saved=sessionStorage.getItem(roundKey());const n=Number(saved);if(saved!==null&&Number.isInteger(n)&&cfg.rounds[n]&&cfg.rounds[n].managed!==false)round=n;}catch{}
  chooser.value=round;
 }
 const catalog=()=>typeof ACTIVITIES==='undefined'?[]:ACTIVITIES.filter(a=>a.course===cfg.course);
 const say=value=>{const label=client.state().pending?'上傳中，請稍候，答案已保留。':value||(last?.completed&&mode!=='passed'?'上傳中，正在確認雲端紀錄…':result?'✓ 雲端紀錄已確認':'');status.textContent=label;status.hidden=!label;status.className='sync'+(label.startsWith('✓')?' ok':'');};
 const tool=(label,run)=>{const b=node('button',label);b.type='button';b.className='linkbtn';b.onclick=run;$('activity-tools').append(b);return b;};
 const restart=tool('重新開始',()=>start(round,true)),claims=tool('老師已核發，重新確認',async()=>{try{await client.refreshClaims();await start(round,true);}catch(e){problem(e);}}),practice=tool('本機練習／示範',()=>{
  revision++;handle?.dispose?.();handle=null;last=null;stage.replaceChildren();mode='practice';verdict.hidden=true;send.disabled=true;say('本機練習／教師示範，不送出成績。');
  stage.append(node('h3','這一關的說明'));if(typeof cfg.demonstrate==='function')cfg.demonstrate(stage);else para(stage,'請依這一關的任務說明練習。');
 });
 const reread=tool('重新讀取',()=>refresh());reread.hidden=true;
 const gateReread=node('button','重新讀取');gateReread.type='button';gateReread.className='btn';gateReread.id='g-reread';gateReread.hidden=true;gateReread.onclick=()=>refresh();identityBox.append(gateReread);
 // 每個本人／控制版本只查一次單筆名冊；不列名單、不持久保存，也不作為作答授權。
 let person=null,personKey='';
 async function readPerson(value){
  const profile=client.state().profile;
  if(!profile||profile.owner||!['google.com','password'].includes(profile.provider))return null;
  const cacheKey=JSON.stringify([profile.uid,value.subject,value.controlVersions]);
  if(cacheKey===personKey)return person;
  const {auth,db}=await client.session(),user=auth.currentUser;
  if(user?.uid!==profile.uid)return null;
  const {claims}=await user.getIdTokenResult();
  const provider=claims.firebase?.sign_in_provider;
  if(provider!==profile.provider||typeof claims.email!=='string'||provider==='google.com'&&claims.email_verified!==true)return null;
  const email=claims.email.toLowerCase();
  if(!(provider==='password'?/^cgjh\d{3,12}@ybslab-edu\.github\.io$/:/^[a-z0-9._%+-]+@cgjh\.hcc\.edu\.tw$/).test(email))return null;
  const ref=await db.doc(`ybsCourses/${cfg.course}/roster/${email.replace('@ybslab-edu.github.io','@cgjh.hcc.edu.tw')}`).get({source:'server'});
  const row=ref.exists&&!ref.metadata?.fromCache&&ref.data();
  return row?.schemaVersion===1&&row.active===true&&row.subject===value.subject
   &&Number.isInteger(row.cls)&&row.cls>=100&&row.cls<=999&&Number.isInteger(row.seat)&&row.seat>=1&&row.seat<=60
   ?{subject:row.subject,cls:row.cls,seat:row.seat}:null;
 }
 function confirmIdentity(){
  const confirm=identityBox.querySelector('#g-isme'),message=identityBox.querySelector('#g-whotext');
  const valid=!!result;confirm.hidden=!valid;gateReread.hidden=valid;
  if(!valid){message.textContent='身分尚未確認，請重新讀取或告訴老師。';return;}
  if(person){$('who').textContent=person.cls+' 班 '+person.seat+' 號';message.textContent='你是 '+person.cls+' 班 '+person.seat+' 號，對嗎？';}
  else{$('who').textContent='已登入';message.textContent='已登入，準備好開始了嗎？';}
 }
 function controls(){
  const state=client.state(),changed=handle&&JSON.stringify(handle.get())!==sentValue;
  send.disabled=!handle||(handle.ready&&!handle.ready())||mode!=='working'||state.pending||['sending','restart-required','stale'].includes(state.status)||starting||!changed&&submitted;
  $('send-hint').textContent=mode!=='working'?'':submitted&&!changed?'先修改答案再送出':handle&&(handle.ready&&!handle.ready())?'全部完成後才能送出。':'';
  $('answer-status').textContent=mode==='passed'?'過關':mode==='correct'?'已送出：答對':submitted&&!changed?'已送出：還不對':'作答中';
  restart.hidden=state.status!=='restart-required';claims.hidden=!['binding-pending','anonymous'].includes(mode)&&state.profile?.provider!=='anonymous';
  practice.hidden=!state.profile?.owner&&state.profile?.provider!=='anonymous'&&mode!=='binding-pending';
  $('b-retry').hidden=!state.pending;
  $('activity-tools').hidden=[restart,claims,practice,reread].every(b=>b.hidden);
 }
 function rounds(){
  nav.replaceChildren();cfg.rounds.forEach((r,i)=>{const passed=result?.records.some(r=>r.activity===cfg.week&&r.round===i);const b=node('button',r.name+(passed?' ✓':''));b.type='button';b.className=passed?'passed':'';b.dataset.i=i;b.setAttribute('aria-pressed',String(i===round));b.onclick=()=>start(i);nav.append(b);});
 }
 function count(n){
  $('round-status').textContent=`第 ${round+1} 關／共 ${cfg.rounds.length} 關．本關答對 ${n}/2`;
  const streak=$('streak');streak.replaceChildren();streak.textContent=`累積答對 ${n}/2 `;for(let i=0;i<2;i++){const mark=node('i');mark.className=i<n?'on':'';streak.append(mark);}
 }
 function hints(){
  const b=$('b-hint'),box=$('hint-content'),d=last?.question?.data;b.disabled=!submitted||hint>=2||mode!=='working';b.title=!submitted?'先試著送出一次，就能看提示。':'看提示不影響分數與經驗值。';box.replaceChildren();
  if(hint>=1){box.append(node('h3','第 1 層：方向'));para(box,d?.hint);}if(hint>=2){box.append(node('h3','第 2 層：拆步驟'));para(box,d?.guide);}
 }
 $('b-hint').onclick=()=>{if(submitted){hint=Math.min(2,hint+1);hints();}};
 function instructions(){
  $('says').replaceChildren();['現在','要做到'].forEach((label,k)=>{const span=node('span');span.className='tk';span.append(node('b',label),node('span',[info().now||last?.question?.instruction||info().name,info().goal||last?.question?.data?.task||'完成兩組不同資料。'][k]));$('says').append(span);});
 }
 function layoutOutcome(d){
  if(!d?.questions||!d.kinds)return;
  stage.classList.add('quest-outcome');
  const intro=stage.querySelector('.panel'),work=node('div');work.className='quest-work panel';
  if(intro){
   if(outcomeNotes[cfg.week]){const fragment=node('div');fragment.innerHTML=outcomeNotes[cfg.week];intro.replaceChildren(...fragment.firstChild.childNodes);}
   else{const heading=intro.querySelector('h3');if(heading)heading.hidden=true;}
   intro.className='quest-note';
  }
  const tables=stage.querySelectorAll('.fullrev-outcome-table');
  tables.forEach(wrap=>{const t=wrap.querySelector('table');t.className='quest-table';});
  let chartLabel=null;
  if(d.chartNames){
   const originalChart=stage.querySelector('[aria-label="人數長條圖"]'),chart=node('ul');chart.className='quest-chart';chart.setAttribute('aria-label','人數長條圖');
   stage.replaceChildren(...[...stage.childNodes].map(el=>el===originalChart?chart:el));
   const total=d.chartCounts.reduce((sum,n)=>sum+n,0);chartLabel=para(stage,'統計圖（由同一份回覆計算；單位：人）');
   d.chartNames.forEach((name,k)=>{const row=node('li'),track=node('span'),bar=node('span');row.className='quest-chart-row';track.className='track';bar.className='bar';bar.style.width=d.chartCounts[k]/total*100+'%';track.append(bar);row.append(node('span',name),track,node('span',d.chartCounts[k]+' 人'));chart.append(row);});
  }
  const children=[...stage.childNodes].filter(e=>e.nodeType===1&&e!==intro&&e.tagName!=='STYLE');
  const chart=stage.querySelector('.quest-chart');
  const summary=['form-summary','form-volunteer-summary'].includes(d.mode),volunteer=d.mode.startsWith('form-volunteer-');
  const task=text(d.guide).match(/任務\s+(\d+-\d+)/)?.[1];
  work.append(node('h3',task?(volunteer?'委託任務 ':'示意任務 ')+task:d.heading||info().name));
  const answers=node('div');answers.className='quest-answers';
  if(tables.length&&d.indexRows){const caption=node('caption','原始回覆（示意）');tables[0].querySelector('table').append(caption);}
  for(const el of children){
   if(el===chartLabel&&chart)continue;
   // 舊第 1 關表格後直接接統計圖，不再重述任務說明中的目標。
   if(summary&&el.tagName==='P'&&el.textContent===text(d.passages))continue;
   if(el.tagName==='LABEL'){answers.append(el);continue;}
   if(el===chart&&chartLabel)work.append(chartLabel);
   if(el.tagName==='DETAILS'&&el.querySelector('[data-fallback]')){el.className='quest-fallback';el.hidden=summary;}
   work.append(el);
  }
  work.append(answers);stage.append(work);
 }
 function showQuestion(value){
  stage.classList.remove('quest-outcome');stage.dataset.round=round;
  const carry=handle?.carry?.();handle?.dispose?.();stage.replaceChildren();handle=null;
  if(typeof cfg.renderQuestion!=='function')throw Error('renderer-pending');
  handle=cfg.renderQuestion(value.question,stage,{changed:controls,carry:value.photoAnswer||value.performanceOrder||carry,demonstration:false,shell:true});layoutOutcome(value.question.data);mode='working';sentValue='';submitted=false;verdict.hidden=true;count(value.question.slot);instructions();hints();controls();
 }
 function problem(e){
  if(e.code==='identity-changed'||!client.state().profile)return;
  if(e.code==='not-open'){lock.hidden=false;main.hidden=true;gate.hidden=true;mode='closed';}
  else{if(e.code==='binding-pending')mode='binding-pending';say(e.code==='pending'?'上傳中，請稍候，答案已保留。':explain(e));if(['retry-later','read-model-pending'].includes(e.code))reread.hidden=false;}
  controls();
 }
 async function receive(value){
  if(value.activity!==undefined&&(value.activity!==cfg.week||value.round!==round))return;
  const k=JSON.stringify([value.sid,value.nextSeq,value.completed,value.correct]);if(k===key)return;key=k;
  const old=last;last=value;starting=false;lastLearning=old?.question?.data?.learning||lastLearning;
  if(value.photo&&!handle)showQuestion({...value.photo,photoAnswer:value.photoAnswer});
  if(value.performance){if(!handle&&value.performance.question)showQuestion({question:value.performance.question});handle?.feedback?.(value.performance);}
  if(value.awaitingTeacher){mode='teacher-pending';say('等待老師確認');controls();return;}
  if(value.completed){mode='confirming';send.disabled=true;say('上傳中，正在確認雲端紀錄…');await refresh();return;}
  if(value.question.slot===1&&(value.photoAnswer||value.performanceOrder)){
   showQuestion(value);mode='confirming';controls();const g=revision;
   if(!pairTimer)pairTimer=setTimeout(async()=>{pairTimer=null;if(g!==revision)return;try{await receive(await client.answer(cfg.week,round,value.photoAnswer||value.performanceOrder));}catch(e){problem(e);}},0);
  }else if(value.correct===true&&value.question.slot===1){
   mode='correct';count(1);verdict.className='verdict mid';verdict.replaceChildren(node('h3','答對了！累積答對 1/2'));para(verdict,'按「下一組」挑戰不同資料，累積答對 2/2 就過關。');
   const btns=node('div'),b=node('button','下一組');btns.className='btns';b.type='button';b.className='btn primary';b.id='b-next-group';b.onclick=()=>{if(mode==='correct'){showQuestion(last);$('task-instructions').scrollIntoView?.({block:'start'});}};btns.append(b);verdict.append(btns);verdict.hidden=false;say('');
  }else if(value.correct===false&&handle&&old?.sid===value.sid&&old.question?.slot===value.question.slot){
   mode='working';submitted=true;hint=Math.min(2,hint+1);verdict.className='verdict no';verdict.replaceChildren(node('h3','還不對'));para(verdict,value.feedback||'請再核對這一組的題目與資料。');para(verdict,'修改答案後再送一次').className='small';verdict.hidden=false;hints();say('');
  }else{showQuestion(value);say('');}controls();
 }
 function passed(){
  if(client.state().pending||!last?.completed||!result?.records.some(r=>r.activity===cfg.week&&r.round===round))return;
  mode='passed';count(2);verdict.className='verdict ok';verdict.replaceChildren(node('h3','過關！'));para(verdict,info().learn||lastLearning||'你已完成這一關的兩組挑戰。');
  const item=result.activities.find(a=>a.activity===cfg.week),detail=item.rounds[round],old=before?.activities.find(a=>a.activity===cfg.week);
  if(old?.rounds[round]?.passed)para(verdict,'這關已領過 XP。');else{
   const bits=['+'+detail.passXP+' 過關'];if(detail.onTimeXP)bits.push('+'+detail.onTimeXP+' 準時');if(item.completeXP>(old?.completeXP||0))bits.push('+'+item.completeXP+' 全過');para(verdict,'本關 XP：'+bits.join('、')).className='xp-detail';
   if(before&&result.level>before.level){const card=node('div');card.className='xp-title-card';card.append(node('strong','升級！Lv '+result.level));para(card,result.title);verdict.append(card);}
  }
  const btns=node('div');btns.className='btns';if(round+1<cfg.rounds.length){const b=node('button','下一關');b.type='button';b.className='btn primary';b.onclick=()=>start(round+1);btns.append(b);}else para(btns,item.passed===cfg.rounds.length?'全部過關！':`這一關完成了！這個活動目前完成 ${item.passed}／${cfg.rounds.length} 關。`);verdict.append(btns);verdict.hidden=false;hint=0;submitted=false;hints();say('✓ 紀錄已上傳給老師');controls();
 }
 async function refresh(){
  if(!client.state().profile||client.state().profile.owner)return;if(reading){refreshAgain=true;return;}
  reading=true;const n=++read,g=revision;
  try{
   const fresh=await client.progress({activities:catalog()});const xp=await xpCore();if(n!==read||g!==revision)return;
   const cacheKey=JSON.stringify([client.state().profile.uid,fresh.subject,fresh.controlVersions]);
   const currentPerson=await readPerson(fresh).catch(()=>null);if(n!==read||g!==revision)return;
   snapshot=fresh;person=currentPerson;personKey=cacheKey;
   const value=growth(snapshot,{project:client.project,course:cfg.course,subject:snapshot.subject,provider:snapshot.provider,activities:catalog()},xp);
   result=value.state==='confirmed'?value:null;reread.hidden=!!result;
   confirmIdentity();if(!result){say(explain(value));return;}
   $('xp-header').hidden=false;$('xp-level').textContent='Lv '+result.level+' '+result.title;$('xp-total').textContent=result.totalXP+' XP';$('xp-progress').hidden=false;$('xp-progress').value=result.progress;$('xp-next').textContent=result.next===null?'已達最高等級':'下一級還差 '+result.remaining+' XP';
   rounds();if(last?.completed)passed();else say('');
  }catch(e){if(n===read&&g===revision){result=null;reread.hidden=false;confirmIdentity();problem(e);}}
  finally{if(n===read){controls();reading=false;if(refreshAgain){refreshAgain=false;refresh();}}}
 }
 async function start(i=round,reopen=false){
  // 待送時保留目前題面；重整後尚無題面，須讓 client.start 續傳同關草稿。
  if(starting||client.state().pending&&(handle||i!==round||reopen))return;
  // Worker 一次只保留一個作答 session；先續作原關，保留答案與累積次數。
  if(i!==round&&last&&!last.completed){say('請先完成第 '+(round+1)+' 關，再切換其他關卡；目前答案已保留。');return;}
  round=i;chooser.value=i;
  try{sessionStorage.setItem(roundKey(),String(i));}catch{}
  const g=++revision;read++;reading=false;handle?.dispose?.();handle=null;last=null;key='';mode='loading';lastLearning='';clearTimeout(pairTimer);pairTimer=null;hint=0;submitted=false;starting=true;before=result;delete stage.dataset.questionType;delete stage.dataset.slot;delete stage.dataset.round;stage.replaceChildren();verdict.hidden=true;instructions();rounds();count(0);hints();controls();
  if(client.state().profile?.owner){starting=false;mode='practice';controls();practice.onclick();return;}
  if(info().managed===false){starting=false;mode='unmanaged';say('這一關尚待老師確認，請選其他關卡。');controls();return;}
  say('載入中…');
  try{const value=await client.start(cfg.week,round,{restart:reopen});if(g===revision)await receive(value);}
  catch(e){if(g===revision)problem(e);}finally{if(g===revision){starting=false;controls();}}
 }
 send.onclick=async()=>{
  if(send.disabled||!handle)return;sentValue=JSON.stringify(handle.get());submitted=true;const g=revision;send.disabled=true;
  try{const value=await client.answer(cfg.week,round,handle.get());if(g===revision)await receive(value);}
  catch(e){if(g===revision)problem(e);}finally{if(g===revision)controls();}
 };
 $('b-retry').onclick=async()=>{try{const values=await client.retry();if(values.length)await receive(values.at(-1));}catch(e){problem(e);}};
 $('b-swap').onclick=()=>client.logout().catch(problem);
 identityBox.querySelector('#g-notme').onclick=$('b-swap').onclick;
 identityBox.querySelector('#g-isme').onclick=()=>{gate.hidden=true;main.hidden=false;return start(Number(chooser.value)).then(refresh);};
 lock.querySelector('button').onclick=()=>{lock.hidden=true;main.hidden=true;gate.hidden=false;login.hidden=false;identityBox.hidden=true;login.querySelector('details').open=true;};
 function clear(){clientWarmupReset();clearTimeout(pairTimer);pairTimer=null;handle?.dispose?.();revision++;read++;reading=false;starting=false;handle=null;last=null;key='';mode='loading';result=null;snapshot=null;person=null;personKey='';$('who').textContent='';identityBox.querySelector('#g-whotext').textContent='';before=null;stage.replaceChildren();verdict.hidden=true;$('xp-header').hidden=true;lock.hidden=true;main.hidden=true;gate.hidden=false;login.hidden=false;identityBox.hidden=true;say('');}
 client.subscribe(state=>{
  if(!state.profile){identity='';clear();return;}
  const id=state.profile.uid+':'+state.profile.owner;
  if(id!==identity){identity=id;restoreRound();
   $('who').textContent=state.profile.owner?'教師模式':state.profile.provider==='anonymous'?'訪客':'已登入';
   if(state.profile.owner||state.profile.provider==='anonymous'){gate.hidden=true;main.hidden=false;start(round);}
   else{
    gate.hidden=false;main.hidden=true;login.hidden=true;identityBox.hidden=false;
    const message=identityBox.querySelector('#g-whotext'),confirm=identityBox.querySelector('#g-isme');confirm.hidden=true;message.textContent='正在確認你的身分…';
    refresh();
   }
  }
  if(state.status==='stale'){clear();identity='';return;}
  if(state.readingRetry){identityBox.querySelector('#g-whotext').textContent='載入中，請稍候…';say('載入中，請稍候…（'+Math.max(1,Math.ceil((state.readingRetry.retryAt-Date.now())/1000))+' 秒後自動重試）');}
  else if(state.pending)say('上傳中，請稍候，答案已保留。');
  if(['ready','confirmation-pending','teacher-pending'].includes(state.status)&&state.view?.activity===cfg.week&&state.view.round===round)receive(state.view).catch(problem);
  controls();
 });
 await mountLogin({client,host:login,oldlook:true});
 try{await client.restore();}catch(e){para(login,explain(e));}
 const focus=()=>{if(client.state().profile){if(mode==='closed'){lock.hidden=true;main.hidden=false;start(round,true).then(refresh);}else if(!starting)refresh();}};
 window.addEventListener('focus',focus);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')focus();});window.addEventListener('pagehide',()=>{identity='';clear();});
}
