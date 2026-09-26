import { initializeApp } from 'firebase/app';
import {
  collection, doc, getFirestore, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// 一定要用 import.meta.env.VITE_XXX 這種「字面屬性」寫法：
// Vite 是在 build 時做字串取代的，寫成 import.meta.env[key] 動態取值，
// 打包後會拿到 undefined。
const required = (key, value) => {
  if (!value) {
    throw new Error(
      `缺少環境變數 ${key}。請複製 .env.example 成 .env.local 並填入 Firebase 設定` +
        `（部署到 Vercel 的話要在專案的 Environment Variables 加同名變數）。`
    );
  }
  return value;
};

const firebaseConfig = {
  apiKey: required('VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: required('VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: required('VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app;
try {
  app = initializeApp(firebaseConfig);
} catch {
  /* HMR 重複初始化 */
}

export const auth = getAuth(app);

// 資料存一份在瀏覽器的 IndexedDB：
//   - 打開時先顯示上次的資料，不用等整包重新下載
//   - 沒訊號也能記帳，恢復連線後自動同步給另一半
// multipleTabManager 讓同時開好幾個分頁也能共用同一份快取。
// initializeFirestore 只能呼叫一次（HMR 重新執行這個檔案時會丟錯），這時沿用既有的實例。
const createDb = () => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
};
export const db = createDb();
export const googleProvider = new GoogleAuthProvider();

/* ---------------------------------------------------------------------------
   !!! 不要動下面這兩行 !!!
   `__app_id` 是 Google AI Studio / Canvas 才會注入的全域變數，在 Vite build
   裡永遠是 undefined，所以正式站的 appId 就是字串 'default-app-id'。
   它是所有 Firestore 路徑的第一段 —— 「整理掉」等於現有資料全部讀不到。
--------------------------------------------------------------------------- */
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
export const appId = rawAppId.replace(/\//g, '_').replace(/\./g, '_');

/* ---------------------------------------------------------------------------
   共用帳本的路徑。coupleId 是「嵌在集合名稱裡」的，不是子集合：
     artifacts/{appId}/public/data/{name}_{coupleId}/{docId}
   name ∈ transactions | savings_jars | books | gold_transactions
   把它收斂在這裡，避免哪天有人在某個呼叫點手滑改掉格式。
--------------------------------------------------------------------------- */
export const coupleCol = (name, coupleId) =>
  collection(db, 'artifacts', appId, 'public', 'data', `${name}_${coupleId}`);

export const coupleDoc = (name, coupleId, id) =>
  doc(db, 'artifacts', appId, 'public', 'data', `${name}_${coupleId}`, id);

// 個人設定（私有）：artifacts/{appId}/users/{uid}/profile/data
export const profileDoc = (uid) =>
  doc(db, 'artifacts', appId, 'users', uid, 'profile', 'data');
