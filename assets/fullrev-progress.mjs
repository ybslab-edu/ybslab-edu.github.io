// PR3 不開放 list；本模組只消費受控服務已核對的最小投影，不讀私有 gate。
export const fail = code => Object.assign(new Error(code), {code});
export const int = (n, min = 0) => Number.isSafeInteger(n) && n >= min && n <= 1e9;
export const id = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
export const time = value => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return typeof value === 'string' ? Date.parse(value) : NaN;
};
export function versions(value) {
  return value && int(value.gateVersion, 1) && int(value.classGateVersion, 1);
}
export const sameVersions = (a,b) => versions(a) && versions(b)
  && a.gateVersion === b.gateVersion && a.classGateVersion === b.classGateVersion;

// 未知控制資料不能變成空集合／0 分；先過濾再去重，避免舊 epoch 佔住新完成。
export function effectiveRecords(snapshot, {project,course,subject,activities}) {
  const unknown = reason => ({state:'unknown',reason,records:[],exclusions:[]});
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.sourceProject !== project || snapshot.course !== course
      || snapshot.state !== 'confirmed' || snapshot.complete !== true || !versions(snapshot.controlVersions)
      || !Array.isArray(snapshot.records)) return unknown('control-unconfirmed');
  const selected = new Map(), validatedIds = new Map(), exclusions = [];
  for (const r of snapshot.records) {
    if (!r || !id(r.subject) || subject && r.subject !== subject) return unknown('subject-mismatch');
    if (r.validity?.state === 'excluded') { exclusions.push({resultId:r.resultId,reason:r.validity.reason}); continue; }
    if (r.validity?.state !== 'effective' || !sameVersions(r.validity.controlVersions,snapshot.controlVersions)) return unknown('validity-unconfirmed');
    const a = activities.find(a => a.course === course && a.week === r.activity);
    const legacy = r.source === 'legacy-unverified';
    if (legacy) {
      if (course !== '115-g9' || r.schemaVersion !== 1 || !/^l_[a-f0-9]{64}$/.test(r.resultId)
          || r.displayPolicy !== 'migration-initial-epochs-v1' || r.provider !== 'password'
          || !a || !int(r.round) || r.round >= a.rounds.length || r.unit !== a.unit
          || r.unitEpoch !== 0 || r.roundEpoch !== 0
          || r.completedAt !== null && !Number.isFinite(time(r.completedAt))
          || !Number.isFinite(time(r.xpPolicySnapshot?.openedAt))) return unknown('legacy-invalid');
    } else if (r.schemaVersion !== 1 || r.source !== 'worker-validated' || !id(r.resultId) || !id(r.uid)
        || !['google.com','password','anonymous'].includes(r.provider) || !id(r.sid) || !id(r.classKeyAtPass)
        || !int(r.bindingVersion,1) || !a
        || !int(r.round) || r.round >= a.rounds.length || r.unit !== a.unit
        || !int(r.configVersion,1) || !int(r.unitEpoch) || !int(r.roundEpoch)
        || typeof r.contentVersion !== 'string' || !/^[^/]{1,64}$/.test(r.contentVersion)
        || !/^[a-f0-9]{64}$/.test(r.contentHash) || !id(r.graderVersion)
        || !Number.isFinite(time(r.completedAt))) return unknown('result-invalid');
    const key = JSON.stringify([r.subject,r.activity,r.round]);
    if (!legacy) {
      if (validatedIds.has(key) && validatedIds.get(key) !== r.resultId) return unknown('completion-collision');
      validatedIds.set(key,r.resultId);
    }
    const old = selected.get(key);
    if (old && (legacy || old.source === 'legacy-unverified')) {
      const previous = time(old.completedAt), next = time(r.completedAt);
      // Old XP oracle: unknown first-pass time wins; otherwise choose the earliest.
      if (!(Number.isFinite(previous) && (!Number.isFinite(next) || next < previous)
          || Object.is(next,previous) && legacy)) continue;
    }
    selected.set(key,{...r,course});
  }
  return {state:'confirmed',records:[...selected.values()],exclusions};
}

export function growth(snapshot, options, xp) {
  const valid = effectiveRecords(snapshot,options);
  if (valid.state !== 'confirmed') return {...valid,totalXP:null};
  return confirmedGrowth(valid,options,xp);
}
function confirmedGrowth(valid, options, xp) {
  // guest 帳號 XP 尚待核定；不能因 binding 成功就補發。
  if (options.provider === 'anonymous' || valid.records.some(r=>r.provider==='anonymous')) return {...valid,state:'unknown',reason:'guest-xp-policy-pending',totalXP:null};
  const result = xp.calculate(options.activities,valid.records,{worker:true});
  const uncertain = result.activities.some(a => a.rounds.some(r => r.onTimeState === 'unknown'));
  return {...valid,...result,state:uncertain?'unknown':'confirmed',
    reason:uncertain?'xp-snapshot-missing':null,totalXP:uncertain?null:result.totalXP};
}

// 與學生使用相同有效集合及 XP 核心；unknown 不產生可下載成績檔。
export function exportRows(snapshot, options, xp) {
  const valid = effectiveRecords(snapshot,options);
  if (valid.state !== 'confirmed') throw fail('export-unconfirmed');
  if (!Array.isArray(snapshot.people)) throw fail('roster-unconfirmed');
  const subjects = new Set();
  for (const person of snapshot.people) {
    if (!id(person.subject) || subjects.has(person.subject) || !int(person.cls,100) || person.cls > 999
        || !int(person.seat,1) || person.seat > 60) throw fail('roster-unconfirmed');
    subjects.add(person.subject);
  }
  // 整份投影只核對一次；先按主體分組，避免每位學生重掃全班紀錄。
  const bySubject = new Map();
  for (const record of valid.records) {
    if (!subjects.has(record.subject)) throw fail('roster-unconfirmed');
    if (!bySubject.has(record.subject)) bySubject.set(record.subject,[]);
    bySubject.get(record.subject).push(record);
  }
  const rows = [['班級','座號','活動','關卡','狀態','完成時間','XP','結果識別']];
  for (const person of snapshot.people) {
    const records = bySubject.get(person.subject) || [];
    const progress = confirmedGrowth({state:'confirmed',records,exclusions:[]},
      {...options,subject:person.subject,provider:person.provider},xp);
    if (progress.state !== 'confirmed' && progress.reason !== 'guest-xp-policy-pending') throw fail('xp-unconfirmed');
    for (const a of options.activities) for (let round=0;round<a.rounds.length;round++) {
      const record = records.find(r => r.activity === a.week && r.round === round);
      const detail = progress.activities?.find(v => v.activity === a.week)?.rounds[round];
      rows.push([person.cls,person.seat,a.title,a.rounds[round],record?(record.source==='legacy-unverified'?'舊紀錄過關（未驗證）':'已確認過關'):'尚未過關',
        record?.completedAt || '',progress.totalXP === null ? '待確認' : detail?.totalXP || 0,record?.resultId || '']);
    }
    rows.push([person.cls,person.seat,'合計','','','',progress.totalXP === null?'待確認':progress.totalXP,'']);
  }
  return rows;
}
