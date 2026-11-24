// 由 assets/activities.js 產生 assets/activities.json（ClassScore 讀這份計算「過關數 ÷ 關卡數」）。
// 改過 activities.js 之後執行：node tools/activities-json.mjs
// 只輸出公開、計分需要的欄位。
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export function activitiesJSON(src){
 const ctx = {};
 vm.runInNewContext(src + '\n;globalThis.__A = ACTIVITIES;', ctx);
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
