"""Fetch Artale TW announcements from artale.live and write data/news.json.

Standard library only (runs in GitHub Actions with no installs).
Only new or changed posts get their detail page fetched, so each run is light.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://artale.live"
LIST_URL = BASE + "/tw/news?page={page}"
UA = "Mozilla/5.0 (compatible; artale-news-digest/1.0; personal fan digest)"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "news.json")
LIST_PAGES = 2          # newest ~20 posts per run
KEEP = 120              # posts kept in the archive

ROW_RE = re.compile(
    r'<a href="/tw/news/([a-z0-9]+)" class="row">(.*?)</a>', re.S)
TAG_RE = re.compile(r'<span class="tag tag-([a-z-]+)">([^<]*)</span>')
TITLE_RE = re.compile(r'<span class="title">([^<]*)</span>')
DATE_RE = re.compile(r'<span class="date">([^<]*)</span>')
PUSH_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', re.S)
META_RE = re.compile(r'<div class="article-meta"><span>([^<]*)</span>')

BOILER = re.compile(r"^(謝謝。?|感謝。?)$|敬上$|持續全力以赴|再次感謝|敬請見諒。?$|^PC／行動裝置共通$")

CATEGORY = {  # site tag class -> our key
    "update": "update", "maint": "maintenance", "event": "event",
    "shop-bm": "shop", "sanction": "sanction", "guide": "guide",
    "probability": "probability",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # network hiccup: retry, then give up loudly
            if attempt == 2:
                raise
            print(f"retry {url}: {e}", file=sys.stderr)
            time.sleep(3)


def parse_list(page_html):
    posts = []
    for pid, inner in ROW_RE.findall(page_html):
        tags = TAG_RE.findall(inner)
        title = TITLE_RE.search(inner)
        date = DATE_RE.search(inner)
        if not title:
            continue
        cls, label = tags[0] if tags else ("update", "更新")
        posts.append({
            "id": pid,
            "title": html.unescape(title.group(1)).strip(),
            "date": date.group(1).strip() if date else "",
            "category": CATEGORY.get(cls, cls),
            "label": label,
            "pinned": "置頂" in inner,
            "url": f"{BASE}/tw/news/{pid}",
        })
    return posts


# ---------- article body (Lexical JSON inside the Next.js flight data) ----------

def lexical_doc(page_html):
    blob = "".join(json.loads('"' + s + '"') for s in PUSH_RE.findall(page_html))
    i = blob.find('{"root":')
    if i < 0:
        return None
    doc, _ = json.JSONDecoder().raw_decode(blob[i:])
    return doc.get("root")


def text_of(node):
    if node.get("type") == "text":
        return node.get("text", "")
    if node.get("type") == "linebreak":
        return " "
    return "".join(text_of(c) for c in node.get("children", []))


def outline(root):
    """Turn the article into a short outline: headings + bullet points."""
    blocks = []
    intro = []

    def add_list(node, depth=0):
        for li in node.get("children", []):
            nested = [c for c in li.get("children", []) if c.get("type") == "list"]
            own = "".join(text_of(c) for c in li.get("children", [])
                          if c.get("type") != "list").strip()
            if own and blocks:
                blocks[-1]["items"].append(("　" * depth) + own)
            for n in nested:
                add_list(n, depth + 1)

    for node in root.get("children", []):
        t = node.get("type")
        txt = text_of(node).strip()
        if t == "heading":
            blocks.append({"heading": txt.lstrip("■□◆◇●○▶▷★☆ ").strip(), "items": []})
        elif t == "list":
            if not blocks:
                blocks.append({"heading": "", "items": []})
            add_list(node)
        elif t == "table":
            if not blocks:
                blocks.append({"heading": "", "items": []})
            for row in node.get("children", []):
                cells = [text_of(c).strip() for c in row.get("children", [])]
                cells = [c for c in cells if c]
                if cells:
                    blocks[-1]["items"].append("｜".join(cells))
        elif t == "paragraph" and txt:
            if blocks:
                blocks[-1]["items"].append(txt)
            else:
                intro.append(txt)
    # trim: skip greeting lines, cap lengths so this stays a digest
    intro = [p for p in intro if "您好" not in p and "冒險家們，" not in p
             and not BOILER.search(p)][:3]
    for b in blocks:
        items = [i for i in b["items"] if not BOILER.search(i)]
        b["items"] = [i if len(i) <= 140 else i[:138] + "…" for i in items][:10]
    blocks = [b for b in blocks if b["heading"] or b["items"]][:8]
    return {"intro": intro, "sections": blocks}


def parse_detail(page_html):
    meta = META_RE.search(page_html)
    root = lexical_doc(page_html)
    out = {"posted": meta.group(1).strip() if meta else ""}
    out.update(outline(root) if root else {"intro": [], "sections": []})
    return out


def main():
    old = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            for p in json.load(f).get("posts", []):
                old[p["id"]] = p

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(os.path.join(ROOT, "data", "new.json"), "w", encoding="utf-8") as f:
        f.write("[]")  # reset; filled below only when something new appears

    fresh = []
    for page in range(1, LIST_PAGES + 1):
        fresh += parse_list(fetch(LIST_URL.format(page=page)))
    if not fresh:
        sys.exit("No posts parsed - site layout may have changed.")

    merged = dict(old)
    changed = 0
    for p in fresh:
        prev = old.get(p["id"])
        if prev and prev["title"] == p["title"] and prev.get("sections") is not None:
            prev.update({k: p[k] for k in ("pinned", "label", "category", "date")})
            continue
        try:
            p.update(parse_detail(fetch(p["url"])))
        except Exception as e:
            print(f"detail failed {p['id']}: {e}", file=sys.stderr)
            p.update({"posted": "", "intro": [], "sections": None})
        p["first_seen"] = (prev or {}).get("first_seen") or time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        merged[p["id"]] = p
        changed += 1
        time.sleep(1)  # be polite

    posts = sorted(merged.values(),
                   key=lambda p: (p.get("posted") or p["date"]), reverse=True)[:KEEP]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    data = {"source": BASE + "/tw/news", "posts": posts}
    if old and changed == 0:
        print("no new posts")
        return
    data["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    write_feed(posts)
    # posts never seen before (not on the very first run) -> notify list for the workflow
    brand_new = [p for p in fresh if p["id"] not in old] if old else []
    with open(os.path.join(ROOT, "data", "new.json"), "w", encoding="utf-8") as f:
        json.dump([merged[p["id"]] for p in brand_new], f, ensure_ascii=False, indent=1)
    print(f"{changed} new/changed, {len(brand_new)} brand new, {len(posts)} total")


def write_feed(posts):
    from xml.sax.saxutils import escape
    items = []
    for p in posts[:30]:
        lines = []
        for s in p.get("sections") or []:
            if s["heading"]:
                lines.append("■ " + s["heading"])
            lines += ["・" + i for i in s["items"][:5]]
        items.append(
            f"<item><title>{escape('【' + p['label'] + '】' + p['title'])}</title>"
            f"<link>{escape(p['url'])}</link><guid>{escape(p['url'])}</guid>"
            f"<pubDate>{escape(p.get('posted') or p['date'])}</pubDate>"
            f"<description>{escape(chr(10).join(lines) or p['title'])}</description></item>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
           "<title>Artale 台服公告小整理</title>"
           "<link>https://juzisphina.github.io/artale-news/</link>"
           "<description>Artale 台服官方公告重點整理（非官方）</description>"
           + "".join(items) + "</channel></rss>")
    with open(os.path.join(ROOT, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(xml)


if __name__ == "__main__":
    main()
