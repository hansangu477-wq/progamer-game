// ---------- 기본 데이터 ----------
const SAVE_KEY = "lol-manager-save";
const START_AGE = 15;
const WEEKS_PER_YEAR = 52;

const LABELS = {
  laning: "라인전",
  teamfight: "한타",
  decision: "판단력",
  champPool: "챔프폭",
  mental: "멘탈",
  stamina: "체력",
};

// 포지션별 시작 보너스 (기본 능력치에 더해집니다)
const POSITIONS = {
  top:     { label: "탑",     bonus: { laning: 10, teamfight: 3 } },
  jungle:  { label: "정글",   bonus: { decision: 10, teamfight: 3 } },
  mid:     { label: "미드",   bonus: { laning: 8, decision: 3 } },
  adc:     { label: "원딜",   bonus: { teamfight: 10, laning: 3 } },
  support: { label: "서포터", bonus: { decision: 8, teamfight: 5 } },
};

// 커리어 단계: amateur -> academy -> pro
// growth: 성장 배율 / need: 다음 단계 테스트에 필요한 종합 능력치
const STAGES = {
  amateur: {
    label: "아마추어",
    growth: 1.0,
    next: "academy",
    need: 52,
    testName: "아카데미 입단 테스트",
    goal: "솔로랭크로 실력을 쌓아 아카데미 입단 테스트에 도전하세요.",
  },
  academy: {
    label: "아카데미",
    growth: 1.2,
    matchLevel: 52, // 리그 경기 상대/팀원 평균 실력
    minGames: 5, // 승격 테스트 조건: 이 단계에서 치른 경기 수
    minWinRate: 0.5, // 승격 테스트 조건: 이 단계 승률
    next: "pro",
    need: 72,
    testName: "프로 승격 테스트",
    goal: "아카데미 리그에서 성적(5경기 이상, 승률 50% 이상)과 실력을 증명하세요.",
  },
  pro: {
    label: "프로",
    growth: 1.1,
    matchLevel: 66,
    next: null,
    goal: "프로 무대에 올랐어요! 리그 경기는 다음 단계에서 열립니다.",
  },
};

// gains: [최소, 최대] 만큼 랜덤 성장 / fixed: 고정 증감 / stages: 할 수 있는 단계
const ACTIONS = {
  soloQueue: {
    label: "솔로랭크",
    stages: ["amateur", "academy", "pro"],
    gains: { laning: [1, 3], decision: [0, 2], teamfight: [0, 1] },
    fixed: { stamina: -12, mental: -5 },
  },
  scrim: {
    label: "스크림",
    stages: ["academy", "pro"], // 팀이 있어야 할 수 있어요
    gains: { teamfight: [1, 3], decision: [1, 2] },
    fixed: { stamina: -15, mental: -3 },
  },
  champ: {
    label: "챔프 연습",
    stages: ["amateur", "academy", "pro"],
    gains: {},
    fixed: { stamina: -8 },
  },
  rest: {
    label: "휴식",
    stages: ["amateur", "academy", "pro"],
    gains: {},
    fixed: { stamina: 30, mental: 10 },
  },
  coach: {
    label: "개인 코칭",
    stages: ["academy", "pro"],
    cost: 300, // 만원
    gains: { laning: [1, 2], teamfight: [1, 2], decision: [1, 2] },
    fixed: { stamina: -5 },
  },
  vacation: {
    label: "휴가",
    stages: ["academy", "pro"],
    cost: 200,
    gains: {},
    fixed: { stamina: 40, mental: 20 },
  },
  shop: { label: "장비 상점", stages: ["academy", "pro"], gains: {}, fixed: {} },
  position: { label: "포지션 변경", stages: ["amateur", "academy", "pro"], gains: {}, fixed: {} },
};

// ---------- 챔피언 / 시즌 설정 ----------
const DD = "https://ddragon.leagueoflegends.com"; // Riot Data Dragon (챔피언 데이터/아이콘)
const CHAMP_KEY = "lol-manager-champs";
let champData = null; // { version, list: [{ id, name, tags, img }] }
let champFailed = false;

// 챔피언 태그가 라인전/한타에 주는 보정, 포지션별로 어울리는 태그
const TAG_BIAS = {
  Fighter: { lane: 4, fight: 2 },
  Tank: { lane: -2, fight: 5 },
  Mage: { lane: 3, fight: 3 },
  Assassin: { lane: 5, fight: -1 },
  Marksman: { lane: 1, fight: 5 },
  Support: { lane: -1, fight: 4 },
};
const POSITION_TAGS = {
  top: ["Fighter", "Tank"],
  jungle: ["Fighter", "Assassin", "Tank"],
  mid: ["Mage", "Assassin"],
  adc: ["Marksman"],
  support: ["Support", "Tank", "Mage"],
};

const SEASON_GAMES = 10; // 정규시즌 경기 수
const ROUNDS = ["4강", "결승"];
const TEAM_NAMES = ["T2", "젠제트", "한와 라이프", "디마이너스 카이아", "농삼 레드포스", "DRZ", "KT 롤러"];
const newSeason = (no = 1) => ({
  no,
  phase: "idle", // idle -> regular -> playoff (달력이 시작시킴)
  split: null, // spring | summer
  games: 0,
  w: 0,
  l: 0,
  rank: 0,
  round: 0,
  table: null,
  teams: TEAM_NAMES.map((name) => ({ name, str: randInt(-6, 6) })),
});

// ---------- 유틸 ----------
const clamp = (v) => Math.max(0, Math.min(100, v));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// ---------- 저장 / 불러오기 ----------
let player = null;

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // 예전 저장 데이터 보정
    if (!p.stage) p.stage = "amateur";
    if (!p.log) p.log = [];
    if (!p.record) p.record = { w: 0, l: 0 };
    if (!p.stageRecord) p.stageRecord = { ...p.record };
    if (!p.season) p.season = newSeason();
    if (!p.history) p.history = [];
    if (!p.mastery) p.mastery = {};
    if (p.champion === undefined) p.champion = null;
    if (p.money === undefined) p.money = 0;
    if (p.pendingEvent === undefined) p.pendingEvent = null;
    if (p.over === undefined) p.over = null;
    if (!p.gear) p.gear = { mouse: 0, keyboard: 0, monitor: 0, chair: 0, headset: 0 };
    if (p.day === undefined) p.day = (p.week - 1) * 7;
    if (!p.qual) p.qual = { year: 0, msi: 0, worlds: 0 };
    if (p.tourney === undefined) p.tourney = null;
    if (!p.intl) p.intl = { msi: 0, worlds: 0 };
    if (!p.intlDone) p.intlDone = {};
    if (p.season.phase !== "idle" && !p.season.split) p.season = newSeason(p.season.no); // 예전 시즌은 다음 스플릿부터
    if (p.stage !== "amateur" && !p.team) p.team = makeTeam(p.stage);
    // 예전 이름으로 저장된 팀/리그 팀을 새 패러디 이름으로 바꿉니다
    if (p.team && p.team.names.some((n) => !MATE_NAMES.includes(n))) {
      p.team = makeTeam(p.stage, p.team.level - STAGES[p.stage].matchLevel);
    }
    if (p.season.teams.some((t) => !TEAM_NAMES.includes(t.name))) p.season.teams = newSeason().teams;
    if (p.team && !p.team.contract) p.team.contract = { endYear: yearOf(p.day) + 1 };
    if (!p.ach) p.ach = {};
    if (!p.flags) p.flags = {};
    return p;
  } catch {
    return null;
  }
}

