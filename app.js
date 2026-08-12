/* ==========================================================================
   GESTOR ELETRÔNICOS — app.js
   Firebase Authentication + Realtime Database (sem Firestore / sem Storage)
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, createUserWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ------------------------------------------------------------------
   1) CONFIGURAÇÃO DO FIREBASE  —  SUBSTITUA PELOS SEUS DADOS
   Console Firebase > Configurações do projeto > Seus apps (Web)
   Ative: Authentication (E-mail/senha) e Realtime Database.
------------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyBHahO9SNdc_wnL_VMs6B2i-Gb3AXYR1ws",
  authDomain: "admin-workin-store.firebaseapp.com",
  databaseURL: "https://admin-workin-store-default-rtdb.firebaseio.com",
  projectId: "admin-workin-store",
  storageBucket: "admin-workin-store.firebasestorage.app",
  messagingSenderId: "284284142161",
  appId: "1:284284142161:web:abc50279da94b634b3ae70"
};


const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

const ADMIN_EMAIL = "admin@admin.com";

/* ================= Helpers ================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = n => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num   = n => Number(String(n ?? "").toString().replace(",", ".")) || 0;
const esc   = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = d => d ? d.split("-").reverse().join("/") : "—";

function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3600);
}
function fbErr(e) {
  const m = {
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha deve ter ao menos 6 caracteres.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão."
  };
  return m[e?.code] || e?.message || "Erro inesperado.";
}
async function fileToBase64(file, maxPx = 512) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

/* ================= Estado global ================= */
const STATE = {
  user: null, profile: null, perms: {}, isAdmin: false,
  products: {}, kits: {}, entries: {}, sales: {},
  payables: {}, receivables: {}, expenses: {}, users: {}, settings: {},
  accounts: {}, fin: {}, finTab: "contas",
  view: "dashboard", unsubs: []
};

const PERMS = [
  ["dashboard", "Dashboard"], ["produtos", "Cadastro de Itens"], ["kits", "Kits"],
  ["estoque", "Estoque / Compras"], ["vendas", "Vendas"], ["financeiro", "Financeiro"],
  ["despesas", "Despesas Gerais"], ["relatorios", "Relatórios"],
  ["usuarios", "Usuários & Permissões"], ["config", "Configurações"]
];

/* ================= Tema / densidade ================= */
const html = document.documentElement;
function applyTheme(t) {
  html.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
  const b = $("#themeBtn"); if (b) b.textContent = t === "dark" ? "☾" : "☀";
}
applyTheme(localStorage.getItem("theme") || "dark");
function applyDensity(d) { html.setAttribute("data-density", d); localStorage.setItem("density", d); }
applyDensity(localStorage.getItem("density") || "normal");

$("#themeBtn").onclick = () => applyTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
$("#densityBtn").onclick = () => applyDensity(html.getAttribute("data-density") === "compact" ? "normal" : "compact");
$("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");
$$(".pw-toggle").forEach(b => b.onclick = () => {
  const i = $("#" + b.dataset.target); i.type = i.type === "password" ? "text" : "password";
});

/* ================= LOGIN ================= */
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#loginError"); err.classList.add("hidden");
  const btn = $("#loginBtn"); btn.disabled = true; btn.textContent = "Entrando...";
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPass").value);
  } catch (ex) {
    err.textContent = fbErr(ex); err.classList.remove("hidden");
  } finally { btn.disabled = false; btn.textContent = "Entrar"; }
});
$("#openForgot").onclick = () => {
  $("#forgotEmail").value = $("#loginEmail").value.trim();
  $("#forgotBackdrop").classList.remove("hidden");
};
$("#forgotClose").onclick = () => $("#forgotBackdrop").classList.add("hidden");
$("#forgotForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#forgotMsg"); msg.className = "alert hidden";
  try {
    await sendPasswordResetEmail(auth, $("#forgotEmail").value.trim());
    msg.textContent = "Link de redefinição enviado! Confira sua caixa de entrada e o spam.";
    msg.className = "alert ok";
  } catch (ex) { msg.textContent = fbErr(ex); msg.className = "alert"; }
});
$("#logoutBtn").onclick = () => signOut(auth);

/* ================= Sessão ================= */
onAuthStateChanged(auth, async user => {
  STATE.unsubs.forEach(u => u()); STATE.unsubs = [];
  if (!user) {
    STATE.user = null;
    $("#app").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
    loadPublicSettings();
    return;
  }
  STATE.user = user;
  STATE.isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL;

  const uref = ref(db, "users/" + user.uid);
  const snap = await get(uref);
  if (!snap.exists()) {
    const base = {
      email: user.email, firstName: (user.displayName || "").split(" ")[0] || "",
      lastName: (user.displayName || "").split(" ").slice(1).join(" ") || "",
      phone: "", role: STATE.isAdmin ? "admin" : "colaborador",
      perms: STATE.isAdmin ? Object.fromEntries(PERMS.map(p => [p[0], true])) : { dashboard: true, perfil: true },
      createdAt: Date.now()
    };
    await set(uref, base); STATE.profile = base;
  } else STATE.profile = snap.val();

  if (STATE.isAdmin && STATE.profile.role !== "admin") {
    STATE.profile.role = "admin";
    STATE.profile.perms = Object.fromEntries(PERMS.map(p => [p[0], true]));
    await update(uref, { role: "admin", perms: STATE.profile.perms });
  }
  STATE.perms = STATE.profile.perms || {};

  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#loginPass").value = "";
  bindData();
  renderShell();
});

function can(p) { return STATE.isAdmin || p === "perfil" || p === "dashboard" ? true : !!STATE.perms[p]; }

/* ================= Bindings do Realtime Database ================= */
function bindNode(path, key, cb) {
  const un = onValue(ref(db, path), s => { STATE[key] = s.val() || {}; cb && cb(); });
  STATE.unsubs.push(un);
}
function bindData() {
  const rerender = () => { if (STATE.ready) renderView(); };
  ["products", "kits", "entries", "sales", "payables", "receivables", "expenses", "users", "settings", "accounts", "fin"]
    .forEach(k => bindNode(k, k, rerender));
  STATE.ready = true;
}
function loadPublicSettings() {
  get(ref(db, "settings")).then(s => {
    const st = s.val() || {};
    if (st.logo) { $("#loginLogo").src = st.logo; $("#loginLogo").style.display = "block"; $("#loginLogoFallback").classList.add("hidden"); }
  }).catch(() => {});
}
loadPublicSettings();

/* ================= Shell ================= */
function renderShell() {
  const p = STATE.profile || {};
  $("#sideUserName").textContent = ((p.firstName || "") + " " + (p.lastName || "")).trim() || p.email;
  $("#sideUserRole").textContent = STATE.isAdmin ? "Administrador geral" : (p.role || "colaborador");
  const av = $("#avatarInitials");
  if (p.photo) { av.innerHTML = `<img src="${p.photo}" alt="Foto de perfil">`; }
  else av.textContent = ((p.firstName || p.email || "?")[0] + ((p.lastName || "")[0] || "")).toUpperCase();
  $$("#nav .nav-item").forEach(b => {
    b.classList.toggle("hidden", !can(b.dataset.perm));
    b.onclick = () => { STATE.view = b.dataset.view; $("#sidebar").classList.remove("open"); renderView(); };
  });
  renderView();
}
function applySettingsUI() {
  const st = STATE.settings || {};
  if (st.companyName) { $("#brandName").textContent = st.companyName; document.title = st.companyName + " — Sistema Gerencial"; }
  if (st.logo) { $("#sideLogo").src = st.logo; $("#loginLogo").src = st.logo; $("#loginLogo").style.display = "block"; $("#loginLogoFallback").classList.add("hidden"); }
}

const VIEWS = {
  dashboard: ["Dashboard", viewDashboard], produtos: ["Cadastro de Itens", viewProdutos],
  kits: ["Kits", viewKits], estoque: ["Estoque / Compras", viewEstoque], vendas: ["Vendas", viewVendas],
  financeiro: ["Financeiro", viewFinanceiro], despesas: ["Despesas Gerais", viewDespesas],
  relatorios: ["Relatórios", viewRelatorios], usuarios: ["Usuários & Permissões", viewUsuarios],
  perfil: ["Perfil", viewPerfil], config: ["Configurações", viewConfig]
};
function renderView() {
  applySettingsUI();
  const v = VIEWS[STATE.view] ? STATE.view : "dashboard";
  if (!can(v === "perfil" ? "perfil" : v)) { STATE.view = "dashboard"; }
  const [title, fn] = VIEWS[STATE.view];
  $("#viewTitle").textContent = title;
  $$("#nav .nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === STATE.view));
  $("#content").innerHTML = "";
  fn($("#content"));
}

/* ================= Modal genérico ================= */
function openModal(title, bodyHTML, footHTML = "") {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = bodyHTML;
  $("#modalFoot").innerHTML = footHTML;
  $("#modalBackdrop").classList.remove("hidden");
}
function closeModal() { $("#modalBackdrop").classList.add("hidden"); }
$("#modalClose").onclick = closeModal;
$("#modalBackdrop").onclick = e => { if (e.target.id === "modalBackdrop") closeModal(); };
function confirmDialog(msg, onYes) {
  openModal("Confirmar", `<p>${esc(msg)}</p>`,
    `<button class="btn" id="cNo">Cancelar</button><button class="btn btn-danger" id="cYes">Confirmar</button>`);
  $("#cNo").onclick = closeModal;
  $("#cYes").onclick = async () => { closeModal(); await onYes(); };
}

/* ================= Cálculos de negócio ================= */
const list = obj => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
function stockValue() { return list(STATE.products).reduce((s, p) => s + num(p.qty) * num(p.avgCost), 0); }
function kitCost(kit) {
  const items = kit.items || [];
  const base = items.reduce((s, it) => s + num(STATE.products[it.productId]?.avgCost) * num(it.qty), 0);
  return base + num(kit.extraCost);
}
function kitAvailable(kit) {
  const items = kit.items || [];
  if (!items.length) return 0;
  return Math.min(...items.map(it => Math.floor(num(STATE.products[it.productId]?.qty) / (num(it.qty) || 1))));
}
function margin(p) {
  const price = num(p.promo) || num(p.price);
  const cost = num(p.avgCost);
  const value = price - cost;
  return { price, cost, value, pct: price > 0 ? (value / price) * 100 : 0, markup: cost > 0 ? (value / cost) * 100 : 0 };
}
const marginCell = (value, percent, hasPrice = true, markup = null) => `<span class="pill ${value >= 0 ? "ok" : "dan"}"${markup !== null ? ` title="Markup sobre o custo: ${pct(markup)}"` : ""}>${money(value)}${hasPrice ? ` · ${pct(percent)}` : ""}</span>`;
const pct = n => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

/* ================= CONTAS, MOVIMENTOS E FILTROS ================= */
const ACC_TYPES = { digital: "Conta digital / Pix", cash: "Caixa em espécie", bank: "Conta no banco", outra: "Outra" };
const FIN_KINDS = {
  venda: ["Venda", "in"], compra: ["Compra de mercadoria", "out"], despesa: ["Despesa", "out"],
  aporte: ["Injeção de verba / aporte", "in"], investimento: ["Investimento aplicado", "out"],
  resgate: ["Resgate de investimento", "in"],
  doacao_in: ["Doação recebida", "in"], doacao_out: ["Doação efetuada", "out"],
  transfer_in: ["Transferência recebida", "in"], transfer_out: ["Transferência enviada", "out"],
  ajuste_in: ["Outra entrada", "in"], ajuste_out: ["Outra saída", "out"]
};
const kindLabel = k => (FIN_KINDS[k] || [k || "—"])[0];
const accList = () => list(STATE.accounts).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
const finList = () => list(STATE.fin);
function accBalance(id, to) {
  const a = STATE.accounts[id] || {};
  return finList()
    .filter(f => f.accountId === id && (!to || (f.date || "") <= to))
    .reduce((s, f) => s + (f.dir === "in" ? num(f.amount) : -num(f.amount)), num(a.opening));
}
const totalBalance = to => accList().reduce((s, a) => s + accBalance(a.id, to), 0);
const accName = id => STATE.accounts[id]?.name || "—";
const accountOptions = (sel = "") => accList()
  .map(a => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.name)} — ${ACC_TYPES[a.type] || a.type} · ${money(accBalance(a.id))}</option>`).join("");
const defaultAccount = () => (accList()[0] || {}).id || "";

async function finAdd(t) {
  if (!t.accountId) return null;
  const dir = t.dir || (FIN_KINDS[t.kind] || ["", "in"])[1];
  return push(ref(db, "fin"), {
    date: t.date || todayISO(), kind: t.kind || "ajuste_in", dir,
    accountId: t.accountId, amount: num(t.amount), description: t.description || "",
    party: t.party || "", category: t.category || kindLabel(t.kind),
    refKind: t.refKind || "", refId: t.refId || "", notes: t.notes || "",
    createdAt: Date.now(), user: STATE.user?.email || ""
  });
}
async function finRemoveByRef(refKind, refId) {
  for (const f of finList().filter(f => f.refKind === refKind && f.refId === refId)) {
    await remove(ref(db, "fin/" + f.id));
  }
}

/* ---- Filtros de período reutilizáveis: diário / mensal / anual / personalizado ---- */
const PERIOD_STORE = {};
const lastDayOfMonth = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).toISOString().slice(0, 10);
function periodBar(id, def = "month") {
  const t = todayISO();
  const s = PERIOD_STORE[id] || (PERIOD_STORE[id] = { mode: def, from: t.slice(0, 8) + "01", to: lastDayOfMonth(t.slice(0, 7)) });
  return `<div class="toolbar" data-period="${id}">
    <select id="${id}_mode" title="Período">
      ${[["day", "Diário (hoje)"], ["month", "Mensal"], ["year", "Anual"], ["all", "Tudo"], ["custom", "Personalizado"]]
      .map(([v, l]) => `<option value="${v}" ${s.mode === v ? "selected" : ""}>${l}</option>`).join("")}
    </select>
    <input type="date" id="${id}_from" value="${s.from}" title="De">
    <input type="date" id="${id}_to" value="${s.to}" title="Até">
  </div>`;
}
function periodApply(id) {
  const s = PERIOD_STORE[id], t = todayISO(), mode = $("#" + id + "_mode").value;
  s.mode = mode;
  if (mode === "day") { s.from = t; s.to = t; }
  else if (mode === "month") { s.from = t.slice(0, 8) + "01"; s.to = lastDayOfMonth(t.slice(0, 7)); }
  else if (mode === "year") { s.from = t.slice(0, 4) + "-01-01"; s.to = t.slice(0, 4) + "-12-31"; }
  else if (mode === "all") { s.from = ""; s.to = ""; }
  else { s.from = $("#" + id + "_from").value; s.to = $("#" + id + "_to").value; }
  if (mode !== "custom") { $("#" + id + "_from").value = s.from; $("#" + id + "_to").value = s.to; }
  const dis = mode !== "custom";
  $("#" + id + "_from").disabled = dis; $("#" + id + "_to").disabled = dis;
  return s;
}
function bindPeriod(id, cb) {
  ["_mode", "_from", "_to"].forEach(sfx => { const el = $("#" + id + sfx); if (el) el.onchange = () => { periodApply(id); cb(); }; });
  periodApply(id);
}
const periodOf = id => PERIOD_STORE[id] || { from: "", to: "" };
const inPeriod = (date, id) => { const p = periodOf(id); return (!p.from && !p.to) ? !!date : inRange(date, p.from, p.to); };
const periodLabel = id => { const p = periodOf(id); return (!p.from && !p.to) ? "todo o período" : `${fmtDate(p.from)} a ${fmtDate(p.to)}`; };

/* ---- Exportações CSV / PDF ---- */
function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name.endsWith(".csv") ? name : name + ".csv"; a.click();
  toast("CSV exportado", "ok");
}
function printHTML(title, bodyHTML) {
  const w = window.open("", "_blank");
  if (!w) return toast("Permita pop-ups para gerar o PDF", "err");
  const st = STATE.settings || {};
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#111;padding:22px}
h1{font-size:19px;margin:0}h2{font-size:14px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 14px}
th,td{border:1px solid #ccc;padding:5px 6px;text-align:left}th{background:#eef1f6}
.right{text-align:right}.muted{color:#666;font-size:12px}
.kpis{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.kpi{border:1px solid #ccc;border-radius:8px;padding:8px 10px;min-width:150px}
.kpi b{display:block;font-size:15px}</style></head><body>
<h1>${esc(st.companyName || "Relatório")}</h1>
<div class="muted">${esc(title)} · gerado em ${fmtDate(todayISO())}</div>
${bodyHTML}
<script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}
const kpiHTML = arr => `<div class="kpis">${arr.map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join("")}</div>`;
const tblHTML = (heads, rows) => `<table><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;

