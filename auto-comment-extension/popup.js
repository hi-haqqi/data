const $ = (id) => document.getElementById(id);
const TOGGLES = ["enabled", "showButton", "autoSubmit"];

(async function init() {
  const { settings: saved, stats } = await chrome.storage.local.get(["settings", "stats"]);
  const settings = AC.mergeSettings(saved);
  for (const k of TOGGLES) {
    $(k).checked = settings[k];
    $(k).addEventListener("change", async () => {
      const { settings: cur } = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...AC.mergeSettings(cur), [k]: $(k).checked } });
    });
  }
  const s = AC.freshStats(stats);
  $("filled").textContent = s.filled;
  $("sent").textContent = `${s.sent}/${settings.dailyLimit}`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try {
    host = new URL(tab.url).hostname;
  } catch {}
  const p = AC.detectPlatform(host);
  if (p.key !== "general") {
    $("site").textContent = `${p.name}: didukung, aktif otomatis.`;
  } else if (/^https?:/.test(tab.url || "")) {
    $("site").textContent = `${host}: tidak ada di daftar. Klik "Aktifkan di tab ini".`;
    $("inject").hidden = false;
  } else {
    $("site").textContent = "Halaman ini tidak bisa dipakai.";
  }

  $("inject").addEventListener("click", async () => {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lib.js", "platforms.js", "content.js"] });
      $("site").textContent = `${host}: aktif sampai halaman dimuat ulang. Klik kotak komentar.`;
      $("inject").hidden = true;
    } catch (e) {
      $("site").textContent = "Gagal: " + e.message;
    }
  });
  $("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
})();
