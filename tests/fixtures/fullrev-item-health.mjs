import {config} from './fullrev.mjs';
export function healthFixture({course='115-g9',classKey='c901',activity=5,pending=0}={}){
 const rows=(activity===null?[5,6]:[activity]).flatMap(a=>[0,1,2,3].flatMap(round=>[null,0,1].map(slot=>({
  activity:a,round,slot,started:30,attempted:slot===null?28:24,attempts:slot===null?92:46,wrong:slot===null?38:19,
  passed:slot===null?24:22,pending,wrongPeople:slot===null?15:10,stuck:slot===null?6:2,
  firstPassRate:slot===null?0.5:0.625,averageAttempts:slot===null?92/28:46/24,
 }))));
 return {schemaVersion:1,sourceProject:config.firebase.projectId,course,classKey,activity,population:30,
  since:'2026-11-27T15:30:00.000Z',coverage:'formal-observed-v1',readCost:34,rows};
}