/* ================= DASHBOARD ================= */
function viewDashboard(root) {
  const prods = list(STATE.products), sales = list(STATE.sales);
  const today = todayISO(), month = today.slice(0, 7);
  const salesMonth = sales.filter(s => (s.date || "").startsWith(month));
  const revenue = salesMonth.reduce((s, v) => s + num(v.total), 0);
  const cogs = salesMonth.reduce((s, v) => s + num(v.cost), 0);
  const expMonth = list(STATE.expenses).filter(e => (e.date || "").startsWith(month)).reduce((s, e) => s + num(e.amount), 0);
  const recPend = list(STATE.receivables).filter(r => r.status !== "recebido");
  const payPend = list(STATE.payables).filter(r => r.status !== "pago");
  const lowStock = prods.filter(p => num(p.qty) <= num(p.minQty || 0));

  root.innerHTML = `
  <div class="stats">
    ${stat("Faturamento do mês", money(revenue), salesMonth.length + " venda(s)")}
    ${stat("Lucro bruto do mês", money(revenue - cogs), "Custo: " + money(cogs))}
    ${stat("Despesas do mês", money(expMonth), "Resultado: " + money(revenue - cogs - expMonth))}
    ${stat("Valor em estoque", money(stockValue()), prods.length + " item(ns) cadastrados")}
    ${stat("A receber", money(recPend.reduce((s, r) => s + num(r.amount), 0)), recPend.length + " título(s)")}
    ${stat("A pagar", money(payPend.reduce((s, r) => s + num(r.amount), 0)), payPend.length + " título(s)")}
  </div>
  <div class="grid2">
    <div class="card">
      <div class="card-head"><h3>Estoque baixo</h3></div>
      ${lowStock.length ? tbl(["Produto", "Qtd", "Mínimo"], lowStock.slice(0, 8).map(p =>
        `<tr><td>${esc(p.name)}</td><td><span class="pill dan">${num(p.qty)}</span></td><td>${num(p.minQty || 0)}</td></tr>`).join(""))
        : `<div class="empty">Nenhum item abaixo do mínimo.</div>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>Últimas vendas</h3></div>
      ${sales.length ? tbl(["Data", "Cliente", "Total"], sales.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8).map(s =>
        `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.customer || "—")}</td><td class="right">${money(s.total)}</td></tr>`).join(""))
        : `<div class="empty">Nenhuma venda registrada.</div>`}
    </div>
  </div>`;
}
const stat = (l, v, d = "") => `<div class="stat"><small>${l}</small><b>${v}</b><div class="delta">${d}</div></div>`;
const tbl = (heads, rows) => `<div class="tbl-wrap"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;

/* ================= PRODUTOS ================= */
function viewProdutos(root) {
  root.innerHTML = `
  <div class="card">
    <div class="card-head">
      <h3>Catálogo de itens</h3><div class="spacer" style="flex:1"></div>
      <div class="toolbar">
        <input id="pSearch" placeholder="Buscar por nome, SKU ou código de barras" style="min-width:260px" />
        <select id="pCat"><option value="">Todas as categorias</option></select>
        <button class="btn btn-primary" id="pNew">+ Novo item</button>
      </div>
    </div>
    <div id="pTable"></div>
  </div>`;
  const cats = [...new Set(list(STATE.products).map(p => p.category).filter(Boolean))];
  $("#pCat").innerHTML += cats.map(c => `<option>${esc(c)}</option>`).join("");
  const draw = () => {
    const q = ($("#pSearch").value || "").toLowerCase(), cat = $("#pCat").value;
    const rows = list(STATE.products)
      .filter(p => !cat || p.category === cat)
      .filter(p => !q || [p.name, p.sku, p.barcode, p.brand, p.model].some(v => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    $("#pTable").innerHTML = rows.length ? tbl(
      ["", "Produto", "SKU", "Cód. barras", "Categoria", "Estoque", "Custo médio", "Preço venda", "Margem un. (R$ · %)", "Total", "Ações"],
      rows.map(p => {
        const m = margin(p);
        return `<tr>
        <td>${p.image ? `<img class="thumb" src="${p.image}" alt="">` : `<div class="thumb"></div>`}</td>
        <td><strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.brand || "")} ${esc(p.model || "")}</small></td>
        <td>${esc(p.sku || "—")}</td><td>${esc(p.barcode || "—")}</td><td>${esc(p.category || "—")}</td>
        <td><span class="pill ${num(p.qty) <= num(p.minQty || 0) ? "dan" : "ok"}">${num(p.qty)} ${esc(p.unit || "un")}</span></td>
        <td class="right">${money(p.avgCost)}</td><td class="right">${money(p.price)}</td>
        <td class="right">${marginCell(m.value, m.pct, m.price > 0, m.markup)}</td>
        <td class="right">${money(num(p.qty) * num(p.avgCost))}</td>
        <td><button class="btn btn-sm" data-edit="${p.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-del="${p.id}">Excluir</button></td></tr>`;
      }).join("")
    ) : `<div class="empty">Nenhum item encontrado. Cadastre o primeiro produto.</div>`;
    $$("[data-edit]", $("#pTable")).forEach(b => b.onclick = () => productForm(b.dataset.edit));
    $$("[data-del]", $("#pTable")).forEach(b => b.onclick = () => confirmDialog("Excluir este item do catálogo?", async () => {
      await remove(ref(db, "products/" + b.dataset.del)); toast("Item excluído", "ok");
    }));
  };
  $("#pSearch").oninput = draw; $("#pCat").onchange = draw; $("#pNew").onclick = () => productForm();
  draw();
}

function productForm(id) {
  const p = id ? { id, ...STATE.products[id] } : {};
  openModal(id ? "Editar item" : "Novo item", `
  <div class="section-title">Identificação</div>
  <div class="grid2">
    <label class="field"><span>Nome do produto *</span><input id="f_name" value="${esc(p.name || "")}" required></label>
    <label class="field"><span>SKU / Código interno</span><input id="f_sku" value="${esc(p.sku || "")}"></label>
    <label class="field"><span>Código de barras (EAN/GTIN)</span><input id="f_barcode" value="${esc(p.barcode || "")}"></label>
    <label class="field"><span>NCM</span><input id="f_ncm" value="${esc(p.ncm || "")}"></label>
    <label class="field"><span>Categoria</span><input id="f_category" list="catlist" value="${esc(p.category || "")}">
      <datalist id="catlist">${[...new Set(list(STATE.products).map(x => x.category).filter(Boolean))].map(c => `<option>${esc(c)}</option>`).join("")}</datalist></label>
    <label class="field"><span>Subcategoria</span><input id="f_subcategory" value="${esc(p.subcategory || "")}"></label>
    <label class="field"><span>Marca</span><input id="f_brand" value="${esc(p.brand || "")}"></label>
    <label class="field"><span>Modelo</span><input id="f_model" value="${esc(p.model || "")}"></label>
    <label class="field"><span>Fornecedor padrão</span><input id="f_supplier" value="${esc(p.supplier || "")}"></label>
    <label class="field"><span>Localização no estoque</span><input id="f_location" value="${esc(p.location || "")}"></label>
  </div>
  <div class="section-title">Estoque e preços</div>
  <div class="grid3">
    <label class="field"><span>Unidade</span><input id="f_unit" value="${esc(p.unit || "un")}"></label>
    <label class="field"><span>Quantidade atual</span><input id="f_qty" type="number" step="0.001" value="${num(p.qty)}"></label>
    <label class="field"><span>Estoque mínimo</span><input id="f_minQty" type="number" step="0.001" value="${num(p.minQty)}"></label>
    <label class="field"><span>Custo médio (R$)</span><input id="f_avgCost" type="number" step="0.01" value="${num(p.avgCost)}"></label>
    <label class="field"><span>Preço de venda (R$)</span><input id="f_price" type="number" step="0.01" value="${num(p.price)}"></label>
    <label class="field"><span>Preço promocional (R$)</span><input id="f_promo" type="number" step="0.01" value="${num(p.promo)}"></label>
    <label class="field"><span>Garantia (meses)</span><input id="f_warranty" type="number" value="${num(p.warranty)}"></label>
    <label class="field"><span>Peso (kg)</span><input id="f_weight" type="number" step="0.001" value="${num(p.weight)}"></label>
    <label class="field"><span>Dimensões (C x L x A)</span><input id="f_dims" value="${esc(p.dims || "")}"></label>
  </div>
  <div class="section-title">Imagem (link externo ou arquivo em base64 no Realtime Database)</div>
  <div class="grid2">
    <label class="field"><span>URL da imagem</span><input id="f_imgUrl" placeholder="https://..." value="${p.image && !String(p.image).startsWith("data:") ? esc(p.image) : ""}"></label>
    <label class="field"><span>Enviar arquivo (convertido em base64)</span><input id="f_imgFile" type="file" accept="image/*"></label>
  </div>
  <div class="section-title">Detalhes</div>
  <label class="field"><span>Descrição</span><textarea id="f_desc">${esc(p.description || "")}</textarea></label>
  <label class="field"><span>Observações internas</span><textarea id="f_notes">${esc(p.notes || "")}</textarea></label>
  <label class="chk"><input type="checkbox" id="f_active" ${p.active === false ? "" : "checked"}> Item ativo para venda</label>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar item</button>`);

  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const name = $("#f_name").value.trim();
    if (!name) return toast("Informe o nome do produto", "err");
    let image = $("#f_imgUrl").value.trim() || (p.image && String(p.image).startsWith("data:") ? p.image : "");
    const file = $("#f_imgFile").files[0];
    if (file) { try { image = await fileToBase64(file); } catch { toast("Falha ao processar imagem", "err"); } }
    const data = {
      name, sku: $("#f_sku").value.trim(), barcode: $("#f_barcode").value.trim(), ncm: $("#f_ncm").value.trim(),
      category: $("#f_category").value.trim(), subcategory: $("#f_subcategory").value.trim(),
      brand: $("#f_brand").value.trim(), model: $("#f_model").value.trim(),
      supplier: $("#f_supplier").value.trim(), location: $("#f_location").value.trim(),
      unit: $("#f_unit").value.trim() || "un", qty: num($("#f_qty").value), minQty: num($("#f_minQty").value),
      avgCost: num($("#f_avgCost").value), price: num($("#f_price").value), promo: num($("#f_promo").value),
      warranty: num($("#f_warranty").value), weight: num($("#f_weight").value), dims: $("#f_dims").value.trim(),
      image, description: $("#f_desc").value.trim(), notes: $("#f_notes").value.trim(),
      active: $("#f_active").checked, updatedAt: Date.now()
    };
    if (id) await update(ref(db, "products/" + id), data);
    else await push(ref(db, "products"), { ...data, createdAt: Date.now() });
    closeModal(); toast("Item salvo com sucesso", "ok");
  };
}

/* ================= KITS ================= */
function viewKits(root) {
  const kits = list(STATE.kits);
  root.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Kits e combos</h3><div style="flex:1"></div>
      <button class="btn btn-primary" id="kNew">+ Novo kit</button></div>
    <p class="muted">O custo do kit é a soma dos custos médios dos itens que o compõem, mais o valor adicional definido para a montagem.</p>
    <div id="kTable" style="margin-top:12px"></div>
  </div>`;
  $("#kTable").innerHTML = kits.length ? tbl(
    ["Kit", "Composição", "Custo dos itens", "Adicional", "Custo total", "Preço venda", "Margem (R$ · %)", "Montáveis", "Ações"],
    kits.map(k => {
      const base = (k.items || []).reduce((s, it) => s + num(STATE.products[it.productId]?.avgCost) * num(it.qty), 0);
      const total = base + num(k.extraCost);
      const marg = num(k.price) - total;
      return `<tr>
        <td><strong>${esc(k.name)}</strong><br><small class="muted">${esc(k.sku || "")}</small></td>
        <td>${(k.items || []).map(it => `${num(it.qty)}× ${esc(STATE.products[it.productId]?.name || "item removido")}`).join("<br>") || "—"}</td>
        <td class="right">${money(base)}</td><td class="right">${money(k.extraCost)}</td>
        <td class="right"><strong>${money(total)}</strong></td><td class="right">${money(k.price)}</td>
        <td class="right">${marginCell(marg, num(k.price) > 0 ? marg / num(k.price) * 100 : 0, num(k.price) > 0, total > 0 ? marg / total * 100 : null)}</td>
        <td>${kitAvailable(k)}</td>
        <td><button class="btn btn-sm" data-edit="${k.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-del="${k.id}">Excluir</button></td></tr>`;
    }).join("")
  ) : `<div class="empty">Nenhum kit criado. Combine itens do catálogo para formar kits.</div>`;
  $("#kNew").onclick = () => kitForm();
  $$("[data-edit]", $("#kTable")).forEach(b => b.onclick = () => kitForm(b.dataset.edit));
  $$("[data-del]", $("#kTable")).forEach(b => b.onclick = () => confirmDialog("Excluir este kit?", async () => {
    await remove(ref(db, "kits/" + b.dataset.del)); toast("Kit excluído", "ok");
  }));
}

