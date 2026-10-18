// 도트 UI 꾸미기: 픽셀 캐릭터, 아이콘, 하단 탭, 선수 카드 칩
// game.js의 게임 로직은 건드리지 않고, 화면이 다시 그려질 때마다 위에 덧씌웁니다.
(() => {
  "use strict";

  // ---------- 8x8 도트 아이콘 ----------
  const BITMAPS = {
    sword: ["......##", ".....###", "....###.", ".#.###..", "..###...", "..##....", ".#.#....", "#......."],
    burst: ["..#..#..", "#..##..#", ".#.##.#.", "..####..", "########", "..####..", ".#.##.#.", "#..##..#"],
    bulb: ["..####..", ".######.", "###..###", "###..###", ".######.", "..####..", "..####..", "...##..."],
    grid: ["###.###.", "###.###.", "###.###.", "........", "###.###.", "###.###.", "###.###.", "........"],
    heart: [".##..##.", "########", "########", "########", ".######.", "..####..", "...##...", "........"],
    bolt: ["...###..", "..###...", ".###....", "#######.", "..###...", ".##.....", "##......", "#......."],
    star: ["...##...", "...##...", "########", ".######.", "..####..", "..#..#..", ".#....#.", "#......#"],
    moon: ["..####..", ".###....", "###.....", "###.....", "###.....", ".###..#.", "..####..", "........"],
    book: ["########", "#.####.#", "#.####.#", "#.#..#.#", "#.####.#", "#.####.#", "########", "........"],
    sun: ["#..#..#.", ".#.#.#..", "..###...", "#######.", "..###...", ".#.#.#..", "#..#..#.", "........"],
    coin: ["..####..", ".######.", "###..###", "###..###", "###..###", "###..###", ".######.", "..####.."],
    swap: ["..##....", "######..", "..##....", "........", "....##..", "..######", "....##..", "........"],
    flag: ["#####...", "######..", "#####...", "#.......", "#.......", "#.......", "#.......", "#......."],
    people: ["..##.##.", "..##.##.", "...#..#.", ".#######", "########", "#.####.#", "..#..#..", "..#..#.."],
    home: ["...##...", "..####..", ".######.", "########", ".######.", ".##..##.", ".##..##.", ".######."],
    trophy: ["########", "#.####.#", "#.####.#", ".######.", "..####..", "...##...", "..####..", ".######."],
    scroll: ["########", "#......#", "#.####.#", "#......#", "#.####.#", "#......#", "#.####.#", "########"],
  };

  const STAT_ICON = { laning: "sword", teamfight: "burst", decision: "bulb", champPool: "grid", mental: "heart", stamina: "bolt" };
  const ACTION_ICON = {
    soloQueue: "sword", scrim: "people", champ: "star", rest: "moon", coach: "book",
    vacation: "sun", shop: "coin", position: "swap", match: "flag",
  };

  function icon(name, size = 16) {
    const rows = BITMAPS[name];
    if (!rows) return "";
    let r = "";
    rows.forEach((row, y) => {
      for (let x = 0; x < 8; x++) if (row[x] === "#") r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    });
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">${r}</svg>`;
  }

  // ---------- 16x20 도트 캐릭터 ----------
  // h 머리카락 · s 피부 · e 눈 · m 입 · g 헤드셋 · c 셔츠 · l 가슴 로고 · p 바지 · k 신발
  const SPRITE = [
    "....hhhhhhhh....",
    "...hhhhhhhhhh...",
    "..hhhhhhhhhhhh..",
    "..ghhssssssshhg.",
    "..gsssssssssssg.",
    "..gssesssssesssg",
    "..gssesssssesssg",
    "..gsssssmmssssg.",
    "....ssssssss....",
    "......ssss......",
    "..cccccccccccc..",
    ".cccccccccccccc.",
    ".ccccccllcccccc.",
    ".ccccccccccccc..",
    ".ssccccccccccss.",
    ".ssccccccccccss.",
    "..pppppppppppp..",
    "..pppppppppppp..",
    "..ppppp..ppppp..",
    "..kkkkk..kkkkk..",
  ];
  // 손으로 쓴 문자열 길이가 어긋나도 그림이 깨지지 않게 16칸으로 맞춥니다
  const GRID = SPRITE.map((r) => r.padEnd(16, ".").slice(0, 16));

  const HAIR = { top: "#6b4226", jungle: "#2f9e5f", mid: "#7b4fd1", adc: "#ee8a3a", support: "#ff7aa8" };
  const STAGE_SHIRT = { amateur: "#7c8798", academy: "#3b82f6" };

  function hashHue(name) {
    const base = String(name || "").replace(/ 아카데미$/, "");
    let h = 0;
    for (const ch of base) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  }

  function drawAvatar(canvas, opt) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pal = {
      h: opt.hair, s: "#f2c9a0", e: opt.blink ? "#f2c9a0" : "#12142a", m: "#c0524a", g: "#ffd23f",
      c: opt.shirt, l: "#fff4c2", p: "#2b3050", k: "#f3efe0",
    };
    ctx.clearRect(0, 0, 16, 20);
    GRID.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const c = row[x];
        if (c === "." || !pal[c]) continue;
        ctx.fillStyle = pal[c];
        ctx.fillRect(x, y, 1, 1);
      }
    });
  }

  // ---------- 현재 상태에서 캐릭터 모양 정하기 ----------
  function look() {
    const p = typeof player !== "undefined" ? player : null;
    if (!p) return null;
    let shirt = STAGE_SHIRT[p.stage];
    if (p.stage === "pro") shirt = `hsl(${hashHue(p.team && p.team.name)} 62% 48%)`;
    if (!shirt) shirt = STAGE_SHIRT.amateur;
    return { hair: HAIR[p.position] || HAIR.top, shirt };
  }

  const $ = (id) => document.getElementById(id);
  let blinkOn = false;

  function paintPlayer() {
    const l = look();
    if (l) drawAvatar($("avatar"), { ...l, blink: blinkOn });
  }
  function paintStart() {
    const sel = document.querySelector('input[name="position"]:checked');
    drawAvatar($("start-avatar"), { hair: HAIR[sel ? sel.value : "top"], shirt: STAGE_SHIRT.amateur, blink: blinkOn });
  }

  // ---------- 선수 카드 칩 / 최근 기록 ----------
  function paintChips() {
    const p = typeof player !== "undefined" ? player : null;
    const box = $("chips");
    if (!p || !box) return;
    let ovr = "";
    try { ovr = overall(); } catch {}
    const chips = [];
    if (ovr !== "") chips.push(`<span class="chip ovr">${icon("star", 12)}종합 ${ovr}</span>`);
    chips.push(`<span class="chip money">${icon("coin", 12)}${Number(p.money || 0).toLocaleString("ko-KR")}만원</span>`);
    if (p.record && p.record.w + p.record.l > 0) chips.push(`<span class="chip">${icon("flag", 12)}${p.record.w}승 ${p.record.l}패</span>`);
    box.innerHTML = chips.join("");
  }

  function paintLastLog() {
    const el = $("last-log");
    const first = $("log") && $("log").firstElementChild;
    if (!el) return;
    if (!first) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = first.innerHTML;
  }

  function sync() {
    try { paintPlayer(); paintChips(); paintLastLog(); } catch (e) { console.warn("ui sync", e); }
  }

  // ---------- 능력치 아이콘 ----------
  document.querySelectorAll("#stats .stat").forEach((row) => {
    const fill = row.querySelector(".stat-fill");
    const key = fill ? fill.id.replace(/^fill-/, "") : "";
    row.dataset.key = key;
    const label = row.firstElementChild;
    if (label && STAT_ICON[key]) label.insertAdjacentHTML("afterbegin", icon(STAT_ICON[key], 16));
  });

  // ---------- 행동 버튼 아이콘 (버튼이 새로 만들어질 때마다) ----------
  const actionsEl = $("actions");
  function decorateActions() {
    actionsEl.querySelectorAll("button:not([data-deco])").forEach((btn) => {
      btn.dataset.deco = "1";
      const text = btn.textContent;
      btn.textContent = "";
      const name = ACTION_ICON[btn.dataset.action];
      if (name) btn.insertAdjacentHTML("beforeend", icon(name, btn.dataset.action === "match" ? 20 : 24));
      const span = document.createElement("span");
      span.textContent = text;
      btn.append(span);
    });
  }
  if (actionsEl) {
    new MutationObserver(decorateActions).observe(actionsEl, { childList: true });
    decorateActions();
  }

  // ---------- 하단 탭 = 페이지 넘기기 ----------
  const ORDER = ["home", "match", "player", "team", "log"];
  const tabs = [...document.querySelectorAll("#tabbar button")];
  let current = "home";
  function openTab(name) {
    if (!ORDER.includes(name)) return;
    const ps = $("play-screen");
    if (ps) ps.dataset.tab = name; // 경기 페이지에서는 위쪽 선수 카드를 숨겨 공간을 넓힙니다
    const dir = ORDER.indexOf(name) >= ORDER.indexOf(current) ? 1 : -1;
    document.querySelectorAll(".tab-panel").forEach((p) => {
      const on = p.id === `tab-${name}`;
      if (on && !p.classList.contains("on")) {
        p.style.setProperty("--dx", `${dir * 28}px`);
        p.scrollTop = 0;
      }
      p.classList.toggle("on", on);
    });
    tabs.forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === name);
      if (b.dataset.tab === name) b.classList.remove("ping");
    });
    current = name;
  }
  window.openTab = openTab;
  tabs.forEach((b) => {
    const slot = b.querySelector("i[data-ico]");
    if (slot) slot.outerHTML = icon(slot.dataset.ico, 22);
    b.addEventListener("click", () => openTab(b.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.goto)));

  // 좌우로 밀어서 페이지 넘기기
  const pages = $("pages");
  if (pages) {
    let sx = 0, sy = 0, skip = false;
    pages.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      skip = !!e.target.closest("#champ-grid, #tourney-list, textarea, input, canvas");
    }, { passive: true });
    pages.addEventListener("touchend", (e) => {
      if (skip) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const i = ORDER.indexOf(current) + (dx < 0 ? 1 : -1);
      if (i >= 0 && i < ORDER.length) openTab(ORDER[i]);
    }, { passive: true });
  }

  // 새 선수를 시작하면 항상 첫 페이지에서 출발
  const startForm = $("start-form");
  if (startForm) startForm.addEventListener("submit", () => openTab("home"));
  for (const id of ["reset-btn", "restart-btn"]) {
    const el = $(id);
    if (el) el.addEventListener("click", () => openTab("home"));
  }

  // 다른 페이지에 있는 중에 대회가 열리면 탭에 알림 점
  const tourney = $("tourney");
  if (tourney) {
    new MutationObserver(() => {
      const teamTab = tabs.find((b) => b.dataset.tab === "team");
      if (!tourney.hidden && teamTab && !teamTab.classList.contains("on")) teamTab.classList.add("ping");
    }).observe(tourney, { attributes: true, attributeFilter: ["hidden"] });
  }
  // 경기가 시작되면 경기 페이지로, 상점/챔피언 선택이 열리면 선수 페이지로 자동 이동
  for (const [id, tab] of [["match", "match"], ["picker", "player"], ["shop", "player"]]) {
    const el = $(id);
    if (!el) continue;
    new MutationObserver(() => { if (!el.hidden) openTab(tab); }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  }

  // ---------- 시작 화면 미리보기 ----------
  document.querySelectorAll('input[name="position"]').forEach((r) => r.addEventListener("change", paintStart));

  // ---------- 눈 깜빡임 ----------
  setInterval(() => {
    blinkOn = true;
    paintStart();
    paintPlayer();
    setTimeout(() => { blinkOn = false; paintStart(); paintPlayer(); }, 140);
  }, 3200);

  // ---------- game.js의 화면 갱신 함수에 걸어 두기 ----------
  const wrap = (name) => {
    const orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      sync();
      return r;
    };
  };
  wrap("render");
  wrap("renderExtra");
  const origShow = window.showScreen;
  if (typeof origShow === "function") {
    window.showScreen = function (which) {
      const r = origShow.apply(this, arguments);
      if (which === "start") paintStart();
      else sync();
      return r;
    };
  }

  paintStart();
  sync();
})();

