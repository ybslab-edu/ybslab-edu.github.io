// XP 只供成長顯示，與成績及雲端寫入無關。
// calculate 的活動須附 openedAt（共用 activityOpenAt 結果）與 isOpen；不自行猜日期。
// records 為已過關明細：{course, activity, round, at?, passedAt?}。
const YBSXP = (() => {
  const RULES = Object.freeze({pass:10, onTime:5, complete:20, windowMs:7 * 864e5, levelFactor:21.5});
  const TITLES = Object.freeze(['位元見習生','編碼學徒','封包工程師','資料偵探','網路巡守員','演算法學徒','程式工匠','系統架構師','AI 訓練師','資訊大師']);
  const THEMES = Object.freeze({A:'演算法', P:'程式設計', S:'系統平台', D:'資料處理', T:'資訊應用', H:'資訊與社會'});
  const timestamp = v => {
    if (v == null) return NaN;
    if (typeof v.toMillis === 'function') v = v.toMillis();
    else if (typeof v === 'string') v = Date.parse(v);
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : NaN;
  };
  // at 是既有學生端作答時間；舊紀錄無有效 at 時才採伺服器收件時間。
  const attemptTime = r => {
    const at = timestamp(r?.at);
    return Number.isFinite(at) ? at : timestamp(r?.passedAt);
  };
  // Lv 1 從 0 開始；目前 九年級 30 活動、121 關，滿額 2415 XP 可達 Lv 10（2365）。
  const threshold = n => n <= 1 ? 0 : Math.ceil(RULES.levelFactor * n * (n + 1));
  function levelOf(totalXP) {
    let level = 1;
    while (level < TITLES.length && totalXP >= threshold(level + 1)) level++;
    const floor = threshold(level), next = level < TITLES.length ? threshold(level + 1) : null;
    return {level, title:TITLES[level - 1], floor, next, remaining:next === null ? 0 : next - totalXP,
      progress:next === null ? 1 : Math.max(0, Math.min(1, (totalXP - floor) / (next - floor)))};
  }
  function calculate(activities, records) {
    const first = new Map();
    for (const r of records) {
      if (!Number.isInteger(r.activity) || !Number.isInteger(r.round) || r.round < 0) continue;
      const key = r.course + ':' + r.activity + ':' + r.round, old = first.get(key);
      // 有未知時間時保留未知；不讓重做補發首次過關的加成。
      if (!old || (Number.isFinite(attemptTime(old)) && (!Number.isFinite(attemptTime(r)) || attemptTime(r) < attemptTime(old)))) first.set(key, r);
    }
    const axes = Object.fromEntries(Object.entries(THEMES).map(([id, name]) => [id, {id, name, passed:0, total:0, openPassed:0, openTotal:0}]));
    const seen = new Set();
    const details = [];
    for (const a of activities) {
      const key = a.course + ':' + a.week;
      if (seen.has(key)) continue;
      seen.add(key);
      const rounds = a.rounds.map((name, round) => {
        const record = first.get(key + ':' + round), passed = !!record;
        const at = attemptTime(record), open = timestamp(a.openedAt);
        const passXP = passed ? RULES.pass : 0;
        const onTimeXP = passed && at >= open && at <= open + RULES.windowMs ? RULES.onTime : 0;
        return {round, name, passed, passXP, onTimeXP, totalXP:passXP + onTimeXP};
      });
      const passed = rounds.filter(r => r.passed).length;
      const completeXP = rounds.length > 0 && passed === rounds.length ? RULES.complete : 0;
      const totalXP = rounds.reduce((n, r) => n + r.totalXP, completeXP);
      details.push({course:a.course, activity:a.week, rounds, passed, completeXP, totalXP});
      const themes = new Set((a.codes || []).map(c => /^資([APSDTH])-/.exec(c)?.[1]).filter(Boolean));
      for (const id of themes) {
        const axis = axes[id]; axis.total += rounds.length; axis.passed += passed;
        if (a.isOpen === true) { axis.openTotal += rounds.length; axis.openPassed += passed; }
      }
    }
    for (const axis of Object.values(axes)) {
      axis.value = axis.total ? axis.passed / axis.total : 0;
      axis.openValue = axis.openTotal ? axis.openPassed / axis.openTotal : 0;
    }
    const totalXP = details.reduce((n, a) => n + a.totalXP, 0);
    return {activities:details, totalXP, ...levelOf(totalXP), exploration:Object.values(axes)};
  }
  return Object.freeze({RULES, TITLES, THEMES, threshold, levelOf, calculate});
})();
