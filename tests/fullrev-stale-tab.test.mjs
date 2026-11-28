import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,response,store,config} from './fixtures/fullrev.mjs';

for(const sameAccount of [false,true])test(`stale tab restore preserves the current login and drafts (${sameAccount?'same account, new signal':'different student'})`,async()=>{
 const h=await harness({answerTickets:true,fetcher:async()=>Response.json(response(0,{ticketVersion:1,ticket:'ybs-answer-v1.synthetic-stale-tab'}))});
 let cookie=true;
 h.session.browserSession={isAccount:()=>true,has:()=>cookie,mark:()=>cookie=true,clear:()=>{cookie=false;}};
 await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成舊分頁草稿']);
 const staleStorage=store(new Map(h.storage.map)),oldWork=[...h.shared.map].filter(([key])=>key.startsWith('ybs:fullrev:work:'));
 const stale=h.reopen({storage:staleStorage,events:{addEventListener(){}}});
 await h.client.logout();h.state.uid=sameAccount?'synthetic-student':'synthetic-next';await h.login();
 await h.client.start(5,0);h.client.saveInput(5,0,['合成目前學生草稿']);
 h.shared.setItem(`progress-v2/${config.firebase.projectId}/115-g9/c901/${h.state.uid}/password/synthetic-subject/all`,JSON.stringify({records:[]}));
 const currentUID=h.auth.currentUser.uid,currentWork=[...h.shared.map],currentSession=[...h.storage.map];
 if(!sameAccount)for(const [key,value] of oldWork)h.shared.setItem(key,value);
 assert.equal(await stale.restore(),null);
 assert.equal(h.auth.currentUser?.uid,currentUID);
 assert.equal(cookie,true);
 assert.deepEqual([...h.shared.map],currentWork);
 assert.deepEqual([...h.storage.map],currentSession);
 assert.equal(stale.state().profile,null);assert.equal(stale.savedRound(5),undefined);
 assert.equal(staleStorage.getItem(`ybs:fullrev:${config.firebase.projectId}:115-g9`),null);
 assert.deepEqual(h.client.loadInput(5,0),['合成目前學生草稿']);
 // Once its own stale snapshot is gone, the tab can restore the current student.
 assert.equal((await stale.restore()).uid,currentUID);
});
