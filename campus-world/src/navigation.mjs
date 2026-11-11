// An undirected graph, with Euclidean edge lengths in scene metres.
export function shortestPath(network, start, goal) {
  const nodes = new Map(network.nodes.map(n => [n.id, n.position]));
  if (!nodes.has(start) || !nodes.has(goal)) throw new Error('路網節點不存在');
  const adjacency = new Map([...nodes.keys()].map(id => [id, []]));
  for (const [a, b] of network.edges) {
    if (!nodes.has(a) || !nodes.has(b)) throw new Error('路網連線端點不存在');
    const weight = Math.hypot(...nodes.get(a).map((v, i) => v - nodes.get(b)[i]));
    adjacency.get(a).push([b, weight]);
    adjacency.get(b).push([a, weight]);
  }
  const distances = new Map([...nodes.keys()].map(id => [id, Infinity]));
  const previous = new Map();
  const pending = new Set(nodes.keys());
  distances.set(start, 0);
  while (pending.size) {
    let current = null;
    for (const id of pending) {
      if (current === null || distances.get(id) < distances.get(current)) current = id;
    }
    if (distances.get(current) === Infinity) break;
    pending.delete(current);
    if (current === goal) break;
    for (const [next, weight] of adjacency.get(current)) {
      const candidate = distances.get(current) + weight;
      if (candidate < distances.get(next)) {
        distances.set(next, candidate);
        previous.set(next, current);
      }
    }
  }
  if (!Number.isFinite(distances.get(goal))) return null;
  const ids = [goal];
  while (ids[0] !== start) ids.unshift(previous.get(ids[0]));
  return { ids, points: ids.map(id => [...nodes.get(id)]), distance: distances.get(goal) };
}

// Clamp to the final point and skip zero-length edges to avoid NaN on arrival.
export function pointAlongPath(points, distance) {
  if (!points.length) throw new Error('路徑沒有座標');
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > 0 && remaining < length - 1e-10) {
      const t = remaining / length;
      return { position: a.map((v, j) => v + (b[j] - v) * t), direction: [b[0] - a[0], b[1] - a[1]] };
    }
    remaining -= length;
  }
  const last = points.at(-1), before = points.at(-2) ?? last;
  return { position: [...last], direction: [last[0] - before[0], last[1] - before[1]] };
}

// Polygon coordinates use east x / south z, in metres.
export function buildingFootprints(building) {
  if (building.solidFootprints) return building.solidFootprints;
  if (building.polygon) return [building.polygon];
  const [x,z]=building.position;
  const rectangles=[{x,z,width:building.width,depth:building.depth}, ...(building.wings ?? []).map(w=>({x:x+w.offset[0],z:z+w.offset[1],width:w.width,depth:w.depth}))];
  return rectangles.map(r=>[
    [r.x-r.width/2,r.z-r.depth/2],[r.x+r.width/2,r.z-r.depth/2],
    [r.x+r.width/2,r.z+r.depth/2],[r.x-r.width/2,r.z+r.depth/2],
  ]);
}
export function pointInPolygon(p, polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function pointSegmentDistance(p,a,b) {
  const dx=b[0]-a[0], dz=b[1]-a[1], l=dx*dx+dz*dz;
  const t=l ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
export function segmentsIntersect(a,b,c,d) {
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),x=cross(c,d,b);
  if(((u>0&&v<0)||(u<0&&v>0)) && ((w>0&&x<0)||(w<0&&x>0))) return true;
  return [[c,a,b,u],[d,a,b,v],[a,c,d,w],[b,c,d,x]].some(([p,q,r,n])=>Math.abs(n)<1e-8 && pointSegmentDistance(p,q,r)<1e-8);
}
export function segmentHitsPolygon(a,b,polygon,clearance=0) {
  if(pointInPolygon(a,polygon)||pointInPolygon(b,polygon))return true;
  return polygon.some((c,i)=>{
    const d=polygon[(i+1)%polygon.length];
    return segmentsIntersect(a,b,c,d) || Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b))<=clearance;
  });
}
