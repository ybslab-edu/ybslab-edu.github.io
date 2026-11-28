// Existing public content from gh-pages 3f132ee; DF includes approved main asset-version updates.
// Never exempt new teacher code or accept an edited public answer bank.
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function publicAnswerRemainder(path,bytes){
 if(path==='115-df/a/index.html'){
  if(digest(bytes)!=='0df6bb37a9936ab20f3c9543d8f8ab80d6324642e933034879ccb171d5e674c4')throw Error('release_public_answer_allowlist_changed:'+path);
  return Buffer.alloc(0);
 }
 if(path==='assets/fullrev-shell.mjs'){
  const start=bytes.indexOf(Buffer.from('// 短版題與原活動關卡分離')),end=bytes.indexOf(Buffer.from('\nconst node='),start);
  if(start<0||end<start||digest(bytes.subarray(start,end))!=='09bc26b7edb33a8db4a4a101853cf115554839a69443ba9047b40781cc30e0ab')throw Error('release_public_answer_allowlist_changed:'+path);
  return Buffer.concat([bytes.subarray(0,start),bytes.subarray(end)]);
 }
 return bytes;
}
