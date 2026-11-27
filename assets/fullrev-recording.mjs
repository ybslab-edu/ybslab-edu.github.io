import {inputState} from './fullrev-answer-ui.mjs';
// 通用取樣／量化示意；只顯示目前選擇的觀察，不判題、不產生完成。
const SR=[8,16,32,64], QL=[4,8,16,32], RES=[16,32,64,128], COLORS=[4,16,64], FPS=[4,8,12,24,30];
const QUALITY=[{name:'基本',rate:100},{name:'清晰',rate:250},{name:'精細',rate:400}];
const bytesText=b=>b>=1000?(b/1000).toLocaleString('en-US',{maximumFractionDigits:2})+' KB':b+' 位元組';
const integer=s=>{const t=String(s).trim().replace(/[,，]/g,'');return /^\d+$/.test(t)&&Number.isSafeInteger(Number(t))&&Number(t)<=100000?Number(t):null};
function selectControl(el,id,label,values,format=x=>x){
  el.insertAdjacentHTML('beforeend','<label class="lab-control" for="'+id+'">'+label+'<select id="'+id+'"><option value="">請選擇</option>'+values.map(v=>'<option value="'+v+'">'+format(v)+'</option>').join('')+'</select></label>');
  return el.querySelector('#'+id);
}
function numberControl(el,id,label){
  el.insertAdjacentHTML('beforeend','<label class="lab-answer" for="'+id+'">'+label+'<input class="num-in" id="'+id+'" inputmode="numeric" autocomplete="off"></label>');
  return el.querySelector('#'+id);
}
function canvas(el,label,w=640,h=220){el.insertAdjacentHTML('beforeend','<canvas class="lab-canvas" width="'+w+'" height="'+h+'" role="img" aria-label="'+label+'">'+label+'</canvas>');return el.lastElementChild}
const wave=(i,t)=>.60*Math.sin(2*Math.PI*i.cycles*t)+.22*Math.sin(2*Math.PI*(i.cycles+2)*t+i.phase);
const quant=(v,q)=>Math.round((v+1)/2*(q-1))/(q-1)*2-1;
function soundMetrics(i,rate,levels){
  let error=0;for(let k=0;k<512;k++){const t=k/512;error+=Math.abs(wave(i,t)-quant(wave(i,Math.floor(t*rate)/rate),levels))}
  return {score:Math.round(1000*(1-error/512/2))/10,bytes:Math.ceil(rate*Math.log2(levels)/8)};
}
function drawWave(c,i,rate,levels){
  const x=c.getContext('2d'),y=v=>110-v*90;x.clearRect(0,0,640,220);
  x.strokeStyle=(globalThis.getComputedStyle?.(c).getPropertyValue('--edge').trim()||'#3B455C');x.beginPath();x.moveTo(0,110);x.lineTo(640,110);x.stroke();
  x.strokeStyle=(globalThis.getComputedStyle?.(c).getPropertyValue('--teach-wave').trim()||'#98A2B8');x.lineWidth=2;x.beginPath();for(let k=0;k<=640;k++){const v=y(wave(i,k/640));k?x.lineTo(k,v):x.moveTo(k,v)}x.stroke();
  if(!rate||!levels)return;
  x.strokeStyle=(globalThis.getComputedStyle?.(c).getPropertyValue('--teach-sample').trim()||'#F4B26A');x.lineWidth=2;x.beginPath();
  for(let k=0;k<rate;k++){const v=y(quant(wave(i,k/rate),levels));if(!k)x.moveTo(0,v);else x.lineTo(k/rate*640,v);x.lineTo((k+1)/rate*640,v)}x.stroke();
  x.fillStyle=(globalThis.getComputedStyle?.(c).getPropertyValue('--teach-sample').trim()||'#F4B26A');for(let k=0;k<rate;k++){x.beginPath();x.arc(k/rate*640,y(quant(wave(i,k/rate),levels)),3,0,Math.PI*2);x.fill()}
}
function drawScene(c,n=128,colors=64){
  // 直接計算每格的顏色：舞台、聚光燈、表演者與應援色，無外部圖片。
  const x=c.getContext('2d'),steps=colors===4?[2,2,1]:colors===16?[4,2,2]:[4,4,4];x.clearRect(0,0,c.width,c.height);
  for(let row=0;row<n;row++)for(let col=0;col<n;col++){
    const u=(col+.5)/n,v=(row+.5)/n;
    let rgb=[30+u*90,35+v*90,110+u*100];
    if(Math.abs(u-.5)<v*.3)rgb=[230,190-v*90,90];
    if((u-.5)**2+(v-.37)**2<.006||Math.abs(u-.5)<.055&&v>.43&&v<.77)rgb=[65,40,100];
    if(v>.82)rgb=[60,180+60*Math.sin(u*45),160];
    x.fillStyle='rgb('+rgb.map((z,k)=>steps[k]===1?0:Math.round(z/255*(steps[k]-1))/(steps[k]-1)*255).join(',')+')';
    x.fillRect(col*c.width/n,row*c.height/n,Math.ceil(c.width/n),Math.ceil(c.height/n));
  }
}
const imageBytes=(n,c)=>Math.ceil(n*n*Math.log2(c)/8);
function movieFrame(c,t){const x=c.getContext('2d');x.fillStyle='#18253b';x.fillRect(0,0,c.width,c.height);x.fillStyle='#f6b746';x.beginPath();x.arc(25+(c.width-50)*(t%1),c.height/2,16,0,Math.PI*2);x.fill()}

