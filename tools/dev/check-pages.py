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
OPEN = {'115-g9/w01/', '115-g9/w02/'}          # 要和 assets/lock.js 的 OPEN 一致
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
    c = ctx_of(b); pg = c.new_page(); pg.goto(BASE + '115-g9/w02/'); pg.wait_for_timeout(600)
    pg.fill('#g-gbtn input[name=a]', '1100123'); pg.fill('#g-gbtn input[name=p]', 'x'); pg.click('#g-gbtn button'); pg.wait_for_timeout(400)
    wrong = '不對' in pg.inner_text('#g-lerr')
    pg.fill('#g-gbtn input[name=a]', '1100123'); pg.fill('#g-gbtn input[name=p]', 'CGJHa123456789'); pg.click('#g-gbtn button'); pg.wait_for_timeout(600)
    who = pg.inner_text('#g-whotext'); pg.click('#g-isme'); pg.wait_for_timeout(300)
    pg.evaluate("YBS.submit({activity:2,round:1,level:'進階',tries:2,termWeek:8})"); pg.wait_for_timeout(400)
    w = pg.evaluate('__writes'); up = pg.inner_text('#sync2')
    ok = wrong and '917 班 5 號' in who and w and w[-1][1]['email'] == 'cgjh1100123@cgjh.hcc.edu.tw' and '已上傳' in up
    fail += not ok; print(('OK  ' if ok else 'FAIL'), 'login/upload', who, w[-1][0] if w else None, up); c.close()
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
