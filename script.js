"use strict";

/* =========================================================
   CONFIG
   ========================================================= */
const CONFIG = {
  storagePath: "StorageBox",       // folder in the repo that holds your assets
  manifestUrl: "/storagebox-manifest.json" // written by build.js at deploy time
};

/* =========================================================
   Constants / helpers
   ========================================================= */
const EXT_TYPE = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", svg: "image", ico: "image", bmp: "image", avif: "image",
  gif: "gif",
  mp4: "video", webm: "video", mov: "video", mkv: "video", m4v: "video",
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", m4a: "audio",
};

function typeOf(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return EXT_TYPE[ext] || "other";
}
function extOf(filename) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}
function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Same-origin URL for a path relative to storagePath, e.g. "img/icon.png".
 *  The file physically exists on this deploy (Netlify/Vercel cloned it,
 *  private repos included) so no external API or CORS is involved. */
function rawUrlFor(relPath) {
  return `${location.origin}/${CONFIG.storagePath}/${relPath}`;
}

/** "Public" pretty URL that lives on this site's own domain, e.g. https://domain.com/img/icon.png */
function publicUrlFor(relPath) {
  return `${location.origin}/${relPath}`;
}

/* =========================================================
   1) ASSET DELIVERY ROUTER
   Runs first. If the current URL points at a file (has an
   extension), we render ONLY the asset — no dashboard chrome.
   ========================================================= */
(function routeRequest() {
  let path = decodeURIComponent(location.pathname).replace(/^\/+/, "").replace(/\/+$/, "");

  // Allow both /storagebox/img/icon.png and /img/icon.png
  const storageLower = CONFIG.storagePath.toLowerCase();
  if (path.toLowerCase().startsWith(storageLower + "/")) {
    path = path.slice(storageLower.length + 1);
  }

  const looksLikeFile = path.includes(".") && !path.endsWith("/");

  if (path && looksLikeFile) {
    renderAssetView(path);
  } else {
    document.getElementById("dashboardView").hidden = false;
    initDashboard(path); // path (a folder) can be used to deep-link into a subfolder
  }
})();

function renderAssetView(relPath) {
  const view = document.getElementById("assetView");
  const inner = document.getElementById("assetViewInner");
  view.hidden = false;

  const filename = relPath.split("/").pop();
  const kind = typeOf(filename);
  const url = rawUrlFor(relPath);
  document.title = filename;

  let el;
  if (kind === "image" || kind === "gif") {
    el = document.createElement("img");
    el.src = url;
    el.alt = filename;
  } else if (kind === "video") {
    el = document.createElement("video");
    el.src = url;
    el.controls = true;
    el.autoplay = false;
  } else if (kind === "audio") {
    el = document.createElement("audio");
    el.src = url;
    el.controls = true;
  } else {
    el = document.createElement("div");
    el.className = "av-fallback";
    el.innerHTML = `This file type can't be previewed inline.<br><br><a href="${url}" target="_blank" rel="noopener">Open raw file →</a>`;
  }
  inner.appendChild(el);

  el.addEventListener("error", () => {
    inner.innerHTML = `<div class="av-fallback">Couldn't load <code>${escapeHtml(relPath)}</code>.<br>Check that it exists at<br><code>${escapeHtml(CONFIG.storagePath + "/" + relPath)}</code> in the repo, and that the repo is public.</div>`;
  });
}

/* =========================================================
   2) DASHBOARD
   ========================================================= */
let TREE = null;          // nested folder object: { name, path, folders:{}, files:[] }
let CURRENT_PATH = "";     // path relative to storagePath, "" = root
let CURRENT_FILTER = "all";
let CURRENT_VIEW = "grid";
let SEARCH_TERM = "";
let ACTIVE_ASSET = null;   // { relPath, name } currently open in modal

