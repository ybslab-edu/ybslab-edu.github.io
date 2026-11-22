// Firebase compat popup loads gapi as a script and communicates through the
// authDomain iframe. accounts.google.com is a popup navigation, not our frame;
// gapi uses script loading/postMessage, not a parent-page Google API fetch.
export function fullrevCsp(policy,config) {
  const directives=new Map(policy.split(';').map(s=>s.trim().split(/\s+/)).filter(([name])=>name).map(([name,...sources])=>[name,sources]));
  for(const name of ['script-src','connect-src','frame-src'])if(!directives.has(name))throw Error('csp_directive_missing:'+name);
  const add=(name,source)=>directives.set(name,[...new Set([...directives.get(name),source])]);
  add('script-src','https://apis.google.com');
  add('connect-src',config.workerOrigin);
  directives.set('frame-src',[`https://${config.firebase.projectId}.firebaseapp.com`]);
  return [...directives].map(([name,sources])=>[name,...sources].join(' ')).join('; ');
}

export function assertFullrevCsp(html,config) {
  const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  if(!policy)throw Error('release_csp_missing');
  const directives=new Map(policy.split(';').map(s=>s.trim().split(/\s+/)).map(([name,...sources])=>[name,sources]));
  for(const [name,sources] of Object.entries({
    'script-src':['https://apis.google.com'],
    'connect-src':[config.workerOrigin,'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com'],
    'frame-src':[`https://${config.firebase.projectId}.firebaseapp.com`]
  }))for(const source of sources)if(!directives.get(name)?.includes(source))throw Error('release_csp_missing_source:'+name+':'+source);
}
