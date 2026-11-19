# 🍊 Artale 台服公告小整理

👉 **https://juzisphina.github.io/artale-news/**

自動整理 [Artale 台服官方公告](https://artale.live/tw/news) 的重點：改版更新、維護時間、活動、購物商場。

- 每 30 分鐘自動同步一次（GitHub Actions）
- 有新公告時會自動開一個 Issue，GitHub 會通知你（Email / App）
- 每篇公告有「說人話重點」＋官方配圖；新公告由 Gemini 自動整理（需在 repo Secrets 設定 `GEMINI_API_KEY`）
- 也可以用 RSS 訂閱：[feed.xml](https://juzisphina.github.io/artale-news/feed.xml)

> 非官方粉絲整理，內容以官方公告為準。

## How it works

`scripts/scrape.py` (Python standard library only) reads the public news list, pulls each new post's
text and keeps a short outline (headings + bullet points) in `data/news.json`. The static page
(`index.html`, `app.js`, `style.css`) renders that file. `scripts/notify.py` opens one issue per
brand-new post.

Run locally: `python scripts/scrape.py` then `python -m http.server 8780`.
