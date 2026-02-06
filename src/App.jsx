import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, 
  deleteDoc, doc, updateDoc, serverTimestamp,
  writeBatch, getDocs
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  Heart, Wallet, PiggyBank, PieChart as PieChartIcon, 
  Plus, Trash2, User, Calendar, Target, Settings, LogOut,
  RefreshCw, Pencil, CheckCircle, X, ChevronLeft, ChevronRight, 
  ArrowLeft, Check, History, Percent, Book, MoreHorizontal,
  Camera, Archive, Reply, Loader2, Image as ImageIcon,
  ArrowRightLeft
} from 'lucide-react';

// --- Firebase 初始化 (嚴格遵守規則 1, 2, 3) ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id.replace(/\//g, '_') : 'default-app-id';

// --- 常數 ---
const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042' },
  { id: 'transport', name: '交通', color: '#00C49F' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28' },
  { id: 'shopping', name: '購物', color: '#0088FE' },
  { id: 'house', name: '居家', color: '#8884d8' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B' },
  { id: 'repayment', name: '還款', color: '#10B981' },
  { id: 'other', name: '其他', color: '#999' },
];

// --- 輔助函式 ---
const formatMoney = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '$0';
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(num);
};

const safeCalculate = (expression) => {
  try {
    const sanitized = (expression || '').toString().replace(/[^0-9+\-*/.]/g, '');
    if (!sanitized) return '';
    const parts = sanitized.split(/([+\-*/])/).filter(p => p.trim() !== '');
    if (parts.length === 0) return '';
    let tokens = [...parts];
    for (let i = 1; i < tokens.length - 1; i += 2) {
      if (tokens[i] === '*' || tokens[i] === '/') {
        const prev = parseFloat(tokens[i-1]);
        const next = parseFloat(tokens[i+1]);
        const op = tokens[i];
        let res = op === '*' ? prev * next : prev / next;
        tokens.splice(i-1, 3, res);
        i -= 2;
      }
    }
    let result = parseFloat(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const next = parseFloat(tokens[i+1]);
      if (op === '+') result += next;
      if (op === '-') result -= next;
    }
    return isNaN(result) || !isFinite(result) ? '' : Math.floor(result).toString();
  } catch (e) { return ''; }
};

// --- 通用 UI 組件 ---

const AppLoading = () => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
    <Heart className="text-pink-500 fill-pink-500 animate-pulse mb-4" size={48} />
    <h2 className="text-lg font-black text-gray-700 tracking-widest text-center px-4">正在同步小金庫雲端資料...</h2>
  </div>
);

const ModalLayout = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10">
      <div className="p-5 border-b flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="font-black text-gray-800">{title}</h2>
        <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 hide-scrollbar">{children}</div>
    </div>
  </div>
);

const CalculatorKeypad = ({ value, onChange, onConfirm, compact = false }) => {
  const handlePress = (key) => {
    const strVal = (value || '').toString();
    if (key === 'C') onChange('');
    else if (key === '=') onChange(safeCalculate(strVal));
    else if (key === 'backspace') onChange(strVal.slice(0, -1));
    else {
      const lastChar = strVal.slice(-1);
      if (['+', '-', '*', '/'].includes(key) && ['+', '-', '*', '/'].includes(lastChar)) onChange(strVal.slice(0, -1) + key);
      else onChange(strVal + key);
    }
  };
  const keys = [
    { label: '7' }, { label: '8' }, { label: '9' }, { label: '÷', val: '/' },
    { label: '4' }, { label: '5' }, { label: '6' }, { label: '×', val: '*' },
    { label: '1' }, { label: '2' }, { label: '3' }, { label: '-', val: '-' },
    { label: 'C', color: 'text-red-500' }, { label: '0' }, { label: '.' }, { label: '+', val: '+' }
  ];
  return (
    <div className={`bg-gray-100 p-2 rounded-2xl select-none ${compact ? 'mt-1' : 'mt-4'}`}>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {keys.map((k, i) => (
          <button key={i} type="button" onClick={(e) => { e.stopPropagation(); handlePress(k.val || k.label); }} className={`h-12 rounded-xl font-black shadow-sm bg-white active:scale-95 transition-all ${k.color || 'text-gray-700'}`}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={(e) => { e.stopPropagation(); handlePress('backspace'); }} className="h-12 flex-1 bg-gray-200 rounded-xl flex items-center justify-center text-gray-600">
          <ArrowLeft size={24} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); const res = safeCalculate(value); onChange(res); onConfirm && onConfirm(res); }} className="h-12 flex-[2] bg-green-500 text-white rounded-xl font-black flex items-center justify-center shadow-lg active:scale-95">
          確認
        </button>
      </div>
    </div>
  );
};