// ---------- v2: 화면 모드, 시작 능력치 카드, 하단 메뉴, 가이드 ----------
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // 라이트/다크 전환 (처음엔 기기 설정을 따라가고, 누르면 기억합니다)
  const themeBtn = $("theme-btn");
  const meta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(t) {
    root.dataset.theme = t;
    if (themeBtn) themeBtn.textContent = t === "light" ? "☀" : "☾";
    if (meta) meta.content = t === "light" ? "#1b1d3a" : "#121528";
  }
  applyTheme(root.dataset.theme === "light" ? "light" : "dark");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem("pg-theme", next); } catch {}
    });
  }

  // 포지션 카드에 시작 능력치 막대 (라인전/한타/판단력)
  const BASE = 30;
  const SHOW = [["laning", "라인전", "#ff6b6b"], ["teamfight", "한타", "#ffa94c"], ["decision", "판단력", "#4cc9ff"]];
  document.querySelectorAll(".pos").forEach((label) => {
    const key = label.querySelector("input").value;
    const pos = typeof POSITIONS !== "undefined" ? POSITIONS[key] : null;
    if (!pos) return;
    const bars = SHOW.map(([k, name, c]) => {
      const v = BASE + ((pos.bonus && pos.bonus[k]) || 0);
      return `<span class="mini" style="--c:${c}">${name} <em>${v}</em><i><b style="width:${v}%"></b></i></span>`;
    }).join("");
    label.insertAdjacentHTML("beforeend", `<span class="pos-bars">${bars}</span>`);
  });

  // 팝업 페이지 (가이드 / 업적 / 저장)
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open]");
    if (opener) {
      const d = $(opener.dataset.open);
      if (d) (d.showModal ? d.showModal() : d.setAttribute("open", ""));
      return;
    }
    const closer = e.target.closest("[data-close]");
    if (closer) {
      const d = closer.closest("dialog");
      if (d) (d.close ? d.close() : d.removeAttribute("open"));
      return;
    }
    if (e.target.tagName === "DIALOG" && e.target.close) e.target.close(); // 바깥을 누르면 닫기
  });

  // 시작 화면 2단계: 소개 → 이름·포지션
  const intro = $("start-intro"), form = $("start-form");
  function showStep(step) {
    if (!intro || !form) return;
    intro.hidden = step !== "intro";
    form.hidden = step !== "form";
    if (step === "form") $("name-input").focus({ preventScroll: true });
  }
  if ($("begin-btn")) $("begin-btn").addEventListener("click", () => showStep("form"));
  if ($("start-back")) $("start-back").addEventListener("click", () => showStep("intro"));
  const prevShow = window.showScreen;
  window.showScreen = function (which) {
    const r = prevShow.apply(this, arguments);
    if (which === "start") showStep("intro");
    return r;
  };
  showStep("intro");
})();

