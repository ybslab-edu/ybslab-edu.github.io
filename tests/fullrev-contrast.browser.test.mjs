import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openActivity,samples,choose,activate,fillAnswers} from './helpers/fullrev-a11y.mjs';

// 由瀏覽器解析實際 CSS（含 var 別名），依 WCAG 的線性 sRGB 相對亮度計算。
async function audit(page){return page.evaluate(()=>{
 const probe=document.createElement('span');document.body.append(probe);
 const rgba=css=>{probe.style.color=css;return getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);};
 const composite=(a,b)=>{const alpha=a[3]??1;return a.slice(0,3).map((v,k)=>v*alpha+b[k]*(1-alpha));};
 const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,k)=>sum+v*[.2126,.7152,.0722][k],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const color=css=>rgba(css).slice(0,3);
 const tokens={},pairs=[];
 const backgrounds=['--void','--panel','--panel-hi'];
 const foregrounds=['--text','--dim','--ember','--frost','--alert','--teach-memory','--teach-alu','--teach-input','--teach-control','--teach-output'];
 const getToken=name=>tokens[name]??=(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
 for(const name of [...backgrounds,...foregrounds,'--edge','--on-ember','--alert-wash'])getToken(name);
 for(const fg of foregrounds)for(const bg of backgrounds)pairs.push({foreground:fg,background:bg,color:color(getToken(fg)),backdrop:color(getToken(bg)),threshold:4.5});
 for(const [fg,bg] of [['--text','--edge'],['--on-ember','--ember'],['--alert','--alert-wash'],['--text','--alert-wash']])pairs.push({foreground:fg,background:bg,color:color(getToken(fg)),backdrop:color(getToken(bg)),threshold:4.5});
 pairs.forEach(p=>p.ratio=ratio(p.color,p.backdrop));
 const elements=[],unsupported=[];
 for(const e of document.querySelectorAll('body *')){
  if(e===probe||!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||e.closest(':disabled')||['OPTION','SCRIPT','STYLE'].includes(e.tagName))continue;
  const direct=[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
  const text=direct||(e.tagName==='INPUT'?e.value||e.placeholder:'')||(e.tagName==='SELECT'?e.selectedOptions[0]?.textContent:'');
  if(!text)continue;
  const style=getComputedStyle(e),chain=[];let backdrop=[255,255,255];
  for(let p=e;p;p=p.parentElement)chain.unshift(p);
  for(const p of chain){
   const s=getComputedStyle(p);backdrop=composite(rgba(s.backgroundColor),backdrop);
   // 外框的面板由 ::before 繪製；關卡按鍵的漸層中央正面使用 --panel-hi。
   const before=getComputedStyle(p,'::before');
   if(before.content!=='none'&&before.content!=='normal'){
    if(p.matches('.rounds button'))backdrop=color(getToken('--panel-hi'));
    else if(before.backgroundImage!=='none')unsupported.push(p.tagName+'.'+p.className);
    else backdrop=composite(rgba(before.backgroundColor),backdrop);
   }
   if(s.backgroundImage!=='none'){
    if(p.matches('.panel'))backdrop=color(s.getPropertyValue('--surface'));
    else unsupported.push(p.tagName+'.'+p.className);
   }
  }
  const fg=composite(rgba(style.color),backdrop),size=parseFloat(style.fontSize),weight=parseFloat(style.fontWeight);
  const threshold=size>=24||size>=18.666666&&weight>=700?3:4.5;
  elements.push({tag:e.tagName,id:e.id,class:e.className,text:text.slice(0,90),color:fg,backdrop,fontSize:size,fontWeight:weight,threshold,ratio:ratio(fg,backdrop)});
 }
 probe.remove();
 return {tokens,pairs,elements,unsupported:[...new Set(unsupported)],formulaChecks:{blackWhite:ratio([0,0,0],[255,255,255]),same:ratio([20,20,20],[20,20,20])},
  failures:[...pairs,...elements].filter(p=>p.ratio<p.threshold)};
});}

for(const width of [360,1280])test(`${width}px：實際 token、一般字 4.5／大字 3 與互動狀態對比`,async t=>{
 const reports=[];
 for(const sample of samples){
  const page=await openActivity(t,sample,{width});
  const collect=async state=>reports.push({activity:sample.path,state,...await audit(page)});
  await collect('initial');await fillAnswers(page,sample,{wrong:true});await collect('selected');
  await activate(page,'#b-send');await page.locator('#verdict.no').waitFor({state:'visible'});await collect('wrong');
  if(process.env.YBS_A11Y_CAPTURE_DIR){
   await mkdir(process.env.YBS_A11Y_CAPTURE_DIR,{recursive:true});
   await page.screenshot({path:join(process.env.YBS_A11Y_CAPTURE_DIR,`${sample.path}-${width}-wrong.png`),fullPage:true});
  }
  await page.context().browser().close();
 }
 // 工作單三種標記色是真實可選狀態，也檢查標記內的文字。
 const sheet=await openActivity(t,{...samples.find(s=>s.kind==='sheet'),round:1},{width});
 const fields=sheet.locator('#stage select');await choose(sheet,fields.nth(0),0);await choose(sheet,fields.nth(1),0);
 for(let k=0;k<3;k++){
  await choose(sheet,fields.nth(2),k);await activate(sheet,'[data-sheet-action="format"]');
  assert.ok(await sheet.locator('.sheet-mark').count()>0);
  reports.push({activity:'u2-06',state:['yellow','blue','pink'][k],...await audit(sheet)});
 }
 if(process.env.YBS_A11Y_CAPTURE_DIR)await writeFile(join(process.env.YBS_A11Y_CAPTURE_DIR,`contrast-${width}.json`),JSON.stringify(reports,null,2)+'\n');
 for(const report of reports){
  assert.deepEqual(report.formulaChecks,{blackWhite:21,same:1});
  assert.deepEqual(report.unsupported,[],'不能靜默略過無法計算的背景');
  assert.deepEqual(report.failures,[],`${report.activity} ${report.state} 對比未達標`);
 }
 const unique=[...new Map(reports.flatMap(r=>r.elements).map(p=>[JSON.stringify([p.color,p.backdrop,p.threshold]),p])).values()];
 console.log(`${width}px: ${reports.length} states, ${reports[0].pairs.length} token pairs, ${unique.length} rendered pairs, ${reports.reduce((n,r)=>n+r.failures.length,0)} AA failures; minimum normal=${Math.min(...reports.flatMap(r=>[...r.pairs,...r.elements]).filter(p=>p.threshold===4.5).map(p=>p.ratio)).toFixed(3)}`);
});
