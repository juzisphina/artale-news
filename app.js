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
  var state = { cat: "all", q: "", posts: [] };

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

  function findSection(p, re) {
    var s = (p.sections || []).filter(function (x) { return re.test(x.heading); });
    return s[0];
  }

  function renderHighlights() {
    var posts = state.posts, html = "";
    var upd = posts.filter(function (p) { return p.category === "update" && /更新公告|改版|更新/.test(p.title) && p.sections && p.sections.length; })[0];
    if (upd) {
      var toc = findSection(upd, /目錄|目录|重點|摘要/) || upd.sections[0];
      var items = toc.items.length ? toc.items : upd.sections.map(function (s) { return s.heading; });
      var lis = upd.ai && upd.ai.points && upd.ai.points.length
        ? upd.ai.points.map(function (pt) { return "<li>" + esc(pt.emoji) + " <b>" + esc(pt.title) + "</b>：" + esc(pt.text) + "</li>"; }).join("")
        : items.slice(0, 8).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
      html += '<article class="hl hl-wide">' + img(upd.cover, "hl-cover") + '<h2>🍊 最新改版重點</h2><p class="t">' + esc(upd.title) + "</p>" +
        (upd.ai && upd.ai.tldr ? '<p class="tldr">💬 ' + esc(upd.ai.tldr) + "</p>" : "") + '<ul class="plain-list">' + lis +
        '</ul><p class="small">' + esc(upd.posted || upd.date) + ' ・ <a href="' + esc(upd.url) + '" target="_blank" rel="noopener">原文</a></p></article>';
    }
    var mt = posts.filter(function (p) { return p.category === "maintenance" && findSection(p, /維護時間/); })[0];
    if (mt) {
      var time = findSection(mt, /維護時間/).items[0] || "";
      var what = findSection(mt, /維護內容/);
      html += '<article class="hl"><h2>🔧 最近一次維護</h2><p class="when">' + esc(time) + '</p><p class="t">' + esc(mt.title) + "</p>" +
        (what ? "<ul>" + what.items.slice(0, 5).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : "") +
        '<p class="small"><a href="' + esc(mt.url) + '" target="_blank" rel="noopener">原文</a></p></article>';
    }
    $("highlights").innerHTML = html;
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
    return h + '<p class="ai-note">AI 白話整理，日期與細節請以官方原文為準</p></div>';
  }

  function postHtml(p) {
    var plain = aiHtml(p), full = sectionsHtml(p), body;
    if (plain) {
      body = plain + (full ? '<details class="full"><summary>📄 看官方原文重點（含圖表）</summary>' + full + "</details>" : "");
    } else {
      body = full || '<p class="intro">' + (p.category === "sanction" ? "制裁名單請看官方原文。" : "這篇公告的內容請看官方原文。") + "</p>";
    }
    var tldr = p.ai && p.ai.tldr ? '<span class="tldr">💬 ' + esc(p.ai.tldr) + "</span>" : "";
    return '<details class="post" style="--cat:' + catVar(p) + '"><summary><span class="sum-text"><span class="row1">' +
      '<span class="tag">' + esc(p.label) + "</span>" +
      (p.pinned ? '<span class="pin">📌 置頂</span>' : "") +
      (isNew(p) ? '<span class="new">NEW</span>' : "") +
      "<span>" + esc(p.posted || p.date) + '</span></span><span class="title">' + esc(p.title) + "</span>" + tldr + "</span>" +
      img(p.cover, "thumb") + "</summary>" +
      '<div class="body">' + (p.cover ? img(p.cover, "cover") : "") + body +
      '<a class="src" href="' + esc(p.url) + '" target="_blank" rel="noopener">閱讀官方原文 →</a></div></details>';
  }

  function matches(p) {
    if (state.cat !== "all" && p.category !== state.cat) return false;
    if (!state.q) return true;
    var hay = p.title + " " + (p.ai ? p.ai.tldr + " " + p.ai.points.map(function (x) { return x.title + " " + x.text; }).join(" ") : "") + " " + (p.intro || []).join(" ") + " " + (p.sections || []).map(function (s) { return s.heading + " " + s.items.join(" "); }).join(" ");
    return hay.toLowerCase().indexOf(state.q.toLowerCase()) >= 0;
  }

  function renderList() {
    var shown = state.posts.filter(matches);
    $("list").innerHTML = shown.map(postHtml).join("");
    $("empty").hidden = shown.length > 0;
  }

  $("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.getAttribute("data-cat");
    renderChips(); renderList();
  });
  $("q").addEventListener("input", function (e) { state.q = e.target.value.trim(); renderList(); });

  fetch("data/news.json?t=" + Date.now())
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      state.posts = d.posts || [];
      $("updated").textContent = "最後同步：" + fmtTime(d.updated) + "（台灣時間）";
      renderHighlights(); renderChips(); renderList();
    })
    .catch(function () {
      $("updated").textContent = "資料載入失敗，請稍後再試";
      $("empty").hidden = false;
    });
})();