const els = {};
function cacheEls() {
  [
    "folderTree","breadcrumbs","searchInput","filterGroup","assetGrid","assetList",
    "loadingState","errorState","errorTitle","errorMessage","emptyState","retryBtn",
    "repoPill","repoStatusDot","repoPillText","refreshBtn","menuBtn","sidebar","scrim",
    "gridViewBtn","listViewBtn","previewModal","modalBackdrop","modalClose","modalPreviewArea",
    "previewType","previewName","previewPath","previewUrl","modalCopyBtn","modalDownloadBtn",
    "modalOpenBtn","toastStack"
  ].forEach((id) => (els[id] = document.getElementById(id)));
}

function initDashboard(deepLinkPath) {
  cacheEls();
  wireStaticEvents();
  loadTree(deepLinkPath);
}

function setStatus(state, text) {
  els.repoStatusDot.className = "dot " + (state === "ok" ? "ok" : state === "err" ? "err" : "loading");
  els.repoPillText.textContent = text;
}

async function loadTree(deepLinkPath) {
  showState("loading");
  setStatus("loading", "reading manifest…");
  try {
    // Cache-bust so a fresh deploy's manifest is always picked up.
    const res = await fetch(`${CONFIG.manifestUrl}?v=${Date.now()}`);
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? `${CONFIG.manifestUrl} wasn't found. Make sure the build command "node build.js" ran during deploy.`
          : `Could not read the manifest (HTTP ${res.status}).`
      );
    }
    TREE = await res.json();
    if (!TREE || typeof TREE !== "object" || !TREE.folders) {
      throw new Error(`${CONFIG.manifestUrl} is malformed. Re-run "node build.js" and redeploy.`);
    }
    TREE.name = CONFIG.storagePath;
    TREE.path = "";

    setStatus("ok", `${CONFIG.storagePath}/ · ${countAll(TREE)} file${countAll(TREE) === 1 ? "" : "s"}`);
    renderSidebar();

    const startPath = deepLinkPath && folderExists(deepLinkPath) ? deepLinkPath : "";
    navigateTo(startPath);
  } catch (err) {
    console.error(err);
    setStatus("err", "manifest failed");
    showState("error", err.message);
  }
}

function folderExists(path) {
  if (!path) return true;
  const segs = path.split("/");
  let node = TREE;
  for (const seg of segs) {
    if (!node.folders[seg]) return false;
    node = node.folders[seg];
  }
  return true;
}

function getNode(path) {
  if (!path) return TREE;
  const segs = path.split("/");
  let node = TREE;
  for (const seg of segs) {
    node = node.folders[seg];
    if (!node) return null;
  }
  return node;
}

/* ---------- sidebar tree ---------- */
function renderSidebar() {
  els.folderTree.innerHTML = "";
  els.folderTree.appendChild(renderTreeNode(TREE, 0, true));
}

function countAll(node) {
  let n = node.files.length;
  for (const key in node.folders) n += countAll(node.folders[key]);
  return n;
}

function renderTreeNode(node, depth, isRoot) {
  const wrap = document.createElement("div");
  wrap.className = "tree-node";

  const hasChildren = Object.keys(node.folders).length > 0;
  const row = document.createElement("div");
  row.className = "tree-row" + (CURRENT_PATH === node.path ? " is-active" : "");
  row.innerHTML = `
    <span class="tree-caret ${hasChildren ? "" : "invisible"}" style="${hasChildren ? "" : "visibility:hidden"}">
      <svg width="10" height="10" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
    <span class="folder-ic">
      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="currentColor"/></svg>
    </span>
    <span class="tree-label">${isRoot ? node.name : escapeHtml(node.name)}</span>
    <span class="tree-count">${countAll(node)}</span>
  `;
  row.addEventListener("click", (e) => {
    navigateTo(node.path);
    if (hasChildren) {
      const kids = wrap.querySelector(".tree-children");
      if (kids) kids.hidden = !kids.hidden;
      row.querySelector(".tree-caret").classList.toggle("is-open", kids && !kids.hidden);
    }
    if (window.matchMedia("(max-width: 920px)").matches) closeSidebar();
  });
  wrap.appendChild(row);

  if (hasChildren) {
    const children = document.createElement("div");
    children.className = "tree-children";
    children.hidden = depth > 0; // auto-expand only root by default
    if (!children.hidden) row.querySelector(".tree-caret").classList.add("is-open");
    Object.values(node.folders)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((child) => children.appendChild(renderTreeNode(child, depth + 1, false)));
    wrap.appendChild(children);
  }
  return wrap;
}

