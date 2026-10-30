"""YBS 本機回歸測試：上鎖狀態、帳號密碼登入、弱網上傳、教師解鎖。
用法：在 repo 根目錄 `python3 -m http.server 8765`，另開終端機
      `python3 tools/dev/check-pages.py`（需要 playwright + Chromium）。
Firebase 用 tools/dev/firebase-mock.js 假的物件，不連正式專案。
測試帳號：cgjh1100123／cgjhA123456789（只存在於 mock 裡）；名單：917 班 5 號。
教師解鎖需要通行碼：以環境變數 YBS_TEACHER_CODE 提供（不要寫進 repo）。
"""
import os, sys, re
from urllib.parse import urlsplit
from html import unescape
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('YBS_BASE', 'http://localhost:8765/')
# 拒絕遠端入口，避免測試頁或資料誤連正式網站。
_base_url = urlsplit(BASE)
if _base_url.scheme != 'http' or _base_url.hostname not in ('localhost', '127.0.0.1', '::1'):
    raise SystemExit('YBS_BASE 必須是本機 HTTP 網址')
MOCK = (Path(__file__).parent / 'firebase-mock.js').read_text(encoding='utf-8')
# 舊名稱僅供轉址驗證；活動序號與新資料夾順序互相獨立。
REDIRECTS = dict(pair.split(':') for pair in (
    'w30:u0-01 w26:u1-01 w27:u1-02 w28:u1-03 w29:u1-04 w01:u1-05 w02:u1-06 '
    'w03:u2-01 w04:u2-02 w05:u2-03 w06:u2-04 w07:u2-05 w08:u2-06 w09:u2-07 '
    'w10:u4-01 w11:u4-02 w12:u4-03 w13:u4-04 w14:u4-05 w15:u4-06 '
    'w16:u5-01 w17:u5-02 w18:u5-03 w19:u5-04 w20:u5-05 w21:u5-06 '
    'w22:u5-07 w23:u5-08 w24:u5-09 w25:u5-10'
).split())
ACTIVITY_DIRS = {int(old[1:]): new for old, new in REDIRECTS.items()}
OPEN = {'115-g9/u1-05/', '115-g9/u1-06/', '115-g9/u2-01/', '115-g9/u2-02/', '115-df/a/'}  # 和 assets/lock.js 一致
PAGES = ['115-g9/u1-05/', '115-g9/u1-06/', '115-g9/u2-01/', '115-g9/u2-02/', '115-g9/u2-03/', '115-g9/u0-01/', '115-g9/', '115-g9/teacher/',
         '115-df/', '115-df/a/', '115-df/teacher/', '', 'about/', 'map/']
LOCKED_EXPECT = lambda p: p.startswith(('115-g9/u', '115-df/a')) and p not in OPEN

def ctx_of(b):
    c = b.new_context()
    def rt(r):
        u = r.request.url
        if urlsplit(u).hostname == 'www.gstatic.com' and urlsplit(u).path.startswith('/firebasejs/'):
            return r.fulfill(body=MOCK if 'app-compat' in u else '//', content_type='application/javascript')
        return r.continue_() if u.startswith(BASE) else r.abort()
    c.route('**/*', rt)
    return c


def login_student(pg):
    """只使用 mock 的合成帳號，透過頁面登入並確認班座。"""
    pg.fill('#g-gbtn input[name=a]', '1100123')
    pg.fill('#g-gbtn input[name=p]', 'CGJHa123456789')
    pg.click('#g-gbtn button')
    pg.wait_for_selector('#g-whobtns', state='visible')
    assert '917 班 5 號' in pg.inner_text('#g-whotext')
    pg.click('#g-isme')
    pg.wait_for_selector('#main', state='visible')


def pass_round(pg):
    # 指定正解卡片後仍走原 play()、兩組資料判定、進度與 upload()，不代呼叫 submit。
    pg.evaluate('async () => { slots = [...ROUNDS[ri].sol]; await play(); }')
    assert pg.locator('#verdict').is_visible()
    assert '過關！' in pg.inner_text('#verdict')


def wait_queue(pg, count):
    pg.wait_for_function("n => JSON.parse(sessionStorage.getItem('ybslab:fq') || '[]').length === n", arg=count)


def wait_sync(pg, state):
    text = {'sending': '上傳中', 'pending': '還沒上傳成功', 'ok': '已上傳給老師'}[state]
    pg.wait_for_function("text => ['sync', 'sync2'].every(id => { const el = document.getElementById(id); return el && !el.hidden && el.textContent.includes(text); })", arg=text)
    assert pg.locator('#sync').is_visible() and pg.locator('#sync2').is_visible()


def check_records(pg, rounds):
    # 同時驗證路徑、筆數、每筆內容與佇列，避免只看到成功文字就算通過。
    writes = pg.evaluate('__writes')
    assert len(writes) == len(rounds), '成功寫入筆數不符'
    assert [x[0] for x in writes] == [f'ybsCourses/115-g9/attempts/U1_1_{r}' for r in rounds]
    for (_, data), r in zip(writes, rounds):
        assert data == dict(uid='U1', email='cgjh1100123@cgjh.hcc.edu.tw', activity=1,
                            round=r, level=1, tries=1, passedAt='TS', app='ybs', termWeek=7)
    wait_queue(pg, 0)
    wait_sync(pg, 'ok')


