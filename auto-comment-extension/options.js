const $ = (id) => document.getElementById(id);
const AI_FIELDS = ["apiKey", "model", "language", "tone", "maxWords", "persona", "sendImage"];

for (const [id, label] of Object.entries(AC.AI_MODELS)) {
  $("model").add(new Option(label, id));
}

function status(msg, err) {
  $("status").textContent = msg;
  $("status").className = err ? "err" : "";
  if (!err) setTimeout(() => ($("status").textContent = ""), 2500);
}

function render(settings) {
  $("templates").innerHTML = "";
  for (const [group, label] of Object.entries(AC.TEMPLATE_GROUPS)) {
    const wrap = document.createElement("div");
    wrap.className = "tpl";
    wrap.innerHTML = `<b></b><textarea spellcheck="false"></textarea>`;
    wrap.querySelector("b").textContent = label;
    const ta = wrap.querySelector("textarea");
    ta.dataset.group = group;
    ta.value = (settings.templates[group] || []).join("\n");
    $("templates").appendChild(wrap);
  }
  for (const k of AI_FIELDS) {
    const el = $(k);
    if (el.type === "checkbox") el.checked = settings.ai[k];
    else el.value = settings.ai[k];
  }
  $("autoSubmit").checked = settings.autoSubmit;
  $("minGapSec").value = settings.minGapSec;
  $("dailyLimit").value = settings.dailyLimit;
}

function collect(base) {
  const templates = {};
  for (const ta of document.querySelectorAll("#templates textarea")) {
    templates[ta.dataset.group] = AC.parseTemplateText(ta.value);
  }
  const ai = { ...base.ai };
  for (const k of AI_FIELDS) {
    const el = $(k);
    ai[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) || base.ai[k] : el.value.trim();
  }
  return {
    ...base,
    templates,
    ai,
    autoSubmit: $("autoSubmit").checked,
    minGapSec: Math.max(0, Number($("minGapSec").value) || 0),
    dailyLimit: Math.max(1, Number($("dailyLimit").value) || AC.DEFAULTS.dailyLimit),
  };
}

async function current() {
  return AC.mergeSettings((await chrome.storage.local.get("settings")).settings);
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ settings: collect(await current()) });
  status("Tersimpan ✓");
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Kembalikan semua template & pengaturan ke default? API key tetap disimpan.")) return;
  const cur = await current();
  const fresh = AC.mergeSettings({ ai: { ...AC.DEFAULTS.ai, apiKey: cur.ai.apiKey } });
  await chrome.storage.local.set({ settings: fresh });
  render(fresh);
  status("Default dikembalikan ✓");
});

$("testAi").addEventListener("click", async () => {
  const settings = collect(await current());
  await chrome.storage.local.set({ settings });
  $("aiOut").innerHTML = "<li>Membuat saran…</li>";
  const ctx = {
    platform: "dribbble",
    platformName: "Dribbble",
    author: "Jane Doe",
    title: "Fintech Mobile App Dashboard by Jane Doe on Dribbble",
    text: "Fintech Mobile App Dashboard. Exploring a calm, card-based layout for tracking monthly spending, with soft gradients and a bold balance chart.",
    image: "",
  };
  const res = await chrome.runtime.sendMessage({ type: "ai-generate", ctx });
  $("aiOut").innerHTML = "";
  const items = res && res.ok ? res.suggestions : ["Gagal: " + ((res && res.error) || "tidak ada respons")];
  for (const t of items) {
    const li = document.createElement("li");
    li.textContent = t;
    $("aiOut").appendChild(li);
  }
});

current().then(render);
