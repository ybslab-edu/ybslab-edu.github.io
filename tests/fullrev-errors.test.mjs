import test from 'node:test';
import assert from 'node:assert/strict';
import {explain} from '../assets/fullrev-ui.mjs';

// 學生端 client、read model、guest context、growth 投影會公開的錯誤種類。
// Worker 的未知錯誤會由 client 收斂為 pending／restart-required，不直接顯示。
const groups={
 retry:['pending','answer-pending','request-in-flight','retry-later','request-timeout','response-invalid','connection-failed','rate-limited'],
 read:['read-model-pending','context-unconfirmed','control-unconfirmed','control-changed','read-superseded','page-unconfirmed','cursor-invalid','page-capacity','progress-unsupported','legacy-unconfirmed','history-unconfirmed'],
 teacher:['summary-unconfirmed','summary-capacity','storage-quota','configuration-pending','binding-pending','class-not-found','invalid-class','invalid-course','invalid-scope','grading-not-supported','wrong-project','read-model-origin','sdk-unavailable','not-open','capacity-deferred','demonstration-only','owner-required','ticket-secret-required','ticket-scope-not-supported','subject-mismatch','validity-unconfirmed','legacy-invalid','guest-invalid','result-invalid','completion-collision','guest-xp-policy-pending','guest-pending','xp-snapshot-missing'],
 login:['login-required','identity-changed','provider-invalid','browser-cookie-required','auth/user-token-expired','auth/invalid-user-token'],
 account:['invalid-account','auth/invalid-credential','auth/invalid-login-credentials','auth/wrong-password','auth/user-not-found','auth/invalid-email','auth/user-disabled'],
 authRetry:['auth/network-request-failed','auth/too-many-requests','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/popup-blocked'],
 restart:['restart-required','ticket-expired','ticket-invalid','ticket-not-owned','ticket-out-of-order','ticket-attempt-limit','ticket-stale','ticket-replayed','tickets-disabled'],
 edit:['invalid-answer','answer-too-large','guest-seat-required','guest-seat-unavailable'],
 idle:['nothing-pending']
};
for(const [group,codes] of Object.entries(groups))test(`錯誤碼對照：${group} 明說答案狀態與下一步`,()=>{
 for(const code of codes){
  const text=explain({code},{pending:true});
  assert.match(text,/你/,code);assert.match(text,/答案/,code);
  assert.match(text,/保留|仍在本頁|無法接續|尚未確認/,code);
  assert.match(text,/請|按「/,code);assert.ok(!text.includes(code),code);
  assert.doesNotMatch(text,/尚未完成，請重新讀取或找老師。/,code);
  if(group==='restart')assert.match(text,/答案無法接續.*重新開始/,code);
  if(group==='retry')assert.match(text,/答案已保留.*重試上傳/,code);
  if(group==='read')assert.match(text,/重新讀取/,code);
  if(group==='teacher')assert.match(text,/老師/,code);
 }
});
test('未知錯誤按本機保留狀態回覆，不洩漏 code、reason、message 或 cause',()=>{
 const error={code:'private-worker-code',reason:'private-reason',message:'private-detail',cause:Error('private-cause')};
 for(const [state,expected] of [[{pending:true},/你的答案已保留/],[{answerState:'page'},/你填的答案仍在本頁/],[{answerState:'lost'},/你的答案無法接續/],[{},/你的答案是否保留尚未確認/]]){
  const text=explain(error,state);assert.match(text,expected);assert.match(text,/尚未完成/);
  assert.doesNotMatch(text,/private-/);assert.match(text,/重試上傳|重新讀取|重新開始|老師/);
 }
 assert.match(explain(null),/你的答案是否保留尚未確認/);
 for(const code of ['toString','constructor','__proto__'])assert.match(explain({code}),/你的答案是否保留尚未確認.*尚未完成/);
 assert.match(explain({reason:'control-unconfirmed'}),/重新讀取/);
});
test('格式錯誤保留本頁輸入；進度讀取失敗不能宣稱答案已保留',()=>{
 assert.match(explain({code:'invalid-answer'}),/你填的答案仍在本頁.*修改.*送出/);
 assert.match(explain({code:'answer-too-large'}),/你填的答案仍在本頁.*縮短.*送出/);
 assert.match(explain({code:'read-model-pending'}),/你的答案是否保留尚未確認.*重新讀取/);
 assert.match(explain({code:'pending'},{pending:true,retryLabel:'重試送出'}),/重試送出/);
 assert.match(explain({code:'retry-later'}),/重新讀取/);
 assert.match(explain({code:'ticket-expired'},{restartLabel:'重新開始'}),/按「重新開始」/);
});
