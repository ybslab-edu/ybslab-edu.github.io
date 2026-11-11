import * as THREE from 'three';
import { photoMaterials, surfaceForColor } from './photo-materials.js';
import { addPhotoArchitecture } from './photo-architecture.js';
import { addCorridors } from './corridors.mjs';
import { addSiteDetails } from './site-details.js';
import { buildingFootprints, pointSegmentDistance } from './navigation.mjs';

const Y = new THREE.Vector3(0, 1, 0);

export function createWorld(scene, data) {
  const batches = new Map();
  const finishes=photoMaterials();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const markings = [];
  const metalLines=[],metalColors=[];
  const group = new THREE.Group();
  group.name = 'campus';
  scene.add(group);

  let detailDistance=Infinity;
  const setDetailDistance=value=>{detailDistance=value;};
  function instance(geometry, color, position, scale, quaternion = rotation) {
    // Thin rail balusters become one coloured line batch: a 1px member is
    // more legible than subpixel triangles and avoids thousands of tiny boxes.
    if(geometry===unitBox && [...scale].sort((a,b)=>a-b)[1]<=.085) {
      const axis=scale.indexOf(Math.max(...scale)),colorValue=new THREE.Color(color);
      for(const sign of [-1,1]) {
        const v=new THREE.Vector3();v.setComponent(axis,scale[axis]*sign*.5);v.applyQuaternion(quaternion).add(new THREE.Vector3(...position));
        metalLines.push(...v.toArray());metalColors.push(...colorValue.toArray());
      }
      return;
    }
    const key = geometry.uuid;
    if (!batches.has(key)) batches.set(key, { geometry, colors: [], matrices: [], surfaces: [], distances: [] });
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    batches.get(key).matrices.push(matrix.clone());
    batches.get(key).distances.push(detailDistance);
    batches.get(key).colors.push(color);
    batches.get(key).surfaces.push(surfaceForColor(color));
  }
  function box(position, size, color, angle = 0) {
    instance(unitBox, color, position, size, new THREE.Quaternion().setFromAxisAngle(Y, angle));
  }
  function line(points, closed = false, height = .19) {
    for (let i = 1; i < points.length; i++) markings.push(points[i-1][0], height, points[i-1][1], points[i][0], height, points[i][1]);
    if (closed) markings.push(points.at(-1)[0], height, points.at(-1)[1], points[0][0], height, points[0][1]);
  }
  function rectangle(x, z, w, d) {
    line([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]], true);
  }
  function circle(x, z, radius, start = 0, end = Math.PI * 2) {
    line(Array.from({length: 33}, (_, i) => [x + Math.cos(start + (end-start)*i/32)*radius, z + Math.sin(start + (end-start)*i/32)*radius]));
  }
  function label(text, x, height, z, accent = false) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(150, text.length * 44 + 40); canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(5, 5, canvas.width - 10, 82, 38); ctx.fill();
    ctx.fillStyle = accent ? '#335e4c' : '#3b5864';
    ctx.font = 'bold 43px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, depthTest: false, transparent: true}));
    sprite.position.set(x, height, z); sprite.scale.set(canvas.width / 100 * 6.56, 6.56, 1); sprite.renderOrder = 5;
    sprite.userData.labelRatio = canvas.width / 100;
    sprite.name = `label:${text}`;
    group.add(sprite);
  }

  box([0,-1.8,0], [data.ground.width,3,data.ground.depth], '#b7cba7');
  box([0,-.23,0], [data.ground.width,.3,data.ground.depth], data.ground.color);
  const roadLabels=new Set();
  for (const r of data.roads) {
    for(const [p,q] of r.segments) {
      const dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
      box([(p[0]+q[0])/2,r.height+.02,(p[1]+q[1])/2],[r.width,r.height ? 1.5 : .12,length],r.height ? '#b0b7b4' : '#bbc2bb',angle);
      line([p,q],false,r.height+.8);
      if(r.height) for(let t=.15;t<1;t+=40/length)box([p[0]+dx*t,r.height/2,p[1]+dz*t],[3,r.height,3],'#c7cdc7');
      if(!roadLabels.has(r.name)&&length>45) {
        label(r.name,(p[0]+q[0])/2,r.height+5,(p[1]+q[1])/2);
        group.children.at(-1).userData.context=false;
        roadLabels.add(r.name);
      }
    }
  }
  for(const p of data.plazas) box([p.position[0],.02,p.position[1]], [p.size[0],.06,p.size[1]],p.color);
  // The same data that routes pedestrians also draws the campus walkways.
  const nodeMap = new Map(data.navigation.nodes.map(n => [n.id,n.position]));
  for (const [a,b] of data.navigation.edges) {
    const [p,q] = [nodeMap.get(a),nodeMap.get(b)];
    const dx = q[0]-p[0], dz = q[1]-p[1];
    box([(p[0]+q[0])/2,.08,(p[1]+q[1])/2],[3.2,.09,Math.hypot(dx,dz)],'#eee5ce', Math.atan2(dx,dz));
  }

  function strip(p,q,width,height,color,y=height/2) {
    box([(p[0]+q[0])/2,y,(p[1]+q[1])/2],[width,height,Math.hypot(q[0]-p[0],q[1]-p[1])],color,Math.atan2(q[0]-p[0],q[1]-p[1]));
  }
  for(const path of data.walkways??[])for(let i=1;i<path.points.length;i++)strip(path.points[i-1],path.points[i],path.width,.08,path.color??'#eee5ce',.03);
  for(const wall of data.walls??[])for(let i=1;i<wall.points.length;i++)strip(wall.points[i-1],wall.points[i],wall.width,.45,'#bdb8a5');
  for(const gate of data.sideGates??[]) {
    label(gate.name,gate.position[0],5,gate.position[1]);
    const angle=gate.angle??0;
    const closed=new THREE.Group();closed.name=`gate:${gate.name}`;closed.userData={state:gate.state};group.add(closed);
    for(let i=0;i<=gate.width/.22;i++) {
      const dx=-gate.width/2+i*.22;
      box([gate.position[0]+dx*Math.cos(angle),gate.height/2,gate.position[1]-dx*Math.sin(angle)],[.055,gate.height,.055],'#a8bab1');
    }
    for(const y of [.3,gate.height-.15])box([gate.position[0],y,gate.position[1]],[gate.width,.08,.1],'#a8bab1',angle);
    for(const side of [-1,1])box([gate.position[0]+side*gate.width/2*Math.cos(angle),gate.height/2,gate.position[1]-side*gate.width/2*Math.sin(angle)],[.5,gate.height,.5],'#bdb8a5');
  }

  function surface(points, color, y) {
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(...p)))),Object.assign(finishes.material(surfaceForColor(color)).clone(),{color:new THREE.Color(color),side:THREE.DoubleSide,onBeforeCompile:finishes.material(surfaceForColor(color)).onBeforeCompile}));
    mesh.rotation.x=Math.PI/2;mesh.position.y=y;group.add(mesh);return mesh;
  }
  for(const b of data.buildings) {
    const height=b.floors*b.floorHeight;
    const building=new THREE.Group();building.name=`building:${b.id}`;
    const footprints=buildingFootprints(b);
    building.userData={id:b.id,floors:b.floors,estimated:b.estimated,footprints};group.add(building);
    for(const footprint of footprints) {
      const polygon=footprint;
      const shape=new THREE.Shape(polygon.map(([x,z])=>new THREE.Vector2(x,-z)));
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:b.id==='D'?.24:(b.arcadeHeight??height),bevelEnabled:false,steps:1});
      geometry.rotateX(-Math.PI/2);
      const mesh=new THREE.Mesh(geometry,Object.assign(finishes.material(b.context?0:['kitchen','temple'].includes(b.id)?2:b.id==='A'?2:1).clone(),{color:new THREE.Color(b.context?b.color:b.id==='A'?'#bc9276':['kitchen','temple'].includes(b.id)?'#957a68':'#d8d8cc'),onBeforeCompile:finishes.material(b.context?0:['kitchen','temple'].includes(b.id)?2:b.id==='A'?2:1).onBeforeCompile}));
      building.add(mesh);
      line(polygon,true,height+.05);
      if(!b.context&&b.id!=='D'&&b.id!=='temple'&&b.id!=='gym')polygon.forEach((p,i)=>{
        const q=polygon[(i+1)%polygon.length],dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz);
        if(b.arcadeHeight && !b.polygon.some((a,i)=>pointSegmentDistance([(p[0]+q[0])/2,(p[1]+q[1])/2],a,b.polygon[(i+1)%b.polygon.length])<.001))return;
        // A west end is a white tiled wall, detailed by photo-architecture.
        if(b.id==='A' && pointSegmentDistance([(p[0]+q[0])/2,(p[1]+q[1])/2],b.polygon[0],b.polygon[3])<.001)return;
        const count=Math.floor(length/4),angle=-Math.atan2(dz,dx);
        for(let floor=0;floor<b.floors;floor++) {
          line([p,q],false,(floor+1)*b.floorHeight-.15);
          for(let k=0;k<count;k++) {
            const t=(k+.5)/count;
            const x=p[0]+dx*t,z=p[1]+dz*t,y=(floor+.55)*b.floorHeight;
            const w=b.id==='gym'?1.3:2.5,wh=b.id==='gym'?.9:b.floorHeight*.46;
            box([x,y,z],[w+.18,wh+.18,.28],'#d7ddd8',angle);
            box([x,y,z],[w,wh,.31],'#334b50',angle);
            for(const offset of [-w/6,w/6])box([x+Math.cos(angle)*offset,y,z-Math.sin(angle)*offset],[.055,wh,.34],'#bbc5c2',angle);
            box([x,y+wh*.22,z],[w,.055,.34],'#bbc5c2',angle);
          }
        }
      });
    }
    // A/B/C split footprints share one material; concatenate their extrusions
    // into one draw while preserving the real opening geometry.
    const solids=building.children.filter(o=>o.isMesh);
    if(solids.length>1) {
      const merged=solids[0].geometry.clone();merged.clearGroups();
      for(const name of ['position','normal','uv']) {
        const arrays=solids.map(o=>o.geometry.getAttribute(name).array),all=new Float32Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;
        for(const a of arrays){all.set(a,offset);offset+=a.length;}
        merged.setAttribute(name,new THREE.BufferAttribute(all,name==='uv'?2:3));
      }
      solids[0].geometry=merged;
      for(const mesh of solids.slice(1))building.remove(mesh);
    }
    if(b.arcadeHeight) {
      const shape=new THREE.Shape(b.polygon.map(([x,z])=>new THREE.Vector2(x,-z)));
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.2,height-b.arcadeHeight),bevelEnabled:false});geometry.rotateX(-Math.PI/2);geometry.translate(0,b.arcadeHeight,0);
      building.add(new THREE.Mesh(geometry,Object.assign(finishes.material(b.id==='A'?1:1).clone(),{color:new THREE.Color('#d8d8cc'),onBeforeCompile:finishes.material(1).onBeforeCompile})));
    }
    for(const stair of b.exteriorStairs??[]) {
      // Exterior doorway markers only: stairs themselves remain inside the mass.
      box([stair.position[0],1.3,stair.position[1]],[stair.width,2.6,.35],'#335e4c',stair.angle??0);
    }
    if(b.roof?.type==='gable'||b.roof?.type==='arched') {
      const p=b.polygon, a=p[0],q=p[1],r=p[2],t=p[3];
      const ridge1=[(a[0]+t[0])/2,(a[1]+t[1])/2],ridge2=[(q[0]+r[0])/2,(q[1]+r[1])/2];
      const triangles=[];
      const triangle=(a,b,c)=>triangles.push(...a,...b,...c);
      const low=p=>[p[0],height,p[1]],high=p=>[p[0],height+(b.roof.rise??2),p[1]];
      if(b.roof.type==='arched') {
        for(let i=0;i<16;i++){
          const edge=(left,right,t)=>[left[0]+(right[0]-left[0])*t,height+Math.sin(Math.PI*t)*b.roof.rise,left[1]+(right[1]-left[1])*t];
          const t=i/16,u=(i+1)/16;
          const v0=edge(a,p[3],t),v1=edge(q,r,t),v2=edge(q,r,u),v3=edge(a,p[3],u);
          triangle(v0,v1,v2);triangle(v0,v2,v3);
        }
      } else {
        triangle(low(a),low(q),high(ridge2));triangle(low(a),high(ridge2),high(ridge1));
        triangle(low(t),high(ridge1),high(ridge2));triangle(low(t),high(ridge2),low(r));
        triangle(low(a),high(ridge1),low(t));triangle(low(q),low(r),high(ridge2));
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));geometry.computeVertexNormals();
      const roof=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:'#b8bdba',side:THREE.DoubleSide}));roof.name=b.roof.type==='arched'?'arched-roof':'gable-roof';building.add(roof);
    }
    if(b.label!==false){
      label(b.name,b.position[0],height+7,b.position[1]);
      group.children.at(-1).userData.context=!!b.context;
    }
  }
  addCorridors(data,{box,instance,unitBox,group},THREE);
  function trackPoints(track, inset=0) {
    const [x,z]=track.position,r=track.width/2-inset,straight=(track.depth-track.width)/2,angle=track.angle??0;
    const pts=[];
    for(let side=0;side<2;side++)for(let i=0;i<=36;i++) {
      const a=Math.PI+side*Math.PI+i*Math.PI/36;
      const u=Math.cos(a)*r,v=(side===0?-straight:straight)+Math.sin(a)*r;
      pts.push([x+u*Math.cos(angle)-v*Math.sin(angle),z+u*Math.sin(angle)+v*Math.cos(angle)]);
    }
    return pts;
  }
  function drawTrack(track) {
    surface(trackPoints(track),'#a74f57',.08).name='school-oval-track';
    surface(trackPoints(track,track.lanes*1.4),'#718c59',.10);
    for(let lane=0;lane<=track.lanes;lane++)line(trackPoints(track,lane*1.4),true,.14);
    label(track.name,track.position[0],6,track.position[1],true);
  }
  for(const area of data.outdoorAreas??[]) {
    surface(area.polygon,area.color,area.surface==='paving'?.06:.04).name=`outdoor:${area.id}`;
    if(area.label!==false)label(area.name,area.position[0],4,area.position[1]);
  }
  for(const shelter of data.shelters??[]) {
    const [a,b,c,d]=shelter.polygon, vertices=[];
    for(let i=0;i<64;i++){
      const v=(p,q,t)=>[p[0]+(q[0]-p[0])*t,shelter.height+.28*Math.cos(t*Math.PI*16),p[1]+(q[1]-p[1])*t];
      const t=i/64,u=(i+1)/64,p0=v(a,d,t),p1=v(b,c,t),p2=v(b,c,u),p3=v(a,d,u);
      vertices.push(...p0,...p1,...p2,...p0,...p2,...p3);
      if(i%8===0)for(const top of [p0,p1]){
        const foot=new THREE.Vector3((p0[0]+p1[0])/2,0,(p0[2]+p1[2])/2);
        const direction=new THREE.Vector3(...top).sub(foot);
        const center=foot.clone().add(new THREE.Vector3(...top)).multiplyScalar(.5);
        instance(unitBox,'#a8bab1',center.toArray(),[.15,direction.length(),.15],new THREE.Quaternion().setFromUnitVectors(Y,direction.normalize()));
      }
      if(i%2===0 && t<.4) {
        const p=v(a,d,t),q=v(b,c,t);
        strip([p[0],p[2]],[q[0],q[2]],.10,.06,'#335e4c',.22);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const roof=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:'#a8bab1',side:THREE.DoubleSide}));roof.name=`shelter:${shelter.id}`;roof.userData={zones:shelter.zones};group.add(roof);
    label(shelter.name,shelter.position[0],5,shelter.position[1]);
  }
  if(data.parking)for(const row of data.parking.rows)for(let i=0;i<=row.count;i++) {
    const t=i/row.count, x=row.from[0]+(row.to[0]-row.from[0])*t,z=row.from[1]+(row.to[1]-row.from[1])*t;
    const angle=Math.atan2(row.to[1]-row.from[1],row.to[0]-row.from[0]),dx=-Math.sin(angle)*data.parking.stallSize[1],dz=Math.cos(angle)*data.parking.stallSize[1];
    line([[x,z],[x+dx,z+dz]],false,.21);
  }
  drawTrack(data.sports.track);

  for(const court of data.sports.courts) {
    surface(court.polygon,'#3979b0',.16);line(court.polygon,true,.20);
    label(court.name,court.position[0],4,court.position[1]);
    const [x,z]=court.position;
    if(court.type==='basketball') {
      circle(x,z,2.2);
      const intersections=court.polygon.flatMap((a,i)=>{
        const b=court.polygon[(i+1)%court.polygon.length];
        return (a[1]<=z&&b[1]>z)||(b[1]<=z&&a[1]>z)?[a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1])]:[];
      }).sort((a,b)=>a-b);
      for(const sign of [-1,1]) {
        const bx=sign<0?intersections[0]+.8:intersections.at(-1)-.8,bz=z;
        const hoop=new THREE.Group();hoop.name=`hoop:${court.id}:${sign}`;hoop.position.set(bx,0,bz);hoop.userData.axis='east-west';group.add(hoop);
        box([bx,1.5,bz],[.16,3,.16],'#2c6097');box([bx,3,bz],[.16,1,1.8],'#d7ddd8');box([bx+(sign<0?.10:-.10),3,bz],[.03,.8,1.6],'#527783');circle(bx+(sign<0?.6:-.6),bz,.25);
        rectangle(bx+(sign<0?2.2:-2.2),bz,4.4,3.8);
        circle(bx+(sign<0?4.4:-4.4),bz,1.9,-Math.PI/2,Math.PI/2);
      }
    } else {
      const p=court.polygon[0],q=court.polygon[1];
      line([[x-(q[0]-p[0])*.4,z-(q[1]-p[1])*.4],[x+(q[0]-p[0])*.4,z+(q[1]-p[1])*.4]],false,.22);
    }
  }
  const g=data.gate, [gx,gz]=g.position;
  function gateBox([x,y,z],size,color) {
    const angle=g.angle??0;
    box([gx+x*Math.cos(angle)+z*Math.sin(angle),y,gz-x*Math.sin(angle)+z*Math.cos(angle)],size,color,angle);
  }
  for(const side of [-1,1]) {
    gateBox([side*g.width/2,g.height/2,0],[1.6,g.height,2.8],'#e6ddc6');
    gateBox([side*g.width/2,1,0],[3,2,4],'#bdb8a5');
  }
  for(let i=0;i<8;i++)gateBox([-g.width/2+i*.3,.6,0],[.08,1.2,.65],'#a8bab1');
  label(g.name,gx,g.height+6,gz,true);
  for(let i=0;i<7;i++) gateBox([-7+i*2.4,.055,9],[1.2,.05,7],'#f4ead6');
  addSiteDetails(data,{box,strip,line,circle,instance,cylinder,crown,unitBox,group,label,surface,setDetailDistance});
  addPhotoArchitecture(data,{box,strip,line,circle,instance,cylinder,crown,unitBox,group,surface,finishes});
  const features=data.courtyardFeatures;
  if(features) {
    const stage=features.stage;
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(stage.radius,stage.radius,stage.height,32),new THREE.MeshLambertMaterial({color:'#668c96'}));
    platform.position.set(stage.position[0],stage.height/2+.05,stage.position[1]);platform.name='courtyard-stage';group.add(platform);
    for(const seat of features.seats)for(let i=1;i<seat.points.length;i++) {
      strip(seat.points[i-1],seat.points[i],seat.width,seat.height,'#d7ddd8');
      const p=seat.points[i-1],q=seat.points[i];
      for(let k=0;k<5;k++) {
        const t=k/5;
        box([p[0]+(q[0]-p[0])*t,seat.height+.06,p[1]+(q[1]-p[1])*t],[.3,.12,seat.width],k%2?'#6f9da9':'#c1d5d0');
      }
      box([q[0],.48,q[1]],[1.1,.96,1.1],'#76a3b0');
      instance(crown,'#8eae77',[q[0],1.1,q[1]],[.65,.45,.65]);
    }
    for(const [i,tree] of features.trees.entries()) {
      const [x,z]=tree.position;
      instance(cylinder,'#a58c6a',[x,1.5,z],[.35,3,.35]);
      instance(crown,i%2?'#bda276':'#9dad75',[x,4,z],[1.8,2,1.8]);
    }
  }
  const treePoints = [...data.trees.points];
  for(const row of data.trees.rows) for(let i=0;i<row.count;i++) {
    const t=row.count===1 ? 0 : i/(row.count-1);
    treePoints.push(row.from.map((v,j)=>v+(row.to[j]-v)*t));
  }
  const visibleTrees=treePoints.filter(([x,z])=>!(data.trees.exclusionZones??[]).some(zone=>Math.hypot(x-zone.position[0],z-zone.position[1])<zone.radius));
  visibleTrees.forEach(([x,z],i)=>{
    const size=2.7+(i%4)*.34;
    instance(cylinder,'#a58c6a',[x,1.5,z],[.45,3,.45]);
    instance(crown,'#466b3e',[x,4.9,z],[size*.9,1.8,size*.9]);
    setDetailDistance(65);
    for(let k=0;k<5;k++) {
      const a=k*2.4+i,dx=Math.cos(a)*size*.55,dz=Math.sin(a)*size*.55;
      const branch=new THREE.Vector3(dx,2,dz);
      instance(cylinder,'#655d48',[x+dx*.5,3.2,z+dz*.5],[.13,branch.length(),.13],new THREE.Quaternion().setFromUnitVectors(Y,branch.normalize()));
      instance(crown,['#365837','#466b3e','#537647'][k%3],[x+dx,4.8+(k%3)*.55,z+dz],[size*.77,1.6,size*.72]);
    }
    setDetailDistance(Infinity);
    // A flat disc suggests shade without shadow-map rendering.
    instance(cylinder,'#71825b',[x,.07,z],[size*.9,.02,size*.9]);
  });

  const fineGeometry=new THREE.BufferGeometry();
  fineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(metalLines,3));
  fineGeometry.setAttribute('color',new THREE.Float32BufferAttribute(metalColors,3));
  const fineMetal=new THREE.LineSegments(fineGeometry,new THREE.LineBasicMaterial({vertexColors:true}));
  fineMetal.name='fine-metal-rails';group.add(fineMetal);
  for(const batch of batches.values()) {
    const geometry=batch.geometry.clone();
    geometry.setAttribute('instanceSurface',new THREE.InstancedBufferAttribute(new Float32Array(batch.surfaces),1));
    const mesh = new THREE.InstancedMesh(geometry,finishes.material(0),batch.matrices.length);
    batch.matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,new THREE.Color(batch.colors[i]));});
    mesh.computeBoundingSphere();
    const originals=batch.matrices,colors=batch.colors.map(c=>new THREE.Color(c));
    mesh.userData.updateDistanceLOD=camera=>{
      let count=0;
      originals.forEach((m,i)=>{
        const limit=batch.distances[i];
        if(Number.isFinite(limit)&&((camera.position.x-m.elements[12])**2+(camera.position.y-m.elements[13])**2+(camera.position.z-m.elements[14])**2)>limit*limit)return;
        mesh.setMatrixAt(count,m);mesh.setColorAt(count,colors[i]);geometry.getAttribute('instanceSurface').setX(count,batch.surfaces[i]);count++;
      });
      mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;geometry.getAttribute('instanceSurface').needsUpdate=true;
    };
    group.add(mesh);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(markings,3));
  group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#f6efdb',transparent:true,opacity:.86})));
  return group;
}

