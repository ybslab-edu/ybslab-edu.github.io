// 真實登入表單及 gate 樣式；攔截所有網路，不載入 Firebase 或正式資料。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const read = p => readFile(new URL('../'+p, import.meta.url), 'utf8');
const [login,shell,css] = await Promise.all(['assets/login.js','assets/shell.js','assets/shell.css'].map(read));
const context = vm.createContext({document:{}});
vm.runInContext(shell, context);
const gate = vm.runInContext('shellGateHTML({title:"燈牌只有亮和暗",termWeek:11},s=>s)', context);
let browser;
before(async () => { browser = await chromium.launch({headless:true}); });
after(async () => { await browser?.close(); });
function contrast(fg,bg) {
  const luminance = rgb => rgb.match(/\d+/g).slice(0,3).map(Number).map(v=>v/255)
    .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
    .reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
  const a=luminance(fg), b=luminance(bg);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
for (const theme of ['light','dark']) for (const width of [1280,390]) {
  test(`登入卡片 ${theme} ${width}px：版面、切換、教師碼與配色`, async () => {
    const page = await browser.newPage({viewport:{width,height:1000},colorScheme:theme});
    try {
      await page.route('**/*',route=>route.abort());
      await page.setContent('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+gate+'</body></html>');
      await page.addScriptTag({content:login});
      await page.evaluate(async () => {
        await YBS.button(document.getElementById('g-gbtn'));
        window.submits = 0;
        document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.submits++},true);
      });
      assert.equal(await page.getByText('先登入：',{exact:false}).count(),0);
      const password = page.locator('input[name="p"]'), eye = page.locator('.ybs-password-toggle');
      assert.equal(await password.getAttribute('type'),'password');
      assert.equal(await eye.getAttribute('aria-pressed'),'false');
      await password.fill('synthetic-test-password');
      await eye.click();
      assert.equal(await password.getAttribute('type'),'text');
      assert.equal(await eye.getAttribute('aria-label'),'隱藏密碼');
      assert.equal(await eye.getAttribute('aria-pressed'),'true');
      await password.focus(); // 離開按鈕仍維持明碼。
      assert.equal(await password.getAttribute('type'),'text');
      await eye.focus();
      await eye.press('Enter');
      assert.equal(await password.getAttribute('type'),'password');
      assert.equal(await eye.getAttribute('aria-pressed'),'false');
      assert.equal(await eye.getAttribute('aria-label'),'顯示密碼');
      await eye.press('Space');
      assert.equal(await password.getAttribute('type'),'text');
      await eye.press('Space');
      assert.equal(await password.inputValue(),'synthetic-test-password');
      assert.equal(await page.evaluate(()=>window.submits),0);
      assert.equal(await page.locator('#in-tcode').getAttribute('type'),'password');
      assert.equal(await page.locator('.tlogin .ybs-password-toggle').count(),0);
      await password.fill('');
      assert.ok(await password.evaluate(el=>parseFloat(getComputedStyle(el).paddingRight)>=92),'輸入文字預留眼睛按鈕空間');
      const colors = await page.locator('.ybs-login input').evaluateAll(inputs=>inputs.map(input=>({
        bg:getComputedStyle(input).backgroundColor, ink:getComputedStyle(input).color,
        placeholder:getComputedStyle(input,'::placeholder').color
      })));
      for (const c of colors) {
        assert.equal(c.bg, theme==='light'?'rgb(255, 255, 255)':'rgb(15, 18, 24)');
        assert.equal(c.ink, theme==='light'?'rgb(33, 27, 23)':'rgb(232, 234, 238)');
        assert.ok(contrast(c.placeholder,c.bg)>=4.5,'placeholder 符合 WCAG AA');
      }
      const layout = await page.evaluate(()=>{
        const title=document.querySelector('.gate h1'), range=document.createRange();
        range.selectNodeContents(title);
        return {scroll:document.documentElement.scrollWidth,lines:range.getClientRects().length,
          gate:document.querySelector('.gate').getBoundingClientRect().width};
      });
      assert.ok(layout.scroll<=width,'整頁沒有水平捲軸');
      if(width===1280){assert.equal(layout.lines,1,'桌面標題單行');assert.ok(layout.gate>440)}
      // 明確主題設定須覆蓋相反的系統配色。
      await page.emulateMedia({colorScheme:theme==='light'?'dark':'light'});
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      assert.equal(await password.evaluate(el=>getComputedStyle(el).backgroundColor),colors[0].bg);
      await password.focus();
      assert.equal(await password.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      if(process.env.LOGIN_SHOTS_DIR){
        await mkdir(process.env.LOGIN_SHOTS_DIR,{recursive:true});
        await page.screenshot({path:join(process.env.LOGIN_SHOTS_DIR,`login-${theme}-${width}.png`),fullPage:true});
      }
    } finally { await page.close(); }
  });
}
