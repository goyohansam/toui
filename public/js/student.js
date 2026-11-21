// 학생 화면
import { initStore, store, C, Q, ts, inc } from './store.js';
import {
  ROLES, STAGES, METHODS, methodName, settingsOf, TODOS, RATING, STAR_PEER, STAR_TEAM, REFLECT_Q, REFLECT_A,
  esc, $, $$, fmt, r1, hashPin, tleft, paint, guideMap, beadsHtml, rolesLabel, noteText, opinionOf, beep, toast,
} from './common.js';

const app = $('#app');
const WATCH = Q.get('watch'); // 교사가 학생 화면을 그대로 보기(읽기 전용)
const RO = !!WATCH;

const S = {
  ready: false, sid: null, cls: null, roster: [], settings: settingsOf(null),
  session: null, group: null, gp: null, note: null, notes: {}, record: null, stickers: [],
  myRating: null, myRefl: null, me: null, myLog: null, logs: null,
  view: 'home', modal: null, pick: null, pin: '', loginErr: '',
  praiseTo: null, s7: null, rate: { peers: {}, together: 0, i: 0 }, refl: { a: [null, null, null] },
  saved: {}, fresh: {}, pauseOpen: false, beeped: false,
};
const D = {}; // 입력 중인 글(아직 저장 전)
const val = (k, server) => (k in D ? D[k] : server ?? '');
const nm = (sid) => (S.roster.find((s) => s.id === sid) || {}).name || '?';
const myRoles = () => (S.group && S.group.members[S.sid]) || [];
const has = (r) => myRoles().includes(r);
const frozen = () => (S.session && S.session.freeze) || (S.group && S.group.frozen) || null;
const nowEff = () => { const f = frozen(); return f ? f.at : store.now(); };
const canWrite = () => !RO && !frozen() && S.session && S.session.status === 'open';
const order = () => (S.group && S.group.order) || [];

// ── 구독 관리 ──
const subs = {};
function sub(key, id, start) {
  const cur = subs[key];
  if ((cur ? cur.id : null) === (id || null)) return;
  if (cur) cur.un();
  if (id) subs[key] = { id, un: start() }; else delete subs[key];
}
function wire() {
  const sid = S.sid;
  const sesId = (sid && S.cls && S.cls.activeSession) || null;
  sub('mem', !RO && sid, () => store.watchMember((m) => {
    if (S.sid && (!m || m.sid !== S.sid)) {
      S.sid = null; S.view = 'home';
      S.loginErr = ''; toast('이 기기에서 다른 이름으로 들어갔어요. 내 이름으로 다시 들어와 주세요.');
      upd();
    }
  }));
  sub('me', sid, () => store.watch(`${C}/students/${sid}`, (v) => { S.me = v; render(); }));
  sub('ses', sesId, () => store.watch(`${C}/sessions/${sesId}`, (v) => { S.session = v; upd(); }));
  if (!sesId) S.session = null;
  const gid = (S.session && S.session.assign && S.session.assign[sid]) || null;
  const gp = gid ? `${C}/sessions/${sesId}/groups/${gid}` : null;
  if (gp !== S.gp) { S.gp = gp; resetGroupState(); }
  sub('grp', gp, () => store.watch(gp, onGroup));
  sub('note', gp, () => store.watch(`${gp}/notes/${sid}`, (v) => { S.note = v; effects(); render(); }));
  sub('notes', gp, () => store.watchCol(`${gp}/notes`, (a) => { S.notes = {}; a.forEach((n) => { S.notes[n.id] = n; }); render(); }, ['public', '==', true]));
  sub('rec', gp, () => store.watch(`${gp}/record/main`, (v) => { S.record = v; render(); }));
  sub('stk', gp, () => store.watchCol(`${gp}/stickers`, onStickers));
  sub('rate', gp, () => store.watch(`${gp}/ratings/${sid}`, (v) => { S.myRating = v; render(); }));
  sub('refl', gp, () => store.watch(`${gp}/reflections/${sid}`, (v) => { S.myRefl = v; render(); }));
  const logId = gp && S.group && S.group.ratingConfirmed ? sesId : null;
  sub('log', logId, () => store.watch(`${C}/students/${sid}/pointLogs/${sesId}`, (v) => { S.myLog = v; render(); }));
}
function resetGroupState() {
  Object.assign(S, { group: null, note: null, notes: {}, record: null, stickers: [], myRating: null, myRefl: null, myLog: null, s7: null, praiseTo: null, modal: null, rate: { peers: {}, together: 0, i: 0 }, refl: { a: [null, null, null] } });
  seenStk = null;
  for (const k in D) delete D[k];
}
function upd() { wire(); render(); }

