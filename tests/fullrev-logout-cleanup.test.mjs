import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,config} from './fixtures/fullrev.mjs';

function seed(storage,uid){
 const prefix=`ybs:fullrev:round:${config.firebase.projectId}:`;
 const own=[`${prefix}115-g9:5:${uid}`,`${prefix}115-g9:6:${uid}:guest-completed`,`${prefix}115-df:1:${uid}`,
  `${prefix}115-g9:30:${uid}:guest-completed`];
 const keep=[`${prefix}115-g9:5:${uid}-other`,`${prefix}115-g9:5:other-${uid}`,
  `${prefix}115-g9:6:${uid}-other:guest-completed`,`${prefix}115-g9:5:${uid}:unrelated`,
  `ybs:fullrev:round:another-project:115-g9:5:${uid}`,`ybs-old:round:${uid}`,'ybslab:legacy-progress'];
 for(const key of own)storage.setItem(key,key.endsWith('guest-completed')?JSON.stringify({savedAt:1,rounds:[]}):'2');
 for(const key of keep)storage.setItem(key,'synthetic-preserved');
 return {own,keep};
}
for(const guest of [false,true])for(const crossTab of [false,true])test(`${guest?'訪客':'帳密'}${crossTab?'跨分頁':'本頁'}登出清所有活動與過期摘要，精確保留其他 UID／project／舊站`,async()=>{
 const h=await harness();
 await (guest?h.client.login('guest',{cls:'901',seat:1}):h.login());
 const {own,keep}=seed(h.storage,h.auth.currentUser.uid);
 if(crossTab){
  const key=`ybs:fullrev:${config.firebase.projectId}:115-g9:identity`;
  h.shared.setItem(key,'synthetic-logout-from-another-tab');h.events.get('storage')({key});
 }else await h.client.logout();
 assert.equal(h.client.state().profile,null);
 assert.deepEqual(own.filter(key=>h.storage.getItem(key)!==null),[]);
 assert.deepEqual(keep.map(key=>h.storage.getItem(key)),keep.map(()=> 'synthetic-preserved'));
 h.state.uid='synthetic-next';await h.login();assert.equal(h.client.savedRound(5),undefined);
 assert.deepEqual(keep.map(key=>h.storage.getItem(key)),keep.map(()=> 'synthetic-preserved'));
});
