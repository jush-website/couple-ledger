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
  Camera, Languages, Loader2, Save, Archive, Eye, ListChecks
} from 'lucide-react';

// --- Firebase & Gemini Config ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Use raw appId for Firestore paths as per environment rules
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const apiKey = ""; // API Key will be injected by the environment

// --- Constants ---
const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042', icon: '🍔' },
  { id: 'transport', name: '交通', color: '#00C49F', icon: '🚗' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28', icon: '🎮' },
  { id: 'shopping', name: '購物', color: '#0088FE', icon: '🛍️' },
  { id: 'house', name: '居家', color: '#8884d8', icon: '🏠' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B', icon: '✈️' },
  { id: 'other', name: '其他', color: '#999', icon: '🏷️' },
];

const formatMoney = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '$0';
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(num);
};

const safeCalculate = (expression) => {
  try {
    const sanitized = (expression || '').toString().replace(/[^0-9+\-*/.]/g, '');
    if (!sanitized) return '0';
    // Simple math eval logic
    const fn = new Function('return ' + sanitized);
    const result = fn();
    return isNaN(result) || !isFinite(result) ? '0' : Math.floor(result).toString();
  } catch (e) {
    return '0';
  }
};

// --- API Helpers ---
const callGeminiAI = async (prompt, base64Image = null) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        ...(base64Image ? [{ inlineData: { mimeType: "image/png", data: base64Image.split(',')[1] || base64Image } }] : [])
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                original_name: { type: "STRING" },
                translated_name: { type: "STRING" },
                price: { type: "NUMBER" },
                category_id: { type: "STRING" }
              }
            }
          },
          total_amount: { type: "NUMBER" },
          date: { type: "STRING" }
        }
      }
    }
  };

  const fetchWithRetry = async (retries = 5, delay = 1000) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('API Error');
      return await response.json();
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      throw err;
    }
  };

  return fetchWithRetry();
};

// --- Components ---