let prevStage = null;
function onGroup(g) {
  const old = S.group;
  S.group = g;
  if (g && old) {
    S.fresh = {};
    for (const sid of g.order || []) if (((g.beads || {})[sid] || 0) > ((old.beads || {})[sid] || 0)) S.fresh[sid] = true;
    if (prevStage === 6 && g.stage === 5) toast('한 번 더 조율해 봐요 🙂');
    if (old.stage !== g.stage) { S.modal = null; S.praiseTo = null; }
  }
  if (g) prevStage = g.stage;
  effects();
  upd();
}
// 조건이 되면 스스로 하는 일: 말을 마친 내 쪽지 공개하기
let publishing = false;
function effects() {
  const g = S.group; const n = S.note;
  if (!g || !n || RO || publishing || n.public || !canWrite()) return;
  if ((n.idea || n.reason) && ((g.spoken || {})[S.sid] || g.stage >= 3)) {
    publishing = true;
    store.set(`${S.gp}/notes/${S.sid}`, { public: true }, true).catch(() => {}).finally(() => { publishing = false; });
  }
}
let seenStk = null;
function onStickers(a) {
  S.stickers = a.sort((x, y) => (x.at || 0) - (y.at || 0));
  if (seenStk === null) seenStk = new Set(a.map((s) => s.id));
  else for (const s of a) if (!seenStk.has(s.id)) { seenStk.add(s.id); if (s.to === S.sid && !RO) popSticker(s); }
  render();
}
function popSticker(s) {
  const d = document.createElement('div');
  d.className = 'stkpop';
  d.innerHTML = `<div><span>${esc(s.icon)}</span><b>${esc(s.name)}</b><em>${esc(nm(s.from))}에게 받았어요</em></div>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2400);
}

// ── 저장 ──
const timers = {};
function debounce(key, ms, fn) { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); }
function saveNote(extra = {}) {
  if (!canWrite() || !S.gp) return Promise.resolve();
  const d = { idea: val('note.idea', S.note && S.note.idea).trim(), reason: val('note.reason', S.note && S.note.reason).trim(), ...extra };
  return store.set(`${S.gp}/notes/${S.sid}`, d, true);
}
function saveRecord() {
  if (!canWrite() || !has('recorder')) return;
  const d = {}; const sent = {};
  for (const k in D) {
    if (!k.startsWith('rec.')) continue;
    sent[k] = D[k];
    if (k.startsWith('rec.op.')) (d.opinions = d.opinions || {})[k.slice(7)] = D[k]; else d[k.slice(4)] = D[k];
  }
  if (!Object.keys(sent).length) return;
  S.saved.rec = 'saving'; markSaved();
  store.set(`${S.gp}/record/main`, d, true).then(() => {
    for (const k in sent) if (D[k] === sent[k]) delete D[k];
    S.saved.rec = 'saved'; markSaved();
  }).catch(() => { S.saved.rec = 'err'; markSaved(); });
}
const savedText = () => (S.saved.rec === 'saving' ? '저장 중…' : S.saved.rec === 'saved' ? '저장됨 ✔' : S.saved.rec === 'err' ? '저장 실패 ⚠' : '');
function markSaved() { const el = $('#recsaved'); if (el) el.textContent = savedText(); }
app.addEventListener('input', (e) => {
  const k = e.target.dataset.k; if (k === undefined) return;
  D[k] = e.target.value;
  if (k.startsWith('note.')) debounce('note', 1000, () => saveNote());
  if (k.startsWith('rec.')) debounce('rec', 1200, saveRecord);
});

// ── 누르기 ──
let suppressClick = false;
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (suppressClick) { suppressClick = false; return; }
  const f = A[el.dataset.act];
  if (f) Promise.resolve().then(() => f(el.dataset)).catch(fail);
});
function fail(err) {
  console.warn(err);
  const denied = err && err.code === 'permission-denied';
  toast(denied ? '지금은 저장할 수 없어요. 선생님께 알려 주세요.' : `잠깐 문제가 생겼어요. 다시 눌러 주세요.${err && err.code ? ` (${err.code})` : ''}`);
}
// 구슬 길게 누르기 = 취소
let lp = null;
app.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-act="bead"]'); if (!el) return;
  const sid = el.dataset.sid;
  lp = setTimeout(() => {
    suppressClick = true; lp = null;
    if (canWrite() && ((S.group.beads || {})[sid] || 0) > 0) { store.update(S.gp, { [`beads.${sid}`]: inc(-1) }); toast(`${nm(sid)} 구슬 1개 취소`); }
  }, 650);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => app.addEventListener(t, () => { if (lp) { clearTimeout(lp); lp = null; } }, true));

const G = (d) => (canWrite() ? store.update(S.gp, d) : null);
const goStage = (n) => {
  const d = { stage: n, stageStart: ts(), speaker: null, timer: null, extra: 0 };
  if (n === 6) d.agree = {};
  return G(d);
};
const A = {
  // 로그인
  pick: (d) => { S.pick = d.sid; S.pin = ''; S.loginErr = ''; render(); },
  unpick: () => { S.pick = null; S.pin = ''; render(); },
  async key(d) {
    if (d.n === 'x') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 4) S.pin += d.n;
    S.loginErr = ''; render();
    if (S.pin.length === 4) {
      const ok = await store.loginStudent(S.pick, await hashPin(S.pin, S.pick));
      if (ok) { S.sid = S.pick; S.pick = null; S.pin = ''; upd(); } else { S.pin = ''; S.loginErr = '핀이 달라요. 다시 눌러 보세요.'; render(); }
    }
  },
  async logout() { S.sid = null; S.view = 'home'; upd(); await store.logoutStudent(); },
  enter: () => { S.view = 'talk'; sessionStorage.setItem('toui-in', S.cls.activeSession); render(); },
  async bank() { S.view = 'bank'; S.logs = null; render(); S.logs = (await store.getCol(`${C}/students/${S.sid}/pointLogs`)).sort((a, b) => (b.at || 0) - (a.at || 0)); render(); },
  home: () => { S.view = 'home'; render(); },
  modal: (d) => { S.modal = d.m; render(); },
  close: () => { S.modal = null; render(); },

  // 이끔이
  next: () => (S.group.stage < 7 ? goStage(S.group.stage + 1) : null),
  prev: () => (S.group.stage > 0 ? goStage(S.group.stage - 1) : null),
  speaker: (d) => G({ speaker: d.sid, timer: { dur: S.session.speakSec, running: false, left: S.session.speakSec } }),
  method: (d) => G({ method: d.id }),
  finish: () => goStage(7),

  // 지킴이
  tstart: () => G({ timer: { dur: S.session.speakSec, running: true, startAt: ts() } }),
  tend: () => { const s = S.group.speaker; return s ? G({ timer: null, speaker: null, [`beads.${s}`]: inc(1), [`spoken.${s}`]: true }) : null; },
  bead: (d) => G({ [`beads.${d.sid}`]: inc(1) }),

  // 쪽지
  async noteDone() {
    if (!canWrite()) return;
    clearTimeout(timers.note);
    await saveNote({ done: true });
    await G({ [`noteDone.${S.sid}`]: true });
  },

  // 칭찬이
  praiseTo: (d) => { S.praiseTo = S.praiseTo === d.sid ? null : d.sid; render(); },
  async sticker(d) {
    if (!canWrite() || !S.praiseTo) return;
    const st = S.settings.stickers[+d.i]; const to = S.praiseTo;
    S.praiseTo = null; render();
    await store.add(`${S.gp}/stickers`, { from: S.sid, to, icon: st.icon, name: st.name, at: ts() });
    toast(`${nm(to)}에게 ${st.icon} 전달!`);
  },

  // 잠깐 멈춤
  async pause() {
    if (!canWrite() || S.group.pause) return;
    S.modal = null;
    await G({ pause: { at: ts() }, pauseCount: inc(1) });
    store.add(`${S.gp}/pauseLogs`, { by: S.sid, at: ts() }).catch(() => {});
  },
  pausePick: (d) => G({ 'pause.pick': d.id }),
  resume: () => G({ pause: null }),
  help: () => G({ pause: null, help: { at: ts() } }),

  // 동의
  agree: () => G({ [`agree.${S.sid}`]: true }),
  notyet: () => G({ stage: 5, stageStart: ts(), agree: {} }),

  // 7단계
  s7: (d) => { S.s7 = +d.n; render(); },
  star: (d) => {
    const n = +d.n;
    if (d.item === 'together') S.rate.together = n;
    else (S.rate.peers[d.sid] = S.rate.peers[d.sid] || {})[d.item] = n;
    render();
  },
  rateGo: (d) => { S.rate.i += +d.n; render(); },
  rateAsk: (d) => { S.rate.ask = d.on === '1'; render(); },
  async rateSubmit() {
    if (!canWrite()) { toast('지금은 제출할 수 없어요.'); return; }
    if (!(S.myRating && S.myRating.submitted)) {
      try {
        await store.set(`${S.gp}/ratings/${S.sid}`, { peers: S.rate.peers, together: S.rate.together, submitted: true, at: ts() });
      } catch (e) {
        // 이미 제출된 별이 있으면(두 번 누름 등) 그대로 다음으로 넘어간다
        const cur = await store.get(`${S.gp}/ratings/${S.sid}`).catch(() => null);
        if (!(cur && cur.submitted)) throw e;
      }
    }
    await G({ [`rated.${S.sid}`]: true });
    S.rate.ask = false; S.s7 = 3; render();
  },
  refl: (d) => { S.refl.a[+d.q] = +d.a; render(); },
  async reflSubmit() {
    if (!canWrite()) return;
    await store.set(`${S.gp}/reflections/${S.sid}`, { a: S.refl.a, text: (D['refl.text'] || '').trim(), at: ts() });
    await G({ [`reflected.${S.sid}`]: true });
    S.s7 = 4; render();
  },
};

// ── 그리기 ──
let raf = 0;
function render() { if (!raf) raf = setTimeout(() => { raf = 0; paint(app, view()); tick(); }, 0); }

function view() {
  if (!S.ready) return '<div class="center"><div class="spin"></div><p>불러오는 중…</p></div>';
  if (!S.sid) return loginView();
  const ses = S.session; const g = S.group;
  if (S.view === 'bank') return bankView();
  const live = ses && ses.status === 'open' && g;
  if (live && (S.view === 'talk' || RO || sessionStorage.getItem('toui-in') === S.cls.activeSession)) return talkView();
  return homeView(live);
}

function loginView() {
  if (!S.roster.length) return `<div class="center"><h1>🗣️ 토의도우미</h1><p>아직 학급이 등록되지 않았어요.<br>선생님께 알려 주세요.</p></div>`;
  if (S.pick) {
    const dots = [0, 1, 2, 3].map((i) => `<i class="${i < S.pin.length ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'x'].map((k) => (k === '' ? '<span></span>' : `<button class="key" data-act="key" data-n="${k}">${k === 'x' ? '⌫' : k}</button>`)).join('');
    return `<div class="center login">
      <h1>${esc(nm(S.pick))}</h1><p>내 핀 번호 4자리를 눌러요${store.demo ? ' <small>(체험판: 1234)</small>' : ''}</p>
      <div class="pindots">${dots}</div><p class="err">${esc(S.loginErr)}</p>
      <div class="keys">${keys}</div>
      <button class="btn ghost" data-act="unpick">← 이름 다시 고르기</button></div>`;
  }
  const groups = {};
  S.roster.forEach((s) => { (groups[s.group] = groups[s.group] || []).push(s); });
  return `<div class="login"><h1>🗣️ 토의도우미</h1><p class="sub">내 이름을 눌러요</p>
    <div class="namegrid">${Object.keys(groups).sort((a, b) => a - b).map((gk) => `<section><h3>${esc(gk)}모둠</h3>${groups[gk].map((s) => `<button class="btn name" data-act="pick" data-sid="${s.id}">${esc(s.name)}</button>`).join('')}</section>`).join('')}</div></div>`;
}