function kitForm(id) {
  const k = id ? { id, ...STATE.kits[id] } : { items: [] };
  let items = (k.items || []).map(i => ({ ...i }));
  openModal(id ? "Editar kit" : "Novo kit", `
    <div class="grid2">
      <label class="field"><span>Nome do kit *</span><input id="k_name" value="${esc(k.name || "")}"></label>
      <label class="field"><span>SKU do kit</span><input id="k_sku" value="${esc(k.sku || "")}"></label>
      <label class="field"><span>Custo adicional da montagem (R$)</span><input id="k_extra" type="number" step="0.01" value="${num(k.extraCost)}"></label>
      <label class="field"><span>Preço de venda do kit (R$)</span><input id="k_price" type="number" step="0.01" value="${num(k.price)}"></label>
    </div>
    <label class="field"><span>Descrição</span><textarea id="k_desc">${esc(k.description || "")}</textarea></label>
    <div class="section-title">Itens do kit</div>
    <div class="toolbar">
      <select id="k_prod" style="flex:1">${list(STATE.products).sort((a,b)=>(a.name||"").localeCompare(b.name||""))
        .map(p => `<option value="${p.id}">${esc(p.name)} — ${money(p.avgCost)}</option>`).join("")}</select>
      <input id="k_qty" type="number" step="0.001" value="1" style="max-width:100px">
      <button class="btn" id="k_add">Adicionar</button>
    </div>
    <div id="k_items"></div>
    <div class="stat" style="margin-top:6px"><small>Custo total do kit</small><b id="k_total">R$ 0,00</b>
      <div class="delta" id="k_marg"></div></div>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar kit</button>`);

  const draw = () => {
    $("#k_items").innerHTML = items.length ? tbl(["Item", "Qtd", "Custo médio", "Subtotal", ""],
      items.map((it, i) => {
        const p = STATE.products[it.productId] || {};
        return `<tr><td>${esc(p.name || "removido")}</td><td>${num(it.qty)}</td><td class="right">${money(p.avgCost)}</td>
        <td class="right">${money(num(p.avgCost) * num(it.qty))}</td>
        <td><button class="btn btn-sm btn-danger" data-rm="${i}">×</button></td></tr>`;
      }).join("")) : `<div class="empty">Nenhum item adicionado.</div>`;
    $$("[data-rm]", $("#k_items")).forEach(b => b.onclick = () => { items.splice(+b.dataset.rm, 1); draw(); });
    const base = items.reduce((s, it) => s + num(STATE.products[it.productId]?.avgCost) * num(it.qty), 0);
    const total = base + num($("#k_extra").value);
    $("#k_total").textContent = money(total);
    $("#k_marg").textContent = `Itens ${money(base)} + adicional ${money($("#k_extra").value)} · Margem: ${money(num($("#k_price").value) - total)}`;
  };
  $("#k_add").onclick = () => {
    const pid = $("#k_prod").value; if (!pid) return toast("Cadastre produtos primeiro", "err");
    const q = num($("#k_qty").value) || 1;
    const ex = items.find(i => i.productId === pid);
    if (ex) ex.qty = num(ex.qty) + q; else items.push({ productId: pid, qty: q });
    draw();
  };
  $("#k_extra").oninput = draw; $("#k_price").oninput = draw;
  draw();

  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const name = $("#k_name").value.trim();
    if (!name) return toast("Informe o nome do kit", "err");
    if (!items.length) return toast("Adicione ao menos um item ao kit", "err");
    const data = {
      name, sku: $("#k_sku").value.trim(), description: $("#k_desc").value.trim(),
      extraCost: num($("#k_extra").value), price: num($("#k_price").value), items, updatedAt: Date.now()
    };
    if (id) await update(ref(db, "kits/" + id), data);
    else await push(ref(db, "kits"), { ...data, createdAt: Date.now() });
    closeModal(); toast("Kit salvo", "ok");
  };
}

/* ================= ESTOQUE / COMPRAS (preço médio) ================= */
function viewEstoque(root) {
  const entries = list(STATE.entries).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const prods = list(STATE.products).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const totalCost = prods.reduce((s, p) => s + num(p.qty) * num(p.avgCost), 0);
  const totalSale = prods.reduce((s, p) => s + num(p.qty) * (num(p.promo) || num(p.price)), 0);

  root.innerHTML = `
  <div class="stats">
    ${stat("Valor total em estoque (custo)", money(totalCost), prods.length + " item(ns)")}
    ${stat("Valor potencial de venda", money(totalSale))}
    ${stat("Margem potencial", money(totalSale - totalCost), totalSale > 0 ? pct((totalSale - totalCost) / totalSale * 100) + " sobre a venda" : "")}
    ${stat("Entradas registradas", String(entries.length))}
  </div>

  <div class="card">
    <div class="card-head"><h3>Entrada de mercadoria (compra)</h3></div>
    <p class="muted">Ao registrar a entrada, o custo médio é recalculado automaticamente:
      (qtd atual × custo médio + qtd comprada × custo unitário) ÷ (qtd total).</p>
    <div class="grid3" style="margin-top:12px">
      <label class="field"><span>Produto</span><select id="e_prod">${prods
        .map(p => `<option value="${p.id}">${esc(p.name)} (estoque: ${num(p.qty)} · médio ${money(p.avgCost)})</option>`).join("")}</select></label>
      <label class="field"><span>Quantidade comprada</span><input id="e_qty" type="number" step="0.001" placeholder="10"></label>
      <label class="field"><span>Valor total da remessa (R$)</span><input id="e_total" type="number" step="0.01" placeholder="250,00"></label>
      <label class="field"><span>Ou custo unitário (R$)</span><input id="e_unit" type="number" step="0.01" placeholder="25,00"></label>
      <label class="field"><span>Fornecedor</span><input id="e_supplier"></label>
      <label class="field"><span>Nota fiscal / documento</span><input id="e_doc"></label>
      <label class="field"><span>Data</span><input id="e_date" type="date" value="${todayISO()}"></label>
      <label class="field"><span>Frete rateado (R$)</span><input id="e_freight" type="number" step="0.01" value="0"></label>
      <label class="field"><span>Pagamento</span><select id="e_pay">
        <option value="imediato">À vista — debita do saldo agora</option>
        <option value="prazo">A prazo — gera conta a pagar</option>
        <option value="nao">Não lançar no financeiro</option></select></label>
      <label class="field"><span>Conta de origem</span><select id="e_acc">${accountOptions(defaultAccount())}</select></label>
    </div>
    <div class="card" style="margin-top:12px;background:var(--panel-2)"><div id="e_preview" class="muted">Preencha os campos para ver a simulação do novo custo médio.</div></div>
    <div style="margin-top:12px"><button class="btn btn-primary" id="e_save">Registrar entrada</button></div>
  </div>

  <div class="card">
    <div class="card-head">
      <h3>Posição de estoque — todos os produtos</h3><div style="flex:1"></div>
      <div class="toolbar"><input id="sSearch" placeholder="Buscar produto, SKU ou categoria" style="min-width:240px" /></div>
    </div>
    <div id="sTable" style="margin-top:12px"></div>
  </div>

  <div class="card">
    <div class="card-head"><h3>Histórico de entradas</h3><div style="flex:1"></div>
      <div class="toolbar">${periodBar("entP", "month")}<button class="btn" id="ent_csv">CSV</button></div></div>
    <p class="muted">Ao editar ou excluir uma entrada, o estoque e o custo médio do produto são recalculados (a entrada é desfeita e, se for o caso, reaplicada com os novos valores).</p>
    <div id="eTable" style="margin-top:12px"></div>
  </div>`;

  /* ---------- posição de estoque ---------- */
  const drawStock = () => {
    const q = ($("#sSearch").value || "").toLowerCase();
    const rows = prods.filter(p => !q || [p.name, p.sku, p.barcode, p.category, p.brand, p.model]
      .some(v => (v || "").toLowerCase().includes(q)));
    $("#sTable").innerHTML = rows.length ? tbl(
      ["Produto", "SKU", "Categoria", "Local", "Qtd", "Mínimo", "Custo médio", "Custo total", "Preço venda", "Margem un. (R$ · %)", "Venda total", "Margem total (R$ · %)", "Entradas", "Ações"],
      rows.map(p => {
        const m = margin(p);
        const qty = num(p.qty);
        const cost = qty * num(p.avgCost);
        const sale = qty * (num(p.promo) || num(p.price));
        const nEnt = entries.filter(e => e.productId === p.id).length;
        return `<tr>
          <td><strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.brand || "")} ${esc(p.model || "")}</small></td>
          <td>${esc(p.sku || "—")}</td><td>${esc(p.category || "—")}</td><td>${esc(p.location || "—")}</td>
          <td><span class="pill ${qty <= num(p.minQty || 0) ? "dan" : "ok"}">${qty} ${esc(p.unit || "un")}</span></td>
          <td>${num(p.minQty || 0)}</td>
          <td class="right">${money(p.avgCost)}</td>
          <td class="right">${money(cost)}</td>
          <td class="right">${money(num(p.promo) || num(p.price))}</td>
          <td class="right">${marginCell(m.value, m.pct, m.price > 0, m.markup)}</td>
          <td class="right">${money(sale)}</td>
          <td class="right">${marginCell(sale - cost, sale > 0 ? (sale - cost) / sale * 100 : 0, sale > 0)}</td>
          <td>${nEnt}</td>
          <td><button class="btn btn-sm" data-pedit="${p.id}">Editar</button></td></tr>`;
      }).join("")
    ) : `<div class="empty">Nenhum produto encontrado.</div>`;
    $$("[data-pedit]", $("#sTable")).forEach(b => b.onclick = () => productForm(b.dataset.pedit));
  };
  $("#sSearch").oninput = drawStock;
  drawStock();

  /* ---------- histórico com editar / excluir ---------- */
  const drawEntries = () => {
  const per = entries.filter(e => inPeriod(e.date, "entP"));
  $("#ent_csv").onclick = () => downloadCsv(`compras_${periodOf("entP").from || "tudo"}`,
    [["Data", "Produto", "Qtd", "Custo unit.", "Frete", "Total", "Fornecedor", "Documento", "Pagamento", "Conta"],
    ...per.map(e => [e.date, STATE.products[e.productId]?.name || e.productName || "", num(e.qty),
      num(e.unitCost).toFixed(2), num(e.freight).toFixed(2), num(e.total).toFixed(2),
      e.supplier || "", e.doc || "", e.settlement || "", accName(e.accountId)])]);
  $("#eTable").innerHTML = per.length ? tbl(
    ["Data", "Produto", "Qtd", "Custo unit.", "Frete", "Total", "Custo médio anterior", "Novo custo médio", "Fornecedor", "Documento", "Ações"],
    per.map(e => `<tr><td>${fmtDate(e.date)}</td>
      <td>${esc(STATE.products[e.productId]?.name || e.productName || "—")}</td>
      <td>${num(e.qty)}</td><td class="right">${money(e.unitCost)}</td><td class="right">${money(e.freight)}</td>
      <td class="right">${money(e.total)}</td>
      <td class="right">${money(e.prevAvg)}</td><td class="right"><strong>${money(e.newAvg)}</strong></td>
      <td>${esc(e.supplier || "—")}</td><td>${esc(e.doc || "—")}</td>
      <td><button class="btn btn-sm" data-eedit="${e.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-edel="${e.id}">Excluir</button></td></tr>`).join("")
  ) : `<div class="empty">Nenhuma entrada no período.</div>`;

  $$("[data-eedit]", $("#eTable")).forEach(b => b.onclick = () => entryForm(b.dataset.eedit));
  $$("[data-edel]", $("#eTable")).forEach(b => b.onclick = () => {
    const e = { id: b.dataset.edel, ...STATE.entries[b.dataset.edel] };
    confirmDialog(`Excluir a entrada de ${num(e.qty)} un de "${STATE.products[e.productId]?.name || e.productName || "produto"}"? O estoque e o custo médio serão desfeitos.`, async () => {
      const rev = revertEntry(e);
      if (rev) await update(ref(db, "products/" + e.productId), rev);
      await finRemoveByRef("entry", e.id);
      for (const r of list(STATE.payables).filter(x => x.refKind === "entry" && x.refId === e.id)) {
        await finRemoveByRef("payables", r.id);
        await remove(ref(db, "payables/" + r.id));
      }
      await remove(ref(db, "entries/" + e.id));
      toast("Entrada excluída e estoque ajustado", "ok");
      renderView();
    });
  });
  };
  bindPeriod("entP", drawEntries);
  drawEntries();

  /* ---------- registrar nova entrada ---------- */
  const preview = () => {
    const p = STATE.products[$("#e_prod").value]; if (!p) return;
    const q = num($("#e_qty").value);
    const unit = num($("#e_unit").value) || (q ? (num($("#e_total").value) + num($("#e_freight").value)) / q : 0);
    if (!q || !unit) { $("#e_preview").textContent = "Preencha quantidade e valor para simular."; return; }
    const newQty = num(p.qty) + q;
    const newAvg = (num(p.qty) * num(p.avgCost) + q * unit) / newQty;
    $("#e_preview").innerHTML = `<strong>Simulação:</strong> estoque ${num(p.qty)} → ${newQty} · custo médio ${money(p.avgCost)} → <strong style="color:var(--primary)">${money(newAvg)}</strong> (unitário desta compra: ${money(unit)})`;
  };
  ["e_prod", "e_qty", "e_total", "e_unit", "e_freight"].forEach(i => { $("#" + i).oninput = preview; $("#" + i).onchange = preview; });

  $("#e_save").onclick = async () => {
    const pid = $("#e_prod").value, p = STATE.products[pid];
    if (!p) return toast("Cadastre um produto antes", "err");
    const q = num($("#e_qty").value);
    if (q <= 0) return toast("Informe a quantidade", "err");
    const freight = num($("#e_freight").value);
    const unit = num($("#e_unit").value) || (num($("#e_total").value) + freight) / q;
    if (unit <= 0) return toast("Informe o valor da compra", "err");
    const total = unit * q;
    const prevAvg = num(p.avgCost), prevQty = num(p.qty);
    const newQty = prevQty + q;
    const newAvg = (prevQty * prevAvg + q * unit) / newQty;
    await update(ref(db, "products/" + pid), { qty: newQty, avgCost: Number(newAvg.toFixed(4)) });
    const mode = $("#e_pay").value;
    const accId = $("#e_acc") ? $("#e_acc").value : "";
    const eDate = $("#e_date").value || todayISO();
    const entRef = await push(ref(db, "entries"), {
      productId: pid, productName: p.name, qty: q, unitCost: Number(unit.toFixed(4)), total,
      freight, prevAvg, newAvg: Number(newAvg.toFixed(4)), supplier: $("#e_supplier").value.trim(),
      doc: $("#e_doc").value.trim(), date: eDate, settlement: mode,
      accountId: mode === "imediato" ? accId : "", createdAt: Date.now(),
      user: STATE.user.email
    });
    if (mode === "prazo") {
      await push(ref(db, "payables"), {
        description: `Compra ${p.name} (${q} un)`, supplier: $("#e_supplier").value.trim(),
        amount: total, due: eDate, status: "pendente", accountId: accId,
        category: "Compra de mercadoria", refKind: "entry", refId: entRef.key, createdAt: Date.now()
      });
      toast("Entrada registrada e conta a pagar gerada", "ok");
    } else if (mode === "imediato" && accId) {
      await finAdd({
        date: eDate, kind: "compra", amount: total, accountId: accId,
        description: `Compra ${p.name} (${q} un)`, party: $("#e_supplier").value.trim(),
        refKind: "entry", refId: entRef.key
      });
      toast(`Entrada registrada · ${money(total)} debitado de ${accName(accId)}`, "ok");
    } else {
      toast(`Entrada registrada. Novo custo médio: ${money(newAvg)}`, "ok");
    }
    renderView();
  };
  preview();
}

