import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {summarize, exportRows} = createRequire(import.meta.url)('../assets/curriculum-report.js');

const activity = {week:1, title:'合成活動', href:'synthetic/', rounds:['甲'], codes:['A','A']};
const items = [{code:'A', text:'合成項目甲'}, {code:'B', text:'合成項目乙'}];
const roster = [{email:'synthetic@example.invalid', cls:999, seat:1}];
const attempts = [{email:roster[0].email, uid:'synthetic', activity:1, round:0,
  id:'synthetic_1_0', level:1, tries:1, passedAt:1000}];
const summarizeActivities = (activities, curriculum = items) => summarize({
  activities, items:curriculum, roster, attempts, isOpen:()=>true
});

test('重複課綱代碼保留首筆順序與文字；活動內重複代碼不重複計數；匯出一致', () => {
  const curriculum = [items[0], {...items[0], text:'重複項目'}, items[1], items[1]];
  const report = summarizeActivities([activity], curriculum);
  assert.deepEqual(report.rows.map(row => [row.code, row.text]), items.map(item => [item.code, item.text]));
  assert.deepEqual(report.rows[0].activities.map(a => a.week), [1]);
  assert.equal(report.rows[0].openCount, 1);
  assert.equal(report.rows[0].passed, 1);
  assert.equal(report.rows[0].rate, 1);
  assert.deepEqual(report.rows[1].activities, []);
  const exported = exportRows(report, '999', 'synthetic-snapshot');
  assert.equal(exported.length, 3);
  assert.deepEqual(exported.slice(1).map(row => [row[0], row[1], row[5], row[6], row[7], row[8]]), [
    ['A', items[0].text, 1, 1, 1, activity.title],
    ['B', items[1].text, 0, null, '', '未安排活動']
  ]);
  assert.deepEqual(curriculum.map(item => item.code), ['A','A','B','B']);
  assert.deepEqual(activity.codes, ['A','A']);
});

test('代碼精確比對：陣列中的 AB 不連結 A 或 B，未知代碼不影響有效活動', () => {
  const report = summarizeActivities([activity,
    {...activity, week:2, codes:['AB']}]);
  assert.deepEqual(report.rows.map(row => row.activities.map(a => a.week)), [[1], []]);
  assert.equal(report.rows[0].rate, 1);
});
