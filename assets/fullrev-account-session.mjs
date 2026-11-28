// 與舊站相同：LOCAL 帳密登入另受不含身分／憑證的瀏覽器 session cookie 約束。
export function createAccountSession({document,location,project}){
 const cookie='ybs_fullrev_browser_'+project.replaceAll('-','_');
 const has=()=>{try{return String(document.cookie||'').split(';').some(c=>c.trim()===cookie+'=1');}catch{return false;}};
 return {
  isAccount:user=>!!user&&!user.isAnonymous&&/^cgjh\d{3,12}@ybslab-edu\.github\.io$/i.test(user.email||'')
    &&!!user.providerData?.length&&user.providerData.every(p=>p.providerId==='password'),
  has,
  mark(){try{document.cookie=cookie+'=1; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');}catch{return false;}return has();},
  clear(){try{document.cookie=cookie+'=; Max-Age=0; Path=/; SameSite=Lax';}catch{}}
 };
}
