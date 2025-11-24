// script.js
document.addEventListener('DOMContentLoaded', () => {
  initFilterToggle();
  initSortButton();/Users/ljh/Desktop/waseda circle 2/script.js
  initSearchForm();
  initLanguageSelectors();
  initSubcategoryChips();
  initGlobalHandlers();

  // Load data (replace with Google Sheets fetch); using sample for now
  showSpinner(true);
  setTimeout(() => {
    allItems = SAMPLE_DATA;
    showSpinner(false);
    paginateAndRender(allItems);
  }, 300);
});

/* ---------- Data & constants ---------- */
let allItems = [];
const PER_PAGE = 18; // 6 columns * 3 rows
const FALLBACK_IMG = 'assets/waseda-campus.jpg';

const SAMPLE_DATA = [
  { id: 'c1', title: 'Music Circle', category: 'culture', subcategory: 'music', level: 'beginner', members: 24, foreignerFriendly: true, bg: '' },
  { id: 'c2', title: 'Dance Circle', category: 'culture', subcategory: 'dance', level: 'advanced', members: 12, foreignerFriendly: false, bg: '' },
  { id: 'c3', title: 'Tech Circle', category: 'tech', subcategory: 'coding', level: 'beginner', members: 48, foreignerFriendly: true, bg: '' },
  // add more rows to test pagination...
];

/* ---------- Language reload ---------- */
function initLanguageSelectors() {
  const setLang = (lang) => {
    const url = new URL(window.location);
    url.searchParams.set('lang', lang);
    window.location.replace(url); // hard reload per spec
  };
  document.getElementById('langSelect')?.addEventListener('change', e => setLang(e.target.value));
  document.getElementById('langSelectFooter')?.addEventListener('change', e => setLang(e.target.value));
}

/* ---------- Filter panel toggle ---------- */
function initFilterToggle() {
  const toggle = document.getElementById('toggleFilters');
  const panel = document.getElementById('filtersPanel');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    if (expanded) {
      panel.hidden = true;
      toggle.textContent = 'Expand';
    } else {
      panel.hidden = false;
      toggle.textContent = 'Collapse';
    }
  });
}

/* ---------- Sort button toggle & wiring ---------- */
function initSortButton() {
  const btn = document.getElementById('sortMembers');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const dir = btn.getAttribute('data-sort') || 'asc';
    const next = dir === 'asc' ? 'desc' : 'asc';
    btn.setAttribute('data-sort', next);
    btn.setAttribute('aria-pressed', String(next === 'desc'));
    btn.textContent = next === 'asc' ? 'Min → Max' : 'Max → Min';

    const items = getFilteredItems();
    const sorted = [...items].sort((a, b) => next === 'asc' ? a.members - b.members : b.members - a.members);
    paginateAndRender(sorted, 1);
  });
}

/* ---------- Search applies on Enter and replaces grid ---------- */
function initSearchForm() {
  const form = document.getElementById('searchForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput')?.value?.trim().toLowerCase() || '';
    showSpinner(true);
    setTimeout(() => {
      showSpinner(false);
      const items = getFilteredItems();
      const results = items.filter(item =>
        [item.title, item.category, item.subcategory, item.level]
          .some(v => String(v || '').toLowerCase().includes(q))
      );
      paginateAndRender(results, 1);
    }, 150);
  });
}

/* ---------- Subcategory circular chips (vertical, expandable) ---------- */
const SUBCAT_LIST = ['music','dance','photography','art','coding','design','sports','literature'];
function initSubcategoryChips() {
  const list = document.getElementById('subcatList');
  const toggle = document.getElementById('toggleSubcats');
  if (!list || !toggle) return;

  const renderChips = () => {
    const expanded = list.getAttribute('aria-expanded') === 'true';
    list.innerHTML = '';
    SUBCAT_LIST.forEach((name, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = name[0].toUpperCase(); // compact label
      chip.title = name;
      chip.hidden = !expanded && i >= 6; // show first 6, expand shows all
      chip.addEventListener('click', () => {
        document.getElementById('filterSubcategory').value = name;
        paginateAndRender(getFilteredItems(), 1);
      });
      list.appendChild(chip);
    });
  };

  toggle.addEventListener('click', () => {
    const expanded = list.getAttribute('aria-expanded') === 'true';
    list.setAttribute('aria-expanded', String(!expanded));
    toggle.textContent = expanded ? 'Expand' : 'Collapse';
    renderChips();
  });

  renderChips();
}

