// script.js
// Replace this CSV URL if you publish a different sheet or use a sheet gid per sheet.
// Default uses the CSV published link you provided earlier (change if needed).
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLZ5vNZ0qR0Y6cHeON5BkK5NDrOblOq9GIfVHwoosehKh9d_wuCGUzr7M5xsmbw8kYKntJHcQ-Dszz/pub?output=csv";

// UI elements
const grid = document.getElementById('grid');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const noresultsEl = document.getElementById('noresults');
const paginationEl = document.getElementById('pagination');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const foreignerToggle = document.getElementById('foreignerToggle');
const categorySelect = document.getElementById('categorySelect');
const subcategorySelect = document.getElementById('subcategorySelect');
const sortToggle = document.getElementById('sortToggle');
const circleBtns = document.querySelectorAll('.circle-btn');

let rawRows = []; // raw CSV rows as objects
let records = []; // normalized records
let pageSize = 12;
let currentPage = 1;
let currentFilter = { query: '', foreigner: false, category: '', subcategory: '', circleBtn: '' };
let sortOrder = 'desc'; // 'desc' or 'asc'
let smallestNumeric = null;
let unknownValue = 1; // will be computed

// Static mapping for category -> subcategories (you provided ranges; this is a simplified mapping)
const SUBCATEGORY_MAP = {
  "sports_nonball": [
    "バドミントン","ダンス","武道","乗馬","ヨット","スキー","水泳","サイクリング","アウトドア","そのほかのスポーツ"
  ],
  "gakumon":[
    "政治","経済","歴史","宗教","哲学","法律","自然科学","言語","日本文学","日本文化","学問","趣味","技術"
  ],
  "media":["出版 / Publication","コミュニケーション / Communication","マスメディア / Media","企画 / Planning","レクリエーション / Recreation"],
  "culture":["舞台芸術","演劇","映画","音楽","声楽","美術","その他の文化"],
  "other":["学生稲門会"]
};