def weaknet_case(b, name, run):
    c = ctx_of(b)
    pg = c.new_page()
    pg.emulate_media(reduced_motion='reduce')
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)[:150]))
    try:
        pg.goto(BASE + '115-g9/u1-05/')
        login_student(pg)
        run(c, pg)
        assert not errors, str(errors)
        print('OK  ', 'weaknet/' + name)
        return 0
    except Exception as e:
        print('FAIL', 'weaknet/' + name, str(e)[:300], errors[:1])
        return 1
    finally:
        c.close()


def weaknet_concurrent(c, pg):
    pg.evaluate('__firebaseMock.plan.push({hold:true}, {hold:true, delayMs:200})')
    pass_round(pg)
    pg.wait_for_function('__firebaseMock.attempts.length === 1')
    wait_queue(pg, 1)
    wait_sync(pg, 'sending')
    pg.click('#b-next')
    pass_round(pg)
    wait_queue(pg, 2)
    assert pg.evaluate('prog.mask === 3 && __writes.length === 0 && __firebaseMock.attempts.length === 1')
    wait_sync(pg, 'sending')
    pg.evaluate('__firebaseMock.release(0)')
    pg.wait_for_function('__writes.length === 1 && __firebaseMock.attempts.length === 2')
    wait_queue(pg, 1)
    wait_sync(pg, 'sending')
    pg.evaluate('__firebaseMock.release(1)')
    pg.wait_for_function('__writes.length === 2')
    check_records(pg, [0, 1])
    assert pg.evaluate('__firebaseMock.attempts.every(x => x.state === "written")')


def weaknet_retry(c, pg, trigger):
    pg.evaluate('__firebaseMock.plan.push({code:"unavailable"})')
    pass_round(pg)
    wait_sync(pg, 'pending')
    wait_queue(pg, 1)
    assert pg.evaluate('__writes.length === 0 && __firebaseMock.attempts.length === 1 && __firebaseMock.attempts[0].state === "failed"')
    if trigger == 'online':
        # 觸發真實 Chromium 的 offline → online 事件；所有請求仍經 mock 攔截。
        c.set_offline(True)
        pg.wait_for_function('!navigator.onLine')
        c.set_offline(False)
        pg.wait_for_function('navigator.onLine')
    else:
        pg.evaluate('YBS.flush()')
    pg.wait_for_function('__writes.length === 1')
    check_records(pg, [0])
    assert pg.evaluate('__firebaseMock.attempts.length === 2')


def weaknet_reload(c, pg):
    pg.evaluate('__firebaseMock.plan.push({code:"unavailable"})')
    pass_round(pg)
    wait_sync(pg, 'pending')
    before = pg.evaluate('sessionStorage.getItem("ybslab:fq")')
    assert len(pg.evaluate('JSON.parse(sessionStorage.getItem("ybslab:fq"))')) == 1
    # 重新整理後 mock 也重建；登入自動 flush 先卡住，以驗證未送內容沒有消失。
    c.add_init_script('window.__firebaseWritePlan = [{hold:true}];')
    pg.reload()
    assert pg.evaluate('sessionStorage.getItem("ybslab:fq")') == before
    login_student(pg)
    pg.wait_for_function('__firebaseMock.attempts.length === 1')
    assert pg.evaluate('sessionStorage.getItem("ybslab:fq")') == before
    assert pg.evaluate('__writes.length === 0')
    pg.evaluate('__firebaseMock.release(0)')
    pg.wait_for_function('__writes.length === 1')
    check_records(pg, [0])


