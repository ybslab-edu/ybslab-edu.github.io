import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {workerSource,workerSkip} from './helpers/worker-source.mjs';
import {growth,effectiveRecords,exportRows} from '../assets/fullrev-progress.mjs';
import {createProgressCache} from '../assets/fullrev-progress-cache.mjs';
import {record,snapshot,activities,config,opened,store,harness} from './fixtures/fullrev.mjs';
import {mountGuestLogin,showGuestPending} from '../assets/fullrev-guest.mjs';
import {Element} from './fixtures/activity-dom.mjs';
const xp=vm.runInNewContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8')+';YBSXP');
const options={project:config.firebase.projectId,course:'115-g9',subject:'synthetic-subject',provider:'password',activities};
const guest=(round=0,extra={})=>{const {resultId,uid,sid,...r}=record(round);return {...r,source:'worker-guest-approved',approvalId:'guest-synthetic-'+round,provider:'anonymous',...extra};};
const load=p=>import(pathToFileURL(resolve(workerSource,p)).href);

for(const delta of [-1,0,7*864e5,7*864e5+1])test(`approved guest uses frozen opening and original completion: ${delta} ms`,()=>{
 const row=guest(0,{completedAt:new Date(opened+delta).toISOString(),passedAt:new Date(opened+1).toISOString(),at:new Date(opened+1).toISOString()});
 const result=growth(snapshot([row]),{...options,activities:activities.map(a=>({...a,openedAt:opened+50*864e5}))},xp);
 assert.equal(result.state,'confirmed');assert.equal(result.totalXP,delta>=0&&delta<=7*864e5?15:10);
 assert.equal(result.records[0].provider,'anonymous');assert.equal(exportRows(snapshot([row]),options,xp).at(-1)[6],result.totalXP);
});

test('historical approvals earn pass and one completion bonus; malformed present snapshots and unapproved sources fail closed',()=>{
 const old=Array.from({length:4},(_,round)=>{const r=guest(round);delete r.xpPolicySnapshot;return r;});
 const result=growth(snapshot([...old,...old]),options,xp);assert.equal(result.totalXP,60);assert.equal(result.activities[0].completeXP,20);
 assert.ok(result.activities[0].rounds.every(r=>r.onTimeXP===0&&r.onTimeState==='confirmed'));
 for(const r of [guest(0,{xpPolicySnapshot:null}),guest(0,{xpPolicySnapshot:{openedAt:'invalid'}}),guest(0,{source:'worker-guest-pending'})])
  assert.equal(growth(snapshot([r]),options,xp).state,'unknown');
 assert.equal(growth(snapshot(old),{...options,provider:'anonymous'},xp).totalXP,null,'anonymous session cannot claim permanent account growth');
});

test('formal/legacy precedence and earliest approval tie are independent of page order; reset filters precede selection',()=>{
 const early=guest(0,{approvalId:'a',completedAt:new Date(opened+1).toISOString()}),later=guest(0,{approvalId:'b',completedAt:new Date(opened+2).toISOString()});
 const stale=guest(0,{approvalId:'0',completedAt:new Date(opened).toISOString(),validity:{state:'excluded',reason:'reset'}});
 const formal=record(0,{completedAt:new Date(opened+8*864e5).toISOString()});
 for(const rows of [[early,later,stale],[stale,later,early]])assert.equal(effectiveRecords(snapshot(rows),options).records[0].approvalId,'a');
 for(const rows of [[early,formal],[formal,early]])assert.equal(growth(snapshot(rows),options,xp).totalXP,10);
 for(const rows of [[later,{...later,approvalId:'a'}],[{...later,approvalId:'a'},later]])assert.equal(effectiveRecords(snapshot(rows),options).records[0].approvalId,'a');
 const legacy={schemaVersion:1,source:'legacy-unverified',subject:options.subject,activity:5,round:0,unit:2,unitEpoch:0,roundEpoch:0,provider:'password',
  resultId:'l_'+'a'.repeat(64),displayPolicy:'migration-initial-epochs-v1',completedAt:null,xpPolicySnapshot:{openedAt:new Date(opened).toISOString()},validity:record().validity};
 assert.equal(effectiveRecords(snapshot([early,legacy]),options).records[0].source,'legacy-unverified');
});

test('v1/v2 cold/hot/reload replace guest snapshots and versions without reusing old XP',async()=>{
 const h=await harness(),epoch='e'.repeat(43),lv='l'.repeat(43),rv='v'.repeat(43);let row=guest();
 let n=0;h.model.page=async input=>snapshot([],{progressVersion:2,epoch,resultVersion:rv,resultVersions:{},replace:input.since===null,removed:[],
  legacy:{version:lv,records:input.legacyVersion===lv?null:[],states:[]},guestVersion:String(++n).padStart(43,'g'),guestRecords:[row]});
 await h.login();let s=await h.client.progress({activities});assert.equal(growth(s,options,xp).totalXP,15);
 row=guest(0,{completedAt:new Date(opened+8*864e5).toISOString()});s=await h.client.progress({activities});assert.equal(growth(s,options,xp).totalXP,10);
 h.closePage();const next=h.reopen();await next.restore();s=await next.progress({activities});assert.equal(growth(s,options,xp).totalXP,10);
 row={...row,validity:{...row.validity,state:'excluded',reason:'reset'}};s=await next.progress({activities});assert.equal(growth(s,options,xp).totalXP,0);
 h.model.page=async()=>snapshot([],{guestVersion:'z'.repeat(43),guestRecords:[guest()]});
 s=await next.progress({activities});assert.equal(s.progressVersion,undefined);assert.equal(growth(s,options,xp).totalXP,15);await next.logout();
});

