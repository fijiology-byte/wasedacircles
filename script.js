// script.js
// Fetch published Google Sheets (pubhtml) and render into the existing UI.
// Expects first row of each sheet to be headers: 名前, 活動内容, 活動日時、場所, 所属人数, 外国人学生の受け入れ
// If a sheet has no data rows (only header or empty), it is treated as "work in progress" and skipped.

const CONFIG = {
  sheetsUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vROISh1dscDOa7SnWAyXDSoXT0s6pZ_cQuic8i9LN937Xpx3SoxkR-g_hvMjGXwRwBx41HhMcBRCTUM/pubhtml",
  pageSize: 18,
  expectedHeaders: ["名前", "活動内容", "活動日時、場所", "所属人数", "外国人学生の受け入れ"]
};

let data = [];
let filtered = [];
let currentPage = 1;
let sortAsc = true;

const grid = document.getElementById("cardGrid");
const spinner = document.getElementById("spinner");
const noResults = document.getElementById("noResults");
const pagination = document.getElementById("pagination");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const foreignCheckbox = document.getElementById("filterForeignerFriendly");
const sortBtn = document.getElementById("sortMembers");

// Utility: text content trimmed
function textOf(node){
  return node ? node.textContent.trim() : "";
}

// Parse published Google Sheets HTML and extract tables
async function fetchSheetsHtml(url){
  spinner.hidden = false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch sheet");
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    // Google published HTML often uses <table class="waffle"> for each sheet
    const tables = Array.from(doc.querySelectorAll("table.waffle, table"));
    const sheets = [];
    tables.forEach((table) => {
      // Extract rows
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length === 0) return;
      // First row = header
      const headerCells = Array.from(rows[0].querySelectorAll("th,td")).map(textOf);
      // Data rows
      const dataRows = rows.slice(1).map(r => Array.from(r.querySelectorAll("td")).map(textOf));
      // If there are no non-empty data rows, treat as empty sheet (work in progress)
      const hasData = dataRows.some(cols => cols.some(c => c !== ""));
      if (!hasData) return; // skip empty sheet
      sheets.push({ header: headerCells, rows: dataRows });
    });
    return sheets;
  } catch (err) {
    console.error("fetchSheetsHtml error:", err);
    throw err;
  } finally {
    spinner.hidden = true;
  }
}

// Convert sheets (multiple) into unified data array of objects
function sheetsToData(sheets){
  const out = [];
  sheets.forEach(sheet => {
    const header = sheet.header;
    sheet.rows.forEach(row => {
      // Skip completely empty rows
      if (row.every(cell => cell === "")) return;
      const obj = {};
      // Try to map by header names first (exact match), otherwise by index
      CONFIG.expectedHeaders.forEach((expected, idx) => {
        // find index of expected header in header row
        const foundIndex = header.findIndex(h => h.trim() === expected);
        if (foundIndex !== -1) {
          obj[expected] = row[foundIndex] || "";
        } else {
          // fallback: use same index position if header length matches
          obj[expected] = row[idx] || "";
        }
      });
      // Optional: if sheet contains extra columns like image_url, category1, etc., try to capture them
      header.forEach((h, i) => {
        const key = h || `col_${i}`;
        if (!CONFIG.expectedHeaders.includes(key)) {
          obj[key] = row[i] || "";
        }
      });
      out.push(obj);
    });
  });
  return out;
}

