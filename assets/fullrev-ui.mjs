import {growth,exportRows} from './fullrev-progress.mjs?v=20261122legacy';

const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
const button=(text,run)=>{const b=node('button',text);b.type='button';b.className='btn';b.style.cssText='min-height:44px;margin:4px';b.onclick=run;return b;};
const messages={'report/rate-limited':'報告已保留，請在上一份交件滿 60 秒後重試。',pending:'尚未確認，答案已保留，稍後可重試。','retry-later':'請稍候再重試。',
  'invalid-answer':'答案格式不符，已保留同一題與填寫內容，請修改後再送出。',
  'restart-required':'授權或作答版本已變更，請重新開始這一關。','identity-changed':'身分已變更，請重新登入。',
  'binding-pending':'尚待老師核發身分；目前只能本機練習。','read-model-pending':'雲端紀錄尚未確認，請稍後重新讀取。',
  'owner-required':'只有此課程擁有者可以使用。','configuration-pending':'新登入服務尚未就緒，請找老師。',
  'guest-xp-policy-pending':'已核發訪客的帳號 XP 政策尚待確認。','xp-snapshot-missing':'準時 XP 尚待確認。'};
const explain=e=>messages[e?.code||e?.reason]||'尚未完成，請重新讀取或找老師。';
function layout(title) {
  const root=node('main');root.className='wrap paper fullrev';
  root.style.cssText='max-width:960px;margin:24px auto;padding:16px;overflow-wrap:anywhere';
  const back=node('a','← YBS Lab');back.href='/';root.append(back,node('h1',title));
  const status=node('p','請先登入。');status.setAttribute('role','status');status.dataset.fullrevStatus='';
  const login=node('section'), tools=node('section'), content=node('section');
  root.append(status,login,tools,content);document.body.replaceChildren(root);
  return {root,status,login,tools,content};
}
export async function mountLogin({client,host,onLogin=()=>{},ownerOnly=false}) {
  const form=node('form'), account=node('input'), password=node('input'), alert=node('p');
  form.style.cssText='display:grid;gap:8px;max-width:320px';
  for(const input of [account,password])input.style.cssText='display:block;box-sizing:border-box;width:100%;min-height:44px';
  account.autocomplete='username';account.name='account';password.name='password';password.type='password';password.autocomplete='current-password';
  const label=(text,input)=>{const l=node('label',text);l.append(input);return l;};
  const submit=button('帳號登入');submit.type='submit';
  const actions=[];
  async function run(kind) {
    actions.forEach(b=>b.disabled=true);alert.textContent='登入中…';
    try{const value=await client.login(kind,account.value,password.value);password.value='';alert.textContent='已登入。';await onLogin(value);}
    catch(e){password.value='';alert.textContent=explain(e);}
    finally{actions.forEach(b=>b.disabled=false);}
  }
  if(!ownerOnly){form.append(label('帳號',account),label('密碼',password),submit);form.onsubmit=e=>{e.preventDefault();run('password');};actions.push(submit);host.append(form);}
  for(const [text,kind] of ownerOnly?[['教師 Google 登入','owner']]:[['學生 Google 登入','google'],['老師核發訪客／本機練習','guest'],['教師 Google 登入','owner']]) {
    const b=button(text,()=>run(kind));actions.push(b);host.append(b);
  }
  alert.setAttribute('role','alert');host.append(alert);
}
async function setup(promise,title,{ownerOnly=false}={}) {
  const page=layout(title);
  try {
    const client=await promise;
    const logout=button('登出／換人',async()=>{await client.logout().catch(e=>{page.status.textContent=explain(e);});});
    page.tools.append(logout);
    client.subscribe(state=>{
      if(!state.profile){page.content.replaceChildren();page.login.hidden=false;page.status.textContent='請先登入。';}
      else page.login.hidden=true;
      logout.hidden=!state.profile;
      if(state.status==='pending')page.status.textContent=messages.pending;
      if(state.status==='restart-required')page.status.textContent=messages['restart-required'];
      if(state.status==='stale'){page.content.replaceChildren();page.status.textContent='紀錄待重新確認。';}
    });
    await mountLogin({client,host:page.login,ownerOnly,onLogin:()=>page.refresh?.()});
    if(!ownerOnly)await client.restore();
    return {...page,client};
  }catch(e){page.status.textContent=explain(e);return page;}
}
const pairAnswer=value=>value?.photoAnswer||value?.performanceOrder;
const catalog=()=>typeof ACTIVITIES==='undefined'?[]:ACTIVITIES.filter(a=>a.course==='115-g9');
async function xpCore() {
  if(typeof YBSXP!=='undefined')return YBSXP;
  await new Promise((resolve,reject)=>{const script=node('script');script.src='/assets/xp.js?v=20261122legacy';script.onload=resolve;script.onerror=reject;document.head.append(script);});
  return YBSXP;
}
function showGrowth(host,snapshot,client,xp) {
  const result=growth(snapshot,{project:client.project,course:client.course,subject:snapshot.subject,
    provider:snapshot.provider,activities:catalog()},xp);
  host.replaceChildren();
  if(result.state!=='confirmed'){host.append(node('p',explain(result)));return;}
  host.append(node('h2',`Lv ${result.level} ${result.title} · ${result.totalXP} XP`));
  for(const detail of result.activities){const a=catalog().find(a=>a.week===detail.activity);
    host.append(node('p',`${a.title}：${detail.passed}／${detail.rounds.length} 關 · ${detail.totalXP} XP${detail.completeXP?' · 已獲得徽章':''}`));}
}
export async function mountGrowth({client:promise}) {
  // 舊班座教師網址在新模式不自行查名冊；轉至 owner 匯出介面指定範圍。
  if(location.search.includes('cls=')||location.search.includes('seat='))return mountTeacher({client:promise});
  const p=await setup(promise,'我的成長紀錄');if(!p.client)return;
  let reading=0;
  p.refresh=async()=>{
    const n=++reading;p.content.replaceChildren();
    try{const snapshot=await p.client.progress({activities:catalog()});const xp=await xpCore();if(n!==reading)return;
      showGrowth(p.content,snapshot,p.client,xp);p.status.textContent='已確認雲端紀錄。';}
    catch(e){if(n===reading)p.status.textContent=explain(e);}
  };
  p.client.subscribe(state=>{if(!state.profile||state.status==='stale'){reading++;p.content.replaceChildren();}});
  p.tools.append(button('重新讀取',p.refresh));
  // setup 傳回的是同一組 DOM；登入回呼以實際 page 物件註冊，避免閉包副本。
  p.login.replaceChildren();await mountLogin({client:p.client,host:p.login,onLogin:p.refresh});
  eventsRefresh(p,p.refresh);
  if(p.client.state().profile)await p.refresh();
}
function eventsRefresh(p,refresh) {
  window.addEventListener('focus',()=>{if(p.client.state().profile)refresh();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&p.client.state().profile)refresh();});
}
export async function mountActivity({client:promise,cfg}) {
  const p=await setup(promise,cfg.title);if(!p.client)return;
  const stage=node('section'),summary=node('section'),nav=node('nav');
  p.tools.append(nav);let round=0,handle=null,lastView=null,read=0,viewKey='',pairTimer=null,generation=0;
  const send=button('送出',async()=>{
    if(!handle||send.disabled||handle.ready&&!handle.ready())return;send.disabled=true;
    try{const value=await p.client.answer(cfg.week,round,handle.get());await receive(value);}
    catch(e){p.status.textContent=explain(e);}finally{send.disabled=!handle||!next.hidden||(!!lastView?.completed||!!lastView?.awaitingTeacher)
      ||!!pairAnswer(lastView)&&lastView?.question?.slot===1||p.client.state().pending||p.client.state().status==='restart-required'||!!handle?.ready&&!handle.ready();}
  });
  const next=button('下一組',()=>{next.hidden=true;render(lastView);});next.hidden=true;
  async function render(value) {
    const carry=handle?.carry?.();handle?.dispose?.();stage.replaceChildren();handle=null;send.disabled=true;
    if(typeof cfg.renderQuestion!=='function'){stage.append(node('p','此關介面尚未備妥，請找老師。'));return;}
    send.textContent=value.question.data?.mode==='photo'?'拍下來傳出去':'送出';
    handle=cfg.renderQuestion(value.question,stage,{changed(){
      const state=p.client.state();
      send.disabled=!handle?.get||!next.hidden||(!!lastView?.completed||!!lastView?.awaitingTeacher)||state.pending
        ||!!pairAnswer(lastView)&&lastView?.question?.slot===1||state.status==='sending'||state.status==='restart-required'||!!handle.ready&&!handle.ready();
    },carry:pairAnswer(value)||carry,demonstration:false});
    send.disabled=!handle?.get||!!pairAnswer(value)&&value.question.slot===1||!!handle.ready&&!handle.ready();
  }
  async function receive(value) {
    if(value.activity!==undefined&&(value.activity!==cfg.week||value.round!==round))return;
    const key=JSON.stringify([value.sid,value.nextSeq,value.completed,value.correct]);
    if(key===viewKey)return;viewKey=key;
    const previous=lastView;lastView=value;
    if(value.photo&&!handle)await render({...value.photo,photoAnswer:value.photoAnswer});
    if(value.performance){
      if(!handle&&value.performance.question)await render({question:value.performance.question});
      handle?.feedback?.(value.performance);
    }
    if(value.awaitingTeacher){handle?.dispose?.();stage.replaceChildren();handle=null;next.hidden=true;send.disabled=true;p.status.textContent='等待老師確認';return;}
    if(value.completed){if(!value.performance&&!value.photo)stage.replaceChildren();if(previous?.question?.data?.learning)stage.append(node('p',previous.question.data.learning));if(!value.performance&&!value.photo)handle=null;send.disabled=true;p.status.textContent='作答已送達，正在確認有效過關紀錄。';await refresh();return;}
    if(value.question.slot===1&&!!pairAnswer(value)){
      next.hidden=true;await render(value);send.disabled=true;p.status.textContent=value.photoAnswer?'兩張照片成立，正在確認過關。':'第一組成立，正在驗證同一排卡的第二組資料。';
      continuePair(value);
    }else if(value.correct===true&&value.question.slot===1){if(previous?.question?.data?.learning)stage.append(node('p',previous.question.data.learning));next.hidden=false;send.disabled=true;p.status.textContent='第一組答對，請按「下一組」。';}
    else{
      // 錯答沿用原 renderer 與已填欄位，讓學生只修改錯誤處。
      if(!(value.correct===false&&handle&&previous?.sid===value.sid&&previous.question?.slot===value.question.slot))await render(value);
      send.disabled=!handle||!!handle.ready&&!handle.ready();
      p.status.textContent=value.correct===false?'再修改同一題，不扣分。':'作答中。';
    }
  }
  function continuePair(value){
    if(pairTimer)return;
    const current=generation,scopeRound=round;
    // 下一個事件迴圈再送，讓 client 釋放第一槽鎖；自動重試的回應也走同一路徑。
    pairTimer=setTimeout(async()=>{
      pairTimer=null;
      if(current!==generation||lastView?.sid!==value.sid||lastView?.completed)return;
      try{await receive(await p.client.answer(cfg.week,scopeRound,pairAnswer(value)));}
      catch(e){if(current===generation)p.status.textContent=explain(e);}
    },0);
  }
  function stopPair(){generation++;clearTimeout(pairTimer);pairTimer=null;}
  async function refresh() {
    const n=++read;summary.replaceChildren();
    try{const snapshot=await p.client.progress({activities:catalog()});const xp=await xpCore();if(n!==read)return;
      showGrowth(summary,snapshot,p.client,xp);}
    catch(e){if(n===read)p.status.textContent=explain(e);}
  }
  const start=async(restart=false)=>{
    stopPair();handle?.dispose?.();stage.replaceChildren();handle=null;viewKey='';next.hidden=true;send.disabled=true;
    if(cfg.rounds[round]?.managed===false){p.status.textContent='這一關尚待老師確認，請選其他關卡。';return;}
    try{await receive(await p.client.start(cfg.week,round,{restart}));}catch(e){p.status.textContent=explain(e);}
  };
  for(let i=0;i<cfg.rounds.length;i++)nav.append(button(cfg.rounds[i].name,()=>{round=i;start();}));
  const begin=button('開始這一關',()=>start());
  const restart=button('重新開始',()=>start(true));
  const retry=button('重試送出',async()=>{try{const values=await p.client.retry();if(values.length)await receive(values.at(-1));}catch(e){p.status.textContent=explain(e);}});
  const refreshClaims=button('老師已核發，重新確認',async()=>{try{await p.client.refreshClaims();await start(true);}catch(e){p.status.textContent=explain(e);}});
  const practice=button('本機練習／示範',()=>{
    stopPair();handle?.dispose?.();stage.replaceChildren();send.disabled=true;handle=null;
    if(typeof cfg.demonstrate==='function')cfg.demonstrate(stage);
    else stage.append(node('p','此活動的練習介面尚未備妥。'));
    p.status.textContent='本機練習／教師示範，不送出成績。';
  });
  p.tools.append(begin,restart,retry,refreshClaims,practice);
  function clearView(){read++;stopPair();handle?.dispose?.();stage.replaceChildren();summary.replaceChildren();handle=null;lastView=null;viewKey='';next.hidden=true;send.disabled=true;}
  p.client.subscribe(state=>{
    if(!state.profile){clearView();return;}
    p.content.replaceChildren(stage,send,next,summary);
    begin.disabled=restart.disabled=!!state.profile.owner||typeof cfg.renderQuestion!=='function';
    refreshClaims.hidden=!!state.profile.owner;
    if(state.status==='stale')clearView();
    if(['ready','confirmation-pending','teacher-pending'].includes(state.status)&&state.view?.activity===cfg.week&&state.view.round===round)receive(state.view);
  });
  p.login.replaceChildren();await mountLogin({client:p.client,host:p.login,onLogin:profile=>{
    p.status.textContent=profile.owner?'教師示範不送成績。':profile.provider==='anonymous'?'訪客識別：'+profile.uid+'；請老師核發後重新確認。':'已登入，請選擇關卡。';
    if(!profile.owner)refresh();
  }});
  window.addEventListener('pagehide',clearView);
  eventsRefresh(p,refresh);
}
export async function mountTeacher({client:promise}) {
  const p=await setup(promise,'教師紀錄與匯出',{ownerOnly:true});if(!p.client)return;
  const classKey=node('input');classKey.placeholder='例如 c901';classKey.setAttribute('aria-label','班級代碼');
  p.tools.append(node('label','班級代碼'),classKey);
  let reading=0;
  async function refresh(download=false) {
    const n=++reading;p.content.replaceChildren();
    try {
      const snapshot=await p.client.progress({teacher:true,classKey:classKey.value.trim(),activities:catalog()});
      const rows=exportRows(snapshot,{project:p.client.project,course:p.client.course,activities:catalog()},await xpCore());
      if(n!==reading||!p.client.state().profile)return;
      const table=node('table');for(const row of rows){const tr=node('tr');for(const cell of row)tr.append(node('td',String(cell)));table.append(tr);}
      const scroll=node('div');scroll.style.cssText='max-width:100%;overflow-x:auto';scroll.tabIndex=0;scroll.setAttribute('aria-label','有效紀錄表');scroll.append(table);p.content.append(scroll);
      p.status.textContent='已確認目前有效紀錄。';
      if(download){
        if(typeof XLSX==='undefined')throw new Error('xlsx-unavailable');
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'有效紀錄');
        const url=URL.createObjectURL(new Blob([XLSX.write(book,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        const a=node('a');a.href=url;a.download='YBS_有效紀錄.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    }catch(e){if(n===reading){p.content.replaceChildren();p.status.textContent=explain(e);}}
  }
  p.tools.append(button('讀取有效紀錄',()=>refresh()),button('重新確認並下載 Excel',()=>refresh(true)));
  classKey.oninput=()=>{reading++;p.content.replaceChildren();p.status.textContent='請重新讀取所選班級。';};
  p.client.subscribe(state=>{if(!state.profile||state.status==='stale'){reading++;p.content.replaceChildren();}});
  eventsRefresh(p,()=>{p.content.replaceChildren();p.status.textContent='請重新確認紀錄後匯出。';});
}
