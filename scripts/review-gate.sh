#!/usr/bin/env bash
# 本機審查；不部署、不修改 Git 歷史。* 不跨目錄，** 可跨目錄。
set -euo pipefail
umask 077

usage() {
  printf '用法：scripts/review-gate.sh <基準分支> <範圍檔>\n' >&2
  exit 2
}

stop_server() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    server_pid=""
  fi
}

interrupted() {
  printf '異常 執行中斷 [signal]\nlog：%s\n需要審查\n' "$log_dir" >"$log_dir/summary.log"
  cat -- "$log_dir/summary.log" >&3
  exit 1
}

setup_gate() {
  [[ $# == 2 ]] || usage
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || usage
  base_sha="$(git rev-parse --verify --end-of-options "${1}^{commit}" 2>/dev/null)" || usage
  scope_file="$2"
  [[ "$scope_file" == /* ]] || scope_file="$PWD/$scope_file"
  [[ -f "$scope_file" && -r "$scope_file" ]] || usage
  cd -- "$repo_root"
  local common_dir
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || usage

  if ! mkdir -p -- "$common_dir/review-gate" 2>/dev/null ||
    ! log_dir="$(mktemp -d "$common_dir/review-gate/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX" 2>/dev/null)"; then
    printf '異常 完整 log [log-storage]\n需要審查\n'
    exit 1
  fi

  # 只有最終摘要可寫到原 stdout；子程序的 stdout / stderr 全部存入 Git 目錄。
  exec 3>&1
  exec >"$log_dir/run.log" 2>&1
  failed=0
  server_pid=""
  test_summary=()
  trap stop_server EXIT
  trap interrupted HUP INT TERM

  # 保留尋找既有 runtime / Playwright 必要的設定，排除 NODE_OPTIONS、
  # NODE_TEST_CONTEXT、PYTHONPATH、proxy、Git 注入設定與其他測試開關。
  test_env=(env -i "PATH=${PATH:-/usr/bin:/bin}"
    "REVIEW_GATE_SKIP_TESTS=${REVIEW_GATE_SKIP_TESTS:-0}" 'YBS_TEACHER_CODE=')
  local name
  for name in HOME TMPDIR TMP TEMP LANG LC_ALL TZ XDG_CACHE_HOME PLAYWRIGHT_MODULE PLAYWRIGHT_BROWSERS_PATH NODE_PATH; do
    if [[ -v "$name" ]]; then
      test_env+=("$name=${!name}")
    fi
  done
}

browser_suite() {
  # http.server 直接 bind port 0，避免先挑埠再啟動之間的競爭；服務 repo 根目錄。
  "${test_env[@]}" python3 -u - "$log_dir/server.port" "$repo_root" <<'PY' >"$log_dir/server.log" 2>&1 &
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

with ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=sys.argv[2])) as server:
    Path(sys.argv[1]).write_text(str(server.server_port), encoding="ascii")
    server.serve_forever()
PY
  server_pid=$!
  if ! "${test_env[@]}" python3 - "$log_dir/server.port" "$server_pid" <<'PY' >"$log_dir/server.ready" 2>>"$log_dir/server.log"
from pathlib import Path
import os
import sys
import time
from urllib.request import urlopen

for _ in range(100):
    try:
        os.kill(int(sys.argv[2]), 0)
        port = int(Path(sys.argv[1]).read_text(encoding="ascii"))
        with urlopen(f"http://127.0.0.1:{port}/", timeout=0.2) as response:
            if response.status == 200:
                print(port)
                sys.exit(0)
    except (OSError, ValueError):
        pass
    time.sleep(0.05)
sys.exit(1)
PY
  then
    stop_server
    return 1
  fi
  local result=0
  "${test_env[@]}" "YBS_BASE=http://127.0.0.1:$(<"$log_dir/server.ready")/" \
    python3 tools/dev/check-pages.py || result=$?
  stop_server
  return "$result"
}

# 可獨立載入函式，用隔離的 command stub 驗證編排；正式入口仍強制遵守 skip。
run_test_steps() {
  local node_result=通過
  local -a details=()
  if "${test_env[@]}" node --test tests/*.test.mjs >"$log_dir/node-tests.log" 2>&1; then
    details+=('[node-tests:通過]')
  else
    details+=('[node-tests:異常]')
    node_result=異常
    failed=1
  fi
  if "${test_env[@]}" node tests/df-report.test.cjs >"$log_dir/df-report.log" 2>&1; then
    details+=('[df-report:通過]')
  else
    details+=('[df-report:異常]')
    node_result=異常
    failed=1
  fi
  if "${test_env[@]}" node tests/df-teacher-cloud.test.cjs >"$log_dir/df-teacher-cloud.log" 2>&1; then
    details+=('[df-teacher-cloud:通過]')
  else
    details+=('[df-teacher-cloud:異常]')
    node_result=異常
    failed=1
  fi
  test_summary+=("$node_result Node ${details[*]}")
  if browser_suite >"$log_dir/browser.log" 2>&1; then
    test_summary+=('通過 瀏覽器 [check-pages]')
  else
    test_summary+=('異常 瀏覽器 [check-pages]')
    failed=1
  fi
}

review_diff() {
  # 只掃新增行，不保存 patch 或 secret 內容；錯誤也不進摘要。
  if python3 -I - "$base_sha" "$scope_file" <<'PY' >"$log_dir/diff.log" 2>"$log_dir/diff-errors.log"
import fnmatch
from functools import lru_cache
import json
import os
from pathlib import Path
import re
import subprocess
import sys

def git(*args):
    return subprocess.run(
        ["git", "--literal-pathspecs", *args], check=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout

def paths(data):
    return [os.fsdecode(path) for path in data.split(b"\0") if path]

def allowed(path, pattern):
    parts, globs = path.split("/"), pattern.removeprefix("./").split("/")

    @lru_cache(None)
    def match(i, j):
        if j == len(globs):
            return i == len(parts)
        if globs[j] == "**":
            return match(i, j + 1) or (i < len(parts) and match(i + 1, j))
        return i < len(parts) and fnmatch.fnmatchcase(parts[i], globs[j]) and match(i + 1, j + 1)

    return match(0, 0)

try:
    patterns = [line.strip() for line in Path(sys.argv[2]).read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.lstrip().startswith("#")]
    # 分開檢查，避免 staged / unstaged 的相反修改彼此抵銷。
    revisions = [[f"{sys.argv[1]}...HEAD"], ["--cached", "HEAD"], []]
    options = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-color", "--word-diff=none", "--ignore-submodules=none"]
    changes = [(revision, paths(git(*options, "--name-only", "-z", *revision, "--")))
               for revision in revisions]
    untracked = paths(git("ls-files", "--others", "--exclude-standard", "-z"))
    changed = set(untracked).union(*(set(names) for _, names in changes))
    findings = {key: set() for key in ["scope", "firestore-rules", "package-files", "workflows", "secrets"]}
    for path in changed:
        if not any(allowed(path, pattern) for pattern in patterns):
            findings["scope"].add((path, "out-of-scope"))
        if path == "firestore.rules":
            findings["firestore-rules"].add((path, "firestore-rules"))
        if path.rsplit("/", 1)[-1] in ("package.json", "package-lock.json"):
            findings["package-files"].add((path, "package-files"))
        if path == ".github/workflows" or path.startswith(".github/workflows/"):
            findings["workflows"].add((path, "workflows"))
    # YBS 不應有此檔，連既存、忽略或失效 symlink 都不可當作通過。
    if os.path.lexists("firestore.rules"):
        findings["firestore-rules"].add(("firestore.rules", "firestore-rules"))

    secret_rules = {
        "private-key-header": rb"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----",
        "google-api-key": rb"AIza[A-Za-z0-9_-]{16,}",
        "github-token": rb"(?:ghp_|github_pat_)[A-Za-z0-9_]{16,}",
        "openai-key": rb"\bsk-[A-Za-z0-9_-]{16,}",
        "aws-access-key": rb"\bAKIA[A-Z0-9]{16}\b",
        "json-private-key": rb'"private_key"\s*:\s*"[^"\r\n]+',
        # 16 字元以上；支援引號、環境變數與 camelCase / snake_case 名稱。
        "credential-assignment": rb'''(?ix)["']?\b[\w-]*(?:password|token|secret)[\w-]*["']?\s*[:=]\s*(?:["'][^"'\r\n]{16,}["']|[a-z0-9_./+@=-]{16,})''',
    }
    compiled = [(name, re.compile(pattern)) for name, pattern in secret_rules.items()]

    def scan(path, line):
        for name, pattern in compiled:
            if pattern.search(line):
                findings["secrets"].add((path, name))

    for revision, names in changes:
        for path in names:
            patch = git(*options, "--text", "--unified=0", *revision, "--", path)
            in_hunk = False
            for line in patch.split(b"\n"):
                if line.startswith(b"@@"):
                    in_hunk = True
                elif in_hunk and line.startswith(b"+"):
                    scan(path, line[1:])
    for path in untracked:
        file = Path(path)
        if file.is_symlink():
            data = os.fsencode(os.readlink(file))
        elif file.is_file():
            data = file.read_bytes()
        else:
            raise ValueError("unsupported file type")
        for line in data.split(b"\n"):
            scan(path, line)

    # JSON escaping 防止檔名的換行或終端控制字元破壞單行摘要。
    for key, matches in findings.items():
        detail = " ".join(f"{json.dumps(path, ensure_ascii=True)} [{rule}]" for path, rule in sorted(matches))
        print(f"{'異常' if matches else '通過'} [{key}]" + (f" {detail}" if detail else ""))
except Exception:
    # Git filter / 設定的錯誤也可能含敏感資訊，不輸出 exception。
    print("diff-scan failed", file=sys.stderr)
    sys.exit(1)
PY
  then
    mapfile -t summary <"$log_dir/diff.log"
    local line
    for line in "${summary[@]}"; do
      [[ "$line" != 異常* ]] || failed=1
    done
  else
    summary=()
    local rule
    for rule in scope firestore-rules package-files workflows secrets; do
      summary+=("異常 [$rule] [diff-scan]")
    done
    failed=1
  fi
}

finish_gate() {
  summary+=("${test_summary[@]}" "log：$log_dir")
  if [[ "$failed" == 0 ]]; then
    summary+=('可開 PR')
  else
    summary+=('需要審查')
  fi
  printf '%s\n' "${summary[@]}" >"$log_dir/summary.log"
  cat -- "$log_dir/summary.log" >&3
  return "$failed"
}

main() {
  setup_gate "$@"
  if [[ "${REVIEW_GATE_SKIP_TESTS:-0}" == 1 ]]; then
    test_summary=('略過 Node [node-tests] [df-report] [df-teacher-cloud]' '略過 瀏覽器 [check-pages]')
    failed=1
  else
    run_test_steps
  fi
  review_diff
  finish_gate
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