// Apply search and filters to `data` -> `filtered`
function applyFiltersAndSearch(){
  const q = (searchInput.value || "").trim().toLowerCase();
  const foreignOnly = foreignCheckbox ? foreignCheckbox.checked : false;
  filtered = data.filter(item => {
    // foreigner-friendly filter: match "可" or "yes" or "true" (case-insensitive)
    if (foreignOnly) {
      const val = (item["外国人学生の受け入れ"] || "").toString().trim().toLowerCase();
      if (!(val === "可" || val === "yes" || val === "true" || val === "y")) return false;
    }
    if (!q) return true;
    // search across 名前 and 活動内容 and other text fields
    const hay = [
      item["名前"],
      item["活動内容"],
      item["活動日時、場所"]
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });

  // sort by 所属人数 numeric if present
  filtered.sort((a,b) => {
    const na = parseInt((a["所属人数"]||"").replace(/[^\d-]/g,""),10) || 0;
    const nb = parseInt((b["所属人数"]||"").replace(/[^\d-]/g,""),10) || 0;
    return sortAsc ? na - nb : nb - na;
  });

  currentPage = 1;
}

// Render grid page
function render(){
  applyFiltersAndSearch();
  grid.innerHTML = "";
  if (!filtered.length) {
    noResults.hidden = false;
    pagination.innerHTML = "";
    return;
  } else {
    noResults.hidden = true;
  }

  const start = (currentPage - 1) * CONFIG.pageSize;
  const pageItems = filtered.slice(start, start + CONFIG.pageSize);

  pageItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    // background image: try common keys (image_url, Image, 画像)
    const imageCandidates = ["image_url","Image","画像","image","写真"];
    let image = null;
    for (const k of imageCandidates) {
      if (item[k]) { image = item[k]; break; }
    }
    if (!image) image = "assets/campus-fallback.jpg";

    const bg = document.createElement("div");
    bg.className = "card-bg";
    bg.style.backgroundImage = `url('${image}')`;
    card.appendChild(bg);

    // top strip (name)
    const topStrip = document.createElement("div");
    topStrip.className = "card-strip-top";
    topStrip.textContent = item["名前"] || "—";
    card.appendChild(topStrip);

    // body area (anchor for overlay)
    const body = document.createElement("div");
    body.className = "card-body";
    // meta line
    const meta = document.createElement("div");
    meta.className = "meta";
    const whenWhere = item["活動日時、場所"] || "";
    const members = item["所属人数"] || "";
    meta.textContent = `${whenWhere}${whenWhere && members ? " · " : ""}${members ? members + " members" : ""}`;
    body.appendChild(meta);
    card.appendChild(body);

    // bottom strip (activity)
    const bottomStrip = document.createElement("div");
    bottomStrip.className = "card-strip-bottom";
    bottomStrip.textContent = item["活動内容"] || "";
    card.appendChild(bottomStrip);

    // overlay (hidden by default)
    const overlay = document.createElement("div");
    overlay.className = "card-overlay hidden";
    overlay.innerHTML = `
      <div class="overlay-header">
        <div class="overlay-title">${escapeHtml(item["名前"] || "")}</div>
        <button class="overlay-close" aria-label="Close">X</button>
      </div>
      <div class="overlay-body">
        <p>${escapeHtml(item["活動内容"] || "")}</p>
        <p class="meta">${escapeHtml(item["活動日時、場所"] || "")}</p>
        <p>Foreign friendly: ${escapeHtml(item["外国人学生の受け入れ"] || "")}</p>
      </div>
      <div class="overlay-actions">
        <a class="btn-action" href="#" target="_blank" rel="noopener">Contact</a>
        <a class="btn-action" href="#" target="_blank" rel="noopener">Link</a>
      </div>
    `;
    card.appendChild(overlay);

    // click to toggle overlay (instant, no animation)
    card.addEventListener("click", (ev) => {
      // ignore clicks on overlay links or close button
      if (ev.target.tagName === "A" || ev.target.classList.contains("overlay-close")) return;
      // close other overlays
      document.querySelectorAll(".card-overlay").forEach(o => o.classList.add("hidden"));
      overlay.classList.toggle("hidden");
    });

    // close button
    overlay.querySelector(".overlay-close").addEventListener("click", (ev) => {
      ev.stopPropagation();
      overlay.classList.add("hidden");
    });

    // outside click closes overlays: listen once per document
    document.addEventListener("click", (ev) => {
      // if click is outside any card, close all overlays
      const anyCard = ev.target.closest(".card");
      if (!anyCard) {
        document.querySelectorAll(".card-overlay").forEach(o => o.classList.add("hidden"));
      }
    });

    grid.appendChild(card);
  });

  renderPagination();
}

function renderPagination(){
  const totalPages = Math.ceil(filtered.length / CONFIG.pageSize) || 1;
  pagination.innerHTML = "";
  for (let i = 1; i <= totalPages; i++){
    const btn = document.createElement("button");
    btn.className = "page-btn" + (i === currentPage ? " active" : "");
    btn.textContent = i;
    btn.disabled = (i === currentPage);
    btn.addEventListener("click", () => {
      currentPage = i;
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    pagination.appendChild(btn);
  }
}

// Escape HTML for safety
function escapeHtml(s){
  if (!s) return "";
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

// Initialize: fetch sheets and render
async function init(){
  try {
    spinner.hidden = false;
    const sheets = await fetchSheetsHtml(CONFIG.sheetsUrl);
    if (!sheets || sheets.length === 0) {
      // No non-empty sheets found
      data = [];
      filtered = [];
      render();
      return;
    }
    data = sheetsToData(sheets);
    filtered = data.slice();
    currentPage = 1;
    render();
  } catch (err) {
    console.error("Initialization error:", err);
    noResults.hidden = false;
    noResults.textContent = "Failed to load sheet data. If the sheet is private or not published as HTML, publish it (File → Publish to web) or use the CSV publish option.";
  } finally {
    spinner.hidden = true;
  }
}

// Event handlers
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  applyFiltersAndSearch();
  render();
});

if (foreignCheckbox) {
  foreignCheckbox.addEventListener("change", () => {
    applyFiltersAndSearch();
    render();
  });
}

if (sortBtn) {
  sortBtn.addEventListener("click", () => {
    sortAsc = !sortAsc;
    sortBtn.textContent = sortAsc ? "Min → Max" : "Max → Min";
    applyFiltersAndSearch();
    render();
  });
}

// Kick off
init();
