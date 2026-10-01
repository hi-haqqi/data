/* End-to-end: memuat ekstensi di Chromium, menyajikan halaman tiruan di domain asli
   (via page.route, tanpa jaringan), lalu menguji tombol 💬, panel, isi & kirim otomatis.
   Jalankan: npm run test:e2e  (butuh paket playwright + Chromium) */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const EXT = path.join(__dirname, "..");
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

let context, sw;

test.before(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ac-e2e-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium", // headless "baru" yang mendukung ekstensi
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  await context.route("https://dribbble.com/**", (r) => r.fulfill({ contentType: "text/html", body: fixture("dribbble.html") }));
  await context.route("https://x.com/**", (r) => r.fulfill({ contentType: "text/html", body: fixture("x.html") }));
  // tutup tab options yang dibuka saat instalasi
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close();
});

test.after(async () => {
  await context?.close();
});

async function setSettings(patch) {
  await sw.evaluate(async (patch) => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...AC.mergeSettings(settings), ...patch }, stats: null, recent: [] });
  }, patch);
}

const ui = (page, sel) => page.locator(`#ac-root >> css=${sel}`);

async function waitFor(page, fn, msg) {
  await page.waitForFunction(fn, null, { timeout: 5000 }).catch(() => assert.fail(msg));
}

test("Dribbble: tombol muncul, panel berisi template dengan nama, isi textarea ala React", async () => {
  await setSettings({ autoSubmit: false });
  const page = await context.newPage();
  await page.goto("https://dribbble.com/shots/123-fintech");
  await page.click("#c");
  await ui(page, ".btn").waitFor({ state: "visible" });
  await ui(page, ".btn").click();
  await ui(page, ".panel").waitFor({ state: "visible" });
  assert.match(await ui(page, ".panel b").textContent(), /Dribbble · Jane Doe/);
  const first = ui(page, ".tpls .item").first();
  const text = await first.textContent();
  assert.doesNotMatch(text, /[{}|]/, "spintax/variabel harus sudah dirender");
  await first.click();
  assert.equal(await page.inputValue("#c"), text);
  assert.equal(await page.evaluate(() => window.state), text, "state 'React' harus ikut berubah");
  assert.equal(await page.evaluate(() => document.activeElement.id), "c", "fokus tetap di kotak komentar");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.submitted), undefined, "tidak boleh terkirim saat autoSubmit OFF");
  await page.close();
});

test("Dribbble: kirim otomatis lalu ditahan oleh jeda minimal", async () => {
  await setSettings({ autoSubmit: true, minGapSec: 60 });
  const page = await context.newPage();
  await page.goto("https://dribbble.com/shots/123-fintech");
  await page.click("#c");
  await ui(page, ".btn").click();
  await ui(page, '[data-act="random"]').click();
  await waitFor(page, () => window.submitted, "komentar harus terkirim otomatis");
  const sent = await page.evaluate(() => window.submitted);
  assert.ok(sent.length > 3);
  await ui(page, ".toast").filter({ hasText: "terkirim" }).waitFor();

  // kiriman kedua dalam 60 dtk: hanya diisi, tidak dikirim
  await page.evaluate(() => (window.submitted = undefined));
  await ui(page, ".btn").click();
  await ui(page, '[data-act="random"]').click();
  await ui(page, ".toast").filter({ hasText: "Terlalu cepat" }).waitFor();
  assert.equal(await page.evaluate(() => window.submitted), undefined);
  const stats = await sw.evaluate(() => chrome.storage.local.get("stats").then((r) => r.stats));
  assert.equal(stats.sent, 1);
  assert.equal(stats.filled, 2);
  await page.close();
});

test("X: contenteditable diisi tanpa menghapus @mention, tombol Reply diklik", async () => {
  await setSettings({ autoSubmit: true, minGapSec: 0 });
  const page = await context.newPage();
  await page.goto("https://x.com/jane/status/1");
  await page.click("#ed");
  await ui(page, ".btn").click();
  assert.match(await ui(page, ".panel b").textContent(), /X \/ Twitter · Jane Doe/);
  const text = await ui(page, ".tpls .item").first().textContent();
  await ui(page, ".tpls .item").first().click();
  await waitFor(page, () => window.submitted, "Reply harus diklik setelah tombol aktif");
  const sent = await page.evaluate(() => window.submitted);
  assert.ok(sent.startsWith("@jane"), `mention hilang: ${sent}`);
  assert.ok(sent.includes(text), `teks tidak masuk: ${sent}`);
  await page.close();
});

test("Tanpa API key, tombol AI disembunyikan", async () => {
  await setSettings({ autoSubmit: false });
  const page = await context.newPage();
  await page.goto("https://x.com/jane/status/1");
  await page.click("#ed");
  await ui(page, ".btn").click();
  assert.equal(await ui(page, '[data-act="ai"]').isVisible(), false, "tombol AI disembunyikan tanpa key");
  await page.close();
});