function homeView(live) {
  const ses = S.session; const g = S.group;
  let body;
  if (live) {
    const roles = myRoles();
    body = `<div class="card topiccard"><small>오늘의 주제</small><h2>${esc(ses.topic)}</h2></div>
      <div class="card"><small>내 모둠</small><h2>${esc(g.name)}</h2><p>${order().map((s) => esc(nm(s))).join(' · ')}</p></div>
      <div class="card rolecard c-${roles[0] ? ROLES[roles[0]].color : 'gray'}"><small>오늘 내 역할</small>
        ${roles.map((r) => `<div class="bigrole"><span>${ROLES[r].icon}</span><div><b>${ROLES[r].name}</b><em>${ROLES[r].intro}</em></div></div>`).join('')}</div>
      <button class="btn primary big" data-act="enter">토의 시작하기 ▶</button>`;
  } else if (ses && ses.status === 'open') {
    body = `<div class="card"><h2>오늘 토의 모둠에 내 이름이 없어요</h2><p>선생님께 알려 주세요.</p></div>`;
  } else {
    body = `<div class="card"><h2>${ses ? '오늘 토의가 끝났어요 👏' : '토의방이 아직 안 열렸어요'}</h2><p>${ses ? '내 별 통장에서 점수를 볼 수 있어요.' : '선생님이 열어 주실 때까지 기다려요.'}</p></div>`;
  }
  return `<div class="home"><h1>🗣️ 토의도우미</h1><p class="sub">${esc(nm(S.sid))}</p>${body}
    <div class="row"><button class="btn" data-act="bank">⭐ 내 별 통장</button><button class="btn ghost" data-act="logout">다른 이름으로</button></div>
    ${coverHtml()}</div>`;
}

