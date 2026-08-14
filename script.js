/* ============================================================
   SUBSTITUA AS CREDENCIAIS ABAIXO PELO SEU PROJETO FIREBASE
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCdbgPcsM-RLHzDkClVToAhGhOizfLvu6o",
  authDomain: "kitopl2.firebaseapp.com",
  databaseURL: "https://kitopl2-default-rtdb.firebaseio.com",
  projectId: "kitopl2",
  storageBucket: "kitopl2.firebasestorage.app",
  messagingSenderId: "529504176070",
  appId: "1:529504176070:web:2c20baf1163b98f563d4c7"
};

/* ============================================================
   GATILHOS DE MARKETING PRÉ-PROGRAMADOS
   ============================================================ */
const MARKETING_TRIGGERS = [
  { id: "hot", label: "🔥 Mais vendido", badgeClass: "hot" },
  { id: "new", label: "🆕 Lançamento", badgeClass: "new" },
  { id: "sale", label: "🏷️ Promoção", badgeClass: "" },
  { id: "limited", label: "⏳ Edição limitada", badgeClass: "" },
  { id: "exclusive", label: "✨ Exclusivo", badgeClass: "" }
];

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const state = {
  produtos: [],
  menu: [],
  footer: { columns: [], copyright: "© Todos os direitos reservados." },
  brand: { square: "", wide: "" },
  user: null,
  isAdmin: false,
  page: 1,
  perPage: 12,
  editingId: null,
  menuEditingId: null,
  banners: [],
  bannerEditingId: null,
  bannerIndex: 0,
  bannerTimer: null,
  search: ""
};

/* ============================================================
   INICIALIZAÇÃO FIREBASE
   ============================================================ */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

/* ============================================================
   HELPERS
   ============================================================ */
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast " + type;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatMoney(value) {
  if (!value && value !== 0) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.body.style.overflow = "";
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function byOrder(a, b) {
  const oa = typeof a.order === "number" ? a.order : 9999;
  const ob = typeof b.order === "number" ? b.order : 9999;
  if (oa === ob) return String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""));
  return oa - ob;
}

function nextOrder(list) {
  return list.reduce((max, i) => Math.max(max, typeof i.order === "number" ? i.order : 0), 0) + 1;
}

function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector + ":checked")).map((cb) => cb.value);
}

function setCheckedValues(selector, values) {
  document.querySelectorAll(selector).forEach((cb) => {
    cb.checked = values && values.includes(cb.value);
  });
}

/* ============================================================
   AUTENTICAÇÃO
   ============================================================ */
auth.onAuthStateChanged((user) => {
  state.user = user;
  state.isAdmin = user && user.email === "admin@admin.com";
  updateAuthUI();
  loadData();
});

function updateAuthUI() {
  const loginBtn = document.getElementById("login-btn");
  const dot = document.getElementById("restricted-dot");
  if (state.isAdmin) {
    if (loginBtn) loginBtn.classList.add("hidden");
    if (dot) dot.title = "Painel administrativo";
    showToast("Bem-vindo, admin!", "success");
    openAdminModal();
  } else {
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (dot) dot.title = "Área restrita";
    closeModal("admin-modal");
  }
}

/* Abre o painel administrativo (mesmo botão discreto do login) */
function openAdminModal() {
  renderAdminProdutos();
  renderAdminMenu();
  renderAdminBanners();
  switchTab("produtos-tab");
  openModal("admin-modal");
}

function handleRestrictedClick() {
  if (state.isAdmin) openAdminModal();
  else openModal("login-modal");
}


function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const loader = document.getElementById("login-loader");
  const form = document.getElementById("login-form");

  if (!email || !password) {
    showToast("Preencha e-mail e senha.", "error");
    return;
  }

  loader.classList.add("active");
  form.classList.add("hidden");

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      loader.classList.remove("active");
      form.classList.remove("hidden");
      document.getElementById("login-form").reset();
      closeModal("login-modal");
    })
    .catch((err) => {
      loader.classList.remove("active");
      form.classList.remove("hidden");
      showToast("Erro: " + err.message, "error");
    });
}

function logout() {
  auth.signOut().then(() => {
    showToast("Logout realizado.", "info");
  });
}

/* ============================================================
   CARREGAMENTO DE DADOS
   ============================================================ */
