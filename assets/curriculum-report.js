/* 課綱報告純彙整：只接收 roster 與登入 attempts，不查詢、不修改資料。 */
'use strict';
const YBSCurriculumReport = (() => {
  const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const classNumber = v => (typeof v === 'string' && /^[1-9]\d{2}$/.test(v)) || integer(v, 100, 999);
  const text = v => typeof v === 'string' && v.trim().length > 0;
  const invalid = field => { throw new TypeError('Invalid curriculum report: ' + field); };
  function summarize(input) {
    if (!object(input)) invalid('input');
    const {activities, items, roster, attempts, isOpen, cls = ''} = input;
    // 空陣列是有效快照；缺少整批資料不能當成零筆，交由頁面的讀取失敗流程處理。
    for (const [name, value] of Object.entries({activities, items, roster, attempts})) if (!Array.isArray(value)) invalid(name);
    if (typeof isOpen !== 'function') invalid('isOpen');
    if (cls !== '' && !classNumber(cls)) invalid('cls');
    const catalog = new Map(), openedActivities = new Map();
    for (const a of activities) {
      // 不略過不完整的活動設定，避免縮減項目所需活動或將空關卡判為完成。
      if (!object(a) || !integer(a.week, 1, Number.MAX_SAFE_INTEGER) || catalog.has(a.week)
          || !Array.isArray(a.rounds) || !a.rounds.length || !Array.from(a.rounds).every(text)
          || !Array.isArray(a.codes) || !Array.from(a.codes).every(text)) invalid('activities');
      catalog.set(a.week, a);
      const open = isOpen(a);
      if (typeof open !== 'boolean') invalid('isOpen result');
      openedActivities.set(a.week, open);
    }
    for (const item of items) if (!object(item) || !text(item.code)) invalid('items');
    const people = new Map(), seats = new Map();
    let invalidRoster = 0, skipped = 0;
    for (const p of roster) {
      if (!object(p) || !text(p.email) || !classNumber(p.cls) || !integer(p.seat, 1, 60) || people.has(p.email)) { invalidRoster++; continue; }
      const person = {email:p.email, cls:Number(p.cls), seat:p.seat};
      people.set(p.email, person);
      const key = person.cls + ':' + person.seat;
      if (!seats.has(key)) seats.set(key, []);
      seats.get(key).push(person);
    }
    const records = [], emailUIDs = new Map(), uidEmails = new Map();
    const add = (map, key, value) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(value); };
    for (const d of attempts) {
      if (!object(d)) { skipped++; continue; }
      const a = catalog.get(d.activity), person = people.get(d.email);
      if (!a || !person || typeof d.uid !== 'string' || !d.uid || d.uid.length > 128
          || !integer(d.round, 0, a.rounds.length - 1) || !integer(d.level, 1, 2) || !integer(d.tries, 1, 999)
          || !Number.isFinite(d.passedAt) || d.passedAt <= 0
          || d.id !== d.uid + '_' + d.activity + '_' + d.round) { skipped++; continue; }
      records.push(d); add(emailUIDs, d.email, d.uid); add(uidEmails, d.uid, d.email);
    }
    const conflict = p => seats.get(p.cls + ':' + p.seat).length > 1 || (emailUIDs.get(p.email)?.size || 0) > 1
      || [...(emailUIDs.get(p.email) || [])].some(uid => uidEmails.get(uid).size > 1);
    const selected = [...seats.values()].filter(ps => cls === '' || ps[0].cls === Number(cls));
    const eligible = selected.filter(ps => ps.length === 1 && !conflict(ps[0])).map(ps => ps[0]);
    const allowed = new Set(eligible.map(p => p.email)), progress = new Map();
    for (const d of records) {
      if (!allowed.has(d.email)) continue;
      const key = JSON.stringify([d.email, d.activity]);
      if (!progress.has(key)) progress.set(key, new Set());
      progress.get(key).add(d.round);
    }
    const complete = (p, a) => progress.get(JSON.stringify([p.email, a.week]))?.size === a.rounds.length;
    const total = selected.length;
    const rate = (passed, applicable) => total && applicable ? passed / total : null;
    const activityRows = new Map(activities.map(a => {
      const open = openedActivities.get(a.week), passed = eligible.filter(p => complete(p, a)).length;
      return [a.week, {week:a.week, title:a.title, href:a.href, open, passed, total, rate:rate(passed, open)}];
    }));
    const rows = items.map(item => {
      const linked = activities.filter(a => a.codes.includes(item.code));
      const opened = linked.filter(a => activityRows.get(a.week).open);
      const passed = opened.length ? eligible.filter(p => opened.every(a => complete(p, a))).length : 0;
      return {code:item.code, text:item.text, activities:linked.map(a => activityRows.get(a.week)), openCount:opened.length,
        passed, total, rate:rate(passed, opened.length)};
    });
    return {rows, total, classes:[...new Set([...people.values()].map(p => p.cls))].sort((a,b) => a-b),
      conflicts:selected.filter(ps => ps.some(conflict)).length, invalidRoster, skipped};
  }
  // Excel 每列為一組課綱項目／活動；沒有對應活動仍保留一列。比率保留數值供試算。
  function exportRows(report, label, snapshot) {
    const result = [['課綱代碼','課綱項目（學習內容）','班級','名冊人數','待核對人數','項目達成人數','項目達成率','活動序號','活動','開放狀態','活動過關人數','活動過關率','資料讀取時間','計算方式']];
    for (const row of report.rows) for (const a of row.activities.length ? row.activities : [null]) {
      result.push([row.code,row.text,label,report.total,report.conflicts,row.passed,row.rate,
        a?.week ?? '',a?.title ?? '未安排活動',a ? (a.open ? '已開放' : '未開放') : '—',a?.passed ?? '',a?.rate ?? null,snapshot,
        '完成項目所有已開放活動的全部關卡／有效名冊班座人數；待核對者不計達成；無已開放活動或無名冊時不計比率']);
    }
    return result;
  }
  return {summarize, exportRows};
})();
if (typeof module !== 'undefined') module.exports = YBSCurriculumReport;
