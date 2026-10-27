"""YBS 本機回歸測試：上鎖狀態、帳號密碼登入、上傳、教師解鎖。
用法：在 repo 根目錄 `python3 -m http.server 8765`，另開終端機
      `python3 tools/dev/check-pages.py`（需要 playwright + Chromium）。
Firebase 用 tools/dev/firebase-mock.js 假的物件，不連正式專案。
測試帳號：cgjh1100123／cgjhA123456789（只存在於 mock 裡）；名單：917 班 5 號。
教師解鎖需要通行碼：以環境變數 YBS_TEACHER_CODE 提供（不要寫進 repo）。
"""
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('YBS_BASE', 'http://localhost:8765/')
MOCK = (Path(__file__).parent / 'firebase-mock.js').read_text(encoding='utf-8')
OPEN = {'115-g9/w01/', '115-g9/w02/', '115-g9/w03/'}          # 要和 assets/lock.js 的 OPEN 一致
PAGES = ['115-g9/w01/', '115-g9/w02/', '115-g9/w03/', '115-g9/w05/', '115-g9/w30/', '115-g9/', '115-g9/teacher/',
         '115-df/', '115-df/a/', '115-df/teacher/', '', 'about/', 'map/']
LOCKED_EXPECT = lambda p: p.startswith('115-g9/w') and p not in OPEN or p == '115-df/a/'

def ctx_of(b):
    c = b.new_context()
    def rt(r):
        u = r.request.url
        if 'gstatic.com/firebasejs' in u:
            return r.fulfill(body=MOCK if 'app-compat' in u else '//', content_type='application/javascript')
        return r.continue_() if u.startswith(BASE) else r.abort()
    c.route('**/*', rt)
    return c