const AppLoading = () => (
  <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6">
    <div className="bg-pink-50 p-6 rounded-full mb-4 animate-bounce">
       <Heart className="text-pink-500 fill-pink-500" size={48} />
    </div>
    <h2 className="text-xl font-bold text-gray-800">開啟甜蜜小金庫...</h2>
    <p className="text-gray-400 mt-2 text-sm">正在同步雲端資料中</p>
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
    <div className={`bg-gray-50 p-2 rounded-2xl select-none ${compact ? 'mt-1' : 'mt-4'}`}>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePress(k.val || k.label); }}
            className={`
              ${compact ? 'h-9 text-base' : 'h-11 text-lg'} rounded-xl font-bold shadow-sm active:scale-95 transition-transform flex items-center justify-center
              ${k.type === 'op' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-700'}
              ${k.color || ''}
            `}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
         <button type="button" onClick={(e) => { e.stopPropagation(); handlePress('backspace'); }} className={`${compact ? 'h-9' : 'h-11'} flex-1 bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 active:scale-95 transition-transform hover:bg-gray-300`}>
           <ArrowLeft size={compact ? 20 : 24} />
         </button>
         <button type="button" onClick={(e) => { e.stopPropagation(); const result = safeCalculate(value); onChange(result); onConfirm && onConfirm(result); }} className={`${compact ? 'h-9' : 'h-11'} flex-[2] bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md`}>
            <Check size={20} /> <span>確認</span>
         </button>
      </div>
    </div>
  );
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [activeTab, setActiveTab] = useState('overview');
  const [showArchived, setShowArchived] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [jars, setJars] = useState([]);
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false);
  const [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null);
  const [showJarHistory, setShowJarHistory] = useState(null); 
  
  const [showBookManager, setShowBookManager] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  // Init Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth initialization failed:", e); }
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

  // Data Listeners
  useEffect(() => {
    if (!user) return;
    const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');
    const booksRef = collection(db, 'artifacts', appId, 'public', 'data', 'books');
    
    const unsubBooks = onSnapshot(booksRef, (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        if (data.length === 0 && !s.metadata.hasPendingWrites) {
           addDoc(booksRef, { name: "預設帳本", status: 'active', createdAt: serverTimestamp() });
           return; 
        }
        setBooks(data);
        if (data.length > 0) {
            setActiveBookId(prev => {
                const active = data.filter(b => b.status === 'active');
                if (!prev || !data.find(b => b.id === prev)) return active[0]?.id || data[0].id;
                return prev;
            });
        }
    }, (err) => console.error("Books snapshot error:", err));

    const unsubTrans = onSnapshot(transRef, (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(data);
    }, (err) => console.error("Transactions snapshot error:", err));

    const unsubJars = onSnapshot(jarsRef, (s) => setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))), (err) => console.error("Jars snapshot error:", err));
    
    return () => { unsubTrans(); unsubJars(); unsubBooks(); };
  }, [user]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Filters
  const displayedBooks = useMemo(() => {
      return books.filter(b => showArchived ? b.status === 'archived' : b.status === 'active');
  }, [books, showArchived]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      const defaultBookId = books[0]?.id;
      return transactions.filter(t => t.bookId === activeBookId || (!t.bookId && activeBookId === defaultBookId));
  }, [transactions, activeBookId, books]);

  // Actions
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
        showToast('紀錄已新增 🎉');
      }
      setShowAddTransaction(false);
      setEditingTransaction(null);
    } catch (e) { console.error(e); }
  };

  const handleArchiveBook = async (bookId, currentStatus) => {
      const newStatus = currentStatus === 'active' ? 'archived' : 'active';
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', bookId), { status: newStatus });
      showToast(newStatus === 'archived' ? '帳本已移至歷史紀錄 📁' : '帳本已恢復作用 ⚡');
      if (newStatus === 'archived' && activeBookId === bookId) {
          const next = books.find(b => b.status === 'active' && b.id !== bookId);
          if (next) setActiveBookId(next.id);
      }
      setShowBookManager(false);
  };

  const depositToJar = async (jarId, amount, contributorRole) => {
    const jar = jars.find(j => j.id === jarId);
    if (!jar) return;
    try {
      const depositAmount = Number(safeCalculate(amount));
      const newAmount = (jar.currentAmount || 0) + depositAmount;
      const newContrib = { ...jar.contributions, [contributorRole]: (jar.contributions?.[contributorRole] || 0) + depositAmount };
      
      const newHistoryItem = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          amount: depositAmount,
          role: contributorRole,
          date: new Date().toISOString()
      };
      const newHistory = [newHistoryItem, ...(jar.history || [])];

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jarId), { 
          currentAmount: newAmount, 
          contributions: newContrib,
          history: newHistory
      });
      setShowJarDeposit(null);
      showToast(`已存入 $${depositAmount} 💰`);
    } catch (e) { console.error(e); }
  };

  if (loading) return <AppLoading />;
  if (!role) return <RoleSelection onSelect={(r) => { setRole(r); localStorage.setItem('couple_app_role', r); }} />;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24">
      <div className={`p-4 text-white shadow-lg sticky top-0 z-40 transition-colors ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Heart className="fill-white animate-pulse" size={20} />
            <h1 className="text-lg font-bold tracking-wide">小金庫 2.5 AI</h1>
          </div>
          <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-1 text-xs bg-black/10 px-3 py-1 rounded-full active:scale-95 transition-all">
             {showArchived ? <Eye size={12} /> : <Archive size={12} />}
             {showArchived ? '回現役帳本' : '查看歷史帳本'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {activeTab === 'overview' && (
          <div className="mb-4 flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
            {displayedBooks.map(book => (
              <button 
                key={book.id} 
                onClick={() => setActiveBookId(book.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeBookId === book.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-500'}`}
              >
                <Book size={14} />
                {book.name}
                <div onClick={(e) => { e.stopPropagation(); setEditingBook(book); setShowBookManager(true); }} className="ml-1 p-1 rounded-full hover:bg-white/20">
                  <Settings size={12} />
                </div>
              </button>
            ))}
            <button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2 bg-white text-gray-400 rounded-xl shadow-sm"><Plus size={18} /></button>
          </div>
        )}

        {activeTab === 'overview' && <Overview transactions={filteredTransactions} onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} onEdit={(t) => { setEditingTransaction(t); setShowAddTransaction(true); }} onDelete={(id) => setConfirmModal({ isOpen: true, title: "刪除紀錄", message: "確定要刪除嗎？", isDanger: true, onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id)); showToast('已刪除'); setConfirmModal({isOpen:false}); } })} />}
        {activeTab === 'stats' && <Statistics transactions={filteredTransactions} />}
        {activeTab === 'savings' && <Savings jars={jars} role={role} onAdd={() => setShowAddJar(true)} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onDelete={async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id))} onHistory={(j) => setShowJarHistory(j)} />}
        {activeTab === 'settings' && <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"><div className="flex items-center gap-4 mb-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div><div><h2 className="font-bold text-xl">{role === 'bf' ? '男朋友' : '女朋友'}</h2><p className="text-gray-400 text-sm">目前身分</p></div></div><button onClick={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2"><LogOut size={18} /> 切換身分 (登出)</button></div>}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
        </div>
      </div>

      {toast && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl z-[100] animate-bounce">{toast}</div>}

      {showBookManager && <BookManagerModal initialData={editingBook} onClose={() => setShowBookManager(false)} onSave={async (name) => {
          if (editingBook) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', editingBook.id), { name });
          else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), { name, status: 'active', createdAt: serverTimestamp() });
          setShowBookManager(false);
      }} onArchive={(id) => handleArchiveBook(id, editingBook.status)} />}

      {showAddTransaction && <AddTransactionModal onClose={() => setShowAddTransaction(false)} onSave={handleSaveTransaction} role={role} initialData={editingTransaction} />}
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={async (name, target) => {
        const finalTarget = Number(safeCalculate(target));
        if (editingJar) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), { name, targetAmount: finalTarget });
        else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { name, targetAmount: finalTarget, currentAmount: 0, contributions: { bf: 0, gf: 0 }, history: [], createdAt: serverTimestamp() });
        setShowAddJar(false);
      }} initialData={editingJar} />}
      {showJarDeposit && <DepositModal jar={jars.find(j => j.id === showJarDeposit)} onClose={() => setShowJarDeposit(null)} onConfirm={depositToJar} role={role} />}
      {showJarHistory && <JarHistoryModal jar={showJarHistory} onClose={() => setShowJarHistory(null)} />}
      
      {confirmModal.isOpen && <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6"><div className="bg-white p-6 rounded-3xl w-full max-w-xs text-center"><h3 className="font-bold mb-2">{confirmModal.title}</h3><p className="text-gray-400 text-sm mb-6">{confirmModal.message}</p><div className="flex gap-2"><button onClick={() => setConfirmModal({isOpen:false})} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold">取消</button><button onClick={confirmModal.onConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">確定</button></div></div></div>}
    </div>
  );
}

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full ${active ? (role === 'bf' ? 'text-blue-600' : 'text-pink-600') : 'text-gray-400'}`}>
    <Icon size={24} />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const RoleSelection = ({ onSelect }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">歡迎來到我們的小天地</h1>
      <div className="space-y-4">
        <button onClick={() => onSelect('bf')} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-200">我是男朋友 👦</button>
        <button onClick={() => onSelect('gf')} className="w-full py-4 bg-pink-500 text-white rounded-2xl font-bold shadow-lg shadow-pink-200">我是女朋友 👧</button>
      </div>
    </div>
  </div>
);

const Overview = ({ transactions, onAdd, onEdit, onDelete }) => {
  const debt = useMemo(() => {
    let bfLent = 0;
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.category === 'repayment') {
        t.paidBy === 'bf' ? bfLent -= amt : bfLent += amt;
      } else {
        let gfS = 0, bfS = 0;
        if (t.splitType === 'shared') { gfS = amt/2; bfS = amt/2; }
        else if (t.splitType === 'bf_personal') { bfS = amt; }
        else if (t.splitType === 'gf_personal') { gfS = amt; }
        else if (t.splitDetails) { bfS = t.splitDetails.bf; gfS = t.splitDetails.gf; }
        if (t.paidBy === 'bf') bfLent += gfS; else bfLent -= bfS;
      }
    });
    return bfLent;
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">結算狀態</h2>
        <div className="flex items-center justify-center gap-2">
          {Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500">💕 互不相欠</div> : <><span className={`text-2xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男友' : '女友'}</span><span className="text-gray-400 text-xs">先墊了</span><span className="text-2xl font-bold text-gray-800">{formatMoney(Math.abs(debt))}</span></>}
        </div>
      </div>
      <div className="flex justify-between items-center"><h3 className="font-bold text-lg">最近紀錄</h3><button onClick={onAdd} className="bg-gray-900 text-white p-3 rounded-2xl shadow-lg active:scale-95"><Plus size={20}/></button></div>
      <div className="space-y-3">
        {transactions.map(t => (
          <div key={t.id} onClick={() => onEdit(t)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-lg">{CATEGORIES.find(c => c.id === t.category)?.icon || '🏷️'}</div>
               <div><div className="font-bold text-gray-800">{t.note || '未命名項目'}</div><div className="text-[10px] text-gray-400">{t.date} • {t.paidBy === 'bf' ? '男友付' : '女友付'}</div></div>
            </div>
            <div className="flex items-center gap-3">
               <span className="font-black text-gray-800">{formatMoney(t.amount)}</span>
               <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-300"><Trash2 size={16}/></button>
            </div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">此帳本尚無紀錄，開始記帳吧！</div>}
      </div>
    </div>
  );
};

const BookManagerModal = ({ initialData, onClose, onSave, onArchive }) => {
  const [name, setName] = useState(initialData?.name || '');
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-xl">{initialData ? '帳本設定' : '新增帳本'}</h2><button onClick={onClose}><X/></button></div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="例如：日常支出、日本旅遊" className="w-full bg-gray-100 p-4 rounded-2xl font-bold border-none outline-none mb-4" />
        <div className="grid grid-cols-1 gap-3">
           <button onClick={() => onSave(name)} className="py-4 bg-gray-900 text-white rounded-2xl font-bold shadow-lg">儲存帳本</button>
           {initialData && (
             <button onClick={() => onArchive(initialData.id)} className="py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold flex items-center justify-center gap-2">
                <Archive size={18}/> {initialData.status === 'archived' ? '還原帳本' : '封存至歷史紀錄'}
             </button>
           )}
        </div>
      </div>
    </div>
  );
};

const AIScanner = ({ onExtracted, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef();

  const handleScan = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result;
        const prompt = `你是一個專業的記帳助理。請辨識這張收據/明細照片。
          1. 辨識每個品項的原始名稱。
          2. 將品項名稱翻譯成台灣繁體中文。
          3. 提取金額、總金額、日期。
          4. 判斷品項類別 (food, transport, shopping, travel, entertainment, house, other)。
          請以 JSON 格式輸出。`;
        
        const res = await callGeminiAI(prompt, base64);
        const data = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (data) {
          onExtracted(JSON.parse(data));
        }
      };
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-blue-50 rounded-3xl border-2 border-dashed border-blue-200">
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <p className="font-bold text-blue-600">AI 正在辨識並翻譯明細...</p>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <Camera size={48} className="mx-auto text-blue-400" />
          <div>
            <h3 className="font-bold text-lg">AI 智慧掃描</h3>
            <p className="text-sm text-gray-500">上傳明細圖片，自動翻譯並分帳</p>
          </div>
          <button onClick={() => fileInputRef.current.click()} className="px-8 py-3 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-100">選擇圖片</button>
          <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={(e) => handleScan(e.target.files[0])} />
        </div>
      )}
    </div>
  );
};

