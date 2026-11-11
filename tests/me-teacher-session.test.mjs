import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../115-g9/me/me-teacher.js',import.meta.url),'utf8');
function fixture() {
  const calls=[],listeners=[];
  const student={uid:'synthetic-student'},teacher={uid:'synthetic-teacher'};
  const storage=new Map([['student',student]]);
  const auth={currentUser:teacher,
    async setPersistence(value){calls.push(['persistence',value]);storage.set('teacher-'+value,teacher);storage.delete('teacher-'+(value==='local'?'session':'local'))},
    onAuthStateChanged(callback){listeners.push(callback);queueMicrotask(()=>callback(teacher));return()=>{}}
  };
  const app={name:'ybs-me-teacher',auth:()=>auth,firestore:()=>({})};
  const firebase={apps:[],initializeApp:(_config,name)=>{calls.push(['app',name]);firebase.apps.push(app);return app},
    auth:{Auth:{Persistence:{SESSION:'session',LOCAL:'local'}}}};
  const document={createElement:()=>({}),head:{appendChild(element){calls.push(['script',element.src]);queueMicrotask(()=>element.onload())}}};
  const context=vm.createContext({URLSearchParams,document,firebase,queueMicrotask});
  vm.runInContext(source,context);
  return {session:vm.runInContext('YBSMeTeacher.session',context),calls,storage,student,teacher};
}
test('成長頁教師 Auth 使用獨立 app 與 LOCAL，不移動學生 LOCAL 身分',async()=>{
  const f=fixture();const first=await f.session(),second=await f.session();
  assert.equal(first,second);
  assert.equal(first.auth.currentUser,f.teacher);
  assert.equal(f.storage.get('student'),f.student);
  assert.equal(f.storage.get('teacher-local'),f.teacher);
  assert.equal(f.storage.has('teacher-session'),false);
  assert.deepEqual(f.calls.map(c=>c[0]),['script','script','script','app','persistence']);
  assert.deepEqual(f.calls.find(c=>c[0]==='app'),['app','ybs-me-teacher']);
  assert.deepEqual(f.calls.find(c=>c[0]==='persistence'),['persistence','local']);
});
