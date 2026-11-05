import {WARMUP_BANK} from './warmup-bank.js?v=20261105w1';

// 依日期辨認先前活動；week 是雲端活動 ID，不能拿來排序。
export function drawWarmup({current, activities, isOpen, bank = WARMUP_BANK, rnd = Math.random}) {
  if (!current?.date || typeof isOpen !== 'function') return [];
  const previous = activities.filter(a => a.course === current.course && a.date < current.date && isOpen(a))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const sources = new Map(previous.map(a => [a.href.split('/')[1], a]));
  const seen = new Set();
  const pool = bank.filter(q => {
    if (q.course !== current.course || !sources.has(q.activity) || seen.has(q.id)) return false;
    seen.add(q.id); return true;
  });
  // 有界洗牌，不以重抽迴圈處理重複或題庫不足。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map(q => {
    const question = q.gen(rnd), order = question.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {...question, id: q.id, source: sources.get(q.activity).title,
      options: order.map(i => question.options[i]), answer: order.indexOf(question.answer)};
  });
}

export const checkWarmup = (question, answer) => Number.isInteger(answer) && answer === question.answer;

// 僅接收活動設定與容器，不取得 shell 狀態、身分、儲存或上傳介面。
export function mountWarmup({cfg, main}) {
  if (typeof ACTIVITIES === 'undefined' || typeof isActivityOpen !== 'function') return;
  const current = ACTIVITIES.find(a => a.course === cfg.course && a.week === cfg.week);
  const draw = () => drawWarmup({current, activities: ACTIVITIES, isOpen: isActivityOpen});
  let questions = draw();
  if (!questions.length) return;
  const section = document.createElement('section');
  section.className = 'warmup'; section.id = 'warmup';
  section.setAttribute('aria-labelledby', 'warmup-title');
  main.querySelector('header').after(section);
  const node = (tag, text, parent = section) => {
    const el = document.createElement(tag); el.textContent = text; parent.append(el); return el;
  };
  const button = (text, action, parent = section) => {
    const el = node('button', text, parent); el.type = 'button'; el.className = 'btn'; el.onclick = action; return el;
  };
  function render() {
    section.replaceChildren();
    node('h2', `開場暖身 ${questions.length} 題`).id = 'warmup-title';
    node('p', '快速複習前幾週，可隨時跳過；不影響過關、成績或 XP，答案不上傳。');
    button('跳過暖身', () => {section.hidden = true; main.querySelector('#b-send').focus();});
    button('開始暖身', () => showQuestion(0, []));
  }
  function showQuestion(index, results) {
    section.replaceChildren();
    const q = questions[index];
    node('h2', `暖身 ${index + 1}／${questions.length}`).id = 'warmup-title';
    node('p', `複習：${q.source}`).className = 'small';
    node('p', q.prompt);
    const options = node('div', ''); options.className = 'warmup-options';
    q.options.forEach((text, answer) => button(text, () => {
      const next = [...results, {q, answer}];
      if (index + 1 < questions.length) showQuestion(index + 1, next);
      else showResults(next);
    }, options));
    button('跳過暖身', () => {section.hidden = true; main.querySelector('#b-send').focus();});
    section.querySelector('h2').tabIndex = -1; section.querySelector('h2').focus();
  }
  function showResults(results) {
    section.replaceChildren();
    const title = node('h2', '暖身完成，回顧一下'); title.id = 'warmup-title'; title.tabIndex = -1;
    const list = node('ol', '');
    results.forEach(({q, answer}) => {
      const item = node('li', '', list);
      node('p', `${checkWarmup(q, answer) ? '✓ 答對' : '✗ 答錯'}｜${q.prompt}`, item);
      node('p', `你的答案：${q.options[answer]}；正確答案：${q.options[q.answer]}。`, item);
      node('p', q.review, item);
    });
    button('進入活動', () => {section.hidden = true; main.querySelector('#b-send').focus();});
    title.focus();
  }
  render();
  // 換人時清除前一人的暖身作答；不持久保存。
  new MutationObserver(() => {
    if (main.hidden) {questions = draw(); section.hidden = !questions.length; render();}
  }).observe(main, {attributes: true, attributeFilter: ['hidden']});
}
