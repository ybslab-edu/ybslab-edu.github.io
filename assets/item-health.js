/* 題目健檢：僅接收教師既有查詢驗證後的帳號 attempts 與 roster，不另讀寫雲端。 */
'use strict';
window.YBSItemHealth = (() => {
  function summarize({activities, roster = [], records = [], cls = ''}) {
    const students = new Map(roster.filter(p => typeof p.email === 'string' && p.email
      && /^[1-9]\d{2}$/.test(String(p.cls)) && Number.isInteger(p.seat) && p.seat >= 1 && p.seat <= 60)
      .map(p => [p.email, p]));
    const selected = new Set([...students].filter(([,p]) => cls === '' || String(p.cls) === String(cls)).map(([email]) => email));
    // 一個名冊帳號每關最多算一人；不同 UID 的重複過關採最後上傳，平手以 UID 排序。
    const latest = new Map();
    for (const r of records) {
      if (!selected.has(r.email) || !Number.isInteger(r.activity) || !Number.isInteger(r.round)
        || r.round < 0 || !activities[r.activity]?.rounds?.[r.round]
        || !Number.isInteger(r.tries) || r.tries < 1 || r.tries > 999 || !Number.isFinite(r.at) || r.at <= 0) continue;
      const key = JSON.stringify([r.email, r.activity, r.round]), old = latest.get(key);
      if (!old || r.at > old.at || (r.at === old.at && String(r.uid) > String(old.uid))) latest.set(key, r);
    }
    const groups = new Map();
    for (const r of latest.values()) {
      const key = r.activity + ':' + r.round;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r.tries);
    }
    return Object.keys(activities).map(Number).sort((a,b) => a-b).flatMap(activity =>
      activities[activity].rounds.map((name, round) => {
        const values = (groups.get(activity + ':' + round) || []).sort((a,b) => a-b);
        const passed = values.length, total = selected.size, rate = total ? passed / total : null;
        const average = passed ? values.reduce((a,b) => a+b, 0) / passed : null;
        const median = passed ? (values[Math.floor((passed-1)/2)] + values[Math.floor(passed/2)]) / 2 : null;
        return {activity, round, name, passed, total, rate, average, median, max:passed ? values[passed-1] : null,
          lowRate:rate !== null && rate < 0.6, highTries:average !== null && average > 4};
      }));
  }
  function mount({activities}) {
    const el = id => document.getElementById(id), select = el('health-class');
    let data = null;
    const node = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); return n; };
    const number = n => n === null ? '—' : Number(n.toFixed(2)).toString();
    function render() {
      const target = el('health-table'); target.textContent = '';
      if (!data) { el('health-status').textContent = '請先登入並讀取雲端紀錄。'; return; }
      const results = summarize({activities, ...data, cls:select.value});
      const total = results[0]?.total || 0;
      el('health-status').textContent = (select.value ? select.value + ' 班' : '全部班級') + '：名冊 ' + total + ' 人。' + (total ? '' : '無名冊學生，無法計算過關率。');
      const table = node('table'), head = node('thead'), tr = node('tr'), body = node('tbody');
      for (const title of ['活動','關卡','過關／班級人數','過關率','平均作答次數','中位數','最多次數','提醒']) tr.appendChild(node('th', title));
      head.appendChild(tr); table.appendChild(head);
      for (const r of results) {
        const row = node('tr');
        if (r.lowRate || r.highTries) row.className = 'health-warning';
        const warning = [r.lowRate ? '過關率低' : '', r.highTries ? '平均次數高' : ''].filter(Boolean).join('、');
        for (const value of [activities[r.activity].title, (r.round+1) + '・' + r.name, r.passed + '／' + r.total,
          r.rate === null ? '—' : number(r.rate*100) + '%', number(r.average), number(r.median), number(r.max), warning || '—']) row.appendChild(node('td', value));
        body.appendChild(row);
      }
      table.appendChild(body); target.appendChild(table);
    }
    select.onchange = render;
    return snapshot => {
      data = snapshot; select.innerHTML = ''; select.appendChild(Object.assign(node('option', '全部班級'), {value:''}));
      for (const cls of [...new Set((data?.roster || []).map(p => p.cls))].sort((a,b) => a-b)) {
        select.appendChild(Object.assign(node('option', cls + ' 班'), {value:String(cls)}));
      }
      select.value = ''; select.disabled = !data; render();
    };
  }
  return {summarize, mount};
})();