/* Desfaz o efeito de uma entrada no produto (estoque + custo médio) */
function revertEntry(e) {
  const p = STATE.products[e.productId];
  if (!p) return null;
  const curQty = num(p.qty), curAvg = num(p.avgCost);
  const qty = Math.max(0, curQty - num(e.qty));
  const valor = curQty * curAvg - num(e.qty) * num(e.unitCost);
  const avgCost = qty > 0 ? Math.max(0, valor / qty) : 0;
  return { qty: Number(qty.toFixed(4)), avgCost: Number(avgCost.toFixed(4)) };
}

/* Edição de uma entrada já lançada */
function entryForm(id) {
  const e = { id, ...STATE.entries[id] };
  const p = STATE.products[e.productId] || {};
  openModal("Editar entrada", `
    <p class="muted">Produto: <strong>${esc(p.name || e.productName || "—")}</strong></p>
    <div class="grid3">
      <label class="field"><span>Quantidade</span><input id="x_qty" type="number" step="0.001" value="${num(e.qty)}"></label>
      <label class="field"><span>Custo unitário (R$)</span><input id="x_unit" type="number" step="0.01" value="${num(e.unitCost)}"></label>
      <label class="field"><span>Frete rateado (R$)</span><input id="x_freight" type="number" step="0.01" value="${num(e.freight)}"></label>
      <label class="field"><span>Fornecedor</span><input id="x_supplier" value="${esc(e.supplier || "")}"></label>
      <label class="field"><span>Documento</span><input id="x_doc" value="${esc(e.doc || "")}"></label>
      <label class="field"><span>Data</span><input id="x_date" type="date" value="${esc(e.date || todayISO())}"></label>
    </div>
    <div class="card" style="margin-top:12px;background:var(--panel-2)"><div id="x_preview" class="muted"></div></div>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar alterações</button>`);

  const base = revertEntry(e) || { qty: 0, avgCost: 0 };
  const calc = () => {
    const q = num($("#x_qty").value), unit = num($("#x_unit").value);
    const newQty = base.qty + q;
    const newAvg = newQty > 0 ? (base.qty * base.avgCost + q * unit) / newQty : 0;
    return { q, unit, newQty, newAvg };
  };
  const draw = () => {
    const c = calc();
    $("#x_preview").innerHTML = `Sem esta entrada o estoque seria <strong>${base.qty}</strong> com custo médio ${money(base.avgCost)}.
      Com os valores atuais: estoque <strong>${c.newQty}</strong> · custo médio <strong style="color:var(--primary)">${money(c.newAvg)}</strong>.`;
  };
  ["x_qty", "x_unit"].forEach(i => $("#" + i).oninput = draw);
  draw();

  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const c = calc();
    if (c.q <= 0) return toast("Informe a quantidade", "err");
    if (c.unit <= 0) return toast("Informe o custo unitário", "err");
    await update(ref(db, "products/" + e.productId), {
      qty: Number(c.newQty.toFixed(4)), avgCost: Number(c.newAvg.toFixed(4))
    });
    await update(ref(db, "entries/" + id), {
      qty: c.q, unitCost: Number(c.unit.toFixed(4)), total: Number((c.q * c.unit).toFixed(2)),
      freight: num($("#x_freight").value), prevAvg: base.avgCost, newAvg: Number(c.newAvg.toFixed(4)),
      supplier: $("#x_supplier").value.trim(), doc: $("#x_doc").value.trim(),
      date: $("#x_date").value || todayISO(), updatedAt: Date.now(), editedBy: STATE.user?.email || ""
    });
    closeModal();
    toast("Entrada atualizada e estoque recalculado", "ok");
    renderView();
  };
}

/* ================= VENDAS ================= */
function viewVendas(root) {
  const pid = "vendP";
  root.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Vendas</h3><div style="flex:1"></div>
      <div class="toolbar">
        ${periodBar(pid, "month")}
        <input id="v_q" placeholder="Buscar cliente, item ou pagamento">
        <button class="btn" id="v_csv">CSV</button>
        <button class="btn" id="v_pdf">PDF</button>
        <button class="btn btn-primary" id="sNew">+ Nova venda</button>
      </div>
    </div>
    <div id="vBody" style="margin-top:12px"></div>
  </div>`;
  let rows = [];
  const draw = () => {
    const q = ($("#v_q").value || "").toLowerCase();
    rows = list(STATE.sales)
      .filter(s => inPeriod(s.date, pid))
      .filter(s => !q || [s.customer, s.payment, (s.items || []).map(i => i.name).join(" ")].some(v => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const rev = rows.reduce((a, s) => a + num(s.total), 0);
    const cost = rows.reduce((a, s) => a + num(s.cost), 0);
    $("#vBody").innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        ${stat("Faturamento do período", money(rev), rows.length + " venda(s)")}
        ${stat("Custo das vendas", money(cost))}
        ${stat("Lucro bruto", money(rev - cost), rev > 0 ? pct((rev - cost) / rev * 100) : "")}
        ${stat("Ticket médio", money(rows.length ? rev / rows.length : 0), periodLabel(pid))}
      </div>
      ${rows.length ? tbl(["Data", "Cliente", "Itens", "Pagamento", "Recebimento", "Custo", "Total", "Lucro (R$ · %)", "Ações"],
      rows.map(s => `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.customer || "—")}</td>
      <td>${(s.items || []).map(i => `${num(i.qty)}× ${esc(i.name)}`).join("<br>")}</td>
      <td>${esc(s.payment || "—")}</td>
      <td>${s.settlement === "prazo" ? `<span class="pill warn">a receber</span>` : `<span class="pill ok">${esc(accName(s.accountId))}</span>`}</td>
      <td class="right">${money(s.cost)}</td>
      <td class="right"><strong>${money(s.total)}</strong></td>
      <td class="right">${marginCell(num(s.total) - num(s.cost), num(s.total) > 0 ? (num(s.total) - num(s.cost)) / num(s.total) * 100 : 0, num(s.total) > 0)}</td>
      <td><button class="btn btn-sm btn-danger" data-del="${s.id}">Excluir</button></td></tr>`).join(""))
      : `<div class="empty">Nenhuma venda no período.</div>`}`;
    $$("[data-del]", root).forEach(b => b.onclick = () => confirmDialog("Excluir a venda? Os lançamentos financeiros e títulos gerados por ela também serão desfeitos (o estoque não é devolvido automaticamente).", async () => {
      const id = b.dataset.del;
      await finRemoveByRef("sale", id);
      for (const r of list(STATE.receivables).filter(r => r.refKind === "sale" && r.refId === id)) {
        await finRemoveByRef("receivables", r.id);
        await remove(ref(db, "receivables/" + r.id));
      }
      await remove(ref(db, "sales/" + id));
      toast("Venda excluída e saldo ajustado", "ok");
    }));
  };
  $("#sNew").onclick = saleForm;
  $("#v_q").oninput = draw;
  $("#v_csv").onclick = () => downloadCsv(`vendas_${periodOf(pid).from || "tudo"}`,
    [["Data", "Cliente", "Pagamento", "Recebimento", "Conta", "Itens", "Custo", "Total", "Lucro"],
    ...rows.map(s => [s.date, s.customer || "", s.payment || "", s.settlement || "", accName(s.accountId),
      (s.items || []).map(i => `${num(i.qty)}x ${i.name}`).join(" | "),
      num(s.cost).toFixed(2), num(s.total).toFixed(2), (num(s.total) - num(s.cost)).toFixed(2)])]);
  $("#v_pdf").onclick = () => printHTML(`Vendas — ${periodLabel(pid)}`,
    kpiHTML([["Faturamento", money(rows.reduce((a, s) => a + num(s.total), 0))],
    ["Custo", money(rows.reduce((a, s) => a + num(s.cost), 0))],
    ["Lucro bruto", money(rows.reduce((a, s) => a + num(s.total) - num(s.cost), 0))],
    ["Vendas", String(rows.length)]]) +
    tblHTML(["Data", "Cliente", "Pagamento", "Custo", "Total", "Lucro"],
      rows.map(s => `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.customer || "")}</td><td>${esc(s.payment || "")}</td>
      <td class="right">${money(s.cost)}</td><td class="right">${money(s.total)}</td>
      <td class="right">${money(num(s.total) - num(s.cost))}</td></tr>`).join("")));
  bindPeriod(pid, draw);
  draw();
}

function saleForm() {
  let items = [];
  const opts = [
    ...list(STATE.products).map(p => `<option value="p:${p.id}">${esc(p.name)} — ${money(p.price)}</option>`),
    ...list(STATE.kits).map(k => `<option value="k:${k.id}">[KIT] ${esc(k.name)} — ${money(k.price)}</option>`)
  ].join("");
  openModal("Nova venda", `
    <div class="grid3">
      <label class="field"><span>Cliente</span><input id="s_customer"></label>
      <label class="field"><span>Data</span><input id="s_date" type="date" value="${todayISO()}"></label>
      <label class="field"><span>Forma de pagamento</span><select id="s_pay">
        <option>Dinheiro</option><option>PIX</option><option>Débito</option><option>Crédito</option><option>Boleto</option><option>A prazo</option></select></label>
      <label class="field"><span>Desconto (R$)</span><input id="s_disc" type="number" step="0.01" value="0"></label>
      <label class="field"><span>Frete cobrado (R$)</span><input id="s_freight" type="number" step="0.01" value="0"></label>
      <label class="field"><span>Recebimento</span><select id="s_rec">
        <option value="imediato">À vista — credita no saldo agora</option>
        <option value="prazo">A prazo — gera conta a receber</option></select></label>
      <label class="field"><span>Conta de destino</span><select id="s_acc">${accountOptions(defaultAccount())}</select></label>
    </div>
    <div class="section-title">Itens da venda</div>
    <div class="toolbar">
      <select id="s_item" style="flex:1">${opts}</select>
      <input id="s_qty" type="number" step="0.001" value="1" style="max-width:100px">
      <button class="btn" id="s_add">Adicionar</button>
    </div>
    <div id="s_list"></div>
    <div class="stat" style="margin-top:6px"><small>Total da venda</small><b id="s_total">R$ 0,00</b><div class="delta" id="s_info"></div></div>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Registrar venda</button>`);

  const draw = () => {
    $("#s_list").innerHTML = items.length ? tbl(["Item", "Qtd", "Preço unit.", "Custo unit.", "Subtotal", ""],
      items.map((it, i) => `<tr><td>${esc(it.name)}</td><td>${num(it.qty)}</td>
      <td><input type="number" step="0.01" value="${num(it.price)}" data-price="${i}" style="max-width:110px"></td>
      <td class="right">${money(it.cost)}</td><td class="right">${money(num(it.price) * num(it.qty))}</td>
      <td><button class="btn btn-sm btn-danger" data-rm="${i}">×</button></td></tr>`).join(""))
      : `<div class="empty">Nenhum item.</div>`;
    $$("[data-rm]", $("#s_list")).forEach(b => b.onclick = () => { items.splice(+b.dataset.rm, 1); draw(); });
    $$("[data-price]", $("#s_list")).forEach(inp => inp.onchange = () => { items[+inp.dataset.price].price = num(inp.value); draw(); });
    const sub = items.reduce((s, i) => s + num(i.price) * num(i.qty), 0);
    const cost = items.reduce((s, i) => s + num(i.cost) * num(i.qty), 0);
    const total = sub - num($("#s_disc").value) + num($("#s_freight").value);
    $("#s_total").textContent = money(total);
    $("#s_info").textContent = `Custo ${money(cost)} · Lucro estimado ${money(total - cost)}`;
  };
  $("#s_add").onclick = () => {
    const v = $("#s_item").value; if (!v) return toast("Cadastre produtos ou kits", "err");
    const [t, id] = v.split(":"); const q = num($("#s_qty").value) || 1;
    if (t === "p") { const p = STATE.products[id]; items.push({ type: "product", id, name: p.name, qty: q, price: num(p.promo) || num(p.price), cost: num(p.avgCost) }); }
    else { const k = STATE.kits[id]; items.push({ type: "kit", id, name: "[KIT] " + k.name, qty: q, price: num(k.price), cost: kitCost(k) }); }
    draw();
  };
  $("#s_disc").oninput = draw; $("#s_freight").oninput = draw;
  draw();

  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    if (!items.length) return toast("Adicione itens à venda", "err");
    const sub = items.reduce((s, i) => s + num(i.price) * num(i.qty), 0);
    const cost = items.reduce((s, i) => s + num(i.cost) * num(i.qty), 0);
    const total = sub - num($("#s_disc").value) + num($("#s_freight").value);
    // baixa de estoque
    const updates = {};
    for (const it of items) {
      if (it.type === "product") {
        const p = STATE.products[it.id];
        updates["products/" + it.id + "/qty"] = num(p.qty) - num(it.qty);
      } else {
        for (const ki of (STATE.kits[it.id].items || [])) {
          const p = STATE.products[ki.productId]; if (!p) continue;
          const key = "products/" + ki.productId + "/qty";
          const cur = key in updates ? updates[key] : num(p.qty);
          updates[key] = cur - num(ki.qty) * num(it.qty);
        }
      }
    }
    await update(ref(db), updates);
    const sale = {
      customer: $("#s_customer").value.trim(), date: $("#s_date").value || todayISO(),
      payment: $("#s_pay").value, discount: num($("#s_disc").value), freight: num($("#s_freight").value),
      items, subtotal: sub, cost, total, user: STATE.user.email, createdAt: Date.now()
    };
    const settlement = $("#s_rec").value;
    const accId = $("#s_acc") ? $("#s_acc").value : "";
    sale.settlement = settlement; sale.accountId = settlement === "imediato" ? accId : "";
    const saleRef = await push(ref(db, "sales"), sale);
    if (settlement === "prazo") {
      await push(ref(db, "receivables"), {
        description: "Venda " + (sale.customer || "balcão"), customer: sale.customer,
        amount: total, due: sale.date, status: "pendente", category: "Venda",
        accountId: accId, refKind: "sale", refId: saleRef.key, createdAt: Date.now()
      });
      toast("Venda registrada e conta a receber gerada", "ok");
    } else if (accId) {
      await finAdd({
        date: sale.date, kind: "venda", amount: total, accountId: accId,
        description: "Venda " + (sale.customer || "balcão"), party: sale.customer,
        refKind: "sale", refId: saleRef.key
      });
      toast(`Venda registrada · ${money(total)} creditado em ${accName(accId)}`, "ok");
    } else {
      toast("Venda registrada, mas cadastre uma conta no Financeiro para creditar o saldo", "err");
    }
    closeModal();
  };
}

