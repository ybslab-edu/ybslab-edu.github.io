export const TICKET_WARNING_MS=2*60*1000;
// 獨立於活動外框，成長頁等新分頁也不會保存題面或作答票。
export function mountTicketNotice(client,document){
 let box;
 const unsubscribe=client.subscribe(({profile,status,ticketTiming})=>{
  if(!profile||status==='stale'||!ticketTiming||ticketTiming.state==='active'){if(box)box.hidden=true;return;}
  if(!box){box=document.createElement('p');box.id='fullrev-ticket-notice';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
   box.style.cssText='position:sticky;bottom:0;z-index:1000;margin:12px;padding:16px;border:2px solid currentColor;background:var(--panel,#122534);color:var(--text,#fff);font-size:18px;line-height:1.6';document.body.append(box);}
  box.hidden=false;box.textContent=ticketTiming.state==='expired'
   ?'你的作答票已過期，這一關的草稿已清除。請按「活動工具 → 重新開始」或「開始這一關」，取得新題後重新作答。'
   :'你的作答時間將在 2 分鐘內到期，請儘快完成。到期後，你需要重新開始這一關。';
 });
 return()=>{unsubscribe();box?.remove();};
}
