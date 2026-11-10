/* 教師雲端成績：單次伺服器查詢，僅 owner 可讀；不寫入、刪除或持久化教師資料。 */
'use strict';
window.YBSGuestTeacher = function ({course, activities, saveBook, onRecords = () => {}}) {
  const el = id => document.getElementById(id);
  let auth, db, ready, generation = 0, busy = false, rows = [], people = [], growth = new Map();
  const message = text => { el('cloud-status').textContent = text; };
  function controls() {
    el('cloud-login').disabled = busy;
    el('cloud-read').disabled = busy || !auth?.currentUser || auth.currentUser.isAnonymous;
    el('cloud-logout').disabled = !auth?.currentUser;
    el('cloud-export').disabled = !rows.length;
  }
  function clear() { rows = []; people = []; growth.clear(); onRecords(null); el('cloud-table').textContent = ''; el('cloud-class').innerHTML = ''; el('cloud-class').value = ''; el('cloud-class').disabled = true; controls(); }
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
      people = [...listed.entries()].filter(([,p]) => /^[1-9]\d{2}$/.test(String(p.cls)) && Number.isInteger(p.seat) && p.seat >= 1 && p.seat <= 60)
        .map(([email,p]) => ({email, cls:Number(p.cls), seat:p.seat}));
      // 與學生端使用相同 attempts 與時間優先規則；不從分數或班座紀錄換算 XP。
      const catalog = Object.values(activities).map(a => ({...a, openedAt:activityOpenAt(a)}));
      const accountRecords = new Map(people.map(p => [p.email, []]));
      for (const doc of attempts.docs) {
        const d = doc.data();
        if (accountRecords.has(d.email) && typeof d.uid === 'string' && d.uid && doc.id === d.uid + '_' + d.activity + '_' + d.round) {
          accountRecords.get(d.email).push({...d, course});
        }
      }
      growth = new Map([...accountRecords].map(([email, records]) => [email, {...YBSXP.calculate(catalog, records), hasAttempts:records.length > 0}]));
      const grouped = new Map(), healthRecords = []; let skipped = 0;
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
        if (!guest) healthRecords.push({email:d.email, uid:id, activity:d.activity, round:d.round, tries:d.tries, at});
        // 不同來源與 UID 分列；同班座多個匿名 UID 不自動算作同一人。
        const key = JSON.stringify([guest, id, d.activity, cls, seat]);
        let row = grouped.get(key);
        if (!row) { row = {cls, seat, email:guest ? null : d.email, activity:d.activity, uid:id, source:guest ? '未驗證' : '帳號名單', mask:0, tries:Array(n).fill(0), passedAt:Array(n).fill(null), at:0}; grouped.set(key, row); }
        row.mask |= 1 << d.round;
        if (row.passedAt[d.round] === null || at < row.passedAt[d.round]) {
          row.passedAt[d.round] = at; row.tries[d.round] = d.tries;
        }
        row.at = Math.max(row.at, at);
      }
      rows = [...grouped.values()].sort((a,b) => a.cls-b.cls || a.seat-b.seat || a.activity-b.activity || a.source.localeCompare(b.source) || a.uid.localeCompare(b.uid));
      const select = el('cloud-class'); select.innerHTML = '';
      const option = (value, text) => { const node = document.createElement('option'); node.value = value; node.textContent = text; select.appendChild(node); };
      option('', '請選班級');
      for (const cls of [...new Set(people.map(p => p.cls))].sort((a,b)=>a-b)) option(String(cls), cls + ' 班');
      select.value = ''; select.disabled = false;
      onRecords({records:healthRecords, roster:people});
      render(); message('已讀取 ' + rows.length + ' 列；略過 ' + skipped + ' 筆格式或名單不符紀錄。班座來源「未驗證」，重複班座及名冊外紀錄待核對，不合併計分。');
    } catch (e) { if (active()) { clear(); message(error(e)); } }
    finally { busy = false; controls(); }
  }
  const headers = ['班級','座號','活動序號','活動','來源','UID','過關數','關卡數','各關嘗試次數','最後上傳','各關首次過關（台灣時間）','各關狀態','準時關數','補做關數','未判定關數','等級','XP'];
  const count = mask => { let n=0; while(mask){n+=mask&1;mask>>>=1;} return n; };
  const score = r => activityScore(count(r.mask), activities[r.activity].rounds.length);
  // 與 xp.js RULES.windowMs 相同；截止當下仍屬準時，不依最後上傳判斷。
  const windowMs = 7 * 864e5;
  const time = at => new Date(at + 8 * 36e5).toISOString().slice(5,16).replace('-','/').replace('T',' ');
  const status = (r, at) => {
    const open = activityOpenAt(activities[r.activity]);
    return !Number.isFinite(open) ? '未判定' : at > open + windowMs ? '補做' : '準時';
  };
  const totals = records => {
    const n = {'準時':0,'補做':0,'未判定':0};
    for (const r of records) for (const at of r.passedAt) if (at !== null) n[status(r,at)]++;
    return n;
  };
  const summary = records => {
    const n=totals(records);
    return '準時 '+n['準時']+' 關、補做 '+n['補做']+' 關'+(n['未判定']?'、未判定 '+n['未判定']+' 關':'');
  };
  const roundText = r => r.passedAt.map((at,i)=>'第 '+(i+1)+' 關：'+(at===null?'未過關':time(at)+' '+status(r,at)));
  function roundNodes(r) {
    const box=node('div'); box.className='cloud-rounds';
    roundText(r).forEach((text,i)=>{
      const line=node('div',text), at=r.passedAt[i];
      line.className=at===null?'':status(r,at)==='補做'?'cloud-late':status(r,at)==='準時'?'cloud-on-time':'cloud-unknown';
      box.appendChild(line);
    });
    return box;
  }
  const values = r => [r.cls,r.seat,r.activity,activities[r.activity].title,r.source,r.uid,count(r.mask),r.tries.length,r.tries.join(' / '),new Date(r.at),r.passedAt.map(at=>at===null?'':time(at)).join(' / '),r.passedAt.map(at=>at===null?'未過關':status(r,at)).join(' / '),...Object.values(totals([r])),...(r.source === '帳號名單' && growth.has(r.email) ? [growth.get(r.email).level, growth.get(r.email).totalXP] : ['—','—'])];
  const node = (tag, text) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=String(text); return n; };
  function details(records, warning) {
    const box=node('details'); box.appendChild(node('summary',warning || '詳細資料'));
    for(const r of records) { const entry=node('div'); entry.appendChild(node('p',
      '班級：' + r.cls + '・座號：' + r.seat + '・' + activities[r.activity].title + '・' + r.source + '・UID：' + r.uid + '・' + count(r.mask) + '/' + r.tries.length +
      '・分數：' + score(r) + ' 分・各關嘗試：' + r.tries.join(' / ') + '・最後上傳：' + new Date(r.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'・'+summary([r])));
      entry.appendChild(roundNodes(r)); box.appendChild(entry);
    }
    return box;
  }
  function render() {
    const target=el('cloud-table'); target.textContent='';
    // 名冊外紀錄可獨立展開，不依賴名冊是否有班級可選。
    const outside=rows.filter(r=>!people.some(p=>p.cls===r.cls&&p.seat===r.seat));
    if(outside.length)target.appendChild(details(outside,'待核對：名冊外紀錄（'+outside.length+' 列，不計入表格）'));
    const cls=Number(el('cloud-class').value); if(!cls)return;
    const sources=[...new Set(rows.filter(r=>r.cls===cls).map(r=>r.source))];
    if(sources.length)target.appendChild(node('p','本班紀錄來源：'+sources.join('、')+'。標示「未驗證」的班座尚未驗證；「待核對」的紀錄請展開詳細資料核對，不合併計分。'));
    const table=node('table'), thead=node('thead'), head=node('tr');
    const ids=Object.keys(activities).map(Number).sort((a,b)=>a-b);
    head.appendChild(node('th','座號'));
    for(const id of ids)head.appendChild(node('th',activities[id].title));
    head.appendChild(node('th','等級／XP')); head.appendChild(node('th','準時／補做彙總')); head.appendChild(node('th','詳細資料')); thead.appendChild(head); table.appendChild(thead);
    const tbody=node('tbody');
    const seats=[...new Set(people.filter(p=>p.cls===cls).map(p=>p.seat))].sort((a,b)=>a-b);
    for(const seat of seats){
      const records=rows.filter(r=>r.cls===cls&&r.seat===seat), tr=node('tr');tr.appendChild(node('td',seat));
      const duplicate=people.filter(p=>p.cls===cls&&p.seat===seat).length>1;
      const sharedUID=records.some(r=>rows.some(other=>other.uid===r.uid&&(other.cls!==cls||other.seat!==seat)));
      let conflict=duplicate||sharedUID; const counted=[];
      for(const id of ids){
        const found=records.filter(r=>r.activity===id), td=node('td');
        if(found.length>1||duplicate||sharedUID){td.textContent='待核對';conflict=true;}
        else if(found.length){const r=found[0], n=count(r.mask);td.textContent=score(r)+' 分（'+(n===r.tries.length?'✓':n+'/'+r.tries.length)+'）'+(r.source==='未驗證'?'（未驗證）':'');td.appendChild(roundNodes(r));counted.push(r);}
        else td.textContent=activityScore(0,activities[id].rounds.length)+' 分（0/'+activities[id].rounds.length+'）';
        tr.appendChild(td);
      }
      const person = people.find(p=>p.cls===cls&&p.seat===seat);
      const xp = !duplicate && !sharedUID && (!records.length || growth.get(person.email)?.hasAttempts) ? growth.get(person.email) : null;
      const xpCell = node('td'); xpCell.className = 'cloud-xp';
      if (xp) { xpCell.appendChild(node('div','Lv '+xp.level+' '+xp.title)); xpCell.appendChild(node('div',xp.totalXP+' XP')); }
      else xpCell.textContent = '—';
      tr.appendChild(xpCell);
      tr.appendChild(node('td',summary(counted)+(conflict?'（待核對紀錄未計入）':'')));
      const td=node('td');td.appendChild(details(records,conflict?'待核對：來源、UID 或名冊衝突':'詳細資料'));tr.appendChild(td);tbody.appendChild(tr);
    }
    table.appendChild(tbody);target.appendChild(table);
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
    YBS.endBrowserSession?.();
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
