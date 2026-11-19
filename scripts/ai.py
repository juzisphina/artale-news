"""Plain-language summary of one announcement via GitHub Models (free, uses the Actions token)."""
import json
import os
import urllib.request

URL = "https://models.github.ai/inference/chat/completions"
MODEL = os.environ.get("AI_MODEL", "openai/gpt-4.1-mini")

SYSTEM = """你是 Artale 台服的老玩家，幫朋友把官方公告「翻成人話」。
規則：
- 一律使用台灣繁體中文與台灣玩家用語（例：活動、維修→維護、伺服器、楓幣、道具、副本）。
- 口吻像朋友在 LINE 上講重點：短句、直白、輕鬆，可以用一點語氣詞，但不要浮誇、不要亂加沒寫的資訊。
- 只根據公告內容，日期、數字、名稱都要照抄正確；不確定就不要寫。
- 抓「對玩家有什麼影響、要做什麼、什麼時候截止」。
- 公告裡的圖片以 [圖N] 標示，請為每個重點挑最相關的一張（沒有就填 null）。

只輸出 JSON，格式：
{
 "tldr": "一句話總結（25 字內）",
 "points": [
   {"emoji": "一個 emoji", "title": "8~14 字小標", "text": "1~2 句白話說明", "img": 數字或 null}
 ],
 "todo": ["玩家該做的事（可空陣列，最多 3 項，含日期）"]
}
points 3~5 個，依重要性排序。維護公告的第一點一定要寫維護時間。"""


def summarize(title, text, n_images, token):
    user = f"公告標題：{title}\n圖片數量：{n_images}\n\n公告內容：\n{text[:9000]}"
    body = json.dumps({
        "model": MODEL,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=90) as r:
        res = json.load(r)
    out = json.loads(res["choices"][0]["message"]["content"])
    # sanitize
    pts = []
    for p in (out.get("points") or [])[:5]:
        img = p.get("img")
        img = img if isinstance(img, int) and 1 <= img <= n_images else None
        pts.append({"emoji": str(p.get("emoji") or "🍊")[:4],
                    "title": str(p.get("title") or "")[:30],
                    "text": str(p.get("text") or "")[:200],
                    "img": img})
    return {"tldr": str(out.get("tldr") or "")[:60],
            "points": pts,
            "todo": [str(t)[:80] for t in (out.get("todo") or [])][:3],
            "model": MODEL}
