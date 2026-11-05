/* 教師雲端成績：單次伺服器查詢，僅 owner 可讀；不寫入、刪除或持久化教師資料。 */
'use strict';
window.YBSGuestTeacher = function ({course, activities, saveBook}) {
  const el = id => document.getElementById(id);
  let auth, db, ready, generation = 0, busy = false, rows = [], people = [];
  const message = text => { el('cloud-status').textContent = text; };
  function controls() {
    el('cloud-login').disabled = busy;
    el('cloud-read').disabled = busy || !auth?.currentUser || auth.currentUser.isAnonymous;
    el('cloud-logout').disabled = !auth?.currentUser;
    el('cloud-export').disabled = !rows.length;
  }
  function clear() { rows = []; people = []; el('cloud-table').textContent = ''; el('cloud-class').innerHTML = ''; el('cloud-class').value = ''; el('cloud-class').disabled = true; controls(); }
  function error(e) {
    return /permission-denied/.test(e?.code || '') ? '無權限：只有此課程的擁有者可以讀取雲端成績。'
      : /popup-closed|cancelled-popup/.test(e?.code || '') ? '登入已取消。'
      : '雲端讀取失敗，請確認網路後重試。';
  }
  async function init() {
    ({auth, db} = await YBS.firebaseSession());
    auth.onAuthStateChanged(user => {
      generation++; clear();
      message(user && !user.isAnonymous ? '教師已登入，請讀取雲端紀錄。' : '請使用 ClassScore 課程擁有者的 Google 帳號登入。');
    });
    controls();
  }
  async function read() {
    if (busy || !auth?.currentUser) return;
    busy = true; clear(); message('讀取帳號與班座紀錄中…');
    const token = ++generation, uid = auth.currentUser.uid;
    const active = () => generation === token && auth.currentUser?.uid === uid;
    try {
      const doc = await db.doc('ybsCourses/' + course).get({source:'server'});
      if (!active()) return;
      if (!doc.exists || doc.data().ownerUid !== uid || auth.currentUser.isAnonymous) {
        throw Object.assign(new Error('owner only'), {code:'permission-denied'});
      }
      const [attempts, guests, roster] = await Promise.all(['attempts', 'guestAttempts', 'roster'].map(name =>
        db.collection('ybsCourses/' + course + '/' + name).get({source:'server'})));
      if (!active()) return;
      const listed = new Map(roster.docs.map(d => [d.id, d.data()]));
      people = [...listed.values()].filter(p => /^[1-9]\d{2}$/.test(String(p.cls)) && Number.isInteger(p.seat) && p.seat >= 1 && p.seat <= 60)
        .map(p => ({cls:Number(p.cls), seat:p.seat}));
      const grouped = new Map(); let skipped = 0;
      const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      for (const [snapshot, guest] of [[attempts, false], [guests, true]]) for (const doc of snapshot.docs) {
        const d = doc.data(), n = activities[d.activity]?.rounds?.length;
        const match = doc.id.match(/^(.+)_(\d+)_(\d+)$/), id = match?.[1];
        const person = guest ? d : listed.get(d.email);
        const cls = guest ? (/^[1-9]\d{2}$/.test(d.cls) && typeof d.cls === 'string' ? Number(d.cls) : NaN) : Number(person?.cls);
        const seat = person?.seat, at = d.passedAt?.toMillis?.();
        if (!integer(d.activity, 1, guest ? 31 : 99) || !integer(d.round, 0, 5) || !n || d.round >= n
            || !integer(d.level, 1, 2) || !integer(d.tries, 1, 999)
            || !integer(cls, 100, 999) || !integer(seat, 1, 60) || !Number.isFinite(at) || at <= 0
            || !id || id.length > 128 || doc.id !== id + '_' + d.activity + '_' + d.round
            || (guest ? d.verified !== false : d.uid !== id)) { skipped++; continue; }
        // 不同來源與 UID 分列；同班座多個匿名 UID 不自動算作同一人。
        const key = JSON.stringify([guest, id, d.activity, cls, seat]);
        let row = grouped.get(key);
        if (!row) { row = {cls, seat, activity:d.activity, uid:id, source:guest ? '未驗證' : '帳號名單', mask:0, tries:Array(n).fill(0), at:0}; grouped.set(key, row); }
        row.mask |= 1 << d.round; row.tries[d.round] = d.tries; row.at = Math.max(row.at, at);
      }
      rows = [...grouped.values()].sort((a,b) => a.cls-b.cls || a.seat-b.seat || a.activity-b.activity || a.source.localeCompare(b.source) || a.uid.localeCompare(b.uid));
      const select = el('cloud-class'); select.innerHTML = '';
      const option = (value, text) => { const node = document.createElement('option'); node.value = value; node.textContent = text; select.appendChild(node); };
      option('', '請選班級');
      for (const cls of [...new Set(people.map(p => p.cls))].sort((a,b)=>a-b)) option(String(cls), cls + ' 班');
      select.value = ''; select.disabled = false;
      render(); message('已讀取 ' + rows.length + ' 列；略過 ' + skipped + ' 筆格式或名單不符紀錄。班座來源「未驗證」，重複班座及名冊外紀錄待核對，不合併計分。');
    } catch (e) { if (active()) { clear(); message(error(e)); } }
    finally { busy = false; controls(); }
  }
  const headers = ['班級','座號','活動序號','活動','來源','UID','過關數','關卡數','各關嘗試次數','最後上傳'];
  const count = mask => { let n=0; while(mask){n+=mask&1;mask>>>=1;} return n; };
  const values = r => [r.cls,r.seat,r.activity,activities[r.activity].title,r.source,r.uid,count(r.mask),r.tries.length,r.tries.join(' / '),new Date(r.at)];
  const node = (tag, text) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=String(text); return n; };
  function details(records, warning) {
    const box=node('details'); box.appendChild(node('summary',warning || '詳細資料'));
    for(const r of records) box.appendChild(node('p',
      activities[r.activity].title + '・' + r.source + '・UID：' + r.uid + '・' + count(r.mask) + '/' + r.tries.length +
      '・各關嘗試：' + r.tries.join(' / ') + '・最後上傳：' + new Date(r.at).toLocaleString('zh-TW')));
    return box;
  }
  function render() {
    const target=el('cloud-table'); target.textContent='';
    const cls=Number(el('cloud-class').value); if(!cls)return;
    const table=node('table'), thead=node('thead'), head=node('tr');
    const ids=Object.keys(activities).map(Number).sort((a,b)=>a-b);
    head.appendChild(node('th','座號'));
    for(const id of ids)head.appendChild(node('th',activities[id].title));
    head.appendChild(node('th','詳細資料')); thead.appendChild(head); table.appendChild(thead);
    const tbody=node('tbody');
    const seats=[...new Set(people.filter(p=>p.cls===cls).map(p=>p.seat))].sort((a,b)=>a-b);
    for(const seat of seats){
      const records=rows.filter(r=>r.cls===cls&&r.seat===seat), tr=node('tr');tr.appendChild(node('td',seat));
      const duplicate=people.filter(p=>p.cls===cls&&p.seat===seat).length>1;
      const sharedUID=records.some(r=>rows.some(other=>other.uid===r.uid&&(other.cls!==cls||other.seat!==seat)));
      let conflict=duplicate||sharedUID;
      for(const id of ids){
        const found=records.filter(r=>r.activity===id), td=node('td');
        if(found.length>1||duplicate||sharedUID){td.textContent='待核對';conflict=true;}
        else if(found.length){const r=found[0], n=count(r.mask);td.textContent=(n===r.tries.length?'✓':n+'/'+r.tries.length)+(r.source==='未驗證'?'（未驗證）':'');}
        else td.textContent='0/'+activities[id].rounds.length;
        tr.appendChild(td);
      }
      const td=node('td');td.appendChild(details(records,conflict?'待核對：來源、UID 或名冊衝突':'詳細資料'));tr.appendChild(td);tbody.appendChild(tr);
    }
    table.appendChild(tbody);target.appendChild(table);
    const outside=rows.filter(r=>!people.some(p=>p.cls===r.cls&&p.seat===r.seat));
    if(outside.length)target.appendChild(details(outside,'待核對：名冊外紀錄（'+outside.length+' 列，不計入表格）'));
  }
  el('cloud-class').onchange = render;
  el('cloud-login').onclick = async () => {
    try {
      ready ||= init().catch(e => { ready=null; throw e; }); await ready;
      const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
      await auth.signInWithPopup(provider);
    } catch (e) { message(error(e)); }
  };
  el('cloud-read').onclick = read;
  el('cloud-logout').onclick = async () => {
    generation++; clear(); message('正在登出…');
    try { if(auth) await auth.signOut(); message('已登出，雲端成績已清除。'); }
    catch(e){message('登出未完成，雲端成績已清除；請重試。');}
  };
  el('cloud-export').onclick = () => {
    if(!rows.length)return;
    const sheet=XLSX.utils.aoa_to_sheet([headers,...rows.map(values)],{cellDates:true,dateNF:'yyyy/mm/dd hh:mm'});
    saveBook('資訊科技_雲端紀錄_'+course+'.xlsx',[['帳號與未驗證班座',sheet]]);
  };
  controls();
};