function refreshSidebarActiveStates() {
  els.folderTree.querySelectorAll(".tree-row").forEach((r) => r.classList.remove("is-active"));
  renderSidebar(); // simplest correct approach given tree size is small
}

/* ---------- breadcrumbs ---------- */
function renderBreadcrumbs() {
  const segs = CURRENT_PATH ? CURRENT_PATH.split("/") : [];
  els.breadcrumbs.innerHTML = "";
  const rootBtn = document.createElement("button");
  rootBtn.textContent = CONFIG.storagePath;
  rootBtn.className = segs.length === 0 ? "is-current" : "";
  rootBtn.addEventListener("click", () => navigateTo(""));
  els.breadcrumbs.appendChild(rootBtn);

  let acc = "";
  segs.forEach((seg, i) => {
    acc = acc ? `${acc}/${seg}` : seg;
    const sep = document.createElement("span");
    sep.className = "crumb-sep";
    sep.textContent = "/";
    els.breadcrumbs.appendChild(sep);

    const btn = document.createElement("button");
    btn.textContent = seg;
    if (i === segs.length - 1) btn.classList.add("is-current");
    const target = acc;
    btn.addEventListener("click", () => navigateTo(target));
    els.breadcrumbs.appendChild(btn);
  });
}

/* ---------- navigation / rendering content ---------- */
function navigateTo(path) {
  CURRENT_PATH = path;
  SEARCH_TERM = "";
  els.searchInput.value = "";
  renderBreadcrumbs();
  renderContent();
  document.querySelectorAll(".tree-row").forEach((r) => r.classList.remove("is-active"));
  // best-effort highlight (rebuild keeps things simple/correct)
  renderSidebar();
}

function currentAssets() {
  const node = getNode(CURRENT_PATH);
  if (!node) return { folders: [], files: [] };
  let folders = Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
  let files = node.files.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (SEARCH_TERM) {
    const q = SEARCH_TERM.toLowerCase();
    folders = folders.filter((f) => f.name.toLowerCase().includes(q));
    files = files.filter((f) => f.name.toLowerCase().includes(q));
  }
  if (CURRENT_FILTER !== "all") {
    files = files.filter((f) => typeOf(f.name) === CURRENT_FILTER);
  }
  return { folders, files };
}

function renderContent() {
  const { folders, files } = currentAssets();
  if (folders.length === 0 && files.length === 0) {
    showState("empty");
    return;
  }
  showState(CURRENT_VIEW);
  if (CURRENT_VIEW === "grid") renderGrid(folders, files);
  else renderList(folders, files);
}

function renderGrid(folders, files) {
  els.assetGrid.innerHTML = "";
  folders.forEach((f) => els.assetGrid.appendChild(folderCard(f)));
  files.forEach((f) => els.assetGrid.appendChild(assetCard(f)));
}

function folderCard(node) {
  const card = document.createElement("div");
  card.className = "card folder-card";
  card.innerHTML = `
    <div class="card__thumb">
      <svg class="folder-ic-lg" width="34" height="34" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="currentColor"/></svg>
    </div>
    <div class="card__body">
      <div class="card__name">${escapeHtml(node.name)}</div>
      <div class="card__meta">${countAll(node)} item${countAll(node) === 1 ? "" : "s"}</div>
    </div>
  `;
  card.addEventListener("click", () => navigateTo(node.path));
  return card;
}

