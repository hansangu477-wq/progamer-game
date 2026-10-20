// fun.js — 결과/트로피 팝업, 밴픽(작전) 미니게임, 승부수, 라이벌, 특성, 칭호, 팀 케미, 랜덤 이벤트, 목표 퀘스트, 엔딩/회차 보너스/하드 모드
// extras.js 다음, ui.js 앞에서 불러옵니다.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const LEGACY_KEY = "pg-legacy";

  // ---------- 저장되는 데이터 ----------
  function F() {
    if (!player.f) player.f = {};
    const f = player.f;
    if (f.chem === undefined) f.chem = 50;
    if (!f.traits) f.traits = [];
    if (!f.honors) f.honors = {};
    if (!f.cnt) f.cnt = { solo: 0, scrim: 0, champ: 0, rest: 0, coach: 0, win: 0, lose: 0 };
    if (f.cd === undefined) f.cd = 3;
    if (f.questsDone === undefined) f.questsDone = 0;
    if (f.trophySeen === undefined) f.trophySeen = exX().trophies.length;
    if (!f.quests) f.quests = [];
    return f;
  }
  const lg = () => { try { return Number(localStorage.getItem(LEGACY_KEY)) || 0; } catch { return 0; } };
  const setLg = (v) => { try { localStorage.setItem(LEGACY_KEY, String(v)); } catch {} };
  const stoch = (x) => Math.floor(x + Math.random());

  // ---------- 팝업 (순서대로 하나씩) ----------
  const queue = [];
  let showing = false;
  let wrap = null;
  function ensureWrap() {
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.id = "pop";
    wrap.hidden = true;
    document.body.appendChild(wrap);
    return wrap;
  }
  function openPop(p) {
    ensureWrap();
    showing = true;
    wrap.hidden = false;
    wrap.className = "popwrap " + (p.cls || "");
    wrap.innerHTML = `<div class="popbox px">${p.html}<div class="popbtns"></div></div>`;
    const box = wrap.querySelector(".popbtns");
    (p.buttons || [{ t: "확인" }]).forEach((b) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "primary" + (b.alt ? " alt" : "");
      el.textContent = b.t;
      el.addEventListener("click", () => {
        closePop();
        try { if (b.fn) b.fn(); } catch (e) { console.warn(e); }
        pump();
      });
      box.appendChild(el);
    });
  }
  function closePop() { showing = false; if (wrap) wrap.hidden = true; }
  function enqueue(p) { queue.push(p); pump(); }
  function busy() {
    let anim = false;
    try { anim = !!playing; } catch {}
    const ev = $("event");
    return anim || (ev && !ev.hidden);
  }
  function pump() {
    if (showing || !queue.length) return;
    if (busy()) { setTimeout(pump, 400); return; }
    openPop(queue.shift());
  }
  setInterval(() => { if (!showing && queue.length) pump(); }, 500);

  // 하나씩 고르는 선택 팝업 (바로 띄움)
  function choose(title, text, opts, cls) {
    return new Promise((res) => {
      showing = true;
      ensureWrap();
      wrap.hidden = false;
      wrap.className = "popwrap " + (cls || "");
      wrap.innerHTML = `<div class="popbox px"><h2>${title}</h2><p>${text}</p><div class="popopts"></div></div>`;
      const box = wrap.querySelector(".popopts");
      opts.forEach((o, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "popopt";
        b.innerHTML = `<strong>${o.t}</strong>${o.d ? `<small>${o.d}</small>` : ""}`;
        b.addEventListener("click", () => { closePop(); res(i); pump(); });
        box.appendChild(b);
      });
    });
  }

  // ---------- 효과 적용 ----------
  function applyFx(fx) {
    const out = [];
    const s = player.stats;
    if (fx.money) { player.money = Math.max(0, player.money + fx.money); out.push(`${fx.money > 0 ? "+" : ""}${fx.money}만원`); }
    if (fx.mental) { s.mental = clamp(s.mental + fx.mental); out.push(`멘탈 ${fx.mental > 0 ? "+" : ""}${fx.mental}`); }
    if (fx.stamina) { s.stamina = clamp(s.stamina + fx.stamina); out.push(`체력 ${fx.stamina > 0 ? "+" : ""}${fx.stamina}`); }
    if (fx.fans) { const x = exX(); x.fans = Math.max(0, x.fans + fx.fans); out.push(`팬 ${fx.fans > 0 ? "+" : ""}${fx.fans}`); }
    if (fx.chem) { const f = F(); f.chem = clamp(f.chem + fx.chem); out.push(`팀워크 ${fx.chem > 0 ? "+" : ""}${fx.chem}`); }
    for (const k of ["laning", "teamfight", "decision"]) {
      if (fx[k]) { s[k] = clamp(s[k] + fx[k]); out.push(`${LABELS[k]} ${fx[k] > 0 ? "+" : ""}${fx[k]}`); }
    }
    if (fx.mastery && player.champion) { player.mastery[player.champion] = clamp((player.mastery[player.champion] ?? 20) + fx.mastery); out.push("숙련도 +" + fx.mastery); }
    return out.join(", ");
  }

  // ---------- 특성 ----------
  const TRAITS = {
    lane: { n: "라인전 괴물", d: "경기 보너스 +2, 솔로랭크 라인전 성장↑" },
    fight: { n: "한타 설계자", d: "경기 보너스 +2" },
    brain: { n: "판단 장인", d: "경기 보너스 +1, 상대 분석이 항상 정확" },
    iron: { n: "강철 체력", d: "행동 후 체력 +3 회복" },
    mind: { n: "멘탈 갑", d: "패배해도 멘탈 +4 보정" },
    star: { n: "스타성", d: "팬 증가 1.5배" },
    clutch: { n: "큰 경기 체질", d: "플레이오프·국제대회에서 +4" },
    master: { n: "장인 정신", d: "챔프 연습 숙련도 +2" },
    mood: { n: "분위기 메이커", d: "팀워크가 두 배로 오름" },
  };
  const has = (id) => F().traits.includes(id);
  const traitSlots = () => { const o = overall(); return o >= 80 ? 3 : o >= 65 ? 2 : o >= 50 ? 1 : 0; };
  let traitAsking = false;
  async function offerTrait() {
    const f = F();
    if (traitAsking || f.traits.length >= traitSlots() || player.over) return;
    traitAsking = true;
    const left = Object.keys(TRAITS).filter((k) => !f.traits.includes(k));
    const opts = left.sort(() => Math.random() - 0.5).slice(0, 3);
    const wait = () => (busy() || showing ? setTimeout(wait, 400) : go());
    const go = async () => {
      const i = await choose("특성 선택", `종합 능력치가 올라 새 특성을 얻을 수 있어요. (${f.traits.length + 1}/3)`, opts.map((k) => ({ t: TRAITS[k].n, d: TRAITS[k].d })), "trait");
      f.traits.push(opts[i]);
      exAddNews("honor", { what: `특성 '${TRAITS[opts[i]].n}'` }, "good");
      toast(`특성 획득: ${TRAITS[opts[i]].n}`);
      traitAsking = false;
      saveGame(); render();
    };
    wait();
  }

  // ---------- 경기 보너스 합계 (양수면 내게 유리) ----------
  let draftBonus = 0;
  function delta() {
    const f = F();
    let d = draftBonus;
    if (has("lane")) d += 2;
    if (has("fight")) d += 2;
    if (has("brain")) d += 1;
    let big = false;
    try { big = player.season.phase === "playoff" || tourneyActive(); } catch {}
    if (has("clutch") && big) d += 4;
    d += (f.chem - 50) / 12; // 팀워크 -4 ~ +4
    if (f.hard) d -= 3;
    return d;
  }
  const _sim = window.simulateMatch;
  window.simulateMatch = function (ob, on, rw) {
    return _sim.call(this, (ob || 0) - delta(), on, rw);
  };

  // ---------- 상대 스타일 / 밴픽 ----------
  const STYLES = [
    { id: 0, n: "라인전형", d: "초반 주도권을 잡고 몰아붙이는 팀", beats: 2 },
    { id: 1, n: "한타형", d: "중후반 한타 한 방을 노리는 팀", beats: 0 },
    { id: 2, n: "운영형", d: "시야와 오브젝트로 천천히 이기는 팀", beats: 1 },
  ];
  // 내가 고른 스타일이 상대 스타일의 약점이면 유리: 라인전>운영>한타>라인전
  const COUNTER = { 0: 2, 2: 1, 1: 0 }; // 내 스타일 -> 이기는 상대 스타일
  let lastDraft = null;
  function oppStyle(seedName) {
    return strSeed(`${seedName}|${player.day}|style`) % 3;
  }
  async function draft(label, oppName, run) {
    const f = F();
    const real = oppStyle(oppName || label);
    const accurate = has("brain") || player.stats.decision >= 55 || Math.random() < 0.65;
    const shown = accurate ? real : (real + 1 + R(0, 1)) % 3;
    const rivalHere = f.rival && oppName && f.rival.team === oppName;
    const intro = `<b>${esc(label)}</b> vs <b>${esc(oppName || "상대 팀")}</b>${rivalHere ? `<br>⚔ 라이벌 <b>${esc(f.rival.name)}</b> 출전! (전적 ${f.rival.w}승 ${f.rival.l}패)` : ""}<br>분석팀 보고: 상대는 <b>${STYLES[shown].n}</b>로 보입니다. <small>(${accurate ? "정확도 높음" : "정확도 낮음 — 틀릴 수 있어요"})</small><br><small>상성: 라인전 → 운영 → 한타 → 라인전</small>`;
    const i = await choose("작전 회의", intro, [
      ...STYLES.map((s) => ({ t: `${s.n} 작전`, d: s.d })),
      { t: "자동 진행", d: "작전 없이 경기 (보너스 없음)" },
    ], "draft");
    if (i === 3) { lastDraft = null; return run(0); }
    let bonus = COUNTER[i] === real ? 5 : COUNTER[real] === i ? -4 : 0;
    const note = [`${STYLES[i].n} 작전: ${bonus > 0 ? "상성 우위!" : bonus < 0 ? "상성 열세..." : "무난한 상성"}`];
    const g = await choose("승부수", "경기 흐름을 바꿀 한 수를 정해요.", [
      { t: "안정 운영", d: "무리하지 않는다 (+1)" },
      { t: "승부수!", d: "성공하면 +7, 실패하면 -6 (확률 50%)" },
    ], "draft");
    let gamble = null;
    if (g === 0) bonus += 1;
    else {
      const ok = Math.random() < (has("clutch") ? 0.6 : 0.5);
      bonus += ok ? 7 : -6;
      gamble = ok;
      note.push(ok ? "승부수 적중!" : "승부수 실패...");
    }
    lastDraft = { note, style: STYLES[i].n, real: STYLES[real].n, gamble };
    return run(bonus);
  }
  function wrapPlay(name) {
    const orig = window[name];
    window[name] = function () {
      if (window.__draftGo) return orig.apply(this, arguments);
      let ok = false;
      try {
        ok = !player.over && !player.pendingEvent && (name === "playMatch" ? domesticDue() : tourneyDue()) && !(champData && !player.champion) && STAGES[player.stage].matchLevel;
      } catch {}
      if (!ok || showing) return orig.apply(this, arguments);
      const self = this, args = arguments;
      let label = "리그 경기", opp = null;
      try {
        label = matchLabel();
        if (name === "playMatch" && player.season.phase === "regular") { ensureSched(player.season); opp = player.season.sched[player.season.games]; }
        if (name === "playTourney") { const p = tourneyAdvance(player.tourney); if (p) opp = player.tourney.teams[p.opp].name; }
      } catch {}
      draft(label, opp, (b) => {
        draftBonus = b;
        window.__draftGo = true;
        try { orig.apply(self, args); } finally { window.__draftGo = false; draftBonus = 0; }
      });
    };
  }
  wrapPlay("playMatch");
  wrapPlay("playTourney");

  // ---------- 라이벌 ----------
  function ensureRival() {
    const f = F();
    if (!exX || player.stage === "amateur" || !player.team) return;
    let rows;
    try { rows = exBoard(); } catch { return; }
    const same = rows.filter((r) => r.pos === player.position && !r.me && r.team !== player.team.name);
    if (f.rival && same.some((r) => r.name === f.rival.name)) return;
    if (!same.length) return;
    let cand = same;
    try {
      const se = player.season;
      const next = (se.sched || []).slice(se.games || 0, (se.games || 0) + 4);
      const sel = same.filter((r) => next.includes(r.team));
      if (sel.length) cand = sel;
    } catch {}
    const top = cand.sort((a, b) => b.rating - a.rating).slice(0, 3);
    const r = pick(top);
    f.rival = { name: r.name, team: r.team, w: f.rival ? f.rival.w : 0, l: f.rival ? f.rival.l : 0 };
    logNote({ note: `라이벌 등장: ${r.team}의 ${r.name}! 같은 포지션에서 자주 맞붙게 돼요.` });
  }

  // ---------- 퀘스트 ----------
  const QT = [
    { k: "solo", n: 3, t: "솔로랭크 3회", fx: { laning: 1, mental: 3 } },
    { k: "scrim", n: 2, t: "스크림 2회", fx: { teamfight: 1, chem: 5 }, min: "academy" },
    { k: "champ", n: 2, t: "챔프 연습 2회", fx: { mastery: 6 } },
    { k: "rest", n: 2, t: "휴식 2회", fx: { mental: 6, stamina: 10 } },
    { k: "win", n: 2, t: "경기 2승", fx: { money: 150, fans: 150 }, min: "academy" },
    { k: "streak", n: 3, t: "3연승 달성", fx: { fans: 400, mental: 8 }, min: "academy" },
    { k: "ovr", n: 2, t: "종합 +2 상승", fx: { money: 100, decision: 1 } },
    { k: "chem", n: 70, t: "팀워크 70 달성", fx: { fans: 200, money: 100 }, min: "academy" },
  ];
  const stageIdx = (s) => ["amateur", "academy", "pro"].indexOf(s);
  function baseOf(k) {
    const f = F();
    return k === "ovr" ? overall() : f.cnt[k] || 0;
  }
  function progressOf(q) {
    const f = F();
    if (q.k === "ovr") return overall() - q.base;
    if (q.k === "streak") return Math.max(0, exX().streak);
    if (q.k === "chem") return f.chem;
    return (f.cnt[q.k] || 0) - q.base;
  }
  function newQuest(exclude) {
    const f = F();
    const pool = QT.filter((q) => (!q.min || stageIdx(player.stage) >= stageIdx(q.min)) && !f.quests.some((x) => x.k === q.k) && !exclude.includes(q.k));
    if (!pool.length) return null;
    const q = pick(pool);
    return { k: q.k, n: q.n, t: q.t, fx: q.fx, base: q.k === "streak" || q.k === "chem" ? 0 : baseOf(q.k) };
  }
  function ensureQuests() {
    const f = F();
    f.quests = f.quests.filter((q) => !q.min || true);
    while (f.quests.length < 3) {
      const q = newQuest([]);
      if (!q) break;
      f.quests.push(q);
    }
  }
  function checkQuests() {
    const f = F();
    let any = false;
    for (let i = 0; i < f.quests.length; i++) {
      const q = f.quests[i];
      if (progressOf(q) >= q.n) {
        const got = applyFx(q.fx);
        f.questsDone++;
        toast(`퀘스트 완료! ${q.t} → ${got}`);
        logNote({ note: `퀘스트 완료: ${q.t} (${got})`, good: true });
        f.quests.splice(i, 1);
        i--;
        any = true;
      }
    }
    if (any) ensureQuests();
    return any;
  }

  // ---------- 칭호 ----------
  const HONORS = [
    { id: "s5", n: "불꽃 연승러", t: () => exX().streak >= 5 },
    { id: "s10", n: "무적의 10연승", t: () => exX().streak >= 10 },
    { id: "m90", n: "챔피언 장인", t: () => Object.values(player.mastery).some((v) => v >= 90) },
    { id: "o80", n: "에이스", t: () => overall() >= 80 },
    { id: "o90", n: "완성형 괴물", t: () => overall() >= 90 },
    { id: "fan", n: "슈퍼스타", t: () => exX().fans >= 10000 },
    { id: "fan2", n: "국민 선수", t: () => exX().fans >= 50000 },
    { id: "riv", n: "라이벌 킬러", t: () => !!F().rival && F().rival.w >= 3 && F().rival.w > F().rival.l },
    { id: "ex", n: "병역 해결사", t: () => exX().mil.status === "exempt" },
    { id: "ti", n: "첫 우승", t: () => (player.titles || 0) >= 1 },
    { id: "ms", n: "국제무대 정복자", t: () => ((player.intl || {}).msi || 0) >= 1 },
    { id: "wc", n: "월드 챔피언", t: () => ((player.intl || {}).worlds || 0) >= 1 },
    { id: "ch", n: "팀의 심장", t: () => F().chem >= 90 },
    { id: "qd", n: "목표 달성러", t: () => F().questsDone >= 5 },
  ];
  function checkHonors() {
    const f = F();
    let any = false;
    for (const h of HONORS) {
      if (!f.honors[h.id] && h.t()) {
        f.honors[h.id] = fmtDate(player.day);
        toast(`칭호 획득: ${h.n}`);
        exAddNews("honor", { what: `'${h.n}'` }, "good");
        any = true;
      }
    }
    return any;
  }

  // ---------- 랜덤 이벤트 ----------
  const EV = [
    { id: "sponsor", min: "pro", t: "스폰서 제안", x: "한 브랜드가 광고 모델 제안을 해왔어요.", c: [["계약한다", "+300만원, 멘탈 -3", { money: 300, mental: -3 }], ["정중히 거절", "집중력 유지 (멘탈 +2)", { mental: 2 }]] },
    { id: "bcast", min: "academy", t: "방송 출연 제안", x: "인기 방송에서 게스트로 나와 달래요.", c: [["출연한다", "팬 +500, 체력 -10", { fans: 500, stamina: -10 }], ["훈련에 집중", "멘탈 +3", { mental: 3 }]] },
    { id: "family", min: "amateur", t: "가족의 응원", x: "가족이 연락해 응원해 줬어요.", c: [["통화하며 힘을 얻는다", "멘탈 +8", { mental: 8 }], ["바로 연습으로", "라인전 +1, 체력 -5", { laning: 1, stamina: -5 }]] },
    { id: "fight", min: "academy", t: "팀원 불화", x: "연습 중 팀원과 의견이 갈려 분위기가 싸해졌어요.", c: [["중재한다", "팀워크 +10, 멘탈 -3", { chem: 10, mental: -3 }], ["모른 척한다", "팀워크 -8", { chem: -8 }]] },
    { id: "dinner", min: "academy", t: "팀 회식", x: "코치가 팀 회식을 제안했어요.", c: [["참석한다", "팀워크 +8, 20만원, 체력 -5", { chem: 8, money: -20, stamina: -5 }], ["쉬겠다", "체력 +5", { stamina: 5 }]] },
    { id: "vod", min: "amateur", t: "분석 영상", x: "프로 경기 분석 영상을 발견했어요.", c: [["밤새 분석한다", "판단력 +2, 체력 -10", { decision: 2, stamina: -10 }], ["적당히 보고 잔다", "판단력 +1", { decision: 1 }]] },
    { id: "letter", min: "academy", t: "팬레터", x: "팬이 정성스러운 편지를 보냈어요.", c: [["답장을 쓴다", "팬 +200, 멘탈 +5", { fans: 200, mental: 5 }], ["마음만 받는다", "멘탈 +2", { mental: 2 }]] },
    { id: "wrist", min: "amateur", t: "손목 통증", x: "손목이 욱신거려요.", c: [["쉰다", "체력 +10", { stamina: 10 }], ["참고 연습", "라인전 +1, 체력 -15, 멘탈 -5", { laning: 1, stamina: -15, mental: -5 }]] },
    { id: "rumor", min: "pro", t: "이적설 보도", x: "다른 팀이 관심을 보인다는 기사가 났어요.", c: [["부인한다", "팀워크 +3", { chem: 3 }], ["즐긴다", "팬 +300, 팀워크 -5", { fans: 300, chem: -5 }]] },
    { id: "rivalev", min: "pro", need: "rival", t: "라이벌의 도발", x: "라이벌이 인터뷰에서 도발했어요.", c: [["맞받아친다", "팬 +400, 멘탈 -4", { fans: 400, mental: -4 }], ["무시한다", "멘탈 +3", { mental: 3 }]] },
    { id: "duo", min: "amateur", t: "스트리머 듀오 제안", x: "유명 스트리머가 듀오를 하자고 해요.", c: [["승낙", "팬 +300, 라인전 +1, 체력 -8", { fans: 300, laning: 1, stamina: -8 }], ["거절", "멘탈 +2", { mental: 2 }]] },
    { id: "coach", min: "academy", t: "코치의 특훈", x: "코치가 따로 불러 특훈을 제안해요.", c: [["받는다", "한타 +2, 체력 -12", { teamfight: 2, stamina: -12 }], ["다음에", "멘탈 +2", { mental: 2 }]] },
  ];
  async function runEvent() {
    const f = F();
    const pool = EV.filter((e) => stageIdx(player.stage) >= stageIdx(e.min) && (!e.need || f[e.need]) && e.id !== f.lastEv);
    if (!pool.length) return;
    const e = pick(pool);
    f.lastEv = e.id;
    f.cd = 4;
    const wait = () => (busy() || showing ? setTimeout(wait, 400) : go());
    const go = async () => {
      const i = await choose(e.t, e.x, e.c.map((c) => ({ t: c[0], d: c[1] })), "event");
      const got = applyFx(e.c[i][2]);
      logNote({ note: `[${e.t}] ${e.c[i][0]} (${got})`, good: true });
      saveGame(); render();
    };
    wait();
  }

  // ---------- 결과 / 트로피 팝업 ----------
  const TROPHY_SVG = `<svg class="trophy" viewBox="0 0 16 16" width="96" height="96" shape-rendering="crispEdges" aria-hidden="true"><g fill="#ffd23f"><rect x="4" y="1" width="8" height="1"/><rect x="3" y="2" width="10" height="4"/><rect x="4" y="6" width="8" height="2"/><rect x="5" y="8" width="6" height="1"/><rect x="7" y="9" width="2" height="2"/><rect x="5" y="11" width="6" height="1"/><rect x="4" y="12" width="8" height="2"/><rect x="1" y="2" width="2" height="1"/><rect x="1" y="3" width="1" height="3"/><rect x="2" y="6" width="2" height="1"/><rect x="13" y="2" width="2" height="1"/><rect x="14" y="3" width="1" height="3"/><rect x="12" y="6" width="2" height="1"/></g><g fill="#fff6c2"><rect x="4" y="2" width="1" height="3"/><rect x="5" y="2" width="1" height="1"/></g><g fill="#c98f00"><rect x="11" y="3" width="1" height="3"/><rect x="10" y="6" width="2" height="1"/><rect x="10" y="12" width="2" height="2"/></g></svg>`;
  const CONFETTI = Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 6) * 0.15}s;background:${["#ffd23f", "#4cc9ff", "#ff5e7e", "#5df0a8"][i % 4]}"></i>`).join("");
  function trophyPop(t) {
    enqueue({
      cls: "trophywrap",
      html: `<div class="confetti">${CONFETTI}</div>${TROPHY_SVG}<h2>우승!</h2><p class="tname">🏆 ${esc(t.t)}</p><p>${esc(player.name)} 선수가 트로피를 들어 올렸어요!</p>`,
      buttons: [{ t: "트로피 보기", fn: () => { const d = $("career"); if (d && d.showModal) d.showModal(); } }, { t: "확인", alt: true }],
    });
  }
  function checkTrophies() {
    const f = F(), x = exX();
    const n = x.trophies.length - f.trophySeen;
    if (n <= 0) { f.trophySeen = x.trophies.length; return; }
    f.trophySeen = x.trophies.length;
    for (let i = n - 1; i >= 0; i--) trophyPop(x.trophies[i]);
  }
  function resultPop(r) {
    const f = F();
    const win = !!r.win;
    const lines = [];
    lines.push(`<p class="vs">${esc(player.team ? player.team.name : "우리 팀")} <b>${r.kills[0]}</b> : <b>${r.kills[1]}</b> ${esc(r.oppName || "상대 팀")}</p>`);
    if (lastDraft) lines.push(`<p class="sm">${lastDraft.note.map(esc).join(" · ")}</p>`);
    if (r.laneName) lines.push(`<p class="sm">맞상대 ${esc(r.laneName)}</p>`);
    let rv = "";
    if (f.rival && r.oppPlayers && r.oppPlayers[player.position] === f.rival.name) rv = `<p class="sm riv">⚔ 라이벌 ${esc(f.rival.name)}전 · 통산 ${f.rival.w}승 ${f.rival.l}패</p>`;
    const gain = player.log[0] && player.log[0].gains ? "" : "";
    const note = player.log[0] && player.log[0].note ? player.log[0].note : "";
    const gm = /·\s*(.+)$/.exec(note);
    enqueue({
      cls: win ? "win" : "lose",
      html: `<h2>${win ? "승리!" : "패배..."}</h2><p class="lbl">${esc(r.label || "리그 경기")}</p>${lines.join("")}${rv}${gm ? `<p class="sm up">${esc(gm[1])}</p>` : ""}`,
      buttons: [{ t: "확인" }, { t: "육성 화면으로", alt: true, fn: () => openTab("home") }],
    });
  }

  // ---------- 경기/행동 후 처리 ----------
  const _showMatch = window.showMatch;
  window.showMatch = function (r) {
    _showMatch.apply(this, arguments);
    try {
      const f = F(), x = exX();
      f.cnt[r.win ? "win" : "lose"]++;
      f.chem = clamp(f.chem + (r.win ? (has("mood") ? 4 : 2) : -1));
      if (!r.win && has("mind")) player.stats.mental = clamp(player.stats.mental + 4);
      if (has("star") && r.win) x.fans += R(20, 70);
      // 라이벌전 기록
      if (f.rival && r.oppPlayers && r.oppPlayers[player.position] === f.rival.name) {
        f.rival[r.win ? "w" : "l"]++;
        player.stats.mental = clamp(player.stats.mental + (r.win ? 3 : -3));
        exAddNews("rival", { opp: f.rival.name, n: `${f.rival.w}승 ${f.rival.l}패` }, r.win ? "good" : "bad");
      }
      checkQuests(); checkHonors();
      resultPop(r);
      checkTrophies();
      lastDraft = lastDraft && null;
      saveGame();
      render();
    } catch (e) { console.warn("fun match", e); }
  };

  const LAB = { 솔로랭크: "solo", 스크림: "scrim", "챔프 연습": "champ", 휴식: "rest", "개인 코칭": "coach" };
  const _pushLog = window.pushLog;
  window.pushLog = function (entry, days) {
    try {
      F();
      if (entry && entry.label) {
        const f = F();
        const k = LAB[entry.label];
        if (k) f.cnt[k]++;
        if (has("iron")) player.stats.stamina = clamp(player.stats.stamina + 3);
        if (entry.label === "챔프 연습" && has("master") && player.champion) player.mastery[player.champion] = clamp((player.mastery[player.champion] ?? 20) + 2);
        if (entry.label === "솔로랭크" && has("lane") && Math.random() < 0.5) player.stats.laning = clamp(player.stats.laning + 1);
        if (entry.label === "스크림") f.chem = clamp(f.chem + (has("mood") ? 8 : 4));
        f.cd = Math.max(0, f.cd - 1);
      }
    } catch {}
    _pushLog.apply(this, arguments);
    try {
      const f = F();
      let dirty = checkQuests();
      dirty = checkHonors() || dirty;
      checkTrophies();
      if (f.cd <= 0 && !player.over && !player.pendingEvent && Math.random() < 0.18 && !(entry && entry.note && /vs/.test(entry.note))) runEvent();
      if (dirty) { saveGame(); render(); }
    } catch (e) { console.warn("fun log", e); }
  };

  // ---------- 엔딩 / 회차 보너스 ----------
  function ending() {
    const f = F(), x = exX();
    const mi = player.intl || {};
    const asianGold = x.trophies.some((t) => t.t.includes("아시안게임 금메달"));
    let pts = (mi.worlds || 0) * 6 + (mi.msi || 0) * 3 + (player.titles || 0) * 2 + (asianGold ? 3 : 0) + (player.stage === "pro" ? 2 : player.stage === "academy" ? 1 : 0);
    if (f.hard) pts *= 2;
    let title, text;
    if ((mi.worlds || 0) >= 2) { title = "전설의 엔딩"; text = "월드 챔피언십을 두 번 이상 제패한 전설. 후배들이 당신의 플레이를 교과서처럼 돌려 봅니다."; }
    else if ((mi.worlds || 0) >= 1) { title = "월드 챔피언 엔딩"; text = "월드 챔피언의 영광. 은퇴식에서 팬들이 한목소리로 당신의 이름을 외쳤어요."; }
    else if (asianGold) { title = "태극마크의 엔딩"; text = "아시안게임 금메달의 주인공. 국가대표 에이스로 오래 기억될 거예요."; }
    else if (x.mil.status === "done" && player.stage === "pro") { title = "군백기를 이겨낸 베테랑"; text = "군 복무까지 마치고 돌아온 끈기. 후배들의 든든한 맏형이 되었어요."; }
    else if ((player.titles || 0) >= 1) { title = "리그의 우승자 엔딩"; text = "우승 트로피를 품은 채 마무리한 커리어. 코치로 새 출발을 준비합니다."; }
    else if (player.stage === "pro") { title = "지도자의 길"; text = "화려한 트로피는 없었지만, 경험을 살려 코치로 새 출발을 합니다."; }
    else { title = "아쉬운 꿈"; text = "프로 무대에는 서지 못했지만, 이 도전은 값진 추억으로 남았어요. 다음엔 더 잘할 수 있어요!"; }
    return { title, text, pts };
  }
  const _render = window.render;
  window.render = function () {
    _render.apply(this, arguments);
    try { paint(); } catch (e) { console.warn("fun paint", e); }
  };

  const _create = window.createPlayer;
  window.createPlayer = function (name, pos) {
    const p = _create.apply(this, arguments);
    try {
      const hard = $("hard-mode") && $("hard-mode").checked;
      p.f = { hard: !!hard };
      const pts = Math.min(15, lg());
      if (pts > 0) {
        p.talent = Math.min(1.45, Math.round((p.talent + pts * 0.01) * 100) / 100);
        p.money += pts * 50;
        setLg(0);
        setTimeout(() => toast(`회차 보너스 적용! 재능 +${pts}%p, 시작 자금 +${pts * 50}만원`), 600);
      }
    } catch {}
    return p;
  };

  // ---------- 화면 ----------
  function paint() {
    if (!player || !$("quest-list")) return;
    const f = F(), x = exX();
    ensureRival();
    ensureQuests();
    if (checkQuests()) {}
    checkHonors();
    checkTrophies();
    if (traitSlots() > f.traits.length) offerTrait();
    // 이적설
    if (player.pendingEvent === "contract" && !f.contractNews) {
      f.contractNews = true;
      exAddNews("transfer", {}, "neutral");
    }
    if (player.pendingEvent !== "contract") f.contractNews = false;
    // 엔딩
    if (player.over) {
      if (!f.ending) {
        f.ending = ending();
        if (!f.legacyGiven) { setLg(lg() + f.ending.pts); f.legacyGiven = true; }
        saveGame();
      }
      const ot = $("over-text");
      if (ot) ot.innerHTML = `${esc(player.over.reason)}<br><br><b>${esc(f.ending.title)}</b><br>${esc(f.ending.text)}<br><small>다음 선수 회차 보너스 +${f.ending.pts} (재능·시작 자금)</small>`;
    }
    // 퀘스트
    $("quest-sum").textContent = `완료 ${f.questsDone}개`;
    $("quest-list").innerHTML = f.quests.map((q) => {
      const p = Math.min(q.n, Math.max(0, progressOf(q)));
      return `<li><span>${esc(q.t)}</span><b>${p}/${q.n}</b></li>`;
    }).join("") || `<li class="empty-li">진행 중인 퀘스트가 없어요.</li>`;
    // 현황 카드에 라이벌·특성·팀워크 추가
    const sl = $("status-list");
    if (sl && !sl.querySelector(".fx")) {
      const li = (cls, k, v) => `<li class="${cls}"><span>${k}</span><b>${v}</b></li>`;
      sl.insertAdjacentHTML("beforeend",
        li("fx", "팀워크", `${f.chem}${f.chem >= 70 ? " (좋음)" : f.chem < 35 ? " (불안)" : ""}`) +
        li("fx", "특성", f.traits.length ? f.traits.map((k) => TRAITS[k].n).join(", ") : "아직 없음 (종합 50부터)") +
        (f.rival ? li("fx wide", "라이벌", `${esc(f.rival.name)} (${esc(f.rival.team)}) ${f.rival.w}승 ${f.rival.l}패`) : "") +
        (f.hard ? li("fx wide", "모드", "하드 모드") : ""));
    }
    // 커리어 창: 칭호
    const cd = $("career");
    if (cd) {
      let box = $("career-honors");
      if (!box) {
        cd.querySelector("#career-trophies").insertAdjacentHTML("afterend", `<h3>칭호</h3><ul class="kv" id="career-honors"></ul>`);
        box = $("career-honors");
      }
      const got = HONORS.filter((h) => f.honors[h.id]);
      box.innerHTML = got.length ? got.map((h) => `<li><span>${f.honors[h.id]}</span><b>🎖 ${h.n}</b></li>`).join("") : `<li class="empty-li">아직 칭호가 없어요.</li>`;
    }
  }

  // 뉴스 문구 추가
  Object.assign(exT, {
    rival: { head: ["{name}, 라이벌 {opp}와 맞대결… 통산 {n}", "라이벌전 화제! {name} vs {opp}"], cm: ["이 라이벌전 진짜 재밌다 ㅋㅋ", "{opp} vs {name} 언제 봐도 명승부", "라이벌 구도 좋다", "{name} 오늘 제대로 불탔다"] },
    honor: { head: ["{name}, {what} 획득!", "[칭호] {name} — {what}"], cm: ["축하합니다!", "이거 인정이지 ㅋㅋ", "{name} 대단하다", "다음 칭호도 기대된다"] },
    transfer: { head: ["{name} FA 시장 나올까… 복수 팀 관심", "{name} 재계약 협상 난항? 이적설 솔솔"], cm: ["{team} 남아줘 제발 ㅠㅠ", "연봉 많이 주는 곳으로 가라", "이적설 뜨면 뭐가 되든 간다", "재계약 기원합니다"] },
  });
  setTimeout(() => { try { if (player) paint(); } catch {} }, 0);
})();
