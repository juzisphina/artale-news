"""Plain-language summary of one announcement via Google Gemini (free tier, key in GEMINI_API_KEY)."""
import json
import os
import urllib.error
import urllib.request

BASE = "https://generativelanguage.googleapis.com/v1beta/models/"
import re

# Google keeps retiring model names, so ask the key's model list and pick from it.
PREFERRED = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite",
             "gemini-4-hydrogen", "gemini-flash-lite-latest"]
SKIP = re.compile(r"image|tts|audio|live|embed|vision|exp|robotics|computer|gemma|learnlm|aqa|native", re.I)
MAX_TRIES = 5
_models = None


def _ver(name):
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", name)
    return float(m.group(1)) if m else 0.0


def pick_models(key):
    global _models
    if _models is not None:
        return _models
    req = urllib.request.Request(BASE.rstrip("/") + "?pageSize=1000", headers={"x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        names = [m["name"].removeprefix("models/") for m in data.get("models", [])
                 if "generateContent" in m.get("supportedGenerationMethods", [])]
    except Exception:
        names = list(PREFERRED)
    have = set(names)
    out = [os.environ["GEMINI_MODEL"]] if os.environ.get("GEMINI_MODEL") else []
    out += [n for n in PREFERRED if n in have]
    flash = [n for n in names if "flash" in n and not SKIP.search(n)]
    flash.sort(key=lambda n: ("preview" in n, "lite" in n, -_ver(n)))
    out += flash
    _models = list(dict.fromkeys(out))[:MAX_TRIES]
    return _models

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


def call_gemini(model, system, user, key):
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"},
    }).encode()
    req = urllib.request.Request(BASE + model + ":generateContent", data=body, headers={
        "x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{model} HTTP {e.code}: {e.read()[:300]!r}")
    try:
        content = json.loads(raw)["candidates"][0]["content"]["parts"][0]["text"].strip()
        if content.startswith("```"):
            content = content.strip("`").removeprefix("json").strip()
        return json.loads(content)
    except Exception:
        raise RuntimeError(f"{model} bad response: {raw[:400]!r}")


def summarize(title, text, n_images, key):
    user = f"公告標題：{title}\n圖片數量：{n_images}\n\n公告內容：\n{text[:12000]}"
    err = None
    for model in pick_models(key):
        try:
            out = call_gemini(model, SYSTEM, user, key)
            break
        except Exception as e:
            err = e
    else:
        raise err or RuntimeError("no Gemini model available for this key")
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
            "model": model}
