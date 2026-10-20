// extras.js — 개인 순위, 경기 일정, 챔피언 숙련도, 소식·댓글, 병역·아시안게임, 커리어, 성장치
// game.js 다음, ui.js 앞에서 불러옵니다. game.js의 전역 함수(pushLog, showMatch, render)를 감싸서 동작해요.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const MIL_AGE = 28; // 이 나이가 되면 입대
  const MIL_DAYS = 548; // 복무 18개월
  const GROW = ["laning", "teamfight", "decision", "champPool"];
  const hasLeague = () => !!STAGES[player.stage].matchLevel;

  // ---------- 저장되는 추가 데이터 ----------
  function X() {
    if (!player.x) {
      player.x = {
        news: [], trophies: [], mil: { status: "pending" }, asian: {}, snap: null, prevGrowth: null,
        streak: 0, fans: 100, lastRank: null, prev: { titles: player.titles || 0, msi: (player.intl || {}).msi || 0, worlds: (player.intl || {}).worlds || 0 },
        lastOvr: overall(),
      };
    }
    return player.x;
  }
  const curSnap = () => ({ year: yearOf(player.day), ovr: overall(), stats: Object.fromEntries(GROW.map((k) => [k, player.stats[k]])) });
  function rollSnap() {
    const x = X();
    const y = yearOf(player.day);
    if (!x.snap) x.snap = curSnap();
    else if (x.snap.year < y) {
      x.prevGrowth = overall() - x.snap.ovr; // 지난 한 해 동안의 종합 성장
      x.snap = curSnap();
    }
  }
  window.exOvrDelta = () => {
    try { rollSnap(); return overall() - X().snap.ovr; } catch { return 0; }
  };

  // ---------- 개인 순위 ----------
  const myRating = () => overall() + Math.round((player.stats.champPool - 30) / 10) + Math.min(5, player.titles || 0);
  function board() {
    const y = yearOf(player.day);
    const rows = [];
    for (const t of player.season.teams) {
      const info = rosterInfo(t.name, y);
      POS_KEYS.forEach((k) => rows.push({ name: info.ro[k], team: t.name, pos: k, rating: info.rt[k] }));
    }
    const my = player.team ? player.team.name : "우리 팀";
    const map = player.team ? myRosterMap() : {};
    POS_KEYS.forEach((k) => {
      if (k === player.position) rows.push({ name: player.name, team: my, pos: k, rating: myRating(), me: true });
      else if (map[k]) rows.push({ name: map[k], team: my, pos: k, rating: playerRating(map[k], y) });
    });
    rows.sort((a, b) => b.rating - a.rating || (a.me ? 1 : b.me ? -1 : 0));
    return rows;
  }
  function ranks() {
    const rows = board();
    const all = rows.findIndex((r) => r.me) + 1;
    const same = rows.filter((r) => r.pos === player.position);
    return { rows, all, total: rows.length, pos: same.findIndex((r) => r.me) + 1, posTotal: same.length, same };
  }

  // ---------- 소식 / 댓글 ----------
  const NICK = ["롤갤러", "탑솔러", "정글차이", "원딜충", "서폿장인", "미드갭", "브실골", "롤린이", "다이아언저리", "관전러", "응원단장", "치킨먹자", "솔랭장인", "새벽팬", "뇌지컬", "리그덕후"];
  const T = {
    win: {
      head: ["{team}, {opp} 꺾고 승전보… {name} 활약", "{name} 맹활약! {team} {opp} 제압", "{team} 값진 승리, {name}의 라인전이 빛났다"],
      cm: ["오늘 {name} 라인전 미쳤다 ㄷㄷ", "{opp} 상대로 이긴 건 크다 ㅋㅋ", "{name} 믿고 있었다!", "역시 {team}! 가자!!", "이 폼이면 플레이오프 간다", "{name} 캐리 인정합니다", "솔직히 오늘은 {name}이 MVP"],
    },
    lose: {
      head: ["{team}, {opp}에 무릎… {name} 부진 지적", "{opp}에 덜미 잡힌 {team}, 반등이 필요하다", "{name} 흔들렸다… {team} 패배"],
      cm: ["오늘 {name} 왜 이럼.. 멘탈 나갔나", "{opp}한테 지는 건 좀 ㅋㅋ", "밴픽부터 꼬였다", "{name} 폼 좀 올려라", "다음 경기 기대한다 힘내라!", "코치진 뭐하냐", "한 판 졌다고 너무 몰아가지 마세요 ㅠ"],
    },
    streakW: {
      head: ["{team} {n}연승 질주! {name} 'MVP급' 폼", "{n}연승 {team}, 상승세 비결은 {name}", "멈추지 않는 {team}… {n}연승"],
      cm: ["{n}연승 실화냐 ㅋㅋㅋ", "{name} 지금 폼 역대급", "이대로 우승 가자!!", "{team} 이제 무서운 팀 됐다", "{name} 연봉 올려줘라"],
    },
    streakL: {
      head: ["{team} {n}연패 늪… 팬들 한숨", "{n}연패 {team}, {name}의 반등이 절실하다", "위기의 {team}, 연패 탈출 언제?"],
      cm: ["{n}연패 ㅠㅠ 제발 이겨줘", "{name} 휴식이 필요해 보임", "감독 바꿔라", "그래도 응원합니다 끝까지", "연패가 길어지네.. 멘탈 관리 부탁"],
    },
    title: {
      head: ["{team} 우승! {name}, 감격의 트로피", "{name} 이끈 {team}, {what} 정상 등극", "[우승] {name} '이게 꿈이야 생시야'"],
      cm: ["우승 축하드립니다!!!", "{name} 진짜 해냈다 ㅠㅠㅠ", "고생 많았다 최고다", "이게 {team}이지!", "눈물 난다 ㅠㅠ", "올해의 선수 각이다"],
    },
    runner: {
      head: ["{team} 아쉬운 준우승… {name} '다음엔 우승'", "{name}, 결승서 고개 숙였지만 박수 받았다"],
      cm: ["준우승도 대단한 거다 수고했다", "아 진짜 아깝다 ㅠㅠ", "{name} 내년엔 우승 가자", "결승까지 온 게 어디야"],
    },
    miss: {
      head: ["{team}, 플레이오프 문턱서 좌절… {name} '더 노력하겠다'", "{team} 시즌 마감, 숙제 남긴 {name}"],
      cm: ["다음 시즌엔 꼭 가자", "아쉬운 시즌이었다", "{name} 성장세는 좋았다", "비시즌에 보강 좀 하자"],
    },
    milestone: {
      head: ["{name}, 종합 {n} 돌파… '성장 속도 무섭다'", "{team} {name}, 어느새 종합 {n}의 강자"],
      cm: ["이 선수 성장 곡선 미쳤다", "{name} 앞으로가 더 기대됨", "노력의 결과 인정", "{n}이면 이제 리그급이지"],
    },
    rank: {
      head: ["{name}, {pos} 포지션 개인 {n}위 '리그 정상급'", "{n}위 오른 {name}… 포지션 라이벌 긴장"],
      cm: ["{name} 순위 보소 ㄷㄷ", "{pos} 1티어 인정", "이 선수 대표팀 가야 하는데", "랭킹 올라가는 속도 실화냐"],
    },
    mil: {
      head: ["{name}, 병역 의무 이행 위해 입대… '건강히 다녀오겠다'", "{name} 입대, 팬들 '기다리겠다'"],
      cm: ["몸 건강히 다녀와라!", "기다릴게 {name}!!", "전역하고 폼 유지하길", "국방의 의무 화이팅", "{team} 공백 어쩌나 ㅠ"],
    },
    exempt: {
      head: ["[속보] {name}, 아시안게임 금메달로 병역 혜택!", "{name} 병역 면제 확정… 선수 생활 길어진다"],
      cm: ["병역 해결 축하!!", "이제 커리어 걱정 없다 ㄷㄷ", "금메달 감동이다 ㅠㅠ", "군백기 없이 쭉 가자"],
    },
    gold: {
      head: ["{name}, 아시안게임 금메달! 태극기 휘날렸다", "대표팀 금메달, 중심엔 {name}"],
      cm: ["대한민국!!!", "금메달 미쳤다", "{name} 국가대표 자격 충분", "새벽에 소리 질렀다 ㅋㅋ"],
    },
    medal: {
      head: ["{name}, 아시안게임 {what}… 값진 성과", "아시안게임 {what} {name} '다음엔 금메달'"],
      cm: ["수고했다 자랑스럽다", "다음엔 금메달 가자", "국가대표 {name} 응원합니다"],
    },
    callup: {
      head: ["{name}, 아시안게임 국가대표 발탁", "국가대표 {name} '영광이다'"],
      cm: ["대표팀 발탁 당연하지", "{name} 화이팅!", "국가대표 {name} 가즈아"],
    },
    miss2: {
      head: ["{name}, 아시안게임 대표팀 승선 불발", "{name} '대표팀은 아쉽지만 다음을 준비하겠다'"],
      cm: ["아쉽다 ㅠㅠ 다음에 가자", "{name} 순위 더 올려야지", "이번엔 운이 없었다"],
    },
  };
  const fill = (s, c) => s.replace(/\{(\w+)\}/g, (_, k) => (c[k] !== undefined ? c[k] : ""));
  function addNews(kind, ctx, mood) {
    const x = X();
    const base = { name: player.name, team: player.team ? player.team.name : "아마추어", opp: "상대", n: "", what: "", pos: POSITIONS[player.position].label };
    const c = { ...base, ...ctx };
    const t = T[kind];
    const pool = [...t.cm].sort(() => Math.random() - 0.5).slice(0, 3);
    x.news.unshift({
      date: fmtDate(player.day), mood: mood || "neutral", head: fill(pick(t.head), c),
      comments: pool.map((s) => ({ u: pick(NICK) + R(1, 99), t: fill(s, c), likes: R(1, 480) })),
    });
    x.news = x.news.slice(0, 30);
  }

  // ---------- 병역 / 아시안게임 ----------
  function milShort() {
    const m = X().mil;
    return m.status === "exempt" ? "병역 면제" : m.status === "done" ? "병역 필" : "병역 미필";
  }
  function milFull() {
    const m = X().mil;
    if (m.status === "exempt") return `면제 (${m.reason})`;
    if (m.status === "done") return `복무 완료 (${m.at || ""} 전역)`;
    const left = MIL_AGE - getAge();
    return left > 0 ? `미필 · ${MIL_AGE}세 입대(${left}년 뒤)` : "입대 예정";
  }
  function nextAsian() {
    const y = yearOf(player.day);
    for (let yy = y; yy < y + 8; yy++) if (yy % 4 === 2 && !X().asian[yy] && (yy > y || mdOf(player.day) < 920)) return yy;
    return null;
  }
  function checkMilitary() {
    const x = X();
    if (x.mil.status !== "pending" || getAge() < MIL_AGE || player.over) return false;
    const s = player.stats;
    for (const k of ["laning", "teamfight", "decision"]) s[k] = Math.max(5, s[k] - R(4, 7));
    for (const id of Object.keys(player.mastery)) player.mastery[id] = Math.max(0, player.mastery[id] - 8);
    player.day += MIL_DAYS;
    player.week = Math.floor(player.day / 7) + 1;
    s.stamina = 100;
    s.mental = 70;
    player.tourney = null;
    x.mil = { status: "done", at: fmtDate(player.day) };
    logNote({ note: `병역 의무로 입대, 18개월 복무 후 전역했어요. 감각이 무뎌져 능력치가 떨어졌습니다. (전역 ${fmtDate(player.day)})` });
    addNews("mil", {}, "neutral");
    syncCalendar();
    return true;
  }
  function checkAsian() {
    const x = X();
    const y = yearOf(player.day);
    if (y % 4 !== 2 || mdOf(player.day) < 920 || x.asian[y] || player.over || !hasLeague()) return false;
    x.asian[y] = 1;
    if (player.stage !== "pro") return false;
    const rk = ranks();
    if (rk.pos > 3) {
      logNote({ note: `${y} 아시안게임 대표팀 선발 불발 (포지션 ${rk.pos}위). 포지션 3위 안에 들면 발탁돼요.` });
      addNews("miss2", {}, "bad");
      return true;
    }
    addNews("callup", {}, "good");
    const rounds = [
      { n: "8강", opp: "홍콩·베트남 대표팀", bo: 3, bonus: -2 },
      { n: "4강", opp: "대만·일본 대표팀", bo: 3, bonus: 3 },
      { n: "결승", opp: "중국 대표팀", bo: 5, bonus: 6 },
    ];
    let place = "금메달";
    const trail = [];
    for (const r of rounds) {
      let w = 0, l = 0;
      const need = Math.ceil(r.bo / 2);
      while (w < need && l < need) {
        const g = simulateMatch(r.bonus, null, 0);
        g.win ? w++ : l++;
      }
      trail.push(`${r.n} ${w}:${l}`);
      if (l > w) {
        place = r.n === "8강" ? "8강 탈락" : r.n === "4강" ? "동메달" : "은메달";
        break;
      }
    }
    const text = `${y} 아시안게임 국가대표 · ${place} (${trail.join(", ")})`;
    player.history.unshift({ text });
    player.history = player.history.slice(0, 10);
    x.fans += place === "금메달" ? 2000 : place.includes("메달") ? 900 : 200;
    if (place === "금메달") {
      x.trophies.unshift({ y, t: `${y} 아시안게임 금메달` });
      if (x.mil.status === "pending") {
        x.mil = { status: "exempt", reason: `${y} 아시안게임 금메달` };
        logNote({ note: `[아시안게임] 금메달! 병역 혜택을 받아 병역이 면제됩니다. · ${trail.join(", ")}`, good: true });
        addNews("gold", {}, "good");
        addNews("exempt", {}, "good");
      } else {
        logNote({ note: `[아시안게임] 금메달! · ${trail.join(", ")}`, good: true });
        addNews("gold", {}, "good");
      }
    } else if (place.includes("메달")) {
      x.trophies.unshift({ y, t: `${y} 아시안게임 ${place}` });
      logNote({ note: `[아시안게임] ${place}. 병역 혜택은 금메달만 받아요. · ${trail.join(", ")}`, good: true });
      addNews("medal", { what: place }, "good");
    } else {
      logNote({ note: `[아시안게임] ${place}. · ${trail.join(", ")}` });
      addNews("medal", { what: place }, "bad");
    }
    return true;
  }

  // ---------- 경기/시즌 후처리 ----------
  const OVR_MARKS = [50, 60, 70, 80, 90];
  function afterEvents(pre) {
    let dirty = false;
    const x = X();
    rollSnap();
    const SPLIT = { spring: "스플릿 2", summer: "스플릿 3" };
    // 시즌 종료
    const h = player.history[0];
    if (h && h !== pre.hist && h.result) {
      dirty = true;
      const lbl = `${SPLIT[pre.split] || ""} 리그`;
      if (h.result === "우승!") {
        x.trophies.unshift({ y: yearOf(player.day), t: `${lbl} 우승` });
        x.fans += 800;
        addNews("title", { what: lbl }, "good");
      } else if (h.result.includes("준우승")) {
        addNews("runner", {}, "neutral");
      } else if (h.result.includes("실패")) {
        addNews("miss", {}, "bad");
      }
    }
    // 국제대회 우승
    for (const k of ["msi", "worlds"]) {
      const now = (player.intl || {})[k] || 0;
      if (now > x.prev[k]) {
        const nm = k === "msi" ? "MSI" : "월드 챔피언십";
        x.trophies.unshift({ y: yearOf(player.day), t: `${nm} 우승` });
        x.fans += k === "msi" ? 2500 : 6000;
        addNews("title", { what: nm }, "good");
        dirty = true;
      }
      x.prev[k] = now;
    }
    x.prev.titles = player.titles || 0;
    // 성장 이정표
    const o = overall();
    const crossed = OVR_MARKS.filter((m) => x.lastOvr < m && o >= m).pop();
    if (crossed) { addNews("milestone", { n: crossed }, "good"); dirty = true; }
    x.lastOvr = o;
    // 개인 순위 소식
    if (hasLeague() && player.team) {
      try {
        const rk = ranks();
        if (rk.pos <= 3 && (x.lastRank === null || x.lastRank > 3 || (rk.pos === 1 && x.lastRank !== 1))) {
          addNews("rank", { n: rk.pos }, "good");
          dirty = true;
        }
        x.lastRank = rk.pos;
      } catch (e) { console.warn("rank", e); }
    }
    if (checkMilitary()) dirty = true;
    if (checkAsian()) dirty = true;
    return dirty;
  }

  const _pushLog = window.pushLog;
  window.pushLog = function (entry, days) {
    let pre = null;
    try { X(); pre = { hist: player.history[0], split: player.season && player.season.split }; } catch {}
    _pushLog.apply(this, arguments);
    if (!pre) return;
    try {
      if (afterEvents(pre)) { saveGame(); render(); }
    } catch (e) { console.warn("extras", e); }
  };

  const _showMatch = window.showMatch;
  window.showMatch = function (r) {
    _showMatch.apply(this, arguments);
    try {
      const x = X();
      x.streak = r.win ? Math.max(0, x.streak) + 1 : Math.min(0, x.streak) - 1;
      x.fans = Math.max(0, x.fans + (r.win ? R(40, 140) : -R(0, 40)));
      const ctx = { opp: r.oppName || "상대" };
      const n = Math.abs(x.streak);
      if (r.win && n >= 3) addNews("streakW", { ...ctx, n }, "good");
      else if (!r.win && n >= 3) addNews("streakL", { ...ctx, n }, "bad");
      else addNews(r.win ? "win" : "lose", ctx, r.win ? "good" : "bad");
      saveGame();
      paint();
    } catch (e) { console.warn("extras match", e); }
  };

  // ---------- 화면 ----------
  const li = (cls, html) => `<li${cls ? ` class="${cls}"` : ""}>${html}</li>`;
  const sign = (d) => (d > 0 ? `<b class="up">▲${d}</b>` : d < 0 ? `<b class="down">▼${-d}</b>` : `<b>-</b>`);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function paintStatus() {
    const x = X();
    const d = overall() - x.snap.ovr;
    for (const k of GROW) {
      const v = $(`value-${k}`);
      if (!v) continue;
      const dl = player.stats[k] - x.snap.stats[k];
      v.innerHTML = `${player.stats[k]}${dl ? `<small class="dl ${dl > 0 ? "up" : "down"}">${dl > 0 ? "▲" : "▼"}${Math.abs(dl)}</small>` : ""}`;
    }
    let rankTxt = "-";
    if (hasLeague() && player.team) {
      try { const rk = ranks(); rankTxt = `${rk.all}위 · ${POSITIONS[player.position].label} ${rk.pos}위`; } catch {}
    }
    const mi = (player.intl || {});
    const na = nextAsian();
    $("status-list").innerHTML =
      li("", `<span>포지션</span><b>${POSITIONS[player.position].label}</b>`) +
      li("", `<span>개인 순위</span><b>${rankTxt}</b>`) +
      li("", `<span>올해 성장</span>${sign(d)}`) +
      li("", `<span>지난해 성장</span>${x.prevGrowth === null ? "<b>-</b>" : sign(x.prevGrowth)}`) +
      li("", `<span>우승</span><b>리그 ${player.titles || 0} · 국제 ${(mi.msi || 0) + (mi.worlds || 0)}</b>`) +
      li("", `<span>팬</span><b>${x.fans.toLocaleString("ko-KR")}명</b>`) +
      li(`wide mil ${x.mil.status}`, `<span>병역</span><b>${milFull()}</b>`) +
      (na ? li("wide", `<span>아시안게임</span><b>${na}년 9월 · 금메달=병역 면제</b>`) : "");
    // 육성 화면 요약 한 줄 (자세한 내용은 현황 탭)
    const hs = $("home-sum");
    if (hs) {
      const se = player.season;
      const parts = [];
      if (hasLeague() && player.team) {
        try { const rk = ranks(); parts.push(`개인 ${rk.all}위`); } catch {}
        parts.push(`시즌 ${se.w}승 ${se.l}패`);
      }
      parts.push(milShort());
      hs.innerHTML = `<span>${parts.join(" · ")}</span> <b>현황 ▸</b>`;
    }
    // 속보 한 줄
    const n0 = x.news[0];
    const st = $("news-strip");
    st.hidden = !n0;
    if (n0) st.innerHTML = `<span class="tag">속보</span> ${esc(n0.head)}`;
    // 선수 카드 병역 칩
    const chips = $("chips");
    if (chips && !chips.querySelector(".chip.mil")) chips.insertAdjacentHTML("beforeend", `<span class="chip mil">${milShort()}</span>`);
  }

  function paintSched() {
    const el = $("sched-card");
    el.hidden = !hasLeague();
    if (el.hidden) return;
    const se = player.season;
    const rows = [];
    const dueNow = se.phase === "regular";
    if (dueNow) {
      ensureSched(se);
      const done = se.results || [];
      let day = player.day;
      se.sched.forEach((opp, i) => {
        if (done[i]) {
          const r = done[i];
          rows.push(li(r.win ? "w" : "l", `<span>${i + 1}경기 vs ${esc(opp)}</span><b>${r.win ? "승" : "패"} (킬 ${r.k[0]}:${r.k[1]})</b>`));
        } else {
          const dd = player.day + 7 * (i - done.length);
          rows.push(li(i === done.length ? "next" : "", `<span>${i + 1}경기 vs ${esc(opp)}</span><b>${i === done.length ? "이번 주 · " : ""}${fmtMD(mdOf(dd))}</b>`));
        }
      });
      rows.push(li("po", `<span>플레이오프</span><b>정규시즌 4위 이내 → 4강 · 결승</b>`));
    } else if (se.phase === "playoff") {
      ROUNDS.forEach((r, i) => rows.push(li(i === se.round ? "next" : i < se.round ? "w" : "", `<span>플레이오프 ${r}</span><b>${i < se.round ? "통과" : i === se.round ? "이번 주" : "대기"}</b>`)));
    } else {
      rows.push(li("", `<span>다음 스플릿 개막 후 일정이 정해져요</span><b></b>`));
    }
    const na = nextAsian();
    if (na) rows.push(li("po", `<span>${na} 아시안게임</span><b>${na}.09.19 · 대표팀 선발</b>`));
    $("sched-list").innerHTML = rows.join("");
    $("sched-title").textContent = se.phase === "regular" ? `경기 일정 (${SPLIT_LABEL(se.split)} 정규시즌)` : "경기 일정";
  }
  const SPLIT_LABEL = (s) => (s === "spring" ? "스플릿 2" : "스플릿 3");

  function paintRank() {
    const el = $("rank-card");
    el.hidden = !(hasLeague() && player.team);
    if (el.hidden) return;
    const rk = ranks();
    const row = (r, i) => li(r.me ? "me" : "", `<span>${i + 1}</span><em>${esc(r.name)}${r.me ? " ★" : ""}</em><i>${esc(r.team)}</i><b>${r.rating}</b>`);
    $("rank-sum").textContent = `전체 ${rk.all}위 / ${rk.total}명 · ${POSITIONS[player.position].label} ${rk.pos}위 / ${rk.posTotal}명`;
    $("rank-pos-title").textContent = `${POSITIONS[player.position].label} 포지션 순위`;
    $("rank-pos").innerHTML = rk.same.slice(0, 5).map(row).join("") + (rk.pos > 5 ? row(rk.same[rk.pos - 1], rk.pos - 1) : "");
    $("rank-all").innerHTML = rk.rows.slice(0, 5).map(row).join("") + (rk.all > 5 ? row(rk.rows[rk.all - 1], rk.all - 1) : "");
  }

  function paintMastery() {
    const el = $("mastery-card");
    const ent = Object.entries(player.mastery || {}).sort((a, b) => b[1] - a[1]);
    const main = ent.filter(([, v]) => v >= POOL_MAIN).length;
    $("mastery-sum").textContent = `주력(50↑) ${main}개 · 챔프폭 ${player.stats.champPool}`;
    const list = $("mastery-list");
    if (!ent.length) { list.innerHTML = `<li class="empty-li">챔프 연습이나 경기를 하면 여기에 숙련도가 쌓여요.</li>`; return; }
    list.innerHTML = ent.slice(0, 20).map(([id, v]) => {
      const c = champById(id);
      const name = c ? c.name : id;
      const ico = c ? `<img src="${champIcon(c)}" alt="" width="28" height="28">` : `<span class="noimg"></span>`;
      const tag = v >= POOL_MAIN ? "주력" : v >= POOL_SUB ? "연습중" : "";
      return `<li class="${id === player.champion ? "cur" : ""}">${ico}<div class="mi"><div class="mn"><strong>${esc(name)}</strong>${id === player.champion ? " ★" : ""}<small>${tag}</small></div><div class="mbar"><div class="mfill${v >= POOL_MAIN ? " main" : ""}" style="width:${v}%"></div></div></div><b>${v}</b></li>`;
    }).join("");
  }

  function paintCareer() {
    const x = X();
    const mi = player.intl || {};
    const medals = x.trophies.filter((t) => t.t.includes("아시안게임")).length;
    $("career-sum").innerHTML =
      li("", `<span>평가</span><b>${careerGrade()}</b>`) +
      li("", `<span>통산 전적</span><b>${player.record.w}승 ${player.record.l}패</b>`) +
      li("", `<span>치른 시즌</span><b>${player.seasons || 0}</b>`) +
      li("", `<span>리그 우승</span><b>${player.titles || 0}회</b>`) +
      li("", `<span>MSI 우승</span><b>${mi.msi || 0}회</b>`) +
      li("", `<span>월즈 우승</span><b>${mi.worlds || 0}회</b>`) +
      li("", `<span>아시안게임 메달</span><b>${medals}개</b>`) +
      li("", `<span>병역</span><b>${milShort()}</b>`);
    $("career-trophies").innerHTML = x.trophies.length
      ? x.trophies.map((t) => li("", `<span>${t.y}</span><b>🏆 ${esc(t.t)}</b>`)).join("")
      : li("empty-li", "아직 우승 기록이 없어요. 첫 트로피를 노려보세요!");
    $("career-hist").innerHTML = player.history.length
      ? player.history.map((h) => li("", esc(h.text || `시즌 ${h.no} (${h.stage}) · ${h.record} · ${h.result}`))).join("")
      : li("empty-li", "시즌 기록이 아직 없어요.");
  }

  function paintNews() {
    const x = X();
    $("news-list").innerHTML = x.news.length
      ? x.news.map((n) => `<li class="${n.mood}"><small>${n.date}</small><strong>${esc(n.head)}</strong><ul>${n.comments.map((c) => `<li><b>${esc(c.u)}</b> ${esc(c.t)} <em>♥${c.likes}</em></li>`).join("")}</ul></li>`).join("")
      : `<li class="empty-li">아직 소식이 없어요. 경기를 치르면 기사와 댓글이 올라와요.</li>`;
  }

  function paint() {
    if (!player || !$("status-list")) return;
    try {
      X(); rollSnap();
      paintStatus(); paintSched(); paintRank(); paintMastery(); paintCareer(); paintNews();
    } catch (e) { console.warn("extras paint", e); }
  }

  const _render = window.render;
  window.render = function () {
    _render.apply(this, arguments);
    paint();
  };
  window.exT = T; window.exAddNews = addNews; window.exX = X; window.exRanks = ranks; window.exBoard = board;
  const strip = $("news-strip");
  if (strip) strip.addEventListener("click", () => { const d = $("news"); if (d && d.showModal) d.showModal(); });
})();
