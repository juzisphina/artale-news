(function () {
  "use strict";

  var CATS = [
    { key: "all", label: "全部" },
    { key: "update", label: "更新" },
    { key: "maintenance", label: "維護" },
    { key: "event", label: "活動" },
    { key: "shop", label: "購物商場" },
    { key: "sanction", label: "制裁" }
  ];
  var COLOR = { update: "--c-update", maintenance: "--c-maintenance", event: "--c-event", shop: "--c-shop", sanction: "--c-sanction" };
  var state = { cat: "all", q: "", posts: [], page: 1 };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function catVar(p) { return "var(" + (COLOR[p.category] || "--c-other") + ")"; }
  function isNew(p) {
    var d = (p.posted || p.date || "").slice(0, 10).replace(/\./g, "-");
    var t = Date.parse(d);
    return t && Date.now() - t < 3 * 86400000;
  }
  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    } catch (e) { return iso; }
  }

  function renderChips() {
    var counts = {};
    state.posts.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
    $("chips").innerHTML = CATS.map(function (c) {
      var n = c.key === "all" ? state.posts.length : (counts[c.key] || 0);
      return '<button class="chip" role="tab" data-cat="' + c.key + '" aria-selected="' + (state.cat === c.key) + '">' +
        esc(c.label) + '<span class="n">' + n + "</span></button>";
    }).join("");
  }

  function img(src, cls) {
    return src ? '<img class="' + (cls || "pic") + '" src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : "";
  }

  function tableHtml(rows) {
    var head = rows[0], rest = rows.slice(1);
    return '<div class="tbl"><table><thead><tr>' + head.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rest.map(function (r) {
        return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function sectionsHtml(p) {
    var h = "";
    if (p.intro && p.intro.length) h += '<p class="intro">' + p.intro.map(esc).join("<br>") + "</p>";
    (p.sections || []).forEach(function (s) {
      if (s.heading) h += "<h3>" + esc(s.heading) + "</h3>";
      if (s.items.length) h += "<ul>" + s.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
      (s.tables || []).forEach(function (t) { h += tableHtml(t); });
      (s.images || []).forEach(function (u) { h += img(u); });
    });
    return h;
  }

  function aiHtml(p) {
    var a = p.ai, used = {};
    if (!a || !a.points || !a.points.length) return "";
    var h = '<div class="plain"><p class="plain-h">🍊 說人話重點</p>';
    a.points.forEach(function (pt) {
      var src = pt.img && p.images ? p.images[pt.img - 1] : "";
      if (src && used[src]) src = "";
      if (src) used[src] = 1;
      h += '<div class="pt"><p><span class="em">' + esc(pt.emoji) + "</span><b>" + esc(pt.title) + "</b></p><p>" + esc(pt.text) + "</p>" + img(src) + "</div>";
    });
    if (a.todo && a.todo.length) {
      h += '<div class="todo"><p class="plain-h">✅ 記得做</p><ul>' + a.todo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    }
    return h + '<p class="ai-note">白話整理僅供參考，日期與細節請以官方原文為準</p></div>';
  }

  // ---------- bring-your-own Gemini key (stored only in this browser) ----------
  var KEY_STORE = "artale.geminiKey", CACHE = "artale.ai.";
  var MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  var busy = {};
  function store(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function getKey() { return (load(KEY_STORE) || "").trim(); }
  function canAi(p) { return p.category !== "sanction" && p.sections && p.sections.length; }

  var SYSTEM = "你是 Artale 台服的老玩家，幫朋友把官方公告「翻成人話」。\n規則：\n" +
    "- 一律使用台灣繁體中文與台灣玩家用語。\n" +
    "- 口吻像朋友在 LINE 上講重點：短句、直白、輕鬆，不浮誇、不亂加沒寫的資訊。\n" +
    "- 只根據公告內容，日期、數字、名稱都要照抄正確；不確定就不要寫。\n" +
    "- 抓「對玩家有什麼影響、要做什麼、什麼時候截止」。\n" +
    "- 公告裡的圖片以 [圖N] 標示，請為每個重點挑最相關的一張（沒有就填 null）。\n\n" +
    '只輸出 JSON：{"tldr":"一句話總結（25 字內）","points":[{"emoji":"一個 emoji","title":"8~14 字小標","text":"1~2 句白話說明","img":數字或null}],"todo":["玩家該做的事，最多 3 項，含日期"]}\n' +
    "points 3~5 個，依重要性排序。維護公告的第一點一定要寫維護時間。";

  function postText(p) {
    var lines = [].concat(p.intro || []);
    (p.sections || []).forEach(function (s) {
      if (s.heading) lines.push("\n## " + s.heading);
      s.items.forEach(function (i) { lines.push("- " + i); });
      (s.tables || []).forEach(function (t) { t.forEach(function (r) { lines.push("| " + r.join(" | ") + " |"); }); });
      (s.images || []).forEach(function (u) { var n = (p.images || []).indexOf(u); if (n >= 0) lines.push("[圖" + (n + 1) + "]"); });
    });
    return lines.join("\n").slice(0, 12000);
  }

  function callGemini(model, key, p) {
    return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: "公告標題：" + p.title + "\n圖片數量：" + (p.images || []).length + "\n\n公告內容：\n" + postText(p) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var msg = (j.error && j.error.message) || "";
          var e = new Error(msg); e.status = r.status; throw e;
        }
        var txt = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text || "";
        txt = txt.trim().replace(/^```(json)?/, "").replace(/```$/, "");
        return JSON.parse(txt);
      });
    });
  }

  function clean(out, p) {
    var n = (p.images || []).length;
    return {
      tldr: String(out.tldr || "").slice(0, 60),
      points: (out.points || []).slice(0, 5).map(function (x) {
        var i = typeof x.img === "number" && x.img >= 1 && x.img <= n ? x.img : null;
        return { emoji: String(x.emoji || "🍊").slice(0, 4), title: String(x.title || "").slice(0, 30), text: String(x.text || "").slice(0, 200), img: i };
      }),
      todo: (out.todo || []).slice(0, 3).map(function (t) { return String(t).slice(0, 80); }),
      model: "gemini（你的金鑰）"
    };
  }

  function errText(e) {
    var m = (e && e.message) || "";
    if (e && (e.status === 400 && /API key/i.test(m))) return "金鑰無效，請到「✨ AI 白話設定」檢查是否貼對。";
    if (e && e.status === 429) return "AI 額度暫時用完了，過一會兒再試。";
    if (e && e.status === 403) return "這把金鑰沒有權限使用 Gemini（可能是專案沒開免費額度）。";
    if (e instanceof TypeError) return "連不上 Google AI，請確認網路後再試。";
    return "整理失敗：" + (m.slice(0, 120) || "未知錯誤");
  }

  function generate(p) {
    var key = getKey();
    if (!key || busy[p.id]) return;
    busy[p.id] = true;
    rerender(p);
    var tryModel = function (i) {
      return callGemini(MODELS[i], key, p).catch(function (e) {
        if (i + 1 < MODELS.length && e.status !== 400 && e.status !== 403) return tryModel(i + 1);
        throw e;
      });
    };
    tryModel(0).then(function (out) {
      p.ai = clean(out, p);
      p.aiErr = "";
      store(CACHE + p.id, JSON.stringify({ title: p.title, ai: p.ai }));
    }).catch(function (e) {
      p.aiErr = errText(e);
    }).then(function () {
      busy[p.id] = false;
      rerender(p);
    });
  }

  function aiSlot(p) {
    if (!canAi(p)) return "";
    if (busy[p.id]) return '<div class="ai-slot"><p class="ai-loading">✨ AI 正在把這篇翻成人話…</p></div>';
    var err = p.aiErr ? '<p class="ai-err">' + esc(p.aiErr) + "</p>" : "";
    if (getKey()) return '<div class="ai-slot">' + err + '<button class="ai-gen" data-id="' + esc(p.id) + '">✨ 用 AI 整理成白話</button></div>';
    return '<div class="ai-slot"><p class="ai-hint">這篇還沒有白話整理。<button class="linkbtn ai-open">設定 Gemini 金鑰</button>後就能一鍵整理 ✨</p></div>';
  }

  function rerender(p) {
    var el = document.querySelector('.post[data-id="' + p.id + '"]');
    if (!el) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = postHtml(p);
    var fresh = wrap.firstChild;
    fresh.open = el.open;
    el.replaceWith(fresh);
  }

  function postHtml(p) {
    var plain = aiHtml(p), full = sectionsHtml(p), body;
    if (plain) {
      body = plain + (full ? '<details class="full"><summary>📄 看官方原文重點（含圖表）</summary>' + full + "</details>" : "");
    } else {
      body = aiSlot(p) + (full || '<p class="intro">' + (p.category === "sanction" ? "制裁名單請看官方原文。" : "這篇公告的內容請看官方原文。") + "</p>");
    }
    var tldr = p.ai && p.ai.tldr ? '<span class="tldr">💬 ' + esc(p.ai.tldr) + "</span>" : "";
    return '<details class="post" data-id="' + esc(p.id) + '" style="--cat:' + catVar(p) + '"><summary><span class="sum-text"><span class="row1">' +
      '<span class="tag">' + esc(p.label) + "</span>" +
      (p.pinned ? '<span class="pin">📌 置頂</span>' : "") +
      (isNew(p) ? '<span class="new">NEW</span>' : "") +
      "<span>" + esc(p.posted || p.date) + '</span></span><span class="title">' + esc(p.title) + "</span>" + tldr + "</span>" +
      "</summary>" +
      '<div class="body">' + (p.cover ? img(p.cover, "cover") : "") + body +
      '<a class="src" href="' + esc(p.url) + '" target="_blank" rel="noopener">閱讀官方原文 →</a></div></details>';
  }

  function matches(p) {
    if (state.cat !== "all" && p.category !== state.cat) return false;
    if (!state.q) return true;
    var hay = p.title + " " + (p.ai ? p.ai.tldr + " " + p.ai.points.map(function (x) { return x.title + " " + x.text; }).join(" ") : "") + " " + (p.intro || []).join(" ") + " " + (p.sections || []).map(function (s) { return s.heading + " " + s.items.join(" "); }).join(" ");
    return hay.toLowerCase().indexOf(state.q.toLowerCase()) >= 0;
  }

  var PER_PAGE = 10;
  function pagerHtml(page, pages) {
    if (pages < 2) return "";
    var nums = [], last = 0;
    for (var i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
        if (last && i - last > 1) nums.push('<span class="pg-gap">…</span>');
        nums.push('<button type="button" class="pg-n" data-page="' + i + '"' + (i === page ? ' aria-current="page"' : "") + ">" + i + "</button>");
        last = i;
      }
    }
    return '<button type="button" class="pg-n pg-step" data-page="' + (page - 1) + '"' + (page === 1 ? " disabled" : "") + ' aria-label="上一頁">‹<span class="pg-txt"> 上一頁</span></button>' +
      nums.join("") +
      '<button type="button" class="pg-n pg-step" data-page="' + (page + 1) + '"' + (page === pages ? " disabled" : "") + ' aria-label="下一頁"><span class="pg-txt">下一頁 </span>›</button>';
  }

  function renderList() {
    var shown = state.posts.filter(matches);
    var pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PER_PAGE;
    $("list").innerHTML = shown.slice(start, start + PER_PAGE).map(postHtml).join("");
    $("pager").innerHTML = pagerHtml(state.page, pages);
    $("empty").hidden = shown.length > 0;
  }

  $("pager").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    state.page = +b.getAttribute("data-page");
    renderList();
    $("chips").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.getAttribute("data-cat");
    state.page = 1;
    renderChips(); renderList();
  });
  $("q").addEventListener("input", function (e) { state.q = e.target.value.trim(); state.page = 1; renderList(); });

  function byId(id) { return state.posts.filter(function (p) { return p.id === id; })[0]; }

  $("list").addEventListener("click", function (e) {
    var g = e.target.closest(".ai-gen");
    if (g) { generate(byId(g.getAttribute("data-id"))); return; }
    if (e.target.closest(".ai-open")) openDlg();
  });
  // opening a post with no summary: auto-generate when a key is set
  $("list").addEventListener("toggle", function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains("post") || !el.open) return;
    var p = byId(el.getAttribute("data-id"));
    if (p && !p.ai && !p.aiErr && canAi(p) && getKey()) generate(p);
  }, true);

  // settings dialog
  var dlg = $("aiDlg");
  function maskKey(k) { return k ? k.slice(0, 4) + "••••" + k.slice(-4) : ""; }
  function openDlg() {
    var k = getKey();
    $("aiKey").value = "";
    $("aiStatus").textContent = k ? "目前已設定：" + maskKey(k) : "目前沒有設定金鑰";
    $("aiClear").hidden = !k;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    $("aiKey").focus();
  }
  function closeDlg() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  $("aiBtn").addEventListener("click", openDlg);
  $("aiCancel").addEventListener("click", closeDlg);
  $("aiSave").addEventListener("click", function () {
    var v = $("aiKey").value.trim();
    if (!v) { $("aiStatus").textContent = "請先貼上金鑰"; return; }
    if (!store(KEY_STORE, v)) { $("aiStatus").textContent = "這個瀏覽器不允許儲存（可能是無痕模式）"; return; }
    state.posts.forEach(function (p) { p.aiErr = ""; });
    closeDlg(); renderList();
  });
  $("aiClear").addEventListener("click", function () {
    store(KEY_STORE, null);
    closeDlg(); renderList();
  });

  fetch("data/news.json?t=" + Date.now())
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      state.posts = d.posts || [];
      // summaries this browser made earlier (only reused while the post title is unchanged)
      state.posts.forEach(function (p) {
        if (p.ai) return;
        try {
          var c = JSON.parse(load(CACHE + p.id) || "null");
          if (c && c.title === p.title && c.ai) p.ai = c.ai;
        } catch (e) { /* ignore broken cache */ }
      });
      $("updated").textContent = "最後同步：" + fmtTime(d.updated) + "（台灣時間）";
      renderChips(); renderList();
    })
    .catch(function () {
      $("updated").textContent = "資料載入失敗，請稍後再試";
      $("empty").hidden = false;
    });
})();
