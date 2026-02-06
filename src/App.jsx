import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, 
  deleteDoc, doc, updateDoc, serverTimestamp,
  writeBatch, query, where, getDocs
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  Heart, Wallet, PiggyBank, PieChart as PieChartIcon, 
  Plus, Trash2, User, Calendar, Target, Settings, LogOut,
  RefreshCw, Pencil, CheckCircle, X, ChevronLeft, ChevronRight, 
  ArrowLeft, Check, History, Percent, Book, MoreHorizontal,
  Camera, Archive, Reply, Loader2, Image as ImageIcon, ArrowRightLeft
} from 'lucide-react';

// --- Firebase Initialization (Rule 1 & 3) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyDPUjZ1dUV52O7JUeY-7befolezIWpI6vo",
      authDomain: "money-49190.firebaseapp.com",
      projectId: "money-49190",
      storageBucket: "money-49190.firebasestorage.app",
      messagingSenderId: "706278541664",
      appId: "1:706278541664:web:aef08ba776587a1101b605"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Constants ---
const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042', emoji: '🍔' },
  { id: 'transport', name: '交通', color: '#00C49F', emoji: '🚗' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28', emoji: '🎮' },
  { id: 'shopping', name: '購物', color: '#0088FE', emoji: '🛍️' },
  { id: 'house', name: '居家', color: '#8884d8', emoji: '🏠' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B', emoji: '✈️' },
  { id: 'repayment', name: '還款', color: '#10B981', emoji: '💸' },
  { id: 'other', name: '其他', color: '#999', emoji: '🏷️' },
];

// --- Helpers ---
const formatMoney = (amount) => {
  const num = Math.floor(Number(amount) || 0);
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
        let res = 0;
        if (op === '*') res = prev * next;
        if (op === '/') res = prev / next;
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
  } catch (e) {
    return '';
  }
};

const getTransactionShares = (t) => {
    const amt = Number(t.amount) || 0;
    if (t.category === 'repayment') return { bf: 0, gf: 0 };
    
    let bfShare = 0, gfShare = 0;
    if (t.splitType === 'shared') {
        bfShare = amt / 2;
        gfShare = amt / 2;
    } else if (t.splitType === 'bf_personal') {
        bfShare = amt;
        gfShare = 0;
    } else if (t.splitType === 'gf_personal') {
        bfShare = 0;
        gfShare = amt;
    } else if (t.splitType === 'custom' || t.splitType === 'ratio') {
        bfShare = Number(t.splitDetails?.bf) || 0;
        gfShare = Number(t.splitDetails?.gf) || 0;
    }
    return { bf: bfShare, gf: gfShare };
};

const calculateDebt = (transactions) => {
    let bfLent = 0;
    transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.category === 'repayment') {
            t.paidBy === 'bf' ? bfLent -= amt : bfLent += amt;
        } else {
            const { bf: bfShare, gf: gfShare } = getTransactionShares(t);
            if (t.paidBy === 'bf') {
                bfLent += gfShare;
            } else {
                bfLent -= bfShare;
            }
        }
    });
    return bfLent;
};

// --- API Helpers ---
const analyzeReceiptImage = async (base64Image, mimeType = "image/jpeg") => {
    const apiKey = "AIzaSyAVr-jNp2WiiAauPoscBNuDkF-wlg2QofA"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const prompt = `
    Analyze this receipt image. 
    1. Identify the date (YYYY-MM-DD format).
    2. List all items with their prices. 
    3. Translate item names to Traditional Chinese (Taiwan usage).
    4. Categorize each item into one of these IDs: 'food', 'transport', 'entertainment', 'shopping', 'house', 'travel', 'other'.
    5. Return ONLY valid JSON in this format:
    {
      "date": "YYYY-MM-DD",
      "items": [
        { "name": "Item Name in TW Chinese", "price": 100, "category": "food" }
      ],
      "total": 100
    }
    If date is unclear, use today. If category is unclear, use 'other'.
    `;

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: mimeType, data: base64Image } }
            ]
        }],
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No response");
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (error) {
        throw error;
    }
};

// --- Components ---