export function renderRecording(question,host,api){
  const d=question.data,seen=new Set(),numbers=[];let controls=[],get,update=()=>{},dispose=()=>{};
  const select=(id,label,values,format)=>{const el=selectControl(host,id,label,values,format);controls.push(el);return el;};
  const num=(id,label)=>{const el=numberControl(host,id,label);controls.push(el);numbers.push(el);return el;};
  const requirement=document.createElement('p');
  requirement.textContent=d.mode==='recording-sound'?`本組接近度：至少 ${d.target}%。`:d.mode==='recording-image'?`本組用途：${d.use}；至少 ${d.minRes} × ${d.minRes} 像素、${d.minColors} 色。`:`本組需求：至少 ${d.target} fps。`;
  host.append(requirement);
  const stat=document.createElement('p');stat.className='lab-stat';stat.setAttribute('aria-live','polite');stat.textContent=d.mode==='recording-movie'?'選擇 fps 開始看。':'先選兩個設定。';
  if(d.mode==='recording-sound'){
    const c=canvas(host,'灰色原始連續波形與橘色取樣點、階梯還原波形');c.style.maxWidth='100%';
    const r=select('sample-rate','取樣頻率',SR,v=>'每秒 '+v+' 次'),q=select('sample-level','量化階數',QL,v=>'分成 '+v+' 階');
    get=()=>({rate:+r.value,levels:+q.value});
    update=()=>{drawWave(c,d,+r.value,+q.value);if(r.value&&q.value){seen.add(r.value+':'+q.value);const m=soundMetrics(d,+r.value,+q.value);stat.textContent='接近度 '+m.score.toFixed(1)+'%｜資料量 '+bytesText(m.bytes)+'｜已比較 '+seen.size+' 種';}};update();
  }else if(d.mode==='recording-image'){
    const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px';host.append(grid);
    const boxes=['原圖','數位化後'].map(label=>{const box=document.createElement('section'),title=document.createElement('p');title.textContent=label;box.append(title);grid.append(box);return box;});
    const original=canvas(boxes[0],'原始舞台圖',320,320),c=canvas(boxes[1],'調整後的舞台圖',320,320);for(const e of [original,c])e.style.maxWidth='100%';drawScene(original);
    const r=select('image-res','解析度',RES,v=>v+' × '+v+' 像素'),q=select('image-colors','顏色數',COLORS,v=>v+' 色');
    get=()=>({res:+r.value,colors:+q.value});update=()=>{if(r.value&&q.value){seen.add(r.value+':'+q.value);drawScene(c,+r.value,+q.value);stat.textContent='資料量 '+bytesText(imageBytes(+r.value,+q.value))+'｜已比較 '+seen.size+' 種';}};
  }else{
    const c=canvas(host,'依每秒張數移動的小球',640,160);c.style.maxWidth='100%';
    const f=select('movie-fps','每秒張數',FPS,v=>v+' fps'),one=num('movie-one','目前設定，1 秒要存幾張？'),total=num('movie-total',d.seconds+' 秒要存幾張？'),parts=select('movie-parts','有聲影片由什麼組成？',[0,1,2],v=>['一張照片加聲音','一連串畫面加聲音','只有一連串畫面'][v]);
    get=()=>({fps:+f.value,one:integer(one.value),total:integer(total.value),parts:+parts.value});
    let frameId,alive=true,start=null,last=-1;
    const tick=t=>{if(!alive||!c.isConnected)return;if(start===null)start=t;const fps=+f.value,frame=Math.floor((t-start)/1000*fps);if(fps&&frame!==last){last=frame;movieFrame(c,frame/fps/2);}frameId=requestAnimationFrame(tick);};movieFrame(c,0);frameId=requestAnimationFrame(tick);dispose=()=>{alive=false;cancelAnimationFrame(frameId);};
    update=()=>{if(f.value)seen.add(f.value);stat.textContent=(f.value||'—')+' fps｜已比較 '+seen.size+' 種';};
  }
  host.append(stat);const notice=document.createElement('p');notice.textContent='請實際比較至少兩種設定。';host.append(notice);
  const format=document.createElement('p');format.setAttribute('aria-live','polite');host.append(format);
  for(const e of controls)e.onchange=e.oninput=()=>{update();
    format.textContent=numbers.some(e=>e.value!==''&&integer(e.value)===null)?'請輸入 0～100000 的整數，不含小數點；已填內容會保留，可直接修改。':'';
    api.changed();};
  const state=inputState(controls,(e)=>!e.value.trim()?e.tagName==='SELECT'?'請選一項':'請填數字':numbers.includes(e)&&integer(e.value)===null?'請填 0～100000 的整數':'');
  return {...state,fields:()=>[...state.fields(),{target:notice,reason:seen.size<2?'請比較至少兩種不同設定':''}],
    draft:()=>({values:state.draft(),seen:[...seen]}),restoreDraft(v){if(!v||!Array.isArray(v.seen)||v.seen.length>100||v.seen.some(s=>typeof s!=='string'||!/^\d+(?::\d+)?$/.test(s)))return false;if(!state.restoreDraft(v.values))return false;seen.clear();v.seen.forEach(s=>seen.add(s));update();return true;},get,ready:()=>controls.every(e=>e.value!=='')&&numbers.every(e=>integer(e.value)!==null)&&seen.size>=2,dispose,
    readyReason:()=>{const missing=controls.filter(e=>!e.value.trim()).length;
      return missing?`還有 ${missing} 格沒填或沒選。`:numbers.some(e=>integer(e.value)===null)?'請填 0～100000 的整數，不含小數點。':seen.size<2?'請先比較至少兩種不同設定。':'';}};
}