// ---------- v4: 경기 명단 · 최신 소식이 위로 ----------
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const POS = [["top", "탑"], ["jungle", "정글"], ["mid", "미드"], ["adc", "원딜"], ["support", "서포터"]];

  // 명단은 game.js의 teamRoster가 정해요: 포지션에 맞는 선수만, 팀마다 다르게, 해가 바뀌면 일부 교체.
  // 숫자는 선수 실력(경기 결과에 반영돼요). 내 선수는 종합 능력치, 같은 포지션 맞상대는 ⚔로 표시.
  function rows(map, mine, ratings) {
    const y = yearOf(player.day);
    return POS.map(([k, label]) => ({
      label,
      name: map[k],
      me: mine && k === player.position,
      lane: !mine && k === player.position,
      rt: mine && k === player.position ? overall() : ratings && ratings[k] != null ? ratings[k] : playerRating(map[k], y),
    }));
  }
  const col = (cls, title, rs) =>
    `<div class="roster ${cls}"><h3>${esc(title)}</h3><ul>` +
    rs.map((r) => `<li class="${r.me ? "me" : r.lane ? "lane" : ""}"><em>${r.label}</em><span>${esc(r.name)}${r.me ? " ★" : r.lane ? " ⚔" : ""}</span><b class="rt">${r.rt}</b></li>`).join("") +
    `</ul></div>`;

  function decorateMatch(r) {
    if (!r || !player) return;
    const my = player.team ? player.team.name : "우리 팀";
    const opp = r.oppName || "상대 팀";
    // 어느 팀과 하는지
    $("match-vs").innerHTML =
      `<div class="side">${teamLogo(my, 30)}<b>${esc(my)}</b></div><span>VS</span>` +
      `<div class="side">${teamLogo(opp, 30)}<b>${esc(opp)}</b></div>`;
    // 양 팀 선수 (상대 명단·실력은 경기 계산에 쓰인 값 그대로)
    const mine = rows(myRosterMap(), true);
    const oppMap = r.oppPlayers || teamRoster(opp, yearOf(player.day), mine.map((m) => m.name));
    $("match-rosters").innerHTML = col("mine", "우리 팀", mine) + col("opp", "상대 팀", rows(oppMap, false, r.oppRatings));
    // 최신 소식이 위로: 목록 순서를 뒤집습니다 (경기 시간이 지날수록 새 줄이 맨 위에 생김)
    const ul = $("match-events");
    ul.append(...[...ul.children].reverse());
    ul.scrollTop = 0;
  }

  const origShowMatch = window.showMatch;
  if (typeof origShowMatch === "function") {
    window.showMatch = function (r) {
      const out = origShowMatch.apply(this, arguments);
      try { decorateMatch(r); } catch (e) { console.warn("match ui", e); }
      return out;
    };
  }
})();