function loadData() {
  db.ref("produtos").on("value", (snap) => {
    const data = snap.val() || {};
    state.produtos = Object.entries(data).map(([id, p]) => ({ id, ...p })).sort(byOrder);
    state.page = 1;
    renderProdutos();
    renderAdminProdutos();
  });

  db.ref("menu").on("value", (snap) => {
    const data = snap.val() || {};
    state.menu = Object.entries(data).map(([id, m]) => ({ id, ...m })).sort(byOrder);
    renderMenu();
    renderAdminMenu();
  });

  db.ref("banners").on("value", (snap) => {
    const data = snap.val() || {};
    state.banners = Object.entries(data).map(([id, b]) => ({ id, ...b })).sort(byOrder);
    renderBanners();
    renderAdminBanners();
  });

  db.ref("footer").on("value", (snap) => {
    const data = snap.val() || { columns: [], copyright: "© Todos os direitos reservados." };
    state.footer = data;
    renderFooter();
    fillFooterForm();
  });

  db.ref("brand").on("value", (snap) => {
    const data = snap.val() || { square: "", wide: "" };
    state.brand = data;
    renderBrand();
    fillBrandForm();
  });
}

/* ============================================================
   MARCA / LOGOS
   ============================================================ */
function renderBrand() {
  const square = document.getElementById("logo-square");
  const wide = document.getElementById("logo-wide");
  if (square) square.src = state.brand.square || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  if (wide) {
    if (state.brand.wide) {
      wide.src = state.brand.wide;
      wide.classList.remove("hidden");
    } else {
      wide.classList.add("hidden");
    }
  }
}

function fillBrandForm() {
  document.getElementById("brand-square-url").value = state.brand.square || "";
  document.getElementById("brand-wide-url").value = state.brand.wide || "";
}

async function saveBrand(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const squareFile = document.getElementById("brand-square-file").files[0];
  const wideFile = document.getElementById("brand-wide-file").files[0];
  const squareUrl = document.getElementById("brand-square-url").value.trim();
  const wideUrl = document.getElementById("brand-wide-url").value.trim();

  const square = squareFile ? await toBase64(squareFile) : squareUrl;
  const wide = wideFile ? await toBase64(wideFile) : wideUrl;

  db.ref("brand").set({ square, wide })
    .then(() => showToast("Marca salva com sucesso!", "success"))
    .catch((err) => showToast("Erro ao salvar: " + err.message, "error"));
}

/* ============================================================
   MENU (MISTO: LINKS DIRETOS + SUBMENUS)
   ============================================================ */
function renderMenu() {
  const desktop = document.getElementById("menu-desktop");
  const mobile = document.getElementById("mobile-menu-list");
  if (!desktop) return;

  const topItems = state.menu.filter((m) => !m.parentId).sort(byOrder);
  const children = (parentId) => state.menu.filter((m) => m.parentId === parentId).sort(byOrder);

  desktop.innerHTML = topItems.map((item) => buildDesktopItem(item, children)).join("");
  mobile.innerHTML = topItems.map((item, idx) => buildMobileItem(item, idx, children)).join("");
}

