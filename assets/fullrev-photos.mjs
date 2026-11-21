// 通用取樣／量化介面：只處理授權後的像素，不含照片產生器、身分或過關門檻。
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function quantize(px,bits){
  if(bits===1){const v=0.299*px[0]+0.587*px[1]+0.114*px[2]>=128?1:0;return {rgb:v?[255,255,255]:[0,0,0],code:[v]};}
  const L=2**(bits/3),q=px.map(v=>Math.min(L-1,Math.max(0,Math.round(v/255*(L-1)))));
  return {rgb:q.map(v=>Math.round(v*255/(L-1))),code:q};
}
const fmt=n=>n.toLocaleString('en-US');
export function renderPhotos(host,d,api){
  if(d.mode!=='photo')return;
  let disposed=false,loaded=false,n=api.carry?.n||d.start[0],bits=api.carry?.d||d.start[1];
  const values=api.carry?.answers?.map(a=>[...a])||d.photos.map(()=>d.ask.map(()=>null)),pixels=[],canvases=[];
  const settings=node('section'),size=node('p'),photos=node('div'),store=node('section'),note=node('p','照片準備中…');
  photos.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;max-width:820px';
  const nums=node('div'),formula=node('p'),numNote=node('p');nums.style.cssText='display:grid;gap:3px;max-width:100%;overflow:auto';
  store.append(node('h2','電腦怎麼存這張照片'),node('h3','照片 1 中間的一小塊'),nums,numNote,formula,
    node('p','8 位元 = 1 位元組（Byte）；1024 位元組 = 1 KiB。每格只存一個顏色，放大不會增加細節。'));
  host.append(settings,size,photos,note,store);
  function slider(title,list,value,change){
    const box=node('section'),label=node('label',title),text=node('p'),row=node('div'),input=node('input');
    row.style.cssText='display:flex;align-items:center;gap:8px';input.type='range';input.min=0;input.max=list.length-1;input.step=1;input.value=list.indexOf(value);input.setAttribute('aria-label',title);input.style.cssText='flex:1;min-width:0';input.disabled=list.length===1;
    const buttons=[];const update=()=>{const k=Number(input.value);text.textContent=title==='格子數'?(d.kind==='sat'?`一格代表地面 ${64/list[k]} 公尺（${list[k]} × ${list[k]} 格）`:`每邊 ${list[k]} 格（共 ${fmt(list[k]**2)} 格）`):`每格 ${list[k]} 位元，可分 ${fmt(2**list[k])} 種顏色`;buttons.forEach((b,j)=>b.disabled=list.length===1||(j===0?k===0:k===list.length-1));};
    for(const [k,delta] of [[0,-1],[1,1]]){const b=node('button',delta<0?'−':'＋');b.type='button';b.className='btn';b.setAttribute('aria-label',title+(delta<0?'少一點':'多一點'));b.onclick=()=>{input.value=Math.max(0,Math.min(list.length-1,Number(input.value)+delta));input.oninput();};buttons.push(b);}
    input.oninput=()=>{change(list[Number(input.value)]);update();paint();api.changed();};label.append(text);row.append(buttons[0],input,buttons[1]);box.append(label,row);settings.append(box);update();
  }
  slider('格子數',d.resolutions,n,v=>n=v);slider('顏色數',d.depths,bits,v=>bits=v);
  d.photos.forEach((photo,i)=>{
    const box=node('section'),canvas=node('canvas');canvas.dataset.photo=String(i);canvas.setAttribute('aria-label',`照片 ${i+1}（數位化後）`);canvas.style.cssText='display:block;width:100%;aspect-ratio:1;image-rendering:pixelated;background:#101020';canvases.push(canvas);
    box.append(node('h3',`照片 ${i+1}`),canvas);
    d.ask.forEach((kind,j)=>{
      const row=node('div');box.append(node('p',kind==='digit'?'背號是幾號？':kind==='count'?'有幾台遊覽車？':kind==='member'?'這是哪一位成員？':'應援色是哪一個？'),row);
      const choices=kind==='digit'||kind==='count'?Array.from({length:10},(_,k)=>String(k)):d.palette.map(p=>kind==='color'?p[2]:p[0]);
      choices.forEach((label,k)=>{
        const b=node('button',label);b.type='button';b.className='pk';b.style.cssText='min-height:44px;margin:3px';b.dataset.photoIndex=i;b.dataset.photoField=j;b.dataset.choice=k;b.setAttribute('aria-pressed',String(values[i][j]===k));
        if(kind==='member'||kind==='color'){const sw=node('span');sw.style.cssText=`display:inline-block;width:18px;height:18px;background:${d.palette[k][1]};margin-right:6px`;b.prepend(sw);}
        b.onclick=()=>{values[i][j]=values[i][j]===k?null:k;row.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.choice)===values[i][j])));api.changed();};row.append(b);
      });
    });photos.append(box);
  });
  function paint(){
    size.textContent=`每張照片的大小：${fmt(n*n*bits)} 位元 = ${fmt(n*n*bits/8)} 位元組`+(d.cap?`（只能傳 ${fmt(d.cap/8)} 位元組）`:'');
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
  return {get:()=>({n,d:bits,answers:values.map(a=>[...a])}),ready:()=>loaded&&values.every(a=>a.every(v=>v!==null)),dispose(){disposed=true;pixels.length=0;},carry:()=>({n,d:bits,answers:values.map(a=>[...a])})};
}
