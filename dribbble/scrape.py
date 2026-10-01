"""Scraper sopan: patuh robots.txt, rate limit, cache ke disk, berhenti saat diblokir."""
import argparse, hashlib, json, sys, time, urllib.robotparser
from pathlib import Path
import requests
from parse import parse_listing, parse_shot

BASE = "https://dribbble.com"
UA = "Mozilla/5.0 (research script; contact: set-your-email)"


class Fetcher:
    def __init__(self, delay=3.0, cache_dir="cache"):
        self.delay, self.cache = delay, Path(cache_dir)
        self.cache.mkdir(exist_ok=True)
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        self.robots = urllib.robotparser.RobotFileParser(BASE + "/robots.txt")
        try:
            self.robots.read()
        except Exception:
            self.robots = None

    def allowed(self, url):
        return self.robots is None or self.robots.can_fetch(UA, url)

    def get(self, url):
        f = self.cache / (hashlib.md5(url.encode()).hexdigest() + ".html")
        if f.exists():
            return f.read_text()
        if not self.allowed(url):
            print(f"robots.txt melarang: {url}", file=sys.stderr)
            return None
        time.sleep(self.delay)
        r = self.s.get(url, timeout=30)
        if r.status_code in (403, 429):
            raise SystemExit(f"Diblokir ({r.status_code}) di {url}. Berhenti; jangan bypass.")
        if r.status_code != 200:
            return None
        f.write_text(r.text)
        return r.text


def crawl(fetcher, path, pages, details=False):
    """path contoh: /shots/popular, /shots/popular/web-design, /tags/saas"""
    rows, seen = [], set()
    for p in range(1, pages + 1):
        html = fetcher.get(f"{BASE}{path}?page={p}")
        if not html:
            break
        shots = [s for s in parse_listing(html) if s["shot_id"] not in seen]
        if not shots:
            break
        for s in shots:
            seen.add(s["shot_id"])
            s["source"], s["page"] = path, p
            if details:
                h = fetcher.get(BASE + s["url"] if s["url"].startswith("/") else s["url"])
                if h:
                    d = parse_shot(h)
                    s["tags"] = sorted(set(s["tags"]) | set(d["tags"]))
                    s["available_for_work"] |= d["available_for_work"]
            rows.append(s)
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="mis. /shots/popular /tags/saas")
    ap.add_argument("--pages", type=int, default=5)
    ap.add_argument("--details", action="store_true", help="ambil halaman tiap shot (lebih lambat)")
    ap.add_argument("--delay", type=float, default=3.0)
    ap.add_argument("--out", default="shots.json")
    a = ap.parse_args()
    f = Fetcher(a.delay)
    data = [r for p in a.paths for r in crawl(f, p, a.pages, a.details)]
    Path(a.out).write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f"{len(data)} shot -> {a.out}")