test('guest messages address you and explicitly promise account retention at 17px',()=>{
 const host=new Element('div'),doc={createElement:t=>new Element(t)};
 mountGuestLogin({host,document:doc,login:async()=>{}});
 const notes=host.querySelectorAll('p');assert.match(notes[0].textContent,/老師核可後會存到你的帳號/);assert.equal(notes[0].style.fontSize,'17px');
 showGuestPending({host,document:doc,value:{completed:true,status:'pending',verified:false,counted:false,attemptId:'synthetic_5_0_'+'x'.repeat(43)}});
 assert.match(host.textContent,/老師核可後會存到你的帳號/);assert.equal(host.querySelector('p').style.fontSize,'17px');
});

test('Worker approval -> independent account reads -> growth/export/reset preview use one policy and bounded reads',{skip:workerSkip},async()=>{
 const [{harness,owner,paths,action,PROJECT},{pendingGuest,decision,review},{enableSummaries},{YbsReadModel},{xpOf}]=await Promise.all([
  load('../../tests/ybs-fullrev-fixtures.mjs'),load('../../tests/ybs-guest-review-fixtures.mjs'),load('../../tests/ybs-summary-fixtures.mjs'),
  load('src/formal/read-model.mjs'),load('../../src/integration/ybs-effective.mjs')]);
 const h=await enableSummaries(await harness()),scope={course:'115-g9',classKey:'synthetic-class'},r=await pendingGuest(h);
 await review(h,await decision(h,r.attemptId));
 const identity={uid:'fake-uid-a',provider:'password',email:'cgjh000000@ybslab-edu.github.io',ybsClassKeys:{'115-g9':scope.classKey}};
 const catalog=[{...activities[0],rounds:['一','二','三','四','五']}],opts={...options,project:PROJECT,subject:'synthetic-a',activities:catalog};
 const read=who=>new YbsReadModel({adapter:h.db,project:PROJECT,now:h.now}).execute('progress',who,{...scope,cursor:null,controlVersions:null,progressVersion:2,since:null,legacyVersion:null});
 for(const who of [identity,{...identity,uid:'fake-uid-a2'}]){
  const before=h.db.metrics.reads,page=await read(who);assert.equal(h.db.metrics.reads-before,3);
  const snapshot={...page,records:[...page.records,...page.guestRecords],people:[{subject:'synthetic-a',cls:901,seat:1,provider:'password'}]};
  assert.equal(growth(snapshot,opts,xp).totalXP,15);assert.equal(exportRows(snapshot,opts,xp).at(-1)[6],15);
  assert.equal(xpOf(snapshot.records,{5:{rounds:[0,1,2,3,4]}}).total,15);
 }
 const reset=await h.service.preview(owner,action('reset-round'));assert.equal(reset.summary.xpRemoved,15);
 await h.perform(action('transfer',{toClassKey:'destination',subject:'synthetic-a',cls:902,seat:1}));
 const moved=await new YbsReadModel({adapter:h.db,project:PROJECT,now:h.now}).execute('progress',{...identity,ybsClassKeys:{'115-g9':'destination'}},{...scope,classKey:'destination',cursor:null,controlVersions:null});
 assert.equal(growth({...moved,records:moved.guestRecords},opts,xp).totalXP,15);
 await h.perform(action('reset-round',{classKey:'destination'}));
 const after=await new YbsReadModel({adapter:h.db,project:PROJECT,now:h.now}).execute('progress',{...identity,ybsClassKeys:{'115-g9':'destination'}},{...scope,classKey:'destination',cursor:null,controlVersions:null});
 assert.equal(growth({...after,records:after.guestRecords},opts,xp).totalXP,0);
 const workerCredit=await readFile(resolve(workerSource,'../../src/integration/ybs-credit.mjs'),'utf8');
 assert.equal(await readFile(new URL('../assets/fullrev-credit.mjs',import.meta.url),'utf8'),workerCredit,'the shared selection contract must remain identical');
});

test('owner export keeps approved XP when all account bindings are inactive; anonymous session still has no permanent read',()=>{
 const r=guest(),page=snapshot([r],{people:[{subject:options.subject,cls:901,seat:1,provider:'anonymous'}]});
 assert.equal(exportRows(page,options,xp).at(-1)[6],15);
 assert.equal(growth(page,{...options,provider:'anonymous'},xp).totalXP,null);
 assert.equal(exportRows(snapshot([record(0,{provider:'anonymous'})],{people:page.people}),options,xp).at(-1)[6],'待確認');
});