function bankView() {
  const m = S.me || {};
  const logs = S.logs;
  const totalOnly = S.settings.revealMode === 'total';
  return `<div class="home"><h1>⭐ 내 별 통장</h1><p class="sub">${esc(nm(S.sid))}</p>
    <div class="card bankcard"><small>지금까지 모은 별</small><h2 class="bigscore">${r1(m.total)}<span>점</span></h2>
      <div class="row3">${['listen', 'mediate', 'together'].map((k) => `<div><span>${RATING[k].icon}</span><b>${r1(m[k])}</b><em>${RATING[k].name}</em></div>`).join('')}</div>
      ${m.bonus ? `<p>🎁 선생님 보너스 별 ${r1(m.bonus)}점 포함</p>` : ''}</div>
    <div class="card"><h3>모은 기록</h3>${logs === null ? '<p>불러오는 중…</p>' : logs.length ? `<ul class="loglist">${logs.map((l) => `<li><b>${esc(l.dateStr || '')}</b> ${esc(l.topic || (l.type === 'bonus' ? '선생님 보너스 별' : ''))}
        <span>${l.type === 'bonus' ? `🎁 +${r1(l.total)}` : totalOnly ? `+${r1(l.total)}` : `👂${r1(l.listen)} 🤝${r1(l.mediate)} 🧩${r1(l.together)} = <b>${r1(l.total)}</b>`}</span></li>`).join('')}</ul>` : '<p>아직 기록이 없어요.</p>'}</div>
    <button class="btn" data-act="home">← 돌아가기</button></div>`;
}

function lineBubbles(st) {
  const g = S.group; const ses = S.session;
  return myRoles().map((r) => {
    let txt = S.settings.lines[st][r] || '';
    if (st === 0 && r === 'leader') txt = txt.replace('○○', `'${ses.topic}'`);
    if (st === 6 && r === 'leader' && S.record && S.record.decision) txt = txt.replace('○○', `'${S.record.decision}'`);
    const parts = txt.split(' / ').filter(Boolean);
    return `<div class="bubble c-${ROLES[r].color}"><span class="who">${ROLES[r].icon}</span><div>${parts.map((p) => `<p>${p.startsWith('(') ? esc(p) : `“${esc(p)}”`}</p>`).join('')}</div></div>`;
  }).join('') + (g.speaker ? '' : '');
}
function todoHtml(st) {
  const seen = new Set(); const items = [];
  myRoles().forEach((r) => TODOS[st][r].forEach((t) => { if (!seen.has(t)) { seen.add(t); items.push(t); } }));
  return `<ul class="todo">${items.slice(0, 3).map((t) => `<li>☑️ ${esc(t)}</li>`).join('')}</ul>`;
}
function beadsCard() {
  const g = S.group;
  const counts = order().map((s) => (g.beads || {})[s] || 0);
  const max = Math.max(0, ...counts); const min = Math.min(...counts);
  let hint = '';
  if (order().length > 1 && max - min >= 3) hint = `<p class="hint">💡 ${esc(nm(order()[counts.indexOf(min)]))}에게도 차례를 주자</p>`;
  return `<div class="card beads"><h3>우리 모둠 발언 구슬 <small>말을 한 번 마칠 때마다 1알 · 지킴이가 줘요</small></h3><div class="beadrows">${beadsHtml(g, nm, S.fresh)}</div>${hint}</div>`;
}
function stageBar() {
  return `<div class="stagebar"><div class="track"><i data-tm="stagefill"></i></div><span data-tm="stagetext"></span></div>`;
}
function opinionsCard() {
  const rows = order().map((s) => { const t = opinionOf(s, S.record, S.notes); return `<li><b>${esc(nm(s))}</b> ${t ? esc(t) : '<em>아직 없음</em>'}</li>`; }).join('');
  return `<div class="card"><h3>나온 의견</h3><ul class="plain">${rows}</ul></div>`;
}
function myNoteCard(big) {
  const n = S.note; const t = noteText(n);
  return `<div class="card mynote ${big ? 'bignote' : ''}"><h3>📝 내 쪽지</h3>${t ? `<p><b>내 생각</b> 나는 <u>${esc(n.idea || '…')}</u>(이)라고 생각해.</p><p><b>까닭</b> 왜냐하면 <u>${esc(n.reason || '…')}</u>.</p>` : '<p>쪽지가 비어 있어요. 말로 하면 돼요 🙂</p>'}</div>`;
}