const AddTransactionModal = ({ onClose, onSave, role, initialData }) => {
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [note, setNote] = useState(initialData?.note || '');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(initialData?.category || 'food');
  const [paidBy, setPaidBy] = useState(initialData?.paidBy || role);
  const [splitType, setSplitType] = useState(initialData?.splitType || 'shared');
  
  const [scannerMode, setScannerMode] = useState(false);
  const [extractedItems, setExtractedItems] = useState(null);

  const handleAISuccess = (data) => {
    setExtractedItems(data.items.map(item => ({ ...item, split: 'shared' })));
    setAmount(data.total_amount.toString());
    setNote(data.items[0]?.translated_name || 'AI 掃描項目');
    if (data.date) setDate(data.date);
    setScannerMode(false);
  };

  const handleItemSplit = (index, type) => {
    const updated = [...extractedItems];
    updated[index].split = type;
    setExtractedItems(updated);
  };

  const saveFinal = () => {
    if (extractedItems) {
      let bfTotal = 0, gfTotal = 0;
      extractedItems.forEach(item => {
        if (item.split === 'shared') { bfTotal += item.price/2; gfTotal += item.price/2; }
        else if (item.split === 'bf') { bfTotal += item.price; }
        else if (item.split === 'gf') { gfTotal += item.price; }
      });
      onSave({ amount, note, date, category, paidBy, splitType: 'custom', splitDetails: { bf: bfTotal, gf: gfTotal } });
    } else {
      onSave({ amount, note, date, category, paidBy, splitType });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-bold text-xl">{initialData ? '編輯紀錄' : (scannerMode ? '掃描明細' : '新紀錄')}</h2>
          <button onClick={onClose}><X/></button>
        </div>

        {scannerMode ? (
          <AIScanner onExtracted={handleAISuccess} onCancel={() => setScannerMode(false)} />
        ) : (
          <div className="space-y-4">
            {!initialData && !extractedItems && (
              <button onClick={() => setScannerMode(true)} className="w-full p-4 bg-blue-50 text-blue-600 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 border-blue-100">
                <Camera size={20} /> 使用 AI 掃描外語明細
              </button>
            )}

            {extractedItems ? (
              <div className="space-y-3 bg-gray-50 p-4 rounded-3xl border border-gray-100">
                <div className="flex items-center gap-2 text-blue-600 mb-2"><Languages size={18}/> <span className="text-sm font-bold">已自動翻譯並提取品項</span></div>
                {extractedItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-bold text-gray-700">{item.translated_name} <span className="text-[10px] text-gray-400 font-normal">({item.original_name})</span></div>
                      <div className="font-bold text-gray-900">{formatMoney(item.price)}</div>
                    </div>
                    <div className="flex gap-1">
                       {['shared', 'bf', 'gf'].map(t => (
                         <button key={t} onClick={() => handleItemSplit(idx, t)} className={`flex-1 py-1 rounded-lg text-[10px] font-bold ${item.split === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-400'}`}>
                           {t === 'shared' ? '平分' : (t === 'bf' ? '男友' : '女友')}
                         </button>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 p-6 rounded-3xl text-center">
                <div className="text-4xl font-black text-gray-800 mb-2">{amount || '0'}</div>
                <div className="text-gray-400 text-xs tracking-widest uppercase">金額</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 p-4 rounded-2xl font-bold outline-none" />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="備註..." className="bg-gray-50 p-4 rounded-2xl font-bold outline-none" />
            </div>

            <div className="flex overflow-x-auto gap-2 py-2 hide-scrollbar">
               {CATEGORIES.map(c => (
                 <button key={c.id} onClick={() => setCategory(c.id)} className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${category === c.id ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-100 bg-white'}`}>{c.name}</button>
               ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="p-4 bg-gray-50 rounded-2xl text-center">
                 <div className="text-[10px] font-bold text-gray-400 mb-2">誰付錢?</div>
                 <div className="flex gap-1 p-1 bg-white rounded-xl shadow-sm">
                   <button onClick={() => setPaidBy('bf')} className={`flex-1 py-1 rounded-lg text-xs font-bold ${paidBy === 'bf' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}>男友</button>
                   <button onClick={() => setPaidBy('gf')} className={`flex-1 py-1 rounded-lg text-xs font-bold ${paidBy === 'gf' ? 'bg-pink-500 text-white' : 'text-gray-400'}`}>女友</button>
                 </div>
               </div>
               {!extractedItems && (
                 <div className="p-4 bg-gray-50 rounded-2xl text-center">
                  <div className="text-[10px] font-bold text-gray-400 mb-2">分帳</div>
                  <select value={splitType} onChange={e => setSplitType(e.target.value)} className="w-full text-xs font-bold p-1 border-none outline-none bg-transparent">
                    <option value="shared">平分</option>
                    <option value="bf_personal">男友全付</option>
                    <option value="gf_personal">女友全付</option>
                  </select>
                </div>
               )}
            </div>

            {!extractedItems && <CalculatorKeypad value={amount} onChange={setAmount} compact={true} />}
            
            <button onClick={saveFinal} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
               <Save size={20} /> 儲存紀錄
            </button>
          </div>
        )}
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
  
  const total = useMemo(() => monthTransactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [monthTransactions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm">
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d); }} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>
        <span className="font-bold text-lg">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d); }} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button>
      </div>
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
         <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">本月總支出</div>
         <div className="text-4xl font-black text-gray-800">{formatMoney(total)}</div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
         {monthTransactions.map(t => (
           <div key={t.id} className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className="text-lg">{CATEGORIES.find(c => c.id === t.category)?.icon || '🏷️'}</div>
                 <div><div className="text-sm font-bold">{t.note || '項目'}</div><div className="text-[10px] text-gray-400">{t.date}</div></div>
              </div>
              <div className="font-bold">{formatMoney(t.amount)}</div>
           </div>
         ))}
         {monthTransactions.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">本月尚無數據</div>}
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onDelete, onHistory }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center"><h2 className="font-bold text-xl">存錢目標</h2><button onClick={onAdd} className="bg-gray-900 text-white p-2 px-4 rounded-2xl font-bold flex items-center gap-2"><Plus size={18}/> 新增</button></div>
    <div className="grid gap-4">
      {jars.map(jar => {
        const cur = Number(jar.currentAmount) || 0; const tgt = Number(jar.targetAmount) || 1; const progress = Math.min((cur / tgt) * 100, 100);
        return (
          <div key={jar.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10"><div><h3 className="font-bold text-lg">{jar.name}<button onClick={() => onEdit(jar)} className="ml-2 text-gray-300"><Pencil size={12}/></button></h3><div className="text-xs text-gray-400 mt-1">目標 {formatMoney(tgt)}</div></div><div className="bg-yellow-100 text-yellow-700 font-bold px-3 py-1 rounded-full text-[10px]">{Math.round(progress)}%</div></div>
            <div className="mb-4 relative z-10"><div className="text-3xl font-black text-gray-800 mb-2">{formatMoney(cur)}</div><div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden"><div className="h-full bg-yellow-400" style={{ width: `${progress}%` }}></div></div></div>
            <div className="flex justify-between items-center relative z-10">
                <div className="flex -space-x-2"><div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[8px] text-blue-600 font-bold">👦</div><div className="w-8 h-8 rounded-full bg-pink-100 border-2 border-white flex items-center justify-center text-[8px] text-pink-600 font-bold">👧</div></div>
                <div className="flex gap-2">
                    <button onClick={() => onHistory(jar)} className="p-2 bg-gray-50 text-gray-400 rounded-xl"><History size={16}/></button>
                    <button onClick={() => onDelete(jar.id)} className="p-2 bg-gray-50 text-gray-400 rounded-xl"><Trash2 size={16}/></button>
                    <button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-bold">存錢</button>
                </div>
            </div>
            <PiggyBank className="absolute -bottom-6 -right-6 text-gray-50 opacity-20 z-0" size={140} />
          </div>
        );
      })}
    </div>
  </div>
);

const AddJarModal = ({ onClose, onSave, initialData }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [target, setTarget] = useState(initialData?.targetAmount?.toString() || '');
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
        <h2 className="font-bold text-xl mb-4">{initialData ? '修改存錢罐' : '新存錢計畫'}</h2>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="計畫名稱..." className="w-full bg-gray-50 p-4 rounded-2xl mb-4 font-bold outline-none" />
        <div className="bg-gray-50 p-4 rounded-2xl mb-4 text-center">
           <div className="text-3xl font-black">{target || '0'}</div>
           <div className="text-[10px] text-gray-400 uppercase font-bold mt-1">目標金額</div>
        </div>
        <CalculatorKeypad value={target} onChange={setTarget} compact={true} />
        <button onClick={() => onSave(name, target)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold mt-4">儲存計畫</button>
      </div>
    </div>
  );
};

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
  const [amount, setAmount] = useState('');
  const [depositor, setDepositor] = useState(role);
  if (!jar) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
        <h2 className="font-bold text-xl mb-4">存入: {jar.name}</h2>
        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl mb-4">
          <button onClick={() => setDepositor('bf')} className={`flex-1 py-2 rounded-xl text-xs font-bold ${depositor === 'bf' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-400'}`}>男友存 👦</button>
          <button onClick={() => setDepositor('gf')} className={`flex-1 py-2 rounded-xl text-xs font-bold ${depositor === 'gf' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-400'}`}>女友存 👧</button>
        </div>
        <div className="bg-green-50 p-6 rounded-3xl text-center mb-4">
          <div className="text-4xl font-black text-green-600">+{amount || '0'}</div>
          <div className="text-[10px] text-green-400 font-bold uppercase mt-1">存入金額</div>
        </div>
        <CalculatorKeypad value={amount} onChange={setAmount} compact={true} />
        <button onClick={() => onConfirm(jar.id, amount, depositor)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold mt-4 shadow-xl">確認存錢 💰</button>
      </div>
    </div>
  );
};

const JarHistoryModal = ({ jar, onClose }) => {
  const history = [...(jar.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-xl">存錢紀錄</h2><button onClick={onClose}><X/></button></div>
        <div className="space-y-3">
           {history.map(item => (
             <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${item.role === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{item.role === 'bf' ? '👦' : '👧'}</div>
                   <div><div className="text-xs text-gray-400">{item.date.split('T')[0]}</div><div className="font-bold">{formatMoney(item.amount)}</div></div>
                </div>
             </div>
           ))}
           {history.length === 0 && <div className="text-center py-8 text-gray-400">尚無存款紀錄</div>}
        </div>
      </div>
    </div>
  );
};
