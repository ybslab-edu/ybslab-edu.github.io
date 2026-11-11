// Observed temple: red tile roofs, polychrome ridge dragons, grey stone lions,
// white steel forecourt canopy and a tiered incense burner. Small reliefs share
// the campus instance buffers; this is an architectural approximation, not a scan.
export function addPhotoTemple(data,api,THREE) {
  const {box,instance,cylinder,crown,unitBox,group,setDetailDistance}=api;
  const up=new THREE.Vector3(0,1,0),silver='#a8bab1',red='#ad573d',gold='#d3ac59',green='#397e67',blue='#478795';
  const beam=(a,b,w,color)=>{const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));instance(unitBox,color,a.map((v,i)=>(v+b[i])/2),[w,d.length(),w],new THREE.Quaternion().setFromUnitVectors(up,d.normalize()));};
  const temple=data.buildings.find(b=>b.id==='temple'),p=temple.polygon;
  // The long front eave is the southeast edge; follow the traced building angle.
  const a=p[3],b=p[2],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);
  const point=(u,y,n=0)=>[a[0]+dx*u/len-dz*n/len,y,a[1]+dz*u/len+dx*n/len];
  const put=(u,y,n,size,color)=>box(point(u,y,n),size,color,angle);
  // Dark inset entrance, red round columns, painted lintels and gate grilles.
  put(len/2,2.15,.16,[len*.64,4.15,.12],'#584334');
  // Visible warm shrine and offering table, layered ahead of the inset wall.
  put(len/2,2.4,.26,[4.4,3.1,.15],'#7d3829');
  for(const u of [len/2-2,len/2+2])put(u,2.4,.45,[.22,3.2,.25],gold);
  put(len/2,3.9,.46,[4.7,.25,.4],gold);
  for(const u of [len/2-1,len/2,len/2+1]) {
    instance(crown,gold,point(u,2.5,.5),[.28,.65,.24]);
    instance(crown,'#e1bc79',point(u,3.1,.5),[.22,.23,.20]);
  }
  put(len/2,1.25,.85,[6,.2,1],red);
  for(const u of [len/2-2.5,len/2+2.5])put(u,.65,.85,[.22,1.2,.5],gold);
  for(const u of [len*.28,len*.72]) {
    instance(crown,'#ffd48a',point(u,3.25,.7),[.22,.34,.22]);

  }
  const lamp=new THREE.PointLight('#ffbb65',10,12,2);lamp.position.fromArray(point(len/2,3.1,1.25));group.add(lamp);
  for(const u of [len*.17,len*.83])instance(cylinder,'#893f35',point(u,2.2,.25),[.25,4.4,.25]);
  for(const y of [3.9,4.15,4.5])put(len/2,y,.28,[len,.18,.25],y===4.15?green:gold);
  for(let u=.3;u<len;u+=.45) {
    put(u,4.33,.45,[.25,.18,.08],[red,gold,green,blue][Math.floor(u*3)%4]);
    for(const y of [3.96,4.56])instance(crown,gold,point(u,y,.4),[.09,.09,.06]);
  }
  for(const u of [.7,len-.7])for(let k=0;k<9;k++)put(u+(k-4)*.13,1.8,.22,[.035,3.3,.04],silver);
  function lion(u) {
    put(u,.35,2.0,[.85,.65,.85],'#80877e');
    instance(crown,'#8e958a',point(u,.95,2),[.43,.55,.4]);
    instance(crown,'#929b8e',point(u,1.42,2.13),[.44,.38,.40]);
    for(const s of [-1,1]){instance(crown,'#737e72',point(u+s*.26,1.64,2.14),[.16,.19,.15]);put(u+s*.26,.72,2.3,[.19,.5,.25],'#8e958a');}
    put(u,1.34,2.49,[.28,.11,.05],'#555d55');
    put(u,1.1,2.43,[.6,.12,.06],'#9c4944');
  }
  lion(1.5);lion(len-1.5);
  const canopyCenter=point(len/2,0,2.0);
  const [tx,,tz]=canopyCenter;
  put(len/2,3.3,2,[len*.66,.12,3.0],'#c3c6b5');
  // Replace the visual flat roof edge with a shallow arched steel fascia.
  for(const s of [-1,1]){
    put(len/2+s*len*.32,1.65,3.5,[.13,3.3,.13],'#d8dcd0');
    beam(point(len/2+s*len*.32,2.5,3.5),point(len/2+s*len*.25,3.3,3.5),.12,'#d8dcd0');
  }
  put(len/2,3.25,3.5,[len*.66,.26,.15],'#c3c6b5');
  for(let x=-len*.32;x<=len*.32;x+=1)put(len/2+x,3.32,2,[.08,.12,3.0],'#d8dcd0');
  // Burner pedestal, bowl, pagoda hood and incense sticks.
  for(const [y,r,h] of [[.25,.65,.30],[.75,.35,.80],[1.35,.7,.40],[1.65,.8,.15]])instance(cylinder,'#8b9688',[tx,y,tz+2],[r,h,r]);
  for(let i=0;i<13;i++)box([tx-.45+i*.07,2.0+(i%3)*.08,tz+2],[.025,.65,.025],'#a46c49');
  for(const s of [-1,1])box([tx+s*.8,2.25,tz+2],[.06,2.9,.06],'#4d5754');
  for(let tier=0;tier<3;tier++){
    const y=2.8+tier*.38,w=1.9-tier*.4;
    box([tx,y,tz+2],[w,.13,w*.7],'#969781');
    for(const s of [-1,1])beam([tx+s*w/2,y,tz+2],[tx+s*(w/2+.15),y+.15,tz+2],.08,'#969781');
  }
  // Six sinuous dragons in three polychrome ridge bands, aligned to roof.
  const ridge=temple.floorHeight+temple.roof.rise;
  const palette=[gold,green,blue,red];
  setDetailDistance(65);
  for(let band=0;band<3;band++)for(const sign of [-1,1]) {
    let last;
    for(let i=0;i<=20;i++) {
      const t=i/20,u=len/2+sign*(6-t*4.8),y=ridge+1.3-band*.9+Math.sin(t*Math.PI*2.4)*.5+t*.8;
      const p=point(u,y,-6+band*1.6);
      if(last)beam(last,p,.22,palette[band%4]);
      instance(crown,palette[i%4],[p[0],y+.23,p[2]],[.12,.27,.12]);
      if(i%4===0)beam(p,point(u+sign*.3,y-.35,-5.7+band*1.6),.12,gold);
      last=p;
    }
    instance(crown,green,last,[.5,.38,.35]);
    beam(last,[last[0]-sign*.65,last[1]-.15,last[2]+.15],.18,red);
    beam([last[0]-sign*.6,last[1]-.22,last[2]+.15],[last[0]-sign*.85,last[1]-.13,last[2]+.15],.12,gold);
    for(const side of [-1,1]) {
      instance(crown,'#f2e5c6',[last[0]+side*.18,last[1]+.17,last[2]+.2],[.10,.12,.09]);
      beam(last,[last[0]+sign*.4,last[1]+.7,last[2]],.12,gold);
    }
  }
  // Central tiered figures and curling swallowtail mosaics along the verges.
  for(let tier=0;tier<3;tier++) {
    put(len/2,ridge+.25+tier*.38,-6,[2.6-tier*.5,.18,.7],palette[tier]);
    for(let k=-1;k<=1;k++) {
      const p=point(len/2+k*.65,ridge+.8+tier*.15,-6);
      instance(crown,k?red:gold,p,[.2,.55,.18]);
      instance(crown,gold,[p[0],p[1]+.6,p[2]],[.17,.2,.17]);
    }
  }
  for(const side of [0,len])for(let k=0;k<12;k++) {
    const n=-6+k*.5,y=ridge-3.0*Math.abs(n+6)/6;
    for(let layer=0;layer<3;layer++)instance(crown,palette[(k+layer)%4],point(side,y+.3+layer*.2,n),[.25,.22,.28]);
  }
  setDetailDistance(Infinity);
  // Right annex: brick columns, lower pitched orange tiles and framed window.
  put(len+2,1.9,-2,[4,3.8,5],'#ca7c61');
  for(const u of [len+.2,len+3.8])put(u,2,-.1,[.4,4,.4],red);
  put(len+2,2,-.02,[2.5,1.7,.1],silver);
  for(let k=0;k<9;k++)put(len+.9+k*.27,2,.07,[.04,1.7,.04],silver);
  for(let k=0;k<18;k++)beam(point(len+k*.23,4.0,.6),point(len+k*.23,5.3,-2.5),.19,red);
  // Arch roof and framed polychrome panels, with sculptural stone bases.
  const arch=data.siteDetails.templeArch,[ax,az]=arch.position;
  for(const side of [-1,1]) {
    box([ax+side*3,.25,az],[1,.5,1],silver);
    for(let k=0;k<4;k++) {
      box([ax+side*3,1+k*.8,az-.34],[.52,.65,.04],green);
      box([ax+side*3,1+k*.8,az-.37],[.40,.53,.04],gold);
      instance(crown,'#98a493',[ax+side*3,1+k*.8,az-.41],[.14,.2,.04]);
    }
  }
  box([ax,4.4,az-.8],[4,.45,.15],green);
  for(const side of [-1,1]) {
    beam([ax-4.3,4.5,az+side*.9],[ax-4.3,5.1,az],.25,red);
    beam([ax+4.3,4.5,az+side*.9],[ax+4.3,5.1,az],.25,red);
    for(let x=-4.2;x<=4.2;x+=.17)beam([ax+x,4.5,az+side*.95],[ax+x,5.1,az],.12,red);
  }
  for(const side of [-1,1])beam([ax+side*4.2,5.1,az],[ax+side*4.65,5.65,az],.17,gold);
  // Pink village office, blue roller door and ribbed furnace chimney.
  box([tx-10,1.5,tz-.9],[3.5,3,3.5],'#c68e8b');
  box([tx+6,1.4,tz],[1.7,2.8,1.7],'#ad573d');
  box([tx-10,1.5,tz+.8],[3.5,3,.10],'#c68e8b');
  box([tx-10,1.1,tz+.9],[1.2,2.2,.12],'#3e7185');
  for(let y=.15;y<2.1;y+=.1)box([tx-10,y,tz+.98],[1.2,.025,.025],'#8aa9ad');
  instance(cylinder,'#967b61',[tx+6,4.2,tz],[.28,2.5,.28]);
  for(const y of [3.2,4.9,5.3])instance(cylinder,'#62615a',[tx+6,y,tz],[.35,.10,.35]);
}
