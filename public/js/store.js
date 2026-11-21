// 데이터 저장소 고르기: Firebase 설정이 비어 있거나 주소에 ?demo 가 있으면 체험판
import { firebaseConfig, CLASS_ID } from './config.js';

export const Q = new URLSearchParams(location.search);
export const DEMO = !firebaseConfig.apiKey || Q.has('demo');
export const C = `classes/${CLASS_ID}`;
export let store = null;

export async function initStore() {
  store = DEMO
    ? await (await import('./store-mock.js')).create()
    : await (await import('./store-fb.js')).create(firebaseConfig);
  return store;
}

// 특수 값: 서버 시각, 숫자 더하기, 칸 지우기
export const ts = () => ({ __s: 'ts' });
export const inc = (n) => ({ __s: 'inc', n });
export const rm = () => ({ __s: 'rm' });
