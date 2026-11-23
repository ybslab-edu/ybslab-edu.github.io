// Existing public bytes from gh-pages 3f132ee36d5eca6f4febe3b834cec26e9aa5195d.
// Never exempt new teacher code or accept an edited public answer bank.
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function publicAnswerRemainder(path,bytes){
 if(path==='115-df/a/index.html'){
  if(digest(bytes)!=='49ca89684d3438e2afebe3725f0fadac8c15fdb5633369553051c8df9f4cffb6')throw Error('release_public_answer_allowlist_changed:'+path);
  return Buffer.alloc(0);
 }
 if(path==='assets/fullrev-shell.mjs'){
  const start=bytes.indexOf(Buffer.from('// 短版題與原活動關卡分離')),end=bytes.indexOf(Buffer.from('\nconst node='),start);
  if(start<0||end<start||digest(bytes.subarray(start,end))!=='4997509b0758edb9ac95f53105e6d987046fefecb7e753f0e338dddc61c040a0')throw Error('release_public_answer_allowlist_changed:'+path);
  return Buffer.concat([bytes.subarray(0,start),bytes.subarray(end)]);
 }
 return bytes;
}
