// 오리지널 BGM: Web Audio API로 실시간 합성합니다 (음원 파일이 없어 저작권 문제가 없어요)
// A단조 8마디 루프: 패드 + 베이스 + 아르페지오 + 리드 + 드럼. 시작 화면과 게임 내내 흐릅니다.
(() => {
  const KEY = "lol-manager-bgm";
  const pref = { on: false, vol: 0.35 };
  try {
    Object.assign(pref, JSON.parse(localStorage.getItem(KEY)) || {});
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(pref));
    } catch {}
  };

  const AC = window.AudioContext || window.webkitAudioContext;
  const btn = document.getElementById("bgm-btn");
  const vol = document.getElementById("bgm-vol");
  const box = document.getElementById("audio");
  if (!AC || !btn) {
    if (box) box.hidden = true; // 소리를 낼 수 없는 환경이면 버튼을 숨깁니다
    return;
  }

  const BPM = 88;
  const EIGHTH = 60 / BPM / 2; // 8분음표 길이(초)
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 코드 진행: Am - F - C - G / Am - F - Dm - E
  const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60], [53, 57, 62], [52, 56, 59]];
  const BASS = [45, 41, 48, 43, 45, 41, 50, 40];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
  // 리드 멜로디: [시작 스텝, 음(MIDI), 길이(스텝)]
  const LEAD = [
    [[0, 76, 4], [4, 74, 2], [6, 72, 2]],
    [[0, 72, 4], [4, 69, 4]],
    [[0, 76, 4], [4, 79, 2], [6, 76, 2]],
    [[0, 74, 6], [6, 71, 2]],
    [[0, 81, 4], [4, 79, 2], [6, 76, 2]],
    [[0, 77, 4], [4, 76, 2], [6, 72, 2]],
    [[0, 74, 4], [4, 77, 4]],
    [[0, 80, 6], [6, 76, 2]],
  ];

  let ctx = null, master, arpBus, noiseBuf, timer = null, nextTime = 0, step = 0;

  function init() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    // 아르페지오에 에코(딜레이)를 걸어 공간감을 줍니다
    arpBus = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = EIGHTH * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    arpBus.connect(master);
    arpBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(type, freq, t, dur, v, o = {}) {
    const osc = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const attack = o.attack ?? 0.01;
    const rel = o.rel ?? 0.15;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.value = o.detune || 0;
    f.type = "lowpass";
    f.frequency.value = o.cutoff || 2000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.setValueAtTime(v, t + Math.max(attack, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    osc.connect(f);
    f.connect(g);
    g.connect(o.dest || master);
    osc.start(t);
    osc.stop(t + dur + rel + 0.05);
  }

  function noise(t, dur, v, filterType, freq) {
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = filterType;
    f.frequency.value = freq;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function kick(t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  function playStep(n, t) {
    const bar = Math.floor(n / 8) % 8;
    const s = n % 8;
    const chord = CHORDS[bar];

    if (s === 0) {
      // 패드: 느리게 차오르는 코드
      for (const m of chord) {
        tone("sawtooth", hz(m), t, EIGHTH * 8, 0.04, { attack: 0.5, rel: 0.9, cutoff: 700 });
        tone("triangle", hz(m), t, EIGHTH * 8, 0.04, { attack: 0.6, rel: 0.9, cutoff: 900, detune: 7 });
      }
    }
    if (s === 0 || s === 3 || s === 4 || s === 6) tone("triangle", hz(BASS[bar]), t, EIGHTH * 1.6, 0.18, { cutoff: 420, rel: 0.1 });

    // 아르페지오
    const tones = [chord[0], chord[1], chord[2], chord[0] + 12];
    tone("triangle", hz(tones[ARP[s]] + 12), t, EIGHTH * 0.9, 0.06, { cutoff: 3200, rel: 0.2, dest: arpBus });

    // 리드 멜로디
    for (const [ls, m, len] of LEAD[bar]) {
      if (ls === s) tone("sawtooth", hz(m), t, EIGHTH * len * 0.95, 0.045, { attack: 0.04, rel: 0.25, cutoff: 1800 });
    }

    // 드럼: 뒤 4마디부터 스네어가 들어와 고조됩니다
    if (s === 0 || s === 4) kick(t);
    if (bar >= 4 && (s === 2 || s === 6)) noise(t, 0.18, 0.09, "bandpass", 1800);
    if (s % 2 === 1) noise(t, 0.05, 0.03, "highpass", 7000);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.3) {
      playStep(step, nextTime);
      nextTime += EIGHTH;
      step = (step + 1) % 64;
    }
  }

  function start() {
    if (!ctx) init();
    ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(pref.vol * 0.9, ctx.currentTime, 0.2);
    if (!timer) {
      nextTime = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 100);
    }
  }

  function stop() {
    if (!ctx) return;
    master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    clearInterval(timer);
    timer = null;
  }

  function refresh() {
    btn.textContent = pref.on ? (ctx && ctx.state === "running" ? "♪ BGM 끄기" : "♪ BGM (화면을 탭하면 시작)") : "♪ BGM 켜기";
    if (vol) vol.value = Math.round(pref.vol * 100);
  }

  // 브라우저는 사용자가 화면을 누르기 전에는 소리를 낼 수 없어서, 첫 터치 때 시작합니다
  function arm() {
    const go = () => {
      document.removeEventListener("pointerdown", go, true);
      if (pref.on) start();
      refresh();
    };
    document.addEventListener("pointerdown", go, true);
  }

  btn.addEventListener("click", () => {
    pref.on = !pref.on;
    save();
    if (pref.on) start();
    else stop();
    refresh();
  });
  if (vol) {
    vol.addEventListener("input", () => {
      pref.vol = Math.max(0, Math.min(1, Number(vol.value) / 100));
      save();
      if (master && pref.on) master.gain.setTargetAtTime(pref.vol * 0.9, ctx.currentTime, 0.05);
    });
  }
  // 앱을 내리면 소리를 멈추고, 돌아오면 이어서 재생합니다
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.visibilityState === "hidden") ctx.suspend();
    else if (pref.on) ctx.resume();
  });

  if (pref.on) arm();
  refresh();
})();