function buildDesktopItem(item, childrenFn) {
  const kids = childrenFn(item.id);
  const hasChildren = kids.length > 0;

  if (hasChildren) {
    return `
      <li class="menu-item">
        <span class="menu-toggle">${escapeHtml(item.name)} <span class="arrow">▾</span></span>
        <ul class="submenu">
          ${kids.map((k) => `<li><a class="menu-link" href="${escapeHtml(k.link || "#")}">${escapeHtml(k.name)}</a></li>`).join("")}
        </ul>
      </li>
    `;
  }

  return `<li class="menu-item"><a class="menu-link" href="${escapeHtml(item.link || "#")}">${escapeHtml(item.name)}</a></li>`;
}

function buildMobileItem(item, idx, childrenFn) {
  const kids = childrenFn(item.id);
  const hasChildren = kids.length > 0;

  if (hasChildren) {
    return `
      <li>
        <span class="submenu-toggle" onclick="toggleMobileSubmenu(${idx})">${escapeHtml(item.name)} <span id="arrow-${idx}">▾</span></span>
        <ul class="mobile-submenu" id="mobile-submenu-${idx}">
          ${kids.map((k) => `<li><a href="${escapeHtml(k.link || "#")}">${escapeHtml(k.name)}</a></li>`).join("")}
        </ul>
      </li>
    `;
  }

  return `<li><a href="${escapeHtml(item.link || "#")}">${escapeHtml(item.name)}</a></li>`;
}

function toggleMobileSubmenu(idx) {
  const sub = document.getElementById("mobile-submenu-" + idx);
  const arrow = document.getElementById("arrow-" + idx);
  sub.classList.toggle("open");
  arrow.textContent = sub.classList.contains("open") ? "▴" : "▾";
}

function toggleMobileMenu() {
  document.getElementById("mobile-menu").classList.toggle("open");
}

// Efeito de pulsação suave no botão do WhatsApp
const waButton = document.querySelector('.whatsapp-float');
if (waButton) {
    waButton.style.animation = "pulse 2s infinite";
    
    // Injetando o keyframe da animação via JS para não precisar mexer no CSS
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7); }
            70% { box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
            100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
        }
    `;
    document.head.appendChild(style);
}

/* ============================================================
   ADMIN MENU
   ============================================================ */
function renderAdminMenu() {
  const list = document.getElementById("menu-list");
  const parentSelect = document.getElementById("menu-parent");
  if (!list) return;

  const buildRow = (item, isChild, index) => `
      <div class="admin-list-item draggable${isChild ? " sub-indent" : ""}" draggable="true" data-id="${item.id}">
        <span class="drag-handle" title="Arraste para reordenar">⠿</span>
        <input type="number" class="order-input" min="1" step="1" value="${index + 1}" data-id="${item.id}" title="Posição (digite o número e pressione Enter)">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <br><small>${item.link ? "Link: " + escapeHtml(item.link) : "Sem link (pai de submenu)"}</small>
          <br><small>${isChild ? "Subitem" : "Item de topo"}</small>
        </div>
        <div class="admin-list-actions">
          <button class="btn-save" onclick="editMenuItem('${item.id}')">Editar</button>
          <button class="btn-danger" onclick="deleteMenuItem('${item.id}')">Excluir</button>
        </div>
      </div>`;

  const tops = state.menu.filter((m) => !m.parentId).sort(byOrder);
  list.innerHTML = `<div class="admin-drag-list" data-parent="">
      ${tops.map((t, ti) => buildRow(t, false, ti) + (
        state.menu.filter((c) => c.parentId === t.id).length
          ? `<div class="admin-drag-list admin-list-group" data-parent="${t.id}">
               ${state.menu.filter((c) => c.parentId === t.id).sort(byOrder).map((c, ci) => buildRow(c, true, ci)).join("")}
             </div>`
          : ""
      )).join("")}
    </div>`;

  list.querySelectorAll(".admin-drag-list").forEach((container) => {
    enableDragSort(container, (ids) => persistOrder("menu", ids));
    enableOrderInputs(container, (ids) => persistOrder("menu", ids));
  });

  const topItems = state.menu.filter((m) => !m.parentId).sort(byOrder);
  parentSelect.innerHTML = `<option value="">Nenhum (item de topo)</option>` +
    topItems.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");

  if (state.menuEditingId) {
    const item = state.menu.find((m) => m.id === state.menuEditingId);
    if (item) parentSelect.value = item.parentId || "";
  }
}

function saveMenuItem(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const name = document.getElementById("menu-name").value.trim();
  const link = document.getElementById("menu-link").value.trim();
  const parentId = document.getElementById("menu-parent").value || null;

  if (!name) {
    showToast("Digite um nome para o menu.", "error");
    return;
  }

  const existing = state.menu.find((m) => m.id === state.menuEditingId);
  const order = existing && typeof existing.order === "number"
    ? existing.order
    : nextOrder(state.menu.filter((m) => (m.parentId || null) === parentId));

  const data = { name, link, parentId, order };
  const ref = state.menuEditingId
    ? db.ref("menu/" + state.menuEditingId)
    : db.ref("menu").push();

  ref.set(data)
    .then(() => {
      showToast("Menu salvo!", "success");
      resetMenuForm();
    })
    .catch((err) => showToast("Erro: " + err.message, "error"));
}

function editMenuItem(id) {
  const item = state.menu.find((m) => m.id === id);
  if (!item) return;
  state.menuEditingId = id;
  document.getElementById("menu-name").value = item.name;
  document.getElementById("menu-link").value = item.link || "";
  document.getElementById("menu-parent").value = item.parentId || "";
  document.getElementById("menu-form-title").textContent = "Editar item de menu";
  document.getElementById("menu-cancel").classList.remove("hidden");
}

function deleteMenuItem(id) {
  if (!state.isAdmin) return;
  if (!confirm("Excluir este item? Subitens vinculados a ele também ficarão órfãos.")) return;
  db.ref("menu/" + id).remove()
    .then(() => showToast("Item removido.", "info"))
    .catch((err) => showToast("Erro: " + err.message, "error"));
}

function resetMenuForm() {
  state.menuEditingId = null;
  document.getElementById("menu-form").reset();
  document.getElementById("menu-form-title").textContent = "Adicionar item de menu";
  document.getElementById("menu-cancel").classList.add("hidden");
}

/* ============================================================
   PRODUTOS
   ============================================================ */
function getFilteredProdutos() {
  const q = normalize(state.search).trim();
  if (!q) return state.produtos;
  const terms = q.split(/\s+/);
  return state.produtos.filter((p) => {
    const haystack = normalize([p.title, p.description, p.cities].join(" "));
    return terms.every((t) => haystack.includes(t));
  });
}

function renderProdutos() {
  const grid = document.getElementById("produtos-grid");
  const list = getFilteredProdutos();
  const total = list.length;
  const start = (state.page - 1) * state.perPage;
  const pageItems = list.slice(start, start + state.perPage);

  if (!total) {
    grid.innerHTML = state.search
      ? `<p class="empty" style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:3rem 0;">Nenhum produto encontrado para "${escapeHtml(state.search)}".</p>`
      : `<p class="empty" style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:3rem 0;">Nenhum produto cadastrado ainda.</p>`;
  } else {
    grid.innerHTML = pageItems.map((p) => buildCard(p)).join("");
  }

  const info = document.getElementById("search-info");
  if (info) {
    if (state.search.trim()) {
      info.textContent = `${total} produto(s) encontrado(s) para "${state.search.trim()}".`;
      info.classList.remove("hidden");
    } else {
      info.classList.add("hidden");
    }
  }

  renderPagination(total);
}

