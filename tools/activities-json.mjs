// 由 assets/activities.js 產生 assets/activities.json（ClassScore 讀這份計算「過關數 ÷ 關卡數」）。
// 改過 activities.js 之後執行：node tools/activities-json.mjs
// 只輸出公開、計分需要的欄位。
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export function activitiesJSON(src){
 const ctx = {};
 vm.runInNewContext(src + '\n;globalThis.__A = ACTIVITIES;', ctx, { filename: 'assets/activities.js' });
 // course + week 是雲端活動 ID；完整驗證後才投影、寫檔，避免缺欄被 JSON 靜默省略。
 if (!Array.isArray(ctx.__A)) throw new Error('assets/activities.js: ACTIVITIES 必須是陣列');
 const seen = new Map();
 for (let index = 0; index < ctx.__A.length; index++) {
   const a = ctx.__A[index];
   const source = `assets/activities.js: ACTIVITIES[${index}] (href=${JSON.stringify(a?.href)}, title=${JSON.stringify(a?.title)})`;
   if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${source}: 活動必須是物件`);
   for (const field of ['course', 'title', 'href']) {
     if (typeof a[field] !== 'string' || !a[field].trim()) throw new Error(`${source}: ${field} 缺少或不是非空字串`);
   }
   if (!Number.isInteger(a.week) || a.week < 1) throw new Error(`${source}: week 缺少或不是正整數`);
   if (!Array.isArray(a.rounds) || !a.rounds.length) {
     throw new Error(`${source}: rounds 缺少或不是非空關卡名稱陣列`);
   }
   for (let roundIndex = 0; roundIndex < a.rounds.length; roundIndex++) {
     const round = a.rounds[roundIndex];
     if (typeof round !== 'string' || !round.trim()) throw new Error(`${source}: rounds[${roundIndex}] 缺少或不是非空關卡名稱`);
   }
   const id = `${a.course}/${a.week}`;
   if (seen.has(id)) throw new Error(`${source}: 重複活動 ID ${id}；首次來源 ${seen.get(id)}`);
   seen.set(id, source);
 }

 const list = ctx.__A.map(a => ({
   course: a.course, week: a.week, title: a.title, unit: a.unit ?? null, track: a.track || '',
   date: a.date || '', also: a.also || [], rounds: a.rounds || []
 }));
 const out = { v: 1, note: 'generated from assets/activities.js by tools/activities-json.mjs', activities: list };
 return JSON.stringify(out, null, 1) + '\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const out=activitiesJSON(readFileSync(new URL('../assets/activities.js',import.meta.url),'utf8'));
 writeFileSync(new URL('../assets/activities.json',import.meta.url),out);
 console.log('activities.json:',JSON.parse(out).activities.length,'activities');
}