// Utility: simple CSV parser (handles quoted fields minimally)
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if(lines.length === 0) return [];
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    for(let j=0;j<headers.length;j++){
      obj[headers[j].trim()] = (cols[j] || '').trim();
    }
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line){
  const result = [];
  let cur = '', inQuotes = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"' ){ inQuotes = !inQuotes; continue; }
    if(ch === ',' && !inQuotes){ result.push(cur); cur=''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

// Normalization helpers
function extractNumbersFromText(text){
  if(!text) return [];
  // normalize full-width digits
  text = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  // find all numbers
  const nums = [...text.matchAll(/(\d+)/g)].map(m => Number(m[1]));
  return nums;
}
function parseMemberField(raw){
  if(!raw) return { raw:'', min:null, max:null, normalized:null, display:'' };
  const s = raw.trim();
  if(s === '情報なし' || s === '書いていない' || s === '不明') {
    return { raw:s, min:null, max:null, normalized:null, display:s };
  }
  // extract numbers
  const nums = extractNumbersFromText(s);
  if(nums.length === 0){
    // no explicit number -> treat as unknown (will be assigned later)
    return { raw:s, min:null, max:null, normalized:null, display:s };
  }
  if(nums.length === 1){
    // single number (may be approximate like 約100人)
    const n = nums[0];
    return { raw:s, min:n, max:n, normalized:n, display:s };
  }
  // multiple numbers -> treat as range: take first and last
  const min = nums[0];
  const max = nums[nums.length-1];
  return { raw:s, min:min, max:max, normalized:(min+max)/2, display:s };
}

// Compute smallest numeric > 0 across sheet
function computeSmallestNumeric(records){
  let min = Infinity;
  records.forEach(r=>{
    if(r.members && typeof r.members === 'number' && r.members > 0){
      if(r.members < min) min = r.members;
    }
    // also consider members_min if present
    if(r.members_min && typeof r.members_min === 'number' && r.members_min > 0){
      if(r.members_min < min) min = r.members_min;
    }
  });
  return (min === Infinity) ? null : min;
}

// Assign unknown value: smallest positive less than smallestNumeric
function assignUnknownValue(smallest){
  if(!smallest || smallest <= 1) return 0.5;
  return smallest / 2;
}

// Convert a CSV row object to normalized record used by UI
function normalizeRow(row){
  // expected headers: 名前, スポーツ種類, 活動内容, 活動日時、場所, 所属人数, 外国人学生の受け入れ, 画像URL, サブカテゴリコード
  const name = row['名前'] || row['Name'] || '';
  const type = row['スポーツ種類'] || row['Type'] || '';
  const activity = row['活動内容'] || row['Activity'] || '';
  const schedule = row['活動日時、場所'] || row['活動日時、場所'] || row['Schedule'] || '';
  const membersRaw = row['所属人数'] || row['Members'] || '';
  const foreignRaw = row['外国人学生の受け入れ'] || row['Foreign'] || '';
  const image = row['画像URL'] || row['Image'] || '';
  const subcode = row['サブカテゴリコード'] || row['SubcategoryCode'] || '';

  const membersParsed = parseMemberField(membersRaw);
  const foreignParsed = parseMemberField(foreignRaw);

  return {
    name, type, activity, schedule,
    members_raw: membersParsed.raw,
    members_min: membersParsed.min,
    members_max: membersParsed.max,
    members: membersParsed.normalized,
    members_display: membersParsed.display || membersRaw,
    foreign_raw: foreignParsed.raw,
    foreign_min: foreignParsed.min,
    foreign_max: foreignParsed.max,
    foreign: foreignParsed.normalized,
    foreign_display: foreignParsed.display || foreignRaw,
    image: image || 'assets/fallback.jpg',
    subcode
  };
}

// Render functions
function renderGrid(recordsToShow){
  grid.innerHTML = '';
  if(recordsToShow.length === 0){
    noresultsEl.hidden = false;
    return;
  } else {
    noresultsEl.hidden = true;
  }

  recordsToShow.forEach((rec, idx) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.backgroundImage = `url("${rec.image}")`;
    card.setAttribute('role','listitem');

    // top strip
    const topStrip = document.createElement('div');
    topStrip.className = 'strip-top';
    topStrip.textContent = rec.name || '無名';
    card.appendChild(topStrip);

    // meta strip bottom
    const bottomStrip = document.createElement('div');
    bottomStrip.className = 'strip-bottom';
    bottomStrip.textContent = `${rec.type || ''} ・ ${rec.members_display || '情報なし'}`;
    card.appendChild(bottomStrip);

    // hidden expanded content
    const expanded = document.createElement('div');
    expanded.className = 'expanded-content';
    expanded.innerHTML = `
      <div class="meta"><strong>活動内容:</strong> ${rec.activity || '情報なし'}</div>
      <div class="meta"><strong>日時・場所:</strong> ${rec.schedule || '情報なし'}</div>
      <div class="meta"><strong>所属人数:</strong> ${rec.members_display || '情報なし'}</div>
      <div class="meta"><strong>外国人受け入れ:</strong> ${rec.foreign_display || '情報なし'}</div>
    `;
    const footer = document.createElement('div');
    footer.className = 'expanded-footer';
    footer.innerHTML = `
      <a class="action-btn" href="#" target="_blank" rel="noopener">Contact</a>
      <a class="action-btn" href="#" target="_blank" rel="noopener">Link</a>
    `;
    expanded.appendChild(footer);
    card.appendChild(expanded);

    // click to expand inline (instant)
    card.addEventListener('click', (e)=>{
      // if clicking a link inside footer, let it proceed
      if(e.target.tagName.toLowerCase() === 'a') return;
      const isExpanded = card.classList.contains('expanded');
      // close any other expanded
      document.querySelectorAll('.card.expanded').forEach(c=>c.classList.remove('expanded'));
      if(!isExpanded) card.classList.add('expanded');
      else card.classList.remove('expanded');
    });

    // outside click to close (listen on document)
    document.addEventListener('click', (ev)=>{
      if(!card.contains(ev.target) && card.classList.contains('expanded')){
        card.classList.remove('expanded');
      }
    });

    grid.appendChild(card);
  });
}

// Pagination
function paginate(array, page = 1, size = pageSize){
  const start = (page-1)*size;
  return array.slice(start, start+size);
}
function renderPagination(total, page){
  paginationEl.innerHTML = '';
  const pages = Math.ceil(total / pageSize);
  if(pages <= 1) return;
  for(let i=1;i<=pages;i++){
    const btn = document.createElement('button');
    btn.textContent = i;
    if(i === page) btn.disabled = true;
    btn.addEventListener('click', ()=> {
      currentPage = i;
      applyAndRender();
      window.scrollTo({top:120, behavior:'instant'});
    });
    paginationEl.appendChild(btn);
  }
}

// Filtering & sorting
function applyFilters(records){
  let out = records.slice();

  // search query (applies on name, activity, type)
  const q = currentFilter.query.trim().toLowerCase();
  if(q){
    out = out.filter(r => (r.name && r.name.toLowerCase().includes(q)) ||
                         (r.activity && r.activity.toLowerCase().includes(q)) ||
                         (r.type && r.type.toLowerCase().includes(q)));
  }

  // foreigner toggle: require foreign > 0
  if(currentFilter.foreigner){
    out = out.filter(r => {
      // if foreign is null but foreign_min exists, use that; else treat unknown as unknown (we treat unknown as positive later)
      return (typeof r.foreign === 'number' && r.foreign > 0) || (typeof r.foreign_min === 'number' && r.foreign_min > 0);
    });
  }

  // category/subcategory filtering: we use type (スポーツ種類) or subcode if available
  if(currentFilter.subcategory){
    out = out.filter(r => (r.type && r.type === currentFilter.subcategory));
  } else if(currentFilter.category){
    // if category selected but no subcategory, filter by known subcategory list
    const list = SUBCATEGORY_MAP[currentFilter.category] || [];
    if(list.length) out = out.filter(r => list.includes(r.type));
  }

  // circle button quick filter (exact match on type)
  if(currentFilter.circleBtn){
    out = out.filter(r => r.type === currentFilter.circleBtn);
  }

  // sort by members (use normalized members; unknowns will be assigned unknownValue)
  out.forEach(r => {
    if(typeof r.members !== 'number' || r.members === null){
      r._members_for_sort = unknownValue;
    } else {
      r._members_for_sort = r.members;
    }
  });

  out.sort((a,b)=>{
    if(sortOrder === 'desc') return b._members_for_sort - a._members_for_sort;
    return a._members_for_sort - b._members_for_sort;
  });

  return out;
}

// Apply filters, paginate, render
function applyAndRender(){
  const filtered = applyFilters(records);
  const total = filtered.length;
  const pageRecords = paginate(filtered, currentPage, pageSize);
  renderGrid(pageRecords);
  renderPagination(total, currentPage);
}

// Event wiring
searchForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  currentFilter.query = searchInput.value || '';
  currentPage = 1;
  applyAndRender();
});

