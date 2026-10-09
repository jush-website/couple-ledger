import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import {
  addDoc, setDoc, doc, onSnapshot, deleteDoc, updateDoc, serverTimestamp,
  writeBatch, query, where, getDocs, runTransaction, deleteField, arrayUnion
} from 'firebase/firestore';
import {
  onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut
} from 'firebase/auth';
import {
  Heart, Wallet, PiggyBank, ChartPie, Plus, Settings, CalendarDays,
  CheckCircle, Book, Archive, Coins
} from 'lucide-react';

import { auth, db, googleProvider, coupleCol, coupleDoc, profileDoc } from './lib/firebase.js';
import { safeCalculate } from './lib/format.js';
import { getQuickPicks } from './lib/quickPicks.js';
import { normalizeReservations, reservedForMonth, toTransactionPrefill } from './lib/reservations.js';
import { monthKeyOf } from './lib/budget.js';
import { normalizeEvent } from './lib/events.js';
import { normalizeAnniversary } from './lib/anniversaries.js';
import { BACKUP_COLLECTIONS } from './lib/constants.js';
import { useTheme } from './lib/theme.js';
import { withReload } from './lib/lazyReload.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';

import AppLoading from './components/AppLoading.jsx';
import AuthAndPairing from './components/AuthAndPairing.jsx';
import NavBtn from './components/NavBtn.jsx';
import Overview from './components/Overview.jsx';
import AddTransactionModal from './components/AddTransactionModal.jsx';

// 首頁（總覽＋記一筆）以外的分頁與對話框都延後載入，首屏只下載真正會看到的程式碼。
// 登入後會在瀏覽器閒置時預先抓好（見 prefetchLazyChunks），所以切換時不會卡頓。
const lazyImports = {
  Statistics: () => import('./components/Statistics.jsx'),
  Savings: () => import('./components/Savings.jsx'),
  GoldView: () => import('./components/GoldView.jsx'),
  SettingsView: () => import('./components/SettingsView.jsx'),
  CalendarView: () => import('./components/CalendarView.jsx'),
  AddJarModal: () => import('./components/AddJarModal.jsx'),
  DepositModal: () => import('./components/DepositModal.jsx'),
  JarHistoryModal: () => import('./components/JarHistoryModal.jsx'),
  ReceiptScannerModal: () => import('./components/ReceiptScannerModal.jsx'),
  VoiceEntryModal: () => import('./components/VoiceEntryModal.jsx'),
  AddGoldModal: () => import('./components/AddGoldModal.jsx'),
  RouletteModal: () => import('./components/RouletteModal.jsx'),
  RepaymentModal: () => import('./components/RepaymentModal.jsx'),
  BookManagerModal: () => import('./components/BookManagerModal.jsx'),
  ReservationModal: () => import('./components/ReservationModal.jsx'),
};
const Statistics = lazy(withReload(lazyImports.Statistics));
const Savings = lazy(withReload(lazyImports.Savings));
const GoldView = lazy(withReload(lazyImports.GoldView));
const SettingsView = lazy(withReload(lazyImports.SettingsView));
const CalendarView = lazy(withReload(lazyImports.CalendarView));
const AddJarModal = lazy(withReload(lazyImports.AddJarModal));
const DepositModal = lazy(withReload(lazyImports.DepositModal));
const JarHistoryModal = lazy(withReload(lazyImports.JarHistoryModal));
const ReceiptScannerModal = lazy(withReload(lazyImports.ReceiptScannerModal));
const VoiceEntryModal = lazy(withReload(lazyImports.VoiceEntryModal));
const AddGoldModal = lazy(withReload(lazyImports.AddGoldModal));
const RouletteModal = lazy(withReload(lazyImports.RouletteModal));
const RepaymentModal = lazy(withReload(lazyImports.RepaymentModal));
const BookManagerModal = lazy(withReload(lazyImports.BookManagerModal));
const ReservationModal = lazy(withReload(lazyImports.ReservationModal));