function handleSearch(value) {
  state.search = value || "";
  state.page = 1;
  const clearBtn = document.getElementById("search-clear");
  if (clearBtn) clearBtn.classList.toggle("hidden", !state.search);
  renderProdutos();
}

function buildCard(p) {
  const triggers = (p.triggers || []).map((t) => {
    const opt = MARKETING_TRIGGERS.find((x) => x.id === t);
    return opt ? `<span class="badge ${opt.badgeClass}">${opt.label}</span>` : "";
  }).join("");

  return `
    <article class="card" onclick="openProdutoModal('${p.id}')">
      <div class="trigger-badges">${triggers}</div>
      <img class="card-img" src="${escapeHtml(p.image || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")}" alt="${escapeHtml(p.title)}">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(p.title)}</h3>
        <p class="card-desc">${escapeHtml(p.description)}</p>
        <p class="card-price">${formatMoney(p.price)}</p>
      </div>
    </article>
  `;
}

function renderPagination(total) {
  const pages = Math.ceil(total / state.perPage) || 1;
  const pagination = document.getElementById("pagination");
  let html = `
    <button onclick="setPage(${state.page - 1})" ${state.page === 1 ? "disabled" : ""}>‹</button>
  `;
  for (let i = 1; i <= pages; i++) {
    html += `<button class="${i === state.page ? "active" : ""}" onclick="setPage(${i})">${i}</button>`;
  }
  html += `<button onclick="setPage(${state.page + 1})" ${state.page === pages ? "disabled" : ""}>›</button>`;
  pagination.innerHTML = html;
}

function setPage(page) {
  const pages = Math.ceil(getFilteredProdutos().length / state.perPage) || 1;
  if (page < 1 || page > pages) return;
  state.page = page;
  renderProdutos();
  document.getElementById("produtos").scrollIntoView({ behavior: "smooth" });
}

function openProdutoModal(id) {
  const p = state.produtos.find((x) => x.id === id);
  if (!p) return;

  document.getElementById("modal-img").src = p.image || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  document.getElementById("modal-title").textContent = p.title || "Produto";
  document.getElementById("modal-desc").textContent = p.description || "";
  document.getElementById("modal-cities").textContent = p.cities || "Nacional";
  document.getElementById("modal-price").textContent = formatMoney(p.price);
  document.getElementById("modal-buy").href = p.buyLink || "#";

  const triggers = (p.triggers || []).map((t) => {
    const opt = MARKETING_TRIGGERS.find((x) => x.id === t);
    return opt ? `<span class="badge ${opt.badgeClass}">${opt.label}</span>` : "";
  }).join("");
  document.getElementById("modal-triggers").innerHTML = triggers;

  openModal("produto-modal");
}

/* ============================================================
   ADMIN PRODUTOS
   ============================================================ */
