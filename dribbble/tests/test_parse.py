import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from parse import parse_listing, to_int
import analyze, pandas as pd

HTML = """<ul>
<li class="shot-thumbnail"><a href="/shots/123-dash"><img alt="Dash"></a>
 <span class="display-name">Ann</span><a class="url" href="/ann"></a>
 <span class="js-shot-likes-count">1.2k</span><span class="js-shot-views-count">10,000</span>
 <span class="badge">Pro</span><a href="/tags/saas">SaaS</a><a href="/tags/dashboard">dashboard</a></li>
<li class="shot-thumbnail"><a href="/shots/456-x"></a><span class="display-name">Bob</span>
 <span class="js-shot-likes-count">50</span></li></ul>"""


def test_to_int():
    assert to_int("1.2k") == 1200 and to_int("3,456") == 3456 and to_int("") == 0


def test_listing():
    s = parse_listing(HTML)
    assert [x["shot_id"] for x in s] == ["123", "456"]
    assert s[0]["likes"] == 1200 and s[0]["views"] == 10000 and s[0]["is_pro"] == 1
    assert s[0]["tags"] == ["dashboard", "saas"]


def test_analyze():
    rows = parse_listing(HTML) * 3
    for i, r in enumerate(rows):
        r = dict(r); r["shot_id"] = str(i); rows[i] = r
    df = pd.DataFrame(rows)
    df["engagement"] = df.likes; df["eng_rate"] = df.likes / df.views.replace(0, float("nan"))
    assert not analyze.by_tag(df, 1).empty
