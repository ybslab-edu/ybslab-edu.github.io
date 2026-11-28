import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,config} from './fixtures/fullrev.mjs';

function seed(h){
 const uid='synthetic-student',prefix=`ybs:fullrev:round:${config.firebase.projectId}:`;
 const removed=[];
 for(const course of ['115-g9','115-df'])for(const activity of [1,6,30]){
  for(const suffix of ['',':guest-completed']){
   const key=`${prefix}${course}:${activity}:${uid}${suffix}`;
   h.storage.setItem(key,suffix?'expired-or-malformed-synthetic-summary':'3');removed.push(key);
  }
 }
 const kept=[
  [`${prefix}115-g9:6:${uid}-other`,'synthetic-other-user'],
  [`${prefix}115-g9:6:other-${uid}:guest-completed`,'synthetic-other-summary'],
  [`ybs:fullrev:round:${config.firebase.projectId}-other:115-g9:6:${uid}`,'synthetic-other-project'],
  ['ybs-old:round','synthetic-old-site'],
  [`ybs:fullrev:${config.firebase.projectId}:other-user`,JSON.stringify({uid:uid+'-other'})]
 ];
 for(const [key,value] of kept)h.storage.setItem(key,value);
 h.shared.setItem('ybs-old:progress','synthetic-old-progress');
 return ()=>{
  for(const key of removed)assert.equal(h.storage.getItem(key),null,key);
  for(const [key,value] of kept)assert.equal(h.storage.getItem(key),value,key);
  assert.equal(h.shared.getItem('ybs-old:progress'),'synthetic-old-progress');
 };
}

for(const reason of ['logout','auth-expired','remote-logout','switch-user','restore-signed-out','logout-before-restore'])
 test(`${reason}: purge all activities and courses for the exact UID, preserving other users/projects and old site`,async()=>{
  const h=await harness();await h.login();const check=seed(h);
  if(reason==='logout')await h.client.logout();
  if(reason==='auth-expired')h.changed(null);
  if(reason==='remote-logout'){
   const key=`ybs:fullrev:${config.firebase.projectId}:115-g9:identity`;
   h.shared.setItem(key,'synthetic-remote-logout');h.events.get('storage')({key});
  }
  if(reason==='switch-user'){
   h.state.uid='synthetic-next';await h.client.login('password','9990002','synthetic-next-password');
   assert.equal(h.client.state().profile.uid,'synthetic-next');
  }
  if(['restore-signed-out','logout-before-restore'].includes(reason)){
   // A dormant tab kept sessionStorage while another tab signed out the shared Auth.
   h.closePage();h.auth.currentUser=null;const reopened=h.reopen();
   if(reason==='restore-signed-out')assert.equal(await reopened.restore(),null);
   else await reopened.logout();
  }
  check();
 });
