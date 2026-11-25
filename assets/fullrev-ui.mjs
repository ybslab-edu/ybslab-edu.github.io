import {mountGuestLogin} from './fullrev-guest.mjs';
import {growth,exportRows} from './fullrev-progress.mjs?v=20261120a';

const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
const button=(text,run)=>{const b=node('button',text);b.type='button';b.className='btn';b.style.cssText='min-height:44px;margin:4px';b.onclick=run;return b;};
const messages={'capacity-deferred':'目前暫時無法開始作答，請稍後重試或找老師確認開收狀態。','request-timeout':'連線逾時，請重新讀取或稍後重試。','report/rate-limited':'報告已保留，請在上一份交件滿 60 秒後重試。',pending:'尚未確認，答案已保留，稍後可重試。','retry-later':'請稍候再重試。',
  'invalid-answer':'答案格式不符，已保留同一題與填寫內容，請修改後再送出。',
  'ticket-expired':'作答票已過期，請按「活動工具 → 重新開始」取得新題。',
  'ticket-invalid':'作答票驗證失敗，請按「活動工具 → 重新開始」。',
  'ticket-not-owned':'作答票與目前帳號或關卡不符，請重新開始。',
  'ticket-out-of-order':'作答順序已變更，請重新開始。',
  'ticket-attempt-limit':'這次作答已達嘗試上限，請重新開始。',
  'ticket-stale':'老師已重置、調整授權或你已切換關卡，這次作答無法採計，請重新開始。',
  'ticket-replayed':'這份作答已由另一份完成紀錄取代，請重新開始並確認進度。',
  'tickets-disabled':'老師已關閉作答票，請重新整理頁面後重新開始。',
  'ticket-secret-required':'作答票服務尚未設定完成，請告訴老師。',
  'ticket-scope-not-supported':'這個身分或課程尚未開放作答票，請告訴老師。',
  'summary-unconfirmed':'進度待確認，請告訴老師；目前暫停採計。','summary-capacity':'進度待確認，請告訴老師；目前暫停採計。',
  'storage-quota':'伺服器儲存額度不足，請告訴老師或改用舊站。',
  'restart-required':'授權或作答版本已變更，請重新開始這一關。','identity-changed':'身分已變更，請重新登入。',
  'binding-pending':'尚待老師核發身分；目前只能本機練習。','read-model-pending':'雲端紀錄尚未確認，請稍後重新讀取。',
  'owner-required':'只有此課程擁有者可以使用。','configuration-pending':'新登入服務尚未就緒，請找老師。',
  'guest-xp-policy-pending':'班座紀錄尚待老師確認。','guest-pending':'已存待審，尚未採計。','guest-seat-required':'請填三位數班級及 1–60 號座號。','guest-seat-unavailable':'查無這個班座，請確認或找老師。','not-open':'這個活動還沒開放。','xp-snapshot-missing':'準時 XP 尚待確認。'};
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
export async function mountLogin({client,host,onLogin=()=>{},ownerOnly=false,oldlook=false}) {
  if(oldlook)return (await import('./fullrev-shell.mjs')).mountStudentLogin({client,host,onLogin,explain});
  const form=node('form'), account=node('input'), password=node('input'), alert=node('p');
  form.style.cssText='display:grid;gap:8px;max-width:320px';
  for(const input of [account,password])input.style.cssText='display:block;box-sizing:border-box;width:100%;min-height:44px';
  account.autocomplete='username';account.name='account';password.name='password';password.type='password';password.autocomplete='current-password';
  const label=(text,input)=>{const l=node('label',text);l.append(input);return l;};
  const submit=button('帳號登入');submit.type='submit';
  const actions=[];
  async function run(kind,guest) {
    actions.forEach(b=>b.disabled=true);alert.textContent='登入中…';
    try{const value=await client.login(kind,guest||account.value,password.value);password.value='';alert.textContent='已登入。';await onLogin(value);}
    catch(e){password.value='';alert.textContent=explain(e);}
    finally{actions.forEach(b=>b.disabled=false);}
  }
  if(!ownerOnly){form.append(label('帳號',account),label('密碼',password),submit);form.onsubmit=e=>{e.preventDefault();run('password');};actions.push(submit);host.append(form);}
  for(const [text,kind] of ownerOnly?[['教師 Google 登入','owner']]:[...(client.studentGoogleLogin===true?[['學生 Google 登入','google']]:[]),['教師 Google 登入','owner']]) {
    const b=button(text,()=>run(kind));actions.push(b);host.append(b);
  }
  if(!ownerOnly&&client.course==='115-g9')mountGuestLogin({host,login:value=>run('guest',value),disabled:()=>submit.disabled});
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
  await new Promise((resolve,reject)=>{const script=node('script');script.src='/assets/xp.js?v=20261120a';script.onload=resolve;script.onerror=reject;document.head.append(script);});
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
// 成長頁視圖沿用 origin/main:115-g9/me/；只接收已驗證的 growth 結果。
// HTML/CSS 隨既有發布模組攜帶，避免另改發布檔案白名單。
const growthMarkup=String.raw`
<header class="site-bar"><div class="site-inner"><a class="brand" href="../../"><b><i>Y</i><i>B</i><i>S</i> Lab</b><span>為什麼・因為・所以</span></a><nav aria-label="網站導覽"><a href="../">九年級活動</a><button id="logout" hidden>登出</button></nav></div></header>
<main class="paper">
  <header class="page-heading"><div><p class="eyebrow">九年級資訊科技 <span>／</span> 115 學年度</p><h1>我的成長紀錄</h1></div><p class="term" id="term"></p></header>
  <section id="signin" aria-labelledby="signin-title"><h2 id="signin-title">用帳號登入就能累積等級</h2><p>班座模式的紀錄不計入這裡。登入後，查看自己已確認的過關紀錄。</p><div id="login"></div></section>
  <div class="notice" role="status"><span id="status">請先登入帳號。</span> <button id="retry" hidden>重新讀取</button></div>
  <div id="growth" hidden>
    <section class="next-step" aria-labelledby="current-title"><div class="current-context"><span class="status-mark" aria-hidden="true"></span><span>現在的任務</span><span class="mono" id="current-week"></span></div><div class="current-content"><div><h2 id="current-title"></h2><p id="current-description"></p></div><div class="continue-action" id="continue-action"><span>還有 <b class="mono" id="remaining"></b> 關</span><a class="continue-link" id="continue-link">繼續挑戰 <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5"/></svg></a></div></div></section>
    <div class="overview">
      <section class="level-panel" aria-labelledby="level"><div class="level-inline"><span id="mobile-level"></span><span id="mobile-next"></span></div><div class="level-top"><span>目前等級</span><span class="mono level-number" id="level-number"></span></div><h2 id="level"></h2><p class="level-next" id="next"></p><progress id="progress" max="1" value="0" aria-label="升級進度"></progress><div class="progress-label mono"><span id="floor"></span><span id="ceiling"></span></div><dl class="level-totals"><div><dt>已過關卡</dt><dd><b class="mono" id="completed"></b> 關</dd></div><div><dt>活動徽章</dt><dd><b class="mono" id="badge-count"></b> 枚</dd></div><div><dt>累積經驗</dt><dd class="xp-number mono" id="total"></dd></div></dl><p class="level-footnote">XP 與課堂成績分開。</p></section>
      <div id="growth-tabs" class="mobile-tabs" role="tablist" aria-label="成長紀錄內容" hidden><button id="exploration-tab" role="tab" aria-controls="exploration-panel" aria-selected="true">探索六邊形</button><button id="route-tab" role="tab" aria-controls="route-panel" aria-selected="false" tabindex="-1">每週路線</button></div>
      <section class="exploration" id="exploration-panel" aria-labelledby="exploration-title"><div class="section-heading"><h2 id="exploration-title">探索六邊形</h2><div class="chart-switch" role="group" aria-label="探索度計算範圍"><button type="button" data-scope="open" aria-pressed="true">已開放</button><button type="button" data-scope="term" aria-pressed="false">全學期</button></div></div><div class="learning-summary" aria-live="polite" aria-atomic="true"><p><strong class="mono" id="completion-rate"></strong><span id="completion-label"></span></p><p id="completion-detail"></p></div><div class="chart-layout"><div id="radar"></div><ul id="axes" class="axes"></ul></div><p class="chart-note" id="chart-note"></p></section>
    </div>
    <section class="route" id="route-panel" aria-labelledby="route-title"><div class="section-heading"><h2 id="route-title">每週路線</h2><span class="route-caption">學會了什麼・摘自課堂活動主題</span></div><div class="route-legend"><span><i class="legend-dot complete-dot"></i>已完成</span><span><i class="legend-dot current-dot"></i>探索中</span><span><i class="legend-dot future-dot"></i>待開放</span><span class="route-direction">每列左至右 →，再到下一列</span></div><div id="route"></div></section>
    <details class="xp-details" id="xp-details"><summary><span class="xp-heading">XP 明細</span><span class="xp-brief">合計 <b class="mono" id="xp-total"></b></span><span class="expand-icon" aria-hidden="true"></span></summary><div class="xp-content"><p>首次過關 +10 · 開放後 7 天內過關 +5 · 活動全過 +20。舊紀錄無時間時，不計準時加成。</p><div id="details"></div></div></details>
  </div>
  <footer><span>只跟自己比。XP 與課堂成績分開。</span><span>© YBS Lab · 全權保留</span></footer>
</main>
`;
const growthCSS=String.raw`
:root{color-scheme:light;--bg:#F5F7F9;--surface:#FFF;--ink:#211B17;--muted:#5D6670;--line:#D3D9E0;--purple:#7A4EA8;--purple-soft:#EFE6F8;--orange:#A9510D;--orange-soft:#FBEAD9;--grid:#827989;--green:#246B40;--display:'LXGW WenKai TC','Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif;--body:'Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif;--mono:'JetBrains Mono',ui-monospace,Consolas,monospace}

@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#11161B;--surface:#1D2127;--ink:#ECEFF2;--muted:#B1B8C2;--line:#4A5059;--purple:#BC9DE3;--purple-soft:#2A2236;--orange:#F0A45E;--orange-soft:#3A2A1B;--grid:#978BA3;--green:#6FC995}
}

*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 var(--body);font-variant-numeric:tabular-nums}
h1,h2,h3,p,dl,dd{margin:0}
h1,h2,h3{font-family:var(--display);line-height:1.4}
h1{font-size:32px}
h2{font-size:24px}
h3{font-size:20px}
a{color:inherit;text-underline-offset:5px}
button{font:inherit;cursor:pointer}
button,a,summary{-webkit-tap-highlight-color:transparent}
button:focus-visible,a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--purple);outline-offset:4px}
button:hover,a:hover{color:var(--purple)}
.mono{font-family:var(--mono)}
.muted{color:var(--muted)}
.site-bar{background:var(--surface);border-block:1px solid var(--line)}
.site-inner{max-width:1180px;padding:18px 24px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:baseline;gap:18px;text-decoration:none}
.brand b{font-size:23px;letter-spacing:-.035em}
.brand i{font-style:normal}
.brand i:first-child{color:var(--purple)}
.brand i:nth-child(2){color:#2C67AE}
.brand i:nth-child(3){color:var(--orange)}
.brand>span{font-size:14px;color:var(--muted)}
.site-inner nav{display:flex;gap:24px;font-size:14px}
.site-inner nav a{display:grid;align-items:center;min-height:44px;text-decoration:none;color:var(--muted);border-bottom:2px solid transparent}
.site-inner nav [aria-current]{color:var(--purple);border-bottom-color:var(--purple)}
.paper{max-width:1180px;padding:0 36px;margin:auto;background:var(--surface);border-inline:1px solid var(--line)}
.page-heading{display:flex;justify-content:space-between;align-items:end;gap:24px;padding:24px 0}
.eyebrow{font-size:14px;color:var(--muted);margin-bottom:6px}
.eyebrow span{margin:0 10px;color:var(--muted)}
.term{font-size:14px;color:var(--muted);text-align:right}
.term span{display:block;font-size:13px}
.next-step{border-top:3px solid var(--orange);background:var(--orange-soft);padding:19px 24px 22px}
.current-context{display:flex;align-items:center;gap:10px;color:var(--orange);font-size:14px;font-weight:500}
.status-mark{width:8px;height:8px;background:var(--orange);border-radius:50%}
.current-context .mono{margin-left:3px;font-size:13px}
.current-content{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:8px}
.current-content h2{font-size:27px}
.current-content p{font-size:15px;color:var(--muted);margin-top:5px}
.continue-action{display:flex;align-items:center;gap:22px;flex:none}
.continue-action>span{font-size:15px}
.continue-action b{color:var(--orange);font-size:23px;margin:0 4px;font-weight:500}
.continue-link{display:flex;align-items:center;justify-content:center;gap:15px;background:var(--purple);color:var(--surface);text-decoration:none;padding:11px 19px;min-height:48px;font-size:16px;font-weight:500;border:1px solid var(--purple);border-radius:6px}
.continue-link svg{height:19px;width:19px;stroke:currentColor;stroke-width:1.6;fill:none}
.continue-link:hover{background:var(--surface);color:var(--purple)}
.overview{display:grid;grid-template-columns:250px minmax(0,1fr);gap:36px;margin-top:32px;align-items:start}
.level-panel{border-top:2px solid var(--purple);background:var(--bg);padding:20px 22px 22px}
.level-top{display:flex;justify-content:space-between;align-items:center;color:var(--muted);font-size:14px}
.level-number{color:var(--purple);font-size:24px;font-weight:500}
.level-panel h2{font-size:25px;margin-top:13px}
.level-next{font-size:14px;line-height:1.9;margin-top:9px;color:var(--muted)}
.level-next b{color:var(--purple);font-weight:500}
progress{display:block;appearance:none;width:100%;height:5px;border:0;background:var(--line);color:var(--purple);border-radius:0;overflow:hidden;margin-top:16px}
progress::-webkit-progress-bar{background:var(--line)}
progress::-webkit-progress-value{background:var(--purple)}
progress::-moz-progress-bar{background:var(--purple)}
.progress-label{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px}
.level-totals{margin-top:21px;padding-top:17px;border-top:1px solid var(--line)}
.level-totals>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px}
.level-totals dt{color:var(--muted);font-size:14px}
.level-totals dd{font-size:14px}
.level-totals b{font-weight:500;font-size:19px}
.level-totals .xp-number{font-size:16px;color:var(--muted)}
.level-footnote{margin-top:20px;font-size:14px;color:var(--muted)}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.section-heading h2{display:flex;align-items:baseline;gap:12px;font-size:24px}
.section-number{font-size:13px;color:var(--purple);font-weight:500}
.chart-switch{display:flex;border:1px solid var(--grid);border-radius:5px;padding:2px;flex:none}
.chart-switch button{background:none;border:0;border-radius:3px;padding:7px 11px;min-height:40px;font-size:14px;color:var(--muted)}
.chart-switch button[aria-pressed=true]{background:var(--purple);color:var(--surface)}
.learning-summary{display:flex;align-items:center;gap:28px;padding-top:16px}
.learning-summary p:first-child{display:flex;align-items:center;gap:13px}
.learning-summary strong{font-size:32px;color:var(--purple);font-weight:500;line-height:1.4;letter-spacing:-.04em}
.learning-summary strong span{font-size:19px}
.learning-summary p:first-child>span{font-size:14px;white-space:nowrap;line-height:1.5}
.learning-summary p:last-child{font-size:14px;line-height:1.8}
.chart-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:12px;align-items:center;margin-top:8px}
.radar{display:block;width:100%;height:auto;max-width:420px;margin:auto}
.radar .gridline,.radar .spoke{fill:none;stroke:var(--grid);stroke-width:1}
.radar .spoke{stroke-dasharray:3 5}
.plot-fill{fill:var(--purple-soft)}
.plot-outline{fill:none;stroke:var(--purple);stroke-width:2.6}
.plot-dot{fill:var(--purple)}
.radar text{font-family:var(--body);fill:var(--muted)}
.axes{list-style:none;margin:0;padding:0}
.axes li{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line);padding:8px 0;font-size:14px}
.axis-title{display:flex;align-items:center;gap:8px;white-space:nowrap}
.axis-color{width:4px;height:14px;display:inline-block;flex:none}
.axis-A{background:#D9480F}
.axis-P{background:#1971C2}
.axis-S{background:#2B8A3E}
.axis-D{background:#6741D9}
.axis-T{background:#0B7285}
.axis-H{background:#C2255C}
.axis-value{display:flex;flex-direction:column;text-align:right;line-height:1.7}
.axis-value>.mono{color:var(--purple)}
.axis-value .muted{font-size:12px;white-space:nowrap}
.chart-note{color:var(--muted);font-size:14px;margin-top:13px;line-height:1.8}
.route{margin-top:36px}
.route-caption{font-size:14px;color:var(--muted)}
.route-legend{display:flex;gap:22px;align-items:center;flex-wrap:wrap;font-size:14px;color:var(--muted);margin-top:16px}
.route-legend>span{display:flex;gap:8px;align-items:center}
.legend-dot{width:12px;height:12px;border:1.6px solid var(--purple);border-radius:50%;display:inline-block}
.complete-dot{background:var(--purple)}
.current-dot{border-color:var(--orange);box-shadow:inset 0 0 0 2px var(--surface);background:var(--orange)}
.future-dot{border-color:var(--muted);border-style:dashed}
.route-direction{margin-left:auto}
.timeline{position:relative;margin-top:26px;padding:0 18px}
.route-thread{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.route-thread path{fill:none;stroke:var(--purple);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.stations{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,auto);gap:26px 30px;list-style:none;padding:0;margin:0;position:relative}
.station{min-width:0;position:relative;padding:0 0 21px;border-bottom:1px solid var(--line)}
.week-line{display:flex;align-items:center;gap:9px;position:relative;min-height:30px}
.route-node{width:18px;height:18px;border:2px solid var(--purple);border-radius:50%;background:var(--surface);flex:none;display:grid;place-items:center}
.complete .route-node{background:var(--purple)}
.route-node svg{width:15px;height:15px;fill:none;stroke:var(--surface);stroke-width:1.8}
.current .route-node{border-color:var(--orange);background:var(--orange-soft);outline:3px solid var(--surface);outline-offset:0}
.locked .route-node{border-color:var(--muted);border-style:dashed}
.week-label{display:flex;gap:12px;background:var(--surface);font-size:14px;font-weight:500;padding-right:8px;line-height:1.5}
.week-label>span{font-size:12px;color:var(--muted);align-self:center}
.station-state{font-size:12px;color:var(--muted);background:var(--surface);padding-left:8px;white-space:nowrap}
.current .station-state{color:var(--orange);font-weight:500}
.station-body{padding:13px 7px 0 27px;background:var(--surface)}
.station h3{font-size:19px}
.learned{font-size:14px;line-height:1.8;margin-top:10px;min-height:51px;color:var(--muted)}
.station-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:17px;font-size:14px}
.badge{display:inline-flex;align-items:center;gap:7px;font-size:14px;color:var(--orange);white-space:nowrap}
.badge svg{width:20px;height:23px;fill:none;stroke:currentColor;stroke-width:1.6}
.station-count{font-size:13px;color:var(--muted);white-space:nowrap}
.route-continue{display:inline-flex;align-items:center;gap:9px;font-weight:500;color:var(--purple);min-height:44px}
.locked .station h3{color:var(--muted)}
.future-weeks{border-top:1px solid var(--line);margin-top:23px;font-size:14px;color:var(--muted)}
.future-weeks summary{padding:14px 0;cursor:pointer;min-height:48px}
.future-weeks summary span{float:right;font-size:13px}
.future-weeks p{padding:0 0 16px}
.xp-details{margin-top:24px;border-block:1px solid var(--ink)}
.xp-details>summary{display:flex;align-items:center;gap:18px;list-style:none;cursor:pointer;padding:19px 0;min-height:66px}
.xp-details summary::-webkit-details-marker{display:none}
.xp-heading{display:flex;align-items:baseline;gap:12px;font:22px var(--display)}
.xp-brief{margin-left:auto;font-size:14px;color:var(--muted)}
.xp-brief b{font-weight:500}
.expand-icon{width:14px;height:14px;position:relative;flex:none;margin-left:5px}
.expand-icon::before,.expand-icon::after{content:'';position:absolute;background:var(--muted)}
.expand-icon::before{width:14px;height:1.5px;top:6px;left:0}
.expand-icon::after{height:14px;width:1.5px;left:6px;top:0}
details[open]>summary>.expand-icon::after{display:none}
.xp-content{padding:0 0 18px}
.xp-content>p{font-size:14px;color:var(--muted);margin-bottom:15px}
.xp-item{border-top:1px solid var(--line)}
.xp-item summary{display:flex;align-items:center;gap:18px;padding:14px 0;font-size:15px;min-height:50px;list-style:none;cursor:pointer}
.xp-item summary b{margin-left:auto;font-size:14px;font-weight:500;white-space:nowrap}
.xp-breakdown{display:flex;gap:36px;margin:0 0 19px;padding-left:24px;font-size:14px}
.xp-breakdown div{display:flex;gap:12px}
.xp-breakdown dt{color:var(--muted)}
footer{display:flex;justify-content:space-between;gap:16px;margin-top:30px;border-top:1px solid var(--line);padding:22px 0 25px;font-size:13px;color:var(--muted)}

@media(prefers-color-scheme:dark){.brand i:nth-child(2){color:#82B2EC}
.axis-A{background:#FF8A4C}
.axis-P{background:#5AA9F0}
.axis-S{background:#5CC977}
.axis-D{background:#A08BFF}
.axis-T{background:#3BC0D6}
.axis-H{background:#F06595}
.route-node svg{stroke:var(--bg)}
.continue-link:hover{color:var(--purple)}
}

@media(min-width:701px) and (max-width:1080px){.paper{padding-inline:26px}
.overview{grid-template-columns:218px minmax(0,1fr);gap:26px}
.chart-layout{display:block}
.axes{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}
.learning-summary{gap:18px;flex-wrap:wrap}
.section-heading{gap:10px}
.section-heading h2{font-size:23px}
.chart-switch button{font-size:13px;padding-inline:9px}
.current-content{gap:16px}
.continue-action{gap:15px}
.stations{gap:25px 20px}
.station-state{display:none}
.station h3{font-size:17px}
.station-bottom{align-items:start;flex-direction:column;gap:7px}
.xp-breakdown{gap:18px;flex-wrap:wrap}
}

@media(max-width:700px){body{font-size:15px}
.site-inner{padding:10px 18px;gap:12px}
.brand b{font-size:22px}
.brand>span{display:none}
.site-inner nav{gap:17px;font-size:14px}
.paper{padding:0 20px;border:0;margin:0 9px}
.page-heading{padding:18px 0}
.eyebrow{font-size:13px;margin-bottom:5px}
.eyebrow span{margin:0 5px}
.page-heading h1{font-size:28px}
.term{display:none}
.next-step{padding:15px 17px 18px}
.current-context{font-size:14px;gap:8px}
.current-content{display:block;margin-top:7px}
.current-content h2{font-size:24px}
.current-content p{font-size:14px;margin-top:7px;line-height:1.8}
.continue-action{justify-content:space-between;gap:12px;margin-top:15px}
.continue-action>span{font-size:14px}
.continue-action b{font-size:20px}
.continue-link{padding:10px 14px;font-size:15px;gap:14px;min-height:46px}
.overview{display:block;margin-top:23px}
.level-panel{padding:15px 16px 17px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 17px}
.level-top{display:contents}
.level-top>span:first-child{font-size:13px;align-self:center}
.level-number{font-size:21px;grid-column:2;grid-row:1/3;align-self:start}
.level-panel h2{font-size:23px;grid-column:1;margin:0}
.level-next{font-size:14px;margin:0;grid-column:1/-1}
.level-next br{display:none}
.level-panel progress{grid-column:1/-1;margin-top:8px}
.progress-label{grid-column:1/-1;font-size:12px;margin-top:2px}
.level-totals{grid-column:1/-1;margin:8px 0 0;padding-top:8px;display:flex;flex-wrap:wrap;gap:7px 18px;justify-content:space-between}
.level-totals>div{margin:0;gap:6px}
.level-totals dt{font-size:12px}
.level-totals dd{font-size:13px}
.level-totals b{font-size:15px}
.level-totals .xp-number{font-size:13px}
.level-footnote{display:none}
.mobile-tabs{display:flex;margin-top:22px;border-bottom:1px solid var(--grid)}
.mobile-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;min-height:48px;padding:10px 4px;font-size:15px;color:var(--muted)}
.mobile-tabs button[aria-selected=true]{color:var(--purple);border-bottom-color:var(--purple);font-weight:500}
.exploration{margin-top:22px}
.section-heading{align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:12px}
.section-heading h2{font-size:23px;gap:9px}
.section-number{font-size:12px}
.chart-switch{padding:1px}
.chart-switch button{padding:7px 9px;font-size:14px;min-height:40px}
.learning-summary{display:block;padding-top:15px}
.learning-summary p:first-child{gap:12px}
.learning-summary p:first-child>span{max-width:none;font-size:14px}
.learning-summary strong{font-size:30px}
.learning-summary p:last-child{margin-top:8px;font-size:14px}
.chart-layout{display:block;margin-top:8px}
.radar{width:100%;max-width:420px;overflow:visible}
.axes{display:block;margin-top:7px}
.axes li{padding:10px 0;font-size:15px}
.axis-title{gap:9px}
.axis-value{flex-direction:row;gap:14px;align-items:baseline}
.axis-value .muted{font-size:14px}
.chart-note{font-size:14px;margin-top:17px;line-height:1.9}
.route{margin-top:23px}
.route-caption{font-size:14px;display:block;flex-basis:100%;padding-left:29px}
.route-legend{font-size:14px;gap:14px;margin-top:14px}
.route-direction{flex-basis:100%;margin-left:0;font-size:14px}
.timeline{padding:0;margin-top:22px}
.stations{display:flex;flex-direction:column;gap:23px}
.station{padding:0 0 20px}
.week-line{min-height:30px;gap:11px}
.route-node{width:19px;height:19px;outline:3px solid var(--surface)}
.week-label{font-size:14px;gap:16px;padding-right:10px}
.week-label span{font-size:13px}
.station-state{font-size:13px;margin-left:auto;padding-left:8px}
.station-body{padding:13px 0 0 30px;background:none}
.station h3{font-size:21px;min-height:30px;background:var(--surface)}
.learned{font-size:15px;min-height:0;margin-top:10px;background:var(--surface);line-height:1.9}
.station-bottom{margin-top:13px;background:var(--surface);gap:10px}
.station-count{font-size:14px}
.badge{font-size:14px;gap:7px}
.badge svg{width:19px;height:23px}
.route-continue{font-size:15px;min-height:44px}
.future-weeks{font-size:14px;margin-top:18px}
.future-weeks summary span{font-size:13px}
.xp-details{margin-top:26px}
.xp-details>summary{gap:10px;padding:17px 0;min-height:62px}
.xp-heading{font-size:21px;gap:9px}
.xp-brief{font-size:13px}
.expand-icon{margin-left:2px;width:12px}
.xp-content>p{font-size:14px;line-height:1.9}
.xp-item summary{gap:10px;font-size:14px;padding:15px 0}
.xp-item summary b{font-size:13px}
.xp-breakdown{flex-direction:column;gap:6px;padding-left:0;font-size:14px}
.xp-breakdown div{justify-content:space-between}
footer{flex-direction:column;gap:8px;padding:20px 0;font-size:13px}
}

@media(max-width:360px){.paper{margin:0 5px;padding-inline:15px}
.site-inner nav{gap:12px;font-size:13px}
.current-content h2{font-size:22px}
.level-totals{justify-content:start;gap:6px 13px}
.level-totals>div:last-child{flex-basis:100%;justify-content:space-between}
.chart-switch button{padding-inline:7px}
.section-heading h2{font-size:22px}
.station-state{font-size:12px}
.station h3{font-size:20px}
.xp-heading{font-size:20px}
.xp-brief{font-size:12px}
}

@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}


:root{--green:#2B7A4C;--passed-ink:#246B40;--green-soft:#DFF1E6;--track:#827989;--theme-A:#D9480F;--theme-P:#1971C2;--theme-S:#2B8A3E;--theme-D:#6741D9;--theme-T:#0B7285;--theme-H:#C2255C}

@media(prefers-color-scheme:dark){:root{--green:#6FC995;--passed-ink:#6FC995;--green-soft:#1A3325;--track:#978BA3;--theme-A:#FF8A4C;--theme-P:#5AA9F0;--theme-S:#5CC977;--theme-D:#A08BFF;--theme-T:#3BC0D6;--theme-H:#F06595}
}

body{font-size:16px;line-height:1.55}
.level-inline{display:none}
.next-step{border-radius:14px;padding:18px 22px 21px}
.level-panel{border-radius:14px;padding:19px 22px}
.continue-link{font-size:17px;font-weight:700;padding:10px 22px}
.chart-switch{border-radius:9px}
.chart-switch button{border-radius:6px;min-height:40px}
.learning-summary{padding-top:15px;gap:24px}
.learning-summary p:first-child>span{white-space:normal;max-width:8em}
.learning-summary p:last-child{max-width:23em}
.chart-layout{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:20px;margin-top:12px;align-items:center}
.radar{max-width:340px;width:100%;margin:0 auto}
.radar text{font-family:var(--mono);fill:var(--muted)}
.axes li{padding:9px 0}
.axis-key{font-size:12px;color:var(--muted);font-weight:500}
.axis-value{font-size:14px}
.chart-note{font-size:14px;margin-top:13px}
.complete-dot{background:var(--green);border-color:var(--green)}
progress,progress::-webkit-progress-bar{background:var(--track)}
progress::-webkit-progress-value{background:var(--purple)}
progress::-moz-progress-bar{background:var(--purple)}
.timeline{padding:0;margin-top:22px}
.stations{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:none;gap:15px 28px}
.station{border:0;padding:0 0 17px;position:relative}
.station::before{content:'';position:absolute;left:9px;right:-28px;top:15px;height:1.5px;background:var(--green)}
.station.row-end::before{right:2px}
.station::after{content:'';position:absolute;right:-13px;top:11px;width:7px;height:7px;border-top:1.5px solid var(--green);border-right:1.5px solid var(--green);transform:rotate(45deg)}
.station.row-end::after{right:3px}
.week-line{gap:8px}
.complete .route-node{background:var(--green);border-color:var(--green)}
.station.complete .station-state{color:var(--passed-ink)}
.station-state{padding-inline:7px}
.station-body{padding:15px 16px 16px;margin:10px 0 0;background:var(--bg);border:1px solid var(--line);border-radius:14px;min-height:0;display:flex;flex-direction:column;gap:0}
.station h3{font-size:22px}
.learned{min-height:0;font-size:15px;color:var(--ink);line-height:1.7;margin-top:11px}
.topic-label{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
.station-bottom{margin-top:17px;padding-top:13px;border-top:1px solid var(--line);align-items:center}
.badge{color:var(--ink);white-space:normal;gap:9px}
.badge svg{width:29px;height:29px;padding:3px;border:1px solid currentColor;border-radius:7px;stroke-width:1.5;flex:none}
.badge small{display:block;font-size:12px;color:var(--muted);margin-top:3px}
.badge.theme-S svg{color:var(--theme-S)}
.badge.theme-D svg{color:var(--theme-D)}
.badge.theme-A svg{color:var(--theme-A)}
.badge.theme-P svg{color:var(--theme-P)}
.badge.theme-T svg{color:var(--theme-T)}
.badge.theme-H svg{color:var(--theme-H)}
.row-break{grid-column:1/-1;display:flex;justify-content:flex-end;align-items:center;gap:9px;color:var(--muted);font-size:13px;min-height:26px;padding:0 2px 8px;border-bottom:1px solid var(--line);margin-bottom:3px}
.row-break svg{width:23px;height:18px;fill:none;stroke:var(--muted);stroke-width:1.5;flex:none}
.station.locked{grid-column:1/-1;display:grid;grid-template-columns:220px minmax(0,1fr);align-items:start;gap:20px;padding:15px 18px 17px;background:var(--bg);border:1px solid var(--line);border-radius:14px}
.station.locked::before,.station.locked::after{display:none}
.station.locked .week-label,.station.locked .station-state{background:var(--bg)}
.station.locked .station-state{white-space:normal;font-size:13px}
.station.locked .station-body{padding:0;margin:0;border:0;background:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:18px}
.station.locked .learned{margin:0}
.station.locked .station-bottom{display:none}
.station.locked h3{color:var(--ink);font-size:21px}
.available-weeks{border-top:1px solid var(--line);margin-top:20px;font-size:14px;color:var(--muted)}
.available-weeks summary{padding:14px 0;min-height:48px;cursor:pointer}
.available-weeks summary span{float:right}
.available-weeks ul{padding:0;list-style:none;margin:0 0 18px}
.available-weeks li{display:flex;align-items:baseline;gap:18px;padding:9px 0;border-bottom:1px solid var(--line);color:var(--ink)}
.available-weeks li>span:last-child{margin-left:auto}
.route-source{color:var(--muted);font-size:13px;line-height:1.8;margin-top:6px}
.xp-heading{font-size:23px}
.progress-label{gap:10px}
.xp-item summary{flex-wrap:wrap}
.xp-item summary>span:first-child{flex:1;min-width:8em}
.continue-action{min-width:0}
.continue-link{flex-shrink:0}
.level-panel{min-width:0}
.week-label{flex-wrap:wrap;min-width:0}
.station-state{white-space:normal}
.route-legend .route-direction{flex-wrap:wrap}
.learning-summary{flex-wrap:wrap}
footer{font-size:13px}

@media(min-width:701px) and (max-width:1080px){.overview{grid-template-columns:210px minmax(0,1fr);gap:24px}
.chart-layout{display:block}
.radar{max-width:310px}
.axes{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.axes li{gap:8px;flex-wrap:wrap}
.axis-title{white-space:normal}
.axis-value{flex-direction:row;gap:12px;flex-wrap:wrap}
.station h3{font-size:20px}
.stations{column-gap:20px}
.station::before{right:-20px}
.station::after{right:-10px}
.station.row-end::before{right:2px}
.station.row-end::after{right:3px}
.station-body{padding:13px 12px}
.station-state{display:none}
.station-bottom{flex-direction:column;align-items:start;gap:9px}
.station.locked{grid-template-columns:160px minmax(0,1fr)}
.station.locked .station-state{display:block}
.station.locked .station-body{display:block}
.station.locked .learned{margin-top:9px}
}

@media(max-width:700px){.site-inner{padding-block:6px}
.page-heading{padding:14px 0}
.page-heading h1{font-size:27px}
.next-step{padding:12px 15px 14px;border-radius:14px}
.current-content h2{font-size:24px}
.current-content p{font-size:14px;margin-top:5px}
.current-context{font-size:13px}
.continue-action{margin-top:11px;gap:12px}
.continue-link{font-size:15px;padding:9px 14px;min-height:44px}
.overview{margin-top:14px}
.level-panel{display:block;padding:12px 13px;border-top:0;border:1px solid var(--line);border-radius:9px}
.level-panel>:not(.level-inline){display:none}
.level-inline{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;line-height:1.7}
.level-inline b{font-weight:500;color:var(--purple)}
.level-inline>span{min-width:0}
.mobile-tabs{margin-top:12px}
.mobile-tabs button{font-size:15px;min-height:46px}
.exploration{margin-top:19px}
.learning-summary{display:flex;gap:8px 16px}
.learning-summary p:first-child>span{max-width:none}
.learning-summary p:last-child{flex-basis:100%;margin-top:0}
.chart-layout{display:block;margin-top:8px}
.radar{max-width:300px}
.axes{display:block;margin-top:0}
.axes li{font-size:15px;padding:9px 0;flex-wrap:wrap;gap:6px 10px}
.axis-title{white-space:normal}
.axis-value{gap:12px;flex-wrap:wrap}
.axis-key{font-size:13px}
.chart-note{font-size:14px}
.route{margin-top:19px}
.route-caption{padding-left:0;font-size:13px}
.route-legend{gap:12px;font-size:14px}
.route-direction{display:none!important}
.timeline{margin-top:19px}
.stations{gap:18px}
.row-break{display:none}
.station{padding:0 0 6px}
.station::before{left:8.5px;right:auto;top:15px;bottom:-33px;height:auto;width:1.5px}
.station.row-end::before{right:auto}
.station::after,.station.row-end::after{display:none}
.station .week-label{font-size:14px}
.week-line{padding-right:0}
.station-state{font-size:13px;margin-left:auto}
.station-body{margin:11px 0 0 29px;padding:13px 14px 14px;border-radius:14px;background:var(--bg)}
.station h3{background:none;font-size:22px;min-height:0}
.learned{background:none;font-size:15px;line-height:1.8}
.station-bottom{background:none;gap:9px;flex-wrap:wrap}
.badge{font-size:14px}
.badge small{font-size:12px}
.badge svg{height:29px;width:29px}
.station.locked{display:block;margin:0;padding:13px 14px 15px;border-radius:14px}
.station.locked .week-line{align-items:start}
.station.locked .station-state{margin-left:auto}
.station.locked .station-body{display:block;padding:0;margin:14px 0 0 29px}
.station.locked .learned{margin-top:9px}
.station.locked h3{font-size:21px}
.available-weeks{margin-top:15px;font-size:14px}
.available-weeks summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;list-style:inside}
.available-weeks summary::before{content:'▸';font-size:12px}
.available-weeks[open] summary::before{content:'▾'}
.available-weeks summary span{float:none;margin-left:auto}
.available-weeks li{gap:11px;flex-wrap:wrap}
.route-source{font-size:13px}
.xp-heading{font-size:22px}
.level-inline .mono{white-space:nowrap}
.xp-brief{white-space:normal}
}

@media(max-width:360px){.paper{margin:0 5px;padding-inline:15px}
.next-step{padding-inline:12px}
.level-inline{font-size:13px;gap:7px}
.level-inline>span:last-child{font-size:12px}
.level-panel{padding-inline:10px}
.current-content h2{font-size:23px}
.station-body{margin-left:27px;padding-inline:12px}
.station h3{font-size:21px}
.xp-brief{font-size:12px}
.xp-heading{font-size:21px}
.section-heading h2{font-size:23px}
.site-inner nav{gap:13px}
}


.station.locked .week-line{display:grid;grid-template-columns:18px minmax(0,1fr);gap:6px 10px;align-items:center}
.station.locked .week-label{grid-column:2;grid-row:1;flex-wrap:nowrap;padding:0;background:none}
.station.locked .route-node{grid-column:1;grid-row:1}
.station.locked .station-state{grid-column:2;grid-row:2;margin:0;padding:0;background:none}


/* 正式登入與雲端讀取狀態；圖形樣式只限探索圖。 */
button{background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:8px 14px;min-height:44px}

#signin{padding:28px 16px;text-align:center;border-block:1px solid var(--line)}
#signin>p{color:var(--muted);margin-top:12px}
#login{margin:24px 0 8px}
.notice{font-size:13px;color:var(--muted);padding:0 0 16px}
.notice button{font-size:13px;min-height:36px;padding:4px 10px;margin-left:8px}

.collapsed-group{border-top:1px solid var(--line);font-size:14px;color:var(--muted);margin-top:16px}
.collapsed-group>summary{cursor:pointer;min-height:48px;padding:14px 0}
.collapsed-group .timeline{margin-bottom:20px}
.xp-rounds{font-size:14px;color:var(--muted);padding-left:24px}
.xp-rounds li{margin:6px 0}
.available-weeks a{flex:1}
.available-weeks .mono{white-space:nowrap}
.badges{display:flex;flex-wrap:wrap;gap:8px}
.level-inline>span:first-child{flex:1}

@media(max-width:700px){.notice{padding-bottom:12px}
.level-inline{flex-wrap:wrap}
.level-inline>span:last-child{font-size:13px}
.available-weeks li{align-items:start}
.available-weeks a{min-width:7em}
}


.continue-link{border-radius:9px}
.mobile-tabs button{border-radius:0}

@media(prefers-color-scheme:dark){.continue-link,.chart-switch button[aria-pressed=true]{color:var(--bg)}
.continue-link:hover{color:var(--purple)}
}

/* ===== 任務日誌 v0.1：只做深色。以下覆寫上面的淺色與跟隨系統設定 ===== */
:root{color-scheme:dark;
  --void:#12151C;--panel:#1C212C;--panel-hi:#252C3A;--edge:#3B455C;--text:#E6E9EF;--dim:#98A2B8;
  --ember:#FF6B3D;--on-ember:#12151C;--frost:#6FD6E8;--cut:14px;--slant:10px;--skew:-20deg;
  --bg:var(--void);--surface:var(--panel);--ink:var(--text);--muted:var(--dim);--line:var(--edge);
  --purple:var(--frost);--purple-soft:var(--panel-hi);--orange:var(--ember);--orange-soft:var(--panel-hi);--grid:var(--edge);
  --green:var(--frost);--passed-ink:var(--frost);--green-soft:var(--panel-hi);--track:var(--panel-hi);
  /* 品牌色例外：與首頁的 whY／Because／So 同值。 */
  --why:#C7B0F0;--because:#9CC8F2;--so:#F4B26A;
  --theme-A:#FF8A4C;--theme-P:#5AA9F0;--theme-S:#5CC977;--theme-D:#A08BFF;--theme-T:#3BC0D6;--theme-H:#F06595;
  --display:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  --mono:"Barlow Condensed","Noto Sans TC",sans-serif}
*,*::before,*::after{border-radius:0!important;box-shadow:none!important}
.status-mark,.legend-dot{border-radius:50%!important}
h1,h2,h3{font-weight:900}
.mono{font-style:italic;font-weight:700;letter-spacing:.01em}
button:focus-visible,a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline-color:var(--frost)}
.site-bar{background:var(--void);border-block:0;border-bottom:2px solid var(--edge)}
.brand i:first-child{color:var(--why)}.brand i:nth-child(2){color:var(--because)}.brand i:nth-child(3){color:var(--so)}
.paper{background:transparent;border-inline:0}
/* 現在的任務：餘燼橙；等級：霜青。面板切掉右下角 */
.next-step,.level-panel{background:var(--panel);clip-path:polygon(0 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%)}
.next-step{border-top:4px solid var(--ember)}
.level-panel{border-top:4px solid var(--frost)}
.level-number{color:var(--frost);font-size:56px;line-height:1;font-weight:700}
progress{height:10px;transform:skewX(var(--skew))}
progress,progress::-webkit-progress-bar{background:var(--panel-hi)}
progress::-webkit-progress-value{background:var(--frost)}
progress::-moz-progress-bar{background:var(--frost)}
.continue-link,.continue-link:hover{background:var(--ember);color:var(--on-ember);border:0;font-weight:700;padding-inline:28px;
  clip-path:polygon(var(--slant) 0,100% 0,calc(100% - var(--slant)) 100%,0 100%)}
.continue-link:hover{filter:brightness(1.12)}
.continue-link svg{display:none}
.chart-switch{border:0;padding:0;gap:4px}
.chart-switch button{background:var(--panel-hi);color:var(--text);font-weight:700;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);padding-inline:16px}
.chart-switch button[aria-pressed=true]{background:var(--edge);color:var(--text)}
.xp-details{border-block:2px solid var(--edge)}
/* 探索六邊形的主題色：不跟隨系統，一律用深色底上清楚的那一組 */
.axis-A{background:var(--theme-A)}.axis-P{background:var(--theme-P)}.axis-S{background:var(--theme-S)}
.axis-D{background:var(--theme-D)}.axis-T{background:var(--theme-T)}.axis-H{background:var(--theme-H)}

/* 一般導覽採灰階；切角操作的焦點框內縮，橙底用深色。 */
button:hover,a:hover,.site-inner nav [aria-current]{color:var(--text)}
.site-inner nav [aria-current],.mobile-tabs button[aria-selected=true]{border-bottom-color:var(--text);color:var(--text)}
.section-number,.route-continue{color:var(--dim)}
.continue-link:focus-visible,.chart-switch button:focus-visible{outline:3px solid var(--frost);outline-offset:-5px}
.continue-link:focus-visible{outline-color:var(--on-ember)}
`;
function growthLayout() {
  for(const link of document.querySelectorAll('link[rel="stylesheet"]'))if(/\/assets\/shell\.css(?:[?]|$)/.test(link.href))link.disabled=true;
  const style=node('style',growthCSS);document.head.append(style);
  const font=node('link');font.rel='stylesheet';font.href='https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,600;1,700&family=Noto+Sans+TC:wght@400;500;700;900&display=swap';document.head.append(font);
  document.body.innerHTML=growthMarkup;
  const $ = id => document.body.querySelector('#'+id);
  // 登入前也沿用原帳密表單；樣式限於登入區，不套用活動頁外框。
  $('login').className='growth-login';
  document.head.append(node('style',`
    .growth-login{--u:.5rem}
    .growth-login .ybs-login{display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px;margin:0 auto;text-align:left}
    .growth-login .ybs-login label{font-size:15px;font-weight:700}
    .growth-login .ybs-login input:not([type="button"]){display:block;width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:18px;padding:calc(var(--u)*1.25) calc(var(--u)*1.5);border:2px solid var(--edge);background:var(--panel-hi);color:var(--text)}
    .growth-login .ybs-login input::placeholder{color:var(--dim);opacity:1}
    .growth-login .ybs-login .btn{width:100%;min-height:44px;font:inherit;font-weight:700;padding:calc(var(--u)*1.25) calc(var(--u)*3);border:0;background:var(--ember);color:var(--on-ember);clip-path:polygon(var(--slant) 0,100% 0,calc(100% - var(--slant)) 100%,0 100%)}
    .growth-login .ybs-login .btn:focus-visible{outline:3px solid var(--on-ember);outline-offset:-6px}
    .growth-login .ybs-login .btn:disabled{background:var(--panel-hi);color:var(--dim);cursor:wait}
    .growth-login .ybs-password{position:relative}
    .growth-login .ybs-password input[name="password"]{padding-right:92px}
    .growth-login .ybs-password-icon{position:absolute;right:59px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text)}
    .growth-login .ybs-password-toggle{position:absolute;right:3px;top:50%;transform:translateY(-50%);box-sizing:border-box;width:80px;min-height:44px;padding:4px 4px 4px 26px;font:inherit;font-size:14px;border:0;background:transparent;color:var(--text);cursor:pointer}
    .growth-login .tlogin{margin-top:12px;text-align:center}
    .growth-login .tlogin summary{font-size:14px;color:var(--dim);cursor:pointer;text-decoration:underline}
    .growth-login .tlogin .linkbtn{display:block;margin:12px auto}
  `));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const teacherTarget = null;
  const mobile = matchMedia('(max-width:700px)');
  const panels = ['exploration','route'];
  let selectedPanel = 'exploration', scope = 'open', confirmed = null;
  function syncTabs() {
    $('growth-tabs').hidden = !mobile.matches;
    for (const name of panels) {
      const selected = name === selectedPanel, tab = $(name + '-tab'), panel = $(name + '-panel');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = mobile.matches && !selected;
      panel.setAttribute('aria-labelledby', name + (mobile.matches ? '-tab' : '-title'));
      if (mobile.matches) { panel.setAttribute('role','tabpanel'); panel.tabIndex = 0; }
      else { panel.removeAttribute('role'); panel.removeAttribute('tabindex'); }
    }
  }
  for (const name of panels) {
    const tab = $(name + '-tab');
    tab.onclick = () => { selectedPanel = name; syncTabs(); };
    tab.onkeydown = event => {
      let next;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) next = panels[1 - panels.indexOf(name)];
      else if (event.key === 'Home') next = panels[0];
      else if (event.key === 'End') next = panels[1];
      else return;
      event.preventDefault(); selectedPanel = next; syncTabs(); $(next + '-tab').focus();
    };
  }
  mobile.addEventListener('change', syncTabs);
  syncTabs();

  function radar(result) {
    const opened = scope === 'open';
    const stations = result.stations.filter(a => !opened || a.isOpen);
    const passed = stations.reduce((n,a) => n + a.passed,0), total = stations.reduce((n,a) => n + a.rounds.length,0);
    const axes = result.exploration.map(a => ({...a, count:opened ? a.openPassed : a.passed,
      denominator:opened ? a.openTotal : a.total, ratio:opened ? a.openValue : a.value}));
    const scopeLabel = opened ? '已開放部分' : '全學期';
    const percent = v => Math.round(v * 100);
    $('completion-rate').innerHTML = percent(total ? passed / total : 0) + '<span>%</span>';
    $('completion-label').textContent = scopeLabel + '完成率';
    $('completion-detail').innerHTML = '<span class="mono">' + passed + ' / ' + total + '</span> 關完成<br><span class="muted">'
      + (opened ? '目前開放 ' + stations.length + ' 個活動；還有 ' + (total-passed) + ' 關未完成。' : '全學期 ' + stations.length + ' 個活動；包含尚未開放內容。') + '</span>';
    const point = (i,v) => [150 + Math.sin(i*Math.PI/3)*103*v,140 - Math.cos(i*Math.PI/3)*103*v];
    const shape = v => axes.map((_,i) => point(i,v).join(',')).join(' ');
    const plot = axes.map((a,i) => point(i,a.ratio).join(',')).join(' ');
    $('radar').innerHTML = '<svg class="radar" viewBox="0 0 300 280" role="img" aria-labelledby="radar-title radar-desc">'
      + '<title id="radar-title">' + scopeLabel + '的探索六邊形</title><desc id="radar-desc">'
      + axes.map(a => a.id + ' ' + a.name + '：' + (a.denominator ? a.count + '/' + a.denominator + ' 關，' + percent(a.ratio) + '%' : '尚無關卡')).join('；') + '。各主題可重複計關。</desc>'
      + '<polygon class="plot-fill" points="' + plot + '"/>'
      + [.25,.5,.75,1].map(v => '<polygon class="gridline" points="' + shape(v) + '"/>').join('')
      + axes.map((_,i) => '<line class="spoke" x1="150" y1="140" x2="' + point(i,1)[0] + '" y2="' + point(i,1)[1] + '"/>').join('')
      + '<polygon class="plot-outline" points="' + plot + '"/>'
      + axes.map((a,i) => { const p=point(i,a.ratio),t=point(i,1.23); return '<circle class="plot-dot" r="3.5" cx="' + p[0] + '" cy="' + p[1] + '"/><text x="' + t[0] + '" y="' + t[1] + '" text-anchor="middle" dominant-baseline="middle" font-size="15">' + a.id + '</text>'; }).join('') + '</svg>';
    $('axes').innerHTML = axes.map(a => '<li data-axis="' + a.id + '"><span class="axis-title"><i class="axis-color axis-' + a.id + '" aria-hidden="true"></i><b class="mono axis-key">' + a.id + '</b>' + a.name + '</span><span class="axis-value">'
      + (a.denominator ? '<span class="mono">' + percent(a.ratio) + '%</span><span class="muted"><span class="mono">' + a.count + ' / ' + a.denominator + '</span> 關</span>' : '<span class="muted">' + (opened ? '尚未開放' : '未安排關卡') + '</span>') + '</span></li>').join('');
    $('chart-note').textContent = '以各主題「' + (opened ? '已開放' : '全學期') + '關數」為分母；同一關可對應多個主題，主題關次不等於總過關數。';
    document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.scope === scope)));
  }
  document.querySelectorAll('[data-scope]').forEach(button => button.onclick = () => { scope = button.dataset.scope; if (confirmed) radar(confirmed); });

  // 徽章以課綱主題軸區分；多主題活動同時顯示各軸，仍只計一枚活動徽章。
  const glyphs = {
    A:'<path d="M5 5h22v7H5zM16 12v6M5 22h8v6H5zM19 22h8v6h-8zM9 22v-4h14v4"/>',
    P:'<path d="m11 7-8 9 8 9m10-18 8 9-8 9M18 4l-4 24"/>',
    S:'<path d="m4 9 12-5 12 5-12 5ZM4 15l12 5 12-5M4 21l12 5 12-5"/>',
    D:'<rect x="4" y="4" width="9" height="9"/><rect x="19" y="4" width="9" height="9"/><rect x="4" y="19" width="9" height="9"/><path d="M19 19h9v9h-9zM23.5 19v9M19 23.5h9"/>',
    T:'<rect x="4" y="5" width="24" height="18" rx="2"/><path d="M11 28h10M16 23v5M9 11h14M9 16h9"/>',
    H:'<path d="m16 3 11 5v8c0 7-11 13-11 13S5 23 5 16V8zM10 16l4 4 8-9"/>'
  };
  const weekLabel = a => { const term = TERMS.find(t => a.date >= t.begin && a.date <= t.end); return (term?.name || '') + ' · ' + (termWeekLabel(a) || '未排定週次'); };
  function render(activities, result) {
    const roundInfo = (a,r) => r.teacherPending?'（訪客紀錄待老師確認）':'';
    // UI 所需中繼資料直接由活動登記處補入，不改 XP 核心或雲端格式。
    result.stations = result.stations.map(a => {
      const source = activities.find(source => source.week === a.activity);
      return {...a, topic:source.topic,
        themes:[...new Set((source.codes || []).map(c => /^資([APSDTH])-/.exec(c)?.[1]).filter(Boolean))]};
    });
    confirmed = result;
    const current = result.stations.findLast(a => a.isOpen && a.visited && !a.complete)
      || result.stations.findLast(a => a.isOpen && !a.complete);
    $('current-title').textContent = current?.title || '已完成所有已開放活動';
    $('current-week').textContent = current ? 'W' + String(termWeekOf(current)).padStart(2,'0') : '';
    $('current-description').textContent = current ? '已完成 ' + current.passed + ' / ' + current.rounds.length + ' 關，接著挑戰「' + current.rounds.find(r => !r.passed).name + '」。' : '每走過一站，都算自己的進步。新的活動開放後再來探索。';
    $('continue-action').hidden = !!teacherTarget || !current;
    if (current) { $('remaining').textContent = current.rounds.length-current.passed; $('continue-link').href = '../../' + current.href; }
    else $('continue-link').removeAttribute('href');
    $('level').textContent = result.title;
    $('level-number').textContent = 'Lv ' + result.level;
    $('total').textContent = $('xp-total').textContent = result.totalXP===null?'待老師確認':result.totalXP + ' XP';
    $('progress').value = result.progress;
    $('progress').setAttribute('aria-label','Lv ' + result.level + ' 升級進度 ' + Math.round(result.progress * 100) + '%');
    $('next').innerHTML = result.next === null ? '已達最高等級，繼續探索吧！' : '再累積 <b class="mono">' + result.remaining + ' XP</b><br>成為「' + YBSXP.TITLES[result.level] + '」。';
    $('mobile-level').innerHTML = '<b class="mono">Lv ' + result.level + '</b> ' + result.title;
    $('mobile-next').innerHTML = result.next === null ? '已達最高等級' : '差 <b class="mono">' + result.remaining + ' XP</b> 升級';
    $('floor').textContent = result.floor + ' XP'; $('ceiling').textContent = result.next === null ? '最高等級' : result.next + ' XP';
    $('completed').textContent = result.stations.reduce((n,a) => n + a.passed,0);
    $('badge-count').textContent = result.badges.length;
    radar(result);
    const badge = a => '<span class="badges">' + (a.themes.length ? a.themes.map(id => '<span class="badge route-badge theme-' + id + '" aria-label="' + YBSXP.THEMES[id] + '：已獲得徽章"><svg viewBox="0 0 32 32" aria-hidden="true">' + glyphs[id] + '</svg><span>已獲得徽章<small>' + YBSXP.THEMES[id] + '</small></span></span>').join('') : '<span class="badge route-badge">已獲得徽章<small>開學導覽</small></span>') + '</span>';
    const title = a => (a.rounds.some(r=>r.teacherPending)?'（待老師確認）':'') + (a.isOpen && !teacherTarget ? '<a href="../../' + esc(a.href) + '">' + esc(a.title) + '</a>' : esc(a.title));
    const stationHTML = (a,i) => '<li class="station ' + (a.complete ? 'complete' : !a.isOpen ? 'locked' : 'current') + (a.visited ? ' visited' : '') + ((i+1)%3===0 ? ' row-end' : '') + '" data-activity="' + a.activity + '" data-state="' + a.state + '"' + (a === current ? ' aria-current="step"' : '') + '><div class="week-line"><i class="route-node" aria-hidden="true">' + (a.complete ? '<svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7"/></svg>' : '') + '</i><b class="week-label mono" aria-label="' + esc(weekLabel(a)) + '">W' + String(termWeekOf(a)).padStart(2,'0') + '<span>' + esc(a.date.slice(5).replace('-','.')) + '</span></b><span class="station-state">' + (a.complete ? '已完成' : !a.isOpen ? '待開放' : a === current ? '目前活動' : '探索中') + '</span></div><div class="station-body"><h3>' + title(a) + '</h3><p class="learned"><span class="topic-label">' + (a.complete ? '學會了什麼' : '學習主題') + '</span>' + esc(a.topic) + '</p><div class="station-bottom">' + (a.complete ? badge(a) : a.isOpen && !teacherTarget ? '<a href="../../' + esc(a.href) + '" class="route-continue">繼續挑戰 ↗</a>' : '<span class="muted">' + (a.isOpen ? '唯讀檢視' : '尚未開放') + '</span>') + '<span class="station-count mono">' + a.passed + ' / ' + a.rounds.length + ' 關</span></div></div></li>';
    const timeline = items => '<div class="timeline"><ol class="stations">' + items.map((a,i) => (i > 0 && i%3===0 ? '<li class="row-break" aria-hidden="true">↳ 下一列由左至右</li>' : '') + stationHTML(a,i)).join('') + '</ol></div>';
    const next = result.stations.find(a => !a.isOpen);
    const nextWeek = next && weekLabel(next);
    const shown = result.stations.filter(a => a.visited || a === current || (!a.isOpen && weekLabel(a) === nextWeek));
    const available = result.stations.filter(a => a.isOpen && !shown.includes(a));
    const future = new Map();
    for (const a of result.stations.filter(a => !a.isOpen && !shown.includes(a))) { const week=weekLabel(a); if(!future.has(week))future.set(week,[]); future.get(week).push(a); }
    $('route').innerHTML = timeline(shown)
      + (available.length ? '<details class="available-weeks" id="available-weeks"><summary>已開放、尚未開始 <span>' + available.length + ' 個活動</span></summary><ul>' + available.map(a => '<li data-activity="' + a.activity + '"><span class="mono">W' + String(termWeekOf(a)).padStart(2,'0') + '</span>' + title(a) + '<span class="muted">' + a.rounds.length + ' 關</span></li>').join('') + '</ul></details>' : '')
      + (future.size ? '<details id="future-weeks" class="collapsed-group"><summary>還有 ' + future.size + ' 週待開放</summary>' + [...future].map(([week,items]) => '<section class="route-week"><h3>' + esc(week) + '</h3>' + timeline(items) + '</section>').join('') + '</details>' : '');
    const xpHTML = a => '<details class="xp-item"><summary><span>' + esc(a.title) + '</span><b class="mono">+' + a.totalXP + ' XP</b><span class="expand-icon" aria-hidden="true"></span></summary><dl class="xp-breakdown"><div><dt>首次過關</dt><dd class="mono">' + a.rounds.reduce((n,r) => n+r.passXP,0) + '</dd></div><div><dt>準時加成</dt><dd class="mono">' + a.rounds.reduce((n,r) => n+r.onTimeXP,0) + '</dd></div><div><dt>活動全過</dt><dd class="mono">' + a.completeXP + '</dd></div></dl><ul class="xp-rounds">' + a.rounds.map(r => '<li>' + esc(r.name) + '：' + (r.teacherPending?'待老師確認':r.passed ? '過關 +' + r.passXP + '、準時 +' + r.onTimeXP : '尚未過關 · 0 XP') + roundInfo(a,r) + '</li>').join('') + '</ul></details>';
    const untouched = result.stations.filter(a => a.totalXP === 0);
    $('details').innerHTML = result.stations.filter(a => a.totalXP > 0).map(xpHTML).join('') + (untouched.length ? '<details id="zero-xp" class="collapsed-group"><summary>尚未過關 ' + untouched.length + ' 項</summary>' + untouched.map(xpHTML).join('') + '</details>' : '');
    $('growth').hidden = false;
  }


  const today = new Date().toLocaleDateString('sv-SE');
  const term = typeof TERMS==='undefined'?null:TERMS.find(t => today >= t.begin && today <= t.end);
  $('term').textContent = term?.name || '115 學年度';
  const clear=()=>{
    confirmed=null;scope='open';selectedPanel='exploration';syncTabs();
    $('growth').hidden=true;$('xp-details').open=false;
    for(const id of ['level','level-number','mobile-level','mobile-next','floor','ceiling','total','xp-total','next','completed','radar','axes','route','badge-count','details','current-title','current-week','current-description','remaining','completion-rate','completion-label','completion-detail','chart-note'])$(id).textContent='';
    $('progress').value=0;$('progress').setAttribute('aria-label','升級進度');$('continue-link').removeAttribute('href');
  };
  return {$,render,clear,status:$('status'),login:$('login'),logout:$('logout'),retry:$('retry')};
}
// 公開登記處沒有 Worker 的提早開放投影；依既有日期呈現，連結仍由 Worker 守門。
export function growthActivities() {
  return catalog().map(a=>({...a,openedAt:typeof activityOpenAt==='function'?activityOpenAt(a):undefined,
    isOpen:typeof isActivityOpen==='function'&&isActivityOpen(a)}));
}
export function growthJourney(result,activities) {
  const stations=result.activities.map(detail=>{
    const a=activities.find(a=>a.course===detail.course&&a.week===detail.activity);
    const complete=detail.rounds.length>0&&detail.passed===detail.rounds.length;
    return {...detail,title:a.title,href:a.href,date:a.date,visited:detail.passed>0,complete,isOpen:a.isOpen===true,
      state:complete?'complete':detail.passed>0?'in-progress':a.isOpen===true?'available':'upcoming'};
  }).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||a.activity-b.activity);
  return {...result,stations,badges:stations.filter(a=>a.complete)};
}
export async function mountGrowth({client:promise}) {
  if(location.search.includes('cls=')||location.search.includes('seat='))return mountTeacher({client:promise});
  const p=growthLayout();let reading=0,shownUID=null;
  try{p.client=await promise;}catch(e){p.status.textContent=explain(e);return;}
  mountHistory({client:p.client,host:p.$('growth'),scope:()=>({})});
  p.refresh=async()=>{
    const n=++reading,uid=p.client.state().profile?.uid;if(!uid)return;
    p.status.textContent='正在確認自己的雲端紀錄…';p.retry.hidden=true;
    try{
      const activities=growthActivities();
      const snapshot=await p.client.progress({activities}),xp=await xpCore();
      if(n!==reading||p.client.state().profile?.uid!==uid)return;
      const result=growth(snapshot,{project:p.client.project,course:p.client.course,subject:snapshot.subject,
        provider:snapshot.provider,activities},xp);
      if(result.state!=='confirmed'&&result.reason!=='guest-xp-policy-pending'){p.clear();p.status.textContent=explain(result);}
      else{p.render(activities,growthJourney(result,activities));p.status.textContent=result.reason==='guest-xp-policy-pending'?'訪客紀錄待老師確認；其餘進度已顯示。':'已確認自己的雲端紀錄。';}
    }catch(e){if(n===reading){p.clear();p.status.textContent=explain(e);}}
    finally{if(n===reading)p.retry.hidden=false;}
  };
  p.client.subscribe(state=>{
    const signedIn=!!state.profile;p.$('signin').hidden=signedIn;p.logout.hidden=!signedIn;
    if(!signedIn||state.profile.uid!==shownUID||state.status==='stale'){
      reading++;p.clear();p.retry.hidden=!signedIn;
      p.status.textContent=signedIn?'紀錄待重新確認。':'請先登入帳號。';
    }
    shownUID=state.profile?.uid||null;
  });
  p.logout.onclick=async()=>{reading++;p.clear();try{await p.client.logout();}catch(e){p.status.textContent=explain(e);}};
  p.retry.onclick=p.refresh;
  await mountLogin({client:p.client,host:p.login,onLogin:p.refresh,oldlook:true});
  eventsRefresh(p,p.refresh);
  try{await p.client.restore();if(p.client.state().profile)await p.refresh();}
  catch(e){p.status.textContent=explain(e);}
}
function eventsRefresh(p,refresh) {
  window.addEventListener('focus',()=>{if(p.client.state().profile)refresh();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&p.client.state().profile)refresh();});
}
export async function mountActivity({client:promise,cfg,now}) {
  if(cfg.course==='115-g9')return (await import('./fullrev-shell.mjs')).mountActivityShell({client:promise,cfg,mountLogin,xpCore,explain,now});
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
      p.status.textContent=value.correct===false?(value.feedback||'再修改同一題，不扣分。'):'作答中。';
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
// Audit pages are requested explicitly and never enter the grading projection.
export function mountHistory({client,host,scope}){
  const box=node('section'),rows=node('div'),status=node('p'),kind=node('select');
  kind.setAttribute('aria-label','歷史來源');
  for(const [value,label] of [['formal','正式紀錄'],['legacy','舊站封存']]){const option=node('option',label);option.value=value;kind.append(option);}
  kind.value='formal';let serial=0,next=null,saved=null;
  const clear=()=>{serial++;next=null;saved=null;rows.replaceChildren();status.textContent='';more.hidden=true;client.cancelHistory?.();};
  async function read(advance=false){
    const target={...scope(),kind:kind.value},key=JSON.stringify(target),n=++serial;
    if(!advance||saved!==key){next=null;rows.replaceChildren();}saved=key;
    more.hidden=true;status.textContent='正在查閱歷史…';
    try{const page=await client.history({...target,after:next});if(n!==serial)return;
      for(const r of page.records)rows.append(node('p',`活動 ${r.activity}／第 ${r.round+1} 關 · ${r.completedAt||'時間未留存'} · ${r.validity?.state==='effective'?'目前有效':'封存紀錄'}`));
      next=page.next;more.hidden=next===null;status.textContent='歷史僅供查閱，不會新增採計。';
    }catch(e){if(n===serial)status.textContent=explain(e);}
  }
  const more=button('下一頁',()=>read(true));more.hidden=true;
  box.append(button('查閱歷史',()=>read()),kind,status,rows,more);host.append(box);kind.onchange=clear;
  client.subscribe(state=>{if(!state.profile||['stale','binding-changed','context-changed'].includes(state.status))clear();});
  return {clear};
}
export async function mountTeacher({client:promise}) {
  const p=await setup(promise,'教師紀錄與匯出',{ownerOnly:true});if(!p.client)return;
  const classKey=node('input');classKey.placeholder='例如 c901';classKey.setAttribute('aria-label','班級代碼');
  p.tools.append(node('label','班級代碼'),classKey);
  const subject=node('select');subject.setAttribute('aria-label','查閱歷史的學生');p.tools.append(subject);
  const history=mountHistory({client:p.client,host:p.tools,scope:()=>({classKey:subject.selectedOptions?.[0]?.dataset.classKey||classKey.value.trim(),subject:subject.value.trim()})});
  subject.oninput=history.clear;
  let reading=0;
  async function refresh(download=false) {
    const n=++reading;p.content.replaceChildren();
    try {
      const snapshots=await teacherSnapshots(p.client,classKey.value.trim(),catalog());
      const snapshot={people:snapshots.flatMap(s=>(s.people||[]).map(p=>({...p,classKey:s.classKey})))};
      subject.replaceChildren();for(const person of snapshot.people||[]){const option=node('option',`${person.cls} 班 ${person.seat} 號`);option.value=person.subject;option.dataset.classKey=person.classKey;subject.append(option);}
      const xp=await xpCore();
      const tables=snapshots.map(s=>exportRows(s,{project:p.client.project,course:p.client.course,activities:catalog()},xp));
      const rows=[tables[0][0],...tables.flatMap(t=>t.slice(1))];
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
  classKey.oninput=()=>{history.clear();reading++;p.content.replaceChildren();p.status.textContent='請重新讀取所選班級。';};
  p.client.subscribe(state=>{if(!state.profile||state.status==='stale'){reading++;p.content.replaceChildren();}});
  eventsRefresh(p,()=>{p.content.replaceChildren();p.status.textContent='請重新確認紀錄後匯出。';});
}

export async function teacherSnapshots(client,classKey,activities) {
  // 班級代碼也可能是完整 gate；只有 owner 確認原 gate 不存在才展開分組。
  try{return [await client.progress({teacher:true,classKey,activities})];}
  catch(e){if(e.code!=='class-not-found'||client.course!=='115-g9'||!/^c[1-9][0-9]{2}$/.test(classKey))throw e;}
  const values=[];
  for(const key of [classKey+'_1',classKey+'_2'])values.push(await client.progress({teacher:true,classKey:key,activities}));
  return values;
}