// 단계별 가운데 내용
function stageBody(st) {
  const g = S.group; const ses = S.session; const me = S.sid;
  if (st === 0) {
    return `<div class="card topiccard"><small>오늘의 주제</small><h2>${esc(ses.topic)}</h2></div>
      <div class="card"><h3>토의 약속 (다 같이 읽어요)</h3><ol class="promises">${S.settings.promises.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`;
  }
  if (st === 1) {
    const done = (g.noteDone || {})[me];
    return `<div class="card noteform"><h3>📝 내 생각 쪽지</h3><p class="topicline">주제: ${esc(ses.topic)}</p>
      <label><b>내 생각</b><span class="frame">나는 <textarea rows="2" data-k="note.idea" placeholder="여기에 써요" ${RO ? 'readonly' : ''}>${esc(val('note.idea', S.note && S.note.idea))}</textarea>(이)라고 생각해.</span></label>
      <label><b>까닭</b><span class="frame">왜냐하면 <textarea rows="2" data-k="note.reason" placeholder="여기에 써요" ${RO ? 'readonly' : ''}>${esc(val('note.reason', S.note && S.note.reason))}</textarea>.</span></label>
      ${done ? '<p class="ok">제출했어요 ✔ <small>(다음 단계 전까지 고칠 수 있어요)</small></p>' : '<button class="btn primary big" data-act="noteDone">다 썼어요 ✋</button>'}</div>`;
  }
  if (st === 2) {
    if (g.speaker === me) return `<div class="turn mine">🎤 지금 내 차례! 쪽지를 보며 말해요</div>${myNoteCard(true)}`;
    if (g.speaker) return `<div class="turn">🎤 지금 <b>${esc(nm(g.speaker))}</b> 차례 · 끝까지 들어요 👂</div>`;
    return `<div class="turn wait">이끔이가 말할 친구를 정해요</div>`;
  }
  if (st === 3 || st === 4) return opinionsCard();
  if (st === 5) {
    const lead = has('leader');
    return `${opinionsCard()}<div class="card"><h3>어떤 방법으로 정할까? ${lead ? '<small>(이끔이가 골라요)</small>' : ''}</h3>
      <div class="methods">${METHODS.map((m) => `<button class="method ${g.method === m.id ? 'on' : ''}" ${lead ? `data-act="method" data-id="${m.id}"` : 'disabled'}><span>${m.icon}</span><b>${m.name}</b><em>${m.desc}</em></button>`).join('')}</div></div>`;
  }
  if (st === 6) {
    const rec = S.record || {}; const n = order().length; const ok = order().filter((s) => (g.agree || {})[s]).length;
    const mine = (g.agree || {})[me];
    return `<div class="card decision"><small>우리 모둠의 결정</small><h2>${rec.decision ? esc(rec.decision) : '<em>기록이가 적고 있어요…</em>'}</h2>
        ${g.method ? `<p>조율 방법: <b>${methodName(g.method)}</b></p>` : ''}${rec.why ? `<p>까닭: ${esc(rec.why)}</p>` : ''}</div>
      <div class="card agree"><h3>${n}명 중 ${ok}명 동의 ${ok === n ? '🎉' : ''}</h3>
        <div class="agreedots">${order().map((s) => `<span class="${(g.agree || {})[s] ? 'on' : ''}">${(g.agree || {})[s] ? '👍' : '…'} ${esc(nm(s))}</span>`).join('')}</div>
        ${mine ? '<p class="ok">동의했어요 ✔</p>' : `<div class="row"><button class="btn primary big" data-act="agree">👍 동의해요</button><button class="btn big" data-act="notyet">🤔 아직이에요</button></div>`}</div>`;
  }
  return stage7();
}

// 7단계: 칭찬 발표 → 근거 보기 → 별 평가 → 돌아보기 → 결과
function evidence() {
  const g = S.group;
  return `<div class="card evidence"><h3>근거 보기 <small>구슬을 보고 정해요</small></h3><div class="beadrows">${beadsHtml(g, nm)}</div>
    <ul class="plain small">${order().map((s) => `<li><b>${esc(nm(s))}</b> 쪽지 ${(g.noteDone || {})[s] ? '✔' : '✖'} · 동의 ${(g.agree || {})[s] ? '✔' : '✖'}</li>`).join('')}</ul></div>`;
}
function stars(item, sid, cur, labels) {
  return `<div class="stars">${[1, 2, 3].map((n) => `<button class="star ${cur >= n ? 'on' : ''}" data-act="star" data-item="${item}" data-sid="${sid || ''}" data-n="${n}" aria-label="별 ${n}개">★</button>`).join('')}<em>${cur ? '⭐'.repeat(cur) + ' ' + labels[cur - 1] : '별을 눌러요'}</em></div>`;
}
function stage7() {
  const g = S.group; const me = S.sid;
  const rated = (g.rated || {})[me]; const refl = (g.reflected || {})[me];
  let step = S.s7;
  if (step === null) step = rated ? (refl ? 4 : 3) : 0;
  if (step === 2 && rated) step = 3;
  if (step === 3 && refl) step = 4;
  const peers = order().filter((s) => s !== me);
  const dots = `<div class="steps">${['칭찬', '근거', '별 평가', '돌아보기', '결과'].map((t, i) => `<span class="${i === step ? 'on' : i < step ? 'done' : ''}">${i + 1} ${t}</span>`).join('')}</div>`;
  let body = '';
  if (step === 0) {
    const list = S.stickers.map((s) => `<li>${esc(s.icon)} <b>${esc(nm(s.to))}</b> — ${esc(s.name)}</li>`).join('');
    body = `<div class="card"><h3>⭐ 오늘의 칭찬 ${has('praiser') ? '<small>(내가 소리 내어 발표해요)</small>' : '<small>(칭찬이가 발표해요)</small>'}</h3>${list ? `<ul class="plain praise">${list}</ul>` : '<p>오늘은 스티커가 없었어요. 말로 칭찬해 봐요!</p>'}</div>
      <button class="btn primary big" data-act="s7" data-n="1">다음 ▶</button>`;
  } else if (step === 1) {
    body = `${evidence()}<div class="card compare"><div><small>처음 내 생각</small><p>${esc(noteText(S.note)) || '<em>쪽지 없음</em>'}</p></div><div class="arrow">➜</div><div><small>우리 모둠의 결정</small><p>${esc((S.record || {}).decision || '') || '<em>아직 없음</em>'}</p></div></div>
      <button class="btn primary big" data-act="s7" data-n="2">별 평가하러 가기 ▶</button>`;
  } else if (step === 2) {
    const i = Math.min(S.rate.i, peers.length);
    if (i < peers.length) {
      const p = peers[i]; const r = S.rate.peers[p] || {};
      body = `${evidence()}<div class="card ratecard"><small>친구에게 별 주기 (${i + 1}/${peers.length})</small><h2>${esc(nm(p))}</h2>
        <p><b>👂 듣기</b> ${esc(S.settings.rating.listen)}</p>${stars('listen', p, r.listen || 0, STAR_PEER)}
        <p><b>🤝 조율</b> ${esc(S.settings.rating.mediate)}</p>${stars('mediate', p, r.mediate || 0, STAR_PEER)}</div>
        <div class="row">${i > 0 ? '<button class="btn" data-act="rateGo" data-n="-1">◀ 이전</button>' : ''}<button class="btn primary big" data-act="rateGo" data-n="1" ${r.listen && r.mediate ? '' : 'disabled'}>다음 ▶</button></div>`;
    } else {
      body = `<div class="card ratecard team"><small>우리 모둠에 별 주기</small><h2>🧩 함께</h2><p>${esc(S.settings.rating.together)}</p>${stars('together', '', S.rate.together, STAR_TEAM)}</div>
        ${S.rate.ask ? `<div class="card askbox"><h3>제출하면 고칠 수 없어요. 제출할까요?</h3><div class="row"><button class="btn big" data-act="rateAsk" data-on="0">다시 볼래요</button><button class="btn primary big" data-act="rateSubmit">네, 제출해요 ✔</button></div></div>`
    : `<div class="row">${peers.length ? '<button class="btn" data-act="rateGo" data-n="-1">◀ 이전</button>' : ''}<button class="btn primary big" data-act="rateAsk" data-on="1" ${S.rate.together ? '' : 'disabled'}>별 제출하기 ✔</button></div>`}
        <p class="hint">누가 몇 개 줬는지는 친구들에게 보이지 않아요.</p>`;
    }
  } else if (step === 3) {
    const all = S.refl.a.every((x) => x !== null);
    body = `<div class="card"><h3>자기 돌아보기</h3>${REFLECT_Q.map((q, qi) => `<div class="reflq"><p>${qi + 1}. ${q}</p><div class="faces">${REFLECT_A.map((f, ai) => `<button class="face ${S.refl.a[qi] === ai ? 'on' : ''}" data-act="refl" data-q="${qi}" data-a="${ai}">${f}</button>`).join('')}</div></div>`).join('')}
      <label class="reflq"><p>한 줄 소감 <small>(안 써도 돼요)</small></p><input type="text" data-k="refl.text" maxlength="80" value="${esc(D['refl.text'] || '')}" placeholder="오늘 토의는…"></label></div>
      <button class="btn primary big" data-act="reflSubmit" ${all ? '' : 'disabled'}>돌아보기 끝! ✔</button>`;
  } else {
    const n = order().length; const done = order().filter((s) => (g.rated || {})[s]).length;
    const l = S.myLog;
    if (g.ratingConfirmed && l) {
      const totalOnly = S.settings.revealMode === 'total';
      body = `<div class="card result"><h3>🎉 오늘 받은 별</h3>${totalOnly ? `<h2 class="bigscore">+${r1(l.total)}<span>점</span></h2><p>지금까지 모은 별: <b>${r1((S.me || {}).total)}점</b></p>`
        : `<div class="row3">${['listen', 'mediate', 'together'].map((k) => `<div><span>${RATING[k].icon}</span><b>${r1(l[k])}</b><em>${RATING[k].name}</em></div>`).join('')}</div><h2 class="bigscore">${r1(l.total)}<span>점 / 9점</span></h2>`}</div>
        <button class="btn" data-act="bank">⭐ 내 별 통장 보기</button>`;
    } else {
      body = `<div class="card center2"><h2>수고했어요 👏</h2><p>별 평가 제출: ${n}명 중 ${done}명</p><p>모두 제출하고 선생님이 확인하시면<br>결과가 열려요.</p><div class="spin small"></div></div>`;
    }
  }
  return dots + body;
}

