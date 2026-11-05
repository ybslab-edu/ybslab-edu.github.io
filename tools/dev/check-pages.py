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
from datetime import datetime
from time import monotonic, sleep
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
ROOT = Path(__file__).resolve().parents[2]
# 固定台灣時間：保留過去已開放與未來仍上鎖，避免 CI 隨執行日期變動。
TEST_NOW = '2026-11-05T12:00:00+08:00'
TIME_CASES = [
    ('115-g9/u2-03/', '2026-11-08T23:58:59+08:00', True),
    ('115-g9/u2-03/', '2026-11-08T23:59:00+08:00', False),
    ('115-g9/u2-02/', '2026-01-01T00:00:00+08:00', False),  # OPEN 提早開放
]
PAGES = ['115-g9/u1-05/', '115-g9/u1-06/', '115-g9/u2-01/', '115-g9/u2-02/', '115-g9/u2-03/', '115-g9/u0-01/', '115-g9/', '115-g9/teacher/',
         '115-df/', '115-df/a/', '115-df/teacher/', '', 'about/', 'map/']

def page_of(c, now=TEST_NOW):
    pg = c.new_page()
    # 只固定 Date；計時器照常執行，保留弱網重試、動畫與等待檢查。
    pg.clock.set_fixed_time(datetime.fromisoformat(now))
    return pg


def lock_expectations(b, now=TEST_NOW):
    """在空白頁載入正式規則，以同一時鐘計算所有直連／轉址落點的預期。"""
    c = ctx_of(b)
    try:
        pg = page_of(c, now)
        source = '\n'.join((ROOT / 'assets' / name).read_text(encoding='utf-8')
                           for name in ('lock.js', 'activities.js'))
        paths = list(dict.fromkeys(PAGES + [f'115-g9/{new}/' for new in REDIRECTS.values()]))
        return pg.evaluate("paths => {" + source + r"""
            return Object.fromEntries(paths.map(path => {
                const [course, sub = ''] = path.split('/');
                const list = OPEN[course];
                if (!list || !sub || sub === 'teacher' || /\.html$/.test(sub) || list.includes(sub))
                    return [path, false];
                const a = ACTIVITIES.find(a => a.course === course && a.href.split('/')[1] === sub);
                return [path, !(a && isActivityOpen(a))];
            }));
        }""", paths)
    finally:
        c.close()

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
    pg.evaluate('async () => { APP.handle.fill(); await play(); }')
    assert pg.locator('#verdict').is_visible()
    assert '過關！' in pg.inner_text('#verdict')


def wait_evaluate(pg, expression, *, arg=None, timeout=30000):
    """由 Python 輪詢，避免頁面 CSP 阻擋 wait_for_function 內部的 eval。"""
    deadline = monotonic() + timeout / 1000
    while True:
        if pg.evaluate(expression, arg=arg):
            return
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise TimeoutError(f'等待條件逾時（{timeout} ms）：{expression}')
        sleep(min(0.05, remaining))


def wait_queue(pg, count):
    wait_evaluate(pg, "n => JSON.parse(sessionStorage.getItem('ybslab:fq') || '[]').length === n", arg=count)


