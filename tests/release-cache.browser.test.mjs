import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,appendFile,rm} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {buildSite} from '../tools/build-fullrev-site.mjs';
import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import {snapshotReleaseSource} from './helpers/release-source.mjs';
import {config as fixtureConfig} from './fixtures/fullrev.mjs';

test('browser warm cache → frontend update → reload loads the new client, runtime read model and CSS URLs',async t=>{
 if(workerCISkip){t.skip(workerCISkip);return;}
 assert.ok(workerSource,'本機快取驗收需設定 YBS_WORKER_SOURCE');
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 const dir=await mkdtemp('/tmp/ybs-release-cache-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=await snapshotReleaseSource(join(dir,'source'));
 const config={...fixtureConfig,readModelModule:'/assets/fullrev-read-model.mjs'};
 await appendFile(join(source,'assets/fullrev-read-model.mjs'),'\nglobalThis.__syntheticReleaseProbe="old";\n');
 await appendFile(join(source,'assets/shell.css'),'\n:root{--synthetic-release-probe:old}\n');
 const a=await buildSite({output:join(dir,'a'),config,workerSource,source});
 await appendFile(join(source,'assets/fullrev-read-model.mjs'),'\nglobalThis.__syntheticReleaseProbe="new";\n');
 await appendFile(join(source,'assets/shell.css'),'\n:root{--synthetic-release-probe:new}\n');
 const b=await buildSite({output:join(dir,'b'),config,workerSource,source});
 assert.notEqual(a.releaseId,b.releaseId);
 let active='a',built=a;const requests=[],errors=[];
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://local.invalid');requests.push({active,url:req.url});
   if(url.pathname==='/115-g9/me/'){
    // Keep the generated page's exact stylesheet URLs. The synthetic harness invokes
    // the real built client/read-model import without starting any Firebase session.
    const html=(await readFile(join(dir,active,'115-g9/me/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    const id=built.releaseId;
    res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
    res.end(html.replace('</body>',`<script src="/assets/fullrev-config.js?v=${id}"></script><script type="module">import {createBrowserClient} from '/assets/fullrev-client.mjs?v=${id}'; await createBrowserClient(YBS_FULLREV_CONFIG); document.body.dataset.ready=globalThis.__syntheticReleaseProbe;</script></body>`));return;
   }
   if(!url.pathname.startsWith('/assets/')||url.pathname.includes('..')){res.writeHead(404);res.end();return;}
   const body=await readFile(join(dir,active,url.pathname.slice(1)));
   const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
   res.writeHead(200,{'content-type':mime[extname(url.pathname)]||'application/octet-stream','cache-control':'public,max-age=31536000,immutable'});res.end(body);
  }catch(error){errors.push(error.message);res.writeHead(500);res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 // Playwright routing disables HTTP cache. Use CDP blocking so real browser caching
 // remains enabled while every external HTTPS endpoint is blocked before networking.
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
 const base=`http://127.0.0.1:${server.address().port}`,url=base+'/115-g9/me/';
 const inspect=async expected=>{
  await page.waitForFunction(value=>document.body.dataset.ready===value,expected);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--synthetic-release-probe').trim()),expected);
 };
 await page.goto(url);await inspect('old');
 const coldAssets=requests.filter(r=>r.url.startsWith('/assets/')).length;assert.ok(coldAssets>5);
 await page.goto(url);await inspect('old');
 assert.equal(requests.filter(r=>r.url.startsWith('/assets/')).length,coldAssets,'second navigation must use the warmed browser cache');
 active='b';built=b;
 await page.reload();await inspect('new');
 const updated=requests.filter(r=>r.active==='b'&&r.url.startsWith('/assets/'));
 for(const path of ['fullrev-client.mjs','fullrev-read-model.mjs','shell.css'])assert.ok(updated.some(r=>r.url===`/assets/${path}?v=${b.releaseId}`),path);
 assert.ok(updated.every(r=>new URL(r.url,base).searchParams.get('v')===b.releaseId));
 assert.deepEqual(errors,[]);assert.deepEqual(pageErrors,[]);
 t.diagnostic(`warm cache: ${coldAssets} asset responses, second navigation: 0 asset network requests; reload: ${updated.length} new versioned assets; readModel=new; CSS=new; external HTTPS blocked`);
});
