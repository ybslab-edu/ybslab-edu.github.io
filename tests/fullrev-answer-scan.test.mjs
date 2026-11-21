import test from 'node:test';
import assert from 'node:assert/strict';
import {scanPrivateAnswers} from '../tools/scan-private-answers.mjs';
import {buildSite} from '../tools/build-fullrev-site.mjs';
import {config} from './fixtures/fullrev.mjs';
test('release command always requires private sources even when CI acceptance is skipped',async()=>{
 await assert.rejects(buildSite({output:'/tmp/unused-pr8',config:{...config,readModelModule:'/assets/fullrev-read-model.mjs'}}),/worker_source_required/);
});
test('normalized private arrays catch numeric/string elements, whitespace and serialized arrays',()=>{
 const answers=[[17,29,43,61],[7,19],'短答案',37];
 for(const value of ['const leaked=[17,29,43,61]','const leaked=["17", "29", "43", "61"]',"const leaked=['17', '29', '43', '61']",'const leaked="[17,29,43,61]"','const answers=[7,19]','const leaked="短答案"','const answer=37']){
  assert.throws(()=>scanPrivateAnswers(value,answers),/release_private/);
 }
 assert.doesNotThrow(()=>scanPrivateAnswers('const size=[7,19]; const seats=[1,2,3]; const title="第 37 題"; const label="短";',answers));
});