let saveOk = true;
function saveGame() {
  if (!player) return;
  checkAch(); // 저장할 때마다 새 업적을 확인합니다
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(player));
    saveOk = true;
  } catch {
    saveOk = false; // 사생활 보호 모드 등에서는 저장이 막힐 수 있어요
  }
  const el = document.getElementById("save-status");
  if (el) {
    el.textContent = saveOk
      ? `자동 저장됨 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
      : "이 브라우저에서는 저장할 수 없어요. 아래 저장 코드를 따로 보관해 주세요.";
  }
}

// ---------- 선수 만들기 ----------
function createPlayer(name, posKey) {
  // 어린 나이에 시작하므로 기본 능력치가 낮습니다
  const stats = { laning: 30, teamfight: 30, decision: 30, champPool: 25, mental: 70, stamina: 100 };
  for (const [stat, bonus] of Object.entries(POSITIONS[posKey].bonus)) {
    stats[stat] += bonus;
  }
  return {
    name,
    position: posKey,
    stage: "amateur",
    talent: Math.round((0.8 + Math.random() * 0.5) * 100) / 100, // 숨겨진 재능 0.8 ~ 1.3
    week: 1,
    day: 0, // 2026-01-05부터 흐른 날짜
    stats,
    log: [],
    record: { w: 0, l: 0 },
    stageRecord: { w: 0, l: 0 }, // 현재 단계에서의 전적
    champion: null, // 현재 챔피언 id
    mastery: {}, // 챔피언별 숙련도
    season: newSeason(),
    history: [], // 지난 시즌 결과
    money: 0, // 만원
    team: null, // 아카데미/프로 팀
    titles: 0,
    seasons: 0,
    pendingEvent: null,
    over: null, // 커리어 종료 정보
    gear: { mouse: 0, keyboard: 0, monitor: 0, chair: 0, headset: 0 }, // 장비 레벨
    qual: { year: 0, msi: 0, worlds: 0 }, // 올해 국제대회 출전권 (시드 1~3, 0은 없음)
    tourney: null, // 진행 중인 국제대회
    intl: { msi: 0, worlds: 0 }, // 국제대회 우승 횟수
    intlDone: {}, // 연도별 국제대회 처리 여부
    ach: {}, // 이번 커리어의 업적
    flags: {}, // 업적 조건용 기록
  };
}

// ---------- 계산 ----------
const overall = () =>
  Math.round((player.stats.laning + player.stats.teamfight + player.stats.decision) / 3);

const getAge = () => START_AGE + yearOf(player.day) - 2026; // 1월 1일에 한 살씩 늘어납니다

// 테스트를 볼 수 있는지, 부족한 조건은 무엇인지
function testStatus() {
  const st = STAGES[player.stage];
  const sr = player.stageRecord;
  const games = sr.w + sr.l;
  const missing = [];
  if (overall() < st.need) missing.push(`종합 ${overall()}/${st.need}`);
  if (st.minGames) {
    if (games < st.minGames) missing.push(`경기 ${games}/${st.minGames}`);
    else if (sr.w / games < st.minWinRate)
      missing.push(`승률 ${Math.round((sr.w / games) * 100)}%/${Math.round(st.minWinRate * 100)}%`);
  }
  return { ready: missing.length === 0, missing };
}

// 테스트 합격 확률: 기준을 넘길수록, 멘탈이 좋을수록 높아집니다
function testChance() {
  const st = STAGES[player.stage];
  const base = 0.55 + (overall() - st.need) * 0.04;
  const mentalFactor = 0.85 + 0.15 * (player.stats.mental / 100);
  return Math.max(0.05, Math.min(0.95, base * mentalFactor + (player.scout ? 0.1 : 0)));
}

// ---------- 경기 시뮬레이션 (lol_sim.dart와 같은 구조) ----------
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function gauss(sd) {
  const u1 = 1 - Math.random();
  const u2 = Math.random();
  return sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// 라인전 -> 오브젝트 -> 한타 순서로 진행합니다
// oppName을 주면 그 팀의 선수 실력이 결과에 반영됩니다 (rosterWeight: 반영 비율)
function simulateMatch(oppBonus = 0, oppName = null, rosterWeight = 1) {
  const s = player.stats;
  const st = STAGES[player.stage];
  const cond = (0.85 + 0.15 * (s.stamina / 100)) * (0.9 + 0.1 * (s.mental / 100));
  const eff = champEffect(); // 챔피언 보정
  eff.lane += gearPow("mouse"); // 장비 보정
  eff.fight += gearPow("keyboard");
  let mate = (player.team ? player.team.level : st.matchLevel) + randInt(-3, 3) + gearPow("headset") / 2; // 팀원 평균 실력
  let opp = st.matchLevel + randInt(-5, 5) + oppBonus; // 상대 팀 평균 실력
  let laneOpp = opp; // 내 라인의 맞상대 실력
  let laneName = "상대 라이너";
  let oppInfo = null;
  if (oppName && player.team) {
    // 선수 한 명 한 명의 실력을 반영: 같은 포지션 맞상대는 라인전에, 팀 평균은 오브젝트·한타에
    const year = yearOf(player.day);
    const base = leagueMeanAvg(year);
    oppInfo = rosterInfo(oppName, year, Object.values(myRosterMap()));
    opp += clampN((oppInfo.avg - base) * 0.4 * rosterWeight, -6, 7);
    laneOpp = opp + clampN((oppInfo.rt[player.position] - oppInfo.avg) * 0.5 * rosterWeight, -7, 7);
    laneName = oppInfo.ro[player.position];
    const my = myRosterMap();
    const mateAvg = meanOf(POS_KEYS.filter((k) => k !== player.position).map((k) => playerRating(my[k], year)));
    mate += clampN((mateAvg - base) * 0.3 * rosterWeight, -5, 5);
  }
  const events = [];
  const kills = [0, 0];
  const objs = [0, 0];
  let gold = 0; // 양수면 우리 팀이 앞섬

  // 1) 라인전: 내 라인 + 나머지 라인
  const myLane = (s.laning + eff.lane) * cond - laneOpp + gauss(6);
  gold += myLane * 40;
  if (Math.abs(myLane) > 8) {
    const w = myLane > 0;
    kills[w ? 0 : 1] += 1;
    events.push({
      type: "kill",
      own: true,
      minute: 4 + randInt(0, 8),
      mine: w,
      text: w ? `${who()}이(가) 라인전에서 ${laneName}을(를) 솔로킬!` : `${who()}이(가) 라인전에서 ${laneName}에게 솔로킬을 내줬습니다.`,
    });
  }
  const mateLane = mate - opp + gauss(5);
  gold += mateLane * 120;
  if (Math.abs(mateLane) > 8) {
    const w = mateLane > 0;
    kills[w ? 0 : 1] += 1;
    events.push({
      type: "kill",
      minute: 8 + randInt(0, 6),
      mine: w,
      text: w ? "다른 라인에서 우리 팀이 우세를 잡았습니다." : "다른 라인에서 상대가 우세를 잡았습니다.",
    });
  }

  // 2) 오브젝트: 판단력이 중요
  const objNames = ["드래곤", "전령", "바론"];
  const objMinutes = [14, 20, 26];
  const dMe = (s.decision + gearPow("monitor")) * cond * 0.35 + mate * 0.65;
  objNames.forEach((name, i) => {
    const w = Math.random() < sigmoid((dMe - opp) / 8 + gold / 2500);
    objs[w ? 0 : 1] += 1;
    gold += (w ? 1 : -1) * 800;
    events.push({
      type: "obj",
      obj: name,
      minute: objMinutes[i],
      mine: w,
      text: w ? `우리 팀이 ${name}을(를) 가져갑니다.` : `상대 팀이 ${name}을(를) 가져갑니다.`,
    });
  });

  // 3) 한타: 먼저 2번 이기는 팀이 승리
  const fMe = (s.teamfight + eff.fight) * cond * 0.35 + mate * 0.65;
  const wins = [0, 0];
  let minute = 28;
  while (wins[0] < 2 && wins[1] < 2) {
    const w = Math.random() < sigmoid((fMe - opp + (objs[0] - objs[1]) * 2) / 7 + gold / 2500);
    const kw = randInt(2, 5);
    const kl = randInt(0, 1);
    wins[w ? 0 : 1] += 1;
    kills[w ? 0 : 1] += kw;
    kills[w ? 1 : 0] += kl;
    gold += (w ? 1 : -1) * 1000;
    events.push({ type: "fight", minute, mine: w, text: w ? `한타 승리! (${kw}:${kl})` : `한타 패배... (${kl}:${kw})` });
    minute += randInt(3, 5);
  }

  const win = wins[0] > wins[1];
  events.push({
    type: "nexus",
    minute,
    mine: win,
    text: win ? "우리 팀이 넥서스를 파괴합니다!" : "상대 팀이 넥서스를 파괴합니다...",
  });
  events.sort((a, b) => a.minute - b.minute);
  return { win, events, kills, goldDiff: Math.round(gold), oppPlayers: oppInfo ? oppInfo.ro : null, oppRatings: oppInfo ? oppInfo.rt : null, laneName: oppInfo ? laneName : null };
}

// ---------- 행동 ----------
// days: 훈련/국내 경기는 7일, 국제대회 경기는 1일이 지납니다
function pushLog(entry, days = 7) {
  player.log.unshift({ week: player.week, date: fmtDate(player.day), ...entry });
  player.log = player.log.slice(0, 30); // 최근 30개만 보관
  const before = player.week;
  player.day += days;
  player.week = Math.floor(player.day / 7) + 1;
  for (let w = before; w < player.week; w++) afterWeek(); // 주가 바뀔 때마다 월급/이벤트
  syncCalendar();
  saveGame();
  render();
}

function train(key) {
  const action = ACTIONS[key];
  if (!action || !action.stages.includes(player.stage)) return;
  if (player.pendingEvent || player.over || mustPlay()) return;
  if (action.cost) {
    if (player.money < action.cost) return;
    player.money -= action.cost;
  }
  if (key === "champ" && !player.champion) {
    openPicker(); // 연습할 챔피언을 먼저 골라야 합니다
    return;
  }
  matchEl.hidden = true;
  const s = player.stats;
  // 체력이 낮을수록 성장이 줄어듭니다
  // 일정 때문에 훈련 기간이 짧아지면 성장도 그만큼 줄어듭니다
  const k = player.talent * STAGES[player.stage].growth * ageFactor() * (0.6 + 0.4 * (s.stamina / 100)) * Math.max(0.3, trainDays() / 7);
  const gains = [];

  for (const [stat, [min, max]] of Object.entries(action.gains)) {
    const g = Math.round(randInt(min, max) * k * growthCurve(s[stat]));
    s[stat] = clamp(s[stat] + g);
    if (g > 0) gains.push(`${LABELS[stat]} +${g}`);
  }
  for (const [stat, d] of Object.entries(action.fixed)) {
    // 의자 장비: 훈련 피로가 줄고 휴식 회복이 커집니다
    const chair = gearLv("chair");
    const delta = stat === "stamina" ? (d < 0 ? Math.min(0, d + chair * 2) : d + chair * 5) : d;
    s[stat] = clamp(s[stat] + delta);
  }

  if (key === "champ") {
    const g = Math.round(randInt(3, 6) * k);
    player.mastery[player.champion] = clamp((player.mastery[player.champion] ?? 20) + g);
    gains.push(`${champById(player.champion).name} 숙련도 +${g}`);
  }

  pushLog({ label: action.label, gains }, trainDays());
}

function takeTest() {
  const st = STAGES[player.stage];
  if (!st.next || !testStatus().ready || player.pendingEvent || player.over || mustPlay()) return;
  matchEl.hidden = true;

  const chance = testChance();
  player.scout = false;
  if (Math.random() < chance) {
    player.stage = st.next;
    player.stageRecord = { w: 0, l: 0 };
    player.season = newSeason(player.season.no); // 새 단계의 첫 시즌
    player.team = makeTeam(st.next);
    if (st.next === "pro" && getAge() <= 15) flag("youngPro");
    pushLog({ note: `${st.testName} 합격! ${STAGES[st.next].label} 선수가 되었습니다.`, good: true });
  } else {
    player.stats.mental = clamp(player.stats.mental - 10);
    pushLog({ note: `${st.testName} 불합격... 멘탈 -10. 다시 준비해서 도전하세요.` });
  }
}


// 정규시즌 상대 일정: 모든 팀과 고르게 만나도록 미리 정합니다
function ensureSched(se) {
  if (se.sched && se.sched.length >= SEASON_GAMES) return se.sched;
  const names = shuffle(se.teams.map((t) => t.name));
  se.sched = Array.from({ length: SEASON_GAMES }, (_, i) => names[i % names.length]);
  return se.sched;
}

// 리그 경기: 1주를 쓰고, 경기 경험으로 능력치와 챔피언 숙련도가 오릅니다
function playMatch() {
  const st = STAGES[player.stage];
  if (!st.matchLevel || player.pendingEvent || player.over || !domesticDue()) return;
  if (champData && !player.champion) {
    openPicker(); // 챔피언을 먼저 골라야 합니다
    return;
  }
  matchEl.hidden = true;

  const se = player.season;
  const playoff = se.phase === "playoff";
  ensureSched(se);
  const oppTeamName = !playoff && se.sched[se.games] ? se.sched[se.games] : se.teams[randInt(0, se.teams.length - 1)].name;
  const r = simulateMatch((playoff ? 3 : 0) + leagueBonus(), oppTeamName); // 플레이오프 상대는 더 강하고, 리그 수준도 올라갑니다
  r.oppName = oppTeamName;
  r.label = playoff ? `플레이오프 ${ROUNDS[se.round]}` : "리그 경기";

  const s = player.stats;
  const k = player.talent * st.growth * ageFactor() * (0.6 + 0.4 * (s.stamina / 100));
  const gains = [];
  for (const [stat, [min, max]] of Object.entries({ laning: [0, 1], teamfight: [0, 2], decision: [0, 2] })) {
    const g = Math.round(randInt(min, max) * k * growthCurve(s[stat]));
    s[stat] = clamp(s[stat] + g);
    if (g > 0) gains.push(`${LABELS[stat]} +${g}`);
  }
  if (player.champion) {
    player.mastery[player.champion] = clamp((player.mastery[player.champion] ?? 20) + randInt(1, 3));
  }
  s.stamina = clamp(s.stamina - 6);
  s.mental = clamp(s.mental + (r.win ? 5 : -5));
  player.record[r.win ? "w" : "l"] += 1;
  player.stageRecord[r.win ? "w" : "l"] += 1;

  const note =
    `${r.label} vs ${r.oppName} ${r.win ? "승리" : "패배"} (킬 ${r.kills[0]}:${r.kills[1]})` +
    (gains.length ? ` · ${gains.join(", ")}` : "");
  // 시즌 진행 (날짜가 흐르기 전에 먼저 반영합니다)
  if (playoff) {
    const isFinal = se.round === ROUNDS.length - 1;
    if (r.win) {
      se.round += 1;
      if (se.round >= ROUNDS.length) {
        setQual(se.split, 1); // 우승: 국제대회 1번 시드
        endSeason("우승!", true);
      }
    } else {
      if (isFinal) setQual(se.split, 2); // 준우승: 2번 시드
      endSeason(`플레이오프 ${ROUNDS[se.round]} 탈락`, false);
    }
  } else {
    (se.results = se.results || []).push({ opp: oppTeamName, win: r.win, k: r.kills });
    se.games += 1;
    se[r.win ? "w" : "l"] += 1;
    // 다른 팀들도 같은 라운드에 한 경기씩 치릅니다 (실시간 순위용)
    if (!se.live) se.live = {};
    for (const t of se.teams) {
      const e = (se.live[t.name] = se.live[t.name] || { w: 0, l: 0 });
      e[Math.random() < sigmoid(t.str / 12) ? "w" : "l"] += 1;
    }
    if (se.games >= SEASON_GAMES) finishRegular();
  }
  pushLog({ note, good: r.win });
  showMatch(r);
}

// ---------- 미니맵 연출 ----------
// 좌표는 0~1 값. 파란 팀(우리)은 왼쪽 아래, 빨간 팀은 오른쪽 위 기지에서 시작합니다.
const mapCanvas = document.getElementById("minimap");
const mapCtx = mapCanvas.getContext("2d");
const replayBtn = document.getElementById("replay-btn");
const PLAY_SECONDS = 16; // 경기 한 판을 연출하는 시간(초)
let animToken = 0;
let lastResult = null;
let finishNow = null;
let playing = false;

const LANES = {
  top: [[0.1, 0.9], [0.1, 0.1], [0.9, 0.1]],
  mid: [[0.1, 0.9], [0.9, 0.1]],
  bot: [[0.1, 0.9], [0.9, 0.9], [0.9, 0.1]],
};
const ROLE_LANE = ["top", null, "mid", "bot", "bot"]; // 탑, 정글, 미드, 원딜, 서포터
const FIGHT_SPOTS = [[0.5, 0.5], [0.4, 0.58], [0.6, 0.42]];
const clampMap = (v) => Math.max(0.05, Math.min(0.95, v));

// 라인을 따라 f(0~1) 지점의 좌표
function pathPoint(path, f) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let d = f * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const t = Math.min(1, d / lens[i]);
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ];
    }
    d -= lens[i];
  }
}

// 라인전 시작 위치 10명 (0~4: 우리 팀, 5~9: 상대 팀)
function lanePositions() {
  const pos = [];
  for (let team = 0; team < 2; team++) {
    for (let r = 0; r < 5; r++) {
      if (r === 1) {
        pos.push(team === 0 ? [0.3, 0.6] : [0.7, 0.4]);
        continue;
      }
      const f = (team === 0 ? 0.4 : 0.6) + (r === 4 ? (team === 0 ? -0.04 : 0.04) : 0);
      pos.push(pathPoint(LANES[ROLE_LANE[r]], f));
    }
  }
  return pos;
}

// 한 지점에 두 팀이 마주 보고 모이는 위치
function gatherPositions(target) {
  return Array.from({ length: 10 }, (_, i) => {
    const team = i < 5 ? 0 : 1;
    const ang = i * 1.3;
    const cx = target[0] + (team === 0 ? -0.04 : 0.04);
    const cy = target[1] + (team === 0 ? 0.04 : -0.04);
    return [clampMap(cx + Math.cos(ang) * 0.035), clampMap(cy + Math.sin(ang) * 0.035)];
  });
}

// 경기 이벤트 -> 이동 키프레임과 핑(깜빡이는 원)
function buildTimeline(r) {
  const me = Object.keys(POSITIONS).indexOf(player.position);
  const first = lanePositions();
  const frames = [{ m: 0, pos: first }, { m: 10, pos: first }];
  const pings = [];
  let fightN = 0;

  for (const e of r.events) {
    if (e.type === "kill") {
      const myLane = ROLE_LANE[me] || "mid";
      const lane = e.own ? myLane : myLane === "top" ? "bot" : "top";
      pings.push({ m: e.minute, spot: pathPoint(LANES[lane], 0.5), mine: e.mine });
      continue;
    }
    let spot;
    if (e.type === "obj") spot = e.obj === "드래곤" ? [0.65, 0.65] : [0.35, 0.35];
    else if (e.type === "fight") spot = FIGHT_SPOTS[fightN++ % FIGHT_SPOTS.length];
    else spot = e.mine ? [0.85, 0.15] : [0.15, 0.85];

    // 한동안 머물다가 이벤트 직전에 이동하도록 대기 프레임을 넣습니다
    const prev = frames[frames.length - 1];
    const holdM = Math.max(prev.m + 0.5, e.minute - 3);
    if (holdM < e.minute) frames.push({ m: holdM, pos: prev.pos });
    frames.push({ m: e.minute, pos: gatherPositions(spot) });
    pings.push({ m: e.minute, spot, mine: e.mine, big: true });
  }
  return { frames, pings, me, end: r.events[r.events.length - 1].minute };
}

// 시계 m(분) 시점의 점 위치 (프레임 사이를 부드럽게 보간)
function dotsAt(frames, m) {
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].m <= m) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const t = b.m === a.m ? 1 : Math.max(0, Math.min(1, (m - a.m) / (b.m - a.m)));
  const e = t * t * (3 - 2 * t);
  return a.pos.map((p, k) => [p[0] + (b.pos[k][0] - p[0]) * e, p[1] + (b.pos[k][1] - p[1]) * e]);
}

function drawMap(m, tl) {
  const W = mapCanvas.width;
  const c = mapCtx;
  const u = W / 400; // 화면 크기에 맞춘 배율
  const X = (v) => v * W;

  c.fillStyle = "#0d2230";
  c.fillRect(0, 0, W, W);

  // 강
  c.strokeStyle = "#17455c";
  c.lineWidth = 22 * u;
  c.beginPath();
  c.moveTo(X(0.1), X(0.1));
  c.lineTo(X(0.9), X(0.9));
  c.stroke();

  // 라인
  c.strokeStyle = "#2a4560";
  c.lineWidth = 8 * u;
  for (const path of Object.values(LANES)) {
    c.beginPath();
    path.forEach(([x, y], i) => (i ? c.lineTo(X(x), X(y)) : c.moveTo(X(x), X(y))));
    c.stroke();
  }

  // 기지와 오브젝트 위치
  for (const [x, y, color] of [[0.1, 0.9, "#3d9be9"], [0.9, 0.1, "#e0554b"]]) {
    c.globalAlpha = 0.35;
    c.fillStyle = color;
    c.beginPath();
    c.arc(X(x), X(y), 30 * u, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  c.fillStyle = "#c8aa6e";
  for (const [x, y] of [[0.65, 0.65], [0.35, 0.35]]) c.fillRect(X(x) - 4 * u, X(y) - 4 * u, 8 * u, 8 * u);

  // 핑: 이벤트가 일어난 곳에서 퍼지는 원
  for (const p of tl.pings) {
    const age = m - p.m;
    if (age < 0 || age > 2) continue;
    c.globalAlpha = 1 - age / 2;
    c.strokeStyle = p.mine ? "#2ed3c0" : "#e0554b";
    c.lineWidth = 3 * u;
    c.beginPath();
    c.arc(X(p.spot[0]), X(p.spot[1]), (p.big ? 18 : 12) * u + age * 22 * u, 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = 1;

  // 선수 점들 (내 선수는 금색 테두리와 이름)
  dotsAt(tl.frames, m).forEach(([x, y], i) => {
    const wob = Math.sin(m * 6 + i * 2) * 0.006;
    const px = X(x + wob);
    const py = X(y - wob);
    c.fillStyle = i < 5 ? "#3d9be9" : "#e0554b";
    c.beginPath();
    c.arc(px, py, 7 * u, 0, Math.PI * 2);
    c.fill();
    if (i === tl.me) {
      c.strokeStyle = "#c8aa6e";
      c.lineWidth = 3 * u;
      c.stroke();
      c.fillStyle = "#c8aa6e";
      c.font = `bold ${12 * u}px sans-serif`;
      c.textAlign = "center";
      c.fillText(player.name, px, py - 13 * u);
    }
  });

  // 시계
  c.fillStyle = "#e6e0cf";
  c.font = `bold ${14 * u}px sans-serif`;
  c.textAlign = "left";
  c.fillText(`${String(Math.floor(m)).padStart(2, "0")}분`, 12 * u, 22 * u);
}

function resultTitle(r) {
  const sign = r.goldDiff >= 0 ? "+" : "";
  const set =
    r.series && r.series.bo > 1
      ? ` ${r.series.sc[0]}:${r.series.sc[1]} (${r.series.games.map((g) => (g ? "승" : "패")).join("")})`
      : "";
  return `${r.label} vs ${r.oppName} ${r.win ? "승리" : "패배"}${set} · ${r.series ? "마지막 세트 " : ""}킬 ${r.kills[0]}:${r.kills[1]} · 골드 ${sign}${r.goldDiff}`;
}

function playAnimation(r) {
  const token = ++animToken;
  const tl = buildTimeline(r);
  const lis = [...document.querySelectorAll("#match-events li")];
  const titleEl = document.getElementById("match-title");

  // 패널이 보이는 상태에서 실제 크기에 맞춰 캔버스 해상도를 정합니다
  const size = Math.round(mapCanvas.getBoundingClientRect().width * (window.devicePixelRatio || 1));
  if (size > 0) mapCanvas.width = mapCanvas.height = size;

  const finish = () => {
    playing = false;
    finishNow = null;
    drawMap(tl.end, tl);
    lis.forEach((li) => (li.hidden = false));
    titleEl.textContent = resultTitle(r);
    replayBtn.textContent = "다시 보기";
  };

  const reduced =
    typeof window !== "undefined" && window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return finish();

  playing = true;
  finishNow = finish;
  titleEl.textContent = "경기 진행 중...";
  replayBtn.textContent = "건너뛰기";
  lis.forEach((li) => (li.hidden = true));

  const start = performance.now();
  const step = (now) => {
    if (token !== animToken || matchEl.hidden) return;
    const m = Math.min(tl.end, ((now - start) / 1000 / PLAY_SECONDS) * tl.end);
    drawMap(m, tl);
    lis.forEach((li) => (li.hidden = Number(li.dataset.minute) > m));
    if (m >= tl.end) return finish();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

replayBtn.addEventListener("click", () => {
  if (playing && finishNow) {
    animToken++;
    finishNow();
  } else if (lastResult) {
    playAnimation(lastResult);
  }
});

function showMatch(r) {
  lastResult = r;
  const myName = player.team ? player.team.name : "우리 팀";
  document.getElementById("match-vs").innerHTML =
    teamLogo(myName, 30) + "<span>vs</span>" + teamLogo(r.oppName, 30);
  const ul = document.getElementById("match-events");
  ul.innerHTML = "";
  for (const e of r.events) {
    const li = document.createElement("li");
    li.className = e.mine ? "mine" : "theirs";
    li.dataset.minute = e.minute;
    li.textContent = `${String(e.minute).padStart(2, "0")}분 ${e.text}`;
    ul.append(li);
  }
  matchEl.hidden = false;
  playAnimation(r);
}

// ---------- 화면 ----------
const startEl = document.getElementById("start-screen");
const playEl = document.getElementById("play-screen");
const statsEl = document.getElementById("stats");
const actionsEl = document.getElementById("actions");
const logEl = document.getElementById("log");
const testBtn = document.getElementById("test-btn");
const matchEl = document.getElementById("match");

function showScreen(which) {
  startEl.hidden = which !== "start";
  playEl.hidden = which !== "play";
  renderAch();
  if (which === "start") startHero();
  else stopHero();
}

// 능력치 막대는 처음에 한 번만 만들고, 이후엔 값만 바꿉니다
for (const key of Object.keys(LABELS)) {
  const row = document.createElement("div");
  row.className = "stat";
  row.innerHTML = `
    <span>${LABELS[key]}</span>
    <div class="stat-bar"><div class="stat-fill" id="fill-${key}"></div></div>
    <span class="stat-value" id="value-${key}"></span>`;
  statsEl.appendChild(row);
}

// 챔프폭: 숙련도 50 이상 챔피언은 주력(+12), 35~49는 연습 중(+3). 기본 25
const POOL_MAIN = 50, POOL_SUB = 35;
function syncChampPool() {
  let main = 0, sub = 0;
  for (const v of Object.values(player.mastery || {})) {
    if (v >= POOL_MAIN) main++;
    else if (v >= POOL_SUB) sub++;
  }
  player.stats.champPool = clamp(25 + main * 12 + sub * 3);
}

function render() {
  checkRosterChange();
  syncChampPool();
  const st = STAGES[player.stage];

  document.getElementById("player-name").textContent = player.name;
  document.getElementById("player-info").textContent =
    `${st.label} · ${POSITIONS[player.position].label} · ${getAge()}세 · ${fmtDate(player.day)}`;

  for (const key of Object.keys(LABELS)) {
    const v = player.stats[key];
    const fill = document.getElementById(`fill-${key}`);
    fill.style.width = `${v}%`;
    fill.classList.toggle("danger", (key === "mental" || key === "stamina") && v < 20); // 번아웃/탈진 주의
    document.getElementById(`value-${key}`).textContent = v;
  }

  // 커리어 목표와 테스트 버튼
  document.getElementById("career-goal").textContent = st.goal;
  const progressEl = document.getElementById("career-progress");
  if (st.next) {
    const { ready, missing } = testStatus();
    progressEl.textContent = ready
      ? `조건 달성 · 합격 확률 약 ${Math.round(testChance() * 100)}%`
      : `준비 중 · ${missing.join(" · ")}`;
    testBtn.hidden = false;
    testBtn.textContent = st.testName;
    testBtn.disabled = !ready || !!player.pendingEvent || mustPlay();
  } else {
    progressEl.textContent = `종합 ${overall()}`;
    testBtn.hidden = true;
  }

  if (player.record.w + player.record.l > 0) {
    progressEl.textContent += ` · 전적 ${player.record.w}승 ${player.record.l}패`;
  }

  renderExtra();

  // 현재 단계에서 할 수 있는 훈련 버튼
  actionsEl.innerHTML = "";
  for (const [key, action] of Object.entries(ACTIONS)) {
    if (!action.stages.includes(player.stage)) continue;
    const btn = document.createElement("button");
    btn.dataset.action = key;
    btn.textContent = action.cost ? `${action.label} (${action.cost}만원)` : action.label;
    btn.disabled =
      !!player.pendingEvent ||
      (action.cost ? player.money < action.cost : false) ||
      (mustPlay() && !(key === "shop" || key === "position")); // 경기 주간에는 훈련 불가
    actionsEl.append(btn);
  }
  if (mustPlay()) {
    const m = document.createElement("button");
    m.dataset.action = "match";
    m.textContent = matchLabel();
    m.disabled = !!player.pendingEvent;
    actionsEl.append(m);
  }

  // 기록
  logEl.innerHTML = "";
  for (const entry of player.log) {
    const li = document.createElement("li");
    if (entry.note) {
      li.className = entry.good ? "event good" : "event";
      li.textContent = `${entry.date || entry.week + "주차"} ${entry.note}`;
    } else {
      li.append(`${entry.date || entry.week + "주차"} ${entry.label}: `);
      if (entry.gains.length) {
        const span = document.createElement("span");
        span.className = "gain";
        span.textContent = entry.gains.join(", ");
        li.append(span);
      } else {
        li.append("컨디션 회복");
      }
    }
    logEl.append(li);
  }
}

// ---------- 나이 제한 / 팀 / 이벤트 ----------
// 실제 이름을 살짝 비튼 패러디 이름입니다
const CLUB_NAMES = ["OK 저금통 브라이언", "광둥 프릭스", "BNQ 피어Y", "리브 샌드백", "클라우드8", "G3"];
// 포지션별 선수 풀 (실제 선수 이름을 살짝 비튼 패러디). 포지션에 맞는 선수만 그 자리에 들어갑니다.
// 국내(LCK) 팀은 ROSTER_POOL, 해외 팀은 자기 지역의 풀(REGION_ROSTER_POOL)에서 뽑아요.
const ROSTER_POOL = {
  top: ["제우쓰", "도랑", "기안", "캔나", "칸", "모건", "리치", "누구리", "스멥", "마린", "쿠로", "소두", "마오", "시우", "킹겐", "퍼펙트", "두두", "클리어"],
  jungle: ["오노", "캐년", "피넛츠", "윌러", "타잔", "클리드", "벵기", "에스퍼", "틴", "위버", "쿠즈", "비리", "도시", "루시드", "스폰지", "표식", "랩터", "움티"],
  mid: ["패이커", "쵸삐", "쇼메이크", "제크", "비디하", "스카웃", "루키", "불리", "클로저", "라타", "페이트", "소프엠", "유칼", "피셔", "빅라"],
  adc: ["구마유지", "데프티", "루러", "와이퍼", "페이즈", "테디", "뱅", "프로미", "하나비", "프레이", "비비", "룬", "스탈", "에이밍", "태윤", "지우", "디아블"],
  support: ["케리어", "리핸즈", "라이프", "고스트", "딜라이트", "마타", "베릴", "호잇", "노이", "코어", "조이", "헵트", "로저", "피터", "두로", "안딜", "폴루", "나메이", "켈린"],
};
const REGION_ROSTER_POOL = {
  LPL: {
    top: ["더쉬", "플랜드", "빈이", "삼육구", "지카", "에이지"],
    jungle: ["티안", "카르사", "쉰", "하루", "베이천", "카나비"],
    mid: ["나이트", "샤오후", "엔젤", "야가오", "포지", "도인비"],
    adc: ["우지", "재키러브", "엘크", "갈라", "위기", "하오"],
    support: ["메이코", "크리스프", "밍", "항", "온", "유얀지아"],
  },
  LEC: {
    top: ["윈더", "브로큰블레이드", "오도암네", "알파리", "비위포", "쇼킹"],
    jungle: ["잰코스", "엘리오야", "인스파이어드", "마이크", "레베", "아바"],
    mid: ["캡스", "라르센", "퍼플", "아빙", "졸라", "세이커"],
    adc: ["업셋", "카르지", "힐리", "하이브", "제이드", "롬"],
    support: ["미키스", "어델", "호프", "브루노", "케빈", "델타"],
  },
  LCS: {
    top: ["임팩트", "리코리스", "퀸", "도판", "던던", "토쿠"],
    jungle: ["블래버", "인센스", "메테오스", "컨테이", "아머", "폴"],
    mid: ["젠슨", "비예르센", "포벨터", "어비스", "파인", "라이언"],
    adc: ["즈벤", "스니키", "도이", "터키", "에이스", "팝"],
    support: ["코어제이제이", "아프로무", "벌칸", "에일", "터치", "쿠로미"],
  },
  LCP: {
    top: ["후지", "소우", "팍", "클레이", "투오", "룽"],
    jungle: ["토루", "비제이", "레이", "윈", "켄", "지에"],
    mid: ["마르", "루나", "토비", "쉬", "하오쿤", "아이"],
    adc: ["유니", "칸지", "미야", "리플", "투이", "카이"],
    support: ["소라", "미오", "호안", "렌", "두이", "탄"],
  },
  CBLOL: {
    top: ["로보", "귀고", "카브랄", "제로", "테이", "샌더"],
    jungle: ["레인저", "아이기스", "크로크", "디사미스", "오스카", "마르코"],
    mid: ["티노운스", "고쿠", "그레브타", "다리오", "니코", "엘라"],
    adc: ["브란스", "타이탄", "트리고", "데이브", "루카스", "레오"],
    support: ["즈리", "알로", "카우", "로미", "비토", "페드로"],
  },
};
const MATE_NAMES = [...Object.values(ROSTER_POOL).flat(), ...Object.values(REGION_ROSTER_POOL).flatMap((r) => Object.values(r).flat())]; // 예전 저장 데이터 호환용

// 이 나이가 되면 해당 단계의 커리어가 끝납니다
const LIMITS = { amateur: 19, academy: 21, pro: 33 }; // 프로는 병역(18개월)까지 고려해 33세
const END_TEXT = {
  amateur: "아카데미에 들어가지 못한 채 나이 제한이 지나, 프로의 꿈을 접었습니다.",
  academy: "정해진 기간 안에 프로로 승격하지 못해 아카데미에서 방출되었습니다.",
  pro: "오랜 선수 생활을 마치고 은퇴를 선언했습니다. 팬들의 박수 속에 은퇴식이 열렸어요.",
};

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const adj = (stat, d) => {
  player.stats[stat] = clamp(player.stats[stat] + d);
};
const weeklyPay = () => (player.team ? player.team.salary : 0);
// 나이가 들수록 성장 속도가 느려집니다
const ageFactor = () => {
  const a = getAge();
  return a <= 20 ? 1 : a <= 23 ? 0.85 : a <= 26 ? 0.7 : 0.5;
};

// 내 팀: 팀 전력(level)이 경기에서 팀원 실력이 되고, 주급(salary)을 받습니다
function makeTeam(stage, levelOffset = randInt(-4, 4), excludeName = "") {
  const level = STAGES[stage].matchLevel + levelOffset;
  const club = shuffle(CLUB_NAMES.filter((n) => !n.startsWith(excludeName) || !excludeName))[0];
  return {
    name: stage === "academy" ? `${club} 아카데미` : club,
    level,
    names: [], // 예전 저장 호환용 (팀원은 이제 팀·연도로 정해집니다: teamRoster)
    salary: stage === "academy" ? 20 : Math.max(30, Math.round(40 + (level - 40) * 4)),
    contract: { endYear: yearOf(player ? player.day : 0) + randInt(1, 2) }, // 11월 30일에 만료
  };
}

// ---------- 팀별 · 시즌별 로스터 ----------
// 팀 이름과 연도가 같으면 항상 같은 명단이 나오고, 해가 바뀔 때마다 일부 선수가 바뀝니다(재계약·이적).
// 같은 해에는 한 선수가 두 팀에 동시에 있지 않아요(국내 팀 기준).
const POS_KEYS = ["top", "jungle", "mid", "adc", "support"];
const ROSTER_FIRST_YEAR = 2026;
const ROSTER_TURNOVER = 0.4; // 해마다 포지션별로 선수가 바뀔 확률

function strSeed(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 2026년 시작 명단: 실제 팀 구성을 본뜬 패러디입니다 (탑·정글·미드·원딜·서포터 순). 이후엔 해마다 일부가 바뀝니다.
const ROSTER_2026 = {
  "T2": ["도랑", "오노", "패이커", "구마유지", "케리어"],
  "젠제트": ["기안", "캐년", "쵸삐", "루러", "두로"],
  "한와 라이프": ["제우쓰", "피넛츠", "제크", "와이퍼", "딜라이트"],
  "디마이너스 카이아": ["시우", "루시드", "쇼메이크", "에이밍", "베릴"],
  "농삼 레드포스": ["킹겐", "스폰지", "스카웃", "태윤", "리핸즈"],
  "DRZ": ["리치", "윌러", "유칼", "지우", "안딜"],
  "KT 롤러": ["퍼펙트", "쿠즈", "비디하", "데프티", "폴루"],
  "OK 저금통 브라이언": ["모건", "움티", "피셔", "테디", "나메이"],
  "광둥 프릭스": ["두두", "표식", "클로저", "페이즈", "호잇"],
  "BNQ 피어Y": ["클리어", "랩터", "빅라", "디아블", "켈린"],
  "리브 샌드백": ["소두", "클리드", "불리", "프레이", "마타"],
  "클라우드8": ["마오", "타잔", "페이트", "비비", "조이"],
  "G3": ["쿠로", "벵기", "라타", "룬", "노이"],
  "BLQ": ["빈이", "쉰", "나이트", "엘크", "온"],
  "JDK": ["플랜드", "카나비", "야가오", "갈라", "메이코"],
  "팁 에스포츠": ["더쉬", "카르사", "샤오후", "재키러브", "크리스프"],
  "AI 레전드": ["삼육구", "티안", "엔젤", "위기", "밍"],
  "프네틱": ["오도암네", "아바", "라르센", "업셋", "미키스"],
  "카르민 콥": ["브로큰블레이드", "엘리오야", "퍼플", "카르지", "어델"],
  "팀 비탈리티": ["윈더", "잰코스", "캡스", "힐리", "브루노"],
  "팀 리키드": ["임팩트", "블래버", "젠슨", "즈벤", "코어제이제이"],
  "LYOM": ["리코리스", "인센스", "포벨터", "도이", "에일"],
  "99 시브즈": ["퀸", "메테오스", "비예르센", "스니키", "아프로무"],
  "팀 시크릿 웨일": ["후지", "토루", "마르", "유니", "소라"],
  "딥 크로스 게이머": ["소우", "비제이", "루나", "칸지", "미오"],
  "CTBC 플라잉 굴": ["팍", "레이", "토비", "미야", "호안"],
  "푸리아": ["로보", "레인저", "티노운스", "브란스", "즈리"],
  "라우드": ["귀고", "아이기스", "고쿠", "타이탄", "알로"],
};

let rosterCache = {};
function teamRegion(team) {
  if (typeof REGION_TEAMS === "undefined") return null;
  for (const [region, list] of Object.entries(REGION_TEAMS)) if (list.includes(team)) return region;
  return null;
}
// 이 팀이 선수를 데려오는 풀: 해외 팀은 자기 지역, 나머지는 국내
const poolOf = (team) => REGION_ROSTER_POOL[teamRegion(team)] || ROSTER_POOL;
function rosterTeamNames() {
  // 국내 리그 팀을 먼저(중복 없이 배정), 그다음 아카데미와 해외 팀
  const intl = typeof REGION_TEAMS !== "undefined" ? Object.values(REGION_TEAMS).flat() : [];
  return [...new Set([...TEAM_NAMES, ...CLUB_NAMES, ...CLUB_NAMES.map((c) => `${c} 아카데미`), ...intl])];
}
function leagueState(year) {
  const y = Math.max(ROSTER_FIRST_YEAR, year);
  if (rosterCache[y]) return rosterCache[y];
  const prev = y > ROSTER_FIRST_YEAR ? leagueState(y - 1) : null;
  const domestic = new Set([...TEAM_NAMES, ...CLUB_NAMES]);
  const taken = {}; // 지역(국내는 KR)별로 같은 해에 한 선수가 두 팀에 있지 않게
  const state = {};
  for (const team of rosterTeamNames()) {
    state[team] = {};
    const region = teamRegion(team) || "KR";
    const unique = domestic.has(team) || region !== "KR";
    const pool = poolOf(team);
    if (!taken[region]) {
      taken[region] = {};
      POS_KEYS.forEach((k) => (taken[region][k] = new Set()));
    }
    for (const pos of POS_KEYS) {
      const used = taken[region][pos];
      const start = !prev && ROSTER_2026[team] ? ROSTER_2026[team][POS_KEYS.indexOf(pos)] : null;
      if (start && pool[pos].includes(start)) {
        if (unique) used.add(start);
        state[team][pos] = start;
        continue;
      }
      const rnd = seededRng(strSeed(`${team}|${y}|${pos}`));
      const before = prev ? prev[team][pos] : null;
      const stay = before && rnd() >= ROSTER_TURNOVER && !(unique && used.has(before));
      let pick = before;
      if (!stay) {
        const order = seededShuffle(pool[pos], rnd);
        pick =
          order.find((n) => n !== before && !(unique && used.has(n))) ||
          order.find((n) => !(unique && used.has(n))) ||
          order[0];
      }
      if (unique) used.add(pick);
      state[team][pos] = pick;
    }
  }
  rosterCache[y] = state;
  return state;
}
// avoid: 이미 다른 팀에서 뛰는 선수(우리 팀 등)는 피해서 보여 줍니다
function teamRoster(name, year, avoid = []) {
  const st = leagueState(year);
  const base = st[name] || st[String(name).replace(/ 아카데미$/, "")];
  const pool = poolOf(name);
  const out = {};
  if (base) Object.assign(out, base);
  else {
    POS_KEYS.forEach((pos) => {
      const rnd = seededRng(strSeed(`${name}|${year}|${pos}`));
      out[pos] = seededShuffle(pool[pos], rnd)[0];
    });
  }
  POS_KEYS.forEach((pos) => {
    if (avoid.includes(out[pos])) {
      const used = Object.values(out);
      const alt = pool[pos].find((n) => !avoid.includes(n) && !used.includes(n));
      if (alt) out[pos] = alt;
    }
  });
  return out;
}
// 내 팀: 내 포지션 자리에는 내가 들어갑니다
function myRosterMap() {
  const map = teamRoster(player.team.name, yearOf(player.day));
  map[player.position] = player.name;
  return map;
}

// ---------- 선수 실력 ----------
// 대표 선수는 높은 기본 실력, 나머지는 이름에서 정해지는 중간 실력. 해마다 폼이 조금씩 달라집니다. (게임 밸런스용 추정치)
const STAR_RATING = {
  패이커: 90, 쵸삐: 90, 구마유지: 89, 제우쓰: 88, 케리어: 88, 캐년: 88, 루러: 87, 기안: 86, 쇼메이크: 85,
  오노: 84, 데프티: 84, 제크: 84, 피넛츠: 82, 도랑: 80, 와이퍼: 80, 딜라이트: 80, 비디하: 80, 루시드: 80,
  리핸즈: 78, 스카웃: 78, 베릴: 78, 두로: 78, 쿠즈: 78, 시우: 78, 에이밍: 76, 킹겐: 74, 퍼펙트: 74, 태윤: 74,
  리치: 74, 윌러: 74, 유칼: 74, 지우: 74, 스폰지: 72, 안딜: 72, 폴루: 70, 루키: 76, 페이즈: 78, 하나비: 70,
  나이트: 88, 재키러브: 86, 빈이: 86, 엘크: 84, 카나비: 84, 티안: 84, 더쉬: 84, 우지: 82, 플랜드: 82, 쉰: 80,
  야가오: 80, 샤오후: 80, 카르사: 80, 메이코: 80, 크리스프: 80, 온: 78,
  캡스: 86, 윈더: 82, 업셋: 82, 잰코스: 80, 미키스: 80, 라르센: 80, 브로큰블레이드: 80, 오도암네: 78, 엘리오야: 78, 힐리: 74,
  젠슨: 78, 임팩트: 76, 즈벤: 76, 코어제이제이: 76, 비예르센: 76, 블래버: 74, 메테오스: 74, 포벨터: 72, 퀸: 72, 스니키: 72, 인센스: 70, 아프로무: 70,
};
function playerRating(name, year) {
  const base = STAR_RATING[name] ?? 56 + (strSeed(`${name}|base`) % 13); // 56~68
  const rnd = seededRng(strSeed(`${name}|${year}|form`));
  return Math.round(base + (rnd() - 0.5) * 6); // 그 해 컨디션 ±3
}
const meanOf = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rosterInfo(team, year, avoid = []) {
  const ro = teamRoster(team, year, avoid);
  const rt = {};
  POS_KEYS.forEach((k) => (rt[k] = playerRating(ro[k], year)));
  return { ro, rt, avg: meanOf(POS_KEYS.map((k) => rt[k])) };
}
const leagueMeanCache = {};
function leagueMeanAvg(year) {
  if (leagueMeanCache[year] === undefined) {
    leagueMeanCache[year] = meanOf([...TEAM_NAMES, ...CLUB_NAMES].map((t) => rosterInfo(t, year).avg));
  }
  return leagueMeanCache[year];
}

const mateList = () => {
  const map = myRosterMap();
  return POS_KEYS.filter((p) => p !== player.position).map((p) => `${POSITIONS[p].label} ${map[p]}`).join(" · ");
};

// 해가 바뀌어 팀 선수가 달라지면 기록에 남깁니다
function checkRosterChange() {
  if (!player || !player.team || player.over) return;
  const y = yearOf(player.day);
  if (player.rosterYear === y && player.rosterTeam === player.team.name) return;
  const sameTeam = player.rosterTeam === player.team.name && player.rosterYear !== undefined && player.rosterYear < y;
  if (sameTeam) {
    const a = teamRoster(player.team.name, player.rosterYear);
    const b = teamRoster(player.team.name, y);
    const changes = POS_KEYS.filter((k) => k !== player.position && a[k] !== b[k]).map((k) => `${POSITIONS[k].label} ${a[k]}→${b[k]}`);
    if (changes.length) logNote({ note: `${y}시즌 로스터 변경: ${changes.join(", ")}` });
    else logNote({ note: `${y}시즌 로스터 유지: 팀원 전원이 재계약했어요.` });
  }
  player.rosterYear = y;
  player.rosterTeam = player.team.name;
}

// 능력치가 가장 잘 맞는 포지션
function bestPosition() {
  const s = player.stats;
  const score = {
    top: s.laning,
    jungle: s.decision,
    mid: (s.laning + s.decision) / 2,
    adc: s.teamfight,
    support: (s.decision + s.teamfight) / 2,
  };
  const [pos] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return { pos, gap: score[pos] - score[player.position] };
}

function changePosition(pos, penalty) {
  for (const k of ["laning", "teamfight", "decision"]) adj(k, -penalty);
  player.position = pos;
  flag("swap");
  player.champion = null; // 새 포지션에 맞는 챔피언을 다시 골라야 합니다
  return `${POSITIONS[pos].label}(으)로 전환했어요. (능력치 -${penalty}, 챔피언을 다시 골라야 해요)`;
}

const ALL = ["amateur", "academy", "pro"];
// 이벤트: when() 조건이 맞으면 매주 일정 확률로 나옵니다. choices의 run()이 결과 문장을 돌려줍니다
const EVENTS = [
  {
    id: "streamer", stages: ALL, when: () => true,
    build: () => ({
      title: "스트리머 합방 제안",
      text: "유명 스트리머가 같이 방송하자고 제안했어요.",
      choices: [
        { label: "출연한다", run: () => { player.money += 150; adj("mental", 5); adj("stamina", -10); return "방송 덕에 용돈과 팬이 생겼어요. (+150만원, 멘탈 +5, 체력 -10)"; } },
        { label: "거절하고 훈련한다", run: () => { adj("decision", 1); return "연습에 집중했어요. (판단력 +1)"; } },
      ],
    }),
  },
  {
    id: "meta", stages: ALL, when: () => true,
    build: () => ({
      title: "새로운 메타 발견",
      text: "연습하다가 상대가 모르는 새 전략을 발견했어요.",
      choices: [
        { label: "깊게 파고든다", run: () => { adj("decision", 2); adj("stamina", -8); return "전략 이해도가 올랐어요. (판단력 +2, 체력 -8)"; } },
        { label: "가볍게 넘긴다", run: () => { adj("mental", 1); return "무리하지 않았어요. (멘탈 +1)"; } },
      ],
    }),
  },
  {
    id: "slump", stages: ALL, when: () => player.stats.mental < 45,
    build: () => ({
      title: "슬럼프",
      text: "자신감이 떨어져서 연습이 손에 안 잡혀요.",
      choices: [
        { label: "상담 받는다 (100만원)", run: () => {
          if (player.money >= 100) { player.money -= 100; adj("mental", 20); return "마음이 한결 가벼워졌어요. (-100만원, 멘탈 +20)"; }
          adj("mental", 8); return "비용이 모자라 짧게만 상담을 받았어요. (멘탈 +8)";
        } },
        { label: "그냥 버틴다", run: () => { adj("mental", -5); adj("laning", -1); return "감이 떨어졌어요. (멘탈 -5, 라인전 -1)"; } },
      ],
    }),
  },
  {
    id: "injury", stages: ALL, when: () => player.stats.stamina < 40,
    build: () => ({
      title: "손목 통증",
      text: "무리한 연습 탓에 손목이 뻐근해요.",
      choices: [
        { label: "푹 쉰다", run: () => { adj("stamina", 30); adj("mental", -2); return "컨디션을 되찾았어요. (체력 +30, 멘탈 -2)"; } },
        { label: "참고 연습한다", run: () => { adj("teamfight", 1); adj("stamina", -15); adj("mental", -3); return "성과는 있었지만 지쳤어요. (한타 +1, 체력 -15, 멘탈 -3)"; } },
      ],
    }),
  },
  {
    id: "scout", stages: ["amateur"], when: () => overall() >= 40,
    build: () => ({
      title: "스카우터의 관심",
      text: "아카데미 스카우터가 솔로랭크 경기를 지켜봤대요.",
      choices: [
        { label: "인터뷰에 응한다", run: () => { player.scout = true; adj("mental", 3); return "좋은 인상을 남겼어요. (다음 입단 테스트 합격 확률 +10%p, 멘탈 +3)"; } },
        { label: "연습에 집중한다", run: () => { adj("laning", 1); return "실력으로 보여주기로 했어요. (라인전 +1)"; } },
      ],
    }),
  },
  {
    id: "coach", stages: ["academy", "pro"], when: () => { const b = bestPosition(); return b.pos !== player.position && b.gap >= 4; },
    build: () => {
      const b = bestPosition();
      return {
        title: "코치의 포지션 전환 제안",
        text: `지금 능력치로는 ${POSITIONS[b.pos].label}이 더 잘 맞는다고 코치가 권해요.`,
        choices: [
          { label: `${POSITIONS[b.pos].label}(으)로 전환한다`, run: () => changePosition(b.pos, 2) },
          { label: "지금 포지션을 고수한다", run: () => { adj("mental", 2); return "소신을 지켰어요. (멘탈 +2)"; } },
        ],
      };
    },
  },
  {
    id: "conflict", stages: ["academy", "pro"], when: () => !!player.team,
    build: () => ({
      title: "팀원과 의견 충돌",
      text: "연습 중 전략 문제로 팀원과 말다툼이 있었어요.",
      choices: [
        { label: "대화로 푼다", run: () => { adj("decision", 1); adj("mental", 3); return "오히려 호흡이 좋아졌어요. (판단력 +1, 멘탈 +3)"; } },
        { label: "그냥 넘어간다", run: () => { player.team.level -= 1; adj("mental", -2); return "어색한 분위기가 이어졌어요. (팀 전력 -1, 멘탈 -2)"; } },
      ],
    }),
  },
  {
    id: "sponsor", stages: ["pro"], when: () => true,
    build: () => ({
      title: "스폰서 제안",
      text: "음료 브랜드가 광고 모델 계약을 제안했어요.",
      choices: [
        { label: "계약한다", run: () => { player.money += 300; adj("stamina", -10); return "촬영 일정은 빡빡했지만 수입이 생겼어요. (+300만원, 체력 -10)"; } },
        { label: "경기에 집중한다", run: () => { adj("mental", 2); return "경기에만 집중하기로 했어요. (멘탈 +2)"; } },
      ],
    }),
  },
  {
    id: "transfer", stages: ["pro"], when: () => !!player.team,
    build: () => {
      const offer = player.offer || (player.offer = makeTeam("pro", randInt(-8, 10), player.team.name));
      return {
        title: "이적 제안",
        text: `${offer.name}에서 영입 제안이 왔어요. 팀 전력 ${offer.level}, 연봉 ${annual(offer)}만원 (현재 ${player.team.level}, ${annual(player.team)}만원)`,
        choices: [
          { label: "이적한다", run: () => { player.team = offer; player.offer = null; return `${offer.name}(으)로 이적했어요.`; } },
          { label: "남는다", run: () => { player.offer = null; adj("mental", 1); return "지금 팀에 남기로 했어요. (멘탈 +1)"; } },
        ],
      };
    },
  },
  {
    // 계약 만료: 오프시즌에 달력이 직접 띄웁니다 (랜덤으로는 나오지 않음)
    id: "contract", stages: ["pro"], when: () => false,
    build: () => {
      const n = player.negotiation || (player.negotiation = newNegotiation());
      const t = player.team;
      const keep = () => { player.pendingEvent = "contract"; }; // 협상은 이어서 진행됩니다
      if (n.fa) {
        return {
          title: "FA 시장",
          text: `재계약 대신 시장에 나왔어요. 시장 가치는 주급 약 ${marketValue()}만원이에요.`,
          choices: [
            ...n.fa.map((o) => ({
              label: `${o.name} · 연봉 ${annual(o)}만원 · ${o.yrs}년 · 전력 ${o.level}`,
              run: () => {
                o.contract = { endYear: yearOf(player.day) + o.yrs };
                player.team = o;
                flag("fa");
                player.negotiation = null;
                return `${o.name}과(와) ${o.yrs}년 계약을 맺었어요. (연봉 ${annual(o)}만원)`;
              },
            })),
            {
              label: "원 소속팀과 다시 협상한다",
              run: () => {
                n.fa = null;
                n.offer = Math.max(30, Math.round(n.offer * 0.9));
                n.closed = true;
                keep();
                return `원 소속팀과 다시 이야기했어요. 제안이 10% 낮아졌어요. (연봉 ${annual({ salary: n.offer })}만원)`;
              },
            },
          ],
        };
      }
      const choices = [
        {
          label: "제안을 수락한다",
          run: () => {
            t.salary = n.offer;
            t.contract = { endYear: yearOf(player.day) + n.years };
            player.negotiation = null;
            return `${t.name}과(와) ${n.years}년 재계약! (연봉 ${annual(t)}만원, ${t.contract.endYear}년 11월 30일까지)`;
          },
        },
      ];
      if (!n.closed) {
        choices.push({
          label: `연봉을 더 요구한다 (성공 약 ${Math.round(haggleChance() * 100)}%)`,
          run: () => {
            n.closed = true; // 협상은 한 번만 할 수 있습니다
            keep();
            if (Math.random() < haggleChance()) {
              n.offer = Math.round(n.offer * 1.2);
              flag("haggle");
              return `협상 성공! 구단이 연봉을 20% 올렸어요. (연봉 ${annual({ salary: n.offer })}만원)`;
            }
            n.offer = Math.max(30, Math.round(n.offer * 0.88));
            return `협상이 틀어져 구단이 제안을 낮췄어요. (연봉 ${annual({ salary: n.offer })}만원)`;
          },
        });
      }
      choices.push({
        label: "FA 시장에 나간다",
        run: () => {
          n.fa = makeOffers();
          keep();
          return "FA 시장에 나갔어요. 구단들의 제안이 도착했어요.";
        },
      });
      choices.push({ label: "은퇴한다", run: () => { retire("재계약 대신 은퇴를 선택했습니다."); return null; } });
      return {
        title: "계약 만료와 연봉 협상",
        text: `${t.name} 구단과의 계약이 올해 11월 30일에 끝나요. 구단 제안: 연봉 ${annual({ salary: n.offer })}만원 (주급 ${n.offer}만원), ${n.years}년. 지금 시장 가치는 주급 약 ${marketValue()}만원이에요.`,
        choices,
      };
    },
  },
  {
    id: "surgery", stages: ["pro"], when: () => getAge() >= 27 && player.stats.stamina < 30,
    build: () => ({
      title: "심각한 부상",
      text: "오랜 선수 생활로 손목과 어깨에 무리가 와서 수술이 필요하다는 진단을 받았어요.",
      choices: [
        {
          label: "수술하고 재활한다 (500만원)",
          run: () => {
            if (player.money >= 500) {
              player.money -= 500;
              for (const k of ["laning", "teamfight", "decision"]) adj(k, -2);
              adj("stamina", 30);
              adj("mental", -5);
              return "재활을 마치고 돌아왔어요. (-500만원, 능력치 -2, 체력 +30, 멘탈 -5)";
            }
            for (const k of ["laning", "teamfight", "decision"]) adj(k, -4);
            adj("stamina", 20);
            adj("mental", -10);
            return "비용이 부족해 최소한의 치료만 받았어요. (능력치 -4, 체력 +20, 멘탈 -10)";
          },
        },
        { label: "은퇴한다", run: () => { retire("부상 때문에 은퇴를 결정했습니다."); return null; } },
      ],
    }),
  },
  {
    // 직접 포지션을 바꿀 때 쓰는 선택지 (랜덤으로는 나오지 않음)
    id: "position", stages: ALL, when: () => false,
    build: () => ({
      title: "포지션 변경",
      text: "새 포지션에 적응하느라 능력치가 조금 떨어져요.",
      choices: [
        ...Object.keys(POSITIONS)
          .filter((p) => p !== player.position)
          .map((p) => ({ label: `${POSITIONS[p].label} (능력치 -4)`, run: () => changePosition(p, 4) })),
        { label: "취소", run: () => null },
      ],
    }),
  },
];

function maybeEvent() {
  const pool = EVENTS.filter((e) => e.stages.includes(player.stage) && e.id !== player.lastEvent && e.when());
  if (!pool.length) return;
  const ev = pool[randInt(0, pool.length - 1)];
  player.pendingEvent = ev.id;
  player.lastEvent = ev.id;
}

function chooseEvent(i) {
  const ev = EVENTS.find((e) => e.id === player.pendingEvent);
  if (!ev) return;
  const built = ev.build();
  if (!built.choices[i]) return;
  player.pendingEvent = null; // 선택지가 협상처럼 이어지는 이벤트면 run() 안에서 다시 켭니다
  const out = built.choices[i].run();
  if (out) logNote({ note: `[이벤트] ${built.title}: ${out}` });
  saveGame();
  render();
}

function startPositionChange() {
  if (player.pendingEvent || player.over) return;
  player.pendingEvent = "position";
  saveGame();
  render();
}

// 한 주가 지날 때마다: 월급, 나이에 따른 하락, 은퇴 확인, 랜덤 이벤트
function afterWeek() {
  player.money += weeklyPay();
  adj("stamina", 3); // 경기 주간에도 조금씩 회복됩니다
  adj("mental", 1);
  const age = getAge();
  const every = age >= 29 ? 4 : age >= 27 ? 6 : 0; // 나이가 들면 능력치가 서서히 떨어집니다
  if (every && player.week % every === 0) adj(["laning", "teamfight", "decision"][randInt(0, 2)], -1);
  checkEnd();
  if (!player.over && !player.pendingEvent && Math.random() < 0.25) maybeEvent();
}

function checkEnd() {
  if (player.over) return;
  if (getAge() >= LIMITS[player.stage]) return retire(END_TEXT[player.stage]);
  // 번아웃: 멘탈이 바닥인 채 8주가 이어지면 더는 뛸 수 없습니다
  player.burn = player.stats.mental < 10 ? (player.burn || 0) + 1 : 0;
  if (player.burn === 4) logNote({ note: "번아웃 경고: 멘탈이 바닥이에요. 쉬지 않으면 은퇴할 수도 있어요." });
  if (player.burn >= 8) return retire("번아웃으로 더 이상 경기를 뛸 수 없어 은퇴했습니다.");
  // 프로: 기량이 크게 떨어진 노장은 방출됩니다
  if (player.stage === "pro" && getAge() >= 27 && overall() < 50) {
    return retire("기량이 크게 떨어져 구단에서 방출되었고, 은퇴를 선택했습니다.");
  }
}

function restartGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
  player = null;
  matchEl.hidden = true;
  document.getElementById("start-form").reset();
  showScreen("start");
}

// ---------- 팀 로고: 이름으로 색과 모양이 정해지는 오리지널 엠블럼 ----------
function teamLogo(name, size = 32) {
  const base = name.replace(/ 아카데미$/, "");
  let h = 0;
  for (const ch of base) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 45) % 360;
  const shape = h % 3; // 0 방패, 1 육각형, 2 원
  const latin = base.match(/^[A-Za-z0-9]{1,2}/);
  const initials = (latin ? latin[0] : base.replace(/\s/g, "").slice(0, 2)).replace(/[<>&"]/g, "");
  const body =
    shape === 0
      ? '<path d="M20 2 L36 8 V22 C36 30 28 36 20 39 C12 36 4 30 4 22 V8 Z"'
      : shape === 1
        ? '<path d="M20 2 L36 11 V29 L20 38 L4 29 V11 Z"'
        : '<circle cx="20" cy="20" r="18"';
  const id = `lg${h}`;
  return (
    `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 65% 48%)"/><stop offset="1" stop-color="hsl(${hue2} 70% 26%)"/>` +
    `</linearGradient></defs>` +
    `${body} fill="url(#${id})" stroke="#c8aa6e" stroke-width="2"/>` +
    `<text x="20" y="25" text-anchor="middle" font-size="${initials.length > 1 ? 14 : 18}" font-weight="800" ` +
    `fill="#fff" font-family="sans-serif">${initials}</text></svg>`
  );
}