function assetCard(file) {
  const kind = typeOf(file.name);
  const url = rawUrlFor(file.path);
  const card = document.createElement("div");
  card.className = "card";

  let thumbHtml = `<svg class="type-ic" width="26" height="26" viewBox="0 0 24 24"><path d="M4 7l4-4h6l6 6v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`;
  if (kind === "image" || kind === "gif") thumbHtml = `<img src="${url}" alt="${escapeHtml(file.name)}" loading="lazy" />`;
  if (kind === "video") thumbHtml = `<video src="${url}#t=0.1" preload="metadata" muted></video>`;
  if (kind === "audio") thumbHtml = `<svg class="type-ic" width="26" height="26" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`;

  card.innerHTML = `
    <div class="card__thumb">
      ${thumbHtml}
      <span class="card__badge">${extOf(file.name) || kind}</span>
      <span class="card__quick">
        <button class="qcopy" title="Copy URL">${iconCopy()}</button>
        <button class="qdownload" title="Download">${iconDownload()}</button>
      </span>
    </div>
    <div class="card__body">
      <div class="card__name">${escapeHtml(file.name)}</div>
      <div class="card__meta">${formatBytes(file.size)}</div>
    </div>
  `;
  card.addEventListener("click", (e) => {
    if (e.target.closest(".qcopy") || e.target.closest(".qdownload")) return;
    openPreview(file);
  });
  card.querySelector(".qcopy").addEventListener("click", (e) => { e.stopPropagation(); copyUrl(file.path); });
  card.querySelector(".qdownload").addEventListener("click", (e) => { e.stopPropagation(); downloadAsset(file); });
  return card;
}