/* ================= FINANCEIRO ================= */
const FIN_TABS = [
  ["contas", "Contas & saldos"], ["mov", "Movimentos"], ["rec", "Contas a receber"],
  ["pay", "Contas a pagar"], ["verbas", "Verbas & investimentos"], ["doacoes", "Doações"],
  ["flux", "Fluxo de caixa"]
];
function viewFinanceiro(root) {
  root.innerHTML = `<div class="tabs">${FIN_TABS.map(([t, l]) => `<button class="tab" data-t="${t}">${l}</button>`).join("")}</div><div id="finBody"></div>`;
  const tabs = $$(".tab", root);
  const show = t => {
    STATE.finTab = t;
    tabs.forEach(b => b.classList.toggle("active", b.dataset.t === t));
    const el = $("#finBody");
    if (t === "contas") accountsView(el);
    else if (t === "mov") finLedger(el, Object.keys(FIN_KINDS), "Movimentos financeiros", "mov", "ajuste_in");
    else if (t === "rec") accountsPanel(el, "receivables", "Contas a receber", "recebido", "Cliente");
    else if (t === "pay") accountsPanel(el, "payables", "Contas a pagar", "pago", "Fornecedor");
    else if (t === "verbas") finLedger(el, ["aporte", "investimento", "resgate"], "Injeções de verba e investimentos", "verbas", "aporte");
    else if (t === "doacoes") finLedger(el, ["doacao_in", "doacao_out"], "Doações recebidas e efetuadas", "doa", "doacao_in");
    else cashFlow(el);
  };
  tabs.forEach(b => b.onclick = () => show(b.dataset.t));
  show(FIN_TABS.some(x => x[0] === STATE.finTab) ? STATE.finTab : "contas");
}

/* ---------- Contas (Pix / espécie / banco) ---------- */
function accountsView(el) {
  const pid = "accP";
  el.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Contas e saldos</h3><div style="flex:1"></div>
      <div class="toolbar">
        ${periodBar(pid, "month")}
        <button class="btn" id="accTransfer">⇄ Transferência</button>
        <button class="btn btn-primary" id="accAdd">+ Nova conta</button>
      </div>
    </div>
    <p class="muted">Saldo = saldo inicial + todas as entradas − todas as saídas registradas nos movimentos. Vendas creditam e compras/despesas debitam automaticamente.</p>
    <div id="accBody" style="margin-top:12px"></div>
  </div>`;
  const draw = () => {
    const accs = accList();
    const movs = finList().filter(f => inPeriod(f.date, pid));
    const inP = id => movs.filter(f => f.accountId === id && f.dir === "in").reduce((s, f) => s + num(f.amount), 0);
    const outP = id => movs.filter(f => f.accountId === id && f.dir === "out").reduce((s, f) => s + num(f.amount), 0);
    $("#accBody").innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        ${stat("Saldo total consolidado", money(totalBalance()), accs.length + " conta(s)")}
        ${stat("Entradas do período", money(movs.filter(f => f.dir === "in").reduce((s, f) => s + num(f.amount), 0)), periodLabel(pid))}
        ${stat("Saídas do período", money(movs.filter(f => f.dir === "out").reduce((s, f) => s + num(f.amount), 0)), periodLabel(pid))}
        ${stat("Resultado do período", money(movs.reduce((s, f) => s + (f.dir === "in" ? num(f.amount) : -num(f.amount)), 0)))}
      </div>
      ${accs.length ? tbl(["Conta", "Tipo", "Saldo inicial", "Entradas do período", "Saídas do período", "Saldo atual", "Ações"],
      accs.map(a => `<tr>
        <td><strong>${esc(a.name)}</strong><br><small class="muted">${esc(a.bank || a.notes || "")}</small></td>
        <td><span class="pill">${esc(ACC_TYPES[a.type] || a.type)}</span></td>
        <td class="right">${money(a.opening)}</td>
        <td class="right">${money(inP(a.id))}</td>
        <td class="right">${money(outP(a.id))}</td>
        <td class="right"><strong class="pill ${accBalance(a.id) >= 0 ? "ok" : "dan"}">${money(accBalance(a.id))}</strong></td>
        <td><button class="btn btn-sm" data-aedit="${a.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-adel="${a.id}">Excluir</button></td></tr>`).join(""))
      : `<div class="empty">Nenhuma conta cadastrada. Crie sua conta digital (Pix), o caixa em espécie e as contas bancárias.</div>`}`;
    $$("[data-aedit]", el).forEach(b => b.onclick = () => accountEditForm(b.dataset.aedit));
    $$("[data-adel]", el).forEach(b => b.onclick = () => confirmDialog("Excluir esta conta? Os movimentos ligados a ela continuarão registrados.", async () => {
      await remove(ref(db, "accounts/" + b.dataset.adel)); toast("Conta excluída", "ok");
    }));
  };
  $("#accAdd").onclick = () => accountEditForm();
  $("#accTransfer").onclick = transferForm;
  bindPeriod(pid, draw);
  draw();
}
function accountEditForm(id) {
  const a = id ? { id, ...STATE.accounts[id] } : {};
  openModal(id ? "Editar conta" : "Nova conta", `
    <div class="grid2">
      <label class="field"><span>Nome da conta *</span><input id="ac_name" value="${esc(a.name || "")}" placeholder="Ex.: Pix Nubank, Caixa da loja"></label>
      <label class="field"><span>Tipo *</span><select id="ac_type">
        ${Object.entries(ACC_TYPES).map(([v, l]) => `<option value="${v}" ${a.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field"><span>Banco / instituição</span><input id="ac_bank" value="${esc(a.bank || "")}"></label>
      <label class="field"><span>Saldo inicial (R$)</span><input id="ac_open" type="number" step="0.01" value="${num(a.opening)}"></label>
    </div>
    <label class="field"><span>Observações</span><textarea id="ac_notes">${esc(a.notes || "")}</textarea></label>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar conta</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const name = $("#ac_name").value.trim();
    if (!name) return toast("Informe o nome da conta", "err");
    const data = {
      name, type: $("#ac_type").value, bank: $("#ac_bank").value.trim(),
      opening: num($("#ac_open").value), notes: $("#ac_notes").value.trim(), updatedAt: Date.now()
    };
    if (id) await update(ref(db, "accounts/" + id), data);
    else await push(ref(db, "accounts"), { ...data, createdAt: Date.now() });
    closeModal(); toast("Conta salva", "ok");
  };
}
function transferForm() {
  if (accList().length < 2) return toast("Cadastre pelo menos duas contas", "err");
  openModal("Transferência entre contas", `
    <div class="grid2">
      <label class="field"><span>De *</span><select id="tr_from">${accountOptions()}</select></label>
      <label class="field"><span>Para *</span><select id="tr_to">${accountOptions()}</select></label>
      <label class="field"><span>Valor (R$) *</span><input id="tr_amount" type="number" step="0.01"></label>
      <label class="field"><span>Data</span><input id="tr_date" type="date" value="${todayISO()}"></label>
    </div>
    <label class="field"><span>Descrição</span><input id="tr_desc" placeholder="Ex.: Sangria do caixa para o banco"></label>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Transferir</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const from = $("#tr_from").value, to = $("#tr_to").value, amount = num($("#tr_amount").value);
    if (!amount) return toast("Informe o valor", "err");
    if (from === to) return toast("Escolha contas diferentes", "err");
    const date = $("#tr_date").value || todayISO();
    const desc = $("#tr_desc").value.trim() || `Transferência ${accName(from)} → ${accName(to)}`;
    const gid = uid();
    await finAdd({ date, kind: "transfer_out", accountId: from, amount, description: desc, refKind: "transfer", refId: gid });
    await finAdd({ date, kind: "transfer_in", accountId: to, amount, description: desc, refKind: "transfer", refId: gid });
    closeModal(); toast("Transferência registrada", "ok");
  };
}