const AppLoading = () => (
  <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-pink-50 to-blue-50 flex flex-col items-center justify-center font-sans">
    <div className="bg-white p-6 rounded-full shadow-2xl mb-5 animate-bounce">
       <Heart className="text-pink-500 fill-pink-500" size={48} />
    </div>
    <h2 className="text-xl font-black text-gray-700 tracking-widest">小金庫準備中...</h2>
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
      const isOperator = ['+', '-', '*', '/'].includes(key);
      const isLastOperator = ['+', '-', '*', '/'].includes(lastChar);
      if (isOperator && isLastOperator) onChange(strVal.slice(0, -1) + key);
      else onChange(strVal + key);
    }
  };

  const keys = [
    { label: '7', type: 'num' }, { label: '8', type: 'num' }, { label: '9', type: 'num' }, { label: '÷', val: '/', type: 'op' },
    { label: '4', type: 'num' }, { label: '5', type: 'num' }, { label: '6', type: 'num' }, { label: '×', val: '*', type: 'op' },
    { label: '1', type: 'num' }, { label: '2', type: 'num' }, { label: '3', type: 'num' }, { label: '-', val: '-', type: 'op' },
    { label: 'C', type: 'action', color: 'text-red-500' }, { label: '0', type: 'num' }, { label: '.', type: 'num' }, { label: '+', val: '+', type: 'op' },
  ];

  return (
    <div className={`bg-gray-100 p-2 rounded-2xl select-none ${compact ? 'mt-1' : 'mt-4'}`}>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePress(k.val || k.label); }}
            className={`
              ${compact ? 'h-10 text-base' : 'h-12 text-lg'} rounded-xl font-bold shadow-sm active:scale-90 transition-transform flex items-center justify-center
              ${k.type === 'op' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-700'}
              ${k.color || ''}
            `}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
         <button type="button" onClick={(e) => { e.stopPropagation(); handlePress('backspace'); }} className={`${compact ? 'h-10' : 'h-12'} flex-1 bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 active:scale-95 transition-transform`}>
           <ArrowLeft size={compact ? 20 : 24} />
         </button>
         <button type="button" onClick={(e) => { e.stopPropagation(); const result = safeCalculate(value); onChange(result); onConfirm && onConfirm(result); }} className={`${compact ? 'h-10' : 'h-12'} flex-[2] bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md`}>
            <Check size={20} /> <span>確認</span>
         </button>
      </div>
    </div>
  );
};