foreignerToggle.addEventListener('change', ()=>{
  currentFilter.foreigner = foreignerToggle.checked;
  currentPage = 1;
  applyAndRender();
});

categorySelect.addEventListener('change', ()=>{
  const key = categorySelect.value;
  currentFilter.category = key;
  currentFilter.subcategory = '';
  // populate subcategory select
  populateSubcategories(key);
  currentPage = 1;
  applyAndRender();
});

subcategorySelect.addEventListener('change', ()=>{
  currentFilter.subcategory = subcategorySelect.value;
  currentPage = 1;
  applyAndRender();
});

sortToggle.addEventListener('click', ()=>{
  sortOrder = (sortOrder === 'desc') ? 'asc' : 'desc';
  sortToggle.textContent = (sortOrder === 'desc') ? 'Max ↔ Min' : 'Min ↔ Max';
  applyAndRender();
});

circleBtns.forEach(b=>{
  b.addEventListener('click', ()=>{
    const val = b.dataset.value || '';
    currentFilter.circleBtn = val;
    currentPage = 1;
    applyAndRender();
  });
});

// Populate subcategories (static mapping)
function populateSubcategories(categoryKey){
  subcategorySelect.innerHTML = '';
  if(!categoryKey || !SUBCATEGORY_MAP[categoryKey]){
    subcategorySelect.disabled = true;
    subcategorySelect.innerHTML = '<option value="">-- カテゴリを選んでください --</option>';
    return;
  }
  subcategorySelect.disabled = false;
  subcategorySelect.appendChild(new Option('-- 全て --', ''));
  SUBCATEGORY_MAP[categoryKey].forEach(label=>{
    subcategorySelect.appendChild(new Option(label, label));
  });
}

// Fetch CSV and initialize
async function init(){
  try{
    loadingEl.hidden = false;
    errorEl.hidden = true;
    noresultsEl.hidden = true;

    const res = await fetch(SHEET_CSV_URL);
    if(!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    rawRows = parseCSV(text);

    // normalize rows
    records = rawRows.map(r => normalizeRow(r));

    // compute smallest numeric across members and foreign fields
    smallestNumeric = computeSmallestNumeric(records);
    unknownValue = assignUnknownValue(smallestNumeric);

    // For any record with null members but members_raw not numeric, assign normalized unknownValue for sorting only
    records.forEach(r=>{
      if((r.members === null || typeof r.members !== 'number') && r.members_raw && r.members_raw !== '情報なし'){
        // keep members null for display, but sorting uses unknownValue (handled in applyFilters)
      }
      // if members_raw is '情報なし' keep null
    });

    // initial render
    loadingEl.hidden = true;
    applyAndRender();
  } catch(err){
    console.error(err);
    loadingEl.hidden = true;
    errorEl.hidden = false;
  }
}

// Start
init();
