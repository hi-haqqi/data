/* Content script: tombol 💬 di dekat kotak komentar yang sedang fokus, panel
   template / saran AI, pengisian kotak komentar, dan kirim otomatis (opsional).
   Setiap komentar selalu dipicu oleh klik / shortcut pengguna, tidak ada loop otomatis. */
(function () {
  if (window.__autoCommentLoaded) return;
  window.__autoCommentLoaded = true;

  const AC = globalThis.AC;
  const platform = AC.detectPlatform(location.hostname);
  let settings = AC.mergeSettings();
  let editor = null; // kotak komentar aktif
  let lastContextTarget = null;
  let aiSuggestions = [];

  // ---------- storage ----------
  const store = chrome.storage.local;
  function loadSettings() {
    return store.get("settings").then(({ settings: s }) => (settings = AC.mergeSettings(s)));
  }
  loadSettings();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.settings) {
      settings = AC.mergeSettings(ch.settings.newValue);
      if (!settings.enabled || !settings.showButton) hideUI();
    }
  });
  async function bumpStats(field) {
    const { stats } = await store.get("stats");
    const s = AC.freshStats(stats);
    s[field] += 1;
    if (field === "sent") s.lastSentAt = Date.now();
    await store.set({ stats: s });
    return s;
  }
  async function rememberTemplate(tpl) {
    const { recent = [] } = await store.get("recent");
    await store.set({ recent: [tpl, ...recent.filter((t) => t !== tpl)].slice(0, 8) });
  }

  // ---------- util DOM ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function q(scope, sel) {
    if (!sel || !scope) return null;
    try {
      return scope.querySelector(sel);
    } catch {
      return null;
    }
  }
  function qa(scope, sel) {
    if (!sel || !scope) return [];
    try {
      return [...scope.querySelectorAll(sel)];
    } catch {
      return [];
    }
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }
  /** activeElement yang menembus shadow DOM (Reddit, YouTube, dll). */
  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  function meta(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return (el && el.content) || "";
  }

  /** Elemen yang bisa diisi komentar (textarea / contenteditable host). */
  function editableRoot(el) {
    if (!el || !(el instanceof Element) || el.closest("#ac-root")) return null;
    if (el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled) return el;
    if (el instanceof HTMLInputElement && el.type === "text" && /comment|komentar|reply|balas/i.test(el.placeholder + el.name + (el.getAttribute("aria-label") || ""))) return el;
    if (el.isContentEditable) {
      let host = el;
      while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
      return host;
    }
    return null;
  }

  function editorText(el) {
    return ("value" in el && !el.isContentEditable ? el.value : el.innerText || "").trim();
  }

  /** Isi editor. Mengganti isi bila kosong / berisi sisipan kita sebelumnya,
      selain itu menambahkan di akhir agar teks pengguna (mis. @mention) tidak hilang. */
  async function fillEditor(el, text) {
    el.focus();
    const current = editorText(el);
    const replace = !current || current === el.__acLast;
    if (!el.isContentEditable) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setValue = Object.getOwnPropertyDescriptor(proto, "value").set;
      const value = replace ? text : el.value.replace(/\s*$/, " ") + text;
      setValue.call(el, value); // setter native: aman walau situs meng-override properti value
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.setSelectionRange(value.length, value.length);
    } else {
      const sel = getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      if (!replace) range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      const insert = replace ? text : " " + text;
      // execCommand memicu beforeinput/input sehingga Draft.js (X), Quill (LinkedIn),
      // Lexical (Facebook/Threads) ikut memperbarui state-nya.
      let ok = document.execCommand("insertText", false, insert);
      await sleep(30);
      if (!ok || !editorText(el).includes(text.slice(0, 20).trim())) {
        const dt = new DataTransfer();
        dt.setData("text/plain", insert);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        await sleep(30);
      }
    }
    await sleep(30);
    if (!editorText(el).includes(text.slice(0, 20).trim())) {
      try {
        await navigator.clipboard.writeText(text);
        toast("Kotak ini menolak isi otomatis. Teks disalin, tempel dengan Ctrl+V.");
      } catch {
        toast("Gagal mengisi kotak komentar.");
      }
      return false;
    }
    el.__acLast = editorText(el);
    return true;
  }

  // ---------- konteks postingan ----------
  function getContainer(el) {
    if (!platform.container) return null;
    return (el && el.closest(platform.container)) || (platform.firstContainerIfOutside ? q(document, platform.container) : null);
  }

  function largestImage(scope) {
    let best = null;
    let bestArea = 40000; // abaikan avatar/ikon
    for (const img of qa(scope, "img")) {
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && /^https:/.test(img.currentSrc || img.src)) {
        best = img.currentSrc || img.src;
        bestArea = area;
      }
    }
    return best;
  }

  function getContext(el) {
    const container = getContainer(el) || (el && el.closest("article, [role=article]"));
    const scope = container || document;
    const title = meta("og:title") || document.title;
    let author = AC.cleanName((q(scope, platform.author) || {}).textContent);
    if (!author && platform.authorFromTitle) {
      const m = title.match(platform.authorFromTitle);
      if (m) author = AC.cleanName(m[1]);
    }
    let text = (q(scope, platform.text) || {}).innerText || "";
    if (!text && container) text = container.innerText;
    if (!text) text = meta("og:description") || meta("description");
    return {
      platform: platform.key,
      platformName: platform.name,
      url: location.href,
      author,
      title: title.trim().slice(0, 300),
      text: text.replace(/\s+\n/g, "\n").trim().slice(0, 2000),
      image: (container && largestImage(container)) || meta("og:image") || largestImage(document) || "",
    };
  }

  function templatesForPlatform() {
    const own = settings.templates[platform.group] || [];
    return own.length ? own : settings.templates.general || [];
  }

  function varsFor(ctx) {
    return { name: ctx.author, firstName: AC.firstName(ctx.author), title: ctx.title, platform: ctx.platformName };
  }

  // ---------- aksi ----------
  async function useText(text, fromTemplate) {
    const el = editor && editor.isConnected ? editor : editableRoot(deepActive());
    if (!el) return toast("Klik kotak komentar dulu.");
    if (!(await fillEditor(el, text))) return;
    if (fromTemplate) rememberTemplate(fromTemplate);
    const stats = await bumpStats("filled");
    closePanel();
    if (!settings.autoSubmit) return toast("Komentar diisi. Periksa lalu kirim.");
    const gate = AC.canAutoSubmit(settings, stats);
    if (!gate.ok) return toast(gate.reason + ". Kirim manual.");
    if (await clickSubmit(el)) {
      await bumpStats("sent");
      toast("Komentar terkirim ✓");
    } else {
      toast("Tombol kirim tidak ditemukan. Kirim manual.");
    }
  }

  async function useRandomTemplate() {
    const el = editor || editableRoot(deepActive());
    const tpl = AC.pickTemplate(templatesForPlatform(), (await store.get("recent")).recent || []);
    if (!tpl) return toast("Belum ada template. Tambahkan di Pengaturan.");
    await useText(AC.renderTemplate(tpl, varsFor(getContext(el))), tpl);
  }

  function findSubmit(el) {
    const scopes = [];
    const form = el.closest("form");
    if (form) scopes.push(form);
    for (let p = el.parentElement, i = 0; p && i < 6; p = p.parentElement, i++) scopes.push(p);
    const container = getContainer(el);
    if (container) scopes.push(container);
    for (const s of scopes) {
      const b = qa(s, platform.submit).find(visible);
      if (b) return b;
    }
    const label = /^(post|reply|comment|send|publish|kirim|balas|posting|komentari|tweet|respond)$/i;
    for (const s of scopes.slice(0, 5)) {
      const b = qa(s, "button, [role=button], input[type=submit]").find(
        (b) => b !== el && visible(b) && label.test((b.getAttribute("aria-label") || b.innerText || b.value || "").trim())
      );
      if (b) return b;
    }
    return null;
  }

  /** Tunggu tombol kirim aktif (banyak situs mengaktifkannya setelah input diproses). */
  async function clickSubmit(el) {
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      const b = findSubmit(el);
      if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") {
        b.click();
        return true;
      }
    }
    return false;
  }

  async function requestAi() {
    if (!settings.ai.apiKey) {
      renderAi({ error: "Isi API key Claude di Pengaturan untuk memakai saran AI." });
      return;
    }
    renderAi({ loading: true });
    const ctx = getContext(editor);
    try {
      const res = await chrome.runtime.sendMessage({ type: "ai-generate", ctx });
      if (!res || !res.ok) throw new Error((res && res.error) || "Tidak ada respons");
      aiSuggestions = res.suggestions;
      renderAi({ items: aiSuggestions });
    } catch (e) {
      renderAi({ error: String(e.message || e) });
    }
  }

  // ---------- UI (Shadow DOM agar tidak bentrok dengan CSS situs) ----------
  let host, shadow, btn, panel, toastEl;
  function ensureUI() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement("div");
    host.id = "ac-root";
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { --bg:#fff; --fg:#1b1b1f; --mut:#6b6b76; --line:#e4e4ea; --hover:#f3f0ff; --acc:#ea4c89; }
        @media (prefers-color-scheme: dark) { :host { --bg:#1e1e24; --fg:#ececf1; --mut:#a0a0ab; --line:#33333d; --hover:#2a2733; } }
        * { box-sizing:border-box; font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
        .btn { position:fixed; width:28px; height:28px; border-radius:50%; border:0; cursor:pointer;
               background:var(--acc); color:#fff; font-size:14px; box-shadow:0 2px 8px rgba(0,0,0,.25);
               display:none; align-items:center; justify-content:center; padding:0; }
        .btn:hover { filter:brightness(1.08); }
        .panel { position:fixed; width:320px; max-height:380px; display:none; flex-direction:column;
                 background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:10px;
                 box-shadow:0 8px 28px rgba(0,0,0,.22); overflow:hidden; }
        .head { display:flex; gap:6px; align-items:center; padding:8px; border-bottom:1px solid var(--line); }
        .head b { flex:1; font-weight:600; }
        .head button { border:1px solid var(--line); background:transparent; color:var(--fg); border-radius:6px;
                       padding:4px 8px; cursor:pointer; }
        .head button:hover { background:var(--hover); }
        .body { overflow:auto; padding:4px 0; }
        .sec { padding:6px 10px 2px; color:var(--mut); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
        .item { display:block; width:100%; text-align:left; border:0; background:transparent; color:var(--fg);
                padding:7px 10px; cursor:pointer; white-space:normal; }
        .item:hover { background:var(--hover); }
        .note { padding:7px 10px; color:var(--mut); }
        .foot { padding:6px 10px; border-top:1px solid var(--line); color:var(--mut); font-size:11px; }
        .toast { position:fixed; right:16px; bottom:16px; max-width:320px; padding:10px 14px; border-radius:8px;
                 background:#1b1b1f; color:#fff; box-shadow:0 4px 16px rgba(0,0,0,.3); display:none; }
      </style>
      <button class="btn" title="Auto Comment" aria-label="Auto Comment">💬</button>
      <div class="panel" role="dialog" aria-label="Auto Comment">
        <div class="head">
          <b></b>
          <button data-act="random" title="Isi template acak">🎲 Acak</button>
          <button data-act="ai" title="Buat saran dengan AI">✨ AI</button>
          <button data-act="options" title="Pengaturan">⚙</button>
        </div>
        <div class="body"><div class="ai"></div><div class="sec">Template</div><div class="tpls"></div></div>
        <div class="foot"></div>
      </div>
      <div class="toast" role="status"></div>`;
    btn = shadow.querySelector(".btn");
    panel = shadow.querySelector(".panel");
    toastEl = shadow.querySelector(".toast");
    // mousedown.preventDefault menjaga fokus & kursor tetap di kotak komentar
    shadow.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => (panel.style.display === "flex" ? closePanel() : openPanel()));
    panel.addEventListener("click", (e) => {
      const t = e.target.closest("[data-act], [data-tpl], [data-ai]");
      if (!t) return;
      if (t.dataset.act === "random") useRandomTemplate();
      else if (t.dataset.act === "ai") requestAi();
      else if (t.dataset.act === "options") chrome.runtime.sendMessage({ type: "open-options" });
      else if (t.dataset.tpl !== undefined) useText(t.textContent, t.dataset.tpl);
      else if (t.dataset.ai !== undefined) useText(aiSuggestions[+t.dataset.ai]);
    });
    document.documentElement.appendChild(host);
  }

  function position() {
    if (!editor || !btn) return;
    if (!editor.isConnected) return hideUI();
    const r = editor.getBoundingClientRect();
    const top = r.top > 34 ? r.top - 32 : r.bottom + 4;
    const left = Math.min(Math.max(r.right - 28, 4), innerWidth - 32);
    btn.style.top = top + "px";
    btn.style.left = left + "px";
    if (panel.style.display === "flex") {
      const ph = panel.offsetHeight || 300;
      const pTop = top > ph + 8 ? top - ph - 6 : Math.min(top + 34, innerHeight - ph - 8);
      panel.style.top = Math.max(8, pTop) + "px";
      panel.style.left = Math.max(8, Math.min(left + 28 - 320, innerWidth - 328)) + "px";
    }
  }

  function showButton(el, force) {
    editor = el;
    if (!force && (!settings.enabled || !settings.showButton)) return;
    ensureUI();
    btn.style.display = "flex";
    position();
  }

  function hideUI() {
    if (btn) btn.style.display = "none";
    closePanel();
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function openPanel() {
    ensureUI();
    const ctx = getContext(editor);
    const vars = varsFor(ctx);
    panel.querySelector("b").textContent = platform.name + (ctx.author ? " · " + ctx.author : "");
    panel.querySelector(".tpls").innerHTML =
      templatesForPlatform()
        .map((t) => `<button class="item" data-tpl="${esc(t)}">${esc(AC.renderTemplate(t, vars))}</button>`)
        .join("") || `<div class="note">Belum ada template.</div>`;
    panel.querySelector('[data-act="ai"]').style.display = settings.ai.apiKey ? "" : "none";
    panel.querySelector(".foot").textContent = settings.autoSubmit
      ? `Kirim otomatis: ON · jeda ${settings.minGapSec} dtk · maks ${settings.dailyLimit}/hari`
      : "Kirim otomatis: OFF (Anda yang menekan Kirim)";
    if (aiSuggestions.length) renderAi({ items: aiSuggestions });
    else renderAi({});
    panel.style.display = "flex";
    position();
  }

  function closePanel() {
    if (panel) panel.style.display = "none";
  }

  function renderAi(state) {
    if (!panel) return;
    const box = panel.querySelector(".ai");
    if (state.loading) box.innerHTML = `<div class="sec">Saran AI</div><div class="note">Membuat saran…</div>`;
    else if (state.error) box.innerHTML = `<div class="sec">Saran AI</div><div class="note">${esc(state.error)}</div>`;
    else if (state.items && state.items.length)
      box.innerHTML =
        `<div class="sec">Saran AI</div>` +
        state.items.map((t, i) => `<button class="item" data-ai="${i}">${esc(t)}</button>`).join("");
    else box.innerHTML = "";
    position();
  }

  let toastTimer;
  function toast(msg) {
    ensureUI();
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.style.display = "none"), 3500);
  }

  // ---------- event ----------
  document.addEventListener(
    "focusin",
    (e) => {
      const el = editableRoot(e.composedPath()[0]);
      if (!el) return;
      if (el !== editor) aiSuggestions = [];
      showButton(el);
    },
    true
  );
  document.addEventListener(
    "focusout",
    () =>
      setTimeout(() => {
        const a = deepActive();
        if (editor && a !== editor && !editor.contains(a)) hideUI();
      }, 200),
    true
  );
  document.addEventListener("contextmenu", (e) => (lastContextTarget = editableRoot(e.composedPath()[0])), true);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePanel(), true);
  let raf = 0;
  const onMove = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      position();
    });
  };
  addEventListener("scroll", onMove, { capture: true, passive: true });
  addEventListener("resize", onMove, { passive: true });

  // Pesan dari service worker (shortcut keyboard / menu klik kanan / popup)
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const target = editableRoot(deepActive()) || lastContextTarget || editor;
    if (msg.type === "fill-random" || msg.type === "open-panel") {
      if (!target) {
        toast("Klik kotak komentar dulu.");
      } else {
        editor = target;
        loadSettings().then(() => {
          if (msg.type === "fill-random") useRandomTemplate();
          else {
            showButton(target, true);
            openPanel();
            requestAi();
          }
        });
      }
    }
    sendResponse({ ok: true });
  });

  // Jika kotak komentar sudah fokus saat skrip disuntikkan (situs lain), langsung tampilkan tombol
  const initial = editableRoot(deepActive());
  if (initial) loadSettings().then(() => showButton(initial));
})();
