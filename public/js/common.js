// 학생·교사 화면이 함께 쓰는 내용: 역할, 단계, 기본 문구, 작은 도구들
import { CLASS_ID } from './config.js';

export const ROLES = {
  leader: { name: '이끔이', icon: '🚩', color: 'red', intro: '토의를 이끄는 사람' },
  recorder: { name: '기록이', icon: '✏️', color: 'blue', intro: '나온 말을 적는 사람' },
  keeper: { name: '지킴이', icon: '⏱️', color: 'green', intro: '시간과 차례를 지키는 사람' },
  praiser: { name: '칭찬이', icon: '⭐', color: 'yellow', intro: '잘한 점을 찾는 사람' },
};
export const ROLE_KEYS = ['leader', 'recorder', 'keeper', 'praiser'];

// 인원별 역할 묶음 (3명 모둠은 지킴이가 칭찬이를 겸함)
const ROLE_SETS = {
  1: [['leader', 'recorder', 'keeper', 'praiser']],
  2: [['leader', 'keeper'], ['recorder', 'praiser']],
  3: [['leader'], ['recorder'], ['keeper', 'praiser']],
  4: [['leader'], ['recorder'], ['keeper'], ['praiser']],
};
export function assignRoles(order, rot = 0) {
  const n = Math.min(4, order.length);
  const out = {};
  order.forEach((sid, i) => { out[sid] = n ? ROLE_SETS[n][(i + rot) % n] || ['praiser'] : []; });
  return out;
}

export const STAGES = [
  { name: '준비', desc: '역할 확인, 주제 읽기, 토의 약속 함께 읽기', min: 1, color: '#ff5d5d' },
  { name: '혼자 생각하기', desc: "조용히 '내 생각 쪽지' 쓰기", min: 2, color: '#ff9838' },
  { name: '돌아가며 말하기', desc: '쪽지를 보며 한 명씩 말하기', min: 4, color: '#f5c400' },
  { name: '같은 점 찾기', desc: '의견에서 겹치는 부분 찾기', min: 2, color: '#39c26b' },
  { name: '다른 점 묻기', desc: '"왜 그렇게 생각해?" 질문하기', min: 3, color: '#1fb5c9' },
  { name: '합치거나 고르기', desc: '섞거나, 번갈아 하거나, 골라서 조율하기', min: 4, color: '#3d86f5' },
  { name: '결정 확인', desc: "결정을 듣고 모두 '동의' 누르기", min: 1, color: '#7a63f0' },
  { name: '칭찬과 돌아보기', desc: '칭찬 발표, 별 평가, 돌아보기', min: 3, color: '#e163c7' },
];

export const METHODS = [
  { id: 'mix', icon: '🧩', name: '합치기', desc: '두 의견의 좋은 점을 섞는다. "네 의견에 이것만 넣자."도 합치기!' },
  { id: 'turn', icon: '🔁', name: '번갈아 하기', desc: '이번엔 네 의견, 다음엔 내 의견.' },
  { id: 'pick', icon: '✋', name: '고르기', desc: '이유를 한 번씩 더 말하고 손을 들어 정한다. (마지막 수단)' },
];
// 예전의 '조건 붙이기'(cond)는 합치기에 합쳤다
export const methodName = (id) => (METHODS.find((m) => m.id === (id === 'cond' ? 'mix' : id)) || {}).name || '';

