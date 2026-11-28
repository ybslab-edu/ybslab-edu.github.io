// Entirely synthetic: 30 seats × 30 activities (121 rounds per person).
import {snapshot,record,opened} from './fullrev.mjs';
export function teacherLoadFixture(){
 const activities=Array.from({length:30},(_,i)=>({course:'115-g9',week:i+1,unit:Math.floor(i/6)+1,title:`合成活動 ${i+1}`,
  date:`2026-11-${String(i%28+1).padStart(2,'0')}`,openedAt:opened,rounds:Array.from({length:i===0?5:4},(_,r)=>`合成關卡 ${r+1}`),codes:[]}));
 const people=Array.from({length:30},(_,i)=>({subject:`synthetic-seat-${i+1}`,cls:901,seat:i+1,provider:'password'}));
 const records=people.flatMap((person,i)=>activities.flatMap(a=>a.rounds.flatMap((_,round)=>{
  // Seats 1–10 complete, 11–20 lack the last activity, 21–30 await guest approval in activity 1.
  if(i>=10&&i<20&&a.week===30)return [];
  return [record(round,{subject:person.subject,uid:person.subject,activity:a.week,unit:a.unit,resultId:`synthetic-${i+1}-${a.week}-${round}`,
   ...(i>=20&&a.week===1?{source:'worker-guest-approved',approvalId:`synthetic-approval-${i+1}-${round}`}:{})})];
 })));
 return {activities,snapshots:[snapshot(records,{people})]};
}