function renderAdminProdutos() {
  const list = document.getElementById("produtos-list");
  if (!list) return;
  list.innerHTML = state.produtos.map((p, i) => `
    <div class="admin-list-item draggable" draggable="true" data-id="${p.id}" data-group="produtos">
      <span class="drag-handle" title="Arraste para reordenar">⠿</span>
      <input type="number" class="order-input" min="1" step="1" value="${i + 1}" data-id="${p.id}" title="Posição (digite o número e pressione Enter)">
      <div>
        <strong>${escapeHtml(p.title)}</strong>
        <br><small>${formatMoney(p.price)} — ${escapeHtml(p.description || "").substring(0, 60)}${p.description && p.description.length > 60 ? "..." : ""}</small>
      </div>
      <div class="admin-list-actions">
        <button class="btn-save" onclick="editProduto('${p.id}')">Editar</button>
        <button class="btn-danger" onclick="deleteProduto('${p.id}')">Excluir</button>
      </div>
    </div>
  `).join("");

  enableDragSort(list, (ids) => persistOrder("produtos", ids));
  enableOrderInputs(list, (ids) => persistOrder("produtos", ids));
}

function renderTriggersOptions() {
  const container = document.getElementById("triggers-options");
  if (!container) return;
  container.innerHTML = MARKETING_TRIGGERS.map((t) => `
    <label style="display:flex;align-items:center;gap:0.5rem;margin:0.4rem 0;cursor:pointer;">
      <input type="checkbox" name="trigger" value="${t.id}">
      <span class="badge ${t.badgeClass}">${t.label}</span>
    </label>
  `).join("");
}

async function saveProduto(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const file = document.getElementById("produto-imagem-file").files[0];
  const url = document.getElementById("produto-imagem-url").value.trim();
  const title = document.getElementById("produto-titulo").value.trim();
  const description = document.getElementById("produto-descricao").value.trim();
  const cities = document.getElementById("produto-cidades").value.trim();
  const price = parseFloat(document.getElementById("produto-preco").value.replace(",", "."));
  const buyLink = document.getElementById("produto-comprar").value.trim();
  const triggers = getCheckedValues("input[name='trigger']");

  let image = url;
  if (file) image = await toBase64(file);

  if (!title) {
    showToast("Preencha o título do produto.", "error");
    return;
  }

  const existing = state.produtos.find((x) => x.id === state.editingId);
  const order = existing && typeof existing.order === "number" ? existing.order : nextOrder(state.produtos);

  const data = { title, description, cities, price, buyLink, image, triggers, order };
  const ref = state.editingId
    ? db.ref("produtos/" + state.editingId)
    : db.ref("produtos").push();

  ref.set(data)
    .then(() => {
      showToast("Produto salvo!", "success");
      resetProdutoForm();
    })
    .catch((err) => showToast("Erro: " + err.message, "error"));
}

function editProduto(id) {
  const p = state.produtos.find((x) => x.id === id);
  if (!p) return;
  state.editingId = id;
  document.getElementById("produto-titulo").value = p.title || "";
  document.getElementById("produto-descricao").value = p.description || "";
  document.getElementById("produto-cidades").value = p.cities || "";
  document.getElementById("produto-preco").value = p.price || "";
  document.getElementById("produto-comprar").value = p.buyLink || "";
  document.getElementById("produto-imagem-url").value = p.image || "";
  setCheckedValues("input[name='trigger']", p.triggers || []);
  document.getElementById("produto-form-title").textContent = "Editar produto";
  document.getElementById("produto-cancel").classList.remove("hidden");
  switchTab("produtos-tab");
}

function deleteProduto(id) {
  if (!state.isAdmin) return;
  if (!confirm("Excluir este produto?")) return;
  db.ref("produtos/" + id).remove()
    .then(() => showToast("Produto removido.", "info"))
    .catch((err) => showToast("Erro: " + err.message, "error"));
}

function resetProdutoForm() {
  state.editingId = null;
  document.getElementById("produto-form").reset();
  setCheckedValues("input[name='trigger']", []);
  document.getElementById("produto-form-title").textContent = "Adicionar produto";
  document.getElementById("produto-cancel").classList.add("hidden");
}

/* ============================================================
   RODAPÉ
   ============================================================ */