// ---------- 장비 상점: 연봉으로 장비를 사서 능력치를 보조합니다 ----------
const GBONUS = [0, 2, 4, 6, 7, 8]; // 장비 레벨별 능력치 보정 (뒤로 갈수록 효율이 줄어듭니다)
const GEAR = {
  mouse: { name: "마우스", prices: [400, 1200, 3000, 6500, 12000], effect: (n) => `경기에서 라인전 +${GBONUS[n]}` },
  keyboard: { name: "키보드", prices: [400, 1200, 3000, 6500, 12000], effect: (n) => `경기에서 한타 +${GBONUS[n]}` },
  monitor: { name: "모니터", prices: [500, 1500, 3500, 7500, 14000], effect: (n) => `경기에서 판단력 +${GBONUS[n]}` },
  chair: { name: "게이밍 의자", prices: [300, 900, 2500, 5500, 10000], effect: (n) => `훈련 피로 -${n * 2}, 휴식 회복 +${n * 5}` },
  headset: { name: "헤드셋", prices: [600, 1800, 4000, 8500, 16000], effect: (n) => `팀원 실력 +${GBONUS[n] / 2}` },
};
const gearLv = (key) => (player.gear && player.gear[key]) || 0;
const gearPow = (key) => GBONUS[gearLv(key)];
const gearCap = () => Math.min(5, 3 + yearOf(player.day) - 2026); // 해마다 신형 장비가 나와 한계가 1씩 늘어납니다
const annual = (t) => (t.salary * 52).toLocaleString("ko-KR"); // 주급 -> 연봉
const growthCurve = (v) => Math.max(0.1, 1 - Math.max(0, v - 45) / 55); // 능력치가 높을수록 성장이 더뎌집니다
const leagueBonus = () => Math.min(12, (player.season.no - 1) * 1.5); // 시즌이 지날수록 리그 수준이 올라갑니다
let shopOpen = false;

