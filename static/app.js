/* VagaFit — front-end (JS puro) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const EMPTY = {
  nome: "", titulo: "", email: "", telefone: "", local: "", linkedin: "", site: "", resumo: "",
  experiencias: [], formacao: [], habilidades: [], idiomas: [], certificacoes: [], projetos: [],
};

const SAMPLE = {
  nome: "Ana Souza", titulo: "Desenvolvedora Full Stack", email: "ana.souza@email.com", telefone: "(21) 99999-0000",
  local: "Rio de Janeiro, RJ", linkedin: "linkedin.com/in/anasouza", site: "github.com/anasouza",
  resumo: "Desenvolvedora full stack com 3 anos de experiência em Python e JavaScript, focada em APIs e interfaces rápidas.",
  experiencias: [
    { cargo: "Desenvolvedora Full Stack", empresa: "Loja Tech", local: "Remoto", inicio: "03/2023", fim: "Atual",
      bullets: ["Desenvolvi API em FastAPI que processa 20 mil pedidos/mês", "Reduzi o tempo de carregamento do site em 40% com cache e lazy loading", "Integrei pagamentos via Stripe e Mercado Pago"] },
    { cargo: "Estagiária de Desenvolvimento", empresa: "Agência Pixel", local: "Rio de Janeiro", inicio: "01/2022", fim: "02/2023",
      bullets: ["Criei landing pages em HTML, CSS e JavaScript para 12 clientes", "Automatizei relatórios semanais com Python"] },
  ],
  formacao: [{ curso: "Engenharia de Software", instituicao: "Universidade Exemplo", inicio: "2021", fim: "2025" }],
  habilidades: ["Python", "FastAPI", "JavaScript", "React", "SQL", "PostgreSQL", "Docker", "Git"],
  idiomas: [{ idioma: "Inglês", nivel: "Avançado" }],
  certificacoes: ["AWS Cloud Practitioner"],
  projetos: [{ nome: "Comparador de preços", descricao: "App que compara preços de skins entre marketplaces (FastAPI + JS)." }],
};

// ---------- personalização (padrões) ----------
const SECTIONS = [["resumo", "Resumo"], ["experiencias", "Experiência"], ["formacao", "Formação"], ["habilidades", "Habilidades"],
  ["projetos", "Projetos"], ["idiomas", "Idiomas"], ["certificacoes", "Certificações"]];
const CUSTOM_DEFAULT = {
  cor: "", fonte: "", escala: 100, entrelinha: 0, margem: "normal", cabecalho: "auto", titulos: "maiusculas", marcador: "•",
  sepContato: "auto", sepHabilidades: "auto", sepIdiomas: "auto", sepCertificacoes: "auto",
  idiomaFormato: "parenteses", sepDatas: "–",
  secoes: SECTIONS.map(([key, titulo]) => ({ key, titulo, mostrar: true })),
};
// "auto" = o que cada modelo usa por padrão
const TPL_DEFAULTS = {
  classico: { contato: "•", habilidades: "·", lista: "·" },
  moderno: { contato: "•", habilidades: "tags", lista: "·" },
  compacto: { contato: "linha", habilidades: "·", lista: "·" },
};
const MARGINS = { estreita: "10mm 12mm", normal: "", larga: "22mm 24mm" };
const LANG_FMT = {
  parenteses: (i, n) => `${i} (${n})`,
  traco: (i, n) => `${i} — ${n}`,
  "dois-pontos": (i, n) => `${i}: ${n}`,
};
function loadCustom(c = {}) {
  const out = { ...CUSTOM_DEFAULT, ...c };
  // mantém a ordem salva e acrescenta seções que ainda não existiam
  const saved = (c.secoes || []).filter((s) => SECTIONS.some(([k]) => k === s.key));
  out.secoes = [...saved, ...CUSTOM_DEFAULT.secoes.filter((d) => !saved.some((s) => s.key === d.key))].map((s) => ({ ...s }));
  return out;
}

// ---------- estado ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("vf_" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("vf_" + k, JSON.stringify(v)); } catch {} },
};
const state = {
  resume: { ...EMPTY, ...(typeof store.get("resume") === "object" ? store.get("resume", {}) : {}) },
  tailored: store.get("tailored", null),
  job: store.get("job", {}),
  cover: store.get("cover", null),
  template: ["classico", "moderno", "compacto"].includes(store.get("template")) ? store.get("template") : "classico",
  custom: loadCustom(store.get("custom", {})),
  interview: store.get("interview", null),
};
const save = () => ["resume", "tailored", "job", "cover", "template", "custom", "interview"].forEach((k) => store.set(k, state[k]));

// ---------- utilidades ----------
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (err ? " err" : "");
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = "toast"), 3500);
}
function loading(on, msg = "Pensando...") {
  $("#loading").classList.toggle("hidden", !on);
  $("#loading-msg").textContent = msg;
}
async function api(path, { body, method, form, msg, silent } = {}) {
  if (!silent) loading(true, msg);
  try {
    const res = await fetch(path, {
      method: method || (body || form ? "POST" : "GET"),
      headers: form ? undefined : { "Content-Type": "application/json" },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Erro ${res.status}`);
    return data;
  } catch (e) {
    if (!silent) toast(e.message, true);
    throw e;
  } finally {
    if (!silent) loading(false);
  }
}
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const hasResume = () => state.resume.nome || state.resume.experiencias.length;
function requireResume() {
  if (hasResume()) return true;
  toast("Importe ou preencha seu currículo primeiro", true);
  switchTab("curriculo");
  return false;
}

// ---------- navegação ----------
function switchTab(name) {
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  if (name === "candidaturas") loadApps();
}
$$(".nav-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

// ---------- render do currículo ----------
// items já vêm escapados; sep: símbolo, "linha" (um por linha) ou "tags"
function joinList(items, sep) {
  if (!items.length) return "";
  const spans = items.map((i) => `<span>${i}</span>`);
  if (sep === "linha") return `<div class="r-lines">${spans.join("")}</div>`;
  if (sep === "tags") return `<div class="r-skills">${spans.join("")}</div>`;
  return `<div class="r-list">${spans.join(`<span class="r-sep">${sep === "," ? ", " : ` ${esc(sep)} `}</span>`)}</div>`;
}

function renderResume(r, el, tpl = state.template, c = state.custom) {
  if (!r) return;
  const d = TPL_DEFAULTS[tpl] || TPL_DEFAULTS.classico;
  const pick = (v, def) => (v === "auto" ? def : v);
  el.className = ["paper", `tpl-${tpl}`, c.cabecalho !== "auto" && `hdr-${c.cabecalho}`,
    c.titulos === "normal" && "titles-normal", c.marcador === "nenhum" && "mk-none"].filter(Boolean).join(" ");
  el.removeAttribute("style");
  const vars = {
    "--r-accent": c.cor, "--r-font": c.fonte, "--r-scale": c.escala / 100, "--r-lh": c.entrelinha || "",
    "--r-pad": MARGINS[c.margem], "--r-marker": c.marcador === "nenhum" ? "" : JSON.stringify(c.marcador),
  };
  for (const [k, v] of Object.entries(vars)) if (v !== "" && v != null) el.style.setProperty(k, v);

  const contact = joinList([r.email, r.telefone, r.local, r.linkedin, r.site].filter(Boolean).map(esc), pick(c.sepContato, d.contato));
  const dates = (a, b) => [a, b].filter(Boolean).map(esc).join(` ${esc(c.sepDatas)} `);

  const exp = (r.experiencias || []).map((e) => `
    <div class="r-item">
      <div class="r-item-head"><b>${esc(e.cargo)}${e.empresa ? " · " + esc(e.empresa) : ""}</b><span class="r-dates">${dates(e.inicio, e.fim)}</span></div>
      ${e.local ? `<div class="r-sub">${esc(e.local)}</div>` : ""}
      ${(e.bullets || []).filter(Boolean).length ? `<ul>${e.bullets.filter(Boolean).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
  const edu = (r.formacao || []).map((f) => `
    <div class="r-item"><div class="r-item-head"><b>${esc(f.curso)}</b><span class="r-dates">${dates(f.inicio, f.fim)}</span></div>
    <div class="r-sub">${esc(f.instituicao)}</div></div>`).join("");
  const proj = (r.projetos || []).map((p) => `<div class="r-item"><b>${esc(p.nome)}</b> — ${esc(p.descricao)}</div>`).join("");
  const fmtLang = LANG_FMT[c.idiomaFormato] || LANG_FMT.parenteses;
  const langs = (r.idiomas || []).filter((i) => i.idioma).map((i) => (i.nivel ? fmtLang(esc(i.idioma), esc(i.nivel)) : esc(i.idioma)));
  const blocks = {
    resumo: r.resumo ? `<p>${esc(r.resumo)}</p>` : "",
    experiencias: exp,
    formacao: edu,
    habilidades: joinList((r.habilidades || []).filter(Boolean).map(esc), pick(c.sepHabilidades, d.habilidades)),
    projetos: proj,
    idiomas: joinList(langs, pick(c.sepIdiomas, d.lista)),
    certificacoes: joinList((r.certificacoes || []).filter(Boolean).map(esc), pick(c.sepCertificacoes, d.lista)),
  };
  const defaultTitle = Object.fromEntries(SECTIONS);

  el.innerHTML = markPlaceholders(`
    <header><div><h1>${esc(r.nome) || "Seu nome"}</h1>${r.titulo ? `<div class="r-title">${esc(r.titulo)}</div>` : ""}</div>
    <div class="r-contact">${contact}</div></header>
    ${c.secoes.filter((s) => s.mostrar && blocks[s.key])
      .map((s) => `<section><h2>${esc((s.titulo || "").trim() || defaultTitle[s.key])}</h2>${blocks[s.key]}</section>`).join("")}`);
}

// ---------- campos a preencher: marcadores tipo "[X%]" deixados pelas sugestões da IA ----------
const PH = /\[[^\]\n<]{1,80}\]/g;
const hasPH = (s) => new RegExp(PH.source).test(s);
const markPlaceholders = (html) => html.replace(PH, (m) => `<mark class="r-ph">${m}</mark>`);
function findPending(obj) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === "string") { if (hasPH(v)) out.push({ path, text: v }); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i)));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(obj, "");
  return out;
}
function pendingLabel(r, path) {
  const [k, i, f, j] = path.split(".");
  const exp = r.experiencias?.[i];
  if (k === "experiencias" && f === "bullets") return `${exp?.cargo || "Experiência"}${exp?.empresa ? " · " + exp.empresa : ""}, conquista ${+j + 1}`;
  if (k === "projetos") return `Projeto ${r.projetos?.[i]?.nome || +i + 1}`;
  if (k === "paragrafos") return `Parágrafo ${+i + 1}`;
  return { titulo: "Título", resumo: "Resumo", habilidades: "Habilidades", certificacoes: "Certificações",
    saudacao: "Saudação", despedida: "Despedida" }[k] || k;
}
// leva até o campo do editor e seleciona o primeiro marcador
function focusPending(path) {
  switchTab("curriculo");
  $('[data-pane="conteudo"]').click();
  const top = path.split(".")[0];
  const el = $(`[data-path="${path.replace(/\.bullets\.\d+$/, ".bullets")}"]`) || $(`[data-list="${top}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus();
  const m = el.value.match(PH);
  if (m) el.setSelectionRange(el.value.indexOf(m[0]), el.value.indexOf(m[0]) + m[0].length);
}
function renderAllPreviews() {
  renderResume(state.resume, $("#preview-main"));
  if (state.tailored) renderResume(state.tailored, $("#preview-tailored"));
}

// ---------- editor ----------
const getPath = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
function setPath(o, p, v) {
  const ks = p.split(".");
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}
const LISTS = {
  experiencias: { label: "Experiência", blank: () => ({ cargo: "", empresa: "", local: "", inicio: "", fim: "", bullets: [] }),
    fields: [["cargo", "Cargo"], ["empresa", "Empresa"], ["inicio", "Início"], ["fim", "Fim"], ["local", "Local"]], lines: ["bullets", "Conquistas (uma por linha)"] },
  formacao: { label: "Formação", blank: () => ({ curso: "", instituicao: "", inicio: "", fim: "" }),
    fields: [["curso", "Curso"], ["instituicao", "Instituição"], ["inicio", "Início"], ["fim", "Fim"]] },
  projetos: { label: "Projetos", blank: () => ({ nome: "", descricao: "" }), fields: [["nome", "Nome"], ["descricao", "Descrição"]] },
  idiomas: { label: "Idiomas", blank: () => ({ idioma: "", nivel: "" }), fields: [["idioma", "Idioma"], ["nivel", "Nível"]] },
};
const input = (path, label, val, tag = "input") =>
  `<label>${label}${tag === "textarea"
    ? `<textarea data-path="${path}" rows="${path.endsWith("bullets") ? 4 : 3}">${esc(val)}</textarea>`
    : `<input data-path="${path}" value="${esc(val)}" />`}</label>`;

function renderEditor() {
  const r = state.resume;
  let html = `<div class="ed-section"><h3>Dados pessoais</h3><div class="grid2">
    ${[["nome", "Nome"], ["titulo", "Título"], ["email", "E-mail"], ["telefone", "Telefone"], ["local", "Cidade"], ["linkedin", "LinkedIn"]]
      .map(([k, l]) => input(k, l, r[k])).join("")}</div>
    ${input("site", "Site / GitHub", r.site)}
    ${input("resumo", "Resumo profissional", r.resumo, "textarea")}
    <label>Habilidades (separadas por vírgula)<input data-list="habilidades" value="${esc((r.habilidades || []).join(", "))}" /></label>
    <label>Certificações (separadas por vírgula)<input data-list="certificacoes" value="${esc((r.certificacoes || []).join(", "))}" /></label></div>`;

  for (const [key, cfg] of Object.entries(LISTS)) {
    html += `<div class="ed-section"><div class="row between"><h3>${cfg.label}</h3><button class="btn small ghost" data-add="${key}">+ Adicionar</button></div>`;
    (r[key] || []).forEach((item, i) => {
      html += `<div class="ed-item"><div class="grid2">${cfg.fields.map(([f, l]) => input(`${key}.${i}.${f}`, l, item[f])).join("")}</div>
        ${cfg.lines ? input(`${key}.${i}.${cfg.lines[0]}`, cfg.lines[1], (item[cfg.lines[0]] || []).join("\n"), "textarea") : ""}
        <div class="row"><button class="btn small" data-up="${key}.${i}">↑</button><button class="btn small danger" data-del="${key}.${i}">Remover</button></div></div>`;
    });
    html += `</div>`;
  }
  $("#editor").innerHTML = html;
  $$("#editor input, #editor textarea").forEach(flagPending);
}
const flagPending = (el) => el.classList.toggle("has-ph", hasPH(el.value));

const persist = debounce(() => { save(); }, 400);
$("#editor").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.path) {
    const v = t.dataset.path.endsWith("bullets") ? t.value.split("\n") : t.value;
    setPath(state.resume, t.dataset.path, v);
  } else if (t.dataset.list) {
    state.resume[t.dataset.list] = t.value.split(",").map((s) => s.trim()).filter(Boolean);
  } else return;
  flagPending(t);
  renderResume(state.resume, $("#preview-main"));
  persist();
});
$("#editor").addEventListener("change", (e) => {
  // limpa linhas vazias dos bullets quando sai do campo
  const p = e.target.dataset.path;
  if (p?.endsWith("bullets")) setPath(state.resume, p, getPath(state.resume, p).filter((b) => b.trim()));
  save();
});
$("#editor").addEventListener("click", (e) => {
  const { add, del, up } = e.target.dataset;
  if (add) state.resume[add] = [...(state.resume[add] || []), LISTS[add].blank()];
  else if (del) { const [k, i] = del.split("."); state.resume[k].splice(+i, 1); }
  else if (up) { const [k, i] = up.split("."); const a = state.resume[k]; if (+i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; }
  else return;
  save(); renderEditor(); renderResume(state.resume, $("#preview-main"));
});

function loadResume(r) {
  state.resume = { ...EMPTY, ...r };
  save(); renderEditor(); renderAllPreviews();
}

// ---------- importação ----------
$("#btn-upload").onclick = () => $("#file-input").click();
$("#file-input").onchange = (e) => e.target.files[0] && uploadFile(e.target.files[0]);
$("#btn-paste").onclick = () => { $("#paste-area").classList.toggle("hidden"); $("#btn-paste-send").classList.toggle("hidden"); };
$("#btn-sample").onclick = () => { loadResume(structuredClone(SAMPLE)); toast("Exemplo carregado"); };
$("#btn-paste-send").onclick = async () => {
  const r = await api("/api/curriculo/importar-texto", { body: { texto: $("#paste-area").value }, msg: "Lendo seu currículo..." });
  loadResume(r); toast("Currículo importado — revise os campos");
};
async function uploadFile(file) {
  const fd = new FormData();
  fd.append("arquivo", file);
  const r = await api("/api/curriculo/importar", { form: fd, msg: "Lendo seu currículo..." });
  loadResume(r); toast("Currículo importado — revise os campos");
}
const dz = $("#dropzone");
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("drag")));
dz.addEventListener("drop", (e) => { e.preventDefault(); e.dataTransfer.files[0] && uploadFile(e.dataTransfer.files[0]); });

// ---------- aparência (personalização do papel) ----------
$$("[data-pane]").forEach((b) => (b.onclick = () => {
  $$("[data-pane]").forEach((x) => x.classList.toggle("on", x === b));
  $("#pane-conteudo").hidden = b.dataset.pane !== "conteudo";
  $("#pane-aparencia").hidden = b.dataset.pane !== "aparencia";
}));

const FONTS = [["", "Padrão do modelo"], ["Inter, Arial, sans-serif", "Inter"], ["'IBM Plex Sans', Arial, sans-serif", "IBM Plex Sans"],
  ["Lato, Arial, sans-serif", "Lato"], ["Roboto, Arial, sans-serif", "Roboto"], ["Arial, Helvetica, sans-serif", "Arial"],
  ["'Source Serif 4', Georgia, serif", "Source Serif"], ["Merriweather, Georgia, serif", "Merriweather"], ["Georgia, serif", "Georgia"]];
const COLORS = ["#1f2328", "#0f6e5a", "#1d4ed8", "#4338ca", "#7c3aed", "#9f1239", "#b45309"];
const SEPS = [["auto", "Padrão do modelo"], ["•", "Bolinha  •"], ["·", "Ponto  ·"], ["|", "Barra  |"], ["/", "Barra  /"],
  ["–", "Traço  –"], [",", "Vírgula"], ["linha", "Quebra de linha"]];
const cv = (k) => (k === "template" ? state.template : state.custom[k]);

const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) =>
  `<button type="button" data-c="${k}" data-v="${esc(v)}" class="${String(cv(k)) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
const sel = (k, opts) => `<select data-c="${k}">${opts.map(([v, l]) =>
  `<option value="${esc(v)}"${String(cv(k)) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const czRow = (label, ctrl, hint = "") => `<div class="cz-row"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span>${ctrl}</div>`;

function renderCustomizer() {
  const c = state.custom;
  const custom = c.cor && !COLORS.includes(c.cor);
  const secs = c.secoes.map((s, i) => `
    <div class="sec-row${s.mostrar ? "" : " off"}">
      <input type="checkbox" data-sec-show="${i}" ${s.mostrar ? "checked" : ""} aria-label="Mostrar ${esc(s.titulo)}" />
      <input type="text" data-sec-title="${i}" value="${esc(s.titulo)}" aria-label="Título da seção" />
      <button type="button" class="btn small" data-sec-move="${i}:-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
      <button type="button" class="btn small" data-sec-move="${i}:1" ${i === c.secoes.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
    </div>`).join("");

  $("#customizer").innerHTML = `
    <div class="cz-group"><h3>Modelo</h3>
      <div class="tpl-cards">${[["classico", "Clássico"], ["moderno", "Moderno"], ["compacto", "Compacto"]].map(([v, l]) =>
        `<button type="button" class="tpl-card${state.template === v ? " on" : ""}" data-c="template" data-v="${v}"><i></i>${l}</button>`).join("")}</div>
    </div>

    <div class="cz-group"><h3>Cor e fonte</h3>
      ${czRow("Cor de destaque", `<div class="swatches">
        <button type="button" class="swatch auto${c.cor ? "" : " on"}" data-c="cor" data-v="" title="Padrão do modelo" aria-label="Padrão do modelo"></button>
        ${COLORS.map((h) => `<button type="button" class="swatch${c.cor === h ? " on" : ""}" style="background:${h}" data-c="cor" data-v="${h}" aria-label="${h}"></button>`).join("")}
        <input type="color" data-c="cor" value="${custom ? c.cor : "#0f6e5a"}" title="Outra cor" aria-label="Escolher outra cor" ${custom ? 'class="on"' : ""} /></div>`, "nome e títulos")}
      ${czRow("Fonte", sel("fonte", FONTS))}
      ${czRow("Tamanho do texto", `<div class="cz-range"><input type="range" data-c="escala" min="85" max="115" step="1" value="${c.escala}" /><output>${c.escala}%</output></div>`)}
    </div>

    <div class="cz-group"><h3>Layout</h3>
      ${czRow("Entrelinha", seg("entrelinha", [["1.25", "Justa"], ["0", "Normal"], ["1.6", "Arejada"]]))}
      ${czRow("Margens", seg("margem", [["estreita", "Estreitas"], ["normal", "Normais"], ["larga", "Largas"]]))}
      ${czRow("Cabeçalho", seg("cabecalho", [["auto", "Padrão"], ["left", "À esquerda"], ["center", "Centralizado"]]))}
      ${czRow("Títulos das seções", seg("titulos", [["maiusculas", "MAIÚSCULAS"], ["normal", "Normal"]]))}
      ${czRow("Marcador das conquistas", seg("marcador", [["•", "•"], ["–", "–"], ["▸", "▸"], ["✓", "✓"], ["nenhum", "Nenhum"]]))}
    </div>

    <div class="cz-group"><h3>Separadores</h3>
      <p class="muted" style="margin:0 0 4px">Como os itens de cada lista ficam separados no papel.</p>
      ${czRow("Contato", sel("sepContato", SEPS), "e-mail, telefone, links")}
      ${czRow("Habilidades", sel("sepHabilidades", [...SEPS, ["tags", "Etiquetas"]]))}
      ${czRow("Idiomas", sel("sepIdiomas", SEPS))}
      ${czRow("Certificações", sel("sepCertificacoes", SEPS))}
      ${czRow("Nível do idioma", sel("idiomaFormato", [["parenteses", "Inglês (Avançado)"], ["traco", "Inglês — Avançado"], ["dois-pontos", "Inglês: Avançado"]]))}
      ${czRow("Datas", sel("sepDatas", [["–", "03/2023 – Atual"], ["a", "03/2023 a Atual"], ["até", "03/2023 até Atual"], ["/", "03/2023 / Atual"]]))}
    </div>

    <div class="cz-group"><h3>Seções</h3>
      <p class="muted" style="margin:0 0 10px">Mostre, esconda, renomeie e reordene. Seções vazias não aparecem.</p>
      <div class="sec-list">${secs}</div>
    </div>

    <div class="cz-group"><button type="button" class="btn ghost" id="btn-cz-reset">Restaurar aparência padrão</button></div>`;
}

function applyCustom(redraw = true) {
  save();
  renderAllPreviews();
  if (redraw) renderCustomizer();
}
const cz = $("#customizer");
cz.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "btn-cz-reset") {
    state.custom = loadCustom();
    return applyCustom();
  }
  if (b.dataset.secMove) {
    const [i, dir] = b.dataset.secMove.split(":").map(Number);
    const a = state.custom.secoes;
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    return applyCustom();
  }
  if (b.dataset.c && "v" in b.dataset) {
    const { c: k, v } = b.dataset;
    if (k === "template") state.template = v;
    else state.custom[k] = k === "entrelinha" ? Number(v) : v;
    applyCustom();
  }
});
cz.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.secTitle) { state.custom.secoes[+t.dataset.secTitle].titulo = t.value; return applyCustom(false); }
  if (!t.dataset.c || t.tagName === "BUTTON") return;
  state.custom[t.dataset.c] = t.dataset.c === "escala" ? Number(t.value) : t.value;
  if (t.type === "range") t.nextElementSibling.textContent = t.value + "%";
  applyCustom(false);
});
cz.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.secShow) { state.custom.secoes[+t.dataset.secShow].mostrar = t.checked; return applyCustom(); }
  if (t.type === "color") applyCustom(); // marca o seletor de cor como ativo
});

// ajusta o papel A4 à largura da coluna (só na tela; o PDF sai em tamanho real)
const fitObserver = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    if (!target.clientWidth) continue; // aba escondida
    target.firstElementChild.style.zoom = Math.min(1, (target.clientWidth - 4) / 794).toFixed(3);
  }
});
$$(".paper-wrap").forEach((w) => fitObserver.observe(w));

// ---------- nota ----------
const color = (v) => (v >= 75 ? "var(--good)" : v >= 50 ? "var(--warn)" : "var(--bad)");
const CRIT_LABELS = { impacto: "Impacto", relevancia: "Relevância", clareza: "Clareza", estrutura_ats: "Estrutura e ATS" };
const SEC_LABELS = { titulo: "Título", resumo: "Resumo", experiencias: "Experiência", habilidades: "Habilidades", projetos: "Projetos",
  formacao: "Formação", idiomas: "Idiomas", certificacoes: "Certificações", contato: "Contato" };
const PRIO_LABELS = { alta: "Prioridade alta", media: "Prioridade média", baixa: "Prioridade baixa" };
let score = null; // última avaliação; cada sugestão aplicável ganha .undo depois de aplicada

// ---- aplicar / desfazer edições sugeridas pela IA (localiza pelo texto, não só pelo índice) ----
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "").toLowerCase();
function locate(path, text) {
  const ks = path.split(".");
  const last = ks.pop();
  const parent = getPath(state.resume, ks.join("."));
  if (Array.isArray(parent) && /^\d+$/.test(last)) {
    const i = norm(parent[+last]) === norm(text) ? +last : parent.findIndex((x) => norm(x) === norm(text));
    return i < 0 ? null : { parent, key: i };
  }
  const obj = ks.length ? parent : state.resume;
  return obj && norm(obj[last]) === norm(text) ? { parent: obj, key: last } : null;
}
function applyAction(a) {
  if (a.tipo === "adicionar") {
    const list = getPath(state.resume, a.campo);
    if (!Array.isArray(list)) return null;
    list.push(a.para);
    return () => { const i = list.findIndex((x) => norm(x) === norm(a.para)); if (i < 0) return false; list.splice(i, 1); return true; };
  }
  const loc = locate(a.campo, a.de);
  if (!loc) return null;
  const { parent, key } = loc;
  if (a.tipo === "substituir") {
    parent[key] = a.para;
    return () => { const l = locate(a.campo, a.para); if (!l) return false; l.parent[l.key] = a.de; return true; };
  }
  parent.splice(key, 1);
  return () => { parent.splice(Math.min(key, parent.length), 0, a.de); return true; };
}
function afterEdit() { save(); renderEditor(); renderResume(state.resume, $("#preview-main")); renderScore(); }

const highlight = (t) => esc(t).replace(/\[[^\]]+\]/g, (m) => `<mark>${m}</mark>`);
function renderSuggestion(g, id) {
  const a = g.acao;
  const diff = !a ? "" : `<div class="diff">
      ${a.de ? `<del>${esc(a.de)}</del>` : ""}
      ${a.para ? `<ins>${a.tipo === "adicionar" ? "+ " : ""}${highlight(a.para)}</ins>` : ""}
    </div>`;
  const btn = !a ? `<span class="muted sug-note">Depende de informação sua: edite na aba Currículo.</span>`
    : g.undo ? `<span class="applied">Aplicada</span><button class="btn small" data-undo="${id}">Desfazer</button>`
    : `<button class="btn small primary" data-apply="${id}">${{ substituir: "Aplicar reescrita", adicionar: "Adicionar", remover: "Remover" }[a.tipo]}</button>`;
  return `<div class="sug prio-${g.prioridade}${g.undo ? " done" : ""}">
    <div class="sug-prio">${PRIO_LABELS[g.prioridade]}</div>
    <p class="sug-problem">${esc(g.problema)}</p>
    ${g.por_que ? `<p class="sug-why">${esc(g.por_que)}</p>` : ""}
    ${diff}
    <div class="row sug-actions">${btn}</div>
  </div>`;
}
function renderScore() {
  const s = score;
  if (!s) return;
  const sugs = s.secoes.flatMap((sec) => sec.sugestoes);
  const pending = sugs.filter((g) => g.acao && !g.undo).length;
  const applied = sugs.filter((g) => g.undo).length;
  const bars = Object.entries(s.criterios).map(([k, v]) =>
    `<div class="bar"><span>${CRIT_LABELS[k] || k}</span><b>${v ?? "–"}</b><div><i style="width:${v || 0}%;background:${color(v)}"></i></div></div>`).join("");
  const list = (title, items, cls) => items.length ? `<div class="verdict-list ${cls}"><h4>${title}</h4><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  $("#score-out").innerHTML = `
    <div class="score-head">
      <div class="score-ring" style="--v:${s.nota};--c:${color(s.nota)}"><b>${s.nota}</b></div>
      <div class="bars">${bars}</div>
    </div>
    <div class="verdict">
      <p class="verdict-main">${esc(s.veredito)}</p>
      ${s.primeira_impressao ? `<p class="muted"><b>Em 6 segundos:</b> ${esc(s.primeira_impressao)}</p>` : ""}
      <div class="verdict-cols">${list("Sinais de alerta", s.alertas, "bad")}${list("Pontos fortes", s.pontos_fortes, "good")}</div>
    </div>
    ${s.checagens.length ? `<h3>Checagens automáticas</h3>${s.checagens.map((c) => `<div class="issue"><b>${esc(SEC_LABELS[c.secao] || c.secao)}:</b> ${esc(c.problema)}</div>`).join("")}` : ""}
    <div class="row between sug-bar">
      <h3>Sugestões por seção</h3>
      <div class="row">
        ${applied ? `<span class="muted">${applied} aplicada${applied > 1 ? "s" : ""} · a nota acima é de antes</span><button class="btn small" id="btn-rescore">Avaliar de novo</button>` : ""}
        ${pending ? `<button class="btn" id="btn-apply-all">Aplicar todas (${pending})</button>` : ""}
      </div>
    </div>
    ${s.secoes.filter((sec) => sec.sugestoes.length || sec.diagnostico).map((sec) => `
      <div class="card">
        <h4>${esc(SEC_LABELS[sec.secao] || sec.secao)} ${sec.nota != null ? `<span style="color:${color(sec.nota)}">${sec.nota}</span>` : ""}</h4>
        ${sec.diagnostico ? `<p class="muted sec-diag">${esc(sec.diagnostico)}</p>` : ""}
        ${sec.sugestoes.map((g) => renderSuggestion(g, sugs.indexOf(g))).join("")}
      </div>`).join("")}`;
}

async function evaluate() {
  if (!requireResume()) return;
  score = await api("/api/curriculo/nota", { body: { curriculo: state.resume }, msg: "Avaliando seu currículo..." });
  renderScore();
}
$("#btn-score").onclick = evaluate;
$("#score-out").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !score) return;
  const sugs = score.secoes.flatMap((sec) => sec.sugestoes);
  if (b.id === "btn-rescore") return evaluate();
  if (b.id === "btn-apply-all") {
    let ok = 0, fail = 0;
    for (const g of sugs.filter((g) => g.acao && !g.undo)) (g.undo = applyAction(g.acao)) ? ok++ : fail++;
    afterEdit();
    return toast(fail ? `${ok} aplicadas; ${fail} não encontraram o texto original (você editou?)` : `${ok} sugestões aplicadas`, !!fail);
  }
  if (b.dataset.apply) {
    const g = sugs[+b.dataset.apply];
    g.undo = applyAction(g.acao);
    if (!g.undo) return toast("O texto original mudou desde a avaliação. Avalie de novo.", true);
    afterEdit();
    toast(/\[[^\]]+\]/.test(g.acao.para || "") ? "Aplicada. Preencha os campos entre colchetes na aba Currículo" : "Sugestão aplicada");
  }
  if (b.dataset.undo) {
    const g = sugs[+b.dataset.undo];
    if (!g.undo()) return toast("Não deu para desfazer: o texto foi editado depois.", true);
    g.undo = null;
    afterEdit();
    toast("Desfeito");
  }
});

// ---------- adaptar à vaga ----------
const jobFields = { company: "empresa", title: "cargo", link: "link", country: "pais", desc: "vaga" };
for (const [id, key] of Object.entries(jobFields)) {
  const el = $("#job-" + id);
  if (state.job[key]) el.value = state.job[key];
  el.addEventListener("input", () => { state.job[key] = el.value; save(); if (key === "vaga") liveMatch(); });
}
const liveMatch = debounce(async () => {
  if (!hasResume() || (state.job.vaga || "").length < 80) return ($("#live-match").textContent = "");
  try {
    const m = await api("/api/compatibilidade", { body: { curriculo: state.resume, vaga: state.job.vaga }, silent: true });
    $("#live-match").innerHTML = `Compatibilidade estimada do currículo atual: <b style="color:${color(m.percentual)}">${m.percentual}%</b>`;
  } catch {}
}, 700);

// ---- revisão: cada mudança da IA pode ser aceita ou recusada; a versão adaptada = base + aceitas ----
const wordSet = (s) => new Set(norm(s).split(/[^\p{L}\p{N}+#.]+/u).filter((w) => w.length > 2));
function similarity(a, b) {
  const A = wordSet(a), B = wordSet(b);
  let n = 0;
  A.forEach((w) => B.has(w) && n++);
  return n / ((A.size + B.size - n) || 1);
}
function diffTailored(base, ai) {
  const ch = [];
  const text = (path, label) => {
    const de = getPath(base, path) || "", para = getPath(ai, path) || "";
    if (norm(de) !== norm(para)) ch.push({ kind: "text", path, label, de, para, ok: true });
  };
  text("titulo", "Título");
  text("resumo", "Resumo");
  (ai.experiencias || []).forEach((e, i) => {
    const label = [base.experiencias?.[i]?.cargo, base.experiencias?.[i]?.empresa].filter(Boolean).join(" · ") || `Experiência ${i + 1}`;
    const old = (base.experiencias?.[i]?.bullets || []).filter((b) => b.trim());
    const used = new Set();
    // a IA reescreve e reordena: pareia cada bullet novo com o antigo mais parecido
    (e.bullets || []).filter((b) => b.trim()).forEach((b, j) => {
      let k = old.findIndex((o, x) => !used.has(x) && norm(o) === norm(b));
      if (k >= 0) return used.add(k); // igual ao original
      let best = 0.12;
      k = -1;
      old.forEach((o, x) => { const s = !used.has(x) && similarity(o, b); if (s > best) { best = s; k = x; } });
      if (k >= 0) used.add(k);
      ch.push({ kind: "bullet", exp: i, j, label, de: k >= 0 ? old[k] : "", para: b, ok: true });
    });
    old.forEach((o, x) => used.has(x) || ch.push({ kind: "removed", exp: i, label, de: o, para: "", ok: true }));
  });
  const skills = (r) => (r.habilidades || []).filter(Boolean);
  if (skills(base).join("|") !== skills(ai).join("|")) ch.push({ kind: "skills", label: "Habilidades", de: skills(base), para: skills(ai), ok: true });
  (ai.projetos || []).forEach((p, i) => base.projetos?.[i] && text(`projetos.${i}.descricao`, `Projeto ${p.nome || i + 1}`));
  return ch;
}
// ---- detector de exagero: mudança suspeita vem marcada "Verificar" e recusada até a pessoa aceitar ----
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hasTerm = (hay, term) => {
  const t = fold(term).trim();
  return !!t && new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(hay);
};
const numbersIn = (s) => String(s).match(/\d+(?:[.,]\d+)?/g) || [];
const WEAK_VERBS = ["auxiliei", "ajudei", "apoiei", "participei", "colaborei", "contribui", "acompanhei", "assisti", "dei suporte"];
const STRONG_VERBS = ["liderei", "conduzi", "coordenei", "gerenciei", "chefiei", "estruturei", "idealizei", "projetei",
  "arquitetei", "implementei", "desenvolvi", "criei", "construi", "lancei", "automatizei", "otimizei", "defini", "fui responsavel"];
// termos que viram afirmação: ferramentas/siglas (escritas com maiúscula, número ou símbolo na vaga)
// e requisitos que a própria IA listou como lacuna. Palavras comuns ("backend", "performance") não contam.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROLE_WORDS = new Set(["backend", "back-end", "back end", "frontend", "front-end", "front end", "full stack", "fullstack",
  "full-stack", "mobile", "web", "software", "dados", "sistemas", "ti", "junior", "pleno", "senior", "estagio", "estagiario"]);
function claimTerms(keywords, vaga = "", lacunas = []) {
  const gaps = fold(lacunas.join(" "));
  return keywords.filter((k) => {
    if (ROLE_WORDS.has(fold(k).trim())) return false;
    if (hasTerm(gaps, k)) return true;
    const m = vaga.match(new RegExp(`(^|[^\\p{L}\\d])(${escRe(k)})(?![\\p{L}\\d])`, "iu"));
    if (!m) return /[A-Z0-9+#./]/.test(k);
    const w = m[2];
    const before = vaga.slice(0, m.index + m[1].length).trimEnd();
    const sentenceStart = !before || /[.!?\n•\-–]$/.test(before); // depois de ":" costuma vir lista de ferramentas
    return /[0-9+#./]/.test(w) || /[A-Z]/.test(w.slice(1)) || (/^[A-Z]/.test(w) && !sentenceStart);
  });
}
// conceitos que a IA gosta de enfiar no texto (radical, sem acento): só valem se já estiverem no currículo
const CONCEPTS = [
  [/micro-?s?servi/, "microsserviços"], [/mensageria/, "mensageria"], [/observabilidade/, "observabilidade"],
  [/entrega continua|integracao continua|deploy continuo|ci\/cd/, "CI/CD"], [/devops/, "DevOps"],
  [/testes (automatizados|unitarios|de integracao)|\btdd\b/, "testes automatizados"], [/alta disponibilidade/, "alta disponibilidade"],
  [/alto volume/, "alto volume"], [/escalave|escalabilidade/, "escalabilidade"], [/lideranca|liderei|lideran/, "liderança"],
  [/mentoria|mentorei/, "mentoria"], [/arquitet/, "arquitetura"], [/machine learning|inteligencia artificial/, "IA/ML"],
];
const newConcepts = (para, baseText) => CONCEPTS.filter(([re]) => re.test(fold(para)) && !re.test(baseText)).map(([, label]) => label);
function flagChanges(changes, base, keywords = []) {
  const baseText = fold(JSON.stringify(base));
  const baseNums = new Set(numbersIn(JSON.stringify(base)));
  for (const c of changes) {
    const why = [];
    const para = c.kind === "skills" ? "" : c.para;
    const newNums = [...new Set(numbersIn(para))].filter((n) => !baseNums.has(n));
    if (newNums.length) why.push(`Número que não está no seu currículo: ${newNums.join(", ")}`);
    const novos = [...new Set([...keywords.filter((k) => hasTerm(fold(para), k) && !hasTerm(baseText, k)), ...newConcepts(para, baseText)])];
    if (novos.length) why.push(`Cita ${novos.join(", ")}, que não aparece${novos.length > 1 ? "m" : ""} no seu currículo`);
    if (c.kind === "skills") {
      const sem = c.para.filter((s) => !c.de.some((d) => norm(d) === norm(s)) && !hasTerm(baseText, s));
      if (sem.length) why.push(`Habilidade${sem.length > 1 ? "s" : ""} sem comprovação: ${sem.join(", ")}`);
    }
    const de = fold(c.de || "").trim(), pa = fold(para).trim();
    if (WEAK_VERBS.some((v) => de.startsWith(v)) && STRONG_VERBS.some((v) => pa.startsWith(v)))
      why.push("Aumenta sua participação (de apoio para protagonismo)");
    if (c.kind === "text" && c.path === "titulo") why.push("Troca o cargo que você declara: só aceite se for verdade");
    if (c.kind === "bullet" && !c.de) why.push("Conquista nova, que não existia no original");
    c.flags = why;
    c.ok = !why.length;
  }
  return changes;
}

function buildTailored(ai, changes, base) {
  const out = structuredClone(ai);
  for (const c of changes) {
    if (!c.ok && c.kind === "text") setPath(out, c.path, c.de);
    if (!c.ok && c.kind === "skills") out.habilidades = [...c.de];
  }
  out.experiencias = (ai.experiencias || []).map((e, i) => {
    const mine = changes.filter((c) => c.exp === i);
    // tudo recusado nesta experiência: volta também a ordem original (a IA reordena por relevância)
    if (mine.length && mine.every((c) => !c.ok) && base.experiencias?.[i]) return { ...e, bullets: [...base.experiencias[i].bullets] };
    const bullets = [];
    (e.bullets || []).filter((b) => b.trim()).forEach((b, j) => {
      const c = changes.find((x) => x.kind === "bullet" && x.exp === i && x.j === j);
      if (!c || c.ok) bullets.push(b);
      else if (c.de) bullets.push(c.de); // recusou a reescrita: volta o original (recusou um novo: some)
    });
    changes.filter((c) => c.kind === "removed" && c.exp === i && !c.ok).forEach((c) => bullets.push(c.de));
    return { ...e, bullets };
  });
  return out;
}

const CHANGE_KIND = { text: "Reescrita", bullet: "Reescrita", removed: "Removida", skills: "Reordenadas e filtradas" };
function renderChange(c, i) {
  const kind = c.kind === "bullet" && !c.de ? "Nova" : CHANGE_KIND[c.kind];
  let body;
  if (c.kind === "skills") {
    const before = new Set(c.de.map(norm)), after = new Set(c.para.map(norm));
    body = `<div class="chips">${c.para.map((s) => `<span class="chip${before.has(norm(s)) ? " keep" : ""}">${esc(s)}</span>`).join("")}
      ${c.de.filter((s) => !after.has(norm(s))).map((s) => `<span class="chip gone">${esc(s)}</span>`).join("")}</div>`;
  } else {
    body = `<div class="diff">${c.de ? `<del>${esc(c.de)}</del>` : ""}${c.para ? `<ins>${highlight(c.para)}</ins>` : ""}</div>`;
  }
  const flags = c.flags?.length
    ? `<div class="flags"><b>Verificar</b><ul>${c.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>` : "";
  return `<div class="change${c.ok ? "" : " rejected"}${c.flags?.length ? " flagged" : ""}">
    <div class="change-head"><span><b>${esc(c.label)}</b> · ${kind}</span>
      <div class="seg"><button type="button" data-ch="${i}" data-ok="1" class="${c.ok ? "on" : ""}">Aceitar</button><button type="button" data-ch="${i}" data-ok="0" class="${c.ok ? "" : "on"}">Recusar</button></div></div>
    ${flags}${body}</div>`;
}

function renderTailorResult(t) {
  const accepted = t.changes.filter((c) => c.ok).length;
  const flagged = t.changes.filter((c) => c.flags?.length).length;
  $("#tailor-out").innerHTML = `
    <div class="match">
      <div>Antes<strong style="color:${color(t.antes.percentual)}">${t.antes.percentual}%</strong></div>
      <div>Com as mudanças aceitas<strong style="color:${color(t.depois.percentual)}">${t.depois.percentual}%</strong></div>
    </div>
    <h3>Palavras-chave da vaga</h3>
    <div class="chips">${t.depois.encontradas.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}
      ${t.depois.faltando.map((k) => `<span class="chip miss">${esc(k)}</span>`).join("")}</div>
    ${t.lacunas?.length ? `<h3>Requisitos que você não comprova</h3><p class="muted">Se você tem, adicione no seu currículo base. Não inventamos nada.</p><ul class="out-list">${t.lacunas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="row between sug-bar">
      <h3>Mudanças sugeridas <span class="muted">${accepted} de ${t.changes.length} aceitas</span></h3>
      ${t.changes.length ? `<div class="row"><button class="btn small" data-all="1">Aceitar todas</button><button class="btn small" data-all="0">Recusar todas</button></div>` : ""}
    </div>
    ${flagged ? `<p class="flag-note"><b>${flagged} mudança${flagged > 1 ? "s" : ""} marcada${flagged > 1 ? "s" : ""} para verificar</b> e deixada${flagged > 1 ? "s" : ""} de fora: podem afirmar algo que não está no seu currículo. Aceite só o que for verdade.</p>` : ""}
    <p class="muted">Recuse o que exagerar ou não for verdade. A pré-visualização e a compatibilidade se atualizam na hora.</p>
    ${t.changes.map(renderChange).join("") || `<p class="muted">A IA não mudou nenhum texto.</p>`}
    ${t.mudancas?.length ? `<details class="why"><summary>Por que a IA mudou</summary><ul class="out-list">${t.mudancas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
    <div class="row"><button class="btn" id="btn-save-app">Salvar em Candidaturas</button>
    <button class="btn ghost" id="btn-use-base">Usar como currículo base</button>
    <button class="btn ghost" id="btn-retailor" title="A mesma vaga e o mesmo currículo reaproveitam a última resposta; isto pede uma nova à IA">Gerar outra versão</button></div>`;
  $("#btn-save-app").onclick = saveApplication;
  $("#btn-retailor").onclick = () => tailor(true);
  $("#btn-use-base").onclick = () => { if (confirm("Substituir seu currículo base pela versão adaptada (só as mudanças aceitas)?")) { loadResume(structuredClone(state.tailored)); toast("Currículo base atualizado"); } };
}
const refreshMatch = debounce(async (t) => {
  try {
    t.depois = await api("/api/compatibilidade", { body: { curriculo: state.tailored, vaga: state.job.vaga || "", palavras_chave: t.palavras_chave }, silent: true });
    renderTailorResult(t);
  } catch {}
}, 300);
function updateTailored(t) {
  state.tailored = buildTailored(t.curriculo, t.changes, t.base);
  save();
  renderResume(state.tailored, $("#preview-tailored"));
  renderTailorResult(t);
  refreshMatch(t);
}
$("#tailor-out").addEventListener("click", (e) => {
  const t = state.lastTailor;
  const b = e.target.closest("button");
  if (!t || !b) return;
  if (b.dataset.ch) t.changes[+b.dataset.ch].ok = b.dataset.ok === "1";
  else if (b.dataset.all) t.changes.forEach((c) => (c.ok = b.dataset.all === "1"));
  else return;
  updateTailored(t);
});
async function tailor(refazer = false) {
  if (!requireResume()) return;
  const t = await api("/api/adaptar", {
    body: { curriculo: state.resume, vaga: state.job.vaga || "", pais: state.job.pais || "br", refazer },
    msg: refazer ? "Gerando outra versão..." : "Adaptando seu currículo à vaga...",
  });
  t.base = structuredClone(state.resume);
  t.changes = flagChanges(diffTailored(t.base, t.curriculo), t.base, claimTerms(t.palavras_chave || [], state.job.vaga, t.lacunas || []));
  state.lastTailor = t;
  state.tailored = buildTailored(t.curriculo, t.changes, t.base);
  save();
  renderResume(state.tailored, $("#preview-tailored"));
  renderTailorResult(t);
}
$("#btn-tailor").onclick = () => tailor();

async function saveApplication() {
  const { empresa, cargo, link, vaga } = state.job;
  if (!empresa || !cargo) return toast("Preencha empresa e cargo", true);
  await api("/api/candidaturas", { body: {
    empresa, cargo, link, vaga, curriculo: state.tailored, carta: state.cover,
    compatibilidade: state.lastTailor?.depois.percentual ?? null,
  }, msg: "Salvando..." });
  toast("Salvo em Candidaturas");
}

// ---------- carta ----------
function renderCover(c) {
  const r = state.resume;
  const el = $("#preview-cover");
  el.className = "paper letter";
  const today = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  el.innerHTML = `
    <header><h1 style="font-size:18pt;margin:0">${esc(r.nome)}</h1>
      <div class="r-contact">${[r.email, r.telefone, r.local].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div></header>
    <p>${today}</p>
    <div contenteditable="true" data-k="saudacao"><p>${esc(c.saudacao)}</p></div>
    ${(c.paragrafos || []).map((p, i) => `<div contenteditable="true" data-k="p${i}"><p>${esc(p)}</p></div>`).join("")}
    <div contenteditable="true" data-k="despedida"><p>${esc(c.despedida)}</p></div>
    <p><b>${esc(r.nome)}</b></p>`;
  el.oninput = (e) => {
    const k = e.target.closest("[data-k]")?.dataset.k;
    if (!k) return;
    const txt = e.target.closest("[data-k]").innerText.trim();
    if (k.startsWith("p")) state.cover.paragrafos[+k.slice(1)] = txt; else state.cover[k] = txt;
    persist();
  };
}
$("#btn-cover").onclick = async () => {
  if (!requireResume()) return;
  if ((state.job.vaga || "").length < 80) { toast("Cole a vaga na aba “Adaptar à vaga”", true); return switchTab("adaptar"); }
  state.cover = await api("/api/carta", {
    body: { curriculo: state.tailored || state.resume, vaga: state.job.vaga, empresa: state.job.empresa || "", tom: $("#cover-tone").value },
    msg: "Escrevendo sua carta...",
  });
  save(); renderCover(state.cover);
};

// ---------- entrevista ----------
const Q_CATS = [["tecnica", "Técnicas"], ["comportamental", "Comportamentais"], ["curriculo", "Sobre o seu currículo"], ["motivacao", "Motivação e empresa"]];
const jobLabel = (j) => [j.cargo, j.empresa].filter(Boolean).join(" · ") || "vaga sem nome";
function renderInterview() {
  const iv = state.interview;
  $("#btn-interview-again").classList.toggle("hidden", !iv);
  if (!iv) return ($("#interview-out").innerHTML = "");
  const stale = iv.vaga !== (state.job.vaga || "");
  const d = iv.data;
  $("#interview-out").innerHTML = `
    <div class="iv-head">
      <p class="iv-for">Para <b>${esc(jobLabel(iv))}</b>${stale ? ` <span class="iv-stale">· a vaga mudou desde então; gere de novo para atualizar</span>` : ""}</p>
      ${d.resumo_da_vaga ? `<p class="verdict-main">${esc(d.resumo_da_vaga)}</p>` : ""}
      <p class="muted">Tente responder em voz alta antes de abrir a resposta de exemplo. Complete o que estiver entre colchetes com os seus dados.</p>
    </div>
    ${Q_CATS.map(([k, label]) => {
      const qs = d.perguntas.filter((q) => q.categoria === k);
      return qs.length ? `<h3>${label} <span class="muted">${qs.length}</span></h3>${qs.map((q) => `
        <details class="q">
          <summary>${esc(q.pergunta)}</summary>
          <div class="q-body">
            ${q.por_que_perguntam ? `<p><b>O que querem avaliar:</b> ${esc(q.por_que_perguntam)}</p>` : ""}
            ${q.como_responder ? `<p><b>Como responder:</b> ${esc(q.como_responder)}</p>` : ""}
            ${q.resposta_exemplo ? `<blockquote>${highlight(q.resposta_exemplo)}</blockquote>` : ""}
            ${q.nao_esta_no_curriculo?.length ? `<p class="q-warn">Cita ${esc(q.nao_esta_no_curriculo.join(", "))}, que não está no seu currículo: só fale se for verdade, ou troque pela sua experiência real.</p>` : ""}
            ${q.baseada_em ? `<p class="muted">Baseada em: ${esc(q.baseada_em)}</p>` : ""}
          </div>
        </details>`).join("")}` : "";
    }).join("")}
    ${d.pontos_fracos.length ? `<h3>Pontos que vão notar</h3>${d.pontos_fracos.map((p) =>
      `<div class="issue"><b>${esc(p.ponto)}</b><br>${esc(p.como_abordar || "")}</div>`).join("")}` : ""}
    ${d.perguntas_para_fazer.length ? `<h3>Perguntas para você fazer</h3><ul class="out-list">${d.perguntas_para_fazer.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}`;
}
async function prepareInterview(refazer = false) {
  if (!requireResume()) return;
  if ((state.job.vaga || "").length < 80) { toast("Cole a vaga na aba “Adaptar à vaga”", true); return switchTab("adaptar"); }
  const { empresa = "", cargo = "", vaga } = state.job;
  const data = await api("/api/entrevista", {
    body: { curriculo: state.tailored || state.resume, vaga, empresa, cargo, refazer },
    msg: "Preparando as perguntas da entrevista...",
  });
  state.interview = { empresa, cargo, vaga, data };
  save();
  renderInterview();
}
$("#btn-interview").onclick = () => prepareInterview();
$("#btn-interview-again").onclick = () => prepareInterview(true);

// ---------- PDF (imprime só o papel, num iframe isolado) ----------
function printPaper(el) {
  if (el.classList.contains("empty")) return toast("Nada para exportar ainda", true);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const links = $$('link[rel="stylesheet"]').filter((l) => !l.href.includes("styles.css")).map((l) => l.outerHTML).join("");
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(state.resume.nome || "curriculo")}</title>${links}</head>
    <body><div class="${el.className}" style="${esc(el.getAttribute("style") || "")}">${el.innerHTML}</div></body></html>`);
  doc.close();
  frame.onload = () => {
    // espera as fontes antes de imprimir
    (frame.contentDocument.fonts?.ready || Promise.resolve()).then(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    });
  };
}
const PRINT_TARGETS = { main: "#preview-main", tailored: "#preview-tailored", cover: "#preview-cover" };
// "Microsoft Print to PDF" vira desenho (sem texto, ilegível para ATS): avisa para usar "Salvar como PDF"
function printWithTip(el) {
  if (el.classList.contains("empty") || store.get("pdfTipSeen", false)) return printPaper(el);
  const d = $("#pdf-tip");
  $("#pdf-tip-ok").onclick = () => {
    if ($("#pdf-tip-hide").checked) store.set("pdfTipSeen", true);
    d.close();
    printPaper(el);
  };
  d.showModal();
}

// PDF gerado no servidor (Chrome headless): A4, texto selecionável, sem diálogo. Se falhar, cai na impressão.
async function downloadPdf(el, filename) {
  loading(true, "Gerando PDF...");
  try {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: el.innerHTML, classe: el.className, estilo: el.getAttribute("style") || "", titulo: filename }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Erro ${res.status}`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = filename + ".pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast("PDF baixado");
  } catch (e) {
    toast(`Não deu para gerar o PDF direto (${e.message}). Abrindo a impressão.`, true);
    printWithTip(el);
  } finally {
    loading(false);
  }
}
const PRINT_SOURCES = {
  main: () => ({ data: state.resume, editable: true, name: "Currículo" }),
  tailored: () => ({ data: state.tailored, editable: false, name: "Currículo", empresa: state.job.empresa }),
  cover: () => ({ data: state.cover, editable: false, name: "Carta", empresa: state.job.empresa }),
};
function startDownload(kind) {
  const el = $(PRINT_TARGETS[kind]);
  if (el.classList.contains("empty")) return toast("Nada para exportar ainda", true);
  const src = PRINT_SOURCES[kind]();
  const filename = [src.name, state.resume.nome, src.empresa].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]/g, "");
  const pending = findPending(src.data);
  if (!pending.length) return downloadPdf(el, filename);

  const d = $("#pending-dlg");
  const where = src.editable ? "" : kind === "cover"
    ? "Clique no texto da carta para editar."
    : "Preencha no seu currículo base (aba Currículo) e adapte de novo, ou edite depois de usar como base.";
  d.innerHTML = `
    <h3>Faltam ${pending.length} campo${pending.length > 1 ? "s" : ""} para preencher</h3>
    <p class="muted">As sugestões deixaram marcadores entre colchetes. Se você baixar agora, eles vão aparecer no PDF. ${where}</p>
    <ul class="pending-list">${pending.map((p, i) => `<li>
      <div><b>${esc(pendingLabel(src.data, p.path))}</b><span>${highlight(p.text)}</span></div>
      ${src.editable ? `<button type="button" class="btn small" data-go="${i}">Preencher</button>` : ""}</li>`).join("")}</ul>
    <div class="row between">
      <button type="button" class="btn ghost" data-act="close">Voltar</button>
      <button type="button" class="btn ghost" data-act="anyway">Baixar assim mesmo</button>
    </div>`;
  d.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    d.close();
    if (b.dataset.go) focusPending(pending[+b.dataset.go].path);
    if (b.dataset.act === "anyway") downloadPdf(el, filename);
  };
  d.showModal();
}
$$("[data-print]").forEach((b) => (b.onclick = () => startDownload(b.dataset.print)));

// ---------- candidaturas (kanban) ----------
const COLS = [["preparacao", "Preparação"], ["enviada", "Enviada"], ["entrevista", "Entrevista"], ["oferta", "Oferta"], ["recusada", "Recusada"]];
let apps = [];
async function loadApps() {
  try { apps = await api("/api/candidaturas", { silent: true }); } catch { apps = []; }
  renderKanban();
}
function renderKanban() {
  $("#kanban").innerHTML = COLS.map(([k, label]) => {
    const items = apps.filter((a) => a.status === k);
    return `<div class="col" data-status="${k}"><h4>${label}<span>${items.length}</span></h4>
      ${items.map((a) => `<div class="app-card" draggable="true" data-id="${a.id}">
        <strong>${esc(a.cargo)}</strong>${esc(a.empresa)}
        <div class="meta">${a.compatibilidade != null ? `<span class="pill">${a.compatibilidade}%</span>` : "<span></span>"}
          <span>${a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">vaga</a> · ` : ""}<a href="#" data-open="${a.id}">abrir</a> · <a href="#" data-rm="${a.id}">×</a></span></div>
      </div>`).join("")}</div>`;
  }).join("");
}
const kb = $("#kanban");
kb.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", e.target.dataset.id));
kb.addEventListener("dragover", (e) => { const c = e.target.closest(".col"); if (c) { e.preventDefault(); c.classList.add("over"); } });
kb.addEventListener("dragleave", (e) => e.target.closest(".col")?.classList.remove("over"));
kb.addEventListener("drop", async (e) => {
  const col = e.target.closest(".col");
  if (!col) return;
  e.preventDefault(); col.classList.remove("over");
  const id = e.dataTransfer.getData("text/plain");
  const a = apps.find((x) => String(x.id) === id);
  if (!a || a.status === col.dataset.status) return;
  a.status = col.dataset.status; renderKanban();
  await api(`/api/candidaturas/${id}`, { method: "PATCH", body: { status: a.status }, silent: true }).catch(loadApps);
});
kb.addEventListener("click", async (e) => {
  const { open, rm } = e.target.dataset;
  if (rm) {
    e.preventDefault();
    if (!confirm("Remover candidatura?")) return;
    await api(`/api/candidaturas/${rm}`, { method: "DELETE", silent: true }); loadApps();
  } else if (open) {
    // carrega a vaga + versões salvas nas abas de adaptação e carta
    e.preventDefault();
    const a = apps.find((x) => String(x.id) === open);
    state.job = { empresa: a.empresa, cargo: a.cargo, link: a.link, vaga: a.vaga, pais: state.job.pais || "br" };
    for (const [id, key] of Object.entries(jobFields)) $("#job-" + id).value = state.job[key] || "";
    state.tailored = a.curriculo; state.cover = a.carta; save();
    if (a.curriculo) renderResume(a.curriculo, $("#preview-tailored"));
    if (a.carta) renderCover(a.carta);
    $("#tailor-out").innerHTML = "";
    switchTab("adaptar");
  }
});
$("#btn-new-app").onclick = async () => {
  const empresa = prompt("Empresa:"); if (!empresa) return;
  const cargo = prompt("Cargo:"); if (!cargo) return;
  await api("/api/candidaturas", { body: { empresa, cargo }, silent: true }); loadApps();
};

// ---------- backup (currículo e aparência ficam no navegador; candidaturas no SQLite) ----------
const BACKUP_KEYS = ["resume", "tailored", "job", "cover", "template", "custom", "interview"];
$("#btn-export").onclick = async () => {
  let candidaturas = [];
  try { candidaturas = await api("/api/candidaturas", { silent: true }); } catch {}
  const data = { app: "vagafit", versao: 1, exportado_em: new Date().toISOString(),
    dados: Object.fromEntries(BACKUP_KEYS.map((k) => [k, state[k]])), candidaturas };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `vagafit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(`Backup exportado: currículo, aparência e ${candidaturas.length} candidatura${candidaturas.length === 1 ? "" : "s"}`);
};
$("#btn-import").onclick = () => $("#backup-input").click();
$("#backup-input").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // permite escolher o mesmo arquivo de novo
  if (file) await importBackup(file);
};
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast("Esse arquivo não é um JSON válido", true); }
  if (data?.app !== "vagafit" || typeof data.dados !== "object" || !data.dados) return toast("Esse arquivo não é um backup do VagaFit", true);
  const apps = Array.isArray(data.candidaturas) ? data.candidaturas.filter((a) => a?.empresa && a?.cargo) : [];
  const when = new Date(data.exportado_em).toLocaleString("pt-BR");
  if (!confirm(`Restaurar o backup de ${when}?\n\nSeu currículo, aparência, vaga e carta atuais serão substituídos.`
    + (apps.length ? `\n${apps.length} candidatura(s) serão adicionadas; as que você já tem são ignoradas.` : ""))) return;

  for (const k of BACKUP_KEYS) if (k in data.dados) store.set(k, data.dados[k]);
  let added = 0;
  if (apps.length) {
    const key = (a) => [a.empresa, a.cargo, a.link || ""].map(norm).join("|");
    const have = new Set((await api("/api/candidaturas", { silent: true }).catch(() => [])).map(key));
    for (const { id, criado_em, atualizado_em, ...a } of apps) {
      if (have.has(key(a))) continue;
      await api("/api/candidaturas", { body: a, silent: true });
      have.add(key(a));
      added++;
    }
  }
  store.set("flash", `Backup restaurado${apps.length ? ` (${added} candidatura${added === 1 ? "" : "s"} nova${added === 1 ? "" : "s"})` : ""}`);
  location.reload();
}

// ---------- init ----------
renderEditor();
renderCustomizer();
renderAllPreviews();
if (state.cover) renderCover(state.cover);
renderInterview();
const flash = store.get("flash", null);
if (flash) { store.set("flash", null); toast(flash); }
