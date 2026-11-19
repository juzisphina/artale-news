"""Open one GitHub issue per brand-new announcement (data/new.json).

GitHub then notifies the repo owner (email / mobile app), which works as a free push alert.
Needs the `gh` CLI and GH_TOKEN (provided inside GitHub Actions).
"""
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://juzisphina.github.io/artale-news/"
SKIP = {"sanction"}  # weekly ban lists are noise for alerts


def body(p):
    lines = [f"**{p['label']}** ・ {p.get('posted') or p['date']}", ""]
    if p.get("cover"):
        lines += [f"<img src=\"{p['cover']}\" width=\"480\">", ""]
    a = p.get("ai")
    if a and a.get("points"):
        lines += [f"> 💬 {a['tldr']}", ""]
        lines += [f"- {x['emoji']} **{x['title']}**：{x['text']}" for x in a["points"]]
        if a.get("todo"):
            lines += ["", "**✅ 記得做**"] + [f"- [ ] {t}" for t in a["todo"]]
        lines += ["", f"🔗 [官方原文]({p['url']}) ・ 🍊 [公告小整理]({SITE})"]
        return "\n".join(lines)
    lines += p.get("intro") or []
    for s in p.get("sections") or []:
        if s["heading"]:
            lines += ["", f"### {s['heading']}"]
        lines += [f"- {i}" for i in s["items"]]
    lines += ["", f"🔗 [官方原文]({p['url']}) ・ 🍊 [公告小整理]({SITE})"]
    return "\n".join(lines)


def main():
    path = os.path.join(ROOT, "data", "new.json")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        posts = [p for p in json.load(f) if p["category"] not in SKIP]
    for p in reversed(posts):  # oldest first
        title = f"【{p['label']}】{p['title']}"
        subprocess.run(["gh", "issue", "create", "--title", title, "--body", body(p)], check=True)
        print("issue:", title)


if __name__ == "__main__":
    main()