function renderFooter() {
  const cols = state.footer.columns || [];
  const grid = document.getElementById("footer-columns");
  if (!grid) return;
  grid.innerHTML = cols.map((col) => `
    <div class="footer-col">
      <h4>${escapeHtml(col.title)}</h4>
      ${(col.links || []).map((l) => `<a href="${escapeHtml(l.url || "#")}" target="${l.external ? "_blank" : "_self"}">${escapeHtml(l.text)}</a>`).join("")}
    </div>
  `).join("");

  document.getElementById("footer-copyright").textContent = state.footer.copyright || "© Todos os direitos reservados.";
}

function fillFooterForm() {
  const cols = state.footer.columns || [];
  const json = JSON.stringify(cols, null, 2);
  document.getElementById("footer-columns-json").value = json;
  document.getElementById("footer-copyright-input").value = state.footer.copyright || "© Todos os direitos reservados.";
}

function saveFooter(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  try {
    const columns = JSON.parse(document.getElementById("footer-columns-json").value || "[]");
    const copyright = document.getElementById("footer-copyright-input").value.trim();
    db.ref("footer").set({ columns, copyright })
      .then(() => showToast("Rodapé salvo!", "success"))
      .catch((err) => showToast("Erro: " + err.message, "error"));
  } catch (err) {
    showToast("JSON inválido: " + err.message, "error");
  }
}

/* ============================================================
   ABAS DO ADMIN
   ============================================================ */
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".admin-section").forEach((s) => s.classList.remove("active"));
  document.getElementById("btn-" + tabId).classList.add("active");
  document.getElementById(tabId).classList.add("active");

  if (tabId === "produtos-tab") renderAdminProdutos();
  if (tabId === "menu-tab") renderAdminMenu();
  if (tabId === "banners-tab") renderAdminBanners();
}

/* ============================================================
   DRAG AND DROP (ORDENAÇÃO MANUAL)
   ============================================================ */
function enableDragSort(container, onDrop) {
  if (!container) return;
  const items = Array.from(container.children).filter((el) => el.classList.contains("draggable"));

  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      if (!state.isAdmin) return e.preventDefault();
      if (e.target && e.target.classList && e.target.classList.contains("order-input")) return e.preventDefault();
      container.dataset.dragging = item.dataset.id;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.id);
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      container.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      delete container.dataset.dragging;
      refreshOrderInputs(container);
      onDrop(getContainerIds(container));
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      const draggingId = container.dataset.dragging;
      if (!draggingId || draggingId === item.dataset.id) return;
      const dragged = container.querySelector(`.draggable[data-id="${draggingId}"]`);
      if (!dragged || dragged.parentElement !== container) return;
      const rect = item.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      // mantém eventuais submenus junto do item pai
      const block = [item];
      let next = item.nextElementSibling;
      if (next && next.classList.contains("admin-list-group")) block.push(next);
      const draggedBlock = [dragged];
      let dnext = dragged.nextElementSibling;
      if (dnext && dnext.classList.contains("admin-list-group")) draggedBlock.push(dnext);

      const refNode = after ? block[block.length - 1].nextSibling : block[0];
      draggedBlock.forEach((node) => container.insertBefore(node, refNode));
    });
  });
}

/* Ordenação dinâmica por números */
function getContainerBlocks(container) {
  const blocks = [];
  Array.from(container.children).forEach((el) => {
    if (el.classList.contains("draggable")) {
      blocks.push([el]);
    } else if (blocks.length) {
      blocks[blocks.length - 1].push(el);
    }
  });
  return blocks;
}

function getContainerIds(container) {
  return getContainerBlocks(container).map((b) => b[0].dataset.id);
}

function refreshOrderInputs(container) {
  getContainerBlocks(container).forEach((block, index) => {
    const input = block[0].querySelector(".order-input");
    if (input) input.value = index + 1;
  });
}

function moveBlockTo(container, id, targetIndex) {
  const blocks = getContainerBlocks(container);
  const from = blocks.findIndex((b) => b[0].dataset.id === id);
  if (from < 0) return false;
  const target = Math.max(0, Math.min(blocks.length - 1, targetIndex));
  if (target === from) return false;
  const [block] = blocks.splice(from, 1);
  blocks.splice(target, 0, block);
  const frag = document.createDocumentFragment();
  blocks.forEach((b) => b.forEach((node) => frag.appendChild(node)));
  container.appendChild(frag);
  const moved = container.querySelector(`.draggable[data-id="${id}"]`);
  if (moved) {
    moved.classList.add("order-moved");
    setTimeout(() => moved.classList.remove("order-moved"), 700);
  }
  return true;
}

function enableOrderInputs(container, onChange) {
  if (!container) return;
  container.querySelectorAll(".order-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("change", () => {
      if (!state.isAdmin) return;
      const id = input.dataset.id;
      const value = parseInt(input.value, 10);
      if (isNaN(value)) return refreshOrderInputs(container);
      const changed = moveBlockTo(container, id, value - 1);
      refreshOrderInputs(container);
      if (changed) onChange(getContainerIds(container));
    });
  });
}

function persistOrder(path, ids) {
  if (!state.isAdmin || !ids || !ids.length) return;
  const updates = {};
  ids.forEach((id, index) => {
    updates[id + "/order"] = index + 1;
  });
  db.ref(path).update(updates)
    .then(() => showToast("Ordem atualizada!", "success"))
    .catch((err) => showToast("Erro ao ordenar: " + err.message, "error"));
}

/* ============================================================
   BANNERS (SLIDER DO RODAPÉ)
   ============================================================ */
function renderBanners() {
  const slider = document.getElementById("banner-slider");
  const track = document.getElementById("banner-track");
  const dots = document.getElementById("banner-dots");
  if (!slider || !track) return;

  const banners = state.banners.filter((b) => b.image);

  if (state.bannerTimer) {
    clearInterval(state.bannerTimer);
    state.bannerTimer = null;
  }

  if (!banners.length) {
    slider.classList.add("hidden");
    track.innerHTML = "";
    dots.innerHTML = "";
    return;
  }

  slider.classList.remove("hidden");
  slider.classList.toggle("single", banners.length === 1);

  track.innerHTML = banners.map((b) => {
    const img = `<img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.title || "Banner")}" loading="lazy">`;
    return `<div class="banner-slide">${b.link ? `<a href="${escapeHtml(b.link)}" target="_blank" rel="noopener">${img}</a>` : img}</div>`;
  }).join("");

  dots.innerHTML = banners.map((_, i) =>
    `<button class="banner-dot${i === 0 ? " active" : ""}" data-index="${i}" aria-label="Ir para banner ${i + 1}"></button>`
  ).join("");

  dots.querySelectorAll(".banner-dot").forEach((dot) => {
    dot.addEventListener("click", () => goToBanner(Number(dot.dataset.index)));
  });

  state.bannerIndex = 0;
  updateBannerPosition();
  if (banners.length > 1) startBannerAuto();
}

