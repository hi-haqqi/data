const test = require("node:test");
const assert = require("node:assert/strict");
const AC = require("../lib.js");
require("../platforms.js");

const first = () => 0; // rand() selalu pilih opsi pertama
const last = () => 0.999;

test("spintax memilih satu opsi, termasuk nested", () => {
  assert.equal(AC.spin("{Keren|Mantap} {banget|sekali}", first), "Keren banget");
  assert.equal(AC.spin("{Keren|Mantap} {banget|sekali}", last), "Mantap sekali");
  assert.equal(AC.spin("{a {x|y}|b}", first), "a x");
});

test("variabel diisi, termasuk di dalam spintax", () => {
  const vars = { firstName: "Jane", name: "Jane Doe", platform: "Dribbble" };
  assert.equal(AC.renderTemplate("Great work{, {firstName}|}!", vars, first), "Great work, Jane!");
  assert.equal(AC.renderTemplate("Great work{, {firstName}|}!", vars, last), "Great work!");
  assert.equal(AC.renderTemplate("Hi {name} from {platform}", vars), "Hi Jane Doe from Dribbble");
});

test("variabel kosong dibuang rapi", () => {
  assert.equal(AC.renderTemplate("Great work {firstName}!", {}), "Great work!");
  assert.equal(AC.renderTemplate("Great work, {firstName}!", {}), "Great work!");
  assert.equal(AC.renderTemplate("{firstName}, this is great", {}), "This is great");
  assert.equal(AC.renderTemplate("Great work{, {firstName}|}!", {}, first), "Great work!");
});

test("variabel tak dikenal dibiarkan, nilai tidak bisa menyuntik spintax", () => {
  assert.equal(AC.renderTemplate("Hi {foo}", {}), "Hi {foo}");
  assert.equal(AC.renderTemplate("Hi {name}", { name: "{a|b}" }), "Hi ab");
});

test("pickTemplate menghindari template yang baru dipakai", () => {
  const list = ["A", "B", "C"];
  for (let i = 0; i < 20; i++) {
    assert.equal(AC.pickTemplate(list, ["A", "B"], Math.random), "C");
  }
  assert.ok(list.includes(AC.pickTemplate(list, list)));
  assert.equal(AC.pickTemplate([], []), null);
  assert.equal(AC.pickTemplate(["", "  "], []), null);
});

test("cleanAiLines membuang nomor, bullet, kutip, dan baris pengantar", () => {
  const raw = 'Here are 3 options:\n1. "Love the palette!"\n- Clean layout 👌\n\n(3) Great hierarchy\n';
  assert.deepEqual(AC.cleanAiLines(raw), ["Love the palette!", "Clean layout 👌", "Great hierarchy"]);
});

test("firstName & cleanName", () => {
  assert.equal(AC.firstName("Jane Doe"), "Jane");
  assert.equal(AC.firstName("@jane_doe"), "jane_doe");
  assert.equal(AC.firstName(""), "");
  assert.equal(AC.cleanName("Jane Doe\n• 2nd\nDesigner"), "Jane Doe");
  assert.equal(AC.cleanName("x".repeat(80)), "");
});

test("detectPlatform mengenali domain & subdomain", () => {
  assert.equal(AC.detectPlatform("dribbble.com").key, "dribbble");
  assert.equal(AC.detectPlatform("www.linkedin.com").key, "linkedin");
  assert.equal(AC.detectPlatform("mobile.twitter.com").key, "twitter");
  assert.equal(AC.detectPlatform("x.com").key, "twitter");
  assert.equal(AC.detectPlatform("www.instagram.com").key, "instagram");
  assert.equal(AC.detectPlatform("notx.com").key, "general");
  assert.equal(AC.detectPlatform("example.org").key, "general");
});

test("setiap platform memakai grup template yang ada", () => {
  for (const p of Object.values(AC.PLATFORMS)) {
    assert.ok(AC.DEFAULTS.templates[p.group], `${p.name} -> ${p.group}`);
  }
});

test("statistik reset saat ganti hari, lastSentAt tetap", () => {
  const s = AC.freshStats({ date: "2026-01-01", filled: 5, sent: 3, lastSentAt: 123 }, "2026-01-02");
  assert.deepEqual(s, { date: "2026-01-02", filled: 0, sent: 0, lastSentAt: 123 });
  const same = { date: "2026-01-02", filled: 1, sent: 1, lastSentAt: 9 };
  assert.equal(AC.freshStats(same, "2026-01-02"), same);
});

test("canAutoSubmit menegakkan jeda & batas harian", () => {
  const settings = { minGapSec: 20, dailyLimit: 2 };
  const now = 1_000_000;
  assert.equal(AC.canAutoSubmit(settings, { sent: 0, lastSentAt: 0 }, now).ok, true);
  const tooSoon = AC.canAutoSubmit(settings, { sent: 1, lastSentAt: now - 5000 }, now);
  assert.equal(tooSoon.ok, false);
  assert.match(tooSoon.reason, /15 dtk/);
  assert.equal(AC.canAutoSubmit(settings, { sent: 2, lastSentAt: 0 }, now).ok, false);
});

test("mergeSettings mengisi field baru tanpa menimpa milik pengguna", () => {
  const m = AC.mergeSettings({ autoSubmit: true, templates: { dribbble: ["X"] }, ai: { apiKey: "k" } });
  assert.equal(m.autoSubmit, true);
  assert.deepEqual(m.templates.dribbble, ["X"]);
  assert.deepEqual(m.templates.linkedin, AC.DEFAULTS.templates.linkedin);
  assert.equal(m.ai.apiKey, "k");
  assert.equal(m.ai.model, "claude-opus-5-5");
});