/* ---------- Livro de movimentos (genérico, usado em vários painéis) ---------- */
function finLedger(el, kinds, title, pidBase, defaultKind) {
  const pid = pidBase + "P";
  el.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>${title}</h3><div style="flex:1"></div>
      <div class="toolbar">
        ${periodBar(pid, "month")}
        <select id="${pidBase}_acc"><option value="">Todas as contas</option>${accList().map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
        <select id="${pidBase}_kind"><option value="">Todos os tipos</option>${kinds.map(k => `<option value="${k}">${kindLabel(k)}</option>`).join("")}</select>
        <input id="${pidBase}_q" placeholder="Buscar descrição/pessoa">
        <button class="btn" id="${pidBase}_csv">CSV</button>
        <button class="btn" id="${pidBase}_pdf">PDF</button>
        <button class="btn btn-primary" id="${pidBase}_new">+ Novo lançamento</button>
      </div>
    </div>
    <div id="${pidBase}_body" style="margin-top:12px"></div>
  </div>`;
  let rows = [];
  const draw = () => {
    const accF = $("#" + pidBase + "_acc").value, kF = $("#" + pidBase + "_kind").value;
    const q = ($("#" + pidBase + "_q").value || "").toLowerCase();
    rows = finList()
      .filter(f => kinds.includes(f.kind))
      .filter(f => inPeriod(f.date, pid))
      .filter(f => !accF || f.accountId === accF)
      .filter(f => !kF || f.kind === kF)
      .filter(f => !q || [f.description, f.party, f.category].some(v => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const tin = rows.filter(f => f.dir === "in").reduce((s, f) => s + num(f.amount), 0);
    const tout = rows.filter(f => f.dir === "out").reduce((s, f) => s + num(f.amount), 0);
    $("#" + pidBase + "_body").innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        ${stat("Entradas", money(tin), periodLabel(pid))}
        ${stat("Saídas", money(tout), periodLabel(pid))}
        ${stat("Líquido", money(tin - tout), rows.length + " lançamento(s)")}
      </div>
      ${rows.length ? tbl(["Data", "Tipo", "Descrição", "Pessoa / empresa", "Conta", "Entrada", "Saída", "Origem", "Ações"],
      rows.map(f => `<tr><td>${fmtDate(f.date)}</td>
        <td><span class="pill ${f.dir === "in" ? "ok" : "dan"}">${esc(kindLabel(f.kind))}</span></td>
        <td>${esc(f.description || "—")}</td><td>${esc(f.party || "—")}</td><td>${esc(accName(f.accountId))}</td>
        <td class="right">${f.dir === "in" ? money(f.amount) : "—"}</td>
        <td class="right">${f.dir === "out" ? money(f.amount) : "—"}</td>
        <td><small class="muted">${esc(f.refKind || "manual")}</small></td>
        <td>${f.refKind && f.refKind !== "manual" ? `<span class="muted">automático</span>` :
        `<button class="btn btn-sm" data-fedit="${f.id}">Editar</button>
             <button class="btn btn-sm btn-danger" data-fdel="${f.id}">Excluir</button>`}</td></tr>`).join(""))
      : `<div class="empty">Nenhum movimento no período.</div>`}`;
    $$("[data-fedit]", el).forEach(b => b.onclick = () => finForm(kinds, defaultKind, b.dataset.fedit));
    $$("[data-fdel]", el).forEach(b => b.onclick = () => confirmDialog("Excluir este movimento? O saldo será recalculado.", async () => {
      await remove(ref(db, "fin/" + b.dataset.fdel)); toast("Movimento excluído", "ok");
    }));
  };
  $("#" + pidBase + "_new").onclick = () => finForm(kinds, defaultKind);
  ["_acc", "_kind"].forEach(s => $("#" + pidBase + s).onchange = draw);
  $("#" + pidBase + "_q").oninput = draw;
  $("#" + pidBase + "_csv").onclick = () => downloadCsv(`${pidBase}_${periodOf(pid).from || "tudo"}_${periodOf(pid).to || ""}`,
    [["Data", "Tipo", "Descrição", "Pessoa", "Conta", "Entrada", "Saída"],
    ...rows.map(f => [f.date, kindLabel(f.kind), f.description, f.party, accName(f.accountId),
      f.dir === "in" ? num(f.amount).toFixed(2) : "", f.dir === "out" ? num(f.amount).toFixed(2) : ""])]);
  $("#" + pidBase + "_pdf").onclick = () => printHTML(`${title} — ${periodLabel(pid)}`,
    kpiHTML([["Entradas", money(rows.filter(f => f.dir === "in").reduce((s, f) => s + num(f.amount), 0))],
    ["Saídas", money(rows.filter(f => f.dir === "out").reduce((s, f) => s + num(f.amount), 0))],
    ["Saldo total das contas", money(totalBalance())]]) +
    tblHTML(["Data", "Tipo", "Descrição", "Pessoa", "Conta", "Entrada", "Saída"],
      rows.map(f => `<tr><td>${fmtDate(f.date)}</td><td>${esc(kindLabel(f.kind))}</td><td>${esc(f.description || "")}</td>
      <td>${esc(f.party || "")}</td><td>${esc(accName(f.accountId))}</td>
      <td class="right">${f.dir === "in" ? money(f.amount) : ""}</td>
      <td class="right">${f.dir === "out" ? money(f.amount) : ""}</td></tr>`).join("")));
  bindPeriod(pid, draw);
  draw();
}
function finForm(kinds, defaultKind, id) {
  if (!accList().length) return toast("Cadastre uma conta primeiro", "err");
  const f = id ? { id, ...STATE.fin[id] } : {};
  openModal(id ? "Editar movimento" : "Novo movimento", `
    <div class="grid2">
      <label class="field"><span>Tipo *</span><select id="fm_kind">
        ${kinds.map(k => `<option value="${k}" ${(f.kind || defaultKind) === k ? "selected" : ""}>${kindLabel(k)}</option>`).join("")}</select></label>
      <label class="field"><span>Conta *</span><select id="fm_acc">${accountOptions(f.accountId)}</select></label>
      <label class="field"><span>Valor (R$) *</span><input id="fm_amount" type="number" step="0.01" value="${num(f.amount) || ""}"></label>
      <label class="field"><span>Data</span><input id="fm_date" type="date" value="${esc(f.date || todayISO())}"></label>
      <label class="field"><span>Descrição *</span><input id="fm_desc" value="${esc(f.description || "")}"></label>
      <label class="field"><span>Pessoa / empresa</span><input id="fm_party" value="${esc(f.party || "")}"></label>
    </div>
    <label class="field"><span>Observações</span><textarea id="fm_notes">${esc(f.notes || "")}</textarea></label>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const kind = $("#fm_kind").value, amount = num($("#fm_amount").value), desc = $("#fm_desc").value.trim();
    if (!amount || !desc) return toast("Informe descrição e valor", "err");
    const data = {
      kind, dir: FIN_KINDS[kind][1], accountId: $("#fm_acc").value, amount,
      date: $("#fm_date").value || todayISO(), description: desc, party: $("#fm_party").value.trim(),
      category: kindLabel(kind), notes: $("#fm_notes").value.trim(), updatedAt: Date.now()
    };
    if (id) await update(ref(db, "fin/" + id), data);
    else await push(ref(db, "fin"), { ...data, refKind: "manual", refId: "", createdAt: Date.now(), user: STATE.user?.email || "" });
    closeModal(); toast("Movimento salvo", "ok");
  };
}

/* ---------- Contas a pagar / a receber ---------- */
function accountsPanel(el, node, title, doneStatus, partyLabel) {
  const pidBase = node === "payables" ? "payP" : "recP";
  const pid = pidBase + "P";
  el.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>${title}</h3><div style="flex:1"></div>
      <div class="toolbar">
        ${periodBar(pid, "month")}
        <select id="${pidBase}_st">
          <option value="">Todas as situações</option>
          <option value="pend">Em aberto</option>
          <option value="late">Vencidos</option>
          <option value="done">Liquidados</option>
        </select>
        <input id="${pidBase}_q" placeholder="Buscar descrição, ${partyLabel.toLowerCase()} ou categoria">
        <button class="btn" id="${pidBase}_csv">CSV</button>
        <button class="btn" id="${pidBase}_pdf">PDF</button>
        <button class="btn btn-primary" id="accNew">+ Novo lançamento</button>
      </div>
    </div>
    <p class="muted">Os títulos filtram pelo vencimento (${periodLabel(pid)}). Ao liquidar, o valor entra ou sai da conta escolhida e o saldo é atualizado.</p>
    <div id="${pidBase}_body" style="margin-top:12px"></div>
  </div>`;
  let rows = [];
  const draw = () => {
    const stF = $("#" + pidBase + "_st").value, q = ($("#" + pidBase + "_q").value || "").toLowerCase();
    const all = list(STATE[node]).filter(r => inPeriod(r.due, pid));
    rows = all
      .filter(r => {
        const done = r.status === doneStatus, late = !done && (r.due || "") < todayISO();
        if (stF === "pend") return !done;
        if (stF === "late") return late;
        if (stF === "done") return done;
        return true;
      })
      .filter(r => !q || [r.description, r.supplier, r.customer, r.category].some(v => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
    const pend = rows.filter(r => r.status !== doneStatus);
    const overdue = pend.filter(r => (r.due || "") < todayISO());
    $("#" + pidBase + "_body").innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        ${stat("Em aberto no período", money(pend.reduce((s, r) => s + num(r.amount), 0)), pend.length + " título(s)")}
        ${stat("Vencidos", money(overdue.reduce((s, r) => s + num(r.amount), 0)), overdue.length + " título(s)")}
        ${stat("Liquidado no período", money(rows.filter(r => r.status === doneStatus).reduce((s, r) => s + num(r.amount), 0)))}
        ${stat("Saldo total das contas", money(totalBalance()))}
      </div>
      ${rows.length ? tbl(["Vencimento", "Descrição", partyLabel, "Categoria", "Valor", "Situação", "Conta / liquidação", "Ações"],
      rows.map(r => {
        const done = r.status === doneStatus;
        const late = !done && (r.due || "") < todayISO();
        return `<tr><td>${fmtDate(r.due)}</td><td>${esc(r.description)}</td>
        <td>${esc(r.supplier || r.customer || "—")}</td><td>${esc(r.category || "—")}</td>
        <td class="right">${money(r.amount)}</td>
        <td><span class="pill ${done ? "ok" : late ? "dan" : "warn"}">${done ? doneStatus : late ? "vencido" : "pendente"}</span></td>
        <td>${done ? `${esc(accName(r.accountId))}<br><small class="muted">${fmtDate(r.settledAt)}</small>` : "—"}</td>
        <td>${done ? `<button class="btn btn-sm" data-undo="${r.id}">Reabrir</button> ` :
          `<button class="btn btn-sm btn-ok" data-ok="${r.id}">Liquidar</button> `}
            <button class="btn btn-sm btn-danger" data-del="${r.id}">Excluir</button></td></tr>`;
      }).join("")) : `<div class="empty">Nenhum lançamento no período.</div>`}`;

    $$("[data-ok]", el).forEach(b => b.onclick = () => settleForm(node, b.dataset.ok, doneStatus));
    $$("[data-undo]", el).forEach(b => b.onclick = () => confirmDialog("Reabrir o título e desfazer o lançamento no saldo?", async () => {
      await finRemoveByRef(node, b.dataset.undo);
      await update(ref(db, node + "/" + b.dataset.undo), { status: "pendente", settledAt: "", accountId: "" });
      toast("Título reaberto", "ok");
    }));
    $$("[data-del]", el).forEach(b => b.onclick = () => confirmDialog("Excluir lançamento? Movimentos de saldo ligados a ele serão desfeitos.", async () => {
      await finRemoveByRef(node, b.dataset.del);
      await remove(ref(db, node + "/" + b.dataset.del)); toast("Excluído", "ok");
    }));
  };
  $("#accNew").onclick = () => accountForm(node, partyLabel);
  $("#" + pidBase + "_st").onchange = draw;
  $("#" + pidBase + "_q").oninput = draw;
  $("#" + pidBase + "_csv").onclick = () => downloadCsv(`${node}_${periodOf(pid).from || "tudo"}`,
    [["Vencimento", "Descrição", partyLabel, "Categoria", "Valor", "Situação", "Conta", "Liquidado em"],
    ...rows.map(r => [r.due, r.description, r.supplier || r.customer || "", r.category || "",
      num(r.amount).toFixed(2), r.status, accName(r.accountId), r.settledAt || ""])]);
  $("#" + pidBase + "_pdf").onclick = () => printHTML(`${title} — ${periodLabel(pid)}`,
    kpiHTML([["Em aberto", money(rows.filter(r => r.status !== doneStatus).reduce((s, r) => s + num(r.amount), 0))],
    ["Liquidado", money(rows.filter(r => r.status === doneStatus).reduce((s, r) => s + num(r.amount), 0))]]) +
    tblHTML(["Vencimento", "Descrição", partyLabel, "Categoria", "Valor", "Situação"],
      rows.map(r => `<tr><td>${fmtDate(r.due)}</td><td>${esc(r.description)}</td><td>${esc(r.supplier || r.customer || "")}</td>
      <td>${esc(r.category || "")}</td><td class="right">${money(r.amount)}</td><td>${esc(r.status)}</td></tr>`).join("")));
  bindPeriod(pid, draw);
  draw();
}
function settleForm(node, id, doneStatus) {
  if (!accList().length) return toast("Cadastre uma conta no Financeiro antes de liquidar", "err");
  const r = { id, ...STATE[node][id] };
  const isIn = node === "receivables";
  openModal((isIn ? "Receber título" : "Pagar título"), `
    <p class="muted">${esc(r.description)} — <strong>${money(r.amount)}</strong></p>
    <div class="grid2">
      <label class="field"><span>${isIn ? "Conta que recebeu" : "Conta que pagou"} *</span><select id="st_acc">${accountOptions(r.accountId)}</select></label>
      <label class="field"><span>Data da liquidação</span><input id="st_date" type="date" value="${todayISO()}"></label>
      <label class="field"><span>Valor liquidado (R$)</span><input id="st_amount" type="number" step="0.01" value="${num(r.amount)}"></label>
    </div>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Confirmar</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const accId = $("#st_acc").value, date = $("#st_date").value || todayISO(), amount = num($("#st_amount").value);
    await update(ref(db, node + "/" + id), { status: doneStatus, settledAt: date, accountId: accId, settledAmount: amount });
    await finAdd({
      date, kind: isIn ? (r.category === "Venda" ? "venda" : "ajuste_in") : (r.category === "Compra de mercadoria" ? "compra" : "ajuste_out"),
      dir: isIn ? "in" : "out", accountId: accId, amount,
      description: r.description, party: r.supplier || r.customer || "",
      category: r.category || (isIn ? "Recebimento" : "Pagamento"), refKind: node, refId: id
    });
    closeModal(); toast(isIn ? "Recebimento lançado no saldo" : "Pagamento lançado no saldo", "ok");
  };
}
function accountForm(node, partyLabel) {
  openModal("Novo lançamento", `
    <div class="grid2">
      <label class="field"><span>Descrição *</span><input id="a_desc"></label>
      <label class="field"><span>${partyLabel}</span><input id="a_party"></label>
      <label class="field"><span>Valor (R$) *</span><input id="a_amount" type="number" step="0.01"></label>
      <label class="field"><span>Vencimento</span><input id="a_due" type="date" value="${todayISO()}"></label>
      <label class="field"><span>Categoria</span><input id="a_cat" placeholder="Ex.: Fornecedor, Aluguel, Serviço"></label>
      <label class="field"><span>Parcelas (repetir mensalmente)</span><input id="a_inst" type="number" value="1" min="1"></label>
      <label class="field"><span>Conta prevista</span><select id="a_acc"><option value="">Definir na liquidação</option>${accountOptions()}</select></label>
    </div>
    <label class="field"><span>Observações</span><textarea id="a_notes"></textarea></label>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const d = $("#a_desc").value.trim(), amount = num($("#a_amount").value);
    if (!d || !amount) return toast("Informe descrição e valor", "err");
    const n = Math.max(1, parseInt($("#a_inst").value) || 1);
    for (let i = 0; i < n; i++) {
      const due = new Date($("#a_due").value || todayISO());
      due.setMonth(due.getMonth() + i);
      await push(ref(db, node), {
        description: n > 1 ? `${d} (${i + 1}/${n})` : d,
        [node === "payables" ? "supplier" : "customer"]: $("#a_party").value.trim(),
        amount, due: due.toISOString().slice(0, 10), category: $("#a_cat").value.trim(),
        accountId: $("#a_acc").value, notes: $("#a_notes").value.trim(), status: "pendente", createdAt: Date.now()
      });
    }
    closeModal(); toast("Lançamento salvo", "ok");
  };
}

/* ---------- Fluxo de caixa ---------- */
function cashFlow(el) {
  const pid = "fluxP";
  el.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Fluxo de caixa</h3><div style="flex:1"></div>
      <div class="toolbar">${periodBar(pid, "month")}
        <button class="btn" id="fx_csv">CSV</button>
        <button class="btn" id="fx_pdf">PDF</button></div>
    </div>
    <div id="fx_body" style="margin-top:12px"></div>
  </div>`;
  let byKind = [], movs = [];
  const draw = () => {
    movs = finList().filter(f => inPeriod(f.date, pid));
    const tin = movs.filter(f => f.dir === "in").reduce((s, f) => s + num(f.amount), 0);
    const tout = movs.filter(f => f.dir === "out").reduce((s, f) => s + num(f.amount), 0);
    const map = {};
    movs.forEach(f => {
      const k = kindLabel(f.kind);
      map[k] = map[k] || { in: 0, out: 0 };
      map[k][f.dir] += num(f.amount);
    });
    byKind = Object.entries(map).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
    const byDay = {};
    movs.forEach(f => byDay[f.date] = (byDay[f.date] || 0) + (f.dir === "in" ? num(f.amount) : -num(f.amount)));
    const days = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
    const maxDay = Math.max(1, ...days.map(d => Math.abs(d[1])));
    const expP = list(STATE.expenses).filter(e => inPeriod(e.date, pid)).reduce((s, e) => s + num(e.amount), 0);
    const salesP = list(STATE.sales).filter(s => inPeriod(s.date, pid));
    $("#fx_body").innerHTML = `
      <div class="stats">
        ${stat("Entradas do período", money(tin))}
        ${stat("Saídas do período", money(tout))}
        ${stat("Resultado de caixa", money(tin - tout), periodLabel(pid))}
        ${stat("Saldo total atual", money(totalBalance()), accList().length + " conta(s)")}
        ${stat("Vendas do período", money(salesP.reduce((s, v) => s + num(v.total), 0)), salesP.length + " venda(s)")}
        ${stat("Despesas do período", money(expP))}
      </div>
      <div class="grid2">
        <div class="card"><div class="card-head"><h3>Por tipo de movimento</h3></div>
          ${byKind.length ? tbl(["Tipo", "Entradas", "Saídas", "Líquido"], byKind.map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td class="right">${money(v.in)}</td><td class="right">${money(v.out)}</td>
             <td class="right">${marginCell(v.in - v.out, 0, false)}</td></tr>`).join(""))
        : `<div class="empty">Sem movimentos no período.</div>`}</div>
        <div class="card"><div class="card-head"><h3>Saldo por conta</h3></div>
          ${accList().length ? tbl(["Conta", "Tipo", "Saldo"], accList().map(a =>
          `<tr><td>${esc(a.name)}</td><td>${esc(ACC_TYPES[a.type] || a.type)}</td>
             <td class="right"><strong>${money(accBalance(a.id))}</strong></td></tr>`).join(""))
        : `<div class="empty">Cadastre suas contas.</div>`}</div>
      </div>
      <div class="card"><div class="card-head"><h3>Resultado diário de caixa</h3></div>
        ${days.length ? `<div class="bars">${days.map(([d, v]) =>
          `<div class="bar-row"><span>${fmtDate(d)}</span><div class="bar"><i style="width:${(Math.abs(v) / maxDay * 100).toFixed(1)}%;background:${v >= 0 ? "var(--ok)" : "var(--danger)"}"></i></div><span class="right">${money(v)}</span></div>`).join("")}</div>`
        : `<div class="empty">Sem movimentos no período.</div>`}</div>
      <div class="card"><div class="card-head"><h3>Saídas por categoria</h3></div>${barsByCategory(pid)}</div>`;
  };
  $("#fx_csv").onclick = () => downloadCsv(`fluxo_${periodOf(pid).from || "tudo"}`,
    [["Data", "Tipo", "Descrição", "Conta", "Entrada", "Saída"],
    ...movs.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(f => [f.date, kindLabel(f.kind), f.description,
      accName(f.accountId), f.dir === "in" ? num(f.amount).toFixed(2) : "", f.dir === "out" ? num(f.amount).toFixed(2) : ""])]);
  $("#fx_pdf").onclick = () => printHTML(`Fluxo de caixa — ${periodLabel(pid)}`,
    kpiHTML([["Entradas", money(movs.filter(f => f.dir === "in").reduce((s, f) => s + num(f.amount), 0))],
    ["Saídas", money(movs.filter(f => f.dir === "out").reduce((s, f) => s + num(f.amount), 0))],
    ["Saldo total atual", money(totalBalance())]]) +
    "<h2>Por tipo</h2>" + tblHTML(["Tipo", "Entradas", "Saídas", "Líquido"],
      byKind.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="right">${money(v.in)}</td><td class="right">${money(v.out)}</td><td class="right">${money(v.in - v.out)}</td></tr>`).join("")) +
    "<h2>Saldo por conta</h2>" + tblHTML(["Conta", "Tipo", "Saldo"],
      accList().map(a => `<tr><td>${esc(a.name)}</td><td>${esc(ACC_TYPES[a.type] || a.type)}</td><td class="right">${money(accBalance(a.id))}</td></tr>`).join("")));
  bindPeriod(pid, draw);
  draw();
}
function barsByCategory(pid) {
  const map = {};
  finList().filter(f => f.dir === "out" && inPeriod(f.date, pid))
    .forEach(f => { const k = f.category || kindLabel(f.kind) || "Outros"; map[k] = (map[k] || 0) + num(f.amount); });
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!arr.length) return `<div class="empty">Sem saídas no período.</div>`;
  const max = arr[0][1];
  return `<div class="bars">${arr.map(([k, v]) =>
    `<div class="bar-row"><span>${esc(k)}</span><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><span class="right">${money(v)}</span></div>`).join("")}</div>`;
}

