// 칠판 보기: 현재 단계, 남은 시간, 모둠별 위치만 크게. 점수·별·도움 요청은 보여 주지 않는다.
import { initStore, store, C } from './store.js';
import { STAGES, esc, $, $$, fmt, tleft, paint, miniMap, methodName } from './common.js';

const app = $('#app');
const B = { ses: null, groups: [], pick: null, rec: null, err: '' };
let unS = null; let unG = null; let unR = null; let cur = null;

function common() {
  const c = {}; let best = 0;
  B.groups.forEach((g) => { c[g.stage] = (c[g.stage] || 0) + 1; if (c[g.stage] > (c[best] || 0)) best = g.stage; });
  return best;
}
function view() {
  if (B.err) return `<div class="wrap"><p>${esc(B.err)}</p></div>`;
  const s = B.ses;
  if (!s) return '<div class="wrap"><div class="bdec"><h1>🗣️ 토의도우미</h1><p>토의방이 열리면 여기에 표시됩니다.</p></div></div>';
  if (B.pick) {
    const g = B.groups.find((x) => x.id === B.pick) || {}; const r = B.rec || {};
    return `<div class="wrap"><div class="btopic">${esc(s.topic)}</div><div class="bdec"><p>${esc(g.name || '')}의 결정</p><h1>${esc(r.decision || '아직 적지 않았어요')}</h1>
      ${g.method ? `<p>조율 방법: ${methodName(g.method)}</p>` : ''}${r.why ? `<p>까닭: ${esc(r.why)}</p>` : ''}</div><button class="btn" data-back>← 모둠 목록</button></div>`;
  }
  const cs = common(); const same = B.groups.every((g) => g.stage === cs);
  return `<div class="wrap">${s.notice ? `<div class="notice">📢 ${esc(s.notice.text)}</div>` : ''}
    <div class="btopic">주제: ${esc(s.topic)}</div>
    <div class="bstage"><b style="color:${STAGES[cs].color}">${cs}. ${STAGES[cs].name}</b>${same ? '' : '<span>(모둠마다 달라요)</span>'}<span class="btime" data-tm></span></div>
    <div class="bdesc">${s.status === 'open' ? esc(STAGES[cs].desc) : '토의가 끝났습니다. 모둠을 누르면 결정을 볼 수 있어요.'}</div>
    <div class="brows">${B.groups.map((g) => `<div class="brow" data-g="${g.id}"><span>${esc(g.name)}</span>${miniMap(g.stage)}</div>`).join('')}</div></div>`;
}
function render() { paint(app, view()); tick(); }
function tick() {
  const s = B.ses; if (!s || !B.groups.length) return;
  const now = s.freeze ? s.freeze.at : store.now();
  const cs = common(); const g = B.groups.find((x) => x.stage === cs);
  const left = s.gtimer ? tleft(s.gtimer, now) : (s.stageTimes[cs] || 1) * 60 + (g.extra || 0) - (now - (g.stageStart || now)) / 1000;
  $$('[data-tm]').forEach((el) => { el.textContent = s.status !== 'open' ? '' : left > 0 ? fmt(left) : '시간 끝'; });
}
setInterval(tick, 500);
app.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) { B.pick = null; if (unR) unR(); unR = null; render(); return; }
  const row = e.target.closest('[data-g]');
  if (row) { B.pick = row.dataset.g; B.rec = null; unR = store.watch(`${C}/sessions/${cur}/groups/${B.pick}/record/main`, (v) => { B.rec = v; render(); }); render(); }
});

(async () => {
  await initStore();
  const u = store.user();
  if (!u || u.isAnonymous) { B.err = '선생님 화면에서 먼저 로그인한 뒤 이 창을 새로고침해 주세요.'; render(); return; }
  store.watch(C, (v) => {
    const id = (v && v.activeSession) || null;
    if (id === cur) return;
    cur = id; if (unS) unS(); if (unG) unG(); B.ses = null; B.groups = []; B.pick = null;
    if (id) {
      unS = store.watch(`${C}/sessions/${id}`, (x) => { B.ses = x; render(); });
      unG = store.watchCol(`${C}/sessions/${id}/groups`, (a) => { B.groups = a.sort((x, y) => x.id.localeCompare(y.id, 'ko', { numeric: true })); render(); });
    }
    render();
  });
  render();
})();