def weaknet_permission(c, pg, exists):
    if exists:
        # 同一路徑已有紀錄：拒絕覆寫後，login.js 讀回 exists 才能移除待送項目。
        pg.evaluate("""__firebaseMock.documents.set("ybsCourses/115-g9/attempts/U1_1_0", {
            uid:"U1", email:"cgjh1100123@cgjh.hcc.edu.tw", activity:1, round:0,
            level:1, tries:1, passedAt:"TS", app:"ybs", termWeek:7
        })""")
    pg.evaluate('__firebaseMock.plan.push({code:"permission-denied"})')
    pass_round(pg)
    pg.wait_for_function('__firebaseMock.attempts.length === 1 && __firebaseMock.attempts[0].state === "failed"')
    if exists:
        wait_queue(pg, 0)
        wait_sync(pg, 'ok')
        assert pg.evaluate('__writes.length === 0 && __firebaseMock.documents.get("ybsCourses/115-g9/attempts/U1_1_0").round === 0')
    else:
        wait_sync(pg, 'pending')
        wait_queue(pg, 1)
        assert pg.evaluate('__writes.length === 0')
        pg.evaluate('YBS.flush()')
        pg.wait_for_function('__writes.length === 1')
        check_records(pg, [0])


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
    # 每個舊網址都驗證落點、原標題、上鎖狀態、JS/CSP；另逐一驗證 query/hash。
    root = Path(__file__).resolve().parents[2]
    for old, new in REDIRECTS.items():
        target = f'115-g9/{new}/'
        html = (root / target / 'index.html').read_text(encoding='utf-8')
        title = unescape(re.search(r'<title>(.*?)</title>', html, re.S).group(1))
        for suffix in ('', '?x=1#h'):
            c = ctx_of(b); pg = c.new_page(); errs = []; csp = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
            pg.on('console', lambda m: csp.append(m.text[:100]) if 'content security policy' in m.text.lower() else None)
            c.add_init_script("""window.__cspViolations = [];
                document.addEventListener('securitypolicyviolation', e =>
                    window.__cspViolations.push(e.violatedDirective));""")
            source = f'115-g9/{old}/' + suffix
            try:
                pg.goto(BASE + source)
                pg.wait_for_url(BASE + target + suffix, timeout=10000)
                pg.wait_for_timeout(600)
                csp.extend(pg.evaluate('window.__cspViolations'))
                locked = pg.evaluate("!!document.getElementById('ybs-lock')")
                ok = (pg.url == BASE + target + suffix and pg.title() == title
                      and locked == LOCKED_EXPECT(target) and not errs and not csp)
            except Exception as e:
                errs.append(str(e)[:150]); ok = False
            fail += not ok
            print(('OK  ' if ok else 'FAIL'), 'redirect', source, '→', pg.url, errs[:1], csp[:1])
            c.close()
    # 靜態 gate 在解析時檢查；shell 在插入當下檢查，避免頁尾切換後才驗證。
    for week in (1, 2, 3, 5):
        path = f'115-g9/{ACTIVITY_DIRS[week]}/'
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
        pg.goto(BASE + f'115-g9/{ACTIVITY_DIRS[week]}/'); pg.wait_for_timeout(600)
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
        fail += not ok; print(('OK  ' if ok else 'FAIL'), f'{ACTIVITY_DIRS[week]} login/upload', who, w[-1][0] if w else None, up)
        pg.click('#b-swap')
        ok = pg.locator('#g-login').is_visible() and not pg.locator('#g-form').is_visible() and pg.evaluate('YBS.profile() === null')
        pg.click('#g-manual')
        ok = ok and pg.locator('#g-form').is_visible() and not pg.locator('#g-login').is_visible()
        pg.fill('#in-cls', '917'); pg.fill('#in-seat', '5'); pg.click('#g-next'); pg.click('#g-go')
        ok = ok and pg.locator('#main').is_visible() and not pg.locator('#sync').is_visible()
        fail += not ok; print(('OK  ' if ok else 'FAIL'), f'{ACTIVITY_DIRS[week]} swap/manual'); c.close()

    # 弱網情境各用獨立 context；全部由活動實際過關產生紀錄。
    for name, run in (
        ('concurrent', weaknet_concurrent),
        ('failure-online', lambda c, pg: weaknet_retry(c, pg, 'online')),
        ('failure-retry', lambda c, pg: weaknet_retry(c, pg, 'retry')),
        ('reload', weaknet_reload),
        ('permission-missing', lambda c, pg: weaknet_permission(c, pg, False)),
        ('permission-existing', lambda c, pg: weaknet_permission(c, pg, True)),
    ):
        fail += weaknet_case(b, name, run)

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
            pg.goto(BASE + f'115-g9/{ACTIVITY_DIRS[week]}/')
            pg.wait_for_selector('#g-form', state='visible')
            ok = not errs and not pg.locator('#g-login').is_visible()
            # u2-03 的開放遮罩保留；只驗證其 gate，不操作教師通行碼。
            if week != 5:
                pg.fill('#in-cls', '917'); pg.fill('#in-seat', '5'); pg.click('#g-next'); pg.click('#g-go')
                pg.click('#b-swap')
                ok = ok and pg.locator('#g-form').is_visible() and not errs
            fail += not ok; print(('OK  ' if ok else 'FAIL'), f'{ACTIVITY_DIRS[week]} fallback/{mode}', errs[:1]); c.close()
    code = os.environ.get('YBS_TEACHER_CODE')
    if code:
        c = ctx_of(b); pg = c.new_page(); pg.on('dialog', lambda d: d.accept(code) if d.type == 'prompt' else d.accept())
        pg.goto(BASE + '115-g9/u2-03/'); pg.wait_for_timeout(500); pg.click('#ybs-unlock'); pg.wait_for_timeout(1200)
        ok = not pg.evaluate("!!document.getElementById('ybs-lock')"); fail += not ok
        print(('OK  ' if ok else 'FAIL'), 'teacher unlock'); c.close()
    else:
        print('SKIP teacher unlock（沒有設定 YBS_TEACHER_CODE）')
    b.close()
sys.exit(1 if fail else 0)