/* ================= DESPESAS GERAIS ================= */
const EXP_CATS = ["Entregas / Frete", "Combustível", "Manutenção de veículo", "Manutenção geral", "Aluguel", "Energia", "Água", "Internet / Telefone", "Salários", "Impostos", "Marketing", "Material de escritório", "Embalagens", "Outros"];
function viewDespesas(root) {
  const pid = "despP";
  root.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Despesas gerais</h3><div style="flex:1"></div>
      <div class="toolbar">
        ${periodBar(pid, "month")}
        <select id="dFilter"><option value="">Todas as categorias</option>${EXP_CATS.map(c => `<option>${c}</option>`).join("")}</select>
        <input id="dQ" placeholder="Buscar descrição, responsável ou veículo">
        <button class="btn" id="dCsv">CSV</button>
        <button class="btn" id="dPdf">PDF</button>
        <button class="btn btn-primary" id="dNew">+ Nova despesa</button>
      </div>
    </div>
    <div id="dBody" style="margin-top:12px"></div>
  </div>`;
  let rows = [];
  const draw = () => {
    const f = $("#dFilter").value, q = ($("#dQ").value || "").toLowerCase();
    rows = list(STATE.expenses)
      .filter(r => inPeriod(r.date, pid))
      .filter(r => !f || r.category === f)
      .filter(r => !q || [r.description, r.party, r.vehicle, r.payment].some(v => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const total = rows.reduce((s2, r) => s2 + num(r.amount), 0);
    const byCat = Object.entries(rows.reduce((m, r) => { m[r.category || "Outros"] = (m[r.category || "Outros"] || 0) + num(r.amount); return m; }, {}))
      .sort((a, b) => b[1] - a[1]);
    $("#dBody").innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        ${stat("Despesas do período", money(total), periodLabel(pid))}
        ${stat("Lançamentos", String(rows.length))}
        ${stat("Média por lançamento", money(rows.length ? total / rows.length : 0))}
        ${stat("Maior categoria", byCat[0] ? byCat[0][0] : "—", byCat[0] ? money(byCat[0][1]) : "")}
      </div>
      ${rows.length ? tbl(["Data", "Categoria", "Descrição", "Fornecedor/Responsável", "Conta", "Veículo/Placa", "Km", "Pagamento", "Valor", "Ações"],
      rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td><span class="pill">${esc(r.category)}</span></td>
      <td>${esc(r.description)}</td><td>${esc(r.party || "—")}</td><td>${esc(r.accountId ? accName(r.accountId) : "—")}</td>
      <td>${esc(r.vehicle || "—")}</td><td>${r.km ? num(r.km) : "—"}</td><td>${esc(r.payment || "—")}</td>
      <td class="right"><strong>${money(r.amount)}</strong></td>
      <td><button class="btn btn-sm" data-edit="${r.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-del="${r.id}">Excluir</button></td></tr>`).join(""))
      : `<div class="empty">Nenhuma despesa no período.</div>`}
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Por categoria</h3></div>
        ${byCat.length ? tbl(["Categoria", "Total"], byCat.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="right">${money(v)}</td></tr>`).join("")) : `<div class="empty">Sem dados.</div>`}</div>`;
    $$("[data-edit]", $("#dBody")).forEach(b => b.onclick = () => expenseForm(b.dataset.edit));
    $$("[data-del]", $("#dBody")).forEach(b => b.onclick = () => confirmDialog("Excluir despesa? O lançamento no saldo também será desfeito.", async () => {
      await finRemoveByRef("expense", b.dataset.del);
      await remove(ref(db, "expenses/" + b.dataset.del)); toast("Excluída", "ok");
    }));
  };
  $("#dFilter").onchange = draw; $("#dQ").oninput = draw; $("#dNew").onclick = () => expenseForm();
  $("#dCsv").onclick = () => downloadCsv(`despesas_${periodOf(pid).from || "tudo"}`,
    [["Data", "Categoria", "Descrição", "Responsável", "Conta", "Veículo", "Km", "Pagamento", "Valor"],
    ...rows.map(r => [r.date, r.category, r.description, r.party || "", accName(r.accountId), r.vehicle || "",
      num(r.km) || "", r.payment || "", num(r.amount).toFixed(2)])]);
  $("#dPdf").onclick = () => printHTML(`Despesas gerais — ${periodLabel(pid)}`,
    kpiHTML([["Total", money(rows.reduce((s2, r) => s2 + num(r.amount), 0))], ["Lançamentos", String(rows.length)]]) +
    tblHTML(["Data", "Categoria", "Descrição", "Responsável", "Valor"],
      rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.category)}</td><td>${esc(r.description)}</td>
      <td>${esc(r.party || "")}</td><td class="right">${money(r.amount)}</td></tr>`).join("")));
  bindPeriod(pid, draw);
  draw();
}
function expenseForm(id) {
  const e = id ? { id, ...STATE.expenses[id] } : {};
  openModal(id ? "Editar despesa" : "Nova despesa", `
    <div class="grid2">
      <label class="field"><span>Categoria *</span><select id="x_cat">${EXP_CATS.map(c => `<option ${e.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="field"><span>Data</span><input id="x_date" type="date" value="${e.date || todayISO()}"></label>
      <label class="field"><span>Descrição *</span><input id="x_desc" value="${esc(e.description || "")}"></label>
      <label class="field"><span>Valor (R$) *</span><input id="x_amount" type="number" step="0.01" value="${num(e.amount) || ""}"></label>
      <label class="field"><span>Fornecedor / Responsável</span><input id="x_party" value="${esc(e.party || "")}"></label>
      <label class="field"><span>Forma de pagamento</span><input id="x_pay" value="${esc(e.payment || "")}"></label>
      <label class="field"><span>Veículo / Placa (entregas)</span><input id="x_vehicle" value="${esc(e.vehicle || "")}"></label>
      <label class="field"><span>Km rodados</span><input id="x_km" type="number" step="0.1" value="${num(e.km) || ""}"></label>
      <label class="field"><span>Documento / Recibo</span><input id="x_doc" value="${esc(e.doc || "")}"></label>
      <label class="field"><span>Conta de saída (debita do saldo)</span><select id="x_acc">
        <option value="">Não lançar no saldo</option>${accountOptions(e.accountId || defaultAccount())}</select></label>
    </div>
    <label class="field"><span>Observações</span><textarea id="x_notes">${esc(e.notes || "")}</textarea></label>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const data = {
      category: $("#x_cat").value, date: $("#x_date").value || todayISO(), description: $("#x_desc").value.trim(),
      amount: num($("#x_amount").value), party: $("#x_party").value.trim(), payment: $("#x_pay").value.trim(),
      vehicle: $("#x_vehicle").value.trim(), km: num($("#x_km").value), doc: $("#x_doc").value.trim(),
      notes: $("#x_notes").value.trim(), accountId: $("#x_acc").value, updatedAt: Date.now()
    };
    if (!data.description || !data.amount) return toast("Informe descrição e valor", "err");
    let expId = id;
    if (id) { await update(ref(db, "expenses/" + id), data); await finRemoveByRef("expense", id); }
    else expId = (await push(ref(db, "expenses"), { ...data, createdAt: Date.now(), user: STATE.user.email })).key;
    if (data.accountId) {
      await finAdd({
        date: data.date, kind: "despesa", amount: data.amount, accountId: data.accountId,
        description: data.description, party: data.party, category: data.category,
        refKind: "expense", refId: expId
      });
    }
    closeModal(); toast("Despesa salva", "ok");
  };
}

/* ================= RELATÓRIOS ================= */
function viewRelatorios(root) {
  root.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Filtros do relatório</h3></div>
    <div class="toolbar">
      <select id="rPeriod">
        <option value="day">Diário (hoje)</option>
        <option value="month" selected>Mensal (mês atual)</option>
        <option value="year">Anual (ano atual)</option>
        <option value="custom">Período personalizado</option>
      </select>
      <input type="date" id="rFrom" value="${todayISO().slice(0, 8)}01">
      <input type="date" id="rTo" value="${todayISO()}">
      <button class="btn btn-primary" id="rGo">Gerar relatório</button>
      <button class="btn" id="rCsv">Exportar CSV</button>
      <button class="btn" id="rPrint">Imprimir / PDF</button>
    </div>
  </div>
  <div id="rOut"></div>`;
  const setDates = () => {
    const p = $("#rPeriod").value, t = todayISO();
    if (p === "day") { $("#rFrom").value = t; $("#rTo").value = t; }
    else if (p === "month") { $("#rFrom").value = t.slice(0, 8) + "01"; $("#rTo").value = t; }
    else if (p === "year") { $("#rFrom").value = t.slice(0, 4) + "-01-01"; $("#rTo").value = t; }
  };
  $("#rPeriod").onchange = () => { setDates(); build(); };
  $("#rGo").onclick = build;
  $("#rPrint").onclick = () => window.print();
  $("#rCsv").onclick = exportCsv;

  let cache = [];
  function build() {
    const from = $("#rFrom").value, to = $("#rTo").value;
    const sales = list(STATE.sales).filter(s => inRange(s.date, from, to));
    const exps = list(STATE.expenses).filter(e => inRange(e.date, from, to));
    const buys = list(STATE.entries).filter(e => inRange(e.date, from, to));
    const rev = sales.reduce((s, v) => s + num(v.total), 0);
    const cost = sales.reduce((s, v) => s + num(v.cost), 0);
    const expT = exps.reduce((s, v) => s + num(v.amount), 0);
    const buyT = buys.reduce((s, v) => s + num(v.total), 0);
    cache = sales;

    // ranking de produtos
    const rank = {};
    sales.forEach(s => (s.items || []).forEach(i => {
      rank[i.name] = rank[i.name] || { qty: 0, total: 0, profit: 0 };
      rank[i.name].qty += num(i.qty);
      rank[i.name].total += num(i.price) * num(i.qty);
      rank[i.name].profit += (num(i.price) - num(i.cost)) * num(i.qty);
    }));
    const rk = Object.entries(rank).sort((a, b) => b[1].total - a[1].total);

    // por dia
    const byDay = {};
    sales.forEach(s => byDay[s.date] = (byDay[s.date] || 0) + num(s.total));
    const days = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
    const maxDay = Math.max(1, ...days.map(d => d[1]));

    $("#rOut").innerHTML = `
    <div class="stats">
      ${stat("Faturamento", money(rev), sales.length + " venda(s)")}
      ${stat("Custo das vendas", money(cost))}
      ${stat("Lucro bruto", money(rev - cost))}
      ${stat("Despesas", money(expT))}
      ${stat("Compras de mercadoria", money(buyT))}
      ${stat("Resultado líquido", money(rev - cost - expT))}
    </div>
    <div class="card"><div class="card-head"><h3>Faturamento por dia</h3></div>
      ${days.length ? `<div class="bars">${days.map(([d, v]) =>
        `<div class="bar-row"><span>${fmtDate(d)}</span><div class="bar"><i style="width:${(v / maxDay * 100).toFixed(1)}%"></i></div><span class="right">${money(v)}</span></div>`).join("")}</div>`
        : `<div class="empty">Sem vendas no período.</div>`}</div>
    <div class="card"><div class="card-head"><h3>Produtos e kits mais vendidos</h3></div>
      ${rk.length ? tbl(["Item", "Qtd", "Faturamento", "Lucro (R$ · %)"], rk.map(([n, v]) =>
        `<tr><td>${esc(n)}</td><td>${v.qty}</td><td class="right">${money(v.total)}</td>
        <td class="right">${marginCell(v.profit, v.total > 0 ? v.profit / v.total * 100 : 0, v.total > 0)}</td></tr>`).join(""))
        : `<div class="empty">Sem dados.</div>`}</div>
    <div class="card"><div class="card-head"><h3>Despesas por categoria</h3></div>
      ${exps.length ? tbl(["Categoria", "Lançamentos", "Total"], Object.entries(exps.reduce((m, e) => {
        m[e.category || "Outros"] = m[e.category || "Outros"] || { n: 0, v: 0 };
        m[e.category || "Outros"].n++; m[e.category || "Outros"].v += num(e.amount); return m;
      }, {})).sort((a, b) => b[1].v - a[1].v).map(([c, v]) =>
        `<tr><td>${esc(c)}</td><td>${v.n}</td><td class="right">${money(v.v)}</td></tr>`).join(""))
        : `<div class="empty">Sem despesas no período.</div>`}</div>
    <div class="card"><div class="card-head"><h3>Posição de estoque (atual)</h3></div>
      ${(() => {
        const ps = list(STATE.products).sort((a, b) => num(b.qty) * num(b.avgCost) - num(a.qty) * num(a.avgCost));
        const totCost = ps.reduce((s2, p) => s2 + num(p.qty) * num(p.avgCost), 0);
        const totSale = ps.reduce((s2, p) => s2 + num(p.qty) * (num(p.promo) || num(p.price)), 0);
        return tbl(["Produto", "Qtd", "Custo médio", "Custo total", "Preço venda", "Margem un. (R$ · %)", "Venda total", "Margem total (R$ · %)"],
          ps.map(p => {
            const m = margin(p);
            const c = num(p.qty) * m.cost, v = num(p.qty) * m.price;
            return `<tr><td>${esc(p.name)}</td><td>${num(p.qty)}</td><td class="right">${money(m.cost)}</td>
            <td class="right">${money(c)}</td><td class="right">${money(m.price)}</td>
            <td class="right">${marginCell(m.value, m.pct, m.price > 0, m.markup)}</td>
            <td class="right">${money(v)}</td>
            <td class="right">${marginCell(v - c, v > 0 ? (v - c) / v * 100 : 0, v > 0)}</td></tr>`;
          }).join("") +
          `<tr><td colspan="3"><strong>Total</strong></td><td class="right"><strong>${money(totCost)}</strong></td>
           <td colspan="2"></td><td class="right"><strong>${money(totSale)}</strong></td>
           <td class="right"><strong>${money(totSale - totCost)}${totSale > 0 ? " · " + pct((totSale - totCost) / totSale * 100) : ""}</strong></td></tr>`);
      })()}
    </div>`;
  }
  function exportCsv() {
    const rows = [["Data", "Cliente", "Pagamento", "Itens", "Custo", "Total", "Lucro"]];
    cache.forEach(s => rows.push([s.date, s.customer || "", s.payment || "",
      (s.items || []).map(i => `${num(i.qty)}x ${i.name}`).join(" | "), num(s.cost).toFixed(2), num(s.total).toFixed(2),
      (num(s.total) - num(s.cost)).toFixed(2)]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `relatorio_${$("#rFrom").value}_a_${$("#rTo").value}.csv`; a.click();
  }
  build();
}

/* ================= USUÁRIOS & PERMISSÕES ================= */
function viewUsuarios(root) {
  if (!STATE.isAdmin) { root.innerHTML = `<div class="card"><div class="empty">Apenas o administrador geral (${ADMIN_EMAIL}) pode gerenciar usuários e permissões.</div></div>`; return; }
  const users = list(STATE.users);
  root.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Usuários do sistema</h3><div style="flex:1"></div>
      <button class="btn btn-primary" id="uNew">+ Criar usuário</button></div>
    <p class="muted">Os usuários são autenticados pelo Firebase Authentication. As funções e permissões abaixo são armazenadas no Realtime Database e definem o que cada um pode acessar.</p>
    <div style="margin-top:12px">${users.length ? tbl(["Nome", "E-mail", "Telefone", "Função", "Permissões", "Ações"],
      users.map(u => `<tr>
        <td>${esc(((u.firstName || "") + " " + (u.lastName || "")).trim() || "—")}</td>
        <td>${esc(u.email)}</td><td>${esc(u.phone || "—")}</td>
        <td><span class="pill ${u.email === ADMIN_EMAIL ? "ok" : ""}">${esc(u.email === ADMIN_EMAIL ? "admin geral" : (u.role || "colaborador"))}</span></td>
        <td>${PERMS.filter(p => (u.perms || {})[p[0]]).map(p => p[1]).join(", ") || "—"}</td>
        <td>${u.email === ADMIN_EMAIL ? "<span class='muted'>protegido</span>" :
          `<button class="btn btn-sm" data-perm="${u.id}">Permissões</button>
           <button class="btn btn-sm btn-danger" data-del="${u.id}">Remover</button>`}</td></tr>`).join(""))
      : `<div class="empty">Nenhum usuário registrado ainda.</div>`}</div>
  </div>`;
  $("#uNew").onclick = createUserForm;
  $$("[data-perm]", root).forEach(b => b.onclick = () => permsForm(b.dataset.perm));
  $$("[data-del]", root).forEach(b => b.onclick = () => confirmDialog("Remover o perfil e as permissões deste usuário? (A conta de login continua no Firebase Authentication e deve ser excluída pelo console)", async () => {
    await remove(ref(db, "users/" + b.dataset.del)); toast("Perfil removido", "ok");
  }));
}
function createUserForm() {
  openModal("Criar usuário", `
    <p class="muted">O novo usuário será criado no Firebase Authentication. Após a criação, você será redirecionado para o login novamente por segurança do Firebase.</p>
    <div class="grid2">
      <label class="field"><span>Nome</span><input id="u_first"></label>
      <label class="field"><span>Sobrenome</span><input id="u_last"></label>
      <label class="field"><span>E-mail *</span><input id="u_email" type="email"></label>
      <label class="field"><span>Telefone</span><input id="u_phone"></label>
      <label class="field"><span>Senha provisória *</span><input id="u_pass" type="password"></label>
      <label class="field"><span>Função</span><input id="u_role" value="colaborador"></label>
    </div>
    <div class="section-title">Permissões de acesso</div>
    <div class="perm-grid">${PERMS.map(p => `<label class="chk"><input type="checkbox" data-p="${p[0]}" ${p[0] === "dashboard" ? "checked" : ""}> ${p[1]}</label>`).join("")}</div>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Criar usuário</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const email = $("#u_email").value.trim(), pass = $("#u_pass").value;
    if (!email || pass.length < 6) return toast("Informe e-mail e senha (mín. 6 caracteres)", "err");
    const perms = {}; $$("[data-p]").forEach(c => perms[c.dataset.p] = c.checked);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: `${$("#u_first").value} ${$("#u_last").value}`.trim() });
      await set(ref(db, "users/" + cred.user.uid), {
        email, firstName: $("#u_first").value.trim(), lastName: $("#u_last").value.trim(),
        phone: $("#u_phone").value.trim(), role: $("#u_role").value.trim() || "colaborador",
        perms, createdAt: Date.now()
      });
      closeModal(); toast("Usuário criado com sucesso", "ok");
    } catch (ex) { toast(fbErr(ex), "err"); }
  };
}
function permsForm(id) {
  const u = STATE.users[id] || {};
  openModal("Permissões — " + (u.email || ""), `
    <div class="grid2">
      <label class="field"><span>Função</span><input id="pf_role" value="${esc(u.role || "colaborador")}"></label>
      <label class="field"><span>Telefone</span><input id="pf_phone" value="${esc(u.phone || "")}"></label>
    </div>
    <div class="section-title">O que este usuário pode acessar</div>
    <div class="perm-grid">${PERMS.map(p => `<label class="chk"><input type="checkbox" data-p="${p[0]}" ${(u.perms || {})[p[0]] ? "checked" : ""}> ${p[1]}</label>`).join("")}</div>
  `, `<button class="btn" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSave">Salvar permissões</button>`);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const perms = {}; $$("[data-p]").forEach(c => perms[c.dataset.p] = c.checked);
    await update(ref(db, "users/" + id), { perms, role: $("#pf_role").value.trim(), phone: $("#pf_phone").value.trim() });
    closeModal(); toast("Permissões atualizadas", "ok");
  };
}

