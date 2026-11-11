import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { updateLabels } from './labels.js';
import { shortestPath, pointAlongPath } from './navigation.mjs';
import { createWorld, createWalker, createRoute, disposeRoute } from './world.js';

const $ = id => document.getElementById(id);
const status = $('status');

async function init() {
  const response = await fetch('./data/campus.json');
  if (!response.ok) throw new Error('校園資料載入失敗');
  const data = await response.json();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bed4e3');
  const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.setSize(innerWidth,innerHeight);
  renderer.domElement.setAttribute('aria-label','3D 校園：拖曳旋轉，滾輪或雙指縮放');
  $('world').appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.5,5000);
  scene.add(new THREE.HemisphereLight('#ffffff','#78806e',1.65));
  const sun = new THREE.DirectionalLight('#fff0d7',2.0); sun.position.set(-80,160,70); scene.add(sun);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor=.09;
  controls.minDistance=8; controls.maxDistance=3000;
  controls.maxPolarAngle=Math.PI*.465;
  controls.target.fromArray(data.view.target);
  const campus = createWorld(scene,data);
  const labels = campus.children.filter(child=>child.isSprite);
  const walker = createWalker(); scene.add(walker);
  const startNode = data.navigation.nodes.find(n=>n.id===data.navigation.start);
  walker.position.set(startNode.position[0],0,startNode.position[1]);
  let active=null, route=null, travelled=0, dirty=true, previous=0, renderAt=0;
  let completed=false,slowFrames=0;
  const followOffset=new THREE.Vector3(34,43,48);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let viewMode="campus";
  function frameView() {
    const view=data.view;
    // Consume and clear orbit momentum before replacing the view; otherwise
    // an overview reset can keep moving and redrawing on a slow GPU.
    const damping=controls.enableDamping;controls.enableDamping=false;
    controls.update();controls.enableDamping=damping;
    const mobile=innerWidth<=700;
    const base=new THREE.Vector3(...view.position).sub(new THREE.Vector3(...view.target));
    if (mobile) {
      const direction=base.clone().normalize();
      const right=new THREE.Vector3(direction.z,0,-direction.x).normalize();
      const vertical=new THREE.Vector3().crossVectors(direction,right);
      const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      let distance=base.length();
      for(const x of [view.bounds.min[0],view.bounds.max[0]]) for(const z of [view.bounds.min[1],view.bounds.max[1]]) {
        const corner=new THREE.Vector3(x,0,z).sub(new THREE.Vector3(...view.target));
        distance=Math.max(distance,Math.abs(corner.dot(right))/(tanV*camera.aspect*.9)+corner.dot(direction),Math.abs(corner.dot(vertical))/(tanV*.5)+corner.dot(direction));
      }
      base.setLength(distance);
    }
    camera.position.copy(base).add(new THREE.Vector3(...view.target));
    controls.target.fromArray(view.target);
    camera.setViewOffset(innerWidth,innerHeight,mobile ? 0 : -innerWidth*.105,mobile ? innerHeight*.035 : -innerHeight*.015,innerWidth,innerHeight);
    controls.update(); dirty=true;
  }
  function stop(message) {
    active=null; $('stop').disabled=true;
    walker.userData.animate(0); dirty=true;
    if(message) status.textContent=message;
  }
  function reset() {
    viewMode='campus';
    stop('選好目的地，從校門開始探索'); completed=false;
    if(route){disposeRoute(route);route=null;}
    walker.position.set(...[startNode.position[0],0,startNode.position[1]]);
    frameView();
  }
  $('destination').replaceChildren(...data.navigation.destinations.map(d=>{
    const option=document.createElement('option'); option.value=d.id; option.textContent=d.name; return option;
  }));
  $('destination').disabled=false; $('start').disabled=false; $('overview').disabled=false;
  $('destination').addEventListener('change',()=>{
    stop('目的地已變更，按「開始帶路」由校門出發');
    completed=false;
    if(route){disposeRoute(route);route=null;}
  });
  $('start').addEventListener('click',()=>{
    try {
      const destination=data.navigation.destinations.find(d=>d.id===$('destination').value);
      const path=shortestPath(data.navigation,data.navigation.start,destination.node);
      if(!path){stop('這個目的地尚未連通，請選擇其他地點');return;}
      if(route) disposeRoute(route);
      route=createRoute(path.points);scene.add(route);
      viewMode='campus';
      active={...path,name:destination.name}; travelled=0; completed=false;
      walker.position.set(path.points[0][0],0,path.points[0][1]);
      $('stop').disabled=false;
      status.textContent=`前往${active.name}・約 ${Math.round(active.distance)} 公尺（概估）${destination.id==='temple'?'・由校門出，沿校外人行道；北二門關閉':''}`;
      controls.update();
      camera.clearViewOffset();
      camera.position.copy(walker.position).add(followOffset);
      controls.target.copy(walker.position).add(new THREE.Vector3(0,1,0));
      controls.update();dirty=true;
    } catch(error) {stop(error.message);}
  });
  $('stop').addEventListener('click',()=>stop('已停止，可自由查看或重新從校門出發'));
  $('overview').addEventListener('click',reset);
  // Taking camera control pauses the tour immediately, so drag never fights follow.
  controls.addEventListener('start',()=>{if(active)stop('已停止跟隨，可自由查看校園');});
  controls.addEventListener('change',()=>{dirty=true;});
  window.addEventListener('resize',()=>{
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
    renderer.setSize(innerWidth,innerHeight);
    camera.aspect=innerWidth/innerHeight;
    if(active) {camera.clearViewOffset();camera.updateProjectionMatrix();}
    else frameView();
    dirty=true;
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();stop('3D 畫面暫時中斷，請重新整理頁面');
  });
  function animate(now) {
    requestAnimationFrame(animate);
    const dt=previous ? Math.min((now-previous)/1000,.1) : 0; previous=now;
    if(document.hidden) return;
    if(active) {
      travelled=Math.min(active.distance,travelled+dt*data.navigation.walkingSpeed);
      const sample=pointAlongPath(active.points,travelled);
      walker.position.set(sample.position[0],0,sample.position[1]);
      walker.rotation.y=Math.atan2(sample.direction[0],sample.direction[1]);
      if(!reducedMotion) walker.userData.animate(travelled/data.navigation.walkingSpeed);
      const nextTarget=walker.position.clone().add(new THREE.Vector3(0,1,0));
      const delta=nextTarget.clone().sub(controls.target);
      camera.position.add(delta);controls.target.copy(nextTarget);
      dirty=true;
      if(travelled>=active.distance){const name=active.name;completed=true;stop(`已抵達${name}，歡迎自由探索`);}
    }
    controls.update();
    // Render on demand while idle; cap walking / damping renders at 30 fps.
    if(dirty && now-renderAt>=1000/30) {
      updateLabels({labels,camera,target:controls.target,width:innerWidth,height:innerHeight,data,
        buildings:campus.children.filter(child=>child.name.startsWith('building:')),
        reserved:[...document.querySelectorAll('.brand,.edition,.intro,.guide,.view-tools,#compass,.attribution')]
          .filter(element=>element.getClientRects().length).map(element=>element.getBoundingClientRect())});
      const north=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion.clone().invert());
      $('compass-arrow').style.transform=`rotate(${Math.atan2(north.x,north.y)}rad)`;
      // Include slow active frames above 1.5s in DPR adaptation. A long
      // idle interval alone is not evidence that rendering is slow.
      campus.traverse(o=>o.userData.updateDistanceLOD?.(camera));
      const renderStart=performance.now();
      renderer.render(scene,camera);
      const gap=now-renderAt;
      const slow=performance.now()-renderStart>90 || (renderAt>0&&gap>90&&(gap<1500||active||controls.autoRotate));
      slowFrames=slow?slowFrames+1:0;
      if(slowFrames>=3 && renderer.getPixelRatio()>.5) {
        renderer.setPixelRatio(Math.max(.5,renderer.getPixelRatio()*.7));slowFrames=0;
      }
      dirty=false;renderAt=now;
    }
  }
  reset(); requestAnimationFrame(animate);
  // Read-only inspection used by the local acceptance script; no personal data.
  window.campusDebug={scene,camera,renderer,controls,data,get state(){return {viewMode,active:active?.name ?? null,travelled,completed,walker:walker.position.toArray(),path:active?.ids ?? []};}};
}
init().catch(error=>{
  status.textContent='校園暫時無法載入';
  const note=document.createElement('p');note.className='error';note.setAttribute('role','alert');
  note.textContent=`${error.message}。請確認瀏覽器支援 WebGL，並以本機 HTTP 伺服器開啟。`;
  document.body.appendChild(note);
  console.error(error);
});