const L = (leader, recorder, keeper, praiser) => ({ leader, recorder, keeper, praiser });
export const DEFAULTS = {
  lines: [
    L('오늘 주제는 ○○야. 약속 같이 읽자.', '나는 오늘 기록이야. 천천히 말해 줘.', '한 사람 1분씩 말할 수 있어.', '오늘 잘한 점을 찾아볼게.'),
    L('각자 생각을 쪽지에 적자.', '(조용히 쪽지 쓰기)', '2분 시작! / 30초 남았어.', '(조용히 쪽지 쓰기)'),
    L('○○부터 차례대로 말해 볼까? / 아직 말 안 한 친구 있어?', '방금 말한 거, 이렇게 적으면 맞아?', '시작! / 10초 남았어. / 다음 친구 차례야.', '끝까지 들어 줘서 고마워.'),
    L('우리 의견에서 비슷한 점이 뭘까?', '같은 점은 ○○라고 적을게.', '2분 동안 찾아보자.', '좋은 걸 찾았네!'),
    L('다른 의견에 궁금한 거 물어보자.', '다른 점은 ○○라고 적을게.', '질문은 한 사람씩 하자.', '친절하게 물어봐서 좋았어.'),
    L('합칠 수 있을까? 아니면 번갈아 할까?', '지금까지 정리하면 이래.', '3분 남았어. 이제 정해 보자.', '방금 양보해 줘서 고마워.'),
    L('우리 결정은 ○○야. 모두 괜찮아?', '결정한 내용 읽어 줄게.', '다 같이 동의 버튼 누르자.', '다 같이 정해서 멋지다!'),
    L('구슬을 먼저 보고 별 평가를 하자.', '기록 저장할게.', '구슬 보자. 골고루 말했을까?', '오늘의 칭찬을 발표할게.'),
  ],
  mediations: [
    '내 생각은 이런데, 너는 어때?',
    '네 말도 일리가 있어.',
    '둘 다 섞으면 어떨까?',
    '이번엔 네 의견으로 하자.',
    '내가 잘못 들었을 수 있으니 다시 말해 줄래?',
  ],
  promises: [
    '친구가 말할 때는 끝까지 듣는다.',
    '생각이 달라도 사람은 탓하지 않는다.',
    '양보는 번갈아 한다. 이번엔 내가, 다음엔 네가.',
  ],
  stickers: [
    { icon: '👂', name: '끝까지 들었어요', desc: '끼어들지 않고 들음' },
    { icon: '🤝', name: '양보했어요', desc: '자기 의견을 내려놓음' },
    { icon: '💡', name: '좋은 생각이에요', desc: '새로운 생각을 냄' },
    { icon: '🧩', name: '합쳐 줬어요', desc: '두 의견을 섞는 제안을 함' },
    { icon: '🙋', name: '용기 내 말했어요', desc: '말하기 어려워하다가 말함' },
    { icon: '💬', name: '친절하게 물었어요', desc: '다른 의견에 좋은 질문을 함' },
  ],
  rating: {
    listen: '친구 말을 끝까지 들어 주었다.',
    mediate: '자기 생각을 양보하거나 의견을 합치려고 했다.',
    together: '우리 모둠은 빠지는 친구 없이 모두의 생각을 모았다.',
  },
  revealMode: 'daily', // daily: 그날 항목별 평균 / total: 누적 점수만
  roleRound: 0,
};
export const RATING = {
  listen: { icon: '👂', name: '듣기' },
  mediate: { icon: '🤝', name: '조율' },
  together: { icon: '🧩', name: '함께' },
};
export const STAR_PEER = ['가끔 그랬다', '자주 그랬다', '토의 내내 그랬다'];
export const STAR_TEAM = ['몇 명만 말했다', '모두 말했지만 한 사람 생각대로 정했다', '모두의 생각이 우리 결정에 조금씩 들어갔다'];
export const REFLECT_Q = ['친구 말을 끝까지 들었나요?', '내 생각을 조금 양보하거나 합쳤나요?', '내 역할을 잘 해냈나요?'];
export const REFLECT_A = ['😀', '🙂', '🤔'];

export function settingsOf(s) {
  s = s || {};
  const o = { ...DEFAULTS, ...s };
  o.lines = DEFAULTS.lines.map((d, i) => ({ ...d, ...((s.lines || {})[i] || {}) }));
  o.rating = { ...DEFAULTS.rating, ...(s.rating || {}) };
  return o;
}

// 할 일 (체크 1~2개)
const T = (leader, recorder, keeper, praiser) => ({ leader, recorder, keeper, praiser });
const same = (a) => T(a, a, a, a);
export const TODOS = [
  same(['내 역할 확인하기', '토의 약속 3가지 함께 읽기']),
  same(['내 생각 쪽지 쓰기', "'다 썼어요' 누르기"]),
  T(['말할 친구 이름 누르기', '모두 말했는지 살피기'], ['친구 말 듣고 기록 고치기'], ['시작·끝 버튼 누르기'], ['잘 듣는 친구에게 스티커 주기']),
  T(['비슷한 점 물어보기'], ['같은 점 적기'], ['말한 친구에게 구슬 주기'], ['좋은 생각에 스티커 주기']),
  T(['궁금한 점 묻게 하기'], ['다른 점 적기'], ['말한 친구에게 구슬 주기'], ['친절한 질문에 스티커 주기']),
  T(['조율 방법 카드 고르기'], ['우리 모둠의 결정 적기'], ['남은 시간 알려 주기'], ['양보한 친구에게 스티커 주기']),
  T(['결정 확인하고 동의 누르기', "모두 동의하면 '결정 완료'"], ['결정 읽어 주기', '정한 까닭 적기'], ['동의 누르기'], ['동의 누르기']),
  same(['칭찬 듣기', '별 평가와 돌아보기 하기']),
];

// ── 작은 도구 ──
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (q, r = document) => r.querySelector(q);
export const $$ = (q, r = document) => [...r.querySelectorAll(q)];
export const fmt = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
export const avg1 = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
export const r1 = (n) => Math.round((n || 0) * 10) / 10;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export async function hashPin(pin, sid) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${CLASS_ID}:${sid}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 타이머: {startAt, dur, running, left} → 남은 초
export function tleft(t, now) {
  if (!t) return 0;
  if (!t.running) return t.left ?? t.dur;
  return t.dur - (now - (t.startAt || now)) / 1000;
}

