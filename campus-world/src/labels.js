import * as THREE from 'three';

const raycaster=new THREE.Raycaster();
const overlaps=(a,b)=>a.left<b.right+3&&a.right>b.left-3&&a.top<b.bottom+3&&a.bottom>b.top-3;

// Overview prioritizes landmark labels. Close views show local labels
// only, fading from 30 to 50 scene metres, with building and UI occlusion.
export function updateLabels({labels,camera,target,width,height,data,buildings=[],reserved=[]}) {
  const close=camera.position.distanceTo(target)<100;
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  camera.updateMatrixWorld();
  for(const building of buildings)building.updateWorldMatrix(true,true);
  for(const label of labels) {
    if(label.userData.overviewHeight!==undefined)label.position.y=close ? label.userData.closeHeight : label.userData.overviewHeight;
    const distance=camera.position.distanceTo(label.position);
    const minHeight=26*distance*2*tan/height;
    const size=Math.min(Math.max(6.56,minHeight),minHeight*36/26);
    label.scale.set(size*label.userData.labelRatio,size,1);
    label.material.opacity=close ? THREE.MathUtils.clamp((50-distance)/20,0,1) : 1;
    label.material.depthTest=close;
    label.visible=false;
  }
  const occupied=close ? [...reserved] : [];
  const priority=label=>data.landmarks?.some(l=>label.name===`label:${l.name}`) ? -1 : data.roads.some(r=>label.name===`label:${r.name}`)||label.name==='label:校門' ? 0 : data.buildings.some(b=>label.name===`label:${b.name}`) ? 1 : 2;
  for(const label of [...labels].sort((a,b)=>priority(a)-priority(b))) {
    if(label.material.opacity===0)continue;
    const screen=label.position.clone().project(camera);
    if(Math.abs(screen.x)>1||Math.abs(screen.y)>1||Math.abs(screen.z)>1)continue;
    if(close) {
      const direction=label.position.clone().sub(camera.position);
      raycaster.set(camera.position,direction.clone().normalize());
      raycaster.far=direction.length();
      if(raycaster.intersectObjects(buildings,true).length)continue;
    }
    const distance=label.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const size=label.scale.y*height/(-distance*2*tan);
    const labelWidth=size*label.userData.labelRatio;
    const x=(screen.x+1)*width/2,y=(1-screen.y)*height/2;
    const halfHeight=size*.5;
    const rect={left:x-labelWidth/2,right:x+labelWidth/2,top:y-halfHeight,bottom:y+halfHeight};
    label.userData.screenRect=rect;
    label.visible=!occupied.some(r=>overlaps(rect,r));
    if(label.visible)occupied.push(rect);
  }
}
