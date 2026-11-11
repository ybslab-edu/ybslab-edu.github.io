import * as THREE from 'three';
import { addPhotoTemple } from './photo-temple.js';
// All small repeated details use the world's shared geometry/instance batches.
export function addSiteDetails(data, api) {
  const {box,strip,line,circle,instance,cylinder,crown,unitBox,group,label,surface}=api;
  const steel='#a8bab1', dark='#335e4c', brick='#b77761', pale='#ecebdd', blue='#668c96';
  const marker=(id,position,metadata={})=>{const o=new THREE.Group();o.name=id;o.position.set(position[0],0,position[1]);o.userData=metadata;group.add(o);return o;};
  const beam=(a,b,width,color)=>{
    const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    instance(unitBox,color,a.map((n,i)=>(n+b[i])/2),[width,v.length(),width],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));
  };
  for(const lm of data.landmarks){
    const [x,z]=lm.position;
    const root=marker(`landmark:${lm.id}`,lm.position,{type:lm.type});
    const mesh=(name,geometry,color,pos,rot=[0,0,0])=>{
      const o=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color,flatShading:true,side:THREE.DoubleSide}));o.name=name;o.position.set(...pos);o.rotation.set(...rot);root.add(o);return o;
    };
    if(lm.type==='steel-ring'){
      instance(cylinder,'#466b3e',[x,.13,z],[4.5,.2,7]);
      const ring=mesh('steel-ring',new THREE.TorusGeometry(2,.40,4,24,Math.PI*1.91),steel,[0,2.6,0],[0,.2,-.3]);ring.scale.set(1,1.25,.32);
      const vertices=[],indices=[],segments=80;
      for(let i=0;i<=segments;i++)for(const side of [-1,1]) {
        const t=i/segments*Math.PI*1.92,twist=t*.62,r=2+side*.50*Math.cos(twist);
        vertices.push(Math.cos(t)*r,Math.sin(t)*r,side*1.4*Math.sin(twist));
      }
      for(let i=0;i<segments;i++){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
      const ribbon=new THREE.BufferGeometry();ribbon.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));ribbon.setIndex(indices);ribbon.computeVertexNormals();ring.geometry=ribbon;
      ring.material=new THREE.MeshPhongMaterial({color:'#bcc9cb',specular:'#e0e8e8',shininess:80,side:THREE.DoubleSide});
      for(let i=0;i<12;i++){
        const a=i/12*Math.PI*1.9;
        instance(crown,i%2?blue:dark,[x+Math.cos(a)*2,2.6+Math.sin(a)*2.5,z+.2],[.12,.12,.07]);
      }
    }else{
      mesh('black-round-base',new THREE.CylinderGeometry(2.6,2.7,.4,24),'#28302e',[0,.25,0]);
      mesh('steel-sphere',new THREE.IcosahedronGeometry(1.1,3),steel,[-.3,1.4,0]).material=new THREE.MeshPhongMaterial({color:'#8e9e9e',specular:'#eef5f5',shininess:95});
      mesh('inclined-plate',new THREE.BoxGeometry(5,.12,1.4),steel,[0,2.1,0],[0,.1,-.33]);
      const orbit=mesh('steel-orbit',new THREE.TorusGeometry(1.7,.065,4,24),steel,[0,2.5,0],[.5,.4,-.3]);
      const rings=[orbit.geometry.toNonIndexed(),orbit.geometry.clone().rotateX(1.0).rotateZ(.65).scale(.78,.78,.78).toNonIndexed()];
      const ringGeometry=new THREE.BufferGeometry();
      for(const name of ['position','normal','uv']) {
        const values=rings.map(g=>g.getAttribute(name).array),all=new Float32Array(values[0].length+values[1].length);all.set(values[0]);all.set(values[1],values[0].length);
        ringGeometry.setAttribute(name,new THREE.BufferAttribute(all,name==='uv'?2:3));
      }
      orbit.geometry=ringGeometry;
      const silhouette=new THREE.Shape([[-.35,0],[-.15,.7],[-.22,1.15],[-.8,1.6],[-.72,1.8],[-.22,1.5],[0,1.4],[.4,1.5],[.8,1.9],[.9,1.7],[.55,1.2],[.25,1.1],[.16,.65],[.45,.05],[.25,0],[0,.5],[-.15,0]].map(p=>new THREE.Vector2(...p)));
      for(const [i,dx]of [-.8,1.3].entries()){
        mesh(`silhouette-${i+1}`,new THREE.ShapeGeometry(silhouette),dark,[dx,.46,1.15]);
        instance(crown,dark,[x+dx,2.05,z+1.15],[.23,.26,.15]);
      }
    }
    label(lm.name,x,7,z,true);
    group.getObjectByName(`label:${lm.name}`).userData.overviewHeight=lm.height+9;
    group.getObjectByName(`label:${lm.name}`).userData.closeHeight=lm.height+1.2;
  }
  const s=data.siteDetails;
  const axis=data.mainAxis, direction=axis.north.map((n,i)=>n-axis.south[i]),axisLength=Math.hypot(...direction);
  const normal=[-direction[1]/axisLength,direction[0]/axisLength];
  const coveredStart=axis.south.map((n,i)=>n+direction[i]*.35);
  strip(coveredStart,axis.north,axis.width+.5,.22,pale,3.25);
  for(let t=.35;t<=1;t+=5/axisLength)for(const side of [-1,1]){
    const p=axis.south.map((n,i)=>n+direction[i]*t+normal[i]*side*(axis.width/2-.2));
    box([p[0],1.6,p[1]],[.4,3.2,.4],pale);
  }
  marker('main-axis-arcade',axis.south,{clearWidth:axis.width});
  const [gx,gz]=data.guardhouse.position;
  box([gx,1.5,gz],[4,3,3.5],pale);box([gx,3.2,gz],[4.5,.3,4],steel);
  box([gx,2,gz+1.8],[3,.85,.12],dark);box([gx,2,gz+1.88],[2.3,.18,.05],blue);
  box([gx+3,1,gz],[.3,2,.3],dark);box([gx+5,1.7,gz],[4,.18,.2],pale);
  marker('guardhouse',data.guardhouse.position,{electronicSign:true,vehicleBarrier:true});
  // North-facing descending ramp, with a visible portal, sidewalls and walking restriction.
  const ramp=s.ramp, [rx,rz]=ramp.north;
  const slope=new THREE.Vector3(rx-ramp.south[0],-1.6,rz-ramp.south[1]);
  instance(unitBox,'#3b5864',[(rx+ramp.south[0])/2,1.05,(rz+ramp.south[1])/2],[4,.16,slope.length()],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),slope.normalize()));
  box([rx,1.25,rz],[5,2.5,.5],dark);box([rx,2.6,rz],[5.6,.3,2],steel);
  for(const side of [-1,1])strip(ramp.south.map((n,i)=>n+(i?0:side*2.3)),ramp.north.map((n,i)=>n+(i?0:side*2.3)),.25,1.2,steel);
  marker('underground-ramp',ramp.position,{pedestrian:false,direction:'north-down'});
  label('地下停車場・禁止行人',ramp.position[0],4,ramp.position[1]);
  const [kx,kz]=s.kitchen.position;
  box([kx,2.8,kz],[4,.25,2],dark);box([kx,1.3,kz],[2.8,2.6,.3],dark);
  for(let i=0;i<3;i++){box([kx+i*1.5-3,1,kz+2],[1.1,1.2,.8],steel);box([kx+i*1.5-3,1,kz+2.45],[.7,.7,.1],dark);}
  box([kx-3,4.5,kz-1],[.7,3,.7],steel);
  const [ex,ez]=s.recycling.position;
  for(let i=0;i<4;i++)box([ex+i*.9,1,ez],[.85,2,1],i%2?blue:dark);
  label('成功環保',ex,4,ez);
  const [fx,fz]=s.figureEight.position;
  // Deliberately only the white figure-eight paint; no use/name label.
  line(Array.from({length:97},(_,i)=>{const t=i/96*Math.PI*2;return [fx+5*Math.sin(t),fz+2.5*Math.sin(2*t)];}),false,.22);
  line(Array.from({length:97},(_,i)=>{const t=i/96*Math.PI*2;return [fx+4.5*Math.sin(t),fz+2.0*Math.sin(2*t)];}),false,.22);
  for(let i=-2;i<=2;i++)line([[fx+i*.7,fz-.15],[fx+i*.7+.3,fz+.05]],false,.23);
  box([fx-8,1.25,fz-2],[4,2.5,2],'#8aa293');
  for(let i=0;i<13;i++)box([fx-9.9+i*.32,1.25,fz-.96],[.04,2.4,.06],'#a8bab1');
  // Sunken courtyards: terrace perimeter, open colonnade, trees and stone furniture.
  for(const court of s.eastCourtyards){
    const c=court.polygon.reduce((a,p)=>a.map((n,i)=>n+p[i]/4),[0,0]);
    surface(court.polygon,'#a9c18e',.10);
    for(let i=0;i<4;i++){
      const a=court.polygon[i],b=court.polygon[(i+1)%4];
      strip(a,b,1.2,.35,steel,.24);
      for(let step=1;step<3;step++)strip(a.map((n,k)=>n+(c[k]-n)*step*.035),b.map((n,k)=>n+(c[k]-n)*step*.035),.6,.16,steel,.18-step*.04);
      for(let k=0;k<4;k++){
        const t=k/3,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
        box([x,1.8,z],[.45,3.6,.45],pale);
      }
      strip(a,b,1.6,.3,pale,3.6);
    }
    instance(cylinder,steel,[c[0],.9,c[1]],[1.1,.18,1.1]);box([c[0],.4,c[1]],[.35,.8,.35],steel);
    for(const dx of [-2,2])instance(cylinder,steel,[c[0]+dx,.4,c[1]],[.5,.8,.5]);
    instance(cylinder,'#a58c6a',[c[0]+4,1.5,c[1]+2],[.35,3,.35]);instance(crown,'#466b3e',[c[0]+4,4.2,c[1]+2],[2,2,2]);
  }
  for(const id of ['B','C']){
    const b=data.buildings.find(b=>b.id===id),q=b.polygon[2];
    for(let i=0;i<5;i++)box([q[0]+i*.3,.12+i*.12,q[1]],[2-i*.15,.25,3],steel);
    box([q[0],1.7,q[1]],[.4,3.4,3],pale);box([q[0]+.25,2.5,q[1]],[.25,1.5,2],steel);
  }
  // Shared court enclosure, two small pickleball divisions, high lighting.
  const fence=(points,height,color)=>{
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for(let y=.4;y<=height;y+=.6)strip(a,b,.035,.04,color,y);
      for(let j=0;j<=Math.ceil(len/.8);j++){
        const t=j/Math.ceil(len/.8);box([a[0]+(b[0]-a[0])*t,height/2,a[1]+(b[1]-a[1])*t],[.04,height,.04],color);
      }
    }
  };
  fence(s.courtsFence,3.5,dark);
  for(const [x,z]of s.courtsFence){box([x,5,z],[.16,10,.16],steel);box([x,10,z],[2,.45,.5],pale);}
  const [a,b]=s.practiceLanes;
  for(let i=0;i<=3;i++)line([a.map((v,k)=>v+(k?i*.9:0)),b.map((v,k)=>v+(k?i*.9:0))],false,.23);
  const small=data.sports.courts.find(c=>c.id==='small-court');
  const mid=(a,b)=>a.map((n,i)=>(n+b[i])/2);
  line([mid(small.polygon[0],small.polygon[3]),mid(small.polygon[1],small.polygon[2])]);
  // Wall plinths remain at the traced positions, with see-through metal above.
  for(const wall of data.walls)for(let i=1;i<wall.points.length;i++){
    const a=wall.points[i-1],b=wall.points[i];fence([a,b],1.35,dark);
    if(b[1]<-40)for(let j=0;j<Math.hypot(b[0]-a[0],b[1]-a[1]);j+=3){const t=j/Math.hypot(b[0]-a[0],b[1]-a[1]);instance(crown,'#466b3e',[a[0]+(b[0]-a[0])*t,.8,a[1]+(b[1]-a[1])*t+1.5],[1,.65,.8]);}
  }
  const db=data.buildings.find(b=>b.id==='D');
  const dr=s.dRamp, dv=new THREE.Vector3(dr.north[0]-dr.south[0],1.2,dr.north[1]-dr.south[1]);
  instance(unitBox,steel,[(dr.south[0]+dr.north[0])/2,.65,(dr.south[1]+dr.north[1])/2],[2,.18,dv.length()],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),dv.normalize()));
  for(const side of [-1,1])beam([dr.south[0]+side,1,dr.south[1]],[dr.north[0]+side,2.2,dr.north[1]],.08,steel);
  const entry=marker('d-first-floor-entrance',dr.north);
  entry.position.y=dr.entrance[1];
  box([dr.entrance[0],dr.entrance[1]+1.3,dr.entrance[2]],[2,2.6,.2],dark,Math.atan2(dr.north[0]-dr.south[0],dr.north[1]-dr.south[1]));
  const gym=data.buildings.find(b=>b.id==='gym'),h=gym.floors*gym.floorHeight;
  const towerBottom=h+(gym.roof.rise??0)+.2;
  for(let i=0;i<3;i++)instance(cylinder,steel,[gym.polygon[0][0]+(gym.polygon[3][0]-gym.polygon[0][0])*(.2+i*.3)+2,towerBottom+1,gym.polygon[0][1]+(gym.polygon[3][1]-gym.polygon[0][1])*(.2+i*.3)],[1,2,1]);

  const [tx,tz]=s.temple.position;
  // Arch, canopy, incense burner, furnace, pavilion and pink village office.
  const arch=s.templeArch,[ax,az]=arch.position;
  const archMarker=marker('temple-arch',arch.position);archMarker.userData={...arch};
  for(const side of [-1,1])box([ax+side*3,2.1,az],[.6,4.2,.6],brick);
  box([ax,arch.height,az],[arch.width,.65,1.5],dark);
  const temple=data.buildings.find(b=>b.id==='temple');
  const roof=marker('temple-roof',temple.position,{type:temple.roof.type,rise:temple.roof.rise});
  // Extend the eaves beyond the walls while retaining the traced footprint.
  const center=new THREE.Vector2(...temple.position);
  const [nw,ne,se,sw]=temple.polygon.map(p=>new THREE.Vector2(...p).sub(center).multiplyScalar(1.16).add(center).toArray());
  const eave=temple.floors*temple.floorHeight+.15,ridge=eave+temple.roof.rise;
  const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])/2);
  const peakWest=midpoint(nw,sw),peakEast=midpoint(ne,se);
  const v2=(p,y)=>new THREE.Vector3(p[0],y,p[1]);
  const roofPlane=(a,b,r1,r2,color)=>{
    const start=v2(a,eave),end=v2(b,eave),highStart=v2(r1,ridge),highEnd=v2(r2,ridge);
    const longitudinal=end.clone().sub(start).normalize();
    const cross=highStart.clone().sub(start).normalize();
    const up=cross.clone().cross(longitudinal).normalize();
    if(up.y<0){up.negate();longitudinal.negate();}
    const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(longitudinal,up,cross));
    const position=start.clone().add(end).add(highStart).add(highEnd).multiplyScalar(.25);
    instance(unitBox,color,position.toArray(),[start.distanceTo(end),.18,start.distanceTo(highStart)],quaternion);
    for(let i=1;i<54;i++){
      const t=i/54,p=start.clone().lerp(end,t).addScaledVector(up,.16),q=highStart.clone().lerp(highEnd,t).addScaledVector(up,.16);
      beam(p.toArray(),q.toArray(),.14,i%3?'#b65d40':'#d47a53');
    }
    for(const t of [.25,.5,.75]){
      const p=start.clone().lerp(highStart,t).addScaledVector(up,.16),q=end.clone().lerp(highEnd,t).addScaledVector(up,.16);
      beam(p.toArray(),q.toArray(),.08,'#a74b35');
    }
    beam(start.toArray(),end.toArray(),.38,'#a83f32');
    // Decorated sloping verge ridges make both gable ends legible.
    for(const [low,high] of [[start,highStart],[end,highEnd]]){
      beam(low.clone().addScaledVector(up,.2).toArray(),high.clone().addScaledVector(up,.2).toArray(),.3,'#d6ad55');
      const tip=low.clone().addScaledVector(cross,-.8);tip.y+=.6;
      beam(low.toArray(),tip.toArray(),.3,'#a83f32');
    }
  };
  roofPlane(nw,ne,peakWest,peakEast,'#ad573d');
  roofPlane(sw,se,peakWest,peakEast,'#bc6749');
  beam(v2(peakWest,ridge+.12).toArray(),v2(peakEast,ridge+.12).toArray(),.42,'#a83f32');
  for(const t of [.25,.5,.75]){
    const p=v2(peakWest,ridge+.42).lerp(v2(peakEast,ridge+.42),t);
    instance(crown,'#d6ad55',p.toArray(),[.4,.55,.4]);
  }
  // Raised ridge tips and forked swallowtails at both short ends.
  const longitudinal=v2(peakEast,0).sub(v2(peakWest,0)).normalize();
  for(const [peak,sign] of [[peakWest,-1],[peakEast,1]]){
    const base=v2(peak,ridge+.05),tip=base.clone().addScaledVector(longitudinal,sign*1.15);tip.y+=1.25;
    beam(base.toArray(),tip.toArray(),.24,'#cfad72');
    for(const side of [-1,1]){
      const fork=tip.clone();fork.x+=side*.55;fork.z+=side*.55;fork.y+=.45;
      beam(tip.toArray(),fork.toArray(),.16,'#cfad72');
    }
  }
  addPhotoTemple(data,api,THREE);
}