export function createWalker() {
  const person = new THREE.Group(); person.name = 'walker';
  const material = color => new THREE.MeshLambertMaterial({color,flatShading:true});
  const shirt = material('#d47751'), trousers=material('#35586a'), skin=material('#f2cf9d');
  const body = new THREE.Mesh(new THREE.BoxGeometry(1,1.4,.65),shirt); body.position.y=1.9; person.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.52,1),skin); head.position.y=3; person.add(head);
  const legs=[], arms=[];
  for(const side of [-1,1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.36,1.1,.4),trousers); leg.position.set(side*.27,.65,0); person.add(leg); legs.push(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.3,1.1,.4),shirt); arm.position.set(side*.7,1.9,0); person.add(arm); arms.push(arm);
  }
  const marker = new THREE.Mesh(new THREE.RingGeometry(1.1,1.5,24),new THREE.MeshBasicMaterial({color:'#258fab',side:THREE.DoubleSide}));
  marker.rotation.x=-Math.PI/2; marker.position.y=.15; person.add(marker);
  person.userData.animate = t => {legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*9+i*Math.PI)*.5;}); arms.forEach((arm,i)=>{arm.rotation.x=-Math.sin(t*9+i*Math.PI)*.5;});};
  return person;
}

export function createRoute(points) {
  const group = new THREE.Group(); group.name='active-route';
  const material = new THREE.MeshBasicMaterial({color:'#249bb9'});
  const segments = new THREE.InstancedMesh(new THREE.CylinderGeometry(.6,.6,1,8),material,Math.max(0,points.length-1));
  const matrix = new THREE.Matrix4();
  for(let i=1;i<points.length;i++) {
    const [p,q]=[points[i-1],points[i]];
    const direction = new THREE.Vector3(q[0]-p[0],0,q[1]-p[1]);
    matrix.compose(new THREE.Vector3((p[0]+q[0])/2,.32,(p[1]+q[1])/2),new THREE.Quaternion().setFromUnitVectors(Y,direction.clone().normalize()),new THREE.Vector3(1,direction.length(),1));
    segments.setMatrixAt(i-1,matrix);
  }
  segments.computeBoundingSphere(); group.add(segments);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(.64,8,6),material,points.length);
  points.forEach(([x,z],i)=>{matrix.makeTranslation(x,.32,z);dots.setMatrixAt(i,matrix);}); dots.computeBoundingSphere(); group.add(dots);
  return group;
}

export function disposeRoute(route) {
  const materials = new Set();
  route.traverse(obj=>{if(obj.isMesh){if(obj.isInstancedMesh)obj.dispose(); obj.geometry.dispose(); materials.add(obj.material);}});
  materials.forEach(m=>m.dispose()); route.removeFromParent();
}