/* ---------- Spinner helpers ---------- */
function showSpinner(show) {
  const spinner = document.getElementById('spinner');
  if (spinner) spinner.hidden = !show;
}

/* ---------- Grid + pagination ---------- */
const grid = document.getElementById('cardGrid');
const pagination = document.getElementById('pagination');
const noResults = document.getElementById('noResults');

function paginateAndRender(items, page = 1, perPage = PER_PAGE) {
  const pages = Math.ceil(items.length / perPage);
  const slice = items.slice((page - 1) * perPage, page * perPage);
  renderGrid(slice);
  renderPagination(pages, page, items, perPage);
  noResults.hidden = pages > 0;
}

function renderGrid(items) {
  grid.innerHTML = '';
  items.forEach(renderCard);
}

function renderPagination(pages, current, items, perPage) {
  pagination.innerHTML = '';
  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (i === current ? ' active' : '');
    btn.textContent = i;
    btn.addEventListener('click', () => paginateAndRender(items, i, perPage));
    pagination.appendChild(btn);
  }
}

/* ---------- Filters aggregation ---------- */
function getFilteredItems() {
  const cat = document.getElementById('filterCategory')?.value || '';
  const sub = document.getElementById('filterSubcategory')?.value || '';
  const lvl = document.getElementById('filterLevel')?.value || '';
  const ff = document.getElementById('filterForeignerFriendly')?.checked || false;

  return allItems.filter(item => {
    if (cat && item.category !== cat) return false;
    if (sub && item.subcategory !== sub) return false;
    if (lvl && item.level !== lvl) return false;
    if (ff && item.foreignerFriendly !== true) return false;
    return true;
  });
}

/* ---------- Filter interactions ---------- */
['filterCategory','filterSubcategory','filterLevel'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    paginateAndRender(getFilteredItems(), 1);
  });
});
document.getElementById('filterForeignerFriendly')?.addEventListener('change', () => {
  paginateAndRender(getFilteredItems(), 1);
});

/* ---------- Card rendering & interactions ---------- */
function renderCard(item) {
  const li = document.createElement('div');
  li.className = 'card';
  li.setAttribute('role', 'listitem');
  li.dataset.id = item.id;

  const bg = document.createElement('div');
  bg.className = 'card-bg';
  bg.style.backgroundImage = `url('${item.bg || FALLBACK_IMG}')`;

  const top = document.createElement('div');
  top.className = 'card-strip-top';
  top.textContent = item.title;

  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <p class="meta">Members: ${item.members}</p>
    <p class="meta">Category: ${item.category} • ${item.subcategory}</p>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay hidden';
  overlay.innerHTML = `
    <div class="overlay-header">
      <div class="overlay-title">${item.title}</div>
      <button class="overlay-close" type="button" aria-label="Close details">X</button>
    </div>
    <div class="overlay-content">
      <p class="meta">Level: ${item.level}</p>
      <div class="overlay-actions">
        <a class="btn-action" href="#" role="button" target="_blank" rel="noopener">Visit</a>
        <a class="btn-action" href="#" role="button" target="_blank" rel="noopener">Contact</a>
      </div>
    </div>
  `;

  li.append(bg, top, body, overlay);

  // Click card toggles overlay (instant; no hover effects used)
  li.addEventListener('click', (e) => {
    if (e.target.closest('.overlay-close')) return; // close handled below
    overlay.classList.toggle('hidden');
  });

  overlay.querySelector('.overlay-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.classList.add('hidden');
  });

  // Close on true outside click (click anywhere outside the card)
  document.addEventListener('click', (e) => {
    if (!li.contains(e.target)) overlay.classList.add('hidden');
  });

  grid.appendChild(li);
}

/* ---------- Global handlers ---------- */
function initGlobalHandlers() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllOverlays();
  });
}

function closeAllOverlays() {
  document.querySelectorAll('.card-overlay').forEach(overlay => {
    overlay.classList.add('hidden');
  });
}

/* ---------- Integration notes ----------
- Replace SAMPLE_DATA with data from Google Sheets via fetch() of a published CSV or JSON.
- After load, set allItems and call paginateAndRender(allItems).
- Manual translations: use ?lang=en|ja to select translations; on reload, hydrate text from your translation maps.
----------------------------------------- */