const prefetchLazyChunks = () => {
  const run = () => Object.values(lazyImports).forEach((load) => load().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
};

// 金價在切換分頁時不必每次重抓；5 分鐘內的資料直接沿用，右上角的重新整理鈕仍可強制更新。
const GOLD_CACHE_MS = 5 * 60 * 1000;
// 本機自動備份會把整份資料 JSON.stringify 後寫進 localStorage（同步、會卡主執行緒），
// 連續幾筆快照更新時只需要寫最後一次。
const AUTO_BACKUP_DEBOUNCE_MS = 2000;

const TabFallback = () => (
  <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-500 rounded-full animate-spin" /></div>
);

// --- Main App Component ---
export default function App() {
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); 
  
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState([]);
  const [jars, setJars] = useState([]);
  const [books, setBooks] = useState([]);
  const [goldTransactions, setGoldTransactions] = useState([]);
  const [events, setEvents] = useState([]);
  const [anniversaries, setAnniversaries] = useState([]);
  
  const [activeBookId, setActiveBookId] = useState(null);
  const [viewArchived, setViewArchived] = useState(false);

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false);
  const [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null);
  const [showJarHistory, setShowJarHistory] = useState(null); // 存 jar id，畫面用 jars 裡的最新資料
  // 還款也走 handleSaveTransaction，它看 editingTransaction?.id 決定新增或覆蓋，
  // 所以開還款視窗、關掉編輯視窗時都要把 editingTransaction 清掉，否則會蓋掉上次點開的那筆紀錄。
  const [repaymentDebt, setRepaymentDebt] = useState(null);
  const [showRoulette, setShowRoulette] = useState(false);
  const [showAddGold, setShowAddGold] = useState(false);
  const [editingGold, setEditingGold] = useState(null);
    
  const [showBookManager, setShowBookManager] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  // 預留款：showReservation 開新增／編輯視窗；payingReservation 是按了「付款了」、正在記帳的那一筆
  const [showReservation, setShowReservation] = useState(false);
  const [editingReservation, setEditingReservation] = useState(null);
  const [payingReservation, setPayingReservation] = useState(null);
    
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });
  const [autoBackupTime, setAutoBackupTime] = useState(null);

  // Gold Data State
  const [goldPrice, setGoldPrice] = useState(0); 
  const [goldHistory, setGoldHistory] = useState([]);
  const [goldIntraday, setGoldIntraday] = useState([]); 
  const [goldPeriod, setGoldPeriod] = useState('1d'); 
  const [goldLoading, setGoldLoading] = useState(false);
  const [goldError, setGoldError] = useState(null);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
         try { await signInWithCustomToken(auth, __initial_auth_token); } catch { /* Canvas 以外的環境沒有這個 token */ }
      }
    };
    initAuth();

    // onAuthStateChanged 的 callback 回傳值會被忽略，原本 `return () => unsubProfile()`
    // 根本不會執行：每次登出再登入都會多掛一個 profile 監聽，舊帳號的監聽也不會停。
    let unsubProfile = null;
    const stopProfile = () => { if (unsubProfile) { unsubProfile(); unsubProfile = null; } };

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
        stopProfile();
        setUser(u);
        if (u) {
            const profileRef = profileDoc(u.uid);
            unsubProfile = onSnapshot(profileRef, (docSnap) => {
                if (docSnap.exists()) {
                    setProfile(docSnap.data());
                } else {
                    setProfile(null);
                }
                setLoadingAuth(false);
            }, (err) => {
                console.error("Failed to fetch profile", err);
                setLoadingAuth(false);
            });
        } else {
            setProfile(null);
            setLoadingAuth(false);
        }
    });

    return () => { unsubscribeAuth(); stopProfile(); };
  }, []);

  const goldFetchedAt = useRef(0);
  const fetchGoldPrice = useCallback(async ({ force = true } = {}) => {
      if (!force && Date.now() - goldFetchedAt.current < GOLD_CACHE_MS) return;
      setGoldLoading(true); setGoldError(null);
      try {
          const response = await fetch('/api/gold');
          if (!response.ok) throw new Error(`連線錯誤 (${response.status})`);
          const data = await response.json();
          if (data.success) {
              let price = data.currentPrice;
              let fetchedHistory = [...(data.history || [])];
              let fetchedIntraday = [...(data.intraday || [])];
              
              if (!price && fetchedHistory.length > 0) {
                  price = fetchedHistory[fetchedHistory.length - 1].price;
              }

              try {
                  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()); 
                  if (fetchedHistory.length > 0 && price > 0) {
                      const lastItem = fetchedHistory[fetchedHistory.length - 1];
                      if (lastItem.date !== todayStr) {
                          fetchedHistory.push({ date: todayStr, price: price, label: '今日' });
                      } else {
                          lastItem.price = price;
                          lastItem.label = '今日';
                      }
                  }
                  
                  if (fetchedIntraday.length === 0 && price > 0) {
                      const now = new Date();
                      fetchedIntraday = [{ 
                          date: now.toISOString(), 
                          price: price, 
                          label: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) 
                      }];
                  }
              } catch (dateErr) {
                  console.warn("Date formatting error", dateErr);
              }

              setGoldPrice(price); 
              setGoldHistory(fetchedHistory); 
              setGoldIntraday(fetchedIntraday);
              goldFetchedAt.current = Date.now();
          } else { throw new Error(data.error || '無法讀取資料'); }
      } catch (err) {
          console.error("Gold Fetch Error:", err);
          setGoldError(`資料連線失敗: ${err.message}`);
          setGoldPrice(2880); setGoldHistory([{date:'-', price: 2880, label: '-'}]);
      } finally { setGoldLoading(false); }
  }, []);

  // --- 本機設備自動備份邏輯 ---
  useEffect(() => {
      if (!profile?.coupleId || loadingAuth) return;
      // 不要備份剛載入時的空資料
      if (books.length === 0 && transactions.length === 0 && jars.length === 0) return;

      const timer = setTimeout(() => {
          const backupData = {
              timestamp: new Date().toISOString(),
              version: 1,
              data: {
                  books,
                  transactions,
                  savings_jars: jars,
                  gold_transactions: goldTransactions
              }
          };

          try {
              localStorage.setItem(`auto_backup_${profile.coupleId}`, JSON.stringify(backupData));
              setAutoBackupTime(backupData.timestamp);
          } catch (e) {
              console.error("Auto backup failed", e);
          }
      }, AUTO_BACKUP_DEBOUNCE_MS);
      return () => clearTimeout(timer);
  }, [books, transactions, jars, goldTransactions, profile?.coupleId, loadingAuth]);

  useEffect(() => {
      if (profile?.coupleId) {
          try {
              const stored = localStorage.getItem(`auto_backup_${profile.coupleId}`);
              if (stored) {
                  const parsed = JSON.parse(stored);
                  setAutoBackupTime(parsed.timestamp);
              }
          } catch { /* 備份檔壞掉就當作沒有 */ }
      }
  }, [profile?.coupleId]);

  // 還原＝把資料回到備份當下的樣子。原本只做 set 覆蓋、不刪多的，
  // 備份之後才新增的紀錄會殘留下來，看起來像還原失敗。
  // 匯入檔案與本機自動備份兩條路徑共用這一份，避免只修好其中一邊。
  const restoreBackup = async (backup) => {
      const cid = profile.coupleId;
      let batch = writeBatch(db);
      let count = 0;
      const flush = async () => { if (count > 0) { await batch.commit(); batch = writeBatch(db); count = 0; } };
      const stage = async (op) => { op(); count++; if (count >= 400) await flush(); };

      for (const col of BACKUP_COLLECTIONS) {
          const incoming = backup.data?.[col];
          if (!incoming) continue; // 備份裡沒有這個集合就整個跳過，不要當成「全部刪掉」

          const keep = new Set(incoming.map(i => i.id));
          const existing = await getDocs(coupleCol(col, cid));
          for (const d of existing.docs) {
              if (!keep.has(d.id)) await stage(() => batch.delete(d.ref));
          }
          for (const item of incoming) {
              const { id, ...docData } = item;
              await stage(() => batch.set(coupleDoc(col, cid, id), docData));
          }
      }
      await flush();
  };

  const handleRestoreAutoBackup = () => {
      if (!profile?.coupleId) return;
      const stored = localStorage.getItem(`auto_backup_${profile.coupleId}`);
      if (!stored) {
          showToast('找不到自動備份檔 ❌');
          return;
      }
      try {
          const backup = JSON.parse(stored);
          const backupDate = new Date(backup.timestamp).toLocaleString('zh-TW');
          
          setConfirmModal({
              isOpen: true,
              title: "⚠️ 警告：還原本機自動備份",
              message: `系統找到了這台裝置在 ${backupDate} 自動儲存的備份。確定要用它來覆蓋目前的雲端資料嗎？備份之後才新增的紀錄會被刪除。`,
              isDanger: true,
              onConfirm: async () => {
                  setConfirmModal({ isOpen: false });
                  showToast('正在從裝置還原資料... ⏳');
                  try {
                      await restoreBackup(backup);
                      showToast('自動備份還原成功！🎉');
                  } catch (err) {
                      console.error(err);
                      showToast('還原過程發生錯誤 ❌');
                  }
              }
          });
      } catch {
          showToast('讀取自動備份失敗 ❌');
      }
  };
  // -----------------------------

  useEffect(() => {
      if (activeTab === 'gold') fetchGoldPrice({ force: false });
  }, [activeTab, fetchGoldPrice]);

  useEffect(() => {
    if (!user?.uid || !profile?.coupleId) return;
    const cid = profile.coupleId;

    try {
        const transRef = coupleCol('transactions', cid);
        const jarsRef = coupleCol('savings_jars', cid);
        const booksRef = coupleCol('books', cid);
        const goldRef = coupleCol('gold_transactions', cid);
        const eventsRef = coupleCol('events', cid);
        const annRef = coupleCol('anniversaries', cid);
        
        const unsubBooks = onSnapshot(booksRef, async (s) => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
            // 開了離線快取之後，第一次快照可能是「本機快取還沒有資料」的空結果（fromCache），
            // 那不代表雲端真的沒有帳本；只有伺服器確認是空的才自動建第一本，否則會多出重複的帳本。
            if (data.length === 0 && !s.metadata.hasPendingWrites && !s.metadata.fromCache) {
               await addDoc(booksRef, { name: "我們的第一本帳", status: 'active', createdAt: serverTimestamp() });
               return; 
            }
            if (data.length === 0) return;
            setBooks(data);
            setActiveBookId(prev => {
                if (prev && data.find(b => b.id === prev)) return prev;
                const firstActive = data.find(b => (b.status || 'active') === 'active');
                return firstActive ? firstActive.id : data[0]?.id;
            });
        }, (e) => console.error(e));

        const unsubTrans = onSnapshot(transRef, (s) => {
          const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
          data.sort((a, b) => {
            const dateA = new Date(a.date).getTime(); const dateB = new Date(b.date).getTime();
            if (dateB !== dateA) return dateB - dateA;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
          setTransactions(data);
        }, (e) => console.error(e));

        const unsubJars = onSnapshot(jarsRef, (s) => setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))), (e) => console.error(e));
        
        const unsubGold = onSnapshot(goldRef, (s) => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setGoldTransactions(data);
        }, (e) => console.error(e));

        // 日曆：行程與紀念日（跟帳本無關，兩個人共用）
        const unsubEvents = onSnapshot(eventsRef, (s) => {
            setEvents(s.docs.map(d => normalizeEvent({ id: d.id, ...d.data() })).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
        }, (e) => console.error(e));
        const unsubAnn = onSnapshot(annRef, (s) => {
            setAnniversaries(s.docs.map(d => normalizeAnniversary({ id: d.id, ...d.data() })).filter(a => a.date));
        }, (e) => console.error(e));

        return () => { unsubTrans(); unsubJars(); unsubBooks(); unsubGold(); unsubEvents(); unsubAnn(); };
    } catch (e) { console.error(e); }
    // 只看 uid 與 coupleId：profile 每次快照都是新物件，原本依賴整個 profile
    // 會讓四個集合的監聽全部退訂再重訂一次（重新下載全部資料）。
  }, [user?.uid, profile?.coupleId]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      const defaultBookId = books[0]?.id;
      return transactions.filter(t => t.bookId ? t.bookId === activeBookId : activeBookId === defaultBookId);
  }, [transactions, activeBookId, books]);

  // 常用項目看所有帳本的紀錄，資料比較多、比較準
  const quickPicks = useMemo(() => getQuickPicks(transactions), [transactions]);

  const displayBooks = useMemo(() => books.filter(b => (b.status || 'active') === (viewArchived ? 'archived' : 'active')), [books, viewArchived]);

  // 連續跳兩個 toast 時，第一個的計時器不能把第二個提早關掉
  const toastTimer = useRef(null);
  const showToast = (msg) => {
      clearTimeout(toastTimer.current);
      setToast(msg);
      toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // 登入完成後才預先抓其他分頁的程式碼，不跟首屏搶頻寬
  const isReady = !!(user && profile);
  useEffect(() => { if (isReady) prefetchLazyChunks(); }, [isReady]);

  // 加到主畫面後，手機狀態列跟標題列同色（男友藍／女友粉，跟著主題變）
  const profileRole = profile?.role;
  useEffect(() => {
      if (!profileRole) return;
      const color = getComputedStyle(document.documentElement)
          .getPropertyValue(profileRole === 'bf' ? '--c-blue-600' : '--c-pink-500').trim();
      if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [profileRole, theme]);

  const copyCode = async () => {
      try {
          await navigator.clipboard.writeText(profile.coupleId);
      } catch {
          // 非 HTTPS 或舊瀏覽器沒有 Clipboard API，退回舊做法
          const el = document.getElementById('pairing-code-input');
          el.select();
          document.execCommand('copy');
      }
      showToast('配對碼已複製 📋');
  };

  // 開了離線快取後，addDoc / updateDoc 的 promise 要等「伺服器確認」才 resolve；
  // 沒訊號時會一直等下去，但資料其實已經寫進本機、畫面也已經更新了。
  // 記帳這種操作不該卡在那裡轉圈圈，所以不等伺服器，失敗時再用 toast 通知。
  const commitInBackground = (promise, failMsg) => {
      promise.catch((e) => { console.error(e); showToast(failMsg); });
  };
  const savedToast = (msg) => showToast(navigator.onLine ? msg : '已先存在這台裝置，連上網路後會自動同步 📶');

  const handleSaveTransaction = (data) => {
    if (!user || !profile) return;
    try {
      const finalAmount = Number(safeCalculate(data.amount));
      const cleanData = { ...data, amount: finalAmount, bookId: activeBookId };
      // 要判斷的是「有沒有既有的那筆文件」，不是 editingTransaction 有沒有值。
      // 收據掃描與語音記帳會把「預先填好的資料」放進 editingTransaction，那種物件沒有 id，
      // 只看真假值會走進 updateDoc(…, undefined)，doc() 直接丟 TypeError 然後被 catch 吞掉。
      if (editingTransaction?.id) {
        commitInBackground(updateDoc(coupleDoc('transactions', profile.coupleId, editingTransaction.id), { ...cleanData, updatedAt: serverTimestamp() }), '更新沒有存到雲端，請再試一次 ❌');
        savedToast('紀錄已更新 ✨');
      } else if (payingReservation) {
        // 預留款付掉了：新增這筆支出、同時解除預留，用同一個 batch 確保兩件事一起成功或一起失敗
        const batch = writeBatch(db);
        batch.set(doc(coupleCol('transactions', profile.coupleId)), { ...cleanData, bookId: payingReservation.bookId, createdAt: serverTimestamp() });
        batch.update(coupleDoc('books', profile.coupleId, payingReservation.bookId), { [`reservations.${payingReservation.id}`]: deleteField() });
        commitInBackground(batch.commit(), '紀錄沒有存到雲端，請再試一次 ❌');
        savedToast('已記帳，預留款已解除 🔓');
      } else {
        commitInBackground(addDoc(coupleCol('transactions', profile.coupleId), { ...cleanData, createdAt: serverTimestamp() }), '紀錄沒有存到雲端，請再試一次 ❌');
        savedToast('紀錄已新增 🎉');
      }
      setShowAddTransaction(false); setEditingTransaction(null); setRepaymentDebt(null); setPayingReservation(null);
    } catch (e) { console.error(e); showToast('存檔失敗，請再試一次 ❌'); }
  };

  // 收據「每項各記一筆」：一次寫入多筆，用 batch 確保要嘛全部成功、要嘛全部沒寫
  // ── 日曆：行程與紀念日 ──
  // 跟記帳一樣不等伺服器確認（離線也能新增），失敗才跳 toast
  const handleSaveEvent = (id, data) => {
      if (!profile) return;
      if (id) commitInBackground(updateDoc(coupleDoc('events', profile.coupleId, id), { ...data, updatedAt: serverTimestamp() }), '行程沒有存到雲端，請再試一次 ❌');
      else commitInBackground(addDoc(coupleCol('events', profile.coupleId), { ...data, exceptions: [], createdBy: profile.role, createdAt: serverTimestamp() }), '行程沒有存到雲端，請再試一次 ❌');
      savedToast(id ? '行程已更新 ✨' : '行程已新增 📅');
  };
  const handleDeleteEvent = (id, done) => {
      setConfirmModal({ isOpen: true, title: '刪除行程', message: '確定要刪除這個行程嗎？重複的行程會整個刪掉。', isDanger: true,
          onConfirm: () => {
              commitInBackground(deleteDoc(coupleDoc('events', profile.coupleId, id)), '刪除沒有同步到雲端，請再試一次 ❌');
              savedToast('行程已刪除 🗑️'); setConfirmModal({ isOpen: false }); done?.();
          }
      });
  };
  // 重複行程只刪某一天：記在 exceptions，arrayUnion 兩人同時操作也不會互相覆蓋
  const handleSkipEventDay = (id, date, done) => {
      commitInBackground(updateDoc(coupleDoc('events', profile.coupleId, id), { exceptions: arrayUnion(date) }), '刪除沒有同步到雲端，請再試一次 ❌');
      savedToast('這天的行程已刪除 🗑️'); done?.();
  };
  const handleSaveAnniversary = (id, data) => {
      if (!profile) return;
      if (id) commitInBackground(updateDoc(coupleDoc('anniversaries', profile.coupleId, id), { ...data, updatedAt: serverTimestamp() }), '紀念日沒有存到雲端，請再試一次 ❌');
      else commitInBackground(addDoc(coupleCol('anniversaries', profile.coupleId), { ...data, createdAt: Date.now() }), '紀念日沒有存到雲端，請再試一次 ❌');
      savedToast(id ? '紀念日已更新 ✨' : '紀念日已新增 💕');
  };
  const handleDeleteAnniversary = (id, done) => {
      setConfirmModal({ isOpen: true, title: '刪除紀念日', message: '確定要刪除這個紀念日嗎？', isDanger: true,
          onConfirm: () => {
              commitInBackground(deleteDoc(coupleDoc('anniversaries', profile.coupleId, id)), '刪除沒有同步到雲端，請再試一次 ❌');
              savedToast('紀念日已刪除 🗑️'); setConfirmModal({ isOpen: false }); done?.();
          }
      });
  };

  const handleSaveMany = (entries) => {
    if (!user || !profile || entries.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const entry of entries) {
        batch.set(doc(coupleCol('transactions', profile.coupleId)), { ...entry, amount: Number(entry.amount) || 0, bookId: activeBookId, createdAt: serverTimestamp() });
      }
      commitInBackground(batch.commit(), '紀錄沒有存到雲端，請再試一次 ❌');
      savedToast(`已記下 ${entries.length} 筆 🎉`);
      setShowScanner(false);
    } catch (e) { console.error(e); showToast('存檔失敗，請再試一次 ❌'); }
  };

  const handleSaveGold = async (data) => {
      if(!user || !profile) return;
      try {
          const payload = { ...data, weight: Number(data.weight), totalCost: Number(data.totalCost) };
          if (editingGold) {
              // createdAt 不能放進 payload：這個 payload 建立與編輯共用，帶著它會把建立時間洗掉
              await updateDoc(coupleDoc('gold_transactions', profile.coupleId, editingGold.id), { ...payload, updatedAt: serverTimestamp() });
              showToast('黃金紀錄已更新 ✨');
          } else {
              await addDoc(coupleCol('gold_transactions', profile.coupleId), { ...payload, createdAt: serverTimestamp() });
              showToast('黃金已入庫 💰');
          }
          setShowAddGold(false); setEditingGold(null);
      } catch(e) { console.error(e); }
  };

  const handleDeleteTransaction = (id) => {
    setConfirmModal({ isOpen: true, title: "刪除紀錄", message: "確定要刪除這筆紀錄嗎？", isDanger: true,
      onConfirm: async () => {
        await deleteDoc(coupleDoc('transactions', profile.coupleId, id));
        showToast('已刪除 🗑️'); setConfirmModal({ isOpen: false });
      }
    });
  };
  
  const handleDeleteGold = (id) => {
      setConfirmModal({ isOpen: true, title: "刪除黃金紀錄", message: "確定要刪除這筆紀錄嗎？", isDanger: true,
          onConfirm: async () => {
              await deleteDoc(coupleDoc('gold_transactions', profile.coupleId, id));
              showToast('已刪除 🗑️'); setConfirmModal({ isOpen: false });
          }
      });
  };

  const handleSaveJar = async (name, target, owner) => {
    if (!user || !profile) return;
    try {
      const finalTarget = Number(safeCalculate(target));
      if (editingJar) {
         const updateData = { name, targetAmount: finalTarget, updatedAt: serverTimestamp() };
         if (owner) updateData.owner = owner;
         await updateDoc(coupleDoc('savings_jars', profile.coupleId, editingJar.id), updateData);
         showToast('存錢罐已更新 ✨');
      } else {
        await addDoc(coupleCol('savings_jars', profile.coupleId), { name, targetAmount: finalTarget, currentAmount: 0, contributions: { bf: 0, gf: 0 }, history: [], owner: owner || 'shared', createdAt: serverTimestamp() });
        showToast('存錢罐已建立 🎯');
      }
      setShowAddJar(false); setEditingJar(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteJar = (id) => {
    setConfirmModal({ isOpen: true, title: "刪除目標", message: "確定要打破這個存錢罐嗎？", isDanger: true,
      onConfirm: async () => {
        await deleteDoc(coupleDoc('savings_jars', profile.coupleId, id));
        showToast('已刪除 🗑️'); setConfirmModal({ isOpen: false });
      }
    });
  };

  // 存錢罐的 currentAmount / contributions / history 是互相對應的三個欄位，
  // 原本三個 handler 都是「拿 onSnapshot 的本機快照 → 算 → 整包寫回」。
  // 兩個人同時操作同一個罐子，後寫的會把先寫的整個蓋掉。
  // 這裡統一在 transaction 裡「重新讀一次再算」，欄位形狀完全不變。
  const mutateJar = async (jarId, mutate) => {
    if (!profile) return;
    const ref = coupleDoc('savings_jars', profile.coupleId, jarId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('存錢罐不存在');
      tx.update(ref, mutate(snap.data()));
    });
  };

  const depositToJar = async (jarId, amount, contributorRole) => {
    if (!profile) return;
    try {
      const depositAmount = Number(safeCalculate(amount));
      const newHistoryItem = { id: Date.now().toString() + Math.random().toString(36).slice(2, 11), amount: depositAmount, role: contributorRole, date: new Date().toISOString() };
      await mutateJar(jarId, (jar) => {
        const newContrib = { ...jar.contributions };
        if (contributorRole === 'both') { const half = depositAmount / 2; newContrib.bf = (newContrib.bf || 0) + half; newContrib.gf = (newContrib.gf || 0) + half; } else { newContrib[contributorRole] = (newContrib[contributorRole] || 0) + depositAmount; }
        return { currentAmount: (jar.currentAmount || 0) + depositAmount, contributions: newContrib, history: [newHistoryItem, ...(jar.history || [])] };
      });
      setShowJarDeposit(null); showToast(`已存入 $${depositAmount} 💰`);
    } catch (e) { console.error(e); }
  };

  const handleUpdateJarHistoryItem = async (jar, oldItem, newAmount) => {
    try {
        const diff = Number(newAmount) - oldItem.amount;
        await mutateJar(jar.id, (fresh) => {
            const newContrib = { ...fresh.contributions };
            if (oldItem.role === 'both') { const halfDiff = diff / 2; newContrib.bf = (newContrib.bf || 0) + halfDiff; newContrib.gf = (newContrib.gf || 0) + halfDiff; } else { newContrib[oldItem.role] = (newContrib[oldItem.role] || 0) + diff; }
            const newHistory = (fresh.history || []).map(item => item.id === oldItem.id ? { ...item, amount: Number(newAmount) } : item);
            return { currentAmount: (fresh.currentAmount || 0) + diff, contributions: newContrib, history: newHistory };
        });
        showToast('紀錄已修正 ✨');
    } catch(e) { console.error(e); }
  };

  const handleDeleteJarHistoryItem = async (jar, item) => {
    setConfirmModal({ isOpen: true, title: "刪除存錢紀錄", message: "確定要刪除這筆存款嗎？", isDanger: true,
        onConfirm: async () => {
            try {
                await mutateJar(jar.id, (fresh) => {
                    const newContrib = { ...fresh.contributions };
                    if (item.role === 'both') { const half = item.amount / 2; newContrib.bf = Math.max(0, (newContrib.bf || 0) - half); newContrib.gf = Math.max(0, (newContrib.gf || 0) - half); } else { newContrib[item.role] = Math.max(0, (newContrib[item.role] || 0) - item.amount); }
                    const newHistory = (fresh.history || []).filter(h => h.id !== item.id);
                    return { currentAmount: (fresh.currentAmount || 0) - item.amount, contributions: newContrib, history: newHistory };
                });
                showToast('紀錄已刪除 🗑️'); setConfirmModal(prev => ({ ...prev, isOpen: false }));
            } catch(e) { console.error(e); }
        }
    });
  };

  const handleCompleteJar = async (jar) => {
    setConfirmModal({ isOpen: true, title: "恭喜達成目標！🎉", message: `確定要將「${jar.name}」標記為已完成嗎？這將會把它移至榮譽殿堂。`, isDanger: false, 
        onConfirm: async () => {
            try { await updateDoc(coupleDoc('savings_jars', profile.coupleId, jar.id), { status: 'completed', completedAt: serverTimestamp() }); showToast('目標達成！太棒了 🏆'); setConfirmModal({ isOpen: false }); } catch (e) { console.error(e); }
        }
    });
  };

  // budget 是 normalizeBudget 過的 { total, categories }；帳本文件只多一個選填欄位
  const handleSaveBook = async (name, status = 'active', budget) => {
      if(!user || !profile || !name.trim()) return;
      const budgetField = budget ? { budget } : {};
      try {
          if(editingBook) {
              commitInBackground(updateDoc(coupleDoc('books', profile.coupleId, editingBook.id), { name, status, ...budgetField, updatedAt: serverTimestamp() }), '帳本沒有存到雲端，請再試一次 ❌');
              savedToast('帳本已更新 ✨');
          } else {
              // 先在本機產生文件 id，離線時也能馬上切換到新帳本，不用等伺服器回應
              const docRef = doc(coupleCol('books', profile.coupleId));
              commitInBackground(setDoc(docRef, { name, status, ...budgetField, createdAt: serverTimestamp() }), '帳本沒有存到雲端，請再試一次 ❌');
              setActiveBookId(docRef.id); savedToast('新帳本已建立 📘');
          }
          setShowBookManager(false); setEditingBook(null);
      } catch(e) { console.error(e); }
  };

  const handleDeleteBook = async (bookId) => {
      if(books.filter(b => (b.status||'active') === 'active').length <= 1 && editingBook?.status !== 'archived') { showToast('至少需要保留一個使用中的帳本 ⚠️'); return; }
      setConfirmModal({ isOpen: true, title: "刪除帳本", message: "確定要永久刪除這個帳本嗎？裡面的記帳紀錄也會一併刪除！(無法復原)", isDanger: true,
        onConfirm: async () => {
            try {
                await deleteDoc(coupleDoc('books', profile.coupleId, bookId));
                const q = query(coupleCol('transactions', profile.coupleId), where("bookId", "==", bookId));
                const snap = await getDocs(q);
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                if(activeBookId === bookId) { const remaining = books.filter(b => b.id !== bookId && (b.status||'active') === 'active'); if(remaining.length > 0) setActiveBookId(remaining[0].id); }
                showToast('帳本已刪除 🗑️'); setConfirmModal(prev => ({ ...prev, isOpen: false }));
            } catch(e) { console.error(e); }
        }
      });
  };

  // 收據掃描與語音記帳都走這裡：解析結果只是「預先填好」，一定要經過確認畫面才會存檔。
  // 注意這個物件沒有 id —— handleSaveTransaction 是靠 editingTransaction?.id 判斷新增或編輯的。
  const handlePrefillTransaction = (parsed) => {
    setPayingReservation(null);
    setEditingTransaction({
      amount: parsed.amount,
      note: parsed.note,
      category: parsed.category,
      date: parsed.date || new Date().toLocaleDateString('en-CA'),
      ...(parsed.paidBy ? { paidBy: parsed.paidBy } : {}),
      ...(parsed.splitType ? { splitType: parsed.splitType } : {}),
    });
    setShowScanner(false);
    setShowVoice(false);
    setShowAddTransaction(true);
  };

  const handleExportBackup = async () => {
      showToast('正在準備備份檔... ⏳');
      try {
          const cid = profile.coupleId;
          const backup = { timestamp: new Date().toISOString(), version: 1, data: {} };
          for (const col of BACKUP_COLLECTIONS) {
              const snap = await getDocs(coupleCol(col, cid));
              backup.data[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
          
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `小金庫備份_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('備份下載完成！📦');
      } catch (error) {
          console.error("Export error", error);
          showToast('備份失敗 ❌');
      }
  };

  const handleImportBackup = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const backup = JSON.parse(e.target.result);
              if (!backup.data || !backup.timestamp) throw new Error("格式錯誤");
              
              const backupDate = new Date(backup.timestamp).toLocaleString('zh-TW');
              
              setConfirmModal({
                  isOpen: true,
                  title: "⚠️ 警告：還原備份資料",
                  message: `您即將還原備份檔（建立於：${backupDate}）。這將會覆蓋您與另一半目前的記帳資料，備份之後才新增的紀錄會被刪除，確定要還原嗎？`,
                  isDanger: true,
                  onConfirm: async () => {
                      setConfirmModal({ isOpen: false });
                      showToast('正在還原資料，請稍候... ⏳');
                      try {
                          await restoreBackup(backup);
                          showToast('資料還原成功！🎉');
                          event.target.value = ''; 
                      } catch (err) {
                          console.error(err);
                          showToast('還原過程發生錯誤 ❌');
                      }
                  }
              });
          } catch (error) {
              console.error("Import error", error);
              showToast('讀取失敗：檔案格式不正確 ❌');
          }
      };
      reader.readAsText(file);
  };

  if (loadingAuth) return <AppLoading />;
  
  if (!user || !profile) {
      return <AuthAndPairing 
                user={user} 
                onGoogleLogin={async () => {
                    try { await signInWithPopup(auth, googleProvider); } catch(err) { console.error(err); }
                }} 
                onComplete={(p) => setProfile(p)}
             />;
  }

  const role = profile.role;
  const activeBook = books.find(b => b.id === activeBookId);
  const today = new Date().toLocaleDateString('en-CA');
  const reservations = normalizeReservations(activeBook?.reservations);
  const reservedThisMonth = reservedForMonth(reservations, monthKeyOf(new Date()));

  // 預留款存在帳本文件的 reservations.<id>，用欄位路徑更新：兩人同時改不同筆不會互相覆蓋，離線也能寫
  const handleSaveReservation = (data) => {
      if (!activeBookId) return;
      const id = editingReservation?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const value = { ...data, createdAt: editingReservation?.createdAt || Date.now() };
      commitInBackground(updateDoc(coupleDoc('books', profile.coupleId, activeBookId), { [`reservations.${id}`]: value }), '預留款沒有存到雲端，請再試一次 ❌');
      savedToast(editingReservation ? '預留款已更新 ✨' : '已預留這筆錢 🔒');
      setShowReservation(false); setEditingReservation(null);
  };
  const handleDeleteReservation = (id) => {
      setConfirmModal({ isOpen: true, title: '取消預留', message: '確定不買了、取消這筆預留款嗎？（不會記成支出）', isDanger: true,
          onConfirm: () => {
              commitInBackground(updateDoc(coupleDoc('books', profile.coupleId, activeBookId), { [`reservations.${id}`]: deleteField() }), '沒有存到雲端，請再試一次 ❌');
              savedToast('已取消預留 🗑️');
              setConfirmModal({ isOpen: false }); setShowReservation(false); setEditingReservation(null);
          }
      });
  };
  // 「付款了」：帶著預留款的內容打開記一筆，存檔時才解除預留（取消就什麼都不變）
  const handlePayReservation = (r) => {
      setPayingReservation({ id: r.id, bookId: activeBookId });
      setEditingTransaction(toTransactionPrefill(r, role, today));
      setShowAddTransaction(true);
  };
  // 罐子在別的裝置被刪掉時 find 會拿到 undefined，這時就不要再開著紀錄視窗
  const showJarHistoryJar = showJarHistory ? jars.find(j => j.id === showJarHistory) : null;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24">
      <div className={`p-4 text-surface shadow-lg sticky top-0 z-40 transition-colors ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="bg-surface/20 p-2 rounded-full backdrop-blur-md"><Heart className="fill-surface animate-pulse" size={18} /></div>
            <h1 className="text-lg font-bold tracking-wide">我們的小金庫</h1>
          </div>
          <div className="flex items-center gap-3">
              {activeTab === 'overview' && (
                  <button onClick={() => setViewArchived(!viewArchived)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${viewArchived ? 'bg-surface text-gray-800 border-surface' : 'bg-transparent text-surface/80 border-surface/30'}`}>
                      {viewArchived ? <Archive size={12}/> : <Book size={12}/>}{viewArchived ? '歷史' : '使用中'}
                  </button>
              )}
              <div className="text-xs bg-black/10 px-3 py-1 rounded-full">{role === 'bf' ? '👦 男朋友' : '👧 女朋友'}</div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {activeTab === 'overview' && (
             <div className="mb-4">
                 {viewArchived && <div className="text-xs text-gray-400 mb-2 font-bold flex items-center gap-1"><Archive size={12}/> 歷史封存區 (唯讀模式)</div>}
                 <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
                     {displayBooks.map(book => (
                         <button key={book.id} onClick={() => setActiveBookId(book.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-xs ${activeBookId === book.id ? 'bg-gray-800 text-surface' : 'bg-surface text-gray-500 hover:bg-gray-100'}`}>
                             <Book size={14} />{book.name}
                             {activeBookId === book.id && (<div onClick={(e) => { e.stopPropagation(); setEditingBook(book); setShowBookManager(true); }} className="ml-1 p-1 rounded-full hover:bg-surface/20"><Settings size={12} /></div>)}
                         </button>
                     ))}
                     {!viewArchived && (<button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2 bg-surface text-gray-400 rounded-xl shadow-xs hover:bg-gray-50"><Plus size={18} /></button>)}
                     {displayBooks.length === 0 && <div className="text-gray-400 text-sm italic py-2">沒有{viewArchived ? '封存' : '使用中'}的帳本</div>}
                 </div>
             </div>
        )}
        
        {activeTab === 'overview' && (
            <Overview transactions={filteredTransactions} budget={activeBook?.budget} reservations={reservations} reservedThisMonth={reservedThisMonth} today={today} onAddReservation={() => { setEditingReservation(null); setShowReservation(true); }} onEditReservation={(r) => { setEditingReservation(r); setShowReservation(true); }} onPayReservation={handlePayReservation} onEditBudget={() => { setEditingBook(activeBook); setShowBookManager(true); }} role={role} readOnly={viewArchived} onAdd={() => { setEditingTransaction(null); setPayingReservation(null); setShowAddTransaction(true); }} onScan={() => setShowScanner(true)} onVoice={() => setShowVoice(true)} onEdit={(t) => { if(viewArchived) return; setPayingReservation(null); setEditingTransaction(t); setShowAddTransaction(true); }} onDelete={(id) => { if(viewArchived) return; handleDeleteTransaction(id); }} onRepay={(debt) => { setEditingTransaction(null); setPayingReservation(null); setRepaymentDebt(debt); }} />
        )}

        {/* key=activeTab：某個分頁壞掉時，切到別的分頁就會重來，底部導覽列也還能用 */}
        <ErrorBoundary key={activeTab} compact>
        <Suspense fallback={<TabFallback />}>
        {activeTab === 'calendar' && (
            <CalendarView events={events} anniversaries={anniversaries} transactions={filteredTransactions} bookName={activeBook?.name} role={role}
              onSaveEvent={handleSaveEvent} onDeleteEvent={handleDeleteEvent} onSkipEventDay={handleSkipEventDay}
              onSaveAnniversary={handleSaveAnniversary} onDeleteAnniversary={handleDeleteAnniversary} />
        )}
        {activeTab === 'stats' && (
            <div><div className="bg-surface px-4 py-2 rounded-xl shadow-xs mb-4 inline-flex items-center gap-2 text-sm font-bold text-gray-600"><Book size={14}/> 統計範圍: {activeBook?.name || '未知帳本'}</div><Statistics transactions={filteredTransactions} budget={activeBook?.budget} /></div>
        )}
        {activeTab === 'savings' && (
            <Savings jars={jars} role={role} onAdd={() => { setEditingJar(null); setShowAddJar(true); }} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onDelete={handleDeleteJar} onHistory={(j) => setShowJarHistory(j.id)} onOpenRoulette={() => setShowRoulette(true)} onComplete={handleCompleteJar} />
        )}
        {activeTab === 'gold' && (
            <GoldView transactions={goldTransactions} goldPrice={goldPrice} history={goldHistory} period={goldPeriod} setPeriod={setGoldPeriod} role={role} onAdd={() => { setEditingGold(null); setShowAddGold(true); }} onEdit={(t) => { setEditingGold(t); setShowAddGold(true); }} onDelete={handleDeleteGold} loading={goldLoading} error={goldError} onRefresh={() => fetchGoldPrice()} intraday={goldIntraday} />
        )}
        {activeTab === 'settings' && (
            <SettingsView role={role} coupleId={profile.coupleId} onCopyCode={copyCode} onLogout={() => { signOut(auth); }} onExport={handleExportBackup} onImport={handleImportBackup} autoBackupTime={autoBackupTime} onRestoreAutoBackup={handleRestoreAutoBackup} theme={theme} onThemeChange={setTheme} />
        )}
        </Suspense>
        </ErrorBoundary>
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-surface border-t border-gray-200 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={CalendarDays} label="日曆" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} role={role} />
          <NavBtn icon={ChartPie} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Coins} label="黃金" active={activeTab === 'gold'} onClick={() => setActiveTab('gold')} role={role} />
          <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
        </div>
      </div>

      {toast && <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-surface px-6 py-3 rounded-full shadow-xl z-[100] flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]"><CheckCircle size={18} className="text-green-400" /><span className="text-sm font-medium">{toast}</span></div>}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-xs animate-[fadeIn_0.2s]" onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(prev => ({ ...prev, isOpen: false })); }}>
          <div className="bg-surface w-full max-w-xs rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3><p className="text-gray-500 text-sm mb-6">{confirmModal.message}</p>
            <div className="flex gap-3"><button onClick={() => setConfirmModal({ isOpen: false })} className="flex-1 py-3 bg-gray-100 rounded-xl text-sm font-bold text-gray-600">取消</button><button onClick={confirmModal.onConfirm} className={`flex-1 py-3 rounded-xl text-sm font-bold text-surface ${confirmModal.isDanger ? 'bg-red-500' : 'bg-blue-500'}`}>確定</button></div>
          </div>
        </div>
      )}

      {showAddTransaction && <AddTransactionModal onClose={() => { setShowAddTransaction(false); setEditingTransaction(null); setPayingReservation(null); }} onSave={handleSaveTransaction} currentUserRole={role} initialData={editingTransaction} quickPicks={quickPicks} />}
      <Suspense fallback={null}>
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={handleSaveJar} initialData={editingJar} role={role} />}
      {showJarDeposit && <DepositModal jar={jars.find(j => j.id === showJarDeposit)} onClose={() => setShowJarDeposit(null)} onConfirm={depositToJar} role={role} />}
      {showJarHistoryJar && <JarHistoryModal jar={showJarHistoryJar} onClose={() => setShowJarHistory(null)} onUpdateItem={handleUpdateJarHistoryItem} onDeleteItem={handleDeleteJarHistoryItem} />}
      {showScanner && <ReceiptScannerModal role={role} onClose={() => setShowScanner(false)} onConfirm={handlePrefillTransaction} onSaveMany={handleSaveMany} />}
      {showVoice && <VoiceEntryModal role={role} onClose={() => setShowVoice(false)} onConfirm={handlePrefillTransaction} />}
      {showAddGold && <AddGoldModal onClose={() => setShowAddGold(false)} onSave={handleSaveGold} initialData={editingGold} role={role} />}
      {showRoulette && <RouletteModal jars={jars} role={role} onClose={() => setShowRoulette(false)} onConfirm={depositToJar} />}
      {repaymentDebt !== null && <RepaymentModal debt={repaymentDebt} onClose={() => setRepaymentDebt(null)} onSave={handleSaveTransaction} />}
      {showReservation && <ReservationModal initialData={editingReservation} role={role} onClose={() => { setShowReservation(false); setEditingReservation(null); }} onSave={handleSaveReservation} onDelete={handleDeleteReservation} />}
      {showBookManager && <BookManagerModal onClose={() => setShowBookManager(false)} onSave={handleSaveBook} onDelete={handleDeleteBook} initialData={editingBook} />}
      </Suspense>
    </div>
  );
}