// 역할 도구
function leaderTools(st) {
  const g = S.group; const ses = S.session; const n = order().length;
  let h = '';
  if (st === 1) { const d = order().filter((s) => (g.noteDone || {})[s]).length; h += `<p class="status">${d === n ? '✅ 모두 준비됐어요' : `📝 ${n}명 중 ${d}명 제출`}</p>`; }
  if (st === 2) {
    h += `<p><b>차례 정하기</b> — 말할 친구 이름을 눌러요</p><div class="people">${order().map((s) => {
      const c = (g.beads || {})[s] || 0;
      return `<button class="person ${g.speaker === s ? 'on' : ''} ${c ? 'spoke' : ''}" data-act="speaker" data-sid="${s}"><b>${esc(nm(s))}</b><em>${g.speaker === s ? '지금 차례 🎤' : c ? '말했어요 ✔' : `${esc(nm(s))}의 생각도 들어 볼까?`}</em></button>`;
    }).join('')}</div>`;
  }
  if (st >= 3 && st <= 5) {
    const quiet = order().filter((s) => !((g.beads || {})[s]));
    if (quiet.length) h += `<p class="hint">💡 ${quiet.map((s) => esc(nm(s))).join(', ')}의 생각도 들어 볼까?</p>`;
  }
  const ASK = {
    2: ['한 친구가 말을 마치면 물어봐요', '기록이가 적은 내용이 맞아?', null],
    3: ['기록이가 적을 수 있게 물어봐요', '우리 의견의 같은 점을 한 문장으로 말하면?', 'same'],
    4: ['기록이가 적을 수 있게 물어봐요', '서로 다른 점은 뭐야? 궁금했던 것도 말해 볼까?', 'diff'],
    5: ['기록이가 적을 수 있게 물어봐요', '그럼 우리 모둠의 결정을 한 문장으로 말해 볼까?', 'decision'],
    6: ['기록이가 적을 수 있게 물어봐요', '왜 이렇게 정했는지 한 문장으로 말해 볼까?', 'why'],
  }[st];
  if (ASK) {
    const v = ASK[2] ? ((S.record || {})[ASK[2]] || '').trim() : null;
    h += `<div class="askrec"><small>✏️ ${ASK[0]}</small><p>“${ASK[1]}”</p>${v === null ? '' : v ? `<em class="done">기록이가 적었어요 ✔ <span>${esc(v)}</span></em>` : '<em>기록이가 아직 적지 않았어요</em>'}</div>`;
  }
  if (st < 7) {
    const together = ses.mode === 'together';
    if (st === 6) {
      const all = order().every((s) => (g.agree || {})[s]);
      h += together ? '<button class="btn big next" disabled>선생님이 넘겨 주실 거예요</button>' : `<button class="btn primary big next" data-act="finish" ${all ? '' : 'disabled'}>${all ? '결정 완료! 🎉' : '모두 동의하면 눌러요'}</button>`;
    } else {
      h += together ? '<button class="btn big next" disabled>선생님이 넘겨 주실 거예요</button>' : `<button class="btn primary big next" data-act="next">다음 단계로 ▶ <small>${st + 1}. ${STAGES[st + 1].name}</small></button>`;
      h += '<p class="timeup" data-tm="stageup" hidden>⏰ 이제 넘어가도 좋아요</p>';
    }
    if (!together && st > 0) h += `<button class="btn ghost back" data-act="prev">◀ 이전 단계로 돌아가기 <small>${st - 1}. ${STAGES[st - 1].name}</small></button>`;
  }
  return h ? tool('leader', '이끔이 도구', h) : '';
}
function keeperTools(st) {
  const g = S.group; let h = '';
  if (st === 2) {
    const t = g.timer; const running = t && t.running;
    h += `<div class="timerbox"><svg viewBox="0 0 120 120" class="ring"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" data-tm="ring" transform="rotate(-90 60 60)"/></svg><b data-tm="speak">${fmt(S.session.speakSec)}</b></div>`;
    if (g.speaker) h += running ? `<button class="btn big stop" data-act="tend">■ 끝 <small>${esc(nm(g.speaker))}에게 구슬 1개</small></button>` : `<button class="btn primary big" data-act="tstart">${esc(nm(g.speaker))} 차례 ▶ 시작</button>`;
    else h += '<p class="hint">이끔이가 차례를 정하면 시작 버튼이 떠요</p>';
  }
  if (st >= 3 && st <= 5) {
    h += `<p><b>말을 마친 친구 이름</b>을 눌러 구슬을 줘요 <small>(길게 누르면 취소)</small></p><div class="people">${order().map((s) => `<button class="person bead-btn" data-act="bead" data-sid="${s}"><b>${esc(nm(s))}</b><em>● ${(g.beads || {})[s] || 0}개</em></button>`).join('')}</div>`;
  }
  if (st >= 1 && st <= 6) h += `<p class="small"><b>단계 남은 시간</b></p>${stageBar()}`;
  return h ? tool('keeper', '지킴이 도구', h) : '';
}
function recorderTools(st) {
  if (st < 2 || st > 6) return '';
  const r = S.record || {}; const g = S.group; const ro = RO ? 'readonly' : '';
  const ta = (k, v, ph) => `<textarea rows="2" data-k="${k}" placeholder="${ph}" ${ro}>${esc(val(k, v))}</textarea>`;
  let h = `<div class="field"><b>나온 의견</b>${order().map((s) => `<label class="oprow"><span>${esc(nm(s))}</span>${ta('rec.op.' + s, opinionOf(s, r, S.notes), (g.spoken || {})[s] ? '말한 내용' : '말을 마치면 쪽지가 채워져요')}</label>`).join('')}</div>`;
  if (st >= 3) h += `<div class="field"><b>같은 점</b>${ta('rec.same', r.same, '우리 의견에서 비슷한 점')}</div>`;
  if (st >= 4) h += `<div class="field"><b>다른 점 / 궁금했던 점</b>${ta('rec.diff', r.diff, '서로 다른 점, 물어본 것')}</div>`;
  if (st >= 5) h += `<div class="field"><b>우리 모둠의 결정</b>${ta('rec.decision', r.decision, '우리가 정한 것')}<small>조율 방법: ${g.method ? methodName(g.method) : '이끔이가 고르면 표시돼요'}</small></div>`;
  if (st >= 6) h += `<div class="field"><b>그렇게 정한 까닭</b>${ta('rec.why', r.why, '왜 이렇게 정했는지')}</div>`;
  return tool('recorder', `기록이 기록 칸 <span id="recsaved" class="saved">${savedText()}</span>`, h);
}
function praiserTools(st) {
  if (st < 2 || st > 6) return '';
  const got = new Set(S.stickers.map((s) => s.to));
  const others = order().filter((s) => s !== S.sid);
  const none = others.filter((s) => !got.has(s));
  let h = `<p><b>칭찬할 친구</b>를 누르고 스티커를 골라요</p><div class="people">${others.map((s) => `<button class="person ${S.praiseTo === s ? 'on' : ''}" data-act="praiseTo" data-sid="${s}"><b>${esc(nm(s))}</b><em>${got.has(s) ? '받았어요 ⭐' : '아직 못 받았어요'}</em></button>`).join('')}</div>`;
  if (S.praiseTo) h += `<div class="stickers">${S.settings.stickers.map((s, i) => `<button class="sticker" data-act="sticker" data-i="${i}"><span>${esc(s.icon)}</span><b>${esc(s.name)}</b><em>${esc(s.desc || '')}</em></button>`).join('')}</div>`;
  else if (none.length) h += `<p class="hint">💡 아직 스티커를 못 받은 친구: ${none.map((s) => esc(nm(s))).join(', ')}</p>`;
  return tool('praiser', '칭찬이 스티커', h);
}
const tool = (r, title, body) => `<section class="tool c-${ROLES[r].color}"><h3>${ROLES[r].icon} ${title}</h3>${body}</section>`;