function toggleShop() {
  shopOpen = !shopOpen;
  render();
  if (shopOpen) document.getElementById("shop").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buyGear(key) {
  if (player.pendingEvent || player.over) return;
  const g = GEAR[key];
  const lv = gearLv(key);
  if (lv >= Math.min(g.prices.length, gearCap()) || player.money < g.prices[lv]) return;
  player.money -= g.prices[lv];
  player.gear[key] = lv + 1;
  logNote({ week: player.week, note: `${g.name} Lv${lv + 1} 구매 (${g.effect(lv + 1)})`, good: true });
  saveGame();
  render();
}

// ---------- 시즌 ----------
// 기록만 남기고 주차는 넘기지 않는 로그
function logNote(entry) {
  player.log.unshift({ week: player.week - 1, date: fmtDate(player.day), ...entry });
  player.log = player.log.slice(0, 30);
}

const matchLabel = () => {
  if (tourneyDue()) {
    const p = tourneyAdvance(player.tourney);
    return `${player.tourney.name} ${p.label} (Bo${p.bo})`;
  }
  return player.season.phase === "playoff" ? `플레이오프 ${ROUNDS[player.season.round]}` : "리그 경기";
};

// 진행 중인 정규시즌의 실시간 순위표
function liveRows() {
  const se = player.season;
  const rows = se.teams.map((t) => ({ name: t.name, wins: (se.live && se.live[t.name] ? se.live[t.name].w : 0), l: (se.live && se.live[t.name] ? se.live[t.name].l : 0), me: false }));
  rows.push({ name: player.team ? player.team.name : "우리 팀", wins: se.w, l: se.l, me: true });
  rows.sort((a, b) => b.wins - a.wins || a.l - b.l || (a.me ? -1 : b.me ? 1 : 0));
  return rows;
}

// 정규시즌 종료: 다른 팀 성적을 정하고 순위를 매깁니다
function finishRegular() {
  const se = player.season;
  const rows = se.teams.map((t) => {
    const p = sigmoid(t.str / 12); // 평균적인 팀을 상대로 이길 확률
    let wins = 0;
    if (se.live && se.live[t.name]) wins = se.live[t.name].w; // 시즌 중 쌓인 성적 그대로
    else for (let i = 0; i < SEASON_GAMES; i++) if (Math.random() < p) wins++;
    return { name: t.name, wins, me: false, tb: Math.random() };
  });
  const played = Math.max(1, se.w + se.l); // 경기 수가 모자라면 10경기로 환산
  rows.push({ name: player.team ? player.team.name : "우리 팀", wins: Math.round((se.w / played) * SEASON_GAMES), me: true, tb: Math.random() });
  rows.sort((a, b) => b.wins - a.wins || a.tb - b.tb); // 동률이면 무작위
  se.table = rows;
  if (se.w === SEASON_GAMES && se.l === 0) flag("perfect"); // 10전 전승
  se.rank = rows.findIndex((x) => x.me) + 1;

  if (se.rank <= 4) {
    se.phase = "playoff";
    se.round = 0;
    if (se.split === "summer") setQual("summer", 3); // 플레이오프 진출 = 월즈 출전권 (최소 3번 시드)
    logNote({ note: `정규시즌 ${se.rank}위로 플레이오프 진출!`, good: true });
  } else {
    endSeason(`정규시즌 ${se.rank}위, 플레이오프 진출 실패`, false);
  }
}

function endSeason(result, good) {
  const se = player.season;
  player.history.unshift({
    no: se.no,
    stage: STAGES[player.stage].label,
    record: `${se.w}승 ${se.l}패`,
    result,
  });
  player.history = player.history.slice(0, 10);
  player.seasons = (player.seasons || 0) + 1;
  if (result === "우승!") player.titles = (player.titles || 0) + 1;
  logNote({ note: `시즌 ${se.no} 종료: ${result}`, good });
  player.lastTable = se.table;
  player.season = newSeason(se.no + 1);
}

// ---------- 달력 / 국제대회 (2026년 실제 일정을 기준으로 매년 반복) ----------
const GAME_START = Date.UTC(2026, 0, 5); // 게임 시작일 (월요일)
const dateOf = (day) => new Date(GAME_START + day * 86400000);
const yearOf = (day) => dateOf(day).getUTCFullYear();
const mdOf = (day) => {
  const d = dateOf(day);
  return (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (day) => {
  const d = dateOf(day);
  return `${d.getUTCFullYear()}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`;
};
const fmtMD = (md) => `${Math.floor(md / 100)}월 ${md % 100}일`;
const dayFor = (md, year) =>
  Math.round((Date.UTC(year, Math.floor(md / 100) - 1, md % 100) - GAME_START) / 86400000);

// 1년 일정 (월일 기준). MSI와 월드 챔피언십 날짜는 2026년 실제 일정입니다.
const CAL = [
  { from: 101, key: "off", label: "오프시즌" },
  { from: 309, key: "spring", label: "스플릿 2 정규시즌" },
  { from: 518, key: "springPO", label: "Road to MSI 플레이오프" },
  { from: 601, key: "trainA", label: "MSI 준비기간" },
  { from: 628, key: "msi", label: "MSI" },
  { from: 713, key: "trainB", label: "휴식기" },
  { from: 720, key: "summer", label: "스플릿 3 정규시즌" },
  { from: 928, key: "summerPO", label: "스플릿 3 플레이오프" },
  { from: 1012, key: "trainC", label: "월즈 준비기간" },
  { from: 1015, key: "worlds", label: "월드 챔피언십" },
  { from: 1115, key: "off", label: "오프시즌" },
];
const EVENT_LIST = [
  { md: 309, label: "스플릿 2 정규시즌 개막" },
  { md: 518, label: "Road to MSI 플레이오프" },
  { md: 628, label: "MSI (6/28~7/12)", intl: "msi" },
  { md: 720, label: "스플릿 3 정규시즌 개막" },
  { md: 928, label: "스플릿 3 플레이오프" },
  { md: 1015, label: "월드 챔피언십 (10/15~11/14)", intl: "worlds" },
];

const calPhase = (day = player.day) => {
  const md = mdOf(day);
  let cur = CAL[0];
  for (const c of CAL) if (c.from <= md) cur = c;
  return cur;
};

function daysIntoPhase() {
  const f = calPhase().from;
  for (let d = 0; d < 400; d++) if (mdOf(player.day - d) === f) return d;
  return 0;
}

// 훈련 한 번에 쓰는 날짜: 보통 7일이지만 다음 일정(달력 구분, 대회 경기일)이 있으면 거기까지만
function trainDays() {
  let d = 7;
  for (let i = 1; i <= 7; i++) {
    if (CAL.some((c) => c.from === mdOf(player.day + i))) {
      d = i;
      break;
    }
  }
  const t = player.tourney;
  if (t && !t.done) {
    const p = tourneyAdvance(t);
    if (p && p.d > player.day) d = Math.min(d, p.d - player.day);
  }
  return Math.max(1, d);
}

const tourneyActive = () => !!(player.tourney && !player.tourney.done);

// 국내 리그 경기를 치러야 하는 주간인지
function domesticDue() {
  if (!STAGES[player.stage].matchLevel || tourneyActive()) return false;
  const se = player.season;
  const k = calPhase().key;
  if (se.phase === "regular") return k === "spring" || k === "summer";
  return se.phase === "playoff";
}

// 국제대회 경기 날짜가 되었는지
function tourneyDue() {
  if (!tourneyActive()) return false;
  const p = tourneyAdvance(player.tourney);
  return !!p && player.day >= p.d;
}

// 경기 일정이 있는 주에는 훈련을 할 수 없습니다
const mustPlay = () => tourneyDue() || domesticDue();

function setQual(split, seed) {
  if (player.stage !== "pro") return;
  const y = yearOf(player.day);
  if (!player.qual || player.qual.year !== y) player.qual = { year: y, msi: 0, worlds: 0 };
  const kind = split === "spring" ? "msi" : "worlds";
  if (!player.qual[kind]) logNote({ note: kind === "msi" ? "MSI 출전권을 얻었습니다!" : "월드 챔피언십 출전권을 얻었습니다!", good: true });
  if (!player.qual[kind] || seed < player.qual[kind]) player.qual[kind] = seed;
}

function intlStatus(kind, yr) {
  if (player.stage !== "pro") return "프로 단계부터 출전";
  const y = yearOf(player.day);
  const q = yr === y && player.qual && player.qual.year === y ? player.qual[kind] : 0;
  if (q) return `출전 확정 (시드 ${q})`;
  const passed = yr === y && (kind === "msi" ? mdOf(player.day) >= 601 : mdOf(player.day) >= 1012);
  return passed ? "출전권 없음" : "출전권 미확보";
}

// 달력이 바뀔 때마다: 국제대회 시작, 스플릿 시작/마감
function syncCalendar() {
  const ph = calPhase();
  const year = yearOf(player.day);
  const st = STAGES[player.stage];

  for (const kind of ["msi", "worlds"]) {
    if (ph.key === kind && player.intlDone[kind] !== year && !tourneyActive()) startTourney(kind, year);
  }
  if (player.tourney && player.tourney.done && ph.key !== player.tourney.kind && player.day - (player.tourney.doneDay || 0) >= 7) {
    player.tourney = null; // 결과 패널은 대회가 끝나고 일주일 뒤에 사라집니다
  }

  if (st.matchLevel && !tourneyActive()) {
    const se = player.season;
    const inSplit = ph.key === "spring" || ph.key === "summer";
    if (se.phase === "regular" && !inSplit) {
      finishRegular(); // 경기 수가 모자라도 정규시즌을 마감합니다
    } else if (se.phase === "idle" && inSplit && daysIntoPhase() <= 14) {
      player.season = { ...newSeason(se.no), phase: "regular", split: ph.key };
      rollPatch(ph.key); // 새 스플릿마다 패치가 적용됩니다
    }
  }

  // 계약 만료: 오프시즌(11/15~)에 재계약 협상이 시작됩니다
  if (contractDue() && !player.pendingEvent && !player.over) {
    if (marketValue() < 60 && getAge() >= 27) retire("어느 구단도 재계약을 제안하지 않아 선수 생활을 마무리했습니다.");
    else player.pendingEvent = "contract";
  }
}

// ---------- 국제대회: MSI / 월드 챔피언십 ----------
// 지역별 팀 (실제 팀 이름을 살짝 비튼 패러디)
const REGION_TEAMS = {
  LPL: ["BLQ", "JDK", "팁 에스포츠", "AI 레전드"],
  LEC: ["프네틱", "카르민 콥", "팀 비탈리티"],
  LCS: ["팀 리키드", "LYOM", "99 시브즈"],
  LCP: ["팀 시크릿 웨일", "딥 크로스 게이머", "CTBC 플라잉 굴"],
  CBLOL: ["푸리아", "라우드"],
};
const REGION_OFFSET = { LCK: 2, LPL: 4, LEC: 1, LCS: -2, LCP: -2, CBLOL: -5 };
const PRIZE = { msi: { champ: 2000, runner: 1200, part: 300 }, worlds: { champ: 5000, runner: 3000, part: 500 } };
const SWISS_MD = [1023, 1024, 1025, 1028, 1029]; // 스위스 라운드 날짜

const mkTeam = (name, region, rank) => ({
  name,
  region,
  me: false,
  lvl: Math.round(66 + leagueBonus() + 1 + REGION_OFFSET[region] - rank * 1.5 + randInt(-3, 3)),
});
const myLvl = () => Math.round(overall() * 0.35 + (player.team ? player.team.level : 60) * 0.65 + gearPow("headset") / 2);
const meTeam = () => ({ name: player.team.name, region: "LCK", me: true, lvl: myLvl() });

// 같은 지역(LCK)에서 올라온 AI 팀 이름: 가장 최근 정규시즌 순위표 상위권
function lckReps(n) {
  const rows = (player.season.table || player.lastTable || []).filter((r) => !r.me).slice(0, 4).map((r) => r.name);
  const pool = rows.length >= n ? rows : shuffle(TEAM_NAMES).slice(0, 4);
  return shuffle(pool).slice(0, n);
}

function aiSeries(a, b, bo) {
  const need = (bo + 1) / 2;
  const p = sigmoid((a.lvl - b.lvl) / 7);
  const sc = [0, 0];
  while (sc[0] < need && sc[1] < need) sc[Math.random() < p ? 0 : 1]++;
  return sc;
}

// ----- 대진표 (더블 엘리미네이션 / 싱글 엘리미네이션) -----
// def.a, def.b: 팀 번호, 또는 "W:경기id"(승자) / "L:경기id"(패자)
function de4(ids, year, md) {
  const D = (k) => dayFor(md[k], year);
  return {
    res: {},
    final: "GF",
    defs: [
      { id: "UR1a", a: ids[0], b: ids[3], bo: 5, d: D("UR1a"), label: "승자조 1R" },
      { id: "UR1b", a: ids[1], b: ids[2], bo: 5, d: D("UR1b"), label: "승자조 1R" },
      { id: "UF", a: "W:UR1a", b: "W:UR1b", bo: 5, d: D("UF"), label: "승자조 결승" },
      { id: "LR1", a: "L:UR1a", b: "L:UR1b", bo: 5, d: D("LR1"), label: "패자조 1R" },
      { id: "LF", a: "W:LR1", b: "L:UF", bo: 5, d: D("LF"), label: "패자조 결승" },
      { id: "GF", a: "W:UF", b: "W:LF", bo: 5, d: D("GF"), label: "결승" },
    ],
  };
}

function de8(ids, year) {
  const D = (md) => dayFor(md, year);
  return {
    res: {},
    final: "GF",
    defs: [
      { id: "UQ1", a: ids[0], b: ids[7], bo: 5, d: D(703), label: "승자조 8강" },
      { id: "UQ2", a: ids[3], b: ids[4], bo: 5, d: D(703), label: "승자조 8강" },
      { id: "UQ3", a: ids[1], b: ids[6], bo: 5, d: D(704), label: "승자조 8강" },
      { id: "UQ4", a: ids[2], b: ids[5], bo: 5, d: D(704), label: "승자조 8강" },
      { id: "US1", a: "W:UQ1", b: "W:UQ2", bo: 5, d: D(706), label: "승자조 4강" },
      { id: "US2", a: "W:UQ3", b: "W:UQ4", bo: 5, d: D(706), label: "승자조 4강" },
      { id: "UF", a: "W:US1", b: "W:US2", bo: 5, d: D(708), label: "승자조 결승" },
      { id: "LR1a", a: "L:UQ1", b: "L:UQ2", bo: 5, d: D(705), label: "패자조 1R" },
      { id: "LR1b", a: "L:UQ3", b: "L:UQ4", bo: 5, d: D(705), label: "패자조 1R" },
      { id: "LR2a", a: "W:LR1a", b: "L:US2", bo: 5, d: D(707), label: "패자조 2R" },
      { id: "LR2b", a: "W:LR1b", b: "L:US1", bo: 5, d: D(707), label: "패자조 2R" },
      { id: "LR3", a: "W:LR2a", b: "W:LR2b", bo: 5, d: D(709), label: "패자조 3R" },
      { id: "LF", a: "W:LR3", b: "L:UF", bo: 5, d: D(710), label: "패자조 결승" },
      { id: "GF", a: "W:UF", b: "W:LF", bo: 5, d: D(712), label: "결승" },
    ],
  };
}

function ko8(pairs, year) {
  const D = (md) => dayFor(md, year);
  return {
    res: {},
    final: "F",
    defs: [
      { id: "QF1", a: pairs[0][0], b: pairs[0][1], bo: 5, d: D(1103), label: "8강" },
      { id: "QF2", a: pairs[1][0], b: pairs[1][1], bo: 5, d: D(1104), label: "8강" },
      { id: "QF3", a: pairs[2][0], b: pairs[2][1], bo: 5, d: D(1105), label: "8강" },
      { id: "QF4", a: pairs[3][0], b: pairs[3][1], bo: 5, d: D(1106), label: "8강" },
      { id: "SF1", a: "W:QF1", b: "W:QF2", bo: 5, d: D(1107), label: "4강" },
      { id: "SF2", a: "W:QF3", b: "W:QF4", bo: 5, d: D(1108), label: "4강" },
      { id: "F", a: "W:SF1", b: "W:SF2", bo: 5, d: D(1114), label: "결승" },
    ],
  };
}

const refTeam = (br, r) => {
  if (typeof r === "number") return r;
  const x = br.res[r.slice(2)];
  return x ? (r[0] === "W" ? x.w : x.l) : null;
};

// 플레이어가 없는 경기는 모두 진행하고, 플레이어가 둘 다음 경기를 돌려줍니다
function bracketAdvance(t, br) {
  for (let again = true; again; ) {
    again = false;
    for (const d of br.defs) {
      if (br.res[d.id]) continue;
      const a = refTeam(br, d.a);
      const b = refTeam(br, d.b);
      if (a == null || b == null || a === t.me || b === t.me) continue;
      const sc = aiSeries(t.teams[a], t.teams[b], d.bo);
      br.res[d.id] = { a, b, sc, w: sc[0] > sc[1] ? a : b, l: sc[0] > sc[1] ? b : a };
      again = true;
    }
  }
  for (const d of br.defs) {
    if (br.res[d.id]) continue;
    const a = refTeam(br, d.a);
    const b = refTeam(br, d.b);
    if (a != null && b != null) {
      return { src: "br", id: d.id, a, b, opp: a === t.me ? b : a, bo: d.bo, d: d.d, label: d.label };
    }
  }
  return null;
}

// ----- 스위스 스테이지 (16팀, 3승 진출 / 3패 탈락) -----
function swissMakePairs(t) {
  const sw = t.sw;
  sw.round += 1;
  const active = t.teams.map((_, i) => i).filter((i) => sw.w[i] < 3 && sw.l[i] < 3);
  const pairs = [];
  if (sw.round === 1) {
    // 전력 순으로 4개 티어를 나눠 1티어 vs 4티어, 2티어 vs 3티어
    const order = active.slice().sort((x, y) => t.teams[y].lvl - t.teams[x].lvl);
    const q = order.length / 4;
    const tier = [0, 1, 2, 3].map((k) => shuffle(order.slice(k * q, (k + 1) * q)));
    for (let i = 0; i < q; i++) pairs.push([tier[0][i], tier[3][i]], [tier[1][i], tier[2][i]]);
  } else {
    const groups = {};
    for (const i of active) {
      const key = `${sw.w[i]}-${sw.l[i]}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(i);
    }
    for (const g of Object.values(groups)) {
      let best = g;
      for (let tries = 0; tries < 80; tries++) {
        const o = shuffle(g);
        let ok = true;
        for (let k = 0; k + 1 < o.length; k += 2) if (sw.met[o[k]].includes(o[k + 1])) ok = false;
        best = o;
        if (ok) break;
      }
      for (let k = 0; k + 1 < best.length; k += 2) pairs.push([best[k], best[k + 1]]);
    }
  }
  // 이미 2승이거나 2패인 팀이 있으면 진출/탈락이 걸린 경기라 3판 2선승
  sw.pairs = pairs.map(([a, b]) => ({
    a,
    b,
    bo: [a, b].some((i) => sw.w[i] === 2 || sw.l[i] === 2) ? 3 : 1,
    d: dayFor(SWISS_MD[sw.round - 1], t.year),
    res: null,
  }));
}

function swissAdvance(t) {
  const sw = t.sw;
  for (;;) {
    if (!sw.pairs.length) {
      if (!t.teams.some((_, i) => sw.w[i] < 3 && sw.l[i] < 3)) {
        sw.done = true;
        return null;
      }
      swissMakePairs(t);
    }
    for (const p of sw.pairs) {
      if (p.res || p.a === t.me || p.b === t.me) continue;
      const sc = aiSeries(t.teams[p.a], t.teams[p.b], p.bo);
      p.res = { a: p.a, b: p.b, sc, w: sc[0] > sc[1] ? p.a : p.b, l: sc[0] > sc[1] ? p.b : p.a };
    }
    const mine = sw.pairs.find((p) => !p.res);
    if (mine) {
      return {
        src: "sw", pair: mine, a: mine.a, b: mine.b, opp: mine.a === t.me ? mine.b : mine.a,
        bo: mine.bo, d: mine.d, label: `스위스 ${sw.round}라운드`,
      };
    }
    for (const p of sw.pairs) {
      sw.w[p.res.w] += 1;
      sw.l[p.res.l] += 1;
      sw.met[p.a].push(p.b);
      sw.met[p.b].push(p.a);
    }
    sw.pairs = [];
  }
}

// 스위스 결과로 8강 대진: 3-0 팀은 3-2 팀과, 나머지는 무작위
function buildKO(t) {
  const sw = t.sw;
  const q = t.teams.map((_, i) => i).filter((i) => sw.w[i] === 3);
  const by = (l) => shuffle(q.filter((i) => sw.l[i] === l));
  const s0 = by(0);
  const s1 = by(1);
  const s2 = by(2);
  let pairs;
  if (q.length === 8 && s0.length === 2 && s2.length >= 2) {
    pairs = [[s0[0], s2[0]], [s0[1], s2[1]]];
    const rest = shuffle([...s1, ...s2.slice(2)]);
    pairs.push([rest[0], rest[1]], [rest[2], rest[3]]);
  } else {
    const r = shuffle(q);
    pairs = [[r[0], r[1]], [r[2], r[3]], [r[4], r[5]], [r[6], r[7]]];
  }
  return ko8(pairs, t.year);
}

function buildMsiBracket(t, winnerIdx) {
  const ids = [4, 5, 6, 7, 8, 9, 10, winnerIdx];
  const ok = (o) => [[0, 7], [3, 4], [1, 6], [2, 5]].every(([x, y]) => t.teams[o[x]].region !== t.teams[o[y]].region);
  let best = shuffle(ids);
  for (let i = 0; i < 60 && !ok(best); i++) best = shuffle(ids);
  return de8(best, t.year);
}

// seed: 0이면 플레이어 불참(AI끼리만 진행)
function buildMSI(seed, year) {
  const R = (region, n) => REGION_TEAMS[region].slice(0, n).map((nm, i) => mkTeam(nm, region, i));
  const names = lckReps(seed ? 1 : 2);
  const lck = seed
    ? seed === 1 ? [meTeam(), mkTeam(names[0], "LCK", 1)] : [mkTeam(names[0], "LCK", 0), meTeam()]
    : [mkTeam(names[0], "LCK", 0), mkTeam(names[1], "LCK", 1)];
  const lpl = R("LPL", 2), lec = R("LEC", 2), lcs = R("LCS", 2), lcp = R("LCP", 2), cb = R("CBLOL", 1);
  // 2번 시드 4팀은 플레이-인, 나머지 7팀은 브라켓 직행
  const teams = [lck[1], lec[1], lcs[1], lcp[1], lck[0], lpl[0], lpl[1], lec[0], lcs[0], lcp[0], cb[0]];
  const pi = { UR1a: 628, UR1b: 628, UF: 629, LR1: 629, LF: 630, GF: 701 };
  return {
    kind: "msi", name: `MSI ${year}`, year, teams, me: teams.findIndex((x) => x.me),
    stage: "playin", br: de4([0, 1, 2, 3], year, pi), done: false,
  };
}

function buildWorlds(seed, year) {
  const R = (region, from, to) => REGION_TEAMS[region].slice(from, to).map((nm, i) => mkTeam(nm, region, from + i));
  const names = lckReps(seed ? 3 : 4);
  const ai = names.map((n, i) => mkTeam(n, "LCK", i + (seed ? 1 : 0)));
  const lck = seed ? [meTeam(), ...ai] : ai;
  const direct = [...lck, ...R("LPL", 0, 4), ...R("LEC", 0, 2), ...R("LCS", 0, 2), ...R("LCP", 0, 2), ...R("CBLOL", 0, 1)];
  // 플레이-인: 각 지역 마지막 시드 4팀이 겨뤄 1팀만 스위스에 합류 (LCK는 4팀 모두 직행)
  const pi = [R("LEC", 2, 3)[0], R("LCS", 2, 3)[0], R("LCP", 2, 3)[0], R("CBLOL", 1, 2)[0]];
  const piBr = de4([0, 1, 2, 3], year, { UR1a: 1015, UR1b: 1015, UF: 1016, LR1: 1016, LF: 1017, GF: 1018 });
  bracketAdvance({ teams: pi, me: -1 }, piBr);
  const teams = [...direct, pi[piBr.res.GF.w]];
  return {
    kind: "worlds", name: `월드 챔피언십 ${year}`, year, teams, me: teams.findIndex((x) => x.me),
    stage: "swiss", done: false,
    sw: { w: Array(16).fill(0), l: Array(16).fill(0), met: Array.from({ length: 16 }, () => []), round: 0, pairs: [], done: false },
  };
}

// 대회를 한 단계씩 진행합니다. 플레이어가 둘 경기가 있으면 그 경기를, 대회가 끝나면 null을 돌려줍니다.
function tourneyAdvance(t) {
  for (;;) {
    if (t.done) return null;
    if (t.stage === "swiss") {
      const p = swissAdvance(t);
      if (p) return p;
      t.ko = buildKO(t);
      t.stage = "ko";
      continue;
    }
    if (t.stage === "playin") {
      const p = bracketAdvance(t, t.br);
      if (p) return p;
      t.pi = t.br;
      t.br = buildMsiBracket(t, t.pi.res.GF.w);
      t.stage = "bracket";
      continue;
    }
    const br = t.stage === "ko" ? t.ko : t.br;
    const p = bracketAdvance(t, br);
    if (p) return p;
    finishTourney(t);
    return null;
  }
}

function tourneyResult(t) {
  const me = t.me;
  if (t.champion === me) return { text: "우승!", place: 1 };
  const lastIn = (br) =>
    br ? br.defs.filter((d) => br.res[d.id] && (br.res[d.id].a === me || br.res[d.id].b === me)).pop() : null;
  const br = t.stage === "ko" ? t.ko : t.br;
  const d = lastIn(br);
  if (d) return d.id === br.final ? { text: "준우승", place: 2 } : { text: `${d.label} 탈락`, place: 3 };
  if (t.kind === "worlds") return { text: `스위스 스테이지 ${t.sw.w[me]}승 ${t.sw.l[me]}패 탈락`, place: 9 };
  const dp = lastIn(t.pi);
  return { text: `플레이-인 ${dp.label} 탈락`, place: 9 };
}

function finishTourney(t) {
  t.done = true;
  t.doneDay = player.day;
  const br = t.stage === "ko" ? t.ko : t.br;
  t.champion = br.res[br.final].w;
  const champ = t.teams[t.champion];
  if (t.me < 0) {
    logNote({ note: `[${t.name}] 우승: ${champ.name} (${champ.region})` });
    return;
  }
  const res = tourneyResult(t);
  t.resultText = res.text;
  const pz = PRIZE[t.kind];
  const prize = res.place === 1 ? pz.champ : res.place === 2 ? pz.runner : pz.part;
  player.money += prize;
  if (res.place === 1) {
    player.intl[t.kind] += 1;
    player.titles = (player.titles || 0) + 1;
  }
  player.history.unshift({ text: `${t.name}: ${res.text} (상금 ${prize}만원)` });
  player.history = player.history.slice(0, 10);
  logNote({ note: `[${t.name}] ${res.text} · 상금 ${prize}만원`, good: res.place <= 2 });
}

function startTourney(kind, year) {
  player.intlDone[kind] = year;
  if (player.stage !== "pro") return;
  const q = player.qual && player.qual.year === year ? player.qual[kind] : 0;
  const t = kind === "msi" ? buildMSI(q, year) : buildWorlds(q, year);
  if (!q) {
    tourneyAdvance(t); // 플레이어 없이 끝까지 진행하고 우승팀만 기록합니다
    return;
  }
  player.tourney = t;
  flag(kind === "msi" ? "msiPlay" : "worldsPlay");
  const first = tourneyAdvance(t);
  logNote({
    note: `${t.name} 시작! 첫 경기: ${first ? `${first.label} · ${fmtMD(mdOf(first.d))}` : "-"}`,
    good: true,
  });
}

// 국제대회 경기 (세트 스코어로 승부가 나는 시리즈)
function playTourney() {
  const t = player.tourney;
  if (!t || t.done || player.pendingEvent || player.over) return;
  const p = tourneyAdvance(t);
  if (!p || player.day < p.d) return;
  if (champData && !player.champion) {
    openPicker();
    return;
  }
  matchEl.hidden = true;

  const opp = t.teams[p.opp];
  const need = (p.bo + 1) / 2;
  const sc = [0, 0];
  const games = [];
  let r;
  while (sc[0] < need && sc[1] < need) {
    r = simulateMatch(opp.lvl - STAGES.pro.matchLevel, opp.name, 0.6); // 국제대회는 팀 전력(lvl)에 선수 실력을 일부만 더합니다
    sc[r.win ? 0 : 1]++;
    games.push(r.win);
  }
  const win = sc[0] > sc[1];
  r.oppName = opp.name;
  r.label = `${t.name} ${p.label}`;
  r.series = { bo: p.bo, sc: [...sc], games };

  // 결과 저장 (a, b 순서에 맞춘 세트 스코어)
  const rec = {
    a: p.a, b: p.b,
    sc: p.a === t.me ? [sc[0], sc[1]] : [sc[1], sc[0]],
    w: win ? t.me : p.opp, l: win ? p.opp : t.me,
  };
  if (p.src === "br") (t.stage === "ko" ? t.ko : t.br).res[p.id] = rec;
  else p.pair.res = rec;

  // 성장: 큰 경기일수록 경험이 크고, 세트가 길수록 더 지칩니다
  const s = player.stats;
  const scale = 1 + 0.3 * (games.length - 1);
  const k = player.talent * STAGES.pro.growth * ageFactor() * (0.6 + 0.4 * (s.stamina / 100)) * scale;
  const gains = [];
  for (const [stat, [min, max]] of Object.entries({ laning: [0, 1], teamfight: [0, 2], decision: [0, 2] })) {
    const g = Math.round(randInt(min, max) * k * growthCurve(s[stat]));
    s[stat] = clamp(s[stat] + g);
    if (g > 0) gains.push(`${LABELS[stat]} +${g}`);
  }
  if (player.champion) {
    player.mastery[player.champion] = clamp((player.mastery[player.champion] ?? 20) + randInt(1, 3));
  }
  s.stamina = clamp(s.stamina - 10);
  s.mental = clamp(s.mental + (win ? 6 : -6));

  const note =
    `[${t.name}] ${p.label} vs ${opp.name} ${win ? "승리" : "패배"} (${sc[0]}:${sc[1]})` +
    (gains.length ? ` · ${gains.join(", ")}` : "");
  tourneyAdvance(t); // AI 경기를 진행하고, 대회가 끝났다면 결과를 정리합니다
  pushLog({ note, good: win }, 1);
  showMatch(r);
}

// 대회 화면에 보여줄 결과 목록
function tourneyLines(t) {
  const nm = (i) => t.teams[i].name;
  const lines = [];
  const brLines = (br, tag) => {
    for (const d of br.defs) {
      const x = br.res[d.id];
      if (x) lines.push({ text: `${tag}${d.label}: ${nm(x.a)} ${x.sc[0]}:${x.sc[1]} ${nm(x.b)}`, me: x.a === t.me || x.b === t.me });
    }
  };
  if (t.pi) brLines(t.pi, "[플레이-인] ");
  if (t.sw) {
    const order = t.teams.map((_, i) => i).sort((a, b) => t.sw.w[b] - t.sw.w[a] || t.sw.l[a] - t.sw.l[b]);
    for (const i of order) lines.push({ text: `${t.sw.w[i]}-${t.sw.l[i]} ${nm(i)} (${t.teams[i].region})`, me: i === t.me });
  }
  if (t.ko) brLines(t.ko, "[토너먼트] ");
  if (t.stage === "bracket" || (t.stage === "playin" && !t.pi)) brLines(t.br, t.stage === "playin" ? "[플레이-인] " : "[브라켓] ");
  return lines;
}

// ---------- 패치(메타) / 계약 / 은퇴 / 백업 ----------
const TAG_KO = { Fighter: "파이터", Tank: "탱커", Mage: "마법사", Assassin: "암살자", Marksman: "원딜", Support: "서포터" };

// 챔피언에게 미치는 패치 영향 (능력치 단위): 강세/약세 계열 ±3, 개별 버프/너프 ±3
function patchBonus(c) {
  const pt = player.patch;
  if (!pt) return 0;
  let b = pt.champs[c.id] || 0;
  for (const t of c.tags) {
    if (pt.meta.up.includes(t)) b += 3;
    if (pt.meta.down.includes(t)) b -= 3;
  }
  return b;
}

// 새 스플릿이 시작될 때마다 패치가 적용됩니다: 메타 변화, 챔피언 버프/너프, 신규 챔피언, 신형 장비
function rollPatch(split) {
  const tags = shuffle(Object.keys(TAG_KO));
  const meta = { up: tags.slice(0, 2), down: tags.slice(2, 3) };
  const champs = {};
  const notes = [];
  if (champData) {
    const pool = shuffle(champData.list);
    pool.slice(0, 3).forEach((c) => (champs[c.id] = 3));
    pool.slice(3, 6).forEach((c) => (champs[c.id] = -3));
    if (player.seenChamps) {
      const fresh = champData.list.filter((c) => !player.seenChamps.includes(c.id));
      if (fresh.length) notes.push(`신규 챔피언: ${fresh.map((c) => c.name).join(", ")}`);
    }
    player.seenChamps = champData.list.map((c) => c.id);
  }
  const cap = gearCap();
  if (player.patch && cap > (player.patch.gearCap || 3)) notes.push(`신형 장비 출시: 장비를 Lv${cap}까지 올릴 수 있어요`);
  const no = (player.patch ? player.patch.no : 0) + 1;
  const ver = champData ? champData.version.split(".").slice(0, 2).join(".") : String(no);
  player.patch = { no, split, ver, meta, champs, notes, gearCap: cap };
  const ko = (arr) => arr.map((t) => TAG_KO[t]).join("·");
  logNote({ note: `패치 ${ver} 적용: 강세 ${ko(meta.up)} / 약세 ${ko(meta.down)}` });
}

// ----- 계약과 연봉 협상 -----
// 시장 가치(주급): 실력, 우승 경력이 높을수록 오르고 나이가 들면 내려갑니다
const marketValue = () =>
  Math.max(
    0,
    Math.round(
      30 + Math.max(0, overall() - 40) * 3.2 + (player.titles || 0) * 15 +
        ((player.intl || {}).msi || 0) * 50 + ((player.intl || {}).worlds || 0) * 100 -
        Math.max(0, getAge() - 26) * 10,
    ),
  );
const offerFor = (team) => Math.max(30, Math.round(marketValue() * (0.8 + (team.level - 50) / 80)));
const haggleChance = () =>
  Math.max(
    0.15,
    Math.min(
      0.85,
      0.45 + (overall() - 70) * 0.01 + (player.titles || 0) * 0.02 +
        (((player.intl || {}).msi || 0) + ((player.intl || {}).worlds || 0)) * 0.05 - (getAge() >= 28 ? 0.1 : 0),
    ),
  );

// 계약은 매년 11월 30일에 끝나고, 오프시즌(11/15~)에 협상이 시작됩니다
function contractDue() {
  const t = player.team;
  return (
    player.stage === "pro" && !!t && !!t.contract && calPhase().key === "off" && mdOf(player.day) >= 1115 &&
    t.contract.endYear <= yearOf(player.day) && !tourneyActive()
  );
}

const newNegotiation = () => ({
  offer: Math.max(30, Math.round(offerFor(player.team) * 0.92)), // 구단은 처음에 조금 낮게 부릅니다
  years: randInt(1, 3),
  closed: false,
  fa: null,
});

function makeOffers() {
  const used = new Set([player.team.name]);
  const offers = [];
  for (let i = 0; i < 3; i++) {
    let tm;
    for (let tries = 0; tries < 30; tries++) {
      tm = makeTeam("pro", randInt(-6, 10));
      if (!used.has(tm.name)) break;
    }
    used.add(tm.name);
    tm.salary = Math.max(30, Math.round(offerFor(tm) * (0.9 + Math.random() * 0.3)));
    tm.yrs = randInt(1, 3);
    offers.push(tm);
  }
  return offers;
}

// ----- 은퇴 -----
function retire(reason) {
  if (player.over) return;
  player.over = { reason };
  player.pendingEvent = null;
  player.tourney = null;
  logNote({ note: `커리어 종료: ${reason}`, good: player.stage === "pro" });
}

function careerGrade() {
  const w = (player.intl || {}).worlds || 0;
  const m = (player.intl || {}).msi || 0;
  if (w >= 2) return "전설";
  if (w >= 1) return "월드 챔피언";
  if (m >= 1 || (player.titles || 0) >= 3) return "스타 플레이어";
  if (player.stage === "pro") return "프로 선수";
  return player.stage === "academy" ? "유망주" : "무명";
}

// ----- 저장 코드 (다른 기기로 옮기거나 백업) -----
function toCode() {
  const bytes = new TextEncoder().encode(JSON.stringify(player));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromCode(code) {
  const bin = atob(code.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---------- 업적 (모든 커리어에 걸쳐 모입니다) ----------
const ACH_KEY = "lol-manager-ach";
let achAll = {}; // { 업적id: 달성한 날짜 }
let toastTimer = null;

const flag = (k) => {
  if (!player.flags) player.flags = {};
  player.flags[k] = true;
};
const ACHIEVEMENTS = [
  { id: "first_win", name: "첫 승리", desc: "리그 경기에서 처음으로 이기기", test: () => player.record.w >= 1 },
  { id: "academy", name: "아카데미 입단", desc: "아카데미 입단 테스트 합격", test: () => player.stage !== "amateur" },
  { id: "pro", name: "프로 데뷔", desc: "프로 승격 테스트 합격", test: () => player.stage === "pro" },
  { id: "young_pro", name: "천재 소년", desc: "15세 안에 프로 데뷔 (게임 첫 해)", test: () => !!player.flags.youngPro },
  { id: "perfect", name: "무패 행진", desc: "정규시즌 10전 전승", test: () => !!player.flags.perfect },
  { id: "title", name: "첫 우승", desc: "스플릿 또는 국제대회 우승", test: () => (player.titles || 0) >= 1 },
  { id: "msi_play", name: "국제 무대", desc: "MSI에 출전하기", test: () => !!player.flags.msiPlay },
  { id: "msi_win", name: "MSI 챔피언", desc: "MSI 우승", test: () => player.intl.msi >= 1 },
  { id: "worlds_play", name: "월드 챔피언십 출전", desc: "월드 챔피언십에 출전하기", test: () => !!player.flags.worldsPlay },
  { id: "worlds_win", name: "월드 챔피언", desc: "월드 챔피언십 우승", test: () => player.intl.worlds >= 1 },
  { id: "legend", name: "전설", desc: "월드 챔피언십 2회 우승", test: () => player.intl.worlds >= 2 },
  { id: "stat90", name: "완성형 선수", desc: "종합 능력치 90 달성", test: () => overall() >= 90 },
  { id: "full_gear", name: "장비 맞춤 완료", desc: "장비 5종을 모두 Lv3 이상으로", test: () => Object.keys(GEAR).every((k) => gearLv(k) >= 3) },
  { id: "max_gear", name: "신형 장비", desc: "장비를 Lv5까지 강화", test: () => Object.keys(GEAR).some((k) => gearLv(k) >= 5) },
  { id: "rich", name: "억대 부자", desc: "보유 자산 1억원(10,000만원) 달성", test: () => player.money >= 10000 },
  { id: "fa", name: "자유의 몸", desc: "FA 시장에서 새 구단과 계약", test: () => !!player.flags.fa },
  { id: "haggle", name: "협상의 달인", desc: "연봉 협상에 성공", test: () => !!player.flags.haggle },
  { id: "swap", name: "만능 플레이어", desc: "포지션 변경 경험", test: () => !!player.flags.swap },
  { id: "veteran", name: "노장의 품격", desc: "29세까지 프로로 활동", test: () => player.stage === "pro" && getAge() >= 29 },
];

function loadAch() {
  try {
    achAll = JSON.parse(localStorage.getItem(ACH_KEY)) || {};
  } catch {
    achAll = {};
  }
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  if (typeof setTimeout === "function") {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3500);
  }
}

function renderAch() {
  const ul = document.getElementById("ach-list");
  const sum = document.getElementById("ach-sum");
  if (!ul || !sum) return;
  ul.innerHTML = "";
  sum.textContent = `업적 ${Object.keys(achAll).length}/${ACHIEVEMENTS.length}`;
  for (const a of ACHIEVEMENTS) {
    const done = !!achAll[a.id];
    const li = document.createElement("li");
    li.className = done ? "done" : "locked";
    li.textContent = `${done ? "★" : "☆"} ${a.name} · ${a.desc}${done ? ` (${achAll[a.id]})` : ""}`;
    ul.append(li);
  }
}

// 조건을 만족한 업적을 확인합니다. 처음 얻는 업적만 알림이 뜹니다.
function checkAch() {
  if (!player) return;
  if (!player.ach) player.ach = {};
  if (!player.flags) player.flags = {};
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (player.ach[a.id]) continue;
    let ok = false;
    try {
      ok = a.test();
    } catch {}
    if (!ok) continue;
    player.ach[a.id] = fmtDate(player.day);
    if (!achAll[a.id]) {
      achAll[a.id] = fmtDate(player.day);
      logNote({ note: `업적 달성: ${a.name}`, good: true });
      toast(`업적 달성! ${a.name}`);
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(ACH_KEY, JSON.stringify(achAll));
    } catch {}
    renderAch();
  }
}

// ---------- 시작 화면 그림 ----------
// 기본 그림은 오리지널 일러스트(SVG)이고, 챔피언 데이터가 있으면 Riot Data Dragon의 스플래시 아트가 뒤에 천천히 바뀌며 깔립니다.
let heroTimer = null;
function stopHero() {
  if (heroTimer) {
    clearInterval(heroTimer);
    heroTimer = null;
  }
}
function startHero() {
  const img = document.getElementById("hero-splash");
  if (!img || !champData || heroTimer) return;
  const show = () => {
    const c = champData.list[randInt(0, champData.list.length - 1)];
    const next = new Image();
    next.onload = () => {
      img.classList.remove("on");
      setTimeout(() => {
        img.src = next.src;
        img.hidden = false;
        img.classList.add("on");
      }, 500);
    };
    next.src = `${DD}/cdn/img/champion/splash/${c.id}_0.jpg`;
  };
  show();
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced) heroTimer = setInterval(show, 9000);
}

// ---------- 챔피언 (Riot Data Dragon) ----------
async function loadChampions() {
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(CHAMP_KEY));
  } catch {}
  if (cached && cached.list) {
    champData = cached;
    if (player) render();
  }
  try {
    const versions = await (await fetch(`${DD}/api/versions.json`)).json();
    const ver = versions[0];
    if (cached && cached.version === ver) return;
    const json = await (await fetch(`${DD}/cdn/${ver}/data/ko_KR/champion.json`)).json();
    champData = {
      version: ver,
      list: Object.values(json.data).map((c) => ({ id: c.id, name: c.name, tags: c.tags, img: c.image.full })),
    };
    try {
      localStorage.setItem(CHAMP_KEY, JSON.stringify(champData));
    } catch {}
  } catch {
    if (!champData) champFailed = true;
  }
  if (player) render();
  if (!document.getElementById("start-screen").hidden) startHero(); // 챔피언 데이터가 오면 시작 화면 그림을 바꿉니다
}

const champById = (id) => (champData && id ? champData.list.find((c) => c.id === id) || null : null);
const champIcon = (c) => `${DD}/cdn/${champData.version}/img/champion/${c.img}`;
const fitsPosition = (c, pos) => c.tags.some((t) => POSITION_TAGS[pos].includes(t));

// 챔피언이 라인전/한타에 주는 보정 (숙련도 30이 기준, 포지션이 안 맞으면 감점)
function champEffect() {
  const c = champById(player.champion);
  if (!c) return { lane: 0, fight: 0 };
  let lane = 0;
  let fight = 0;
  for (const t of c.tags) {
    if (TAG_BIAS[t]) {
      lane += TAG_BIAS[t].lane;
      fight += TAG_BIAS[t].fight;
    }
  }
  if (!fitsPosition(c, player.position)) {
    lane -= 12;
    fight -= 12;
  }
  const pb = patchBonus(c); // 패치(메타, 챔피언 버프/너프)
  lane += pb * 2;
  fight += pb * 2;
  const mastery = ((player.mastery[c.id] ?? 20) - 30) * 0.15;
  const pool = ((player.stats.champPool ?? 25) - 30) * 0.05; // 챔프폭이 넓으면 밴/카운터에 덜 흔들려요
  return { lane: lane * 0.5 + mastery + pool, fight: fight * 0.5 + mastery + pool };
}

const who = () => {
  const c = champById(player.champion);
  return c ? `${player.name}(${c.name})` : player.name;
};

const pickerEl = document.getElementById("picker");

function openPicker() {
  pickerEl.hidden = false;
  renderPicker();
  pickerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderPicker() {
  const grid = document.getElementById("champ-grid");
  const msg = document.getElementById("picker-msg");
  grid.innerHTML = "";
  if (!champData) {
    msg.textContent = champFailed
      ? "챔피언 데이터를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요."
      : "챔피언 데이터를 불러오는 중...";
    return;
  }
  const q = document.getElementById("champ-search").value.trim();
  const all = document.getElementById("champ-all").checked;
  const list = champData.list.filter((c) => (all || fitsPosition(c, player.position)) && c.name.includes(q));
  msg.textContent = `${POSITIONS[player.position].label}에 어울리는 챔피언 ${list.length}명`;
  if (all) msg.textContent = `전체 챔피언 ${list.length}명 (포지션이 안 맞으면 불리해요)`;
  for (const c of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "champ-item";
    btn.dataset.id = c.id;
    const img = document.createElement("img");
    img.src = champIcon(c);
    img.alt = "";
    img.loading = "lazy";
    const span = document.createElement("span");
    span.textContent = c.name;
    btn.append(img, span);
    grid.append(btn);
  }
}

function selectChampion(id) {
  player.champion = id;
  if (!(id in player.mastery)) player.mastery[id] = 20;
  pickerEl.hidden = true;
  saveGame();
  render();
}

function renderChampion() {
  const c = champById(player.champion);
  const img = document.getElementById("champ-img");
  if (c) {
    img.src = champIcon(c);
    img.hidden = false;
    document.getElementById("champ-name").textContent = c.name;
    const fit = fitsPosition(c, player.position);
    document.getElementById("champ-sub").textContent =
      `숙련도 ${player.mastery[c.id] ?? 20}${fit ? "" : " · 포지션 불일치"} · 주력(50↑) ${Object.values(player.mastery).filter((v) => v >= POOL_MAIN).length}개 → 챔프폭 ${player.stats.champPool}`;
  } else {
    img.hidden = true;
    document.getElementById("champ-name").textContent = champData
      ? "챔피언을 골라주세요"
      : champFailed
        ? "챔피언 데이터를 불러오지 못했어요"
        : "챔피언 데이터를 불러오는 중...";
    document.getElementById("champ-sub").textContent = "";
  }
  document.getElementById("champ-btn").textContent = c ? "변경" : "선택";
}

// 시즌, 순위표, 시즌 기록, 챔피언 패널
function renderExtra() {
  const se = player.season;
  const st = STAGES[player.stage];

  // 커리어 종료 화면
  const over = player.over;
  document.getElementById("gameover").hidden = !over;
  playEl.classList.toggle("over", !!over);
  if (over) {
    document.getElementById("over-title").textContent = player.stage === "pro" ? "은퇴" : "커리어 종료";
    document.getElementById("over-text").textContent = over.reason;
    const ul = document.getElementById("over-stats");
    ul.innerHTML = "";
    for (const line of [
      `커리어 평가: ${careerGrade()}`,
      `이번 커리어 업적: ${Object.keys(player.ach || {}).length}개 (전체 ${Object.keys(achAll).length}/${ACHIEVEMENTS.length})`,
      `최종 단계: ${st.label}`,
      `나이: ${getAge()}세`,
      `통산 전적: ${player.record.w}승 ${player.record.l}패`,
      `우승: ${player.titles || 0}회 (${player.seasons || 0}시즌)`,
      `MSI 우승 ${(player.intl || {}).msi || 0}회 · 월드 챔피언십 우승 ${(player.intl || {}).worlds || 0}회`,
      `모은 돈: ${player.money}만원`,
    ]) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.append(li);
    }
  }

  // 랜덤 이벤트 카드
  const evEl = document.getElementById("event");
  const ev = !over && player.pendingEvent ? EVENTS.find((e) => e.id === player.pendingEvent) : null;
  const wasHidden = evEl.hidden;
  evEl.hidden = !ev;
  if (ev) {
    const built = ev.build();
    document.getElementById("event-title").textContent = built.title;
    document.getElementById("event-text").textContent = built.text;
    const box = document.getElementById("event-choices");
    box.innerHTML = "";
    built.choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.dataset.choice = i;
      btn.textContent = c.label;
      box.append(btn);
    });
    if (wasHidden) evEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // 팀 정보와 나이 제한
  const teamEl = document.getElementById("team");
  teamEl.hidden = !player.team;
  if (player.team) {
    document.getElementById("team-name").textContent = player.team.name;
    document.getElementById("team-logo").innerHTML = teamLogo(player.team.name, 36);
    document.getElementById("team-pay").textContent =
      `전력 ${player.team.level} · 연봉 ${annual(player.team)}만원 (매주 ${player.team.salary}만원) · 보유 ${player.money}만원` +
      (player.stage === "pro" && player.team.contract ? ` · 계약 ${player.team.contract.endYear}.11.30까지` : "");
    document.getElementById("team-mates").textContent = mateList();
  }
  // 달력과 국제대회
  document.getElementById("cal-now").textContent =
    `${fmtDate(player.day)} · ${tourneyActive() ? player.tourney.name : calPhase().label}${mustPlay() ? " · 이번 일정: 경기" : ""}`;
  const nextUl = document.getElementById("cal-next");
  nextUl.innerHTML = "";
  const y0 = yearOf(player.day);
  const ups = [];
  for (const yr of [y0, y0 + 1]) {
    for (const e of EVENT_LIST) {
      const d = dayFor(e.md, yr);
      if (d >= player.day) ups.push({ ...e, d, yr });
    }
  }
  ups.sort((a, b) => a.d - b.d);
  for (const e of ups.slice(0, 3)) {
    const li = document.createElement("li");
    const left = e.d - player.day;
    li.textContent =
      `${fmtMD(e.md)} · ${e.label} · ${left ? `D-${left}` : "오늘"}` + (e.intl ? ` · ${intlStatus(e.intl, e.yr)}` : "");
    if (e.intl) li.className = "intl";
    nextUl.append(li);
  }

  const tEl = document.getElementById("tourney");
  const tr = player.tourney;
  tEl.hidden = !tr || !!over;
  if (tr && !over) {
    document.getElementById("tourney-title").textContent = tr.name;
    const nx = document.getElementById("tourney-next");
    if (tr.done) {
      nx.textContent = `종료: ${tr.resultText}`;
    } else {
      const p = tourneyAdvance(tr);
      nx.textContent = p
        ? `다음 경기: ${p.label} vs ${tr.teams[p.opp].name} (Bo${p.bo}) · ${fmtMD(mdOf(p.d))}`
        : "";
    }
    const tl = document.getElementById("tourney-list");
    tl.innerHTML = "";
    for (const l of tourneyLines(tr)) {
      const li = document.createElement("li");
      li.textContent = l.text;
      if (l.me) li.className = "me";
      tl.append(li);
    }
  }

  // 패치 노트
  const pEl = document.getElementById("patch");
  const pt = player.patch;
  pEl.hidden = !pt || !st.matchLevel || !!over;
  if (!pEl.hidden) {
    document.getElementById("patch-title").textContent =
      `패치 ${pt.ver} · ${pt.split === "spring" ? "스플릿 2" : "스플릿 3"}`;
    const pl = document.getElementById("patch-list");
    pl.innerHTML = "";
    const add = (text, cls) => {
      const li = document.createElement("li");
      li.textContent = text;
      if (cls) li.className = cls;
      pl.append(li);
    };
    const ko = (arr) => arr.map((t) => TAG_KO[t]).join("·");
    add(`메타: 강세 ${ko(pt.meta.up)} / 약세 ${ko(pt.meta.down)}`);
    const names = (sign) =>
      Object.entries(pt.champs).filter(([, v]) => Math.sign(v) === sign).map(([id]) => (champById(id) || {}).name || id);
    if (names(1).length) add(`버프: ${names(1).join(", ")}`, "up");
    if (names(-1).length) add(`너프: ${names(-1).join(", ")}`, "down");
    for (const n of pt.notes) add(n);
    const mine = champById(player.champion);
    if (mine) {
      const b = patchBonus(mine);
      if (b) add(`내 챔피언 ${mine.name}: 패치 영향 ${b > 0 ? "+" : ""}${b}`, b > 0 ? "up" : "down");
    }
  }

  // 장비 상점
  const shopEl = document.getElementById("shop");
  shopEl.hidden = !shopOpen || !!over || !st.matchLevel;
  if (!shopEl.hidden) {
    document.getElementById("shop-money").textContent = `보유 ${player.money}만원 · 올해 장비 한계 Lv${gearCap()}`;
    const list = document.getElementById("shop-list");
    list.innerHTML = "";
    for (const [key, g] of Object.entries(GEAR)) {
      const lv = gearLv(key);
      const maxed = lv >= Math.min(g.prices.length, gearCap());
      const li = document.createElement("li");
      const info = document.createElement("div");
      info.className = "shop-info";
      const name = document.createElement("strong");
      name.textContent = `${g.name} Lv${lv}`;
      const desc = document.createElement("span");
      desc.textContent = maxed ? g.effect(lv) : lv ? `${g.effect(lv)} → ${g.effect(lv + 1)}` : g.effect(1);
      info.append(name, desc);
      const btn = document.createElement("button");
      btn.dataset.gear = key;
      btn.textContent = maxed ? "최대" : `${g.prices[lv]}만원`;
      btn.disabled = maxed || player.money < g.prices[lv] || !!player.pendingEvent;
      li.append(info, btn);
      list.append(li);
    }
  }

  const limit = LIMITS[player.stage];
  document.getElementById("career-progress").textContent += ` · ${limit}세까지 ${limit - getAge()}년`;


  const seasonEl = document.getElementById("season");
  seasonEl.hidden = !st.matchLevel;
  if (st.matchLevel) {
    document.getElementById("season-text").textContent =
      se.phase === "idle"
        ? "다음 스플릿을 기다리는 중"
        : se.phase === "playoff"
          ? `${se.split === "spring" ? "스플릿 2" : "스플릿 3"} 플레이오프 ${ROUNDS[se.round]} · 정규시즌 ${se.rank}위`
          : `${se.split === "spring" ? "스플릿 2" : "스플릿 3"} 정규시즌 ${se.games}/${SEASON_GAMES}경기 · ${se.w}승 ${se.l}패`;
  }

  const liveOn = st.matchLevel && se.phase === "regular" && se.games > 0;
  // 육성 화면의 시즌 현황 카드
  const sc = document.getElementById("season-card");
  if (sc) {
    sc.hidden = !st.matchLevel || !!over;
    if (!sc.hidden) {
      const sp = se.split === "spring" ? "스플릿 2" : "스플릿 3";
      const rk = liveOn ? liveRows().findIndex((x) => x.me) + 1 : se.phase === "playoff" ? se.rank : 0;
      const yr = yearOf(player.day);
      const sh = (t) => t.replace("출전 확정 (시드 ", "확정·시드").replace(")", "").replace("출전권 ", "").replace("프로 단계부터 출전", "프로부터");
      const line = (k, v) => `<li><span>${k}</span><b>${v}</b></li>`;
      document.getElementById("season-card-list").innerHTML =
        line("리그", se.phase === "idle" ? "다음 스플릿 대기" : se.phase === "playoff" ? `플옵 ${ROUNDS[se.round]}` : `${se.games}/${SEASON_GAMES}경기`) +
        line("순위", rk ? `${rk}위/${se.teams.length + 1}팀` : "-") +
        line("시즌", `${se.w}승 ${se.l}패`) +
        line("통산", `${player.record.w}승 ${player.record.l}패`) +
        line("MSI", sh(intlStatus("msi", yr))) +
        line("월즈", sh(intlStatus("worlds", yr)));
      document.getElementById("season-card-hint").textContent = player.stage === "pro"
        ? "MSI: 스플릿 2 플레이오프 우승(1시드)/준우승(2시드). 월즈: 스플릿 3 플레이오프 진출(3시드), 준우승 2시드, 우승 1시드."
        : "국제대회(MSI·월즈)는 프로 단계부터 출전할 수 있어요.";
    }
  }
  const table = liveOn ? liveRows() : se.table || player.lastTable;
  const standingsEl = document.getElementById("standings");
  standingsEl.hidden = !(st.matchLevel && table);
  if (!standingsEl.hidden) {
    document.getElementById("standings-title").textContent = liveOn ? `현재 순위 (${se.games}/${SEASON_GAMES}경기)` : se.table ? "정규시즌 순위" : "지난 시즌 정규시즌 순위";
    const ol = document.getElementById("standings-list");
    ol.innerHTML = "";
    table.forEach((row, i) => {
      const li = document.createElement("li");
      li.className = (row.me ? "me " : "") + (i === 3 ? "cut" : "");
      li.innerHTML = teamLogo(row.name, 24);
      li.append(`${i + 1}위 ${row.name} · ${row.wins}승 ${row.l !== undefined ? row.l : SEASON_GAMES - row.wins}패`);
      ol.append(li);
    });
  }

  const historyEl = document.getElementById("history");
  historyEl.hidden = player.history.length === 0;
  const ul = document.getElementById("history-list");
  ul.innerHTML = "";
  for (const h of player.history) {
    const li = document.createElement("li");
    li.textContent = h.text || `시즌 ${h.no} (${h.stage}) · ${h.record} · ${h.result}`;
    ul.append(li);
  }

  renderChampion();
}

// ---------- 이벤트 ----------

document.getElementById("event-choices").addEventListener("click", (e) => {
  const i = e.target.dataset.choice;
  if (i !== undefined) chooseEvent(Number(i));
});
document.getElementById("restart-btn").addEventListener("click", restartGame);
document.getElementById("retire-btn").addEventListener("click", () => {
  if (!player || player.over) return;
  if (!confirm("정말 은퇴를 선언할까요? 이 선수의 커리어가 끝납니다.")) return;
  retire("스스로 은퇴를 선언했습니다.");
  saveGame();
  render();
});
document.getElementById("export-btn").addEventListener("click", () => {
  const box = document.getElementById("save-code");
  const msg = document.getElementById("backup-msg");
  if (!player) {
    msg.textContent = "저장할 선수가 아직 없어요.";
    return;
  }
  box.value = toCode();
  if (box.select) box.select();
  msg.textContent = "저장 코드를 만들었어요. 복사해서 메모장 등에 보관하세요.";
});
document.getElementById("import-btn").addEventListener("click", () => {
  const box = document.getElementById("save-code");
  const msg = document.getElementById("backup-msg");
  try {
    const obj = fromCode(box.value);
    if (!obj || !obj.stats || !obj.name) throw new Error("bad");
    localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
    const loaded = loadGame();
    if (!loaded) throw new Error("bad");
    player = loaded;
    syncCalendar();
    matchEl.hidden = true;
    render();
    showScreen("play");
    saveGame();
    msg.textContent = "저장 코드에서 선수를 불러왔어요!";
  } catch {
    msg.textContent = "저장 코드가 올바르지 않아요.";
  }
});
// 탭을 닫거나 다른 앱으로 넘어갈 때도 한 번 더 저장합니다
if (window.addEventListener) window.addEventListener("pagehide", saveGame);
if (document.addEventListener) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveGame();
  });
}
document.getElementById("shop-list").addEventListener("click", (e) => {
  const key = e.target.dataset.gear;
  if (key) buyGear(key);
});
document.getElementById("champ-btn").addEventListener("click", () => {
  if (!pickerEl.hidden) pickerEl.hidden = true;
  else openPicker();
});
document.getElementById("champ-search").addEventListener("input", renderPicker);
document.getElementById("champ-all").addEventListener("change", renderPicker);
document.getElementById("champ-grid").addEventListener("click", (e) => {
  const item = e.target.closest(".champ-item");
  if (item) selectChampion(item.dataset.id);
});

document.getElementById("start-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("name-input").value.trim();
  const posKey = document.querySelector('input[name="position"]:checked').value;
  if (!name) return;
  player = createPlayer(name, posKey);
  syncCalendar();
  matchEl.hidden = true;
  saveGame();
  render();
  showScreen("play");
});

actionsEl.addEventListener("click", (e) => {
  const key = e.target.dataset.action;
  if (key === "match") (tourneyDue() ? playTourney() : playMatch());
  else if (key === "position") startPositionChange();
  else if (key === "shop") toggleShop();
  else if (key) train(key);
});

testBtn.addEventListener("click", takeTest);

document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("정말 새로 시작할까요? 지금 선수는 사라집니다.")) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
  player = null;
  matchEl.hidden = true;
  document.getElementById("start-form").reset();
  showScreen("start");
});

// ---------- 시작 ----------
loadAch();
player = loadGame();
if (player) {
  syncCalendar();
  document.getElementById("save-status").textContent = `저장된 선수를 불러왔어요 · ${fmtDate(player.day)}`;
}
loadChampions();
if (player) {
  render();
  showScreen("play");
} else {
  showScreen("start");
}