def wait_sync(pg, state):
    text = {'sending': '上傳中', 'pending': '還沒上傳成功', 'ok': '已上傳給老師'}[state]
    wait_evaluate(pg, "text => ['sync', 'sync2'].every(id => { const el = document.getElementById(id); return el && !el.hidden && el.textContent.includes(text); })", arg=text)
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
    pg = page_of(c)
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
    wait_evaluate(pg, '__firebaseMock.attempts.length === 1')
    wait_queue(pg, 1)
    wait_sync(pg, 'sending')
    pg.click('#b-next')
    pass_round(pg)
    wait_queue(pg, 2)
    assert pg.evaluate("JSON.parse(localStorage.getItem('it9:w1:917-5')).mask === 3 && __writes.length === 0 && __firebaseMock.attempts.length === 1")
    wait_sync(pg, 'sending')
    pg.evaluate('__firebaseMock.release(0)')
    wait_evaluate(pg, '__writes.length === 1 && __firebaseMock.attempts.length === 2')
    wait_queue(pg, 1)
    wait_sync(pg, 'sending')
    pg.evaluate('__firebaseMock.release(1)')
    wait_evaluate(pg, '__writes.length === 2')
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
        wait_evaluate(pg, '!navigator.onLine')
        c.set_offline(False)
        wait_evaluate(pg, 'navigator.onLine')
    else:
        pg.evaluate('YBS.flush()')
    wait_evaluate(pg, '__writes.length === 1')
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
    wait_evaluate(pg, '__firebaseMock.attempts.length === 1')
    assert pg.evaluate('sessionStorage.getItem("ybslab:fq")') == before
    assert pg.evaluate('__writes.length === 0')
    pg.evaluate('__firebaseMock.release(0)')
    wait_evaluate(pg, '__writes.length === 1')
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
    wait_evaluate(pg, '__firebaseMock.attempts.length === 1 && __firebaseMock.attempts[0].state === "failed"')
    if exists:
        wait_queue(pg, 0)
        wait_sync(pg, 'ok')
        assert pg.evaluate('__writes.length === 0 && __firebaseMock.documents.get("ybsCourses/115-g9/attempts/U1_1_0").round === 0')
    else:
        wait_sync(pg, 'pending')
        wait_queue(pg, 1)
        assert pg.evaluate('__writes.length === 0')
        pg.evaluate('YBS.flush()')
        wait_evaluate(pg, '__writes.length === 1')
        check_records(pg, [0])


