// 全部為合成資料；不載入正式題庫，也不連 Worker。
export const syntheticRows=Array.from({length:10},(_,k)=>[
 `09:${String(k).padStart(2,'0')}`,`V${String(k+1).padStart(2,'0')}`,'動漫組','同意','已滿18歲','不適用',
 ['入口引導','遊戲體驗','遊戲體驗','舞台支援','舞台支援'][k%5],k<5?'下午':'上午',3,''
]);
export function sheetQuestion(round=3,slot=0){
 const rows=structuredClone(syntheticRows);rows[8]=['09:08',...rows[0].slice(1)];rows[9]=['09:09',...rows[1].slice(1)];
 if(round===0){rows[1][6]='';rows[2][8]=6;}
 if(round===1){rows[0][3]='不同意';rows[1][6]='';rows[2][8]=6;rows[3][4]='未滿18歲';rows[3][5]='未取得';rows[3][6]='';rows[3][8]=2.5;}
 if(round===2){rows[5][1]='V01';rows[6]=['09:06','V06',...rows[5].slice(2)];}
 if(round===3){rows[8][1]='V09';rows[9][1]='V10';}
 const rowIds=rows.map((_,k)=>`synthetic${slot}${String(k).padStart(2,'0')}`);
 return {type:'finite-bank-v1',slot,title:'志工回覆整理所',instruction:'你依本組規格整理虛構回覆。',data:{
  mode:'form-volunteer-sheet-v2',schemaVersion:2,taskVersion:'u206-sheet-v2',round,datasetToken:(slot?'B':'A').repeat(22),
  columns:['送出時間','報名代號','組別','招募同意','年齡分流','家長同意','第一志願','可到場時段','期待程度','選填熟悉度'],
  rows:rows.map((cells,k)=>({id:rowIds[k],cells})),rules:{requiredColumns:[...'ABCDEFGHI'],expectation:{min:1,max:5,integer:true},optionalColumn:'J',parentConsent:'未滿18歲須已取得家長同意',dataNotice:'全部為虛構示意資料；四關各自使用獨立副本。',percentNotice:'百分比四捨五入到小數 1 位。'},
  task:round===0?{backups:[[10,rows[0][6],rows.at(-1)[1]],[9,rows[0][6],rows.at(-1)[1]],[10,'舞台支援','V99']],targets:[[rowIds[1],6],[rowIds[2],8],[rowIds[0],rowIds[8],-1],[rowIds[4],9]]}:round===1?{reasonRow:rowIds[3]}:round===2?{}:{group:'動漫組',slot:'下午',demand:[5,3,2],query:0},
  options:{flows:['先備份 → 停止接受回應 → 清理工作副本','停止接受回應 → 備份原始資料 → 清理工作副本','先清理 → 停止接受回應 → 備份剩餘資料'],classifications:['必填缺失','數值異常','完全重複','可保留的選填空白'],reasons:['未取得所需同意','必填欄位缺失','數值超出規定範圍','選填欄位空白'],jobs:['入口引導','遊戲體驗','舞台支援'],groups:['動漫組','遊戲組'],slots:['上午','下午'],sources:['本組清理、去重並篩選後的統計表','原始表單摘要（本題未提供，不可製圖）'],titles:['遊戲組 下午場第一志願分布','動漫組 下午場第一志願分布','動漫組 上午場第一志願分布']}
 }};
}
export function syntheticSolution(q){
 const d=q.data,ids=d.rows.map(r=>r.id),range={fromColumn:'A',toColumn:'J',fromRow:d.round===1?2:1,toRow:ids.length+1};
 let ops,state;
 if(d.round===0){ops=[];state={flowChoice:1,backupChoice:0,classifications:['必填缺失','數值異常','完全重複','可保留的選填空白']};}
 if(d.round===1){const format={range,rule:'empty',color:'yellow'},excludedRowIds=ids.slice(0,4);ops=[{op:'format',rev:1,...format},{op:'exclude',rev:2,rowIds:excludedRowIds}];state={format,formatRev:1,excludedRowIds,keptRowIds:ids.slice(4),reasonSelection:d.options.reasons.slice(0,3)};}
 if(d.round===2){const dedupe={range,hasHeader:true,columns:[...'BCDEFGHIJ']};ops=[{op:'dedupe',rev:1,...dedupe}];state={dedupe,dedupeRev:1,removedRowIds:ids.slice(8),keptRowIds:ids.slice(0,8),conflictChoice:'reviewBoth'};}
 if(d.round===3){const filter={group:'動漫組',slot:'下午'},counts=[2,3,2];ops=[{op:'filter',rev:1,...filter},{op:'counts',rev:2,filterRev:1,values:counts},{op:'pie',rev:3,filterRev:1,countsRev:2,sourceChoice:'filtered',titleChoice:1}];state={filter,filterRev:1,counts,countsRev:2,visibleRowIds:[...ids.slice(0,5),...ids.slice(8)],sourceChoice:'filtered',titleChoice:1,chart:{filterRev:1,countsRev:2,counts},pieRev:3,percentTenths:286,priorityJob:0,priorityReason:'demandGap'};}
 return {schemaVersion:2,taskVersion:'u206-sheet-v2',datasetToken:d.datasetToken,ops,state};
}
