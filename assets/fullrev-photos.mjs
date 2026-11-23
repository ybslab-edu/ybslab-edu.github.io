// 通用取樣／量化介面：只處理授權後的像素，不含照片產生器、身分或過關門檻。
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function quantize(px,bits){
  if(bits===1){const v=0.299*px[0]+0.587*px[1]+0.114*px[2]>=128?1:0;return {rgb:v?[255,255,255]:[0,0,0],code:[v]};}
  const L=2**(bits/3),q=px.map(v=>Math.min(L-1,Math.max(0,Math.round(v/255*(L-1)))));
  return {rgb:q.map(v=>Math.round(v*255/(L-1))),code:q};
}
const fmt=n=>n.toLocaleString('en-US');
// 借用外框原有按鈕與回饋節點，仍由外框掌管送出、待送及雲端確認。
function photoShell(host,store,enabled){
  const work=enabled&&host.closest('#original-work'),send=work&&work.querySelector('#b-send'),verdict=work&&work.querySelector('#verdict');
  if(!send||!verdict)return ()=>{};
  const bar=send.parentElement,parent=bar.parentElement,heading=work.querySelector('.sec-h'),originalHeading=heading&&[...heading.childNodes],originalLabel=send.textContent;
  if(heading){heading.replaceChildren();const num=node('span','2');num.className='num';heading.append(num,node('span','調設定，拍下來'));}
  send.textContent='拍下來傳出去';
  // 插在儲存說明之前，避免多出第二顆送出鈕或第二條送出路徑。
  host.append(bar,verdict,store);
  const feedback=()=>{const title=verdict.querySelector('h3');if(verdict.className.split(' ').includes('ok')&&title?.textContent==='過關！')title.textContent='朋友回訊息：「看到了！」';};
  const observer=globalThis.MutationObserver?new MutationObserver(feedback):null;
  observer?.observe(verdict,{childList:true,subtree:true});feedback();
  return ()=>{observer?.disconnect();parent.append(bar,verdict);send.textContent=originalLabel;if(heading)heading.replaceChildren(...originalHeading);};
}
export function renderPhotos(host,d,api){
  if(d.mode!=='photo')return;
  let disposed=false,loaded=false,n=api.carry?.n||d.start[0],bits=api.carry?.d||d.start[1];
  const values=api.carry?.answers?.map(a=>[...a])||d.photos.map(()=>d.ask.map(()=>null)),pixels=[],canvases=[];
  const settings=node('div'),sizeBox=node('section'),sizeLine=node('div'),size=node('strong'),cap=node('span'),photos=node('div'),store=node('section'),note=node('p','照片準備中…');
  settings.className='photo-knobs';sizeBox.className='panel photo-size';sizeLine.className='photo-size-line';size.className='photo-size-value';cap.className='small';photos.className='photo-grid';store.className='sec photo-store';note.className='small';
  sizeLine.append(node('span','每張照片的大小'),size,cap);sizeBox.append(sizeLine);
  const nums=node('div'),formula=node('p'),numNote=node('p'),heading=node('h2'),number=node('span','3'),storeGrid=node('div'),pixelBox=node('section'),formulaBox=node('section');
  nums.className='photo-nums';numNote.className='small';formula.className='photo-equation';heading.className='sec-h';number.className='num';storeGrid.className='photo-store-grid';pixelBox.className=formulaBox.className='panel';
  heading.append(number,node('span','電腦怎麼存這張照片'));
  const panelTitle=(box,title,label,kind)=>{const row=node('div'),tag=node('span',label);row.className='ptitle';tag.className='tag photo-tag-'+kind;row.append(node('h3',title),tag);box.append(row);};
  panelTitle(pixelBox,'照片 1 中間的一小塊','每格一個數字','quant');pixelBox.append(nums,numNote);
  panelTitle(formulaBox,'檔案多大，這樣算','大小','size');
  const explanation=node('p','8 位元 = 1 位元組（Byte）。容量有兩種算法：電腦常用 1024 位元組 = 1 KiB；手機、記憶卡標示用 1000 位元組 = 1 KB，下一站會用這一種。真的手機照片有幾千萬格、每格 24 位元，所以一張就要好幾 MB（還會再壓縮）。');explanation.className='small';
  formulaBox.append(formula,explanation);storeGrid.append(pixelBox,formulaBox);store.append(heading,storeGrid);
  host.append(settings,sizeBox,photos,note,store);
  const restoreShell=photoShell(host,store,api.shell);
  function slider(title,list,value,change){
    const box=node('section'),label=node('label',title),text=node('div'),row=node('div'),input=node('input'),tip=node('p');
    const sampling=title==='格子數';box.className='panel photo-knob '+(sampling?'photo-samp':'photo-quant');text.className='photo-kval';tip.className='small';
    const titleRow=node('div'),tag=node('span',sampling?'取樣':'量化');titleRow.className='ptitle';tag.className='tag photo-tag-'+(sampling?'samp':'quant');titleRow.append(label,tag);
    tip.textContent=list.length===1?(sampling?'這一關格子數固定。':'這一關顏色數固定用最多的。'):(sampling?(d.kind==='sat'?'一格代表的公尺數越小，衛星圖越清楚。':'格子越多，每一格代表的範圍越小。'):'位元越多，能分的顏色越細。');
    input.id=sampling?'photo-resolution':'photo-depth';label.setAttribute('for',input.id);
    row.style.cssText='display:flex;align-items:center;gap:8px';input.type='range';input.min=0;input.max=list.length-1;input.step=1;input.value=list.indexOf(value);input.setAttribute('aria-label',title);input.style.cssText='flex:1;min-width:0';input.disabled=list.length===1;
    const buttons=[];const update=()=>{const k=Number(input.value),depth=list[k],colors=depth===1?'2 種（黑、白）':depth===24?'約 1677 萬種':`${fmt(2**depth)} 種`;text.textContent=title==='格子數'?(d.kind==='sat'?`一格代表地面 ${64/list[k]} 公尺（${list[k]} × ${list[k]} 格）`:`每邊 ${list[k]} 格（共 ${fmt(list[k]**2)} 格）`):`每格 ${depth} 位元，可分 ${colors}顏色`;buttons.forEach((b,j)=>b.disabled=list.length===1||(j===0?k===0:k===list.length-1));};
    for(const [k,delta] of [[0,-1],[1,1]]){const b=node('button',delta<0?'−':'＋');b.type='button';b.className='photo-step';b.setAttribute('aria-label',title+(delta<0?'少一點':'多一點'));b.onclick=()=>{input.value=Math.max(0,Math.min(list.length-1,Number(input.value)+delta));input.oninput();};buttons.push(b);}
    input.oninput=()=>{change(list[Number(input.value)]);update();paint();api.changed();};row.append(buttons[0],input,buttons[1]);box.append(titleRow,text,row,tip);settings.append(box);update();
  }
  slider('格子數',d.resolutions,n,v=>n=v);slider('顏色數',d.depths,bits,v=>bits=v);
  d.photos.forEach((photo,i)=>{
    const box=node('section'),frame=node('div'),label=node('span',`照片 ${i+1}`),canvas=node('canvas');box.className='photo-card';frame.className='photo-frame';label.className='photo-label';canvas.dataset.photo=String(i);canvas.setAttribute('aria-label',`照片 ${i+1}（數位化後）`);canvases.push(canvas);
    frame.append(canvas,label);box.append(frame);
    d.ask.forEach((kind,j)=>{
      const row=node('div'),ask=node('p',kind==='digit'?'背號是幾號？':kind==='count'?'有幾台遊覽車？':kind==='member'?'這是哪一位成員？':'應援色是哪一個？');row.className='picks';ask.className='photo-ask';box.append(ask,row);
      const choices=kind==='digit'||kind==='count'?Array.from({length:10},(_,k)=>String(k)):d.palette.map(p=>kind==='color'?p[2]:p[0]);
      choices.forEach((label,k)=>{
        const b=node('button',label);b.type='button';b.className='pk';b.dataset.photoIndex=i;b.dataset.photoField=j;b.dataset.choice=k;b.setAttribute('aria-pressed',String(values[i][j]===k));
        if(kind==='member'||kind==='color'){const sw=node('span');sw.style.cssText=`display:inline-block;width:18px;height:18px;background:${d.palette[k][1]};margin-right:6px`;b.prepend(sw);}
        b.onclick=()=>{values[i][j]=values[i][j]===k?null:k;row.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.choice)===values[i][j])));api.changed();};row.append(b);
      });
    });photos.append(box);
  });
  function paint(){
    size.textContent=`${fmt(n*n*bits)} 位元 = ${fmt(n*n*bits/8)} 位元組`+(n*n*bits/8>=1024?` ≈ ${(n*n*bits/8192).toFixed(1)} KiB`:'');
    cap.textContent=d.cap?`（只能傳 ${fmt(d.cap/8)} 位元組）`+(n*n*bits>d.cap?'　超過了，傳不出去！':''):'';
    sizeLine.classList.toggle('over',!!d.cap&&n*n*bits>d.cap);
    formula.textContent=`${n} × ${n} 格 × ${bits} 位元 = ${fmt(n*n*bits/8)} 位元組`+(d.kind==='sat'?`；一格 ${64/n} 公尺，${n} 格是 64 公尺寬的停車場。`:'');
    if(!loaded||disposed)return;
    for(let i=0;i<canvases.length;i++){
      const canvas=canvases[i],ctx=canvas.getContext('2d'),raw=pixels[i].get(n),cells=[];canvas.width=n;canvas.height=n;
      const image=ctx.createImageData(n,n);
      for(let k=0;k<n*n;k++){const q=quantize(Array.from(raw.subarray(k*3,k*3+3)),bits);cells.push(q);image.data.set([...q.rgb,255],k*4);}ctx.putImageData(image,0,0);
      if(i===0){nums.replaceChildren();const w=Math.min(8,n),h=Math.min(6,n),x0=Math.round(n/2-w/2),y0=Math.round((d.kind==='sat'?n/2:n*.6)-h/2);nums.style.gridTemplateColumns=`repeat(${w},minmax(40px,1fr))`;
        for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){
          const q=cells[y*n+x],lum=.299*q.rgb[0]+.587*q.rgb[1]+.114*q.rgb[2],text=bits===1?String(q.code[0]):bits<=6?q.code.map(v=>v.toString(2).padStart(bits/3,'0')).join(' '):q.code.map((v,k)=>'RGB'[k]+v).join('\n');
          const cell=node('span',text);cell.style.cssText=`background:rgb(${q.rgb.join(',')});color:${lum>140?'#111':'#fff'};font-size:11px;white-space:pre;text-align:center;min-height:44px`;nums.append(cell);
        }
        numNote.textContent=bits===1?'每格存 1 個位元：0 是黑、1 是白。':`每格存 ${bits} 個位元：紅、綠、藍各 ${bits/3} 個位元。`;
      }
    }
  }
  (async()=>{
    for(const photo of d.photos){const levels=new Map();pixels.push(levels);for(const [res,gzip] of photo){
      const bytes=Uint8Array.from(atob(gzip),c=>c.charCodeAt(0));const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if(disposed)return;levels.set(res,new Float32Array(buffer));
    }}loaded=true;note.textContent='兩張照片的問題都回答後，再拍下來傳出去。';paint();api.changed();
  })().catch(()=>{if(!disposed)note.textContent='照片尚未取得，請重新讀取這一關。';});
  paint();
  return {get:()=>({n,d:bits,answers:values.map(a=>[...a])}),ready:()=>loaded&&values.every(a=>a.every(v=>v!==null)),dispose(){disposed=true;pixels.length=0;restoreShell();},carry:()=>({n,d:bits,answers:values.map(a=>[...a])})};
}
