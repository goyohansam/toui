// Firebase(Firestore + Authentication) 저장소
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, getDocFromServer, onSnapshot, setDoc, updateDoc,
  addDoc, deleteDoc, writeBatch, serverTimestamp, increment, deleteField, query, where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { C } from './store.js';

export async function create(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let offset = 0;

  // 앱이 쓰는 특수 값 → Firestore 값
  const enc = (v) => {
    if (v && v.__s) return v.__s === 'ts' ? serverTimestamp() : v.__s === 'inc' ? increment(v.n) : deleteField();
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = enc(v[k]); return o; }
    return v;
  };
  // Firestore 시각 → 숫자(밀리초)
  const dec = (v) => {
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = dec(v[k]); return o; }
    return v;
  };
  const data = (s) => (s.exists() ? dec(s.data({ serverTimestamps: 'estimate' })) : null);
  const colRef = (path, w) => (w ? query(collection(db, path), where(w[0], w[1], w[2])) : collection(db, path));
  const list = (qs) => qs.docs.map((d) => ({ id: d.id, ...dec(d.data({ serverTimestamps: 'estimate' })) }));
  const onErr = (path) => (e) => console.warn('읽기 실패:', path, e.code || e.message);
  const uid = () => auth.currentUser && auth.currentUser.uid;
  const memberPath = () => `${C}/members/${uid()}`;

  const user = await new Promise((res) => { const un = onAuthStateChanged(auth, (u) => { un(); res(u); }); });

  const api = {
    demo: false,
    now: () => Date.now() + offset,
    user: () => auth.currentUser,
    async anon() { if (!auth.currentUser) await signInAnonymously(auth); return auth.currentUser; },
    async google() { const r = await signInWithPopup(auth, new GoogleAuthProvider()); return r.user; },
    async out() { await signOut(auth); },

    async get(path) { return data(await getDoc(doc(db, path))); },
    async getCol(path, w) { return list(await getDocs(colRef(path, w))); },
    watch(path, cb) { return onSnapshot(doc(db, path), (s) => cb(data(s)), onErr(path)); },
    watchCol(path, cb, w) { return onSnapshot(colRef(path, w), (qs) => cb(list(qs)), onErr(path)); },
    set(path, d, merge = false) { return setDoc(doc(db, path), enc(d), { merge }); },
    update(path, d) { return updateDoc(doc(db, path), enc(d)); },
    add(path, d) { return addDoc(collection(db, path), enc(d)); },
    del(path) { return deleteDoc(doc(db, path)); },
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          const r = doc(db, o.path);
          if (o.op === 'set') b.set(r, enc(o.data), { merge: !!o.merge });
          else if (o.op === 'update') b.update(r, enc(o.data));
          else b.delete(r);
        }
        await b.commit();
      }
    },

    // 기기 시계와 서버 시계의 차이를 재어 타이머가 기기마다 같게 보이도록 함
    async syncClock(path) {
      try {
        const t0 = Date.now();
        await setDoc(doc(db, path), { at: serverTimestamp() }, { merge: true });
        const t1 = Date.now();
        const s = await getDocFromServer(doc(db, path));
        offset = s.data().at.toMillis() - (t0 + t1) / 2;
      } catch (e) { console.warn('시계 맞추기 실패', e.code || e.message); }
    },

    // 학생 본인 확인: 핀 해시가 맞아야 규칙이 저장을 허락함
    async loginStudent(sid, pinHash) {
      await api.anon();
      try {
        await setDoc(doc(db, memberPath()), { sid, pinHash, at: serverTimestamp() });
        await api.syncClock(memberPath());
        return true;
      } catch (e) { if (e.code === 'permission-denied') return false; throw e; }
    },
    async restoreStudent() {
      await api.anon();
      const m = await api.get(memberPath()).catch(() => null);
      if (m && m.sid) { await api.syncClock(memberPath()); return m.sid; }
      return null;
    },
    async logoutStudent() { await deleteDoc(doc(db, memberPath())).catch(() => {}); },
  };
  void user;
  return api;
}
