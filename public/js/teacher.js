// 교사 화면
import { initStore, store, C, DEMO, ts, inc, rm } from './store.js';
import {
  ROLES, ROLE_KEYS, STAGES, assignRoles, methodName, settingsOf, DEFAULTS, RATING, REFLECT_A,
  esc, $, $$, fmt, r1, avg1, today, hashPin, tleft, paint, miniMap, beadsHtml, rolesLabel, noteText, opinionOf,
  downloadCsv, beep, toast,
} from './common.js';

const app = $('#app');
const T = {
  ready: false, login: 'wait', cls: null, roster: [], settings: settingsOf(null), rawSettings: null,
  sessions: [], ses: null, groups: [], students: {}, tab: 'ctrl', sel: null,
  det: { record: null, notes: [], pauses: [] }, ratings: {}, adj: {}, absent: {}, rot: {},
  hist: null, histLoading: false, viewer: null, who: null, busy: false,
};
const D = {};
const val = (k, d) => (k in D ? D[k] : d ?? '');
const nm = (sid) => (T.roster.find((s) => s.id === sid) || {}).name || sid;
const sesId = () => (T.cls && T.cls.activeSession) || null;
const sp = () => `${C}/sessions/${sesId()}`;
const gpath = (gid) => `${sp()}/groups/${gid}`;
const live = () => T.ses && T.ses.status === 'open';
const byNum = (a, b) => (a.num || 0) - (b.num || 0);
const sortG = (a) => a.sort((x, y) => x.id.localeCompare(y.id, 'ko', { numeric: true }));

const subs = {};
function sub(key, id, start) {
  const cur = subs[key];
  if ((cur ? cur.id : null) === (id || null)) return;
  if (cur) cur.un();
  if (id) subs[key] = { id, un: start() }; else delete subs[key];
}
let helpSeen = new Set();
function wire() {
  const id = sesId();
  sub('ses', id, () => store.watch(`${C}/sessions/${id}`, (v) => { T.ses = v; upd(); }));
  sub('groups', id, () => store.watchCol(`${C}/sessions/${id}/groups`, (a) => {
    T.groups = sortG(a);
    const now = new Set(a.filter((g) => g.help).map((g) => g.id));
    for (const g of now) if (!helpSeen.has(g)) beep(3, 660);
    helpSeen = now;
    upd();
  }));
  if (!id) { T.ses = null; T.groups = []; }
  const sel = id && T.sel && T.tab === 'ctrl' ? `${id}/${T.sel}` : null;
  sub('drec', sel, () => store.watch(`${gpath(T.sel)}/record/main`, (v) => { T.det.record = v; render(); }));
  sub('dnotes', sel, () => store.watchCol(`${gpath(T.sel)}/notes`, (a) => { T.det.notes = a; render(); }));
  sub('dpause', sel, () => store.watchCol(`${gpath(T.sel)}/pauseLogs`, (a) => { T.det.pauses = a; render(); }));
  const stars = id && T.tab === 'stars';
  for (const g of T.groups) sub('rt-' + g.id, stars ? `${id}/${g.id}` : null, () => store.watchCol(`${gpath(g.id)}/ratings`, (a) => { T.ratings[g.id] = a; render(); }));
  for (const k of Object.keys(subs)) if (k.startsWith('rt-') && !T.groups.find((g) => 'rt-' + g.id === k)) { subs[k].un(); delete subs[k]; }
}
function upd() { wire(); render(); }
let raf = 0;
function render() { if (!raf) raf = setTimeout(() => { raf = 0; paint(app, view()); tick(); }); }

app.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k !== undefined) D[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
app.addEventListener('change', (e) => { const el = e.target.closest('[data-ch]'); if (el && A[el.dataset.ch]) run(A[el.dataset.ch], { ...el.dataset, value: el.value }); });
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.tagName === 'SELECT') return;
  if (A[el.dataset.act]) run(A[el.dataset.act], el.dataset);
});
function run(f, d) { Promise.resolve().then(() => f(d)).catch((err) => { console.error(err); toast('실패했습니다: ' + (err.code || err.message || err)); }); }

// ── 계산 ──
function calc(g, ratings, adj) {
  const subm = (ratings || []).filter((r) => r.submitted && g.members[r.id]);
  const auto = avg1(subm.map((r) => r.together).filter(Boolean));
  const tg = adj || auto;
  const out = { together: tg, auto, by: {} };
  for (const sid of g.order) {
    const got = (k) => avg1(subm.filter((r) => r.id !== sid && r.peers && r.peers[sid] && r.peers[sid][k]).map((r) => r.peers[sid][k]));
    const listen = got('listen'); const mediate = got('mediate');
    out.by[sid] = { listen, mediate, together: tg, total: r1((listen || 0) + (mediate || 0) + (tg || 0)) };
  }
  return out;
}
function commonStage() {
  const c = {}; let best = 0;
  T.groups.forEach((g) => { c[g.stage] = (c[g.stage] || 0) + 1; if (c[g.stage] > (c[best] || 0)) best = g.stage; });
  return best;
}
function draftGroups() {
  const by = {};
  [...T.roster].sort(byNum).forEach((s) => { if (!T.absent[s.id]) (by[s.group] = by[s.group] || []).push(s.id); });
  const round = T.settings.roleRound || 0;
  return Object.keys(by).sort((a, b) => a - b).map((gk) => ({ gk, order: by[gk], members: assignRoles(by[gk], round + (T.rot[gk] || 0)) }));
}
async function loadHist(force) {
  if ((T.hist && !force) || T.histLoading) return;
  T.histLoading = true; render();
  const out = [];
  const sessions = (await store.getCol(`${C}/sessions`)).sort((a, b) => (a.date || 0) - (b.date || 0));
  for (const s of sessions) {
    const groups = sortG(await store.getCol(`${C}/sessions/${s.id}/groups`));
    const gs = await Promise.all(groups.map(async (g) => {
      const p = `${C}/sessions/${s.id}/groups/${g.id}`;
      const [ratings, stickers, notes, recs, refl, pauses] = await Promise.all(['ratings', 'stickers', 'notes', 'record', 'reflections', 'pauseLogs'].map((c) => store.getCol(`${p}/${c}`)));
      const nmap = {}; notes.forEach((n) => { nmap[n.id] = n; });
      return { g, ratings, stickers, notes: nmap, record: recs.find((r) => r.id === 'main') || {}, refl, pauses };
    }));
    out.push({ s, gs });
  }
  T.hist = out; T.histLoading = false; render();
}
// 반복 표시: 늘 같은 별 / 특정 친구에게만 계속 낮은 별
function flags() {
  if (!T.hist) return [];
  const same = {}; const low = {};
  for (const { gs } of T.hist) for (const { ratings } of gs) for (const r of ratings) {
    if (!r.submitted) continue;
    const peers = Object.entries(r.peers || {});
    if (!peers.length) continue;
    const vals = peers.flatMap(([, p]) => [p.listen, p.mediate]);
    (same[r.id] = same[r.id] || []).push(vals.every((v) => v === vals[0]));
    if (peers.length > 1) {
      const sums = peers.map(([sid, p]) => [sid, (p.listen || 0) + (p.mediate || 0)]).sort((a, b) => a[1] - b[1]);
      if (sums[0][1] < sums[1][1] && sums[0][1] <= 3) { const k = r.id + '>' + sums[0][0]; low[k] = (low[k] || 0) + 1; }
    }
  }
  const out = [];
  for (const sid in same) { const a = same[sid].slice(-3); if (a.length >= 3 && a.every(Boolean)) out.push(`${nm(sid)}: 최근 3번 모두에게 같은 별을 줌`); }
  for (const k in low) if (low[k] >= 2) { const [a, b] = k.split('>'); out.push(`${nm(a)} → ${nm(b)}: ${low[k]}번 계속 가장 낮은 별`); }
  return out;
}