function renderList(folders, files) {
  els.assetList.innerHTML = "";
  folders.forEach((f) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div class="list-row__ic"><svg width="15" height="15" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="currentColor"/></svg></div>
      <div class="list-row__name">${escapeHtml(f.name)}</div>
      <div class="list-row__type">folder</div>
      <div class="list-row__actions"></div>
    `;
    row.addEventListener("click", () => navigateTo(f.path));
    els.assetList.appendChild(row);
  });
  files.forEach((f) => {
    const kind = typeOf(f.name);
    const url = rawUrlFor(f.path);
    const row = document.createElement("div");
    row.className = "list-row";
    const thumb = (kind === "image" || kind === "gif") ? `<img src="${url}" loading="lazy" alt="">` :
      `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M4 7l4-4h6l6 6v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`;
    row.innerHTML = `
      <div class="list-row__ic">${thumb}</div>
      <div class="list-row__name">${escapeHtml(f.name)}</div>
      <div class="list-row__type">${extOf(f.name) || kind}</div>
      <div class="list-row__actions">
        <button class="acopy" title="Copy URL">${iconCopy()}</button>
        <button class="adownload" title="Download">${iconDownload()}</button>
        <button class="aopen" title="Preview">${iconEye()}</button>
      </div>
    `;
    row.querySelector(".acopy").addEventListener("click", (e) => { e.stopPropagation(); copyUrl(f.path); });
    row.querySelector(".adownload").addEventListener("click", (e) => { e.stopPropagation(); downloadAsset(f); });
    row.querySelector(".aopen").addEventListener("click", (e) => { e.stopPropagation(); openPreview(f); });
    row.addEventListener("click", (e) => { if (!e.target.closest("button")) openPreview(f); });
    els.assetList.appendChild(row);
  });
}

function iconCopy() { return `<svg width="13" height="13" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2" fill="none"/></svg>`; }
function iconDownload() { return `<svg width="13" height="13" viewBox="0 0 24 24"><path d="M12 3v13m0 0l-5-5m5 5l5-5M4 21h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconEye() { return `<svg width="13" height="13" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`; }

/* ---------- state switching ---------- */
function showState(state, errorMsg) {
  ["loadingState", "errorState", "emptyState", "assetGrid", "assetList"].forEach((id) => (els[id].hidden = true));
  if (state === "loading") els.loadingState.hidden = false;
  else if (state === "error") { els.errorState.hidden = false; els.errorMessage.textContent = errorMsg || els.errorMessage.textContent; }
  else if (state === "empty") els.emptyState.hidden = false;
  else if (state === "grid") els.assetGrid.hidden = false;
  else if (state === "list") els.assetList.hidden = false;
}

/* ---------- preview modal ---------- */
function openPreview(file) {
  ACTIVE_ASSET = file;
  const kind = typeOf(file.name);
  const rawUrl = rawUrlFor(file.path);
  const pubUrl = publicUrlFor(file.path);

  els.previewType.textContent = (extOf(file.name) || kind).toUpperCase();
  els.previewName.textContent = file.name;
  els.previewPath.textContent = `${CONFIG.storagePath}/${file.path}`;
  els.previewUrl.textContent = pubUrl;
  els.modalDownloadBtn.href = rawUrl;
  els.modalDownloadBtn.setAttribute("download", file.name);
  els.modalOpenBtn.href = pubUrl;

  els.modalPreviewArea.innerHTML = "";
  let node;
  if (kind === "image" || kind === "gif") {
    node = document.createElement("img");
    node.src = rawUrl;
    node.alt = file.name;
  } else if (kind === "video") {
    node = document.createElement("video");
    node.src = rawUrl;
    node.controls = true;
  } else if (kind === "audio") {
    node = document.createElement("audio");
    node.src = rawUrl;
    node.controls = true;
  } else {
    node = document.createElement("div");
    node.className = "no-preview";
    node.textContent = "No inline preview available for this file type.";
  }
  els.modalPreviewArea.appendChild(node);
  els.previewModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePreview() {
  els.previewModal.hidden = true;
  els.modalPreviewArea.innerHTML = "";
  document.body.style.overflow = "";
  ACTIVE_ASSET = null;
}

/* ---------- actions ---------- */
async function copyUrl(relPath) {
  const url = publicUrlFor(relPath);
  try {
    await navigator.clipboard.writeText(url);
    toast("URL copied!", "ok");
  } catch {
    toast("Couldn't copy — copy manually: " + url, "err");
  }
}

async function downloadAsset(file) {
  const url = rawUrlFor(file.path);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("download failed");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
    toast(`Downloading ${file.name}`, "ok");
  } catch {
    window.open(url, "_blank");
    toast("Opened in a new tab (direct download was blocked)", "err");
  }
}

function toast(message, kind) {
  const t = document.createElement("div");
  t.className = "toast " + (kind || "ok");
  t.textContent = message;
  els.toastStack.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- sidebar mobile ---------- */
function openSidebar() { els.sidebar.classList.add("is-open"); els.scrim.classList.add("is-open"); }
function closeSidebar() { els.sidebar.classList.remove("is-open"); els.scrim.classList.remove("is-open"); }

/* ---------- static events ---------- */
function wireStaticEvents() {
  els.retryBtn.addEventListener("click", () => loadTree(CURRENT_PATH));
  els.refreshBtn.addEventListener("click", () => loadTree(CURRENT_PATH));

  els.searchInput.addEventListener("input", (e) => { SEARCH_TERM = e.target.value; renderContent(); });

  els.filterGroup.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    els.filterGroup.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    CURRENT_FILTER = chip.dataset.filter;
    renderContent();
  });

  els.gridViewBtn.addEventListener("click", () => { CURRENT_VIEW = "grid"; els.gridViewBtn.classList.add("is-active"); els.listViewBtn.classList.remove("is-active"); renderContent(); });
  els.listViewBtn.addEventListener("click", () => { CURRENT_VIEW = "list"; els.listViewBtn.classList.add("is-active"); els.gridViewBtn.classList.remove("is-active"); renderContent(); });

  els.menuBtn.addEventListener("click", openSidebar);
  els.scrim.addEventListener("click", closeSidebar);

  els.modalClose.addEventListener("click", closePreview);
  els.modalBackdrop.addEventListener("click", closePreview);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !els.previewModal.hidden) closePreview(); });
  els.modalCopyBtn.addEventListener("click", () => ACTIVE_ASSET && copyUrl(ACTIVE_ASSET.path));
}
