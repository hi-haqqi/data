"""HTML parsing. Semua CSS selector ada di SELECTORS agar mudah diperbarui
saat Dribbble mengubah markup (selector di sini belum diverifikasi terhadap situs live)."""
import re
from bs4 import BeautifulSoup

SELECTORS = {
    "shot": "li[data-thumbnail-target], li.shot-thumbnail, div.shot-thumbnail",
    "link": "a[href*='/shots/']",
    "title": ".shot-title, .dribbble-link img[alt], a.shot-title",
    "designer": ".display-name, .user-information .name, a.url .display-name",
    "designer_link": "a.url[href], .user-information a[href]",
    "likes": ".js-shot-likes-count, .likes-count, [class*='likes']",
    "views": ".js-shot-views-count, .views-count, [class*='views']",
    "saves": ".js-shot-saves-count, [class*='saves']",
    "badge": ".badge, .badge-pro, .badge-team, [class*='badge']",
    "available": "[class*='available'], a[href*='/hiring'], [data-available-for-work]",
    "tag": "a[href*='/tags/']",
}


def to_int(text):
    """'1.2k' -> 1200, '3,456' -> 3456, '2m' -> 2_000_000."""
    if not text:
        return 0
    m = re.search(r"([\d.,]+)\s*([kKmM]?)", text.strip())
    if not m:
        return 0
    num = float(m.group(1).replace(",", ""))
    return int(num * {"": 1, "k": 1_000, "m": 1_000_000}[m.group(2).lower()])


def _text(node, key):
    el = node.select_one(SELECTORS[key])
    if not el:
        return ""
    return (el.get("alt") or el.get_text(" ", strip=True)).strip()


def parse_listing(html):
    """Ambil daftar shot dari halaman listing (popular / search / tag)."""
    soup = BeautifulSoup(html, "lxml")
    shots = []
    for node in soup.select(SELECTORS["shot"]):
        link = node.select_one(SELECTORS["link"])
        if not link:
            continue
        m = re.search(r"/shots/(\d+)", link["href"])
        if not m:
            continue
        dl = node.select_one(SELECTORS["designer_link"])
        badges = [b.get_text(strip=True).lower() for b in node.select(SELECTORS["badge"])]
        shots.append({
            "shot_id": m.group(1),
            "url": link["href"],
            "title": _text(node, "title"),
            "designer": _text(node, "designer"),
            "designer_url": dl["href"] if dl else "",
            "likes": to_int(_text(node, "likes")),
            "views": to_int(_text(node, "views")),
            "saves": to_int(_text(node, "saves")),
            "is_pro": int("pro" in badges),
            "is_team": int("team" in badges),
            "available_for_work": int(node.select_one(SELECTORS["available"]) is not None),
            "tags": sorted({t.get_text(strip=True).lower() for t in node.select(SELECTORS["tag"])}),
        })
    return shots


def parse_shot(html):
    """Ambil tag & status 'available for work' dari halaman detail shot."""
    soup = BeautifulSoup(html, "lxml")
    return {
        "tags": sorted({t.get_text(strip=True).lower() for t in soup.select(SELECTORS["tag"])}),
        "available_for_work": int(soup.select_one(SELECTORS["available"]) is not None),
    }