// ── 동작 ──
const allGroups = (fn) => T.groups.map((g) => ({ op: 'update', path: gpath(g.id), data: fn(g) })).filter((o) => o.data && Object.keys(o.data).length);
const stageData = (n) => { const d = { stage: n, stageStart: ts(), speaker: null, timer: null, extra: 0 }; if (n === 6) d.agree = {}; return d; };
const shift = (g, dt) => { const d = { stageStart: (g.stageStart || 0) + dt }; if (g.timer && g.timer.running) d['timer.startAt'] = g.timer.startAt + dt; return d; };
const A = {
  async glogin() { T.login = 'wait'; render(); try { await store.google(); await checkTeacher(); } catch (e) { T.login = 'out'; T.loginErr = e.code || e.message; render(); } },
  async glogout() { await store.out(); location.reload(); },
  tab(d) { T.tab = d.t; if (d.t === 'hist' || d.t === 'stars') loadHist(); if (d.t === 'set') for (const k in D) if (k.startsWith('s.')) delete D[k]; upd(); },
  sel(d) { T.sel = T.sel === d.g ? null : d.g; T.det = { record: null, notes: [], pauses: [] }; upd(); },
  view(d) { T.viewer = d.sid; render(); },
  viewClose() { T.viewer = null; render(); },

  // 조종판
  async freeze() {
    if (!T.ses.freeze) return store.update(sp(), { freeze: { at: ts() } });
    const dt = store.now() - T.ses.freeze.at; const gt = T.ses.gtimer;
    const d = { freeze: null }; if (gt && gt.running) d['gtimer.startAt'] = gt.startAt + dt;
    return store.batch([{ op: 'update', path: sp(), data: d }, ...allGroups((g) => (g.frozen ? null : shift(g, dt)))]);
  },
  mode: (d) => store.update(sp(), { mode: d.m }),
  stageAll: (d) => { const n = Math.max(0, Math.min(7, +d.n)); return store.batch([{ op: 'update', path: sp(), data: { gtimer: null } }, ...allGroups(() => stageData(n))]); },
  gtStart: () => store.update(sp(), { gtimer: { dur: (T.ses.stageTimes[commonStage()] || 1) * 60, running: true, startAt: ts() } }),
  gtPause() {
    const gt = T.ses.gtimer; if (!gt) return null;
    if (gt.running) return store.update(sp(), { gtimer: { dur: gt.dur, running: false, left: Math.max(0, tleft(gt, store.now())) } });
    return store.update(sp(), { gtimer: { dur: gt.dur, running: true, startAt: store.now() - (gt.dur - (gt.left ?? gt.dur)) * 1000 } });
  },
  gtAdd(d) {
    const n = +d.n; const gt = T.ses.gtimer;
    if (gt) { const x = { 'gtimer.dur': inc(n) }; if (!gt.running) x['gtimer.left'] = inc(n); return store.update(sp(), x); }
    return store.batch(allGroups(() => ({ extra: inc(n) })));
  },
  gtOff: () => store.update(sp(), { gtimer: null }),
  speak: (d) => store.update(sp(), { speakSec: Math.max(30, Math.min(180, (T.ses.speakSec || 60) + +d.n)) }),
  sound: () => store.update(sp(), { sound: T.ses.sound === false }),
  notice() { const t = (D['c.notice'] || '').trim(); if (!t) return null; delete D['c.notice']; return store.update(sp(), { notice: { text: t, at: ts() } }); },
  noticeOff: () => store.update(sp(), { notice: null }),
  async closeRoom() { if (confirm('토의방을 닫을까요? 학생 화면이 처음 화면으로 돌아갑니다.\n(별 평가 확정은 닫은 뒤에도 할 수 있습니다)')) await store.update(sp(), { status: 'closed', freeze: null, notice: null }); },
  reopen: () => store.update(sp(), { status: 'open' }),

  // 모둠 하나
  gstage: (d) => store.update(gpath(d.g), stageData(+d.value)),
  gfreeze(d) {
    const g = T.groups.find((x) => x.id === d.g);
    if (!g.frozen) return store.update(gpath(g.id), { frozen: { at: ts() } });
    return store.update(gpath(g.id), { frozen: null, ...shift(g, store.now() - g.frozen.at) });
  },
  helpOk: (d) => store.update(gpath(d.g), { help: null }),
  pauseOff: (d) => store.update(gpath(d.g), { pause: null }),
  grot(d) {
    const g = T.groups.find((x) => x.id === d.g);
    const cur = [...g.order].sort((a, b) => ROLE_KEYS.indexOf((g.members[a] || [])[0]) - ROLE_KEYS.indexOf((g.members[b] || [])[0]));
    return store.update(gpath(g.id), { members: assignRoles([...cur.slice(1), cur[0]], 0) });
  },
  gremove(d) {
    const g = T.groups.find((x) => x.id === d.g);
    if (!confirm(`${nm(d.sid)} 학생을 이 모둠에서 뺄까요? 남은 친구들의 역할을 다시 나눕니다.`)) return null;
    const order = g.order.filter((s) => s !== d.sid);
    const leaderFirst = order.sort((a, b) => ROLE_KEYS.indexOf((g.members[a] || [])[0]) - ROLE_KEYS.indexOf((g.members[b] || [])[0]));
    const data = { order: g.order.filter((s) => s !== d.sid), members: assignRoles(leaderFirst, 0) };
    if (g.speaker === d.sid) { data.speaker = null; data.timer = null; }
    return store.batch([{ op: 'update', path: gpath(g.id), data }, { op: 'update', path: sp(), data: { [`assign.${d.sid}`]: rm() } }]);
  },
  gadd(d) {
    if (!d.value) return null;
    const g = T.groups.find((x) => x.id === d.g);
    if (g.order.length >= 4) { toast('한 모둠은 4명까지입니다.'); return null; }
    const cur = [...g.order].sort((a, b) => ROLE_KEYS.indexOf((g.members[a] || [])[0]) - ROLE_KEYS.indexOf((g.members[b] || [])[0]));
    return store.batch([{ op: 'update', path: gpath(g.id), data: { order: [...g.order, d.value], members: assignRoles([...cur, d.value], 0) } },
      { op: 'update', path: sp(), data: { [`assign.${d.value}`]: g.id } }]);
  },

  // 토의방 열기
  absent(d) { if (T.absent[d.sid]) delete T.absent[d.sid]; else T.absent[d.sid] = true; render(); },
  rot(d) { T.rot[d.gk] = (T.rot[d.gk] || 0) + 1; render(); },
  async open() {
    const topic = (D['n.topic'] || '').trim();
    if (!topic) return toast('주제를 입력해 주세요.');
    const groups = draftGroups();
    if (!groups.length) return toast('먼저 학급 관리에서 학생을 등록해 주세요.');
    if (live() && !confirm('지금 열려 있는 토의방을 닫고 새로 엽니다. 계속할까요?')) return null;
    const id = `${today()}-${Math.random().toString(36).slice(2, 6)}`;
    const p = `${C}/sessions/${id}`;
    const assign = {}; const ops = [];
    if (T.ses && sesId()) ops.push({ op: 'update', path: sp(), data: { status: 'closed', freeze: null } });
    groups.forEach(({ gk, order, members }) => {
      order.forEach((s) => { assign[s] = 'g' + gk; });
      ops.push({ op: 'set', path: `${p}/groups/g${gk}`, data: { name: `${gk}모둠`, stage: 0, stageStart: ts(), speaker: null, timer: null, extra: 0, pause: null, help: null, frozen: null, method: null, members, order, beads: {}, spoken: {}, agree: {}, noteDone: {}, rated: {}, reflected: {}, pauseCount: 0, ratingConfirmed: false } });
    });
    ops.unshift({ op: 'set', path: p, data: { topic, date: ts(), dateStr: today(), stageTimes: STAGES.map((s, i) => Math.max(0.5, +val('n.t' + i, s.min) || s.min)), speakSec: Math.max(30, Math.min(180, +val('n.speak', 60) || 60)), mode: val('n.mode', 'together'), status: 'open', sound: true, freeze: null, notice: null, gtimer: null, assign } });
    ops.push({ op: 'set', path: C, data: { activeSession: id }, merge: true });
    ops.push({ op: 'set', path: `${C}/settings/main`, data: { roleRound: inc(1) }, merge: true });
    await store.batch(ops);
    delete D['n.topic']; T.rot = {}; T.absent = {}; T.sel = null; T.tab = 'ctrl'; T.hist = null;
    toast('토의방을 열었습니다.'); upd();
    return null;
  },

  // 별 확정
  adj(d) { T.adj[d.g] = +d.value || 0; render(); },
  async confirm(d) { await confirmGroups([d.g], d.force === '1'); },
  async confirmAll() { await confirmGroups(T.groups.filter((g) => !g.ratingConfirmed && g.order.every((s) => (g.rated || {})[s])).map((g) => g.id), false); },
  async bonus() {
    const sid = D['b.sid']; const n = Math.max(1, Math.min(3, +val('b.n', 1) || 1));
    if (!sid) return toast('학생을 골라 주세요.');
    await store.batch([
      { op: 'set', path: `${C}/students/${sid}`, data: { total: inc(n), bonus: inc(n) }, merge: true },
      { op: 'set', path: `${C}/students/${sid}/pointLogs/b${Date.now()}`, data: { type: 'bonus', total: n, bonus: n, topic: (D['b.memo'] || '').trim() || '선생님 보너스 별', dateStr: today(), at: ts() } },
    ]);
    delete D['b.memo']; toast(`${nm(sid)}에게 보너스 별 ${n}점`); render();
    return null;
  },

  // 학급 관리
  async saveClass() {
    const lines = (D['k.paste'] || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return toast('붙여 넣은 내용이 없습니다.');
    const roster = [...T.roster]; const ops = []; let bad = 0;
    for (const l of lines) {
      let [num, name, pin, group] = l.split(/[\t,]+|\s{1,}/).map((x) => x.trim());
      if (pin && !group && !/^\d{4}$/.test(pin)) { group = pin; pin = ''; } // 핀 없이 "번호 이름 모둠"만 적은 줄
      if (!/^\d+$/.test(num || '') || !name) { bad++; continue; }
      const id = 's' + String(+num).padStart(2, '0');
      const cur = roster.find((s) => s.id === id);
      const g = Math.max(1, +group || (cur && cur.group) || 1);
      if (cur) Object.assign(cur, { name, group: g }); else roster.push({ id, num: +num, name, group: g });
      if (pin && /^\d{4}$/.test(pin)) ops.push({ op: 'set', path: `${C}/pins/${id}`, data: { hash: await hashPin(pin, id) } });
      ops.push({ op: 'set', path: `${C}/students/${id}`, data: { num: +num }, merge: true });
    }
    ops.push({ op: 'set', path: `${C}/roster/main`, data: { students: roster.sort(byNum) } });
    await store.batch(ops);
    delete D['k.paste'];
    toast(`저장했습니다.${bad ? ` (읽지 못한 줄 ${bad}개)` : ''}`); render();
    return null;
  },
  sgroup(d) { const r = T.roster.map((s) => (s.id === d.sid ? { ...s, group: +d.value } : s)); return store.set(`${C}/roster/main`, { students: r }); },
  async spin(d) {
    const pin = prompt(`${nm(d.sid)} 학생의 새 핀 번호 4자리`);
    if (pin === null) return;
    if (!/^\d{4}$/.test(pin)) { toast('숫자 4자리로 입력해 주세요.'); return; }
    await store.set(`${C}/pins/${d.sid}`, { hash: await hashPin(pin, d.sid) }); toast('핀을 바꿨습니다.');
  },
  async sdel(d) {
    if (!confirm(`${nm(d.sid)} 학생을 명렬에서 지울까요? (점수 기록은 남습니다)`)) return;
    await store.batch([{ op: 'set', path: `${C}/roster/main`, data: { students: T.roster.filter((s) => s.id !== d.sid) } }, { op: 'del', path: `${C}/pins/${d.sid}` }]);
  },
  async wipe() {
    if (prompt('학급의 모든 데이터(명렬, 토의 기록, 점수)를 지웁니다.\n먼저 누적 보기에서 CSV로 내보내 두세요.\n지우려면 "초기화"라고 입력하세요.') !== '초기화') return;
    T.busy = true; render();
    await loadHist(true);
    const ops = [];
    for (const { s, gs } of T.hist) {
      for (const { g } of gs) {
        const p = `${C}/sessions/${s.id}/groups/${g.id}`;
        for (const c of ['ratings', 'stickers', 'notes', 'record', 'reflections', 'pauseLogs']) (await store.getCol(`${p}/${c}`)).forEach((x) => ops.push({ op: 'del', path: `${p}/${c}/${x.id}` }));
        ops.push({ op: 'del', path: p });
      }
      ops.push({ op: 'del', path: `${C}/sessions/${s.id}` });
    }
    for (const st of await store.getCol(`${C}/students`)) {
      for (const c of ['pointLogs', 'spendLogs']) (await store.getCol(`${C}/students/${st.id}/${c}`)).forEach((x) => ops.push({ op: 'del', path: `${C}/students/${st.id}/${c}/${x.id}` }));
      ops.push({ op: 'del', path: `${C}/students/${st.id}` });
    }
    for (const c of ['pins', 'members']) (await store.getCol(`${C}/${c}`)).forEach((x) => ops.push({ op: 'del', path: `${C}/${c}/${x.id}` }));
    ops.push({ op: 'set', path: `${C}/roster/main`, data: { students: [] } });
    ops.push({ op: 'set', path: C, data: { activeSession: null }, merge: true });
    await store.batch(ops);
    T.hist = null; T.busy = false; toast('학급을 초기화했습니다.'); upd();
  },

  // 누적·내보내기
  histReload: () => loadHist(true),
  // 토의 한 번의 기록을 통째로 지운다 (연습으로 해 본 토의 정리용). 그 토의로 적립된 점수도 되돌린다.
  async delSession(d) {
    const h = (T.hist || []).find((x) => x.s.id === d.id);
    if (!h) return;
    if (!confirm(`${h.s.dateStr} "${h.s.topic}" 토의 기록을 지울까요?\n\n쪽지·기록·스티커·별 평가와, 이 토의로 적립된 점수가 함께 지워집니다.\n되돌릴 수 없습니다.`)) return;
    T.busy = true; render();
    try {
      const p = `${C}/sessions/${d.id}`; const ops = [];
      for (const { g } of h.gs) {
        const gp = `${p}/groups/${g.id}`;
        for (const c of ['ratings', 'stickers', 'notes', 'record', 'reflections', 'pauseLogs']) (await store.getCol(`${gp}/${c}`)).forEach((x) => ops.push({ op: 'del', path: `${gp}/${c}/${x.id}` }));
        for (const sid of g.order || []) {
          const lp = `${C}/students/${sid}/pointLogs/${d.id}`;
          const log = await store.get(lp);
          if (!log) continue;
          ops.push({ op: 'set', path: `${C}/students/${sid}`, merge: true, data: { total: inc(-(log.total || 0)), listen: inc(-(log.listen || 0)), mediate: inc(-(log.mediate || 0)), together: inc(-(log.together || 0)), count: inc(-1) } });
          ops.push({ op: 'del', path: lp });
        }
        ops.push({ op: 'del', path: gp });
      }
      ops.push({ op: 'del', path: p });
      if (sesId() === d.id) ops.push({ op: 'set', path: C, data: { activeSession: null }, merge: true });
      await store.batch(ops);
      T.hist = null; T.who = null;
      toast('토의 기록을 지웠습니다.');
    } finally { T.busy = false; }
    await loadHist(true); upd();
  },
  who(d) { T.who = T.who === d.sid ? null : d.sid; render(); },
  csvRecords() {
    const rows = [['날짜', '주제', '모둠', '구성원(역할)', '나온 의견', '같은 점', '다른 점', '결정', '조율 방법', '까닭', '동의', '잠깐 멈춤 횟수']];
    for (const { s, gs } of T.hist) for (const { g, record, notes } of gs) {
      rows.push([s.dateStr, s.topic, g.name, g.order.map((x) => `${nm(x)}(${(g.members[x] || []).map((r) => ROLES[r].name).join('+')})`).join(' / '),
        g.order.map((x) => `${nm(x)}: ${opinionOf(x, record, notes)}`).join(' / '), record.same, record.diff, record.decision, methodName(g.method), record.why,
        `${g.order.filter((x) => (g.agree || {})[x]).length}/${g.order.length}`, g.pauseCount || 0]);
    }
    downloadCsv(`토의기록_${today()}.csv`, rows);
  },
  csvScores() {
    const rows = [['날짜', '주제', '번호', '이름', '모둠', '역할', '듣기', '조율', '함께', '합계', '확정', '발언 구슬', '받은 스티커', '돌아보기1', '돌아보기2', '돌아보기3', '소감', '내 생각 쪽지']];
    for (const { s, gs } of T.hist) for (const { g, ratings, stickers, notes, refl } of gs) {
      const c = calc(g, ratings, g.togetherFinal);
      for (const x of g.order) {
        const st = T.roster.find((r) => r.id === x) || {}; const rf = refl.find((r) => r.id === x) || {}; const a = rf.a || [];
        rows.push([s.dateStr, s.topic, st.num, nm(x), g.name, (g.members[x] || []).map((r) => ROLES[r].name).join('+'), c.by[x].listen, c.by[x].mediate, c.by[x].together, c.by[x].total, g.ratingConfirmed ? 'O' : 'X',
          (g.beads || {})[x] || 0, stickers.filter((k) => k.to === x).map((k) => k.name).join(' / '), ...[0, 1, 2].map((i) => (a[i] == null ? '' : REFLECT_A[a[i]])), rf.text, noteText(notes[x])]);
      }
    }
    rows.push([]); rows.push(['누적', '', '번호', '이름', '', '', '듣기', '조율', '함께', '총점', '보너스']);
    [...T.roster].sort(byNum).forEach((s) => { const m = T.students[s.id] || {}; rows.push(['', '', s.num, s.name, '', '', r1(m.listen), r1(m.mediate), r1(m.together), r1(m.total), r1(m.bonus)]); });
    downloadCsv(`토의점수_${today()}.csv`, rows);
  },

  // 설정
  async saveSet() {
    const s = T.settings;
    const lines = s.lines.map((row, i) => { const o = {}; ROLE_KEYS.forEach((r) => { o[r] = val(`s.l.${i}.${r}`, row[r]).trim(); }); return o; });
    const list = (k, cur) => val(k, cur.join('\n')).split('\n').map((x) => x.trim()).filter(Boolean);
    const stickers = val('s.stickers', s.stickers.map((x) => `${x.icon} | ${x.name} | ${x.desc || ''}`).join('\n')).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((a) => a[0] && a[1]).map(([icon, name, desc]) => ({ icon, name, desc: desc || '' }));
    await store.set(`${C}/settings/main`, {
      lines, mediations: list('s.mediations', s.mediations), promises: list('s.promises', s.promises), stickers,
      rating: { listen: val('s.r.listen', s.rating.listen), mediate: val('s.r.mediate', s.rating.mediate), together: val('s.r.together', s.rating.together) },
      revealMode: val('s.reveal', s.revealMode),
    }, true);
    for (const k in D) if (k.startsWith('s.')) delete D[k];
    toast('설정을 저장했습니다.');
  },
  async resetSet() {
    if (!confirm('멘트·스티커·약속 문구를 처음 값으로 되돌릴까요?')) return;
    const { roleRound, ...rest } = DEFAULTS; void roleRound;
    await store.set(`${C}/settings/main`, rest, true);
    for (const k in D) if (k.startsWith('s.')) delete D[k];
    toast('처음 값으로 되돌렸습니다.');
  },
};

async function confirmGroups(ids, force) {
  const ops = []; let n = 0;
  for (const gid of ids) {
    const g = T.groups.find((x) => x.id === gid);
    if (!g || g.ratingConfirmed) continue;
    const all = g.order.every((s) => (g.rated || {})[s]);
    if (!all && !force) continue;
    const c = calc(g, T.ratings[gid], T.adj[gid]);
    for (const sid of g.order) {
      const r = c.by[sid];
      ops.push({ op: 'set', path: `${C}/students/${sid}/pointLogs/${sesId()}`, data: { type: 'session', sessionId: sesId(), topic: T.ses.topic, dateStr: T.ses.dateStr, group: g.name, listen: r.listen || 0, mediate: r.mediate || 0, together: r.together || 0, total: r.total, at: ts() } });
      ops.push({ op: 'set', path: `${C}/students/${sid}`, data: { total: inc(r.total), listen: inc(r.listen || 0), mediate: inc(r.mediate || 0), together: inc(r.together || 0), count: inc(1) }, merge: true });
    }
    ops.push({ op: 'update', path: gpath(gid), data: { ratingConfirmed: true, togetherFinal: c.together || 0 } });
    n++;
  }
  if (!n) return toast('확정할 모둠이 없습니다.');
  await store.batch(ops);
  T.hist = null;
  return toast(`${n}개 모둠의 별을 확정했습니다.`);
}

// ── 화면 ──
const TABS = [['ctrl', '🎛 조종판'], ['new', '➕ 토의방 열기'], ['stars', '⭐ 별 확정'], ['class', '👥 학급 관리'], ['hist', '📊 누적 보기'], ['set', '⚙️ 설정']];
function view() {
  if (!T.ready || T.login === 'wait') return '<div class="center"><div class="spin"></div><p>불러오는 중…</p></div>';
  if (T.login !== 'ok') {
    return `<div class="center"><h1>🗣️ 토의도우미 · 선생님</h1>
      ${T.login === 'denied' ? '<p class="err">이 구글 계정은 교사로 등록되어 있지 않습니다.<br>firestore.rules 파일의 교사 계정 주소를 확인해 주세요.</p>' : '<p>교사용 구글 계정으로 로그인해 주세요.</p>'}
      ${T.loginErr ? `<p class="muted">${esc(T.loginErr)}</p>` : ''}
      <button class="btn primary" data-act="glogin">구글 계정으로 로그인</button>${T.login === 'denied' ? '<button class="btn" data-act="glogout">다른 계정으로</button>' : ''}</div>`;
  }
  const body = { ctrl: ctrlTab, new: newTab, stars: starsTab, class: classTab, hist: histTab, set: setTab }[T.tab]();
  return `<div class="thead"><h1>🗣️ 토의도우미</h1><nav class="tabs">${TABS.map(([k, t]) => `<button class="${T.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${t}</button>`).join('')}</nav>
      <span style="margin-left:auto"></span>${DEMO ? '<span class="tag yellow">체험판</span>' : ''}<a class="btn" href="board.html${DEMO ? '?demo' : ''}" target="_blank">🖥 칠판 보기</a>${DEMO ? '' : '<button class="btn" data-act="glogout">로그아웃</button>'}</div>
    <div class="tmain">${T.busy ? '<div class="card">처리 중입니다…</div>' : body}</div>${viewerHtml()}`;
}
function viewerHtml() {
  if (!T.viewer) return '';
  return `<div class="viewer"><button class="btn" data-act="viewClose">✕ ${esc(nm(T.viewer))} 화면 닫기</button><iframe src="index.html?watch=${T.viewer}${DEMO ? '&demo' : ''}"></iframe></div>`;
}

function ctrlTab() {
  const s = T.ses;
  if (!s) return '<div class="card"><h2>열린 토의방이 없습니다</h2><p>‘토의방 열기’에서 오늘의 주제를 넣고 시작하세요.</p></div>';
  if (s.status !== 'open') return `<div class="card"><h2>토의방이 닫혀 있습니다</h2><p>마지막 토의: ${esc(s.dateStr)} · ${esc(s.topic)}</p><div class="ctrl"><button class="btn" data-act="reopen">다시 열기</button><button class="btn primary" data-act="tab" data-t="new">새 토의방 열기</button></div></div>${boardTable()}`;
  const cs = commonStage(); const gt = s.gtimer;
  return `<div class="card">
      <div class="ctrl"><button class="btn freezebtn ${s.freeze ? 'on' : ''}" data-act="freeze">${s.freeze ? '▶ 멈춤 풀기' : '✋ 모두 멈춤 (주목)'}</button>
        <div><b>${esc(s.topic)}</b><br><span class="muted">${esc(s.dateStr)} · 학생 ${Object.keys(s.assign || {}).length}명 · ${T.groups.length}모둠</span></div></div>
      <div class="ctrl"><b>진행 방식</b><button class="btn ${s.mode === 'together' ? 'on' : ''}" data-act="mode" data-m="together">함께 진행 (교사가 넘김)</button><button class="btn ${s.mode === 'group' ? 'on' : ''}" data-act="mode" data-m="group">모둠별 진행 (이끔이가 넘김)</button></div>
      <div class="ctrl"><b>전체 단계</b><button class="btn" data-act="stageAll" data-n="${cs - 1}" ${cs <= 0 ? 'disabled' : ''}>◀ 이전</button>
        ${STAGES.map((st, i) => `<button class="btn ${i === cs ? 'on' : ''}" data-act="stageAll" data-n="${i}" title="${st.name}">${i}</button>`).join('')}
        <button class="btn primary" data-act="stageAll" data-n="${cs + 1}" ${cs >= 7 ? 'disabled' : ''}>다음 ▶ ${cs < 7 ? STAGES[cs + 1].name : ''}</button></div>
      <div class="ctrl"><b>전체 타이머</b><span class="tag blue" data-tm="gt">${gt ? '' : '모둠별 시간 사용 중'}</span>
        <button class="btn" data-act="gtStart">▶ 같이 시작</button><button class="btn" data-act="gtPause" ${gt ? '' : 'disabled'}>${gt && !gt.running ? '▶ 이어서' : '⏸ 멈춤'}</button>
        <button class="btn" data-act="gtAdd" data-n="30">+30초</button><button class="btn" data-act="gtAdd" data-n="60">+1분</button><button class="btn" data-act="gtOff" ${gt ? '' : 'disabled'}>끄기</button></div>
      <div class="ctrl"><b>발언 시간</b><button class="btn" data-act="speak" data-n="-10">−10초</button><span class="tag">${fmt(s.speakSec)}</span><button class="btn" data-act="speak" data-n="10">+10초</button>
        <button class="btn" data-act="sound">${s.sound === false ? '🔇 소리 꺼짐' : '🔔 소리 켜짐'}</button></div>
      <div class="ctrl"><b>전체 알림</b><input type="text" data-k="c.notice" maxlength="40" placeholder="예: 2분 뒤에 발표해요" value="${esc(val('c.notice'))}"><button class="btn primary" data-act="notice">보내기</button>
        ${s.notice ? `<span class="tag yellow">📢 ${esc(s.notice.text)}</span><button class="btn" data-act="noticeOff">지우기</button>` : ''}</div>
      <div class="ctrl"><b>토의 마치기</b><button class="btn" data-act="stageAll" data-n="7">모두 7단계(칭찬과 돌아보기)로</button><button class="btn danger" data-act="closeRoom">토의방 닫기</button></div>
    </div>${boardTable()}${T.sel ? detail() : '<p class="muted">모둠 줄을 누르면 기록과 모둠별 제어가 열립니다.</p>'}`;
}
function boardTable() {
  if (!T.groups.length) return '';
  const cnt = (g, k) => `${g.order.filter((s) => (g[k] || {})[s]).length}/${g.order.length}`;
  return `<div class="card"><h2>진행 현황판</h2><table><tr><th>모둠</th><th>단계</th><th>쪽지</th><th>발언 구슬</th><th>동의</th><th>멈춤</th><th>별 제출</th><th>상태</th></tr>
    ${T.groups.map((g) => `<tr class="click ${T.sel === g.id ? 'sel' : ''} ${g.help ? 'alert' : ''}" data-act="sel" data-g="${g.id}">
      <td><b>${esc(g.name)}</b></td><td>${miniMap(g.stage)} <span class="muted">${STAGES[g.stage].name}</span></td><td>${cnt(g, 'noteDone')}</td>
      <td><div class="beadrows">${beadsHtml(g, nm)}</div></td><td>${cnt(g, 'agree')}</td><td>${g.pauseCount || 0}</td><td>${cnt(g, 'rated')}${g.ratingConfirmed ? ' ✔' : ''}</td>
      <td>${g.help ? '<span class="tag red">🙋 도움 요청</span>' : ''}${g.pause ? '<span class="tag blue">✋ 멈춤 중</span>' : ''}${g.frozen ? '<span class="tag">잠금</span>' : ''}</td></tr>`).join('')}</table></div>`;
}
function detail() {
  const g = T.groups.find((x) => x.id === T.sel); if (!g) return '';
  const r = T.det.record || {}; const notes = {}; T.det.notes.forEach((n) => { notes[n.id] = n; });
  const free = T.roster.filter((s) => !(T.ses.assign || {})[s.id]);
  const row = (t, v) => `<p><b>${t}</b> ${v ? esc(v) : '<span class="muted">아직 없음</span>'}</p>`;
  return `<div class="grid2"><div class="card"><h2>${esc(g.name)} 제어</h2>
      <div class="ctrl"><b>단계</b><select data-ch="gstage" data-g="${g.id}" style="width:auto">${STAGES.map((s, i) => `<option value="${i}" ${i === g.stage ? 'selected' : ''}>${i}. ${s.name}</option>`).join('')}</select>
        <button class="btn" data-act="gfreeze" data-g="${g.id}">${g.frozen ? '▶ 이 모둠 풀기' : '✋ 이 모둠만 멈춤'}</button></div>
      <div class="ctrl">${g.help ? `<button class="btn primary" data-act="helpOk" data-g="${g.id}">🙋 도움 요청 확인 완료</button>` : ''}${g.pause ? `<button class="btn" data-act="pauseOff" data-g="${g.id}">잠깐 멈춤 풀어 주기</button>` : ''}</div>
      <h3>구성원과 역할</h3><table>${g.order.map((s) => `<tr><td><b>${esc(nm(s))}</b></td><td>${rolesLabel(g.members[s])}</td><td style="text-align:right"><button class="btn" data-act="view" data-sid="${s}">👀 화면 보기</button> <button class="btn" data-act="gremove" data-g="${g.id}" data-sid="${s}">빼기</button></td></tr>`).join('')}</table>
      <div class="ctrl"><button class="btn" data-act="grot" data-g="${g.id}">↻ 역할 한 칸씩 돌리기</button>
        ${free.length ? `<select data-ch="gadd" data-g="${g.id}" style="width:auto"><option value="">＋ 학생 넣기</option>${free.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}</div>
      <p class="muted">잠깐 멈춤을 누른 학생(교사만 봄): ${T.det.pauses.length ? T.det.pauses.sort((a, b) => a.at - b.at).map((p) => esc(nm(p.by))).join(', ') : '없음'}</p></div>
    <div class="card recview"><h2>${esc(g.name)} 기록 (실시간)</h2>
      <p><b>나온 의견</b></p>${g.order.map((s) => `<p>· ${esc(nm(s))}: ${esc(opinionOf(s, r, notes)) || '<span class="muted">아직 없음</span>'}${notes[s] && !notes[s].public && noteText(notes[s]) ? ' <span class="tag">쪽지(아직 비공개)</span>' : ''}</p>`).join('')}
      ${row('같은 점', r.same)}${row('다른 점', r.diff)}${row('결정', r.decision)}${row('조율 방법', methodName(g.method))}${row('까닭', r.why)}</div></div>`;
}

function newTab() {
  const groups = draftGroups(); const last = T.ses;
  return `<div class="card"><h2>토의방 열기</h2>
      <div class="ctrl"><b>주제</b><input type="text" data-k="n.topic" maxlength="60" placeholder="예: 학급 장기 자랑에서 우리 모둠이 할 것" value="${esc(val('n.topic'))}"></div>
      <div class="ctrl"><b>진행 방식</b><select data-k="n.mode" style="width:auto"><option value="together" ${val('n.mode', 'together') === 'together' ? 'selected' : ''}>함께 진행 (교사가 넘김)</option><option value="group" ${val('n.mode', 'together') === 'group' ? 'selected' : ''}>모둠별 진행 (이끔이가 넘김)</option></select>
        <b>발언 시간(초)</b><input type="number" data-k="n.speak" min="30" max="180" step="10" value="${esc(val('n.speak', (last && last.speakSec) || 60))}"></div>
      <p><b>단계별 권장 시간(분)</b></p><div class="times">${STAGES.map((s, i) => `<label>${i}. ${s.name}<input type="number" data-k="n.t${i}" min="0.5" max="20" step="0.5" value="${esc(val('n.t' + i, (last && last.stageTimes && last.stageTimes[i]) || s.min))}"></label>`).join('')}</div>
    </div>
    <div class="card"><h2>모둠과 역할 <span class="muted">역할은 토의마다 자동으로 한 칸씩 돌아갑니다. 결석한 학생은 ‘결석’을 누르세요.</span></h2>
      <div class="gcards">${groups.map(({ gk, order, members }) => `<div class="gcard"><h3>${gk}모둠 <button class="btn" data-act="rot" data-gk="${gk}">↻ 역할 돌리기</button></h3><ul>${order.map((s) => `<li><b>${esc(nm(s))}</b><span>${rolesLabel(members[s])}</span><button class="btn" data-act="absent" data-sid="${s}">결석</button></li>`).join('')}</ul></div>`).join('') || '<p>등록된 학생이 없습니다.</p>'}</div>
      ${Object.keys(T.absent).length ? `<p>결석: ${Object.keys(T.absent).map((s) => `<button class="btn" data-act="absent" data-sid="${s}">${esc(nm(s))} ✕</button>`).join(' ')}</p>` : ''}
      <div class="ctrl"><button class="btn primary" style="min-height:52px;font-size:18px" data-act="open">🚀 토의방 열기</button>${live() ? '<span class="muted">지금 열린 토의방은 닫힙니다.</span>' : ''}</div></div>`;
}

function starsTab() {
  if (!T.ses) return '<div class="card">아직 토의 기록이 없습니다.</div>';
  const fl = flags();
  const cards = T.groups.map((g) => {
    const rs = T.ratings[g.id] || []; const c = calc(g, rs, T.adj[g.id]);
    const done = g.order.filter((s) => (g.rated || {})[s]).length; const all = done === g.order.length;
    const status = g.ratingConfirmed ? '<span class="tag green">확정됨 ✔</span>' : all ? '<span class="tag yellow">확정 대기</span>' : `<span class="tag">제출 ${done}/${g.order.length}</span>`;
    const cell = (rater, to) => { if (rater === to) return '<td class="self">–</td>'; const r = rs.find((x) => x.id === rater); const p = r && r.peers && r.peers[to]; return `<td>${p ? `👂${p.listen || '-'} 🤝${p.mediate || '-'}` : '·'}</td>`; };
    return `<div class="card"><h2>${esc(g.name)} ${status}</h2>
      <table class="matrix"><tr><th>준 사람 ↓ / 받은 사람 →</th>${g.order.map((s) => `<th>${esc(nm(s))}</th>`).join('')}<th>🧩 함께</th></tr>
        ${g.order.map((r) => `<tr><th>${esc(nm(r))}</th>${g.order.map((t) => cell(r, t)).join('')}<td>${(rs.find((x) => x.id === r) || {}).together || '·'}</td></tr>`).join('')}
        <tr><th>점수(평균)</th>${g.order.map((s) => `<td><b>${c.by[s].total}</b><br><span class="muted">👂${c.by[s].listen ?? '-'} 🤝${c.by[s].mediate ?? '-'}</span></td>`).join('')}<td><b>${c.together ?? '-'}</b></td></tr></table>
      <p class="muted">근거 — 동의 ${g.order.filter((s) => (g.agree || {})[s]).length}/${g.order.length} · 쪽지 ${g.order.filter((s) => (g.noteDone || {})[s]).length}/${g.order.length} · 잠깐 멈춤 ${g.pauseCount || 0}번</p><div class="beadrows">${beadsHtml(g, nm)}</div>
      ${g.ratingConfirmed ? '' : `<div class="ctrl"><b>‘함께’ 별</b><select data-ch="adj" data-g="${g.id}" style="width:auto"><option value="0">학생 평균 그대로 (${c.auto ?? '-'})</option>${[1, 2, 3].map((n) => `<option value="${n}" ${T.adj[g.id] === n ? 'selected' : ''}>${n}점으로 조정</option>`).join('')}</select>
        <button class="btn primary" data-act="confirm" data-g="${g.id}" ${all ? '' : 'disabled'}>확정</button>${!all && done ? `<button class="btn" data-act="confirm" data-g="${g.id}" data-force="1">늦는 학생 빼고 마감</button>` : ''}</div>`}</div>`;
  }).join('');
  return `<div class="card"><h2>별 평가 확정 <span class="muted">${esc(T.ses.dateStr)} · ${esc(T.ses.topic)}</span></h2>
      <div class="ctrl"><button class="btn primary" data-act="confirmAll">확정 대기 모둠 한 번에 확정</button><span class="muted">확정하면 점수가 적립되고 학생 화면에 결과가 열립니다.</span></div>
      ${fl.length ? `<p class="flag">⚠ 반복 표시</p><ul>${fl.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <div class="ctrl"><b>교사 보너스 별</b><select data-k="b.sid" style="width:auto"><option value="">학생 선택</option>${[...T.roster].sort(byNum).map((s) => `<option value="${s.id}" ${D['b.sid'] === s.id ? 'selected' : ''}>${s.num}. ${esc(s.name)}</option>`).join('')}</select>
        <select data-k="b.n" style="width:auto">${[1, 2, 3].map((n) => `<option ${+val('b.n', 1) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <input type="text" data-k="b.memo" placeholder="까닭 (예: 친구 의견을 끝까지 기다려 줌)" value="${esc(val('b.memo'))}"><button class="btn" data-act="bonus">주기</button></div></div>${cards}`;
}

function classTab() {
  const groups = [...new Set(T.roster.map((s) => s.group))].length;
  return `<div class="grid2"><div class="card"><h2>학생 등록 (붙여넣기)</h2><p class="muted">한 줄에 한 명씩 <b>번호 이름 핀 모둠</b> 순서로 적습니다. 엑셀에서 네 칸을 복사해 붙여도 됩니다.<br>이미 있는 번호는 이름·모둠이 바뀌고, 핀을 비우면 핀은 그대로 둡니다.</p>
      <textarea rows="10" data-k="k.paste" placeholder="1 김지호 1234 1&#10;2 이서연 5678 1&#10;3 박민준 2468 1">${esc(val('k.paste'))}</textarea>
      <div class="ctrl"><button class="btn primary" data-act="saveClass">저장</button></div>
      <p class="muted">학생 이름과 핀은 이 화면에서만 등록합니다. GitHub 저장소에는 올라가지 않습니다.</p>
      <h3 style="margin-top:20px">학기 말 정리</h3><div class="ctrl"><button class="btn danger" data-act="wipe">학급 초기화 (모든 데이터 지우기)</button></div></div>
    <div class="card"><h2>명렬 <span class="muted">${T.roster.length}명 · ${groups}모둠</span></h2><table><tr><th>번호</th><th>이름</th><th>모둠</th><th></th></tr>
      ${[...T.roster].sort(byNum).map((s) => `<tr><td>${s.num}</td><td><b>${esc(s.name)}</b></td><td><select data-ch="sgroup" data-sid="${s.id}" style="width:auto">${Array.from({ length: 12 }, (_, i) => `<option ${s.group === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></td>
        <td style="text-align:right"><button class="btn" data-act="spin" data-sid="${s.id}">핀 바꾸기</button> <button class="btn" data-act="sdel" data-sid="${s.id}">지우기</button></td></tr>`).join('')}</table></div></div>`;
}

function histTab() {
  if (!T.hist) return `<div class="card">${T.histLoading ? '기록을 불러오는 중입니다…' : '<button class="btn" data-act="histReload">기록 불러오기</button>'}</div>`;
  const stat = {};
  T.roster.forEach((s) => { stat[s.id] = { roles: {}, stk: 0, beads: 0, good: [0, 0, 0], n: 0 }; });
  for (const { gs } of T.hist) for (const { g, stickers, refl } of gs) for (const x of g.order) {
    const st = stat[x]; if (!st) continue;
    st.n++; (g.members[x] || []).forEach((r) => { st.roles[r] = (st.roles[r] || 0) + 1; });
    st.beads += (g.beads || {})[x] || 0; st.stk += stickers.filter((k) => k.to === x).length;
    const rf = refl.find((r) => r.id === x); if (rf && rf.a) rf.a.forEach((a, i) => { if (a === 0) st.good[i]++; });
  }
  const fl = flags();
  const rows = [...T.roster].sort(byNum).map((s) => {
    const m = T.students[s.id] || {}; const st = stat[s.id];
    let extra = '';
    if (T.who === s.id) {
      extra = `<tr><td colspan="12" style="background:#fafbfe">${T.hist.map(({ s: ss, gs }) => {
        const e = gs.find(({ g }) => g.order.includes(s.id)); if (!e) return '';
        const { g, ratings, notes, record, refl, stickers } = e; const c = calc(g, ratings, g.togetherFinal);
        const mine = ratings.find((r) => r.id === s.id); const rf = refl.find((r) => r.id === s.id);
        return `<p><b>${esc(ss.dateStr)} ${esc(ss.topic)}</b> · ${esc(g.name)} · ${rolesLabel(g.members[s.id])} · 구슬 ${(g.beads || {})[s.id] || 0}<br>
          받은 별: ${ratings.filter((r) => r.id !== s.id && r.peers && r.peers[s.id]).map((r) => `${esc(nm(r.id))} 👂${r.peers[s.id].listen}🤝${r.peers[s.id].mediate}`).join(', ') || '없음'} → <b>${c.by[s.id].total}점</b>${g.ratingConfirmed ? '' : ' (미확정)'}<br>
          준 별: ${mine ? Object.entries(mine.peers || {}).map(([k, p]) => `${esc(nm(k))} 👂${p.listen}🤝${p.mediate}`).join(', ') + ` · 함께 ${mine.together}` : '제출 안 함'}<br>
          받은 스티커: ${stickers.filter((k) => k.to === s.id).map((k) => esc(k.icon + k.name)).join(', ') || '없음'} · 돌아보기: ${rf && rf.a ? rf.a.map((a) => REFLECT_A[a] || '-').join(' ') : '없음'}${rf && rf.text ? ` “${esc(rf.text)}”` : ''}<br>
          쪽지: ${esc(noteText(notes[s.id])) || '없음'} → 모둠 결정: ${esc(record.decision || '없음')}</p>`;
      }).join('') || '기록 없음'}</td></tr>`;
    }
    return `<tr class="click ${T.who === s.id ? 'sel' : ''}" data-act="who" data-sid="${s.id}"><td>${s.num}</td><td><b>${esc(s.name)}</b></td><td>${s.group}</td><td><b>${r1(m.total)}</b></td><td>${r1(m.listen)}</td><td>${r1(m.mediate)}</td><td>${r1(m.together)}</td><td>${r1(m.bonus)}</td>
      <td>${ROLE_KEYS.map((r) => `${ROLES[r].icon}${st.roles[r] || 0}`).join(' ')}</td><td>${st.stk}</td><td>${st.beads}</td><td>${st.good.join(' / ')}</td></tr>${extra}`;
  }).join('');
  return `<div class="card"><h2>누적 보기 <span class="muted">토의 ${T.hist.length}번</span></h2>
      <div class="ctrl"><button class="btn" data-act="histReload">↻ 새로 불러오기</button><button class="btn primary" data-act="csvRecords">⬇ 토의 기록 CSV</button><button class="btn primary" data-act="csvScores">⬇ 점수 CSV</button></div>
      ${fl.length ? `<p class="flag">⚠ 반복 표시</p><ul>${fl.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <table><tr><th>번호</th><th>이름</th><th>모둠</th><th>총점</th><th>👂 듣기</th><th>🤝 조율</th><th>🧩 함께</th><th>🎁 보너스</th><th>역할 이력</th><th>스티커</th><th>구슬</th><th>돌아보기 😀 (듣기/양보/역할)</th></tr>${rows}</table>
      <p class="muted">학생 줄을 누르면 토의별 내역(준 별·받은 별, 쪽지와 모둠 결정)이 열립니다.</p></div>
    <div class="card"><h2>토의 목록 <span class="muted">연습으로 해 본 토의는 ‘기록 지우기’로 정리할 수 있습니다. 그 토의로 쌓인 점수도 함께 빠집니다.</span></h2><table><tr><th>날짜</th><th>주제</th><th>모둠별 결정</th><th></th></tr>${[...T.hist].reverse().map(({ s, gs }) => `<tr><td style="white-space:nowrap">${esc(s.dateStr)}${s.id === sesId() && s.status === 'open' ? '<br><span class="tag green">열려 있음</span>' : ''}</td><td>${esc(s.topic)}</td><td>${gs.map(({ g, record }) => `<span class="tag">${esc(g.name)}</span> ${esc(record.decision || '-')}`).join('<br>')}</td><td><button class="btn danger" data-act="delSession" data-id="${s.id}">🗑 기록 지우기</button></td></tr>`).join('') || '<tr><td colspan="4">아직 토의 기록이 없습니다.</td></tr>'}</table></div>`;
}

function setTab() {
  const s = T.settings;
  return `<div class="card"><h2>설정</h2><div class="ctrl"><button class="btn primary" data-act="saveSet">저장</button><button class="btn" data-act="resetSet">처음 값으로</button></div>
      <div class="ctrl"><b>결과 공개</b><select data-k="s.reveal" style="width:auto"><option value="daily" ${val('s.reveal', s.revealMode) === 'daily' ? 'selected' : ''}>그날 항목별 평균 보여 주기</option><option value="total" ${val('s.reveal', s.revealMode) === 'total' ? 'selected' : ''}>누적 점수만 보여 주기</option></select></div></div>
    <div class="card"><h2>단계별 역할 멘트 <span class="muted">여러 문장은 “ / ”로 나눕니다</span></h2><table class="lines"><tr><th>단계</th>${ROLE_KEYS.map((r) => `<th>${ROLES[r].icon} ${ROLES[r].name}</th>`).join('')}</tr>
      ${s.lines.map((row, i) => `<tr><td>${i}. ${STAGES[i].name}</td>${ROLE_KEYS.map((r) => `<td><textarea rows="2" data-k="s.l.${i}.${r}">${esc(val(`s.l.${i}.${r}`, row[r]))}</textarea></td>`).join('')}</tr>`).join('')}</table></div>
    <div class="grid2"><div class="card"><h2>조율의 말 <span class="muted">한 줄에 하나</span></h2><textarea rows="6" data-k="s.mediations">${esc(val('s.mediations', s.mediations.join('\n')))}</textarea>
        <h2 style="margin-top:14px">토의 약속</h2><textarea rows="4" data-k="s.promises">${esc(val('s.promises', s.promises.join('\n')))}</textarea></div>
      <div class="card"><h2>칭찬 스티커 <span class="muted">아이콘 | 이름 | 뜻</span></h2><textarea rows="7" data-k="s.stickers">${esc(val('s.stickers', s.stickers.map((x) => `${x.icon} | ${x.name} | ${x.desc || ''}`).join('\n')))}</textarea>
        <h2 style="margin-top:14px">별 평가 항목 문구</h2>${['listen', 'mediate', 'together'].map((k) => `<div class="ctrl"><b>${RATING[k].icon} ${RATING[k].name}</b><input type="text" data-k="s.r.${k}" value="${esc(val('s.r.' + k, s.rating[k]))}"></div>`).join('')}</div></div>
    <div class="card"><h2>보상 설정</h2><p class="muted">보상 방식(구간 달성형 / 교환형)이 정해지면 이 자리에 추가됩니다. 점수 적립 내역과 사용 내역은 따로 저장되도록 준비되어 있습니다.</p></div>`;
}

function tick() {
  const s = T.ses; if (!s) return;
  const now = s.freeze ? s.freeze.at : store.now();
  $$('[data-tm=gt]').forEach((el) => { if (s.gtimer) el.textContent = `${STAGES[commonStage()].name} ${fmt(tleft(s.gtimer, now))}${s.gtimer.running ? '' : ' (멈춤)'}`; });
}
setInterval(tick, 500);

async function checkTeacher() {
  const u = store.user();
  if (!u || u.isAnonymous || !u.email) { T.login = 'out'; render(); return; }
  try { await store.get(`${C}/pins/_check`); } catch (e) { T.login = 'denied'; T.loginErr = u.email; render(); return; }
  T.login = 'ok';
  await store.syncClock(`${C}/settings/clock`);
  if (!(await store.get(C))) await store.set(C, { name: '우리 반', activeSession: null });
  store.watch(C, (v) => { T.cls = v || {}; upd(); });
  store.watch(`${C}/roster/main`, (v) => { T.roster = (v && v.students) || []; render(); });
  store.watch(`${C}/settings/main`, (v) => { T.rawSettings = v; T.settings = settingsOf(v); render(); });
  store.watchCol(`${C}/students`, (a) => { T.students = {}; a.forEach((x) => { T.students[x.id] = x; }); render(); });
  render();
}
(async () => {
  render();
  await initStore();
  T.ready = true;
  await checkTeacher();
})().catch((e) => { console.error(e); app.innerHTML = `<div class="center"><h2>연결하지 못했습니다</h2><small>${esc(e.message || e)}</small></div>`; });