function updateBannerPosition() {
  const track = document.getElementById("banner-track");
  const dots = document.getElementById("banner-dots");
  if (!track) return;
  track.style.transform = `translateX(-${state.bannerIndex * 100}%)`;
  if (dots) {
    dots.querySelectorAll(".banner-dot").forEach((d, i) => {
      d.classList.toggle("active", i === state.bannerIndex);
    });
  }
}

function goToBanner(index) {
  const count = state.banners.filter((b) => b.image).length;
  if (!count) return;
  state.bannerIndex = (index + count) % count;
  updateBannerPosition();
  startBannerAuto();
}

function nextBanner() { goToBanner(state.bannerIndex + 1); }
function prevBanner() { goToBanner(state.bannerIndex - 1); }

function startBannerAuto() {
  if (state.bannerTimer) clearInterval(state.bannerTimer);
  const count = state.banners.filter((b) => b.image).length;
  if (count < 2) return;
  state.bannerTimer = setInterval(() => {
    state.bannerIndex = (state.bannerIndex + 1) % count;
    updateBannerPosition();
  }, 5000);
}

function renderAdminBanners() {
  const list = document.getElementById("banners-list");
  if (!list) return;

  if (!state.banners.length) {
    list.innerHTML = `<p style="color:var(--text-muted);">Nenhum banner cadastrado. Enquanto não houver banners, a área do rodapé fica oculta.</p>`;
    return;
  }

  list.innerHTML = state.banners.map((b, i) => `
    <div class="admin-list-item draggable" draggable="true" data-id="${b.id}">
      <span class="drag-handle" title="Arraste para reordenar">⠿</span>
      <input type="number" class="order-input" min="1" step="1" value="${i + 1}" data-id="${b.id}" title="Posição (digite o número e pressione Enter)">
      <div>
        <img class="banner-thumb" src="${escapeHtml(b.image)}" alt="${escapeHtml(b.title || "Banner")}">
        <br><strong>${escapeHtml(b.title || "Sem título")}</strong>
        <br><small>${b.link ? "Link: " + escapeHtml(b.link) : "Sem link"}</small>
      </div>
      <div class="admin-list-actions">
        <button class="btn-save" onclick="editBanner('${b.id}')">Editar</button>
        <button class="btn-danger" onclick="deleteBanner('${b.id}')">Excluir</button>
      </div>
    </div>
  `).join("");

  enableDragSort(list, (ids) => persistOrder("banners", ids));
  enableOrderInputs(list, (ids) => persistOrder("banners", ids));
}

