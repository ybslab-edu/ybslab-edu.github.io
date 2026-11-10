/* 教師首頁唯讀摘要；沿用課程、活動與鎖定設定，不修改任何設定或雲端資料。 */
(() => {
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function render() {
    const courses = document.getElementById('teacher-courses');
    const activities = document.getElementById('teacher-activities');
    if (!courses || !activities) return;
    courses.replaceChildren(); activities.replaceChildren();
    for (const course of COURSES) {
      const list = ACTIVITIES.filter(a => a.course === course.id);
      const open = list.filter(a => course.open && isActivityOpen(a)).length;
      const card = node('article', undefined, 'course-card');
      card.append(node('p', course.id.toUpperCase(), 'tool-kicker'), node('h3', course.name),
        node('p', course.open ? '課程已開設' : '課程未開設', course.open ? 'state-open' : 'muted'),
        node('p', '已開放 '+open+' ／ '+list.length+' 個活動', 'muted'));
      courses.append(card);
      const group = node('section'); group.append(node('h3', course.name));
      const ul = node('ul');
      for (const activity of list) {
        const li = node('li'), a = node('a', activity.title);
        a.href = '../../'+activity.href;
        li.append(a, node('span', !course.open ? '課程未開設' : isActivityOpen(activity) ? '已開放' : '未開放',
          course.open && isActivityOpen(activity) ? 'state-open' : 'muted'));
        ul.append(li);
      }
      group.append(ul); activities.append(group);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true});
  else render();
})();
