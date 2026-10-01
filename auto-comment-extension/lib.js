/* Fungsi murni + pengaturan default. Dipakai content script, popup, options,
   service worker (importScripts), dan unit test Node (module.exports). */
(function (root) {
  const AC = (root.AC = root.AC || {});

  AC.DEFAULTS = {
    enabled: true,
    showButton: true,
    autoSubmit: false,
    minGapSec: 20, // jeda minimal antar kirim otomatis
    dailyLimit: 40, // maks kirim otomatis per hari
    templates: {
      general: [
        "{Great|Really nice|Lovely} work{, {firstName}|}! {The details are on point|Clean and well thought out|Love the overall vibe}.",
        "This is {really|super} {well done|inspiring}{, {firstName}|} 👏",
        "{Love|Really like} how {clean|polished} this looks!",
      ],
      dribbble: [
        "{Beautiful|Stunning|Super clean} shot{, {firstName}|}! {Love the color palette|The typography is on point|Great use of whitespace} 🔥",
        "{Really|Super} {smooth|polished} {layout|composition}. {Nice work!|Well done!|Keep it up!}",
        "The {visual hierarchy|attention to detail|spacing} here is {great|excellent} 👌",
        "{Love|Really dig} this direction{, {firstName}|}! {Clean and modern.|Very fresh.}",
      ],
      linkedin: [
        "{Great|Insightful|Valuable} {post|share}{, {firstName}|}. {Thanks for sharing!|Appreciate you putting this together.}",
        "{Well said|Couldn't agree more}{, {firstName}|}. {This is a great reminder.|Very relevant right now.}",
        "{Congratulations|Congrats}{, {firstName}|}! {Well deserved.|Wishing you continued success.}",
      ],
      twitter: [
        "{This is great|Love this|So good} 🔥",
        "{Great|Solid} {point|take}{, {firstName}|}.",
        "{Bookmarking this|Saving this} 👀",
      ],
      instagram: [
        "{So good|Love this|Amazing} {🔥|😍|👏}",
        "{Beautiful|Gorgeous} {work|shot}{, {firstName}|}! ✨",
        "{The colors|The details|This vibe} {💯|🙌}",
      ],
    },
    ai: {
      apiKey: "",
      model: "claude-opus-5-5",
      language: "auto", // auto = ikuti bahasa postingan
      tone: "friendly, genuine, concise",
      maxWords: 25,
      persona: "",
      sendImage: true,
    },
  };

  AC.TEMPLATE_GROUPS = {
    general: "Umum (situs lain)",
    dribbble: "Dribbble / Behance",
    linkedin: "LinkedIn",
    twitter: "X / Twitter / Threads",
    instagram: "Instagram / TikTok",
  };

  AC.AI_MODELS = {
    "claude-opus-5-5": "Opus 5.5 (default)",
    "claude-sonnet-5-5": "Sonnet 5.5 (lebih murah)",
    "claude-haiku-4-5": "Haiku 4.5 (termurah)",
  };

  /** Gabungkan pengaturan tersimpan dengan default (template per grup diganti utuh). */
  AC.mergeSettings = function (saved) {
    const d = AC.DEFAULTS;
    saved = saved || {};
    return {
      ...d,
      ...saved,
      templates: { ...d.templates, ...(saved.templates || {}) },
      ai: { ...d.ai, ...(saved.ai || {}) },
    };
  };

  /** Spintax {a|b|c} -> salah satu opsi, mendukung nested (diproses dari dalam). */
  AC.spin = function (text, rand = Math.random) {
    const re = /\{([^{}]*\|[^{}]*)\}/;
    let out = text;
    for (let i = 0; i < 50 && re.test(out); i++) {
      out = out.replace(re, (_, body) => {
        const opts = body.split("|");
        return opts[Math.floor(rand() * opts.length)];
      });
    }
    return out;
  };

  const VAR_KEYS = ["name", "firstName", "title", "platform"];

  /** Render template: variabel dulu (agar bisa dipakai di dalam spintax), lalu spintax.
      Variabel kosong dibuang beserta koma/spasi di depannya. */
  AC.renderTemplate = function (tpl, vars = {}, rand = Math.random) {
    let out = (tpl || "").replace(/([ \t]*,?[ \t]*)\{(\w+)\}/g, (m, pre, key) => {
      if (!VAR_KEYS.includes(key)) return m;
      const v = String(vars[key] || "").replace(/[{}|]/g, "").trim();
      return v ? pre + v : "";
    });
    out = AC.spin(out, rand)
      .replace(/^[\s,.;:!-]+/, "")
      .replace(/[ \t]+([,.!?])/g, "$1")
      .replace(/,([.!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return out ? out[0].toUpperCase() + out.slice(1) : out;
  };

  /** Pilih template acak, hindari yang baru dipakai bila masih ada pilihan lain. */
  AC.pickTemplate = function (templates, recent = [], rand = Math.random) {
    const list = (templates || []).filter((t) => t && t.trim());
    if (!list.length) return null;
    const fresh = list.filter((t) => !recent.includes(t));
    const pool = fresh.length ? fresh : list;
    return pool[Math.floor(rand() * pool.length)];
  };

  /** Ubah teks bebas (satu per baris) menjadi array template. */
  AC.parseTemplateText = function (text) {
    return (text || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  /** Bersihkan output AI: satu komentar per baris, tanpa nomor/bullet/kutip. */
  AC.cleanAiLines = function (text) {
    return (text || "")
      .split(/\r?\n/)
      .map((s) =>
        s
          .trim()
          .replace(/^(?:[-*•]|\d+[.)]|\(\d+\))\s*/, "")
          .replace(/^["“”'](.*)["“”']$/, "$1")
          .trim()
      )
      .filter((s) => s && !/:$/.test(s));
  };

  AC.firstName = function (name) {
    const n = (name || "").replace(/^@/, "").trim().split(/\s+/)[0] || "";
    return n.length > 30 ? "" : n;
  };

  /** Nama penulis: ambil baris pertama, buang badge/teks tambahan. */
  AC.cleanName = function (raw) {
    const n = (raw || "").split(/\n|•|·|\|/)[0].replace(/\s+/g, " ").trim();
    return n.length > 60 ? "" : n;
  };

  AC.todayKey = function (d = new Date()) {
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /** Statistik harian; reset otomatis saat tanggal berganti. */
  AC.freshStats = function (stats, today = AC.todayKey()) {
    if (!stats || stats.date !== today) {
      return { date: today, filled: 0, sent: 0, lastSentAt: (stats && stats.lastSentAt) || 0 };
    }
    return stats;
  };

  /** Boleh kirim otomatis? Mengembalikan {ok} atau {ok:false, reason}. */
  AC.canAutoSubmit = function (settings, stats, now = Date.now()) {
    if (stats.sent >= settings.dailyLimit) {
      return { ok: false, reason: `Batas harian ${settings.dailyLimit} kiriman tercapai` };
    }
    const wait = Math.ceil((stats.lastSentAt + settings.minGapSec * 1000 - now) / 1000);
    if (wait > 0) return { ok: false, reason: `Terlalu cepat, tunggu ${wait} dtk lagi` };
    return { ok: true };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AC;
})(typeof globalThis !== "undefined" ? globalThis : self);