/* ================= PERFIL ================= */
function viewPerfil(root) {
  const p = STATE.profile || {};
  root.innerHTML = `
  <div class="card" style="max-width:680px">
    <div class="card-head"><h3>Foto de perfil</h3></div>
    <p class="muted">Use um link externo ou envie um arquivo do seu dispositivo (convertido em base64 e salvo no banco de dados).</p>
    <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <div class="logo-box" style="width:112px;height:112px;border-radius:50%">
        ${p.photo ? `<img id="me_prev" src="${p.photo}" style="display:block;width:112px;height:112px;object-fit:cover">`
      : `<div class="logo-fallback" id="me_prevEmpty">sem foto</div><img id="me_prev" style="display:none;width:112px;height:112px;object-fit:cover">`}
      </div>
      <div style="flex:1;min-width:240px">
        <label class="field"><span>Foto por link (URL)</span>
          <input id="me_photoUrl" placeholder="https://..." value="${p.photo && !String(p.photo).startsWith("data:") ? esc(p.photo) : ""}"></label>
        <label class="field" style="margin-top:10px"><span>Foto por arquivo (base64)</span>
          <input id="me_photoFile" type="file" accept="image/*"></label>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="me_photoSave">Salvar foto</button>
          ${p.photo ? `<button class="btn btn-danger" id="me_photoRm">Remover foto</button>` : ""}
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="max-width:680px">
    <div class="card-head"><h3>Meus dados</h3></div>
    <div class="grid2">
      <label class="field"><span>Nome</span><input id="me_first" value="${esc(p.firstName || "")}"></label>
      <label class="field"><span>Sobrenome</span><input id="me_last" value="${esc(p.lastName || "")}"></label>
      <label class="field"><span>Telefone</span><input id="me_phone" value="${esc(p.phone || "")}"></label>
      <label class="field"><span>E-mail (não editável)</span><input value="${esc(p.email || "")}" disabled></label>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" id="me_save">Salvar alterações</button>
      <button class="btn" id="me_reset">Redefinir minha senha por e-mail</button>
    </div>
  </div>`;

  const setPreview = src => {
    const img = $("#me_prev"), empty = $("#me_prevEmpty");
    if (img) { img.src = src; img.style.display = src ? "block" : "none"; }
    if (empty) empty.classList.toggle("hidden", !!src);
  };
  $("#me_photoUrl").oninput = () => setPreview($("#me_photoUrl").value.trim());
  $("#me_photoFile").onchange = async () => {
    const f = $("#me_photoFile").files[0]; if (!f) return;
    try { setPreview(await fileToBase64(f, 320)); toast("Imagem carregada. Clique em Salvar foto.", "ok"); }
    catch { toast("Falha ao processar a imagem", "err"); }
  };
  const savePhoto = async photo => {
    await update(ref(db, "users/" + STATE.user.uid), { photo });
    STATE.profile = { ...STATE.profile, photo };
    try { await updateProfile(auth.currentUser, { photoURL: photo && !photo.startsWith("data:") ? photo : "" }); } catch {}
    renderShell();
  };
  $("#me_photoSave").onclick = async () => {
    const url = $("#me_photoUrl").value.trim();
    const f = $("#me_photoFile").files[0];
    let photo = url;
    if (f) { try { photo = await fileToBase64(f, 320); } catch { return toast("Falha ao processar a imagem", "err"); } }
    if (!photo) return toast("Informe um link ou selecione um arquivo", "err");
    await savePhoto(photo); toast("Foto de perfil atualizada", "ok");
  };
  if ($("#me_photoRm")) $("#me_photoRm").onclick = () => confirmDialog("Remover sua foto de perfil?", async () => {
    await savePhoto(""); toast("Foto removida", "ok");
  });

  $("#me_save").onclick = async () => {
    const d = { firstName: $("#me_first").value.trim(), lastName: $("#me_last").value.trim(), phone: $("#me_phone").value.trim() };
    await update(ref(db, "users/" + STATE.user.uid), d);
    STATE.profile = { ...STATE.profile, ...d };
    try { await updateProfile(auth.currentUser, { displayName: `${d.firstName} ${d.lastName}`.trim() }); } catch {}
    renderShell(); toast("Perfil atualizado", "ok");
  };
  $("#me_reset").onclick = async () => {
    try { await sendPasswordResetEmail(auth, p.email); toast("Link de redefinição enviado para seu e-mail", "ok"); }
    catch (e) { toast(fbErr(e), "err"); }
  };
}

/* ================= CONFIGURAÇÕES ================= */
function viewConfig(root) {
  const st = STATE.settings || {};
  root.innerHTML = `
  <div class="card" style="max-width:760px">
    <div class="card-head"><h3>Identidade da empresa</h3></div>
    <div class="grid2">
      <label class="field"><span>Nome da empresa</span><input id="c_name" value="${esc(st.companyName || "")}"></label>
      <label class="field"><span>CNPJ</span><input id="c_cnpj" value="${esc(st.cnpj || "")}"></label>
      <label class="field"><span>Telefone</span><input id="c_phone" value="${esc(st.phone || "")}"></label>
      <label class="field"><span>Endereço</span><input id="c_addr" value="${esc(st.address || "")}"></label>
      <label class="field"><span>Logo por link externo (128×128)</span><input id="c_logoUrl" placeholder="https://..." value="${st.logo && !String(st.logo).startsWith("data:") ? esc(st.logo) : ""}"></label>
      <label class="field"><span>Logo por arquivo (base64 no Realtime Database)</span><input id="c_logoFile" type="file" accept="image/*"></label>
    </div>
    <div style="margin-top:12px;display:flex;align-items:center;gap:14px">
      <div class="logo-box" style="width:96px;height:96px">${st.logo ? `<img src="${st.logo}" style="display:block;width:96px;height:96px;object-fit:contain">` : `<div class="logo-fallback">sem logo</div>`}</div>
      <button class="btn btn-primary" id="c_save">Salvar configurações</button>
      ${st.logo ? `<button class="btn btn-danger" id="c_rmlogo">Remover logo</button>` : ""}
    </div>
  </div>
  <div class="card" style="max-width:760px">
    <div class="card-head"><h3>Interface</h3></div>
    <div class="grid2">
      <label class="field"><span>Tema</span><select id="c_theme">
        <option value="dark" ${html.getAttribute("data-theme") === "dark" ? "selected" : ""}>Escuro (padrão)</option>
        <option value="light" ${html.getAttribute("data-theme") === "light" ? "selected" : ""}>Claro</option></select></label>
      <label class="field"><span>Densidade das tabelas</span><select id="c_density">
        <option value="normal" ${html.getAttribute("data-density") === "normal" ? "selected" : ""}>Confortável</option>
        <option value="compact" ${html.getAttribute("data-density") === "compact" ? "selected" : ""}>Compacta</option></select></label>
    </div>
  </div>
  <div class="card" style="max-width:760px">
    <div class="card-head"><h3>Dados</h3></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="c_export">Exportar backup (JSON)</button>
    </div>
  </div>`;
  $("#c_theme").onchange = e => applyTheme(e.target.value);
  $("#c_density").onchange = e => applyDensity(e.target.value);
  $("#c_save").onclick = async () => {
    let logo = $("#c_logoUrl").value.trim() || (st.logo && String(st.logo).startsWith("data:") ? st.logo : "");
    const f = $("#c_logoFile").files[0];
    if (f) logo = await fileToBase64(f, 256);
    await update(ref(db, "settings"), {
      companyName: $("#c_name").value.trim(), cnpj: $("#c_cnpj").value.trim(),
      phone: $("#c_phone").value.trim(), address: $("#c_addr").value.trim(), logo
    });
    toast("Configurações salvas", "ok");
  };
  if ($("#c_rmlogo")) $("#c_rmlogo").onclick = async () => { await update(ref(db, "settings"), { logo: "" }); toast("Logo removida", "ok"); };
  $("#c_export").onclick = () => {
    const data = { products: STATE.products, kits: STATE.kits, entries: STATE.entries, sales: STATE.sales,
      payables: STATE.payables, receivables: STATE.receivables, expenses: STATE.expenses,
      accounts: STATE.accounts, fin: STATE.fin, settings: STATE.settings };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `backup_${todayISO()}.json`; a.click();
  };
}
