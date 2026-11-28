import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,response,opened,config} from './fixtures/fullrev.mjs';
import {WORK_TTL,createWorkStore} from '../assets/fullrev-work-store.mjs';
import {mountTicketNotice} from '../assets/fullrev-ticket-notice.mjs';
import {createAccountSession} from '../assets/fullrev-account-session.mjs';
import {Element} from './fixtures/activity-dom.mjs';
const start=opened+864e5,minute=60000;

for(const ttl of [20*minute,5*minute])test(`Worker expiresAt drives warning and expiry without extending TTL (${ttl/minute} minutes)`,async()=>{
 const jobs=[],expiresAt=new Date(start+ttl).toISOString();
 const h=await harness({answerTickets:true,deadlineSchedule:(fn,ms)=>{const job={fn,ms};jobs.push(job);return job;},deadlineCancel:job=>{if(job)job.cancelled=true;},
  fetcher:async()=>Response.json(response(0,{expiresAt,ticketVersion:1,ticket:'ybs-answer-v1.synthetic-deadline'}))});
 const body=new Element('body');mountTicketNotice(h.client,{body,createElement:tag=>new Element(tag)});
 await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成草稿']);
 assert.equal(h.client.state().ticketTiming.state,'active');assert.equal(jobs.at(-1).ms,ttl-2*minute);
 h.advance(ttl-2*minute-1);h.events.get('focus')();assert.equal(h.client.state().ticketTiming.state,'active');
 h.advance(1);jobs.at(-1).fn();assert.equal(h.client.state().ticketTiming.state,'warning');
 assert.match(body.textContent,/你的.*2 分鐘/);assert.equal(jobs.at(-1).ms,2*minute);
 const before=h.requests.length;
 h.advance(2*minute);jobs.at(-1).fn();assert.equal(h.client.state().status,'restart-required');assert.equal(h.client.state().ticketTiming.state,'expired');
 assert.match(body.textContent,/你的作答票已過期.*草稿已清除.*重新開始/);
 assert.equal(h.client.state().pending,false);assert.equal(h.client.savedRound(5),undefined);
 assert.equal([...h.shared.map.values()].some(v=>/synthetic-deadline|合成草稿/.test(v)),false);
 assert.equal([...h.storage.map.values()].some(v=>/synthetic-deadline|合成草稿/.test(v)),false);
 await h.client.retry();assert.equal(h.requests.length,before);
 await h.client.logout();assert.equal(body.querySelector('#fullrev-ticket-notice').hidden,true);
});

test('persistent work is bounded by 20 minutes and expiresAt, including exact boundary and expired session draft restore',async()=>{
 assert.equal(WORK_TTL,20*minute);
 const h=await harness({answerTickets:true,fetcher:async()=>Response.json(response(0,{expiresAt:new Date(start+20*minute).toISOString(),ticketVersion:1,ticket:'ybs-answer-v1.synthetic-expiry'}))});
 await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成舊草稿']);
 h.advance(10*minute);assert.equal(h.client.saveInput(5,0,['合成舊草稿']),true);
 h.advance(10*minute-1);const work=createWorkStore({shared:h.shared,project:config.firebase.projectId,course:'115-g9',now:()=>start+20*minute-1});
 assert.equal(Object.keys(work.read(h.auth.currentUser.uid)).length,1);
 h.advance(1);const client=h.reopen();await client.restore();
 assert.equal(client.savedRound(5),undefined);assert.equal(client.state().ticketTiming.state,'expired');
 assert.ok([...h.shared.map.values(),...h.storage.map.values()].every(v=>!v.includes('合成舊草稿')&&!v.includes('synthetic-expiry')));
});

test('deadline cancels pending retry and ignores a late response; page focus catches sleeping tab expiry',async()=>{
 const h=await harness({answerTickets:true,fetcher:async()=>Response.json(response(0,{expiresAt:new Date(start+20*minute).toISOString(),ticketVersion:1,ticket:'ybs-answer-v1.synthetic-late'}))});
 await h.login();await h.client.start(5,0);
 let release;h.state.fetcher=()=>new Promise(resolve=>{release=resolve;});const answering=h.client.answer(5,0,7);
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 h.advance(20*minute);h.events.get('focus')();
 release(Response.json(response(1,{ticketVersion:1,ticket:'ybs-answer-v1.synthetic-too-late'})));
 await assert.rejects(answering,{code:'ticket-expired'});assert.equal(h.client.state().pending,false);assert.equal(h.client.savedRound(5),undefined);
 assert.ok([...h.shared.map.values(),...h.storage.map.values()].every(v=>!v.includes('synthetic-too-late')));
});

test('immediate next login queued after logout succeeds and never inherits previous drafts',async()=>{
 const h=await harness();await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成前一位草稿']);
 const leaving=h.client.logout();h.state.uid='synthetic-next';const entering=h.client.login('password','9990002','synthetic-password');
 await leaving;assert.equal((await entering).uid,'synthetic-next');assert.equal(h.client.savedRound(5),undefined);
 assert.ok([...h.shared.map.values(),...h.storage.map.values()].every(v=>!v.includes('合成前一位草稿')));
});

test('Google and anonymous guest retain SESSION; blocked browser cookie leaves no account signed in',async()=>{
 for(const kind of ['google','owner','guest']){
  const h=await harness(),persist=[];h.auth.setPersistence=async value=>persist.push(value);
  await h.client.login(kind,kind==='guest'?{cls:'901',seat:1}:undefined);
  assert.deepEqual(persist,['session']);
 }
 const h=await harness();h.session.browserSession=createAccountSession({document:{get cookie(){return '';},set cookie(value){}},location:{protocol:'https:'},project:config.firebase.projectId});
 await assert.rejects(h.login(),{code:'browser-cookie-required'});assert.equal(h.auth.currentUser,null);assert.equal(h.client.state().profile,null);
});

test('distant expiresAt cannot overflow a native timer into repeated immediate callbacks',async()=>{
 const jobs=[],h=await harness({answerTickets:true,deadlineSchedule:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},
  fetcher:async()=>Response.json(response(0,{ticketVersion:1,ticket:'ybs-answer-v1.synthetic-distant'}))});
 await h.login();await h.client.start(5,0);assert.equal(jobs.at(-1).ms,WORK_TTL);
 assert.equal(h.client.state().ticketTiming.state,'active');
});

test('a suspended tab checks the shared identity on focus even before its storage event arrives',async()=>{
 const h=await harness({answerTickets:true,fetcher:async()=>Response.json(response(0,{expiresAt:new Date(start+20*minute).toISOString(),ticketVersion:1,ticket:'ybs-answer-v1.synthetic-old-tab'}))});
 await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成舊分頁草稿']);
 h.shared.setItem(`ybs:fullrev:${config.firebase.projectId}:115-g9:identity`,'synthetic-new-person');h.events.get('focus')();
 assert.equal(h.client.state().profile,null);
 assert.ok([...h.shared.map.values(),...h.storage.map.values()].every(v=>!v.includes('合成舊分頁草稿')&&!v.includes('synthetic-old-tab')));
});