def guest_cycle(b):
    """九年級真實作答 → 弱網／重新開頁 → 換班座 → owner 教師表；全程 mock。"""
    c = ctx_of(b); pg = page_of(c); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)[:150]))
    def manual(seat):
        pg.click('#g-manual'); pg.fill('#in-cls', '999'); pg.fill('#in-seat', str(seat))
        pg.click('#g-next'); pg.click('#g-go')
        pg.wait_for_selector('#main', state='visible')
        wait_evaluate(pg, "sessionStorage.getItem('ybslab:guest-identity') !== null")
    def pass_guest(step):
        previous = None
        for n in range(2):
            # fill 只填答案；派送選單 change，經活動的 api.changed 同步送出按鈕。
            pg.evaluate('() => { APP.handle.fill(); document.getElementById("sample-rate").dispatchEvent(new Event("change", {bubbles:true})); }')
            state = pg.evaluate('({ready:APP.handle.ready(), disabled:document.getElementById("b-send").disabled, inst:JSON.stringify(APP.inst)})')
            assert state['ready'] and not state['disabled'], f'{step}／第 {n+1} 組：填答後無法送出，{state}'
            assert state['inst'] != previous, f'{step}／第 {n+1} 組：未換成不同資料，{state}'
            previous = state['inst']
            pg.click('#b-send')
            verdict = pg.inner_text('#verdict')
            progress = pg.evaluate("JSON.parse(localStorage.getItem('it9:w4:999-' + JSON.parse(sessionStorage.getItem('ybslab:guest-identity')).seat))")
            if n == 0:
                assert pg.locator('#verdict.mid').count() == 1 and '再一組確認' in verdict, f'{step}／第 1 組：應要求再一組，判定={verdict!r}'
                assert pg.locator('#streak .on').count() == 1 and pg.is_disabled('#b-send'), f'{step}／第 1 組：應亮一顆並等待新題填答'
                assert progress['mask'] == 0 and progress['tries'][0] == 1, f'{step}／第 1 組：進度不應標記過關，{progress}'
                assert pg.locator('#b-next').count() == 0, f'{step}／第 1 組：不應出現下一關'
            else:
                # shell 過關時不呼叫 renderStreak，燈號仍停在一顆；以過關與保存結果判斷。
                assert pg.locator('#verdict.ok').count() == 1 and '過關！' in verdict, f'{step}／第 2 組：應過關，判定={verdict!r}'
                assert progress['mask'] == 1 and progress['tries'][0] == 2, f'{step}／第 2 組：應以兩次作答完成第一關，{progress}'
                assert pg.evaluate('JSON.stringify(APP.inst)') == previous and not pg.is_disabled('#b-send'), f'{step}／第 2 組：過關後應保留當題與可按的送出按鈕'
        assert pg.locator('#code').count() == 0, f'{step}：活動不應產生成績碼'
        pg.click('#b-next')
        assert pg.evaluate('APP.ri') == 1 and pg.locator('#streak .on').count() == 0 and pg.is_disabled('#b-send') and not pg.is_visible('#verdict'), f'{step}：下一關應重設連對、等待填答並隱藏判定'
    try:
        pg.goto(BASE + '115-g9/u2-02/'); manual(1)
        pg.evaluate('__firebaseMock.plan.push({code:"unavailable"})'); pass_guest('999 班 1 號／首次寫入 unavailable')
        wait_evaluate(pg, "document.getElementById('sync').textContent.includes('紀錄暫存在本機')")
        assert pg.evaluate("JSON.parse(localStorage.getItem('ybslab:guest:115-g9')).queue.length") == 1, '首次寫入失敗：應保留一筆待送紀錄'
        assert pg.evaluate("JSON.parse(localStorage.getItem('it9:w4:999-1')).mask") == 1, '首次寫入失敗：第一關本機過關紀錄遺失'
        pg.reload()  # mock 重建；沿用 session UID，自動重送，不需要學生再登入。
        wait_evaluate(pg, "JSON.parse(localStorage.getItem('ybslab:guest:115-g9')).queue.length === 0")
        manual(1)
        assert pg.evaluate('__authCalls') == [], '同班座重新整理不重登'
        pg.click('#b-swap'); manual(2)
        wait_evaluate(pg, "JSON.parse(sessionStorage.getItem('ybslab:guest-identity')).seat === 2")
        assert pg.evaluate('__authCalls') == ['signOut', 'anonymous'], '換成 999 班 2 號：應先登出再匿名登入'
        pg.evaluate('__firebaseMock.plan.push({code:"unavailable"})')
        pass_guest('999 班 2 號／換班座後作答')
        wait_evaluate(pg, "document.getElementById('sync2').textContent.includes('還沒上傳成功')")
        pg.click('#b-retry'); wait_evaluate(pg, '__writes.length === 2')
        writes = pg.evaluate('__writes')
        assert [x[0] for x in writes] == ['ybsCourses/115-g9/guestAttempts/guest1_4_0', 'ybsCourses/115-g9/guestAttempts/guest2_4_0'], f'開頁重送／換班座：寫入路徑不符，{writes!r}'
        expected = {'activity', 'round', 'level', 'tries', 'termWeek', 'passedAt', 'app', 'cls', 'seat', 'verified'}
        for path, data in writes:
            assert set(data) == expected and data['cls'] == '999' and data['verified'] is False and data['passedAt'] == 'TS', f'班座紀錄欄位／型別不符：{path}，{data!r}'
        pg.goto(BASE + '115-g9/teacher/'); pg.click('#cloud-login')
        wait_evaluate(pg, "!document.getElementById('cloud-read').disabled")
        pg.evaluate("""writes => {
            __firebaseMock.documents.set('ybsCourses/115-g9', {ownerUid:'teacher1'});
            for(const [path,data] of writes)__firebaseMock.documents.set(path,data);
            __firebaseMock.documents.set('ybsCourses/115-g9/roster/synthetic@example.invalid',{cls:999,seat:1});
            __firebaseMock.documents.set('ybsCourses/115-g9/attempts/real1_4_0',{
                uid:'real1',email:'synthetic@example.invalid',activity:4,round:0,level:1,tries:2,passedAt:'TS'});
        }""", writes)
        pg.click('#cloud-read'); wait_evaluate(pg, "document.getElementById('cloud-status').textContent.includes('已讀取 3 列')")
        assert pg.locator('#cloud-table tbody tr').count() == 0, '選班前不應顯示學生列'
        pg.select_option('#cloud-class', '999')
        assert pg.locator('#cloud-table tbody tr').count() == 1, 'owner 讀取：依名冊應有一座號列'
        assert '待核對' in pg.inner_text('#cloud-table'), '重複來源須待核對'
        pg.locator('#cloud-table details summary').first.click()
        assert '未驗證' in pg.inner_text('#cloud-table') and '帳號名單' in pg.inner_text('#cloud-table'), 'owner 讀取：缺少班座未驗證或帳號名單來源標示'
        with pg.expect_download() as download:
            pg.click('#cloud-export')
        assert download.value.suggested_filename.endswith('.xlsx'), 'owner 匯出：下載檔名應為 .xlsx'
        pg.click('#cloud-logout'); wait_evaluate(pg, "document.getElementById('cloud-status').textContent.includes('已登出')")
        assert pg.inner_text('#cloud-table') == '', '教師登出：雲端表應清空'
        pg.evaluate('window.__mockTeacherUid = "otherTeacher"'); pg.click('#cloud-login')
        wait_evaluate(pg, "!document.getElementById('cloud-read').disabled")
        pg.click('#cloud-read'); wait_evaluate(pg, "document.getElementById('cloud-status').textContent.includes('無權限')")
        assert pg.inner_text('#cloud-table') == '', '非 owner 讀取遭拒後：雲端表應維持空白'
        assert not errors, f'guest/cycle：瀏覽器 JavaScript 錯誤，{errors!r}'
        print('OK  guest/作答、斷網待送、開頁重送、換班座、owner 合併表／匯出與非 owner 拒絕')
        return 0
    except Exception as e:
        print('FAIL guest/cycle', str(e)[:300], errors[:1]); return 1
    finally:
        c.close()