const SimpleDonutChart = ({ data, total, bfTotal, gfTotal }) => {
  if (!total || total === 0) {
    return (
      <div className="h-64 w-full flex items-center justify-center">
        <div className="w-48 h-48 rounded-full border-4 border-gray-100 flex items-center justify-center">
           <span className="text-gray-300 font-bold text-sm">本月尚無數據</span>
        </div>
      </div>
    );
  }
  let accumulatedPercent = 0;
  return (
    <div className="relative w-64 h-64 mx-auto my-6">
      <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#f3f4f6" strokeWidth="5"></circle>
        {data.map((item, index) => {
          const percent = (item.value / total) * 100;
          const strokeDasharray = `${percent} ${100 - percent}`;
          const offset = 100 - accumulatedPercent; 
          accumulatedPercent += percent;
          return (
            <circle key={index} cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke={item.color} strokeWidth="5" strokeDasharray={strokeDasharray} strokeDashoffset={offset} className="transition-all duration-500 ease-out" />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
         <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">總消費額</span>
         <span className="text-2xl font-black text-gray-800">{formatMoney(total)}</span>
         <div className="mt-2 flex gap-2 text-[10px] font-bold">
            <span className="text-blue-500">👦 {formatMoney(bfTotal)}</span>
            <span className="text-pink-500">👧 {formatMoney(gfTotal)}</span>
         </div>
      </div>
    </div>
  );
};

export default function CoupleLedgerApp() {
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
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  // Authentication Sequence (Rule 3)
  useEffect(() => {
    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => setLoading(false), 1500);

    const initAuth = async () => { 
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (e) {
            console.error("Auth Error:", e);
        }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    const savedRole = localStorage.getItem('couple_app_role');
    if (savedRole) setRole(savedRole);

    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  // Data Listeners (Rule 1 & 3)
  useEffect(() => {
    if (!user) return;

    const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');
    const booksRef = collection(db, 'artifacts', appId, 'public', 'data', 'books');
    
    const unsubBooks = onSnapshot(booksRef, async (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        if (data.length === 0 && !s.metadata.hasPendingWrites) {
           await addDoc(booksRef, { name: "主要帳本", status: 'active', createdAt: serverTimestamp() });
           return; 
        }
        setBooks(data);
        setActiveBookId(prev => {
            if (prev && data.find(b => b.id === prev)) return prev;
            const firstActive = data.find(b => (b.status || 'active') === 'active');
            return firstActive ? firstActive.id : (data[0]?.id || null);
        });
    }, (error) => console.error("Books Listener Error:", error));

    const unsubTrans = onSnapshot(transRef, (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(data);
    }, (error) => console.error("Transactions Listener Error:", error));

    const unsubJars = onSnapshot(jarsRef, (s) => {
      setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    }, (error) => console.error("Jars Listener Error:", error));

    return () => { unsubTrans(); unsubJars(); unsubBooks(); };
  }, [user]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      const defaultBookId = books[0]?.id;
      return transactions.filter(t => t.bookId ? t.bookId === activeBookId : activeBookId === defaultBookId);
  }, [transactions, activeBookId, books]);

  const displayBooks = useMemo(() => books.filter(b => (b.status || 'active') === (viewArchived ? 'archived' : 'active')), [books, viewArchived]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleSaveTransaction = async (data) => {
    if (!user) return;
    try {
      const finalAmount = Number(safeCalculate(data.amount));
      const cleanData = { ...data, amount: finalAmount, bookId: activeBookId };
      if (editingTransaction) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', editingTransaction.id), { ...cleanData, updatedAt: serverTimestamp() });
        showToast('紀錄已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), { ...cleanData, createdAt: serverTimestamp() });
        showToast(data.category === 'repayment' ? '還款成功 🤝' : '紀錄已新增 🎉');
      }
      setShowAddTransaction(false);
      setEditingTransaction(null);
    } catch (e) { console.error(e); }
  };

  const handleRepay = () => {
      const debt = calculateDebt(filteredTransactions);
      if (Math.abs(debt) < 1) {
          showToast('目前兩清，不需要還款喔 ☕');
          return;
      }
      setEditingTransaction({
          category: 'repayment',
          amount: Math.abs(debt).toString(),
          paidBy: debt > 0 ? 'gf' : 'bf',
          note: '還錢囉～',
          date: new Date().toISOString().split('T')[0],
          splitType: 'shared'
      });
      setShowAddTransaction(true);
  };

  if (loading) return <AppLoading />;
  if (!role) return <RoleSelection onSelect={(r) => { setRole(r); localStorage.setItem('couple_app_role', r); }} />;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24">
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      
      <div className={`p-4 text-white shadow-lg sticky top-0 z-40 transition-all ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-md"><Heart className="fill-white animate-pulse" size={18} /></div>
            <h1 className="text-lg font-black tracking-widest">我們的小金庫</h1>
          </div>
          <div className="flex items-center gap-3">
              <button 
                onClick={() => setViewArchived(!viewArchived)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${viewArchived ? 'bg-white text-gray-800' : 'bg-white/10 text-white'}`}
              >
                {viewArchived ? <Archive size={12}/> : <Book size={12}/>}
                {viewArchived ? '歷史' : '使用中'}
              </button>
              <div className="text-[10px] bg-black/10 px-3 py-1 rounded-full font-bold">{role === 'bf' ? '👦 男生' : '👧 女生'}</div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {activeTab === 'overview' && (
             <div className="mb-4 overflow-x-auto hide-scrollbar flex items-center gap-2 pb-1">
                 {displayBooks.map(book => (
                     <button 
                       key={book.id} 
                       onClick={() => setActiveBookId(book.id)}
                       className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeBookId === book.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-400'}`}
                     >
                         <Book size={14} />
                         {book.name}
                         {activeBookId === book.id && (
                             <div onClick={(e) => { e.stopPropagation(); setEditingBook(book); setShowBookManager(true); }} className="ml-1 p-1 rounded-full hover:bg-white/20">
                                 <Settings size={12} />
                             </div>
                         )}
                     </button>
                 ))}
                 {!viewArchived && (
                     <button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2 bg-white text-gray-300 rounded-xl shadow-sm"><Plus size={18} /></button>
                 )}
             </div>
        )}
        
        {activeTab === 'overview' && (
            <Overview 
                transactions={filteredTransactions} 
                role={role} 
                readOnly={viewArchived}
                onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} 
                onScan={() => setShowScanner(true)}
                onRepay={handleRepay}
                onEdit={(t) => { if(!viewArchived) { setEditingTransaction(t); setShowAddTransaction(true); } }} 
                onDelete={async (id) => {
                    setConfirmModal({
                        isOpen: true, title: "刪除紀錄", message: "確定要刪除嗎？", isDanger: true,
                        onConfirm: async () => {
                            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id));
                            showToast('已刪除');
                            setConfirmModal({ isOpen: false });
                        }
                    });
                }} 
            />
        )}

        {activeTab === 'stats' && <Statistics transactions={filteredTransactions} />}
        {activeTab === 'savings' && <Savings jars={jars} role={role} onAdd={() => { setEditingJar(null); setShowAddJar(true); }} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onHistory={(j) => setShowJarHistory(j)} />}
        {activeTab === 'settings' && <SettingsView role={role} onLogout={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} />}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
        </div>
      </div>

      {toast && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-xl z-[100] flex items-center gap-3 animate-bounce"><CheckCircle size={18} className="text-green-400" /><span className="text-sm font-bold">{toast}</span></div>}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal({isOpen: false})}>
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black mb-2">{confirmModal.title}</h3>
            <p className="text-gray-500 text-sm mb-6 font-bold">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ isOpen: false })} className="flex-1 py-3 bg-gray-100 rounded-xl text-sm font-bold text-gray-500">取消</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 py-3 rounded-xl text-sm font-bold text-white ${confirmModal.isDanger ? 'bg-red-500' : 'bg-blue-500'}`}>確定</button>
            </div>
          </div>
        </div>
      )}

      {showAddTransaction && <AddTransactionModal onClose={() => setShowAddTransaction(false)} onSave={handleSaveTransaction} currentUserRole={role} initialData={editingTransaction} />}
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={async (n, t) => {
          if (editingJar) {
             await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), { name: n, targetAmount: Number(t), updatedAt: serverTimestamp() });
          } else {
             await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { name: n, targetAmount: Number(t), currentAmount: 0, contributions: { bf: 0, gf: 0 }, history: [], createdAt: serverTimestamp() });
          }
          setShowAddJar(false);
          setEditingJar(null);
      }} initialData={editingJar} />}
      {showJarDeposit && <DepositModal jar={jars.find(j => j.id === showJarDeposit)} onClose={() => setShowJarDeposit(null)} onConfirm={async (id, amt, who) => {
          const jar = jars.find(j => j.id === id);
          const val = Number(amt);
          const newHistory = [{ id: Date.now().toString(), amount: val, role: who, date: new Date().toISOString() }, ...(jar.history || [])];
          const newContrib = { ...jar.contributions, [who]: (jar.contributions?.[who] || 0) + val };
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id), { currentAmount: (jar.currentAmount || 0) + val, contributions: newContrib, history: newHistory });
          setShowJarDeposit(null);
          showToast(`成功存入 ${formatMoney(val)} 💰`);
      }} role={role} />}
      {showScanner && <ReceiptScannerModal onClose={() => setShowScanner(false)} onConfirm={(d) => { setEditingTransaction(d); setShowScanner(false); setShowAddTransaction(true); }} />}
      {showBookManager && <BookManagerModal onClose={() => setShowBookManager(false)} onSave={async (n, s) => {
          if(editingBook) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', editingBook.id), { name: n, status: s, updatedAt: serverTimestamp() });
          else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), { name: n, status: s, createdAt: serverTimestamp() });
          setShowBookManager(false);
      }} onDelete={async (id) => {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', id));
          setShowBookManager(false);
      }} initialData={editingBook} />}
    </div>
  );
}

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full transition-all ${active ? (role === 'bf' ? 'text-blue-600 scale-110' : 'text-pink-600 scale-110') : 'text-gray-300 hover:text-gray-400'}`}>
    <Icon size={24} strokeWidth={active ? 3 : 2} />
    <span className="text-[10px] font-black">{label}</span>
  </button>
);

