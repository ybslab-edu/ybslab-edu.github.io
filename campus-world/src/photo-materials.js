import * as THREE from 'three';

// Original procedural atlas, made locally from the observed materials. No photos
// or remote assets are used. World-space mapping keeps tile sizes consistent.
export function photoMaterials() {
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=256;
  const ctx=canvas.getContext('2d');
  if(ctx.fillRect) {
    let seed=91;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let kind=0;kind<8;kind++) {
      const ox=kind*256;ctx.fillStyle='#c5c5c5';ctx.fillRect(ox,0,256,256);
      for(let i=0;i<9500;i++) {const n=170+Math.floor(random()*65);ctx.fillStyle=`rgb(${n},${n},${n})`;ctx.fillRect(ox+random()*256,random()*256,kind===5?2:1,kind===5?3:1);}
      if([1,2,3,4,6].includes(kind)) {
        const tw=kind===3?128:kind===4?32:kind===6?8:32,th=kind===3?128:kind===4?64:kind===6?256:16;
        for(let y=0;y<256;y+=th)for(let x=0;x<256;x+=tw){
          ctx.strokeStyle=kind===6?'#616161':'#969696';ctx.lineWidth=kind===3?1.3:1;
          ctx.strokeRect(ox+x+.5,y+.5,tw-1,th-1);
          if(kind===4){const n=165+Math.floor(random()*65);ctx.fillStyle=`rgb(${n},${n},${n})`;ctx.fillRect(ox+x+2,y+2,tw-4,th-4);}
        }
      }
    }
  }
  const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.NoColorSpace;atlas.anisotropy=4;
  const cache=new Map();
  function material(kind=0) {
    if(cache.has(kind))return cache.get(kind);
    const m=new THREE.MeshLambertMaterial({color:'#ffffff'});
    m.onBeforeCompile=shader=>{
      shader.uniforms.photoAtlas={value:atlas};shader.uniforms.surfaceKind={value:kind};
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        varying vec3 photoPosition; varying vec3 photoNormal; varying float photoKind;
        uniform float surfaceKind;
        #ifdef USE_INSTANCING
          attribute float instanceSurface;
        #endif`)
        .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
          vec4 photoP=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            photoP=instanceMatrix*photoP; photoKind=instanceSurface;
          #else
            photoKind=surfaceKind;
          #endif
          photoPosition=(modelMatrix*photoP).xyz;
          photoNormal=inverseTransformDirection(transformedNormal,viewMatrix);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 photoPosition; varying vec3 photoNormal; varying float photoKind;
        uniform sampler2D photoAtlas;`)
        .replace('#include <color_fragment>',`#include <color_fragment>
          if(photoKind>0.5){
            vec3 n=abs(normalize(photoNormal));
            vec2 uv=n.y>max(n.x,n.z)?photoPosition.xz:(n.x>n.z?photoPosition.zy:photoPosition.xy);
            float meters=photoKind<2.5?2.0:(photoKind<3.5?2.4:(photoKind<4.5?4.0:3.0));
            vec2 tile=fract(uv/meters);
            vec2 atlasUV=vec2((photoKind+(tile.x*254.0+1.0)/256.0)/8.0,(tile.y*254.0+1.0)/256.0);
            float grain=texture2D(photoAtlas,atlasUV).r;
            diffuseColor.rgb*=grain*1.28;
          }`);
    };
    m.customProgramCacheKey=()=>`photo-surfaces-v1`;
    cache.set(kind,m);return m;
  }
  return {material,atlas};
}
export function surfaceForColor(color) {
  if(['#ecebdd','#f4f1e9','#d2dce0'].includes(color))return 1;
  if(['#bc7655','#b96542','#b77761','#ca7c61','#b77755'].includes(color))return 2;
  if(['#a8bab1','#bdb8a5','#b5b9b9'].includes(color))return 3;
  if(['#b7b7aa','#d7cfbb','#d7ddd8','#eee5ce','#e4d5b7'].includes(color))return 4;
  if(['#a9c18e','#9cbd7f','#a4bd84'].includes(color))return 5;
  if(['#927361','#765d4c'].includes(color))return 6;
  if(['#b5b7ad','#b9b9ac'].includes(color))return 7;
  return 0;
}
