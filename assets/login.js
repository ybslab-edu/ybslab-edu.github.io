// Fullrev only. Missing configuration stops; there is no legacy client.
const YBS=ybsFullrevFacade(typeof YBS_FULLREV_CONFIG==='undefined'?null:YBS_FULLREV_CONFIG);
function ybsFullrevFacade(config) {
  const ready = Promise.resolve().then(() => {
    if (!config || config.enabled !== true) throw Object.assign(new Error('configuration-pending'), {code:'configuration-pending'});
    return import('./fullrev-client.mjs?v=20261122shell');
  }).then(m => m.createBrowserClient(config));
  // 先掛失敗處理；設定未就緒不啟動舊專案。
  ready.catch(() => {});
  let current = null, pending = false, notify = () => {};
  ready.then(client => client.subscribe(state => {
    const previousUid=current?.uid;current = state.profile; pending = state.pending; notify(state.status);
    if(previousUid!==current?.uid)window.dispatchEvent(new CustomEvent('ybs-report-auth',{detail:{uid:current?.uid||null}}));
  })).catch(() => {});
  const call = name => (...args) => ready.then(client => client[name](...args));
  const mount = (name, args) => import('./fullrev-ui.mjs?v=20261122shell')
    .then(m => m[name]({client:ready, ...args}));
  return Object.freeze({fullrev:true, enabled:()=>true, profile:()=>current,
    firebaseSession:call('session'), logout:call('logout'), retry:call('retry'),
    hasPending:()=>pending, status:f=>{notify=f;},
    mountActivity:cfg=>import('./fullrev-activities.mjs?v=20261122shell').then(m=>mount('mountActivity', {cfg:m.activityConfig(cfg)})),
    mountGrowth:()=>mount('mountGrowth', {}), mountTeacher:()=>mount('mountTeacher', {}),
    // 舊頁尚未轉換時拒絕自報／匿名補寫，正式答案只能經 Worker。
    submit:()=>false, submitGuest:()=>false, flush:()=>false, flushGuest:()=>false,
    guest:()=>false, leaveGuest:()=>{}, endBrowserSession:call('logout'),
    whoami:call('whoami'), submitManual:call('submitManual'),
    loadDFContent:async()=>{
      const client=await ready;
      if(!client.state().profile){
        const host=document.createElement('section');document.body.append(host);
        await new Promise(async(resolve,reject)=>{try{await (await import('./fullrev-ui.mjs?v=20261122shell')).mountLogin({client,host,onLogin:resolve});}catch(e){reject(e);}});host.remove();
      }
      const scripts=await client.dfContent();
      for(const key of ['pub','enc-b2','enc-rv'])document.getElementById(key).textContent=scripts[key];
    },
    button:async(el,ok,bad)=>{
      try { await (await import('./fullrev-ui.mjs?v=20261122shell')).mountLogin({client:await ready,host:el,onLogin:ok}); }
      catch { bad?.('登入服務尚未就緒，請找老師。'); }
    },
    submitReport:call('submitReport')
  });
}

// 登出入口共用提示；只在提示期間查詢，不介入 Auth 或上傳狀態回呼。
const ybsLogoutPending = (() => {
  const primary = '紀錄上傳中，請稍候再登出';
  const secondary = '再按一次可直接登出，未上傳的紀錄可能遺失';
  const message = primary + '\n' + secondary;
  function show(el) {
    if (!document.getElementById('ybs-logout-pending-style')) {
      const style = document.createElement('style');
      style.id = 'ybs-logout-pending-style';
      // 固定深色底，讓淺色與深色入口都有相同的對比；僅套用於待送登出提示。
      style.textContent = `
        body .ybs-logout-pending.ybs-logout-pending{
          display:block;box-sizing:border-box;min-width:0;max-width:100%;
          padding:10px 16px;border:0;border-left:4px solid #FF6B3D;border-radius:0;
          background:#1C212C;box-shadow:none;text-align:left;white-space:normal;overflow-wrap:anywhere;
          clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)
        }
        body .ybs-logout-pending strong,body .ybs-logout-pending span{
          display:block;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
          font-size:16px;line-height:1.6;font-weight:700;color:#FF6B3D
        }
        body .ybs-logout-pending span{font-size:15px;font-weight:400;color:#E6E9EF;margin-top:4px}
      `;
      document.head.appendChild(style);
    }
    el.classList.add('ybs-logout-pending');
    if (el.textContent !== message) {
      const main = document.createElement('strong'), detail = document.createElement('span');
      main.textContent = primary; detail.textContent = secondary;
      el.replaceChildren(main, document.createTextNode('\n'), detail);
    }
    el.hidden = false;
  }
  let notice = null;
  function clear() {
    if (!notice) return;
    const {el, text, hidden, timer} = notice;
    clearInterval(timer);
    el.classList.remove('ybs-logout-pending');
    if (el.textContent === message) { el.textContent = text; el.hidden = hidden; }
    notice = null;
  }
  return (el) => {
    if (notice) { clear(); return false; }
    if (!YBS.hasPending()) return false;
    const text = el.textContent, hidden = el.hidden;
    show(el);
    const timer = setInterval(() => {
      if (!YBS.hasPending() || !el.isConnected) { clear(); return; }
      show(el);
    }, 200);
    notice = {el, text, hidden, timer};
    return true;
  };
})();
