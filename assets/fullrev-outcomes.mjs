// 通用成果介面；題目、素材與教學內容均來自授權回應，不含答案或判題。
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const urls=new WeakMap();
function paragraph(host,text){const p=node('p',Array.isArray(text)?text.join(''):text);p.style.whiteSpace='pre-line';host.append(p);}
function table(host,headers,rows){
  const wrap=node('div'),t=node('table');wrap.className='fullrev-outcome-table';wrap.style.cssText='max-width:100%;overflow:auto';t.style.cssText='width:100%;border-collapse:collapse';
  const thead=node('thead'),head=node('tr'),body=node('tbody');for(const text of headers){const th=node('th',text);th.scope='col';head.append(th);}thead.append(head);t.append(thead,body);
  for(const row of rows){const tr=node('tr');row.forEach((text,k)=>{const td=node('td',text===''?'（空白）':text);td.style.cssText='padding:5px;border:1px solid #aaa;overflow-wrap:anywhere';td.dataset.label=headers[k];tr.append(td);});body.append(tr);}wrap.append(t);host.append(wrap);
}
async function materialBlob(file){
  const bytes=Uint8Array.from(atob(file.gzip),c=>c.charCodeAt(0));
  const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const mime={pdf:'application/pdf',zip:'application/zip',png:'image/png',jpg:'image/jpeg'}[file.name.split('.').at(-1)];
  return new Blob([raw],{type:mime});
}
function materials(host,d){
  for(const url of urls.get(host)||[])URL.revokeObjectURL(url);const active=[];urls.set(host,active);
  for(const file of d.materials||[]){
    const box=node('section'),status=node('p','素材準備中…');box.append(status);host.append(box);
    materialBlob(file).then(blob=>{
      if(!host.contains(box))return;const url=URL.createObjectURL(blob);active.push(url);status.remove();
      const a=node('a',file.name.endsWith('.pdf')?'下載本組公告 PDF（示意）':file.name.endsWith('.zip')?'下載本組種子素材包（示意）':file.name.endsWith('.png')?'原圖（查看完整指定區域）':'有損壓縮圖（同一指定區域）');a.href=url;a.download=file.name;a.dataset.material=file.name;box.append(a);
      if(/\.(png|jpg)$/.test(file.name)){const img=node('img');img.src=url;img.alt=a.textContent;img.style.cssText='display:block;max-width:100%;height:auto';img.dataset.materialImage=file.name;box.append(img);}
    }).catch(()=>{status.textContent='素材尚未取得，請重新整理；仍無法取得時請告知老師。';});
  }
}
export function renderOutcome(host,d,changed){
  if(!d.questions||!d.kinds)return;
  const volunteer=d.mode.startsWith('form-volunteer-');
  host.append(node('style',`@media(max-width:559px){
    .fullrev-outcome-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    .fullrev-outcome-table tr{display:block;margin-bottom:8px;border:1px solid #aaa}
    .fullrev-outcome-table td{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px}
    .fullrev-outcome-table td::before{content:attr(data-label);font-weight:bold}
  }`));
  if(d.practice)paragraph(host,d.practice);
  if(d.passages)paragraph(host,d.passages);
  const rows=d.tableField?d[d.tableField]:d.rows;
  if(rows)table(host,d.headers,rows.map((row,k)=>d.indexRows?[k+1,row]:Array.isArray(row)?row:[row]));
  if(d.chartNames){
    const chart=node('section');chart.setAttribute('aria-label','人數長條圖');const total=d.chartCounts.reduce((sum,n)=>sum+n,0);
    d.chartNames.forEach((name,k)=>{const count=d.chartCounts[k],row=node('div',`${name}：${count} 人`),bar=node('div');bar.style.cssText=`height:12px;background:#718b9a;width:${count/total*100}%`;row.append(bar);chart.append(row);});host.append(chart);
  }
  if(d.chartRows){
    const chart=node('section');chart.setAttribute('aria-label','職務第一志願比較（人）');
    paragraph(chart,'實心為國中組，斜線為高中組。各長條共用 0～6 人刻度。');
    for(const [job,group,count] of d.chartRows){
      const row=node('div',`${job}／${group}：${count} 人`),track=node('div'),bar=node('div');
      track.style.cssText='background:var(--panel-hi);margin-bottom:8px';
      bar.style.cssText=`height:12px;width:${count/6*100}%;background:${group==='高中組'?'repeating-linear-gradient(135deg,var(--ember) 0 4px,var(--panel-hi) 4px 6px)':'var(--dim)'}`;
      track.append(bar);row.append(track);chart.append(row);
    }host.append(chart);
  }
  if(d.copyGuide){
    const copy=node('details');copy.append(node('summary','複製到試算表的素材與操作提示'));const pre=node('pre',[d.headers,...rows].map(r=>r.join('\t')).join('\n'));pre.style.cssText='white-space:pre;overflow:auto;max-width:100%';copy.append(pre);paragraph(copy,d.copyGuide);host.append(copy);
  }
  if(d.summaryRows)table(host,d.summaryHeaders,d.summaryRows);
  materials(host,d);
  if(d.backup){
    const attachment=node('div');attachment.className='quest-attach';
    attachment.append(node('h4','本組委託附件'));
    table(attachment,d.backupHeaders||['附件（示意）','觀察'],d.backup);host.append(attachment);
  }
  const inputs=d.questions.map(([text,...options],k)=>{
    const label=node('label',text),input=node(options.length?'select':'input');label.style.cssText='display:block;margin:12px 0;min-width:0';input.style.cssText='display:block;width:100%;max-width:100%;box-sizing:border-box;min-height:44px';
    input.dataset.answerField=k;input.setAttribute('aria-label',text);
    if(options.length){const placeholder=node('option','請選擇');placeholder.value='';input.append(placeholder);options.forEach(text=>{const o=node('option',text);o.value=text;input.append(o);});}
    else{input.type='text';input.autocomplete='off';input.maxLength=256;if(d.kinds[k]==='n')input.inputMode='numeric';}
    input.oninput=input.onchange=changed;label.append(input);host.append(label);return input;
  });
  return {get:()=>inputs.map((e,k)=>!volunteer&&d.kinds[k]==='n'?Number(e.value):e.value),ready:()=>inputs.every((e,k)=>e.value.trim()!==''&&(d.kinds[k]!=='n'||/^\d+$/.test(volunteer?e.value:e.value.trim())&&Number.isSafeInteger(Number(e.value))&&Number(e.value)<=1e12))};
}
