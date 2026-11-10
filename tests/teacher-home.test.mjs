import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/index.html');
test('教師首頁四類保留既有工具、首頁連結及本機正式工具入口',()=>{
  for(const [id,title] of [['student-records','學生紀錄'],['questions-activities','題目與活動'],['course-settings','課程設定'],['other-tools','其他工具']]){
    assert.match(html,new RegExp('href="#'+id+'"'));
    assert.match(html,new RegExp('id="'+id+'"[\\s\\S]*?<h2[^>]*>'+title+'</h2>'));
  }
  for(const id of ['cloud-login','cloud-read','cloud-logout','cloud-export','cloud-status','cloud-class','cloud-table','health-class','health-status','health-table','legacy-panel','legacy-msg','b-legacy-export','dlmsg'])assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
  for(const href of ['../../','../../115-df/teacher/','https://class-score-86020.web.app'])assert.ok(html.includes('href="'+href+'"'));
  assert.ok(existsSync(new URL('../115-df/teacher/index.html',import.meta.url)));
  assert.ok(read('lab/login-test/index.html').includes('https://class-score-86020.web.app'));
  assert.ok(!html.includes('../me/me.css'));
  assert.doesNotMatch(html,/<(?:input|button)[^>]*(?:switch|checkbox)/);
});
test('開放摘要沿用設定與日期，課程未開設優先於提早開放',()=>{
  const context=vm.createContext({location:{pathname:'/115-g9/teacher/'}});
  for(const path of ['assets/curriculum.js','assets/activities.js','assets/lock.js'])vm.runInContext(read(path),context);
  const data=vm.runInContext(`COURSES.map(c=>({id:c.id,open:c.open,count:ACTIVITIES.filter(a=>a.course===c.id&&c.open&&isActivityOpen(a,0)).length}))`,context);
  assert.equal(data[0].count,4);assert.equal(data[1].open,false);assert.equal(data[1].count,0);
  const script=read('assets/teacher-home.js');
  assert.match(script,/course.open && isActivityOpen/);
  assert.match(script,/DOMContentLoaded/);
  assert.doesNotMatch(script,/fetch\(|firebase|localStorage|\.open\s*=/);
});
