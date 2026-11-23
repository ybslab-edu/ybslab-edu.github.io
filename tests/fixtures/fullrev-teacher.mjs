// Synthetic only; never copied to release assets.
export const teacherPayload=({course='115-g9',activity=8,round=0}={})=>({
 sourceProject:'synthetic-ybs-pr5',uid:'synthetic-student',course,activity,round,
 question:{slot:0,type:'finite-bank-v1',title:'合成題面',instruction:'合成說明',data:{
  mode:activity===9?'media-rle':'form-volunteer-sheet',heading:'合成題面',story:'本關測試',
  questions:[['合成選擇','合成示範答案','另一個選項'],['合成數值']],kinds:['s','n'],
  attachment:[{text:'合成附件'},{caption:'合成表格',headers:['欄位'],rows:[['合成資料']]}]}},
 solution:{answer:['合成示範答案',42],notes:['合成教師解說']}
});