// 화면 다시 그리기. 글을 쓰는 중이면(한글 조합이 깨지지 않게) 잠깐 미룬다.
let typingAt = 0; let composing = false;
document.addEventListener('input', () => { typingAt = Date.now(); }, true);
document.addEventListener('compositionstart', () => { composing = true; }, true);
document.addEventListener('compositionend', () => { composing = false; typingAt = Date.now(); }, true);
export function paint(root, html) {
  if (root._last === html) return;
  const a = document.activeElement;
  const typing = a && root.contains(a) && a.dataset.k !== undefined;
  if (typing && (composing || Date.now() - typingAt < 900)) {
    clearTimeout(root._t);
    root._pending = html;
    root._t = setTimeout(() => paint(root, root._pending), 300);
    return;
  }
  clearTimeout(root._t);
  root._last = html;
  const k = typing ? a.dataset.k : null;
  const ss = k !== null ? a.selectionStart : 0; const se = k !== null ? a.selectionEnd : 0;
  const cur = k !== null ? a.value : null;
  const sc = $$('[data-scroll]', root).map((e) => [e.dataset.scroll, e.scrollTop]);
  root.innerHTML = html;
  sc.forEach(([n, t]) => { const e = $(`[data-scroll="${n}"]`, root); if (e) e.scrollTop = t; });
  if (k !== null) {
    const n = $$('[data-k]', root).find((e) => e.dataset.k === k);
    if (n) { if (cur !== null && n.value !== cur) n.value = cur; n.focus(); try { n.setSelectionRange(ss, se); } catch { /* 선택 범위 없는 칸 */ } }
  }
}

// 가이드맵: 구불구불한 길 위 정거장 8개, 지금 단계에 깃발
export function guideMap(stage) {
  const pts = STAGES.map((_, i) => [55 + i * 98.5, i % 2 ? 78 : 50]);
  let segs = '';
  for (let i = 0; i < 7; i++) {
    const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1]; const mx = (x1 + x2) / 2;
    const done = i < stage;
    segs += `<path d="M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2} ${y2}" fill="none" stroke="${done ? STAGES[i].color : '#d9dde6'}" stroke-width="${done ? 10 : 8}" stroke-linecap="round" ${done ? '' : 'stroke-dasharray="2 14"'}/>`;
  }
  const dots = pts.map(([x, y], i) => {
    const cur = i === stage; const done = i < stage; const c = STAGES[i].color;
    return `<g ${cur ? 'class="gm-cur"' : ''} opacity="${cur || done ? 1 : 0.45}">
      <circle cx="${x}" cy="${y}" r="${cur ? 24 : 18}" fill="${cur || done ? c : '#fff'}" stroke="${c}" stroke-width="4"/>
      <text x="${x}" y="${y + 7}" text-anchor="middle" font-size="${cur ? 22 : 18}" font-weight="800" fill="${cur || done ? '#fff' : c}">${done ? '✓' : i}</text>
      ${cur ? `<text x="${x + 14}" y="${y - 22}" font-size="30">🚩</text>` : ''}
      <text x="${x}" y="${i % 2 ? 122 : 20}" text-anchor="middle" font-size="${cur ? 16 : 13}" font-weight="${cur ? 800 : 600}" fill="${cur ? '#222' : '#667'}">${STAGES[i].name}</text>
    </g>`;
  }).join('');
  return `<svg class="gm" viewBox="0 0 800 130" role="img" aria-label="가이드맵: 지금 ${stage}단계 ${STAGES[stage].name}">${segs}${dots}</svg>`;
}
export function miniMap(stage) {
  return `<span class="mini">${STAGES.map((s, i) => `<i style="background:${i <= stage ? s.color : '#e3e6ee'}" class="${i === stage ? 'on' : ''}">${i === stage ? i : ''}</i>`).join('')}</span>`;
}

export const BEAD_COLORS = ['#ff6b4a', '#3b8cff', '#2fbf71', '#ffb400'];
export function beadsHtml(g, nameOf, fresh = {}) {
  const order = g.order || [];
  return order.map((sid, i) => {
    const n = (g.beads || {})[sid] || 0;
    let b = '';
    for (let j = 0; j < n; j++) b += `<i class="bead ${fresh[sid] && j === n - 1 ? 'roll' : ''}" style="background:${BEAD_COLORS[i % 4]}"></i>`;
    return `<span class="beadrow"><b>${esc(nameOf(sid))}</b>${b || '<em>아직 없음</em>'}</span>`;
  }).join('');
}
export function rolesLabel(roles) { return (roles || []).map((r) => ROLES[r].icon + ' ' + ROLES[r].name).join(' · '); }
export function noteText(n) {
  if (!n || (!n.idea && !n.reason)) return '';
  return `${n.idea ? `나는 ${n.idea}(이)라고 생각해.` : ''}${n.reason ? ` 왜냐하면 ${n.reason}.` : ''}`.trim();
}
// 기록이가 고친 내용이 있으면 그것, 없으면 공개된 쪽지
export function opinionOf(sid, record, notes) {
  const o = (record && record.opinions) || {};
  return o[sid] !== undefined ? o[sid] : noteText(notes[sid]);
}

export function downloadCsv(name, rows) {
  const text = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let actx;
export function beep(times = 2, freq = 880) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + i * 0.3;
      g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.25);
    }
  } catch { /* 소리를 낼 수 없는 기기 */ }
}

export function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show';
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = ''; }, 2600);
}