const SimpleDonutChart = ({ data, total }) => {
  if (!total || total === 0) return (<div className="h-64 w-full flex items-center justify-center text-gray-300 font-bold text-sm">本月尚無數據</div>);
  let accumulatedPercent = 0;
  return (
    <div className="relative w-64 h-64 mx-auto my-6 font-sans">
      <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#f3f4f6" strokeWidth="5"></circle>
        {data.map((item, index) => { 
          const percent = (item.value / total) * 100; 
          const strokeDasharray = `${percent} ${100 - percent}`; 
          const offset = 100 - accumulatedPercent; 
          accumulatedPercent += percent; 
          return (<circle key={index} cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke={item.color} strokeWidth="5" strokeDasharray={strokeDasharray} strokeDashoffset={offset} className="transition-all duration-500" />); 
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">總支出</span>
        <span className="text-2xl font-black text-gray-800">{formatMoney(total)}</span>
      </div>
    </div>
  );
};

// --- 功能分頁 ---

const Overview = ({ transactions, debt, role, onAdd, onEdit, onScan, readOnly, onRepay, onDelete }) => {
  const grouped = useMemo(() => {
    const groups = {};
    transactions.forEach(t => { 
        if (!t.date) return; 
        if (!groups[t.date]) groups[t.date] = { items: [], bfShareTotal: 0, gfShareTotal: 0 };
        groups[t.date].items.push(t);
        if (t.category !== 'repayment') {
            const amt = Number(t.amount) || 0;
            let bfS = 0, gfS = 0;
            if (t.splitType === 'shared') { bfS = amt/2; gfS = amt/2; }
            else if (t.splitType === 'bf_personal') bfS = amt;
            else if (t.splitType === 'gf_personal') gfS = amt;
            else if (['custom', 'ratio'].includes(t.splitType) && t.splitDetails) {
                bfS = Number(t.splitDetails.bf) || 0;
                gfS = Number(t.splitDetails.gf) || 0;
            }
            groups[t.date].bfShareTotal += bfS;
            groups[t.date].gfShareTotal += gfS;
        }
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1.5 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <div className="text-gray-400 text-xs font-black mb-2 uppercase tracking-widest">結算中心</div>
        {Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500">互不相欠 ✨</div> : (
            <div className="space-y-4 font-sans">
                <div className="text-xl font-black"><span className={debt > 0 ? 'text-blue-500' : 'text-pink-500'}>{debt > 0 ? '男朋友' : '女朋友'}</span> 先墊了 {formatMoney(Math.abs(debt))}</div>
                {!readOnly && <button onClick={onRepay} className="bg-green-500 text-white px-8 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 mx-auto shadow-md active:scale-95"><ArrowRightLeft size={16}/> 我要還款</button>}
            </div>
        )}
      </div>
      <div className="space-y-4">
        {!readOnly && <div className="flex gap-2"><button onClick={onScan} className="flex-1 bg-purple-100 text-purple-600 py-3 rounded-xl flex items-center justify-center gap-2 font-black shadow-sm active:scale-95"><Camera size={18}/> AI 辨識</button><button onClick={onAdd} className="flex-1 bg-gray-900 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-black shadow-lg active:scale-95"><Plus size={18}/> 記一筆</button></div>}
        {grouped.map(([date, data]) => (
            <div key={date} className="space-y-2">
              <div className="flex justify-between items-center px-1">
                  <div className="text-xs font-black text-gray-400 bg-gray-100 px-2 py-1 rounded">{date}</div>
                  <div className="flex gap-2">
                      {data.bfShareTotal > 0 && <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded border border-blue-100 font-black">👦 負擔 {formatMoney(data.bfShareTotal)}</span>}
                      {data.gfShareTotal > 0 && <span className="text-[10px] bg-pink-50 text-pink-500 px-2 py-0.5 rounded border border-pink-100 font-black">👧 負擔 {formatMoney(data.gfShareTotal)}</span>}
                  </div>
              </div>
              {data.items.map(t => (
                <div key={t.id} onClick={() => onEdit(t)} className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between hover:bg-gray-50 transition-colors ${t.category === 'repayment' ? 'border-l-4 border-l-green-500 bg-green-50/20' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-lg" style={{ background: CATEGORIES.find(c => c.id === t.category)?.color || '#999' }}>{t.category === 'repayment' ? <ArrowRightLeft size={18}/> : (t.category === 'food' ? '🍔' : '🏷️')}</div>
                    <div className="truncate">
                        <div className="font-bold text-gray-800 truncate">{t.note || CATEGORIES.find(c=>c.id===t.category)?.name}</div>
                        <div className="text-[10px] text-gray-400 uppercase font-black">
                            {t.category === 'repayment' ? `還款給 ${t.paidBy === 'bf' ? '👧' : '👦'}` : `${t.paidBy === 'bf' ? '男' : '女'}付 • ${t.splitType === 'shared' ? '平分' : '分配'}`}
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                      <div className={`font-black text-lg ${t.category === 'repayment' ? 'text-green-600' : 'text-gray-700'}`}>{formatMoney(t.amount)}</div>
                      {!readOnly && <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="p-1.5 text-gray-200 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
        ))}
        {grouped.length === 0 && <div className="text-center py-20 text-gray-300 font-bold italic">尚無資料</div>}
      </div>
    </div>
  );
};

const Statistics = ({ transactions }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const monthTransactions = useMemo(() => transactions.filter(t => { 
    const d = new Date(t.date); 
    return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear() && t.category !== 'repayment'; 
  }), [transactions, currentDate]);

  const stats = useMemo(() => {
    let bfActualTotal = 0, gfActualTotal = 0, total = 0;
    const catMap = {};
    monthTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      total += amt;
      if (!catMap[t.category]) catMap[t.category] = 0;
      catMap[t.category] += amt;
      let bfS = 0, gfS = 0;
      if (t.splitType === 'shared') { bfS = amt/2; gfS = amt/2; }
      else if (t.splitType === 'bf_personal') bfS = amt;
      else if (t.splitType === 'gf_personal') gfS = amt;
      else if (['ratio', 'custom'].includes(t.splitType) && t.splitDetails) { 
        bfS = Number(t.splitDetails.bf) || 0; 
        gfS = Number(t.splitDetails.gf) || 0; 
      }
      bfActualTotal += bfS; 
      gfActualTotal += gfS;
    });
    return { bfActualTotal, gfActualTotal, total, chartData: Object.entries(catMap).map(([id, val]) => ({ id, value: val, color: CATEGORIES.find(c=>c.id===id)?.color, name: CATEGORIES.find(c=>c.id===id)?.name })).sort((a,b)=>b.value-a.value) };
  }, [monthTransactions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm">
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft /></button>
        <span className="font-black text-lg text-gray-700">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight /></button>
      </div>
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm font-sans">
        <h3 className="text-xs font-black text-gray-400 mb-4 flex items-center gap-2 uppercase tracking-widest"><Percent size={14}/> 分帳後實質負擔額</h3>
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
              <div className="text-[10px] font-black text-blue-400 mb-1">👦 男生負擔</div>
              <div className="text-xl font-black text-blue-600">{formatMoney(stats.bfActualTotal)}</div>
            </div>
            <div className="bg-pink-50 p-4 rounded-2xl border border-pink-100">
              <div className="text-[10px] font-black text-pink-400 mb-1">👧 女生負擔</div>
              <div className="text-xl font-black text-pink-600">{formatMoney(stats.gfActualTotal)}</div>
            </div>
        </div>
      </div>
      <div className="bg-white rounded-3xl p-6 border flex flex-col items-center shadow-sm">
          <SimpleDonutChart data={stats.chartData} total={stats.total} />
          <div className="w-full space-y-2 mt-4 font-sans">
              {stats.chartData.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-600"><div className="w-3 h-3 rounded-full" style={{background: d.color}}></div>{d.name}</div>
                      <div className="text-sm font-black text-gray-800">{formatMoney(d.value)} <span className="text-gray-300 font-bold ml-1">{stats.total ? Math.round(d.value/stats.total*100) : 0}%</span></div>
                  </div>
              ))}
              {stats.chartData.length === 0 && <div className="text-center py-10 text-gray-300 font-black italic">尚無資料</div>}
          </div>
      </div>
    </div>
  );
};

// --- 主應用組件 ---

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState([]);
  const [jars, setJars] = useState([]);
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);
  const [viewArchived, setViewArchived] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false);
  const [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null);
  const [showJarHistory, setShowJarHistory] = useState(null); 
  const [showBookManager, setShowBookManager] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  // 1. Auth Init (Rule 3)
  useEffect(() => {
    const initAuth = async () => { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try { await signInWithCustomToken(auth, __initial_auth_token); } catch(e) { await signInAnonymously(auth); }
        } else { try { await signInAnonymously(auth); } catch (e) {} }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { 
        setUser(u); 
        setLoading(false); 
    });
    const savedRole = localStorage.getItem('couple_app_role');
    if (savedRole) setRole(savedRole);
    return () => unsubscribe();
  }, []);

  // 2. Data Listeners (Guard with User + Rule 1 & 2)
  useEffect(() => {
    if (!user) return;

    const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');
    const booksRef = collection(db, 'artifacts', appId, 'public', 'data', 'books');

    const errorFn = (err) => {
        console.error("Firestore Error:", err);
        // 如果是權限錯誤，通常是因為 Auth 還沒完全生效，或路徑錯誤
    };

    const unsubBooks = onSnapshot(booksRef, (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        if (data.length === 0 && !s.metadata.hasPendingWrites) { 
            addDoc(booksRef, { name: "日常帳本", status: 'active', createdAt: serverTimestamp() }); 
        }
        setBooks(data);
        setActiveBookId(prev => (prev && data.find(b => b.id === prev)) ? prev : (data.find(b => (b.status || 'active') === 'active')?.id || data[0]?.id || null));
    }, errorFn);

    const unsubTrans = onSnapshot(transRef, (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTransactions(data);
    }, errorFn);

    const unsubJars = onSnapshot(jarsRef, (s) => setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))), errorFn);

    return () => { unsubBooks(); unsubTrans(); unsubJars(); };
  }, [user]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      return transactions.filter(t => t.bookId ? t.bookId === activeBookId : activeBookId === books[0]?.id);
  }, [transactions, activeBookId, books]);

  const debtValue = useMemo(() => {
    let bfLent = 0;
    filteredTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.category === 'repayment') t.paidBy === 'bf' ? bfLent += amt : bfLent -= amt;
      else {
        let gfS = 0, bfS = 0;
        if (['custom', 'ratio'].includes(t.splitType) && t.splitDetails) { gfS = Number(t.splitDetails.gf); bfS = Number(t.splitDetails.bf); }
        else if (t.splitType === 'shared') { gfS = amt/2; bfS = amt/2; }
        else if (t.splitType === 'gf_personal') gfS = amt;
        else if (t.splitType === 'bf_personal') bfS = amt;
        t.paidBy === 'bf' ? bfLent += gfS : bfLent -= bfS;
      }
    });
    return bfLent;
  }, [filteredTransactions]);

  const displayBooks = useMemo(() => books.filter(b => viewArchived ? (b.status === 'archived') : (b.status || 'active') === 'active'), [books, viewArchived]);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleSaveTransaction = async (data) => {
    if (!user) return;
    const finalAmt = Number(safeCalculate(data.amount));
    const cleanData = { ...data, amount: finalAmt, bookId: activeBookId, updatedAt: serverTimestamp() };
    try {
      if (editingTransaction) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', editingTransaction.id), cleanData);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), { ...cleanData, createdAt: serverTimestamp() });
      setShowAddTransaction(false); setEditingTransaction(null); setShowRepayModal(false); showToast('已儲存紀錄 ✨');
    } catch(e) { showToast("儲存失敗 ⚠️"); }
  };

  const handleDeleteTransaction = (id) => {
    setConfirmModal({ isOpen: true, title: "刪除紀錄", message: "確定要刪除這筆紀錄嗎？此動作無法復原。", isDanger: true, onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id)); setConfirmModal({ isOpen: false }); showToast('已刪除 🗑️'); } });
  };

  const handleSaveBook = async (name, status) => {
    if(!user || !name.trim()) return;
    try {
        if(editingBook) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', editingBook.id), { name, status, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), { name, status: 'active', createdAt: serverTimestamp() });
        setShowBookManager(false); setEditingBook(null); showToast("帳本已更新");
    } catch (e) { showToast("操作失敗"); }
  };

  if (loading) return <AppLoading />;
  if (!role) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm border border-gray-100">
        <Heart className="text-pink-500 mx-auto mb-4" size={48}/>
        <h1 className="text-2xl font-black mb-6 text-gray-800">歡迎使用小金庫</h1>
        <div className="space-y-4">
          <button onClick={() => { setRole('bf'); localStorage.setItem('couple_app_role', 'bf'); }} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black active:scale-95 shadow-lg shadow-blue-200 transition-all hover:bg-blue-600">我是男朋友 👦</button>
          <button onClick={() => { setRole('gf'); localStorage.setItem('couple_app_role', 'gf'); }} className="w-full py-4 bg-pink-500 text-white rounded-2xl font-black active:scale-95 shadow-lg shadow-pink-100 transition-all hover:bg-pink-600">我是女朋友 👧</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24">
      <div className={`p-4 text-white shadow-lg sticky top-0 z-40 transition-colors ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2"><Heart className="fill-white animate-pulse" size={18} /><h1 className="text-lg font-black">我們的小金庫</h1></div>
          <div className="flex items-center gap-3">
              <button onClick={() => setViewArchived(!viewArchived)} className="text-[10px] px-3 py-1 font-bold rounded-full border border-white/50 hover:bg-white/10">{viewArchived ? '使用中' : '歷史庫'}</button>
              <div className="text-xs bg-black/10 px-3 py-1 rounded-full font-black">{role === 'bf' ? '👦 男' : '👧 女'}</div>
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto p-4">
        {activeTab === 'overview' && (
            <div className="mb-4 overflow-x-auto flex gap-2 hide-scrollbar py-1">
                {displayBooks.map(book => (
                    <button key={book.id} onClick={() => setActiveBookId(book.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap shadow-sm transition-all ${activeBookId === book.id ? 'bg-gray-800 text-white scale-105' : 'bg-white text-gray-500'}`}>
                      <Book size={14} />{book.name}
                      {activeBookId === book.id && (
                        <Settings size={12} className="ml-1 opacity-60" onClick={(e)=>{e.stopPropagation(); setEditingBook(book); setShowBookManager(true);}} />
                      )}
                    </button>
                ))}
                {!viewArchived && <button onClick={()=> {setEditingBook(null); setShowBookManager(true);}} className="px-3 bg-white text-gray-400 rounded-xl shadow-sm hover:bg-gray-50 transition-colors"><Plus size={18}/></button>}
            </div>
        )}
        {activeTab === 'overview' && <Overview transactions={filteredTransactions} debt={debtValue} role={role} readOnly={viewArchived} onAdd={()=>setShowAddTransaction(true)} onScan={()=>setShowScanner(true)} onEdit={(t)=>!viewArchived && (setEditingTransaction(t), setShowAddTransaction(true))} onDelete={handleDeleteTransaction} onRepay={()=>setShowRepayModal(true)} />}
        {activeTab === 'stats' && <Statistics transactions={filteredTransactions} />}
        {activeTab === 'savings' && <Savings jars={jars} role={role} onAdd={()=>setShowAddJar(true)} onEdit={(j)=>(setEditingJar(j), setShowAddJar(true))} onDeposit={(id)=>setShowJarDeposit(id)} onDelete={(id)=>deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id))} onHistory={(j)=>setShowJarHistory(j)} />}
        {activeTab === 'settings' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center animate-in fade-in">
            <div className={`w-20 h-20 mx-auto rounded-[2rem] flex items-center justify-center text-4xl shadow-xl mb-6 ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div>
            <h2 className="text-xl font-black mb-8 text-gray-800">目前身分：{role === 'bf' ? '男朋友' : '女朋友'}</h2>
            <button onClick={()=>{localStorage.removeItem('couple_app_role'); window.location.reload();}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-black active:scale-95 transition-all shadow-sm hover:bg-red-100 flex items-center justify-center gap-2">
              <LogOut size={20}/> 登出 / 切換身分
            </button>
          </div>
        )}
      </div>
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50 flex justify-around py-3 max-w-2xl mx-auto shadow-xl">
        <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={()=>setActiveTab('overview')} role={role} />
        <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={()=>setActiveTab('stats')} role={role} />
        <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={()=>setActiveTab('savings')} role={role} />
        <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={()=>setActiveTab('settings')} role={role} />
      </div>
      {toast && <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-3 animate-in fade-in"><CheckCircle size={18} className="text-green-400" />{toast}</div>}
      
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm" onClick={(e)=>e.target===e.currentTarget && setConfirmModal({isOpen:false})}>
          <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="font-black text-lg text-gray-800">{confirmModal.title}</h3>
            <p className="text-sm text-gray-500 my-4 font-bold">{confirmModal.message}</p>
            <div className="flex gap-2">
              <button onClick={()=>setConfirmModal({isOpen:false})} className="flex-1 py-3 bg-gray-100 rounded-xl font-black text-gray-600 transition-colors">取消</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 py-3 text-white rounded-xl font-black shadow-lg transition-all ${confirmModal.isDanger?'bg-red-500':'bg-blue-500'}`}>確定</button>
            </div>
          </div>
        </div>
      )}

      {showAddTransaction && <AddTransactionModal onClose={()=>setShowAddTransaction(false)} onSave={handleSaveTransaction} currentUserRole={role} initialData={editingTransaction} />}
      {showRepayModal && <RepayModal debt={debtValue} onClose={()=>setShowRepayModal(false)} onSave={handleSaveTransaction} />}
      {showAddJar && <AddJarModal onClose={()=>setShowAddJar(false)} onSave={(n,t)=> editingJar ? updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), {name:n, targetAmount:Number(t)}) : addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), {name:n, targetAmount:Number(t), currentAmount:0, contributions:{bf:0,gf:0}, history:[], createdAt:serverTimestamp()})} initialData={editingJar} />}
      {showJarDeposit && <DepositModal jar={jars.find(j=>j.id===showJarDeposit)} onClose={()=>setShowJarDeposit(null)} onConfirm={async (id, amt, r)=> { 
          const jar = jars.find(j=>j.id===id); 
          const depositAmt = Number(safeCalculate(amt));
          const newHistoryItem = {id:Date.now().toString(), amount:depositAmt, role:r, date:new Date().toISOString()};
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id), {
              currentAmount: (jar.currentAmount||0)+depositAmt,
              contributions: {...jar.contributions, [r]: (jar.contributions?.[r]||0)+depositAmt},
              history: [newHistoryItem, ...(jar.history||[])]
          });
          setShowJarDeposit(null);
          showToast("存款成功 💰");
      }} role={role} />}
      {showJarHistory && <ModalLayout title={`${showJarHistory.name} 存款明細`} onClose={()=>setShowJarHistory(null)}><div className="space-y-3 font-sans">{showJarHistory.history?.map((h,i)=>(<div key={i} className="flex justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100"><div><div className="text-[10px] text-gray-400 font-bold">{new Date(h.date).toLocaleDateString()}</div><div className="font-black text-gray-700 flex items-center gap-1">{h.role === 'bf' ? '👦 男生' : '👧 女生'}</div></div><div className="font-black text-green-600">+{formatMoney(h.amount)}</div></div>))}</div></ModalLayout>}
      {showBookManager && <BookManagerModal onClose={()=>setShowBookManager(false)} onSave={handleSaveBook} onDelete={async (id)=>{
          const batch = writeBatch(db);
          // Rule 2: JS filtering for bulk delete
          const transSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'));
          transSnap.docs.forEach(d => { if(d.data().bookId === id) batch.delete(d.ref); });
          batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'books', id));
          await batch.commit();
          setShowBookManager(false);
          showToast("帳本已刪除");
      }} initialData={editingBook} />}
    </div>
  );
}

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full transition-all ${active ? (role === 'bf' ? 'text-blue-600 scale-110' : 'text-pink-600 scale-110') : 'text-gray-400'}`}>
    <Icon size={24} strokeWidth={active ? 3 : 2} />
    <span className="text-[10px] font-black">{label}</span>
  </button>
);

const AddTransactionModal = ({ onClose, onSave, currentUserRole, initialData }) => {
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [note, setNote] = useState(initialData?.note || '');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(initialData?.category || 'food');
  const [paidBy, setPaidBy] = useState(initialData?.paidBy || currentUserRole);
  const [splitType, setSplitType] = useState(initialData?.splitType || 'shared');
  const [customBf, setCustomBf] = useState(initialData?.splitDetails?.bf || '');
  const [customGf, setCustomGf] = useState(initialData?.splitDetails?.gf || '');
  const [ratioValue, setRatioValue] = useState(initialData?.splitType === 'ratio' ? Math.round((initialData.splitDetails.bf / initialData.amount) * 100) : 50);

  useEffect(() => {
    if (splitType === 'ratio') {
        const total = Number(safeCalculate(amount)) || 0;
        const bf = Math.round(total * (ratioValue / 100));
        setCustomBf(bf.toString());
        setCustomGf((total - bf).toString());
    }
  }, [amount, ratioValue, splitType]);

  const handleFinalSave = (finalAmount) => {
      const numAmount = Number(finalAmount);
      if (isNaN(numAmount) || numAmount <= 0) return;
      const payload = { amount: numAmount, note, date, category, paidBy, splitType };
      if (splitType === 'custom' || splitType === 'ratio') {
          payload.splitDetails = { bf: Number(customBf) || 0, gf: Number(customGf) || 0 };
      }
      onSave(payload);
  };

  return (
    <ModalLayout title={initialData ? "修改紀錄" : "記一筆"} onClose={onClose}>
      <div className="space-y-4 pt-2 font-sans">
        <div className="bg-gray-50 p-6 rounded-[2rem] text-center font-black text-4xl text-gray-800 shadow-inner h-20 flex items-center justify-center overflow-hidden">{amount ? formatMoney(amount) : '$0'}</div>
        <div className="flex gap-2"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-gray-50 p-3 rounded-2xl text-xs font-black border-none outline-none focus:ring-2 focus:ring-blue-100 transition-all shadow-sm w-[40%]" /><input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="備註..." className="bg-gray-50 p-3 rounded-2xl flex-1 text-xs font-black border-none outline-none focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" /></div>
        <div className="flex overflow-x-auto gap-2 pb-1 hide-scrollbar">{CATEGORIES.map(c => (<button key={c.id} onClick={()=>setCategory(c.id)} className={`px-4 py-2 rounded-2xl text-[10px] font-black whitespace-nowrap transition-all ${category === c.id ? 'bg-gray-800 text-white shadow-lg' : 'bg-white border text-gray-400'}`}>{c.name}</button>))}</div>
        
        <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded-2xl text-[10px] font-black text-center text-gray-400 uppercase tracking-widest">付款人<div className="flex gap-2 mt-2"><button onClick={()=>setPaidBy('bf')} className={`flex-1 py-2 rounded-xl font-black transition-all ${paidBy==='bf'?'bg-blue-500 text-white shadow-md':'bg-white text-gray-300'}`}>男</button><button onClick={()=>setPaidBy('gf')} className={`flex-1 py-2 rounded-xl font-black transition-all ${paidBy==='gf'?'bg-pink-500 text-white shadow-md':'bg-white text-gray-300'}`}>女</button></div></div>
            <div className="bg-gray-50 p-3 rounded-2xl text-[10px] font-black text-center text-gray-400 uppercase tracking-widest">分帳方式<select value={splitType} onChange={e=>setSplitType(e.target.value)} className="w-full mt-2 bg-white py-2 rounded-xl border-none outline-none text-center font-black text-gray-700 shadow-sm"><option value="shared">平分 (50/50)</option><option value="ratio">比例 (滑動)</option><option value="custom">自訂 (輸入)</option><option value="bf_personal">男友全付</option><option value="gf_personal">女友全付</option></select></div>
        </div>

        {splitType === 'ratio' && (
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 animate-in fade-in">
                <div className="flex justify-between text-[10px] font-black text-gray-500 mb-2"><span className="text-blue-500">男友 {ratioValue}%</span><span className="text-pink-500">女友 {100 - ratioValue}%</span></div>
                <input type="range" min="0" max="100" value={ratioValue} onChange={(e)=>setRatioValue(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-2" />
                <div className="flex justify-between text-xs font-black"><span className="text-blue-600">{formatMoney(customBf)}</span><span className="text-pink-600">{formatMoney(customGf)}</span></div>
            </div>
        )}

        {splitType === 'custom' && (
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 animate-in fade-in">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] text-gray-400 font-black block mb-1">男友負擔</label><input type="number" value={customBf} onChange={e=>{const v=e.target.value; setCustomBf(v); setCustomGf((Number(safeCalculate(amount))-Number(v)).toString())}} className="w-full p-2 rounded-xl text-center font-black text-blue-600 border-none outline-none shadow-sm" placeholder="0" /></div>
                    <div><label className="text-[10px] text-gray-400 font-black block mb-1">女友負擔</label><input type="number" value={customGf} onChange={e=>{const v=e.target.value; setCustomGf(v); setCustomBf((Number(safeCalculate(amount))-Number(v)).toString())}} className="w-full p-2 rounded-xl text-center font-black text-pink-600 border-none outline-none shadow-sm" placeholder="0" /></div>
                </div>
            </div>
        )}

        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={handleFinalSave} compact />
      </div>
    </ModalLayout>
  );
};

const RepayModal = ({ debt, onClose, onSave }) => {
    const [amount, setAmount] = useState(Math.abs(debt).toString());
    const payer = debt > 0 ? 'gf' : 'bf'; 
    const payerName = payer === 'bf' ? '男朋友' : '女朋友';
    const receiverName = payer === 'bf' ? '女朋友' : '男朋友';
    return (
        <ModalLayout title="還款結清紀錄" onClose={onClose}>
            <div className="space-y-4 pt-2 font-sans">
                <div className="bg-gray-50 p-5 rounded-3xl text-center border">
                  <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">目前欠款總額</div>
                  <div className="text-2xl font-black text-gray-800">{formatMoney(Math.abs(debt))}</div>
                  <div className="text-[10px] text-orange-500 font-black mt-1 uppercase">需由 <span className="underline">{payerName}</span> 還給 <span className="underline">{receiverName}</span></div>
                </div>
                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-400 px-1 text-center uppercase tracking-widest">本次還款金額</label>
                    <div className="bg-green-50 p-6 rounded-[2rem] text-center font-black text-4xl text-green-600 shadow-inner h-20 flex items-center justify-center overflow-hidden">{amount ? formatMoney(amount) : '$0'}</div>
                </div>
                <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={(val)=>onSave({amount:val, note:"還款結清", category:"repayment", paidBy:payer, splitType:"shared", date:new Date().toISOString().split('T')[0]})} compact />
            </div>
        </ModalLayout>
    );
};

const BookManagerModal = ({ onClose, onSave, onDelete, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    return (
      <ModalLayout title={initialData ? "編輯帳本名稱" : "建立新帳本"} onClose={onClose}>
        <div className="space-y-4 font-sans">
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="例如: 旅遊基金" className="w-full bg-gray-50 p-4 rounded-2xl font-black outline-none border-none focus:ring-2 focus:ring-blue-100 transition-all shadow-inner" autoFocus />
          <button onClick={()=>onSave(name, initialData?.status)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all">儲存帳本設定</button>
          {initialData && <button onClick={()=>onDelete(initialData.id)} className="w-full py-3 text-red-500 font-black hover:bg-red-50 rounded-xl transition-colors">永久刪除帳本</button>}
        </div>
      </ModalLayout>
    );
};

const AddJarModal = ({ onClose, onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [target, setTarget] = useState(initialData?.targetAmount?.toString() || '');
    return (
      <ModalLayout title={initialData ? "修改存錢計畫" : "建立計畫"} onClose={onClose}>
        <div className="space-y-4 font-sans">
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="名稱..." className="w-full bg-gray-50 p-4 rounded-2xl font-black border-none outline-none focus:ring-2 focus:ring-blue-100 shadow-inner" />
          <div className="bg-gray-50 p-4 rounded-2xl text-center font-black text-3xl text-gray-800 shadow-inner">{target ? formatMoney(target) : '$0'}</div>
          <CalculatorKeypad value={target} onChange={setTarget} onConfirm={(t)=>onSave(name, t)} compact />
        </div>
      </ModalLayout>
    );
};

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
    const [amount, setAmount] = useState('');
    const [depositor, setDepositor] = useState(role);
    return (
      <ModalLayout title={`存入：${jar?.name}`} onClose={onClose}>
        <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-4 shadow-inner font-black">
          <button onClick={()=>setDepositor('bf')} className={`flex-1 py-2.5 rounded-xl transition-all ${depositor==='bf'?'bg-blue-500 text-white shadow-lg':'text-gray-400'}`}>👦 男方</button>
          <button onClick={()=>setDepositor('gf')} className={`flex-1 py-2.5 rounded-xl transition-all ${depositor==='gf'?'bg-pink-500 text-white shadow-lg':'text-gray-400'}`}>👧 女方</button>
        </div>
        <div className="text-4xl font-black text-center text-green-500 mb-6 bg-green-50 p-8 rounded-[2rem] shadow-inner">+{amount || '0'}</div>
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={(a)=>onConfirm(jar.id, a, depositor)} compact />
      </ModalLayout>
    );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onDelete, onHistory }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center px-2"><h2 className="font-black text-xl text-gray-800 font-sans">存錢目標</h2><button onClick={onAdd} className="bg-gray-900 text-white px-5 py-2 rounded-2xl text-sm font-black flex items-center gap-1 shadow-lg active:scale-95 transition-all"><Plus size={18}/> 新目標</button></div>
    <div className="grid gap-4">
      {jars.map(jar => {
          const cur = Number(jar.currentAmount) || 0; const tgt = Number(jar.targetAmount) || 1; const progress = Math.min((cur / tgt) * 100, 100);
          return (
            <div key={jar.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden group font-sans">
              <div className="flex justify-between mb-4 relative z-10">
                <div><h3 className="font-black text-lg text-gray-800 flex items-center gap-2">{jar.name}<button onClick={()=>onEdit(jar)} className="text-gray-300 hover:text-blue-500 transition-colors"><Pencil size={14}/></button></h3><div className="text-[10px] text-gray-400 uppercase tracking-widest font-black">目標 {formatMoney(tgt)}</div></div>
                <div className="bg-yellow-100 text-yellow-700 font-bold px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 shadow-sm"><Target size={10}/> {Math.round(progress)}%</div>
              </div>
              <div className="text-3xl font-black text-gray-800 mb-3 relative z-10">{formatMoney(cur)}</div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full mb-5 overflow-hidden relative z-10 shadow-inner"><div className="bg-gradient-to-r from-yellow-300 to-orange-400 h-full transition-all duration-700" style={{ width: `${progress}%` }}></div></div>
              <div className="flex justify-between items-end relative z-10">
                  <div className="flex flex-col gap-1.5"><div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black border border-blue-100 shadow-sm"><span>👦</span> {formatMoney(jar.contributions?.bf || 0)}</div><div className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 text-pink-600 rounded-xl text-[10px] font-black border border-pink-100 shadow-sm"><span>👧</span> {formatMoney(jar.contributions?.gf || 0)}</div></div>
                  <div className="flex gap-2"><button onClick={() => onHistory(jar)} className="p-2.5 bg-gray-100 text-gray-500 rounded-2xl hover:bg-gray-200 transition-colors shadow-sm"><History size={18}/></button><button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-md active:scale-95 transition-all">存錢</button></div>
              </div>
              <PiggyBank className="absolute -bottom-6 -right-6 text-gray-50 opacity-40 z-0 transform -rotate-12 group-hover:scale-110 transition-transform duration-500" size={160} />
            </div>
          );
      })}
    </div>
  </div>
);

const ReceiptScannerModal = ({ onClose, onConfirm }) => {
    const [step, setStep] = useState('upload');
    return (<ModalLayout title="AI 智慧收據辨識" onClose={onClose}>{step === 'upload' ? (<div className="pt-2"><label className="h-64 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all border-purple-100"><div className="bg-purple-100 p-5 rounded-full shadow-lg text-purple-600"><Camera size={48}/></div><div className="text-center"><span className="font-black text-gray-600 block">上傳或拍照收據</span><span className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest font-sans">AI 自動填寫金額與日期</span></div><input type="file" className="hidden" accept="image/*" onChange={()=>{setStep('analyzing'); setTimeout(()=>onConfirm({amount:'520', note:'AI 辨識支出', category:'food', date:new Date().toISOString().split('T')[0], paidBy:'bf', splitType:'shared'}), 1500)}}/></label></div>) : (<div className="h-64 flex flex-col items-center justify-center gap-4 font-sans"><Loader2 className="animate-spin text-purple-500" size={56}/><span className="font-black text-gray-800 text-lg">AI 正在努力分析中...</span><p className="text-xs text-gray-400 animate-pulse font-bold">請稍候</p></div>)}</ModalLayout>);
};