function modalHtml() {
  if (!S.modal) return '';
  let h = '';
  if (S.modal === 'mediate') h = `<h2>💬 조율의 말</h2><ul class="mediations">${S.settings.mediations.map((m) => `<li>“${esc(m)}”</li>`).join('')}</ul>`;
  if (S.modal === 'note') h = myNoteCard(true);
  if (S.modal === 'record') {
    const r = S.record || {}; const g = S.group;
    const row = (t, v) => `<div class="recrow"><b>${t}</b><p>${v ? esc(v) : '<em>아직 없음</em>'}</p></div>`;
    h = `<h2>📒 기록 보기</h2><p class="hint">틀린 곳이 있으면 기록이에게 말로 알려 줘요.</p>
      <div class="recrow"><b>나온 의견</b>${order().map((s) => `<p><u>${esc(nm(s))}</u> ${esc(opinionOf(s, r, S.notes)) || '<em>아직 없음</em>'}</p>`).join('')}</div>
      ${row('같은 점', r.same)}${row('다른 점 / 궁금했던 점', r.diff)}${row('우리 모둠의 결정', r.decision)}${row('조율 방법', methodName(g.method))}${row('그렇게 정한 까닭', r.why)}`;
  }
  return `<div class="modal" data-act="close"><div class="sheet" data-act="" data-scroll="sheet">${h}<button class="btn primary big" data-act="close">닫기</button></div></div>`;
}
function pauseHtml() {
  const g = S.group; if (!g || !g.pause) return '';
  if (!S.pauseOpen) return `<div class="cover calm"><div><h1>✋ 잠깐 멈춤</h1><p>숨 세 번 쉬자.</p><div class="count" data-tm="pause">10</div></div></div>`;
  return `<div class="cover calm"><div class="pausebox"><h2>✋ 잠깐 멈춤</h2>
    <ul class="mediations">${S.settings.mediations.slice(0, 3).map((m) => `<li>“${esc(m)}”</li>`).join('')}</ul>
    <h3>어떤 방법으로 풀어 볼까?</h3><div class="methods three">${METHODS.map((m) => `<button class="method ${g.pause.pick === m.id ? 'on' : ''}" data-act="pausePick" data-id="${m.id}"><span>${m.icon}</span><b>${m.name}</b></button>`).join('')}</div>
    <div class="row"><button class="btn primary big" data-act="resume">다시 토의하기 ▶</button><button class="btn big" data-act="help">🙋 선생님 도와주세요</button></div></div></div>`;
}
function coverHtml() {
  return frozen() ? '<div class="cover freeze"><div><div class="eyes">👀</div><h1>선생님을 보세요</h1></div></div>' : '';
}

