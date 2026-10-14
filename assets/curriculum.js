// 十二年國教 科技領域 資訊科技 學習內容（第四學習階段・國中）
// 條目文字依課綱原文；short 是地圖上顯示的短名稱，tag 是放射地圖上的路線短名。
// grade：建議學習年級。課綱只規定在第四學習階段（七至九年級）學完，
// 實際年級依各校課程計畫與因材網節點安排，可以直接改這裡的數字。
const CURRICULUM = {
  stage: '國中・第四學習階段',
  core: '資訊科技',
  strands: [
    { id: 'A', tag: '演算法', name: '演算法', items: [
      { code: '資A-IV-1', grade: 7, short: '演算法概念', text: '演算法基本概念。' },
      { code: '資A-IV-2', grade: 8, short: '陣列結構', text: '陣列資料結構的概念與應用。' },
      { code: '資A-IV-3', grade: 8, short: '基本演算法', text: '基本演算法的介紹。' }
    ]},
    { id: 'P', tag: '程式設計', name: '程式設計', items: [
      { code: '資P-IV-1', grade: 7, short: '程式語言概念', text: '程式語言基本概念、功能及應用。' },
      { code: '資P-IV-2', grade: 7, short: '結構化程式', text: '結構化程式設計。' },
      { code: '資P-IV-3', grade: 8, short: '陣列程式實作', text: '陣列程式設計實作。' },
      { code: '資P-IV-4', grade: 8, short: '模組化概念', text: '模組化程式設計的概念。' },
      { code: '資P-IV-5', grade: 8, short: '模組化解題', text: '模組化程式設計與問題解決實作。' }
    ]},
    { id: 'S', tag: '系統平臺', name: '系統平臺', items: [
      { code: '資S-IV-1', grade: 9, short: '平臺發展演進', text: '系統平臺重要發展與演進。' },
      { code: '資S-IV-2', grade: 9, short: '平臺組成與運作', text: '系統平臺之組成架構與基本運作原理。' },
      { code: '資S-IV-3', grade: 9, short: '網路技術', text: '網路技術的概念與介紹。' },
      { code: '資S-IV-4', grade: 9, short: '網路服務', text: '網路服務的概念與介紹。' }
    ]},
    { id: 'D', tag: '資料處理', name: '資料表示、處理及分析', items: [
      { code: '資D-IV-1', grade: 9, short: '資料數位化', text: '資料數位化之原理與方法。' },
      { code: '資D-IV-2', grade: 9, short: '數位資料表示', text: '數位資料的表示方法。' },
      { code: '資D-IV-3', grade: 9, short: '資料處理', text: '資料處理概念與方法。' }
    ]},
    { id: 'T', tag: '資訊應用', name: '資訊科技應用', items: [
      { code: '資T-IV-1', grade: 7, short: '資料處理專題', text: '資料處理應用專題。' },
      { code: '資T-IV-2', grade: 9, short: '資訊科技專題', text: '資訊科技應用專題。' }
    ]},
    { id: 'H', tag: '資訊與社會', name: '資訊科技與人類社會', items: [
      { code: '資H-IV-1', grade: 7, short: '個資保護', text: '個人資料保護。' },
      { code: '資H-IV-2', grade: 7, short: '合理使用', text: '資訊科技合理使用原則。' },
      { code: '資H-IV-3', grade: 7, short: '資訊安全', text: '資訊安全。' },
      { code: '資H-IV-4', grade: 8, short: '媒體與社會議題', text: '媒體與資訊科技相關社會議題。' },
      { code: '資H-IV-5', grade: 8, short: '倫理與法律', text: '資訊倫理與法律。' },
      { code: '資H-IV-6', grade: 9, short: '對生活的影響', text: '資訊科技對人類生活之影響。' },
      { code: '資H-IV-7', grade: 9, short: '資訊產業', text: '常見資訊產業的特性與種類。' }
    ]}
  ]
};

// 開設中的課程（學生入口）。year 要和 TERMS 的 year 對上，學期進度才會列出這一列。
const COURSES = [
  { id: '115-g9', name: '九年級資訊科技', short: '九年級', year: 115, path: '115-g9/' }
];

// 學期：start 填開學那週的星期一，weeks 是這學期的週數。
// 下學期的開學日等學校行事曆公布後再改。
const TERMS = [
  { id: '115-1', year: 115, name: '115 學年上學期', start: '2026-08-31', weeks: 21 },
  { id: '115-2', year: 115, name: '115 學年下學期', start: '2027-02-15', weeks: 20 }
];
