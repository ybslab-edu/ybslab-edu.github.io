import * as THREE from 'three';
import { corridorLevels } from './corridors.mjs';

// Dimensions remain estimates; confirmed footprints and pedestrian graph are
// deliberately retained. These details follow the locally inspected photographs.
export function addPhotoArchitecture(data,api) {
  const {box,strip,line,instance,cylinder,crown,unitBox,group,surface}=api;
  const steel='#929d9e',white='#ecebdd',stone='#a8bab1';
  const beam=(a,b,w,color)=>{
    const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    instance(unitBox,color,a.map((v,i)=>(v+b[i])/2),[w,d.length(),w],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
  };
  function edge(a,b) {
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);
    const p=(u,y,n=0)=>[a[0]+dx*u/length-dz*n/length,y,a[1]+dz*u/length+dx*n/length];
    return {length,p,put:(u,y,n,size,color)=>box(p(u,y,n),size,color,angle)};
  }
  function rail(e,y,n=0,from=0,to=e.length,color=steel) {
    e.put((from+to)/2,y+.98,n,[to-from,.07,.07],color);
    e.put((from+to)/2,y+.08,n,[to-from,.06,.07],color);
    for(let u=from;u<=to;u+=.18)e.put(u,y+.52,n,[.035,.95,.035],color);
  }
  function window(e,u,y,n,w,h) {
    e.put(u,y,n,[w+.16,h+.16,.12],'#d7ddd8');
    e.put(u,y,n+.07,[w,h,.06],'#344f53');
    for(let i=-1;i<=1;i++)e.put(u+i*w/3,y,n+.13,[.045,h,.04],'#bbc5c2');
    e.put(u,y+h*.26,n+.13,[w,.045,.04],'#bbc5c2');
  }
  // D: an actual recessed core, with walkable balcony slabs around it. All
  // extrusions are merged into the existing body's draw to retain the budget.
  const d=data.buildings.find(b=>b.id==='D'),dg=group.getObjectByName('building:D');
  function insetPolygon(points,amount) {
    const signed=points.reduce((n,p,i)=>{const q=points[(i+1)%points.length];return n+p[0]*q[1]-q[0]*p[1];},0),sign=Math.sign(signed);
    const sides=points.map((a,i)=>{const b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);return {a:[a[0]-sign*dz/l*amount,a[1]+sign*dx/l*amount],v:[dx,dz]};});
    return sides.map((b,i)=>{const a=sides[(i+sides.length-1)%sides.length],det=a.v[0]*b.v[1]-a.v[1]*b.v[0],diff=b.a.map((n,k)=>n-a.a[k]);const t=(diff[0]*b.v[1]-diff[1]*b.v[0])/det;return a.a.map((n,k)=>n+t*a.v[k]);});
  }
  const core=insetPolygon(d.polygon,2.1),parts=[];
  function extrude(poly,height,y=0) {
    const g=new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x,z])=>new THREE.Vector2(x,-z))),{depth:height,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(0,y,0);parts.push(g);
  }
  extrude(core,d.floors*d.floorHeight);
  for(let f=1;f<=d.floors;f++)extrude(d.polygon,.20,f*d.floorHeight-.20);
  const body=dg.children.find(o=>o.isMesh);parts.push(body.geometry);
  const merged=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']) {
    const arrays=parts.map(g=>g.getAttribute(name).array),all=new Float32Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;
    for(const a of arrays){all.set(a,offset);offset+=a.length;}
    merged.setAttribute(name,new THREE.BufferAttribute(all,name==='uv'?2:3));
  }
  body.geometry=merged;dg.userData.balconyDepth=2.1;
  d.polygon.forEach((a,i)=>{
    // East end: opaque grey closure of the recessed core/balconies, within the footprint.
    if(i===3) {
      const wall=edge(d.polygon[4],d.polygon[3]);
      wall.put(wall.length/2,9,-.12,[wall.length,18,.32],'#b8b9b0');
      return;
    }
    const e=edge(a,d.polygon[(i+1)%d.polygon.length]),back=edge(core[(i+1)%core.length],core[i]);
    for(let f=0;f<d.floors;f++) {
      const y=f*d.floorHeight;
      e.put(e.length/2,y+3.36,0,[e.length,.38,.6],white);
      if(f)rail(e,y,-.10);
      for(let u=.25;u<e.length;u+=6){e.put(u,y+1.7,0,[.55,3.4,.6],white);}
      for(let u=2.2;u<back.length;u+=5.8)window(back,u,y+1.95,.12,3.8,2.1);
    }
    rail(e,d.floors*d.floorHeight,-.1);
    // Photograph 28: several wide brown screens, each composed of dense fins.
    if([2,5].includes(i))for(let u=4;u<e.length-4;u+=13)for(let k=0;k<24;k++)e.put(u+k*.16,9,-.04,[.085,17.7,.40],'#765d4c');
  });
  // A front: orange tile balconies, a grey stone name wall and stone portal.
  const a=data.buildings.find(b=>b.id==='A'),front=edge(a.polygon[3],a.polygon[2]);
  const west=edge(a.polygon[0],a.polygon[3]);
  west.put(west.length/2,8,-.05,[west.length,16,.30],white);
  const opening=a.solidFootprints.map(poly=>poly.filter(p=>Math.abs((p[0]-a.polygon[3][0])*(a.polygon[2][1]-a.polygon[3][1])-(p[1]-a.polygon[3][1])*(a.polygon[2][0]-a.polygon[3][0]))<.01).sort((p,q)=>p[0]-q[0]));
  const ends=[opening[1].at(-1),opening[0][0]],us=ends.map(p=>Math.hypot(p[0]-a.polygon[3][0],p[1]-a.polygon[3][1]));
  const center=(us[0]+us[1])/2,width=us[1]-us[0];
  front.put(center-width/2-4.0,6.0,.22,[7.9,12,.38],stone);
  front.put(center+width/2+.38,6,.22,[.76,12,.38],stone);
  front.put(center-3.8,12.25,.22,[width+8.5,.7,.65],stone);
  for(const f of [1,2]) {
    front.put(center,f*4+.48,-.12,[width, .96,1.25],'#bc7655');
    rail(front,f*4+.96,.48,center-width/2,center+width/2);
  }
  // Gold school lettering generated as geometry-safe canvas, never a photo.
  const signCanvas=document.createElement('canvas');signCanvas.width=256;signCanvas.height=1024;
  const sc=signCanvas.getContext('2d');
  if(sc.clearRect) {sc.clearRect(0,0,256,1024);sc.fillStyle='#d9bb67';sc.font='64px serif';sc.textAlign='center';[...'新竹縣立成功國民中學'].forEach((c,i)=>sc.fillText(c,128,77+i*78));}
  const st=new THREE.CanvasTexture(signCanvas);st.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.8,9.2),new THREE.MeshLambertMaterial({map:st,transparent:true,depthWrite:false}));
  sign.position.fromArray(front.p(center-width/2-4,6.7,.43));sign.rotation.y=-Math.atan2(a.polygon[2][1]-a.polygon[3][1],a.polygon[2][0]-a.polygon[3][0]);sign.name='stone-school-name';group.add(sign);
  // Broad stone arrival apron; the existing traced forecourt and lawn outlines
  // remain data sources, while this entrance apron supplies the visible finish.
  front.put(center,.13,10,[30,.06,20],'#b7b7aa');
  for(let u=center-13;u<center+14;u+=3)front.put(u,.17,10,[.65,.025,20],'#a8bab1');
  // Deep ground passage and two recessed balcony decks retain the opening.
  for(const depth of [2.2,6,10.6]) {
    for(const f of [1,2]) {
      front.put(center,f*4-.12,-depth,[width,.24,1.6],white);
      front.put(center,f*4+.32,-depth,[width,.64,.16],'#bc7655');
      rail(front,f*4+.64,-depth,center-width/2,center+width/2);
    }
    front.put(center,3.65,-depth,[width,.3,.38],white);
    for(const side of [-1,1])front.put(center+side*(width/2-.18),1.8,-depth,[.36,3.6,.45],white);
  }
  for(let step=0;step<4;step++)front.put(center,.07+step*.09,1.8-step*.35,[width+1,.14,.4],stone);
  for(let u=center-width/2-7;u<center-width/2-.5;u+=1.1){
    const p=front.p(u,.3,1.1);instance(cylinder,'#705a4b',p,[.28,.55,.28]);
    for(let j=0;j<4;j++)instance(crown,j%2?'#9d4792':'#b455a6',[p[0]+Math.sin(j*2)*.4,1+j*.18,p[2]],[.55,.30,.35]);
  }
  for(let u=2;u<front.length;u+=4) {
    if(u>center-width/2-8.2&&u<center+width/2+1)continue;
    for(const f of [1,2]) {front.put(u,4*f+.4,.18,[3.8,.8,.28],'#bc7655');rail(front,4*f+.8,.35,u-1.9,u+1.9);}
    front.put(u,14,.16,[3.75,3.8,.16],white);window(front,u,14.2,.29,.8,1.5);
  }
  // Main axis: transverse ceiling beams, slim cable trays and white tile posts.
  const axis=edge(data.mainAxis.south,data.mainAxis.north);
  for(let u=axis.length*.35;u<axis.length;u+=5) {
    axis.put(u,3.12,0,[.23,.28,data.mainAxis.width],white);
    for(const side of [-1,1])axis.put(u,1.56,side*(data.mainAxis.width/2-.22),[.45,3.12,.45],white);
    axis.put(u,2.98,-2.0,[4.8,.10,.42],'#929d9e');
    axis.put(u,2.87,2.1,[4.8,.08,.11],'#835e56');
    axis.put(u,3.00,0,[.65,.03,.28],'#eef0d9');
  }
  // The white link has open metal guards; the orange arcade has only one
  // elevated terrace. Fine members share the existing metal line batch.
  for(const c of data.corridors) {
    const e=edge(...c.endpoints),levels=corridorLevels(data,c),brick=c.id==='a-gym';
    const top=levels.at(-1).heights;
    const guards=brick?levels.filter(l=>l.floor>1).map(l=>l.heights):[...levels.filter(l=>l.floor>1).map(l=>l.heights),top.map(y=>y+3.6)];
    for(const side of [-1,1]) {
      const n=side*(c.width/2-.1);
      for(const [a,b] of guards) {
        for(const dy of [.08,1.08])beam(e.p(0,a+dy,n),e.p(e.length,b+dy,n),.06,steel);
        for(let u=0;u<=e.length;u+=.16)e.put(u,a+(b-a)*u/e.length+.58,n,[.035,1,.035],steel);
      }
      // Exposed red fire main under the ground ceiling, with short hangers.
      beam(e.p(0,3.24,n-side*.30),e.p(e.length,3.24,n-side*.30),.12,'#963c37');
      for(let u=.6;u<e.length;u+=3.6)e.put(u,3.49,n-side*.30,[.035,.42,.035],steel);
      const vines=brick?Math.ceil(e.length/2.2):6;
      for(let k=0;k<vines;k++) {
        const u=(k+.4)*e.length/vines,y=brick?4:4-.4*u/e.length;
        instance(crown,'#526b3b',e.p(u,y+.06,n),[brick?.70:.46,.15,.36]);
        if(k%3===0)for(let j=0;j<4;j++)instance(crown,j%2?'#526b3b':'#657b42',e.p(u+Math.sin(j*1.8)*.16,y-j*.18-.13,n+side*.10),[.19,.21,.18]);
      }
    }
    if(brick) {
      // Portal lintels repeat across the ground arcade; no second-storey roof.
      const divisions=Math.ceil(e.length/4.8);
      for(let i=0;i<=divisions;i++)e.put(e.length*i/divisions,3.66,0,[.50,.50,c.width+.1],'#bc7655');
      // Stair follows A's west tiled end wall, climbing south to the terrace.
      // Its landing overlaps the existing terrace edge; no footprint is moved.
      west.put(11.3,3.88,.95,[1.85,.24,1.9],'#a8a79d');
      for(let i=0;i<20;i++)west.put(6.0+i*.28,.1+i*.20,.95,[.30,.20,1.4],'#a8a79d');
      beam(west.p(6,1.14,1.7),west.p(11.32,4.94,1.7),.06,steel);
      for(let i=0;i<20;i++)west.put(6+i*.28,.62+i*.2,1.7,[.04,1.04,.04],steel);
      rail(west,4,1.86,10.4,12.22);
    } else {
      // North approach: broad stair and its adjacent ramp, retained inside the
      // already confirmed link width; these are exterior finish estimates.
      const north=1,stepWidth=e.length-1.45;
      for(let i=0;i<6;i++)e.put(stepWidth/2+.25,(i+1)*.05,north*(4.3-i*.32),[stepWidth,(i+1)*.10,.34],'#b2b4aa');
      const x=e.length-.53;
      const rampStart=e.p(x,.02,4.4),rampEnd=e.p(x,.57,2.65),rampDirection=new THREE.Vector3(...rampEnd).sub(new THREE.Vector3(...rampStart));
      instance(unitBox,'#b2b4aa',rampStart.map((v,i)=>(v+rampEnd[i])/2),[1.05,.08,rampDirection.length()],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),rampDirection.normalize()));
      beam(e.p(e.length+.02,.15,4.4),e.p(e.length+.02,.70,2.65),.12,white);
    }
  }
  // Gym: green clerestory glazing with pale mullions, door canopy and towers.
  const gym=data.buildings.find(b=>b.id==='gym');
  gym.polygon.forEach((p,i)=>{
    const e=edge(gym.polygon[(i+1)%4],p);
    // Two rows of small windows beneath the tall green clerestory.
    for(const y of [3.4,9.4])for(let u=3;u<e.length-2;u+=6)window(e,u,y,.24,1.5,1.05);
    e.put(e.length/2,13.2,.18,[e.length,2.4,.20],'#35756b');
    for(let u=0;u<e.length;u+=1.5)e.put(u,13.2,.32,[.065,2.4,.10],'#c0c8b7');
    e.put(e.length/2,14.4,.10,[e.length,.14,.20],white);
  });
  // Exposed curved end fascia follows the same sine arch as the roof mesh.
  for(const [a,b] of [[gym.polygon[0],gym.polygon[3]],[gym.polygon[1],gym.polygon[2]]]) {
    let last;
    for(let i=0;i<=24;i++) {
      const t=i/24,p=[a[0]+(b[0]-a[0])*t,14.4+Math.sin(t*Math.PI)*2.6,a[1]+(b[1]-a[1])*t];
      if(last)beam(last,p,.22,white);last=p;
    }
  }
  const gymFront=edge(gym.polygon[3],gym.polygon[2]);
  for(let u=4;u<gymFront.length-3;u+=2)window(gymFront,u,1.5,.2,1.85,2.7);
  gymFront.put(gymFront.length/2,3.65,1.1,[gymFront.length, .18,2.5],'#a8bab1');
  for(let u=1;u<gymFront.length;u+=5){const p=gymFront.p(u,1.8,2.2);instance(cylinder,steel,p,[.16,3.6,.16]);}
  for(let i=0;i<3;i++) {
    const t=.2+i*.3,x=gym.polygon[0][0]+(gym.polygon[3][0]-gym.polygon[0][0])*t+2,z=gym.polygon[0][1]+(gym.polygon[3][1]-gym.polygon[0][1])*t,y=gym.floorHeight+gym.roof.rise+1.2;
    for(const dy of [-.8,0,.8])instance(cylinder,'#d2d2bf',[x,y+dy,z],[1.06,.09,1.06]);
    instance(cylinder,'#9a9c8c',[x,y+1.0,z],[.66,.18,.66]);
    for(const dx of [-.65,.65])box([x+dx,y-1.5,z],[.14,1,.14],steel);
  }
  const dr=data.siteDetails.dRamp,er=edge(dr.south,dr.north);
  for(const side of [-1,1]) {
    for(let u=0;u<=er.length;u+=.18)er.put(u,.65+u/er.length*1.2,side,[.035,.95,.035],steel);
    beam(er.p(0,.18,side),er.p(er.length,1.38,side),.16,stone);
  }
  // Forecourt grey/yellow stone pattern is atlas based, with long grey bands.
  const fore=data.outdoorAreas.find(a=>a.id==='forecourt');
  for(let i=1;i<8;i++) {
    const p=fore.polygon[0].map((v,k)=>v+(fore.polygon[1][k]-v)*i/8),q=fore.polygon[3].map((v,k)=>v+(fore.polygon[2][k]-v)*i/8);
    strip(p,q,.65,.035,'#a8bab1',.13);
  }
  // Stone stepping paths, tree-soil islands and courtyard table/bench sets.
  for(const id of ['courtyard-ab','courtyard-bc']) {
    const c=data.outdoorAreas.find(a=>a.id===id),[x,z]=c.position;
    instance(cylinder,'#8d8a70',[x+2,.12,z+1],[5,.02,4]);
    for(let i=0;i<21;i++)box([x-9+i*.85,.16,z+Math.sin(i*.22)*2],[.50,.07,.48],'#a8bab1');
    for(const dx of [-5,6]) {
      box([x+dx,.68,z-3],[1.8,.20,1.1],stone);box([x+dx,.34,z-3],[.45,.68,.45],stone);
      for(const dz of [-1.1,1.1])box([x+dx,.30,z-3+dz],[1.6,.6,.4],stone);
    }
    for(let i=0;i<4;i++) {
      const e=edge(c.polygon[i],c.polygon[(i+1)%4]);
      for(let step=0;step<5;step++)e.put(e.length/2,.12+step*.08,-step*.25,[e.length,.14,.30],stone);
    }
  }
  // Shelter edge beams, wheel racks, green motorcycle bays.
  for(const s of data.shelters) {
    for(const [i,j] of [[0,3],[1,2]])strip(s.polygon[i],s.polygon[j],.14,.16,steel,s.height-.05);
    const e=edge(s.polygon[0],s.polygon[3]);
    for(let u=2;u<e.length;u+=2)for(const n of [.7,1.1]) {
      e.put(u,.25,n,[.06,.5,.06],steel);e.put(u,.5,n+.15,[.06,.06,.35],steel);
    }
  }
  // Gate central latch, waste bins, warning bollards and ventilation louvers.
  for(const g of data.sideGates) {
    const angle=g.angle??0;
    if(g.name==='北二門')strip([g.position[0],g.position[1]+8],g.position,3.5,.04,'#b77761',.12);
    box([g.position[0],g.height*.52,g.position[1]],[.75,.08,.12],steel,angle);
    box([g.position[0],g.height*.5,g.position[1]],[.08,g.height,.10],steel,angle);
    if(g.name==='北一門')for(let k=0;k<3;k++) {
      const x=g.position[0]+4+k*1.6,z=g.position[1]+2;
      box([x,.7,z],[1.35,1.2,.9],'#55745e');box([x,1.34,z],[1.45,.16,1], '#73907b');
      for(const dx of [-.5,.5])instance(cylinder,'#363e3e',[x+dx,.12,z],[.12,.15,.12]);
    }
  }
  const r=data.siteDetails.ramp;
  for(let i=0;i<3;i++)box([r.north[0]-1+i,.55,r.north[1]+1],[.12,1.1,.12],'#dab75a');
  const vent=[r.south[0]-4,r.south[1]-3];
  box([vent[0],.65,vent[1]],[3,1.3,1.5],stone);
  for(let i=0;i<8;i++)box([vent[0],.35+i*.085,vent[1]+.76],[2.5,.04,.06],steel);
  // Ground markings: ladder lanes, basketball keys and net posts.
  const [p,q]=data.siteDetails.practiceLanes,practice=edge(p,q);
  practice.put(practice.length/2,.17,1.35,[practice.length,.04,3.5],'#a64e50');
  for(let u=0;u<practice.length;u+=.65)for(const side of [0,1.8])practice.put(u,.23,side,[.04,.02,.7],'#dfddd0');
  for(const c of data.sports.courts) {
    if(c.type==='basketball') {
      const [x,z]=c.position;
      for(const side of [-1,1]) {
        const end=c.polygon.filter(p=>side<0?p[0]<x:p[0]>x).sort((a,b)=>side*(b[0]-a[0]))[0];
        box([end[0]-side*3,.173,z],[4,.012,3.6],'#ad6660');
      }
    }else{
      const [x,z]=c.position,e=edge(c.polygon[0],c.polygon[1]);
      const p=e.p(e.length/2,0);
      // Net across the court's short dimension; shared instance batches.
      const width=Math.hypot(c.polygon[3][0]-c.polygon[0][0],c.polygon[3][1]-c.polygon[0][1]);
      const n=edge([p[0],p[2]],[p[0]+c.polygon[3][0]-c.polygon[0][0],p[2]+c.polygon[3][1]-c.polygon[0][1]]);
      for(const u of [0,width])n.put(u,1.1,0,[.08,2.2,.08],steel);
      for(let y=.65;y<1.6;y+=.12)n.put(width/2,y,0,[width,.025,.025],'#b8c4bd');
    }
  }
  // Low main gate, blue-green crossing and yellow keep-clear grid.
  const gate=data.gate,ga=gate.angle??0;
  const gp=(x,y,z)=>[gate.position[0]+x*Math.cos(ga)+z*Math.sin(ga),y,gate.position[1]-x*Math.sin(ga)+z*Math.cos(ga)];
  const gatePut=(x,y,z,size,color)=>box(gp(x,y,z),size,color,ga);
  gatePut(9,.08,7,[4,.06,8],'#4c9c9e');
  for(let z=4;z<11;z++)gatePut(9,.13,z,[3.5,.025,.26],'#e2e4d9');
  for(let x=-5;x<=5;x+=2)for(const sign of [-1,1])beam(gp(x,.14,4),gp(x+sign*3,.14,10),.055,'#c8a956');
  const [hx,hz]=data.guardhouse.position;
  box([hx,2.25,hz+1.85],[3.1,.65,.12],'#4f2924');
  for(let i=0;i<17;i++)box([hx-1.35+i*.16,2.25,hz+1.93],[.08,.16+(i%3)*.08,.03],i%3?'#d9b75c':'#d76b40');
  // West projecting stair tower: open landings, beams and a vented head.
  const tower=edge(d.polygon[5],d.polygon[4]);
  for(let f=0;f<5;f++) {
    const y=f*3.6;
    tower.put(3,y+.12,2,[5.4,.24,4.2],white);
    for(const u of [.4,5.6])tower.put(u,y+1.8,3.9,[.5,3.6,.5],white);
    tower.put(3,y+3.4,3.9,[5.7,.4,.6],white);
    tower.put(.4,y+1.8,2,[.5,3.6,4.1],white);
    if(f)rail(tower,y,3.95,.65,5.35);
    for(let k=0;k<10;k++)tower.put(2.2,y+.2+k*.17,1.0-k*.17,[2,.17,.25],stone);
  }
  tower.put(3,20.2,2,[5.7,4.4,4.3],white);
  for(const u of [1.3,4.5]) {
    tower.put(u,20.7,4.2,[1.1,1.3,.08],'#394743');
    for(let k=0;k<9;k++)tower.put(u,20.15+k*.13,4.27,[1.1,.055,.08],steel);
  }
  tower.put(3,22.5,2,[6,.2,4.6],white);
  // Sloping planted verge beside the existing ramp, plus a brick track path.
  const rp=data.siteDetails.dRamp;
  const vergeStart=new THREE.Vector3(rp.south[0]-3,.10,rp.south[1]),vergeEnd=new THREE.Vector3(rp.north[0]-3,1.15,rp.north[1]);
  const vergeDirection=vergeEnd.clone().sub(vergeStart);
  instance(unitBox,'#9cbd7f',vergeStart.clone().add(vergeEnd).multiplyScalar(.5).toArray(),[4,.18,vergeDirection.length()],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),vergeDirection.normalize()));
  strip([rp.south[0]-4,rp.south[1]+2],[d.polygon[4][0]-3,d.polygon[4][1]+7],1.6,.08,'#b77761',.18);
  // Kitchen services: framed fan grilles and yellow gas risers.
  const [kx,kz]=data.siteDetails.kitchen.position;
  for(let i=0;i<3;i++)for(let j=0;j<7;j++)box([kx+i*1.5-3-.4+j*.13,1,kz+2.51],[.025,.95,.025],'#d3d8d2');
  for(const dx of [-4,3])box([kx+dx,1.6,kz],[.07,3.2,.07],'#d0b368');
  box([kx-3,2.1,kz+2.3],[2,1.6,1.6],'#879596');
}
