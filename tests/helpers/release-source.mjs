import {copyFile,mkdir,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {releasePaths} from '../../tools/build-fullrev-site.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
// Copy only known public frontend inputs, never Git metadata or Worker sources.
export async function snapshotReleaseSource(destination){
 const paths=new Set([...releasePaths(),'assets/lock.js','assets/teacher.js','assets/df-teacher-cloud.js']);
 for(const path of paths){
  if(!(await stat(join(root,path)).catch(()=>null))?.isFile())continue;
  await mkdir(dirname(join(destination,path)),{recursive:true});
  await copyFile(join(root,path),join(destination,path));
 }
 return destination;
}
