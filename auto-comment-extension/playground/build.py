"""Gabungkan kode ekstensi asli ke playground/template.html -> playground/index.html.
Satu-satunya perubahan pada content.js: platform dibaca dinamis dari window.__acHost
(tab di playground), bukan dari location.hostname."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIG = "const platform = AC.detectPlatform(location.hostname);"
DYN = ("const platform = new Proxy({}, { get: (_, k) => "
       "AC.detectPlatform(window.__acHost || location.hostname)[k] });")


def read(name):
    s = (ROOT / name).read_text()
    assert "</script" not in s.lower(), name
    return s


content = read("content.js")
assert ORIG in content, "baris deteksi platform di content.js berubah; perbarui build.py"
html = (ROOT / "playground/template.html").read_text()
html = (html.replace("/*LIB*/", read("lib.js"))
            .replace("/*PLATFORMS*/", read("platforms.js"))
            .replace("/*CONTENT*/", content.replace(ORIG, DYN)))
(ROOT / "playground/index.html").write_text(html)
print("playground/index.html", len(html), "bytes")
