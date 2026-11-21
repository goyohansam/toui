// 체험판 저장소: 이 브라우저 안(localStorage)에만 저장하고, 열린 탭끼리 실시간으로 맞춘다.
import { C, Q } from './store.js';
import { hashPin } from './common.js';

const KEY = 'toui-demo-db';
const NAMES = ['김지호', '이서연', '박민준', '최하윤', '정도윤', '강서준', '조예은', '윤시우', '장하린', '임지안',
  '한주원', '오수아', '서건우', '신유나', '권은우', '황지유', '안선우', '송채원', '류현우', '홍다은',
  '전준서', '고소율', '문태윤', '양서아', '손이준'];

export async function create() {
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let db = load();
  const ch = new BroadcastChannel('toui-demo');
  const subs = new Set();
  const fire = () => {
    for (const s of [...subs]) {
      const j = JSON.stringify(s.fn());
      if (j !== s.last) { s.last = j; s.cb(JSON.parse(j)); }
    }
  };
  const commit = () => { localStorage.setItem(KEY, JSON.stringify(db)); ch.postMessage(1); fire(); };
  ch.onmessage = () => { db = load(); fire(); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) { db = load(); fire(); } });

  const res = (v, old) => {
    if (v && v.__s) return v.__s === 'ts' ? Date.now() : v.__s === 'inc' ? (typeof old === 'number' ? old : 0) + v.n : undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = {};
      for (const k in v) { const r = res(v[k], old && old[k]); if (r !== undefined) o[k] = r; }
      return o;
    }
    return v;
  };
  const merge = (t, d) => {
    for (const k in d) {
      const v = d[k];
      if (v && v.__s) { const r = res(v, t[k]); if (r === undefined) delete t[k]; else t[k] = r; }
      else if (v && typeof v === 'object' && !Array.isArray(v)) { if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {}; merge(t[k], v); }
      else t[k] = v;
    }
    return t;
  };
  const doSet = (path, d, m) => { db[path] = m && db[path] ? merge(db[path], d) : res(d, db[path]); };
  const doUpdate = (path, d) => {
    if (!db[path]) throw new Error('문서가 없습니다: ' + path);
    for (const key in d) {
      const parts = key.split('.');
      let o = db[path];
      for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
      const last = parts[parts.length - 1];
      const r = res(d[key], o[last]);
      if (r === undefined) delete o[last]; else o[last] = r;
    }
  };
  const colOf = (path, w) => {
    const pre = path + '/';
    const out = [];
    for (const p in db) {
      if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) {
        if (!w || db[p][w[0]] === w[2]) out.push({ id: p.slice(pre.length), ...db[p] });
      }
    }
    return out;
  };
  const watchFn = (fn, cb) => {
    const s = { fn, cb, last: undefined };
    subs.add(s);
    queueMicrotask(() => { if (subs.has(s) && s.last === undefined) { s.last = JSON.stringify(fn()); cb(JSON.parse(s.last)); } });
    return () => subs.delete(s);
  };
  const rid = () => Math.random().toString(36).slice(2, 10);
  let uid = sessionStorage.getItem('toui-uid');
  if (!uid) { uid = rid(); sessionStorage.setItem('toui-uid', uid); }

  // 처음 열면 연습용 학급(25명, 8모둠)을 만들어 둔다
  if (!db[C]) {
    const students = NAMES.map((name, i) => ({ id: 's' + String(i + 1).padStart(2, '0'), num: i + 1, name, group: Math.min(8, Math.floor(i / 3) + 1) }));
    db[C] = { name: '체험 학급', activeSession: null };
    db[`${C}/roster/main`] = { students };
    for (const s of students) {
      db[`${C}/pins/${s.id}`] = { hash: await hashPin('1234', s.id) };
      db[`${C}/students/${s.id}`] = { total: 0, listen: 0, mediate: 0, together: 0, bonus: 0 };
    }
    commit();
  }

  return {
    demo: true,
    now: () => Date.now(),
    user: () => ({ uid, email: 'demo@teacher', isAnonymous: false }),
    async anon() { return { uid }; },
    async google() { return { uid, email: 'demo@teacher' }; },
    async out() {},
    async get(path) { db = load(); return db[path] ? JSON.parse(JSON.stringify(db[path])) : null; },
    async getCol(path, w) { db = load(); return JSON.parse(JSON.stringify(colOf(path, w))); },
    watch(path, cb) { return watchFn(() => db[path] || null, cb); },
    watchCol(path, cb, w) { return watchFn(() => colOf(path, w), cb); },
    async set(path, d, m = false) { db = load(); doSet(path, d, m); commit(); },
    async update(path, d) { db = load(); doUpdate(path, d); commit(); },
    async add(path, d) { db = load(); const id = rid(); doSet(`${path}/${id}`, d, false); commit(); return { id }; },
    async del(path) { db = load(); delete db[path]; commit(); },
    async batch(ops) {
      db = load();
      for (const o of ops) {
        if (o.op === 'set') doSet(o.path, o.data, o.merge);
        else if (o.op === 'update') doUpdate(o.path, o.data);
        else delete db[o.path];
      }
      commit();
    },
    async syncClock() {},
    async loginStudent(sid, pinHash) {
      db = load();
      const p = db[`${C}/pins/${sid}`];
      if (!p || p.hash !== pinHash) return false;
      sessionStorage.setItem('toui-sid', sid);
      return true;
    },
    async restoreStudent() { return Q.get('u') || sessionStorage.getItem('toui-sid'); },
    watchMember() { return () => {}; },
    async logoutStudent() { sessionStorage.removeItem('toui-sid'); },
  };
}
