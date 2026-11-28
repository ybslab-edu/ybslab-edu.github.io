import test from 'node:test';
import assert from 'node:assert/strict';
import {validItemHealth} from '../assets/fullrev-item-health.mjs';
import {healthFixture} from './fixtures/fullrev-item-health.mjs';
import {harness,config} from './fixtures/fullrev.mjs';
import {releasePaths} from '../tools/build-fullrev-site.mjs';
const scope={classKey:'c901',activity:5},expected={...scope,course:'115-g9',project:config.firebase.projectId};
test('health projection validates exact scope, numeric bounds and duplicates',()=>{
 assert.ok(releasePaths().includes('assets/fullrev-item-health.mjs'));
 assert.equal(validItemHealth(healthFixture(),expected),true);
 for(const change of [v=>v.sourceProject='other',v=>v.classKey='c902',v=>v.activity=6,v=>v.readCost=211,v=>v.rows.push(v.rows[0]),v=>v.rows[0].wrong=-1,v=>v.rows[0].firstPassRate=2,v=>v.population=61]){
  const v=healthFixture();change(v);assert.equal(validItemHealth(v,expected),false);
 }
});
test('owner client uses one bounded authenticated Worker request; students cannot send health requests',async()=>{
 const h=await harness({fetcher:async(url,init)=>Response.json(healthFixture(JSON.parse(init.body)))});
 await h.client.login('google');const value=await h.client.itemHealth(scope);assert.equal(value.readCost,34);
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,config.workerOrigin+'/item-health');
 assert.equal(h.requests[0].credentials,'omit');assert.equal(h.requests[0].cache,'no-store');
 assert.equal(h.requests[0].headers.Authorization,'Bearer synthetic-token');assert.deepEqual(h.requests[0].body,{course:'115-g9',...scope});
 await h.client.logout();await h.login();await assert.rejects(h.client.itemHealth(scope),{code:'owner-required'});assert.equal(h.requests.length,1);
});
test('health errors are not automatically retried, mismatched replies and late identity responses fail closed',async()=>{
 const h=await harness();await h.client.login('google');
 for(const [error,status,code] of [['health_class_incomplete',503,'health-class-incomplete'],['read_budget',429,'health-read-budget'],['storage_quota',503,'storage-quota']]){
  h.state.fetcher=async()=>Response.json({error},{status});const n=h.requests.length;
  await assert.rejects(h.client.itemHealth(scope),{code});assert.equal(h.requests.length,n+1);
 }
 h.state.fetcher=async()=>Response.json(healthFixture({...scope,classKey:'c902'}));await assert.rejects(h.client.itemHealth(scope),{code:'health-unconfirmed'});
 let resolve;h.state.fetcher=()=>new Promise(r=>resolve=r);const pending=h.client.itemHealth(scope);
 while(!resolve)await new Promise(r=>setTimeout(r,0));await h.client.logout();resolve(Response.json(healthFixture()));
 await assert.rejects(pending,{code:'identity-changed'});
});