function talkView() {
  const g = S.group; const ses = S.session; const st = g.stage; const roles = myRoles();
  const tools = st === 1 ? (has('leader') ? leaderTools(st) : '') + (has('keeper') ? keeperTools(st) : '')
    : st === 7 ? ''
      : (has('leader') ? leaderTools(st) : '') + (has('keeper') ? keeperTools(st) : '') + (has('recorder') ? recorderTools(st) : '') + (has('praiser') ? praiserTools(st) : '');
  return `<div class="talk">
    <header class="top">
      ${ses.notice ? `<div class="notice">📢 ${esc(ses.notice.text)}</div>` : ''}
      ${RO ? `<div class="notice ro">👀 선생님 보기 (읽기 전용) — ${esc(nm(S.sid))}</div>` : ''}
      ${guideMap(st)}
    </header>
    <main data-scroll="main">
      <div class="badge c-${roles[0] ? ROLES[roles[0]].color : 'gray'}"><span class="icons">${roles.map((r) => ROLES[r].icon).join('')}</span>
        <div><b>${roles.map((r) => ROLES[r].name).join(' 겸 ') || '역할 없음'}</b><em>${esc(nm(S.sid))} · ${esc(g.name)}</em></div>
        <div class="stg"><small>${st}단계</small><b>${STAGES[st].name}</b></div></div>
      ${g.help ? '<div class="notice help">🙋 선생님을 불렀어요. 조금만 기다려요.</div>' : ''}
      ${lineBubbles(st)}
      ${todoHtml(st)}
      ${stageBody(st)}
      ${tools}
      ${st >= 2 ? beadsCard() : ''}
    </main>
    <footer class="bar">
      <button data-act="modal" data-m="mediate"><span>💬</span>조율의 말</button>
      <button data-act="pause" class="pausebtn"><span>✋</span>잠깐 멈춤</button>
      <button data-act="modal" data-m="record"><span>📒</span>기록 보기</button>
      <button data-act="modal" data-m="note"><span>📝</span>내 쪽지</button>
    </footer>
    ${modalHtml()}${pauseHtml()}${coverHtml()}
  </div>`;
}

// ── 타이머(화면만 고침, 저장은 하지 않음) ──
function stageLeft(now) {
  const g = S.group; const ses = S.session;
  if (ses.gtimer) return [tleft(ses.gtimer, now), ses.gtimer.dur];
  const dur = (ses.stageTimes[g.stage] || 1) * 60 + (g.extra || 0);
  return [dur - (now - (g.stageStart || now)) / 1000, dur];
}
function tick() {
  const g = S.group; const ses = S.session;
  if (!g || !ses || !$('.talk')) return;
  const now = nowEff();
  const t = g.timer; const left = t ? tleft(t, now) : ses.speakSec; const dur = t ? t.dur : ses.speakSec;
  $$('[data-tm=speak]').forEach((el) => { el.textContent = fmt(left); el.parentNode.classList.toggle('warn', !!t && t.running && left <= 10); });
  $$('[data-tm=ring]').forEach((el) => { const c = 2 * Math.PI * 52; el.style.strokeDasharray = c; el.style.strokeDashoffset = c * (1 - Math.max(0, Math.min(1, left / dur))); });
  const over = t && t.running && left <= 0;
  if (over && !S.beeped) { S.beeped = true; if (ses.sound !== false && !RO && (has('keeper') || g.speaker === S.sid)) beep(3); }
  if (!over) S.beeped = false;
  const [sl, sd] = stageLeft(now);
  $$('[data-tm=stagefill]').forEach((el) => { el.style.width = Math.max(0, Math.min(100, (sl / sd) * 100)) + '%'; el.classList.toggle('low', sl <= 30); });
  $$('[data-tm=stagetext]').forEach((el) => { el.textContent = sl > 0 ? fmt(sl) : '시간 끝'; });
  $$('[data-tm=stageup]').forEach((el) => { el.hidden = sl > 0; });
  if (g.pause) {
    const pl = 10 - (store.now() - g.pause.at) / 1000;
    $$('[data-tm=pause]').forEach((el) => { el.textContent = Math.max(0, Math.ceil(pl)); });
    if (pl <= 0 && !S.pauseOpen) { S.pauseOpen = true; render(); }
  } else if (S.pauseOpen) S.pauseOpen = false;
}
setInterval(tick, 250);

// ── 시작 ──
(async () => {
  render();
  await initStore();
  if (!RO) await store.anon();
  store.watch(C, (v) => { S.cls = v || {}; upd(); });
  store.watch(`${C}/roster/main`, (v) => { S.roster = (v && v.students) || []; render(); });
  store.watch(`${C}/settings/main`, (v) => { S.settings = settingsOf(v); render(); });
  S.sid = WATCH || (await store.restoreStudent());
  S.ready = true;
  if (RO) document.body.classList.add('ro');
  upd();
})().catch((e) => { console.error(e); app.innerHTML = `<div class="center"><h2>연결하지 못했어요</h2><p>인터넷을 확인하고 새로고침해 주세요.</p><small>${esc(e.message || e)}</small></div>`; });
