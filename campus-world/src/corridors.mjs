// Exterior bridges only; the pedestrian tour graph remains independent.
export function corridorLevels(data, corridor) {
  const buildings=corridor.buildings.map(id=>data.buildings.find(b=>b.id===id));
  const count=Math.min(corridor.maxFloor??Infinity,...buildings.map((b,j)=>corridor.floorHeights?.[j] ? Infinity : b.floors));
  return Array.from({length:count},(_,i)=>({floor:i+1,heights:buildings.map((b,j)=>i*(corridor.floorHeights?.[j]??b.floorHeight))}));
}

export function addCorridors(data,{box,instance,unitBox,group},THREE) {
  for(const corridor of data.corridors??[]) {
    const [p,q]=corridor.endpoints,dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz);
    const normal=[dz/length,-dx/length];
    const root=new THREE.Group();root.name=`corridor:${corridor.id}`;
    root.userData={...corridor,levels:corridorLevels(data,corridor)};group.add(root);
    const slab=(a,b,width,thickness,color)=>{
      const direction=new THREE.Vector3(dx,b-a,dz),span=direction.length();
      const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction.normalize());
      // Offset perpendicular to the sloping slab so its top meets both floor elevations.
      const up=new THREE.Vector3(0,1,0).applyQuaternion(quaternion).multiplyScalar(thickness/2);
      instance(unitBox,color,[(p[0]+q[0])/2-up.x,(a+b)/2-up.y,(p[1]+q[1])/2-up.z],[width,thickness,span+.4],quaternion);
    };
    const brick=corridor.style==='brick-colonnade',color=brick?'#bc7655':'#f4f1e9';
    const levels=root.userData.levels;
    const longitudinal=(a,b,n,height,thickness,tint)=>{
      const direction=new THREE.Vector3(dx,b-a,dz);
      instance(unitBox,tint,[(p[0]+q[0])/2+normal[0]*n,(a+b)/2-height/2,(p[1]+q[1])/2+normal[1]*n],
        [thickness,height,direction.length()+.4],new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction.normalize()));
    };
    for(const {floor,heights:[a,b]} of levels) {
      slab(a,b,corridor.width,.24,brick?'#b96542':'#ecebdd');
      // Four white open frames; the orange arcade's sole ceiling is its terrace.
      const next=levels[floor]?.heights??[a+3.6,b+3.6];
      if(!brick && floor===levels.length)slab(next[0],next[1],corridor.width+.5,.2,color);
      for(const side of [-1,1]) {
        const n=side*(corridor.width/2-.1),offset=normal.map(v=>v*n);
        if(!brick || floor===1) {
          const divisions=brick?Math.ceil(length/4.8):1;
          for(let i=0;i<=divisions;i++) {
            const t=i/divisions,y=a+(b-a)*t,top=next[0]+(next[1]-next[0])*t;
            box([p[0]+dx*t+offset[0],(y+top)/2,p[1]+dz*t+offset[1]],[brick?.50:.60,top-y,brick?.50:.60],color);
          }
          longitudinal(next[0],next[1],n,brick?.50:.52,brick?.50:.58,color);
        }
        // No opaque upper parapets: balusters and narrow handrails are added
        // by photo-architecture. This preserves the view through all stories.
      }
    }
  }
}