fail = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for path in PAGES:
        c = ctx_of(b); pg = c.new_page(); errs = []; csp = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
        pg.on('console', lambda m: csp.append(m.text[:100]) if 'Content Security Policy' in m.text else None)
        pg.goto(BASE + path); pg.wait_for_timeout(600)
        locked = pg.evaluate("!!document.getElementById('ybs-lock')")
        ok = locked == LOCKED_EXPECT(path) and not errs and not csp
        fail += not ok
        print(('OK  ' if ok else 'FAIL'), (path or '/').ljust(18), 'locked=', locked, errs[:1], csp[:1])
        c.close()
    # 靜態 gate 在解析時檢查；shell 在插入當下檢查，避免頁尾切換後才驗證。
    for week in (1, 2, 3, 5):
        path = f'115-g9/w{week:02d}/'
        c = ctx_of(b)
        c.add_init_script("""(() => {
          window.__gateInitial = null;
          const inspect = () => {
            const f = document.getElementById('g-form'), l = document.getElementById('g-login');
            if (!f || !l || window.__gateInitial !== null) return;
            window.__gateInitial = f.hidden && !l.hidden && getComputedStyle(f).display === 'none';
          };
          new MutationObserver(inspect).observe(document, {childList:true, subtree:true});
          const insert = Element.prototype.insertAdjacentHTML;
          Element.prototype.insertAdjacentHTML = function(...args) {
            const result = insert.apply(this, args); inspect(); return result;
          };
        })()""")
        pg = c.new_page(); pg.goto(BASE + path)
        pg.wait_for_selector('#g-form', state='attached')
        ok = pg.evaluate('window.__gateInitial === true') and not pg.locator('#g-form').is_visible()
        fail += not ok; print(('OK  ' if ok else 'FAIL'), 'initial gate', path); c.close()

    for week in (1, 2):
        c = ctx_of(b); pg = c.new_page(); pg.emulate_media(reduced_motion='reduce')
        pg.goto(BASE + f'115-g9/w{week:02d}/'); pg.wait_for_timeout(600)
        pg.fill('#g-gbtn input[name=a]', '1100123'); pg.fill('#g-gbtn input[name=p]', 'x'); pg.click('#g-gbtn button'); pg.wait_for_timeout(400)
        wrong = '不對' in pg.inner_text('#g-lerr')
        pg.fill('#g-gbtn input[name=a]', '1100123'); pg.fill('#g-gbtn input[name=p]', 'CGJHa123456789'); pg.click('#g-gbtn button'); pg.wait_for_timeout(600)
        who = pg.inner_text('#g-whotext')
        confirmed = pg.locator('#g-who').is_visible() and not pg.locator('#main').is_visible() and pg.evaluate('__writes.length === 0')
        pg.click('#g-isme'); pg.wait_for_timeout(300)
        if week == 1:
            # 走原本出餐與雙組判定，確認過關自動呼叫 submit，而非測試直接代送。
            pg.evaluate('async () => { slots = [...ROUNDS[ri].sol]; await play(); }')
        else:
            pg.evaluate("YBS.submit({activity:2,round:1,level:'進階',tries:2,termWeek:8})")
        pg.wait_for_timeout(400)
        w = pg.evaluate('__writes'); up = pg.inner_text('#sync2')
        ok = bool(wrong and confirmed and '917 班 5 號' in who and w
                  and w[-1][1]['email'] == 'cgjh1100123@cgjh.hcc.edu.tw'
                  and w[-1][1]['activity'] == week and w[-1][1]['termWeek'] == week + 6 and '已上傳' in up)
        if week == 1:
            ok = ok and w[-1][1]['round'] == 0 and w[-1][1]['tries'] == 1 and pg.evaluate('prog.mask === 1')
        fail += not ok; print(('OK  ' if ok else 'FAIL'), f'w{week:02d} login/upload', who, w[-1][0] if w else None, up)
        pg.click('#b-swap')
        ok = pg.locator('#g-login').is_visible() and not pg.locator('#g-form').is_visible() and pg.evaluate('YBS.profile() === null')
        pg.click('#g-manual')
        ok = ok and pg.locator('#g-form').is_visible() and not pg.locator('#g-login').is_visible()
        pg.fill('#in-cls', '917'); pg.fill('#in-seat', '5'); pg.click('#g-next'); pg.click('#g-go')
        ok = ok and pg.locator('#main').is_visible() and not pg.locator('#sync').is_visible()
        fail += not ok; print(('OK  ' if ok else 'FAIL'), f'w{week:02d} swap/manual'); c.close()

    # login.js 載入失敗或停用時，仍可用班座開始，且初始化不能拋出例外。
    for week in (1, 2, 3, 5):
        for mode in ('missing', 'disabled'):
            c = ctx_of(b); pg = c.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
            def intercept_login(route):
                if mode == 'missing':
                    route.abort()
                else:
                    route.fulfill(body='const YBS = {enabled:()=>false, status:()=>{}};', content_type='application/javascript')
            pg.route('**/assets/login.js?*', intercept_login)
            pg.goto(BASE + f'115-g9/w{week:02d}/')
            pg.wait_for_selector('#g-form', state='visible')
            ok = not errs and not pg.locator('#g-login').is_visible()
            # w05 的開放遮罩保留；只驗證其 gate，不操作教師通行碼。
            if week != 5:
                pg.fill('#in-cls', '917'); pg.fill('#in-seat', '5'); pg.click('#g-next'); pg.click('#g-go')
                pg.click('#b-swap')
                ok = ok and pg.locator('#g-form').is_visible() and not errs
            fail += not ok; print(('OK  ' if ok else 'FAIL'), f'w{week:02d} fallback/{mode}', errs[:1]); c.close()
    code = os.environ.get('YBS_TEACHER_CODE')
    if code:
        c = ctx_of(b); pg = c.new_page(); pg.on('dialog', lambda d: d.accept(code) if d.type == 'prompt' else d.accept())
        pg.goto(BASE + '115-g9/w05/'); pg.wait_for_timeout(500); pg.click('#ybs-unlock'); pg.wait_for_timeout(1200)
        ok = not pg.evaluate("!!document.getElementById('ybs-lock')"); fail += not ok
        print(('OK  ' if ok else 'FAIL'), 'teacher unlock'); c.close()
    else:
        print('SKIP teacher unlock（沒有設定 YBS_TEACHER_CODE）')
    b.close()
sys.exit(1 if fail else 0)