fail = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    expected = lock_expectations(b)
    assert expected['115-g9/u0-01/'] is False, '過去活動應已開放'
    assert expected['115-g9/u2-03/'] is True, '未來活動應仍上鎖'
    for path in PAGES:
        c = ctx_of(b); pg = page_of(c); errs = []; csp = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
        pg.on('console', lambda m: csp.append(m.text[:100]) if 'Content Security Policy' in m.text else None)
        pg.goto(BASE + path); pg.wait_for_timeout(600)
        locked = pg.evaluate("!!document.getElementById('ybs-lock')")
        ok = locked == expected[path] and not errs and not csp
        fail += not ok
        print(('OK  ' if ok else 'FAIL'), (path or '/').ljust(18), 'locked=', locked, errs[:1], csp[:1])
        c.close()
    # 獨立固定預期，避免正式規則與預期一起退化，且確認時鐘在導頁前已注入。
    for path, now, locked_expected in TIME_CASES:
        timed_expected = lock_expectations(b, now)
        assert timed_expected[path] is locked_expected, f'{path} {now} 開放規則不符'
        c = ctx_of(b); pg = page_of(c, now); errs = []; csp = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
        pg.on('console', lambda m: csp.append(m.text[:100]) if 'content security policy' in m.text.lower() else None)
        pg.goto(BASE + path); pg.wait_for_timeout(600)
        locked = pg.evaluate("!!document.getElementById('ybs-lock')")
        ok = locked is locked_expected and not errs and not csp
        fail += not ok
        print(('OK  ' if ok else 'FAIL'), 'clock', path, now, 'locked=', locked, errs[:1], csp[:1])
        c.close()
    # 每個舊網址都驗證落點、原標題、上鎖狀態、JS/CSP；另逐一驗證 query/hash。
    for old, new in REDIRECTS.items():
        target = f'115-g9/{new}/'
        html = (ROOT / target / 'index.html').read_text(encoding='utf-8')
        title = unescape(re.search(r'<title>(.*?)</title>', html, re.S).group(1))
        for suffix in ('', '?x=1#h'):
            c = ctx_of(b); pg = page_of(c); errs = []; csp = []
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
                      and locked == expected[target] and not errs and not csp)
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
        pg = page_of(c); pg.goto(BASE + path)
        pg.wait_for_selector('#g-form', state='attached')
        ok = pg.evaluate('window.__gateInitial === true') and not pg.locator('#g-form').is_visible()
        fail += not ok; print(('OK  ' if ok else 'FAIL'), 'initial gate', path); c.close()

    for week in (1, 2):
        c = ctx_of(b); pg = page_of(c); pg.emulate_media(reduced_motion='reduce')
        pg.goto(BASE + f'115-g9/{ACTIVITY_DIRS[week]}/'); pg.wait_for_timeout(600)
        pg.fill('#g-gbtn input[name=a]', '1100123'); pg.fill('#g-gbtn input[name=p]', 'x'); pg.click('#g-gbtn button'); pg.wait_for_timeout(400)
        wrong = '不對' in pg.inner_text('#g-lerr')
        pg.fill('#g-gbtn input[name=a]', '1100123'); pg.fill('#g-gbtn input[name=p]', 'CGJHa123456789'); pg.click('#g-gbtn button'); pg.wait_for_timeout(600)
        who = pg.inner_text('#g-whotext')
        confirmed = pg.locator('#g-who').is_visible() and not pg.locator('#main').is_visible() and pg.evaluate('__writes.length === 0')
        pg.click('#g-isme'); pg.wait_for_timeout(300)
        # 兩頁均走活動實際播放與雙組判定，確認過關自動呼叫 submit。
        pg.evaluate('() => { APP.handle.fill(); play(); }')
        pg.wait_for_selector('#verdict.ok', timeout=15000)
        pg.wait_for_timeout(400)
        w = pg.evaluate('__writes'); up = pg.inner_text('#sync2')
        ok = bool(wrong and confirmed and '917 班 5 號' in who and w
                  and w[-1][1]['email'] == 'cgjh1100123@cgjh.hcc.edu.tw'
                  and w[-1][1]['activity'] == week and w[-1][1]['termWeek'] == week + 6 and '已上傳' in up)
        ok = ok and w[-1][1]['round'] == 0 and w[-1][1]['tries'] == 1 and pg.evaluate(f"JSON.parse(localStorage.getItem('it9:w{week}:917-5')).mask === 1")
        fail += not ok; print(('OK  ' if ok else 'FAIL'), f'{ACTIVITY_DIRS[week]} login/upload', who, w[-1][0] if w else None, up)
        pg.click('#b-swap')
        ok = pg.locator('#g-login').is_visible() and not pg.locator('#g-form').is_visible() and pg.evaluate('YBS.profile() === null')
        pg.click('#g-manual')
        ok = ok and pg.locator('#g-form').is_visible() and not pg.locator('#g-login').is_visible()
        pg.fill('#in-cls', '917'); pg.fill('#in-seat', '5'); pg.click('#g-next'); pg.click('#g-go')
        ok = ok and pg.locator('#main').is_visible() and pg.locator('#sync').is_visible()
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
    fail += guest_cycle(b)

    # login.js 載入失敗或停用時，仍可用班座開始，且初始化不能拋出例外。
    for week in (1, 2, 3, 5):
        for mode in ('missing', 'disabled'):
            c = ctx_of(b); pg = page_of(c); errs = []
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
        c = ctx_of(b); pg = page_of(c); pg.on('dialog', lambda d: d.accept(code) if d.type == 'prompt' else d.accept())
        pg.goto(BASE + '115-g9/u2-03/'); pg.wait_for_timeout(500); pg.click('#ybs-unlock'); pg.wait_for_timeout(1200)
        ok = not pg.evaluate("!!document.getElementById('ybs-lock')"); fail += not ok
        print(('OK  ' if ok else 'FAIL'), 'teacher unlock'); c.close()
    else:
        print('SKIP teacher unlock（沒有設定 YBS_TEACHER_CODE）')
    b.close()
sys.exit(1 if fail else 0)