async function saveBanner(e) {
  e.preventDefault();
  if (!state.isAdmin) return;

  const file = document.getElementById("banner-file").files[0];
  const url = document.getElementById("banner-url").value.trim();
  const title = document.getElementById("banner-title").value.trim();
  const link = document.getElementById("banner-link").value.trim();

  let image = url;
  if (file) image = await toBase64(file);

  if (!image) {
    showToast("Envie uma imagem ou informe uma URL.", "error");
    return;
  }

  const existing = state.banners.find((b) => b.id === state.bannerEditingId);
  const order = existing && typeof existing.order === "number" ? existing.order : nextOrder(state.banners);

  const data = { image, title, link, order };
  const ref = state.bannerEditingId
    ? db.ref("banners/" + state.bannerEditingId)
    : db.ref("banners").push();

  ref.set(data)
    .then(() => {
      showToast("Banner salvo!", "success");
      resetBannerForm();
    })
    .catch((err) => showToast("Erro: " + err.message, "error"));
}

function editBanner(id) {
  const b = state.banners.find((x) => x.id === id);
  if (!b) return;
  state.bannerEditingId = id;
  document.getElementById("banner-url").value = b.image && b.image.startsWith("data:") ? "" : (b.image || "");
  document.getElementById("banner-title").value = b.title || "";
  document.getElementById("banner-link").value = b.link || "";
  document.getElementById("banner-form-title").textContent = "Editar banner";
  document.getElementById("banner-cancel").classList.remove("hidden");
  switchTab("banners-tab");
}

function deleteBanner(id) {
  if (!state.isAdmin) return;
  if (!confirm("Excluir este banner?")) return;
  db.ref("banners/" + id).remove()
    .then(() => showToast("Banner removido.", "info"))
    .catch((err) => showToast("Erro: " + err.message, "error"));
}

function resetBannerForm() {
  state.bannerEditingId = null;
  document.getElementById("banner-form").reset();
  document.getElementById("banner-form-title").textContent = "Adicionar banner";
  document.getElementById("banner-cancel").classList.add("hidden");
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  renderTriggersOptions();

  document.getElementById("login-form").addEventListener("submit", handleLogin);
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.addEventListener("click", () => openModal("login-modal"));
  document.getElementById("logout-btn").addEventListener("click", logout);

  document.getElementById("restricted-dot").addEventListener("click", handleRestrictedClick);

  const searchInput = document.getElementById("produto-search");
  if (searchInput) searchInput.addEventListener("input", (e) => handleSearch(e.target.value));
  const searchClear = document.getElementById("search-clear");
  if (searchClear) searchClear.addEventListener("click", () => {
    document.getElementById("produto-search").value = "";
    handleSearch("");
  });

  document.getElementById("banner-form").addEventListener("submit", saveBanner);
  document.getElementById("banner-cancel").addEventListener("click", resetBannerForm);
  document.getElementById("banner-prev").addEventListener("click", prevBanner);
  document.getElementById("banner-next").addEventListener("click", nextBanner);

  document.getElementById("produto-form").addEventListener("submit", saveProduto);
  document.getElementById("produto-cancel").addEventListener("click", resetProdutoForm);
  document.getElementById("menu-form").addEventListener("submit", saveMenuItem);
  document.getElementById("menu-cancel").addEventListener("click", resetMenuForm);
  document.getElementById("brand-form").addEventListener("submit", saveBrand);
  document.getElementById("footer-form").addEventListener("submit", saveFooter);

  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal-overlay");
      modal.classList.remove("open");
      document.body.style.overflow = "";
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("open");
        document.body.style.overflow = "";
      }
    });
  });

  document.getElementById("btn-produtos-tab").addEventListener("click", () => switchTab("produtos-tab"));
  document.getElementById("btn-menu-tab").addEventListener("click", () => switchTab("menu-tab"));
  document.getElementById("btn-brand-tab").addEventListener("click", () => switchTab("brand-tab"));
  document.getElementById("btn-banners-tab").addEventListener("click", () => switchTab("banners-tab"));
  document.getElementById("btn-footer-tab").addEventListener("click", () => switchTab("footer-tab"));

  window.addEventListener("scroll", () => {
    const header = document.getElementById("main-header");
    if (window.scrollY > 30) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  });

  document.getElementById("login-email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("login-password").focus();
  });
  document.getElementById("login-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin(e);
  });
});