const RoleSelection = ({ onSelect }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm text-center">
      <Heart className="mx-auto text-pink-400 mb-6 animate-pulse" size={48} />
      <h1 className="text-2xl font-black text-gray-800 mb-2">誰在使用？</h1>
      <p className="text-gray-400 text-sm mb-8 font-bold">我們一起經營的小金庫</p>
      <div className="space-y-4">
        <button onClick={() => onSelect('bf')} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-lg">我是男朋友 👦</button>
        <button onClick={() => onSelect('gf')} className="w-full py-4 bg-pink-500 text-white rounded-2xl font-black shadow-lg shadow-pink-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-lg">我是女朋友 👧</button>
      </div>
    </div>
  </div>
);

const Overview = ({ transactions, role, onAdd, onEdit, onDelete, onScan, onRepay, readOnly }) => {
  const debt = useMemo(() => calculateDebt(transactions), [transactions]);
  const grouped = useMemo(() => {
    const groups = {};
    transactions.forEach(t => { if (!t.date) return; if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [transactions]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s]">
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1.5 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <h2 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-3">結算統計</h2>
        <div className="flex flex-col items-center justify-center gap-4">
          {Math.abs(debt) < 1 ? (
              <div className="py-2"><div className="text-2xl font-black text-green-500 flex items-center gap-2"><CheckCircle /> 互不相欠</div></div>
          ) : (
              <div className="space-y-4 w-full">
                  <div className="flex items-center justify-center gap-2">
                      <span className={`text-3xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男朋友' : '女朋友'}</span>
                      <span className="text-gray-400 text-sm font-bold">先墊了</span>
                      <span className="text-2xl font-black text-gray-800">{formatMoney(Math.abs(debt))}</span>
                  </div>
                  {!readOnly && (
                      <button onClick={onRepay} className={`w-full py-3 rounded-xl font-black text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all ${debt > 0 ? 'bg-pink-500 shadow-pink-100' : 'bg-blue-500 shadow-blue-100'}`}>
                          <ArrowRightLeft size={18} /> {debt > 0 ? '女朋友還款' : '男朋友還款'}
                      </button>
                  )}
              </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
            <h3 className="font-black text-lg text-gray-800">支出明細</h3>
            {!readOnly && (
                <div className="flex gap-2">
                    <button onClick={onScan} className="bg-purple-100 text-purple-600 p-3 rounded-xl shadow-sm active:scale-90 transition-all"><Camera size={20} /></button>
                    <button onClick={onAdd} className="bg-gray-900 text-white p-3 rounded-xl shadow-lg active:scale-90 transition-all"><Plus size={20} /></button>
                </div>
            )}
        </div>

        {grouped.length === 0 ? (
            <div className="text-center py-20 text-gray-300 font-bold italic">尚無任何紀錄</div>
        ) : grouped.map(([date, items]) => (
            <div key={date} className="space-y-2">
              <div className="text-[10px] font-black text-gray-400 ml-2 bg-gray-100 px-3 py-1 rounded-full inline-block">{date}</div>
              {items.map(t => (
                <div key={t.id} onClick={() => onEdit(t)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl shadow-inner" style={{ backgroundColor: CATEGORIES.find(c => c.id === t.category)?.color + '20' }}>
                        {t.category === 'repayment' ? '🤝' : (CATEGORIES.find(c => c.id === t.category)?.emoji || '🏷️')}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-black text-gray-800 truncate">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name)}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1 font-bold">
                            <span className={t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}>{t.paidBy === 'bf' ? '男生付' : '女生付'}</span>
                            <span>•</span>
                            <span>{t.category === 'repayment' ? '還款' : (t.splitType === 'shared' ? '平分' : '自訂')}</span>
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                      <span className={`font-black text-lg ${t.category === 'repayment' ? 'text-green-500' : 'text-gray-800'}`}>{t.category === 'repayment' ? '- ' : ''}{formatMoney(t.amount)}</span>
                      {!readOnly && <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-200 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
};

const Statistics = ({ transactions }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear() && t.category !== 'repayment';
    });
  }, [transactions, currentDate]);

  const stats = useMemo(() => {
    const map = {}; 
    let total = 0;
    let bfActualTotal = 0;
    let gfActualTotal = 0;

    monthTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (!map[t.category]) map[t.category] = 0;
      map[t.category] += amt;
      total += amt;
      const { bf, gf } = getTransactionShares(t);
      bfActualTotal += bf;
      gfActualTotal += gf;
    });

    return { 
        categories: Object.entries(map).map(([id, value]) => ({ 
            id, value, 
            color: CATEGORIES.find(c => c.id === id)?.color || '#999', 
            name: CATEGORIES.find(c => c.id === id)?.name || '未知' 
        })).sort((a, b) => b.value - a.value), 
        total,
        bfActualTotal,
        gfActualTotal
    };
  }, [monthTransactions]);

  const changeMonth = (delta) => { 
    const newDate = new Date(currentDate); 
    newDate.setMonth(newDate.getMonth() + delta); 
    setCurrentDate(newDate); 
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s]">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>
        <span className="font-black text-lg">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 p-4 rounded-[1.5rem] border border-blue-100">
              <div className="text-[10px] font-black text-blue-400 mb-1">👦 男生應承擔</div>
              <div className="text-xl font-black text-blue-600">{formatMoney(stats.bfActualTotal)}</div>
          </div>
          <div className="bg-pink-50 p-4 rounded-[1.5rem] border border-pink-100">
              <div className="text-[10px] font-black text-pink-400 mb-1">👧 女生應承擔</div>
              <div className="text-xl font-black text-pink-600">{formatMoney(stats.gfActualTotal)}</div>
          </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center">
        <SimpleDonutChart data={stats.categories} total={stats.total} bfTotal={stats.bfActualTotal} gfTotal={stats.gfActualTotal} />
        <div className="flex flex-wrap gap-2 justify-center mt-4">
            {stats.categories.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100 font-bold">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }}></div>
                    <span>{d.name}</span>
                    <span className="text-gray-400">{Math.round((d.value / stats.total) * 100)}%</span>
                </div>
            ))}
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden mb-10">
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2 font-black text-gray-500 text-sm italic underline">
            <Calendar size={18}/> 本月明細 (分帳後個人支出)
        </div>
        <div className="divide-y divide-gray-50">
            {monthTransactions.length === 0 ? (
                <div className="p-10 text-center text-gray-300 font-bold">目前無紀錄</div>
            ) : monthTransactions.map(t => {
                const { bf, gf } = getTransactionShares(t);
                return (
                    <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="text-[10px] font-black text-gray-300 bg-gray-100 w-10 h-10 flex items-center justify-center rounded-xl">
                                {t.date ? `${t.date.split('-')[1]}/${t.date.split('-')[2]}` : '--'}
                            </div>
                            <div>
                                <div className="font-black text-sm text-gray-800">{t.note || CATEGORIES.find(c=>c.id===t.category)?.name}</div>
                                <div className="flex gap-2 mt-1">
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-500">👦{formatMoney(bf)}</span>
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-pink-100 text-pink-500">👧{formatMoney(gf)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="font-black text-gray-700">{formatMoney(t.amount)}</div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onHistory }) => (
  <div className="space-y-6 animate-[fadeIn_0.5s]">
    <div className="flex justify-between items-center px-2">
      <h2 className="font-black text-xl text-gray-800">我們的目標</h2>
      <button onClick={onAdd} className="bg-gray-900 text-white p-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-black pr-4 active:scale-95 transition-all"><Plus size={18} /> 新增</button>
    </div>
    <div className="grid gap-4">
      {jars.map(jar => {
        const cur = Number(jar.currentAmount) || 0; const tgt = Number(jar.targetAmount) || 1; const progress = Math.min((cur / tgt) * 100, 100);
        return (
          <div key={jar.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div>
                    <h3 className="font-black text-lg text-gray-800 flex items-center gap-2">{jar.name}<button onClick={() => onEdit(jar)} className="text-gray-200 hover:text-blue-500"><Pencil size={14}/></button></h3>
                    <div className="text-[10px] font-black text-gray-400 mt-1 uppercase tracking-widest">目標 {formatMoney(tgt)}</div>
                </div>
                <div className="bg-yellow-100 text-yellow-700 font-black px-3 py-1 rounded-full text-[10px] flex items-center gap-1"><Target size={12} /> {Math.round(progress)}%</div>
            </div>
            <div className="mb-4 relative z-10">
                <div className="text-3xl font-black text-gray-800 mb-2">{formatMoney(cur)}</div>
                <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden p-1 shadow-inner">
                    <div className="h-full bg-gradient-to-r from-yellow-300 to-orange-400 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
            <div className="flex justify-between items-center relative z-10 pt-2 border-t border-gray-50 mt-4">
                <div className="flex -space-x-2">
                    <div className="w-9 h-9 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[9px] text-blue-600 font-black shadow-sm" title="男生">👦</div>
                    <div className="w-9 h-9 rounded-full bg-pink-100 border-2 border-white flex items-center justify-center text-[9px] text-pink-600 font-black shadow-sm" title="女生">👧</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => onHistory(jar)} className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-100 transition-all"><History size={18}/></button>
                    <button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-6 py-3 rounded-2xl text-sm font-black shadow-lg active:scale-95 transition-all">存錢</button>
                </div>
            </div>
            <PiggyBank className="absolute -bottom-6 -right-6 text-gray-50 opacity-40 z-0 transform -rotate-12" size={140} />
          </div>
        );
      })}
      {jars.length === 0 && <div className="text-center py-20 text-gray-300 font-bold italic">還沒開始存錢喔...</div>}
    </div>
  </div>
);

const SettingsView = ({ role, onLogout }) => (
  <div className="space-y-6 animate-[fadeIn_0.5s]">
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 text-center">
      <div className="mx-auto w-24 h-24 rounded-full shadow-2xl mb-6 flex items-center justify-center text-5xl bg-gradient-to-br from-gray-50 to-gray-100 border-4 border-white">
          {role === 'bf' ? '👦' : '👧'}
      </div>
      <h2 className="font-black text-2xl text-gray-800 mb-2">{role === 'bf' ? '男朋友' : '女朋友'}</h2>
      <p className="text-gray-400 font-bold text-sm mb-10 tracking-widest">目前使用的帳號身分</p>
      
      <button onClick={onLogout} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-red-100 transition-all">
          <LogOut size={20} /> 切換使用者 / 登出
      </button>
    </div>
  </div>
);

const ModalLayout = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-md animate-[fadeIn_0.3s]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-white w-full sm:max-w-md h-auto max-h-[92vh] sm:rounded-[2.5rem] rounded-t-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.4s]">
      <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="text-lg font-black text-gray-800 tracking-wider">{title}</h2>
        <button onClick={onClose} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:bg-gray-200 transition-all"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 hide-scrollbar pb-10">{children}</div>
    </div>
  </div>
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
  
  const [ratioValue, setRatioValue] = useState(
      initialData?.splitType === 'ratio' && initialData.amount 
      ? Math.round((initialData.splitDetails.bf / initialData.amount) * 100) 
      : 50
  );

  useEffect(() => {
    if (splitType === 'ratio') {
        const total = Number(safeCalculate(amount)) || 0;
        const bf = Math.round(total * (ratioValue / 100));
        const gf = total - bf;
        setCustomBf(bf.toString());
        setCustomGf(gf.toString());
    }
  }, [amount, ratioValue, splitType]);

  const handleCustomChange = (who, val) => {
    const numVal = Number(val);
    const total = Number(safeCalculate(amount)) || 0;
    if (who === 'bf') { setCustomBf(val); setCustomGf((total - numVal).toString()); } 
    else { setCustomGf(val); setCustomBf((total - numVal).toString()); }
  };

  const handleSubmit = (finalAmount) => {
    if (!finalAmount || finalAmount === '0') return;
    const payload = { amount: finalAmount, note, date, category, paidBy, splitType };
    if (splitType === 'custom' || splitType === 'ratio') { 
        payload.splitDetails = { bf: Number(customBf) || 0, gf: Number(customGf) || 0 }; 
    }
    if (category === 'repayment') payload.splitType = 'shared'; 

    onSave(payload);
  };

  return (
    <ModalLayout title={initialData?.id ? "修改紀錄" : (category === 'repayment' ? "債務還款" : "新增支出")} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-3xl text-center border-2 border-transparent focus-within:border-blue-100 transition-all">
          <div className="text-3xl font-black text-gray-800 tracking-widest h-10 flex items-center justify-center">
              {amount ? (category === 'repayment' ? `🤝 ${amount}` : formatMoney(amount)) : <span className="text-gray-200">NT$ 0</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
           <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 rounded-2xl p-3 text-sm font-black focus:ring-2 focus:ring-blue-100 outline-none text-center" />
           <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="備註..." className="bg-gray-50 rounded-2xl p-3 text-sm font-black focus:ring-2 focus:ring-blue-100 outline-none flex-1" />
        </div>
        <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
            {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)} className={`flex-shrink-0 px-4 py-2 rounded-2xl text-xs font-black transition-all border-2 whitespace-nowrap ${category === c.id ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-100 text-gray-400'}`}>
                    {c.name}
                </button>
            ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
             <div className="bg-gray-50 p-3 rounded-2xl">
               <div className="text-[10px] text-gray-400 font-black text-center mb-2 uppercase tracking-widest">誰付錢？</div>
               <div className="flex bg-white rounded-xl p-1 shadow-sm">
                 <button onClick={() => setPaidBy('bf')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${paidBy === 'bf' ? 'bg-blue-500 text-white' : 'text-gray-300'}`}>男生</button>
                 <button onClick={() => setPaidBy('gf')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${paidBy === 'gf' ? 'bg-pink-500 text-white' : 'text-gray-300'}`}>女生</button>
               </div>
             </div>
             <div className="bg-gray-50 p-3 rounded-2xl">
               <div className="text-[10px] text-gray-400 font-black text-center mb-2 uppercase tracking-widest">如何分帳？</div>
               <select 
                disabled={category === 'repayment'}
                value={splitType} 
                onChange={e => { 
                   setSplitType(e.target.value); 
                   if(e.target.value === 'custom') { 
                       const total = Number(safeCalculate(amount)) || 0;
                       setCustomBf((total/2).toString()); setCustomGf((total/2).toString()); 
                   }
                }} 
                className="w-full bg-white text-xs font-black py-2 rounded-xl border-none outline-none text-center shadow-sm disabled:opacity-50"
               >
                   <option value="shared">平分 (50/50)</option>
                   <option value="ratio">比例 (%)</option>
                   <option value="custom">自訂 ($)</option>
                   <option value="bf_personal">男生全出</option>
                   <option value="gf_personal">女生全出</option>
               </select>
             </div>
        </div>
        {category !== 'repayment' && splitType === 'ratio' && (
            <div className="bg-gray-50 p-4 rounded-3xl animate-[fadeIn_0.2s] border border-gray-100">
                <div className="flex justify-between text-[10px] font-black text-gray-400 mb-3">
                    <span className="text-blue-500">👦 男生 {ratioValue}%</span>
                    <span className="text-pink-500">👧 女生 {100 - ratioValue}%</span>
                </div>
                <input type="range" min="0" max="100" value={ratioValue} onChange={(e) => setRatioValue(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-2" />
                <div className="flex justify-between font-black text-xs text-gray-600">
                    <span>{formatMoney(customBf)}</span>
                    <span>{formatMoney(customGf)}</span>
                </div>
            </div>
        )}
        {category !== 'repayment' && splitType === 'custom' && (
            <div className="bg-gray-50 p-4 rounded-3xl animate-[fadeIn_0.2s] border border-gray-100 flex gap-4 items-center">
                <div className="flex-1"><label className="text-[10px] font-black text-blue-400 block mb-1">男生應付</label><input type="number" value={customBf} onChange={(e) => handleCustomChange('bf', e.target.value)} className="w-full p-2.5 rounded-xl text-center font-black text-sm outline-none shadow-sm focus:ring-2 focus:ring-blue-200 border-none" /></div>
                <div className="text-gray-300 font-black">+</div>
                <div className="flex-1"><label className="text-[10px] font-black text-pink-400 block mb-1">女生應付</label><input type="number" value={customGf} onChange={(e) => handleCustomChange('gf', e.target.value)} className="w-full p-2.5 rounded-xl text-center font-black text-sm outline-none shadow-sm focus:ring-2 focus:ring-pink-200 border-none" /></div>
            </div>
        )}
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={handleSubmit} compact={true} />
      </div>
    </ModalLayout>
  );
};

const AddJarModal = ({ onClose, onSave, initialData }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [target, setTarget] = useState(initialData?.targetAmount?.toString() || '');
  return (
    <ModalLayout title={initialData ? "編輯存錢罐" : "新存錢罐"} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-3xl text-center">
          <label className="block mb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">目標金額</label>
          <div className="text-3xl font-black text-gray-800 tracking-widest h-10 flex items-center justify-center">{target ? formatMoney(target) : <span className="text-gray-200">NT$ 0</span>}</div>
        </div>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="名稱 (例如: 買房子)" className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-black focus:ring-2 focus:ring-blue-100 outline-none shadow-sm" />
        <CalculatorKeypad value={target} onChange={setTarget} onConfirm={(val) => { if (name && val) onSave(name, val); }} compact={true} />
      </div>
    </ModalLayout>
  );
};

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
  const [amount, setAmount] = useState('');
  const [depositor, setDepositor] = useState(role);
  if (!jar) return null;
  return (
    <ModalLayout title={`存入: ${jar.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-3xl text-center">
            <div className="text-[10px] font-black text-gray-400 mb-1">進度: {formatMoney(jar.currentAmount)} / {formatMoney(jar.targetAmount)}</div>
            <div className="text-3xl font-black text-green-500 tracking-widest h-10 flex items-center justify-center">{amount ? `+ ${amount}` : <span className="text-gray-200">0</span>}</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-2xl">
           <div className="text-[10px] font-black text-gray-400 text-center mb-2 uppercase tracking-widest">是誰存的錢？</div>
           <div className="flex bg-white rounded-xl p-1 shadow-sm">
             <button onClick={() => setDepositor('bf')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${depositor === 'bf' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-300'}`}>男朋友</button>
             <button onClick={() => setDepositor('gf')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${depositor === 'gf' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-300'}`}>女朋友</button>
           </div>
         </div>
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={(val) => { if(Number(val) > 0) onConfirm(jar.id, val, depositor); }} compact={true} />
      </div>
    </ModalLayout>
  );
};

const ReceiptScannerModal = ({ onClose, onConfirm }) => {
    const [step, setStep] = useState('upload');
    const [scannedData, setScannedData] = useState(null);
    const [selectedItems, setSelectedItems] = useState({});
    const [loading, setLoading] = useState(false);

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        setLoading(true);
        setStep('analyzing');
        const reader = new FileReader();
        reader.onloadend = async () => {
            const match = reader.result.match(/^data:(.*?);base64,(.*)$/);
            if (match) {
                 try {
                     const res = await analyzeReceiptImage(match[2], match[1]);
                     setScannedData(res);
                     const sel = {}; res.items.forEach((_, i) => sel[i] = true);
                     setSelectedItems(sel);
                     setStep('review');
                 } catch (e) { alert("分析失敗"); setStep('upload'); }
            }
            setLoading(false);
        };
        reader.readAsDataURL(file);
    };

    return (
        <ModalLayout title="AI 收據辨識" onClose={onClose}>
            {step === 'upload' && (
                <label className="w-full h-64 border-4 border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all text-gray-300">
                    <Camera size={48} className="mb-4" />
                    <span className="font-black">拍下收據</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                </label>
            )}
            {step === 'analyzing' && (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <Loader2 size={48} className="animate-spin text-purple-400" />
                    <span className="font-black text-gray-400">正在辨識與翻譯...</span>
                </div>
            )}
            {step === 'review' && scannedData && (
                <div className="space-y-4">
                    <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                        {scannedData.items.map((item, i) => (
                            <div key={i} onClick={() => setSelectedItems(prev => ({...prev, [i]: !prev[i]}))} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${selectedItems[i] ? 'border-purple-400 bg-purple-50' : 'border-gray-50 opacity-40'}`}>
                                <div className="flex gap-3 items-center">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedItems[i] ? 'bg-purple-400 border-purple-400' : 'border-gray-200'}`}>
                                        {selectedItems[i] && <Check size={12} className="text-white"/>}
                                    </div>
                                    <span className="font-black text-sm">{item.name}</span>
                                </div>
                                <span className="font-black text-gray-600">{formatMoney(item.price)}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => {
                        const items = scannedData.items.filter((_, i) => selectedItems[i]);
                        onConfirm({
                            amount: items.reduce((a, b) => a + b.price, 0).toString(),
                            note: items.map(it => it.name).join(', ').substring(0, 30),
                            date: scannedData.date || new Date().toISOString().split('T')[0],
                            category: 'food', splitType: 'shared'
                        });
                    }} className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black shadow-xl">完成匯入</button>
                </div>
            )}
        </ModalLayout>
    );
};

const BookManagerModal = ({ onClose, onSave, onDelete, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [isArchived, setIsArchived] = useState(initialData?.status === 'archived');
    return (
        <ModalLayout title={initialData ? "編輯帳本" : "新帳本"} onClose={onClose}>
            <div className="space-y-4">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="帳本名稱 (如: 旅遊、生活費)" className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-black focus:ring-2 focus:ring-blue-100 outline-none" />
                {initialData && (
                    <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer">
                        <input type="checkbox" checked={isArchived} onChange={e => setIsArchived(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-gray-800" />
                        <span className="font-black text-sm text-gray-500 italic">封存此帳本 (將移至歷史區)</span>
                    </label>
                )}
                <div className="flex gap-2">
                    {initialData && <button onClick={() => onDelete(initialData.id)} className="p-4 bg-red-50 text-red-400 rounded-2xl transition-all"><Trash2 size={20}/></button>}
                    <button onClick={() => onSave(name, isArchived ? 'archived' : 'active')} className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-black shadow-xl">儲存設定</button>
                </div>
            </div>
        </ModalLayout>
    );
};

const JarHistoryModal = ({ jar, onClose }) => {
    const history = [...(jar.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
    return (
        <ModalLayout title={`${jar.name} 存款紀錄`} onClose={onClose}>
            <div className="space-y-2">
                {history.map((h, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">{h.role === 'bf' ? '👦' : '👧'}</span>
                            <div>
                                <div className="text-[10px] font-black text-gray-300">{new Date(h.date).toLocaleDateString()}</div>
                                <div className="font-black text-sm text-gray-700">{h.role === 'bf' ? '男生' : '女生'}存入</div>
                            </div>
                        </div>
                        <span className="font-black text-green-500">+ {formatMoney(h.amount)}</span>
                    </div>
                ))}
            </div>
        </ModalLayout>
    );
};
