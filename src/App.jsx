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
  Camera, Archive, Reply, Loader2, Image as ImageIcon
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDPUjZ1dUV52O7JUeY-7befolezIWpI6vo",
  authDomain: "money-49190.firebaseapp.com",
  projectId: "money-49190",
  storageBucket: "money-49190.firebasestorage.app",
  messagingSenderId: "706278541664",
  appId: "1:706278541664:web:aef08ba776587a1101b605",
  measurementId: "G-XD01TYP1PQ"
};

// --- Constants ---
const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042' },
  { id: 'transport', name: '交通', color: '#00C49F' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28' },
  { id: 'shopping', name: '購物', color: '#0088FE' },
  { id: 'house', name: '居家', color: '#8884d8' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B' },
  { id: 'other', name: '其他', color: '#999' },
];

// --- Helpers ---
const formatMoney = (amount) => {
  const num = Math.round(Number(amount));
  if (isNaN(num)) return '$0';
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(num);
};

const getTransactionShares = (t) => {
  const amt = Number(t.amount) || 0;
  if (t.category === 'repayment') return { bf: 0, gf: 0 };
  let bfShare = 0, gfShare = 0;
  if (t.splitType === 'shared') { bfShare = amt / 2; gfShare = amt / 2; }
  else if (t.splitType === 'bf_personal') { bfShare = amt; gfShare = 0; }
  else if (t.splitType === 'gf_personal') { bfShare = 0; gfShare = amt; }
  else if ((t.splitType === 'custom' || t.splitType === 'ratio') && t.splitDetails) {
    bfShare = Number(t.splitDetails.bf) || 0;
    gfShare = Number(t.splitDetails.gf) || 0;
  } else { bfShare = amt / 2; gfShare = amt / 2; }
  return { bf: bfShare, gf: gfShare };
};

const safeCalculate = (expression) => {
  try {
    const sanitized = (expression || '').toString().replace(/[^0-9+\-*/.]/g, '');
    if (!sanitized) return '';
    // eslint-disable-next-line no-eval
    const result = Function(`"use strict"; return (${sanitized})`)();
    return isNaN(result) || !isFinite(result) ? '' : Math.floor(result).toString();
  } catch (e) { return ''; }
};

// --- API Helpers ---
const analyzeReceiptImage = async (base64Image, mimeType = "image/jpeg") => {
    const apiKey = ""; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const prompt = `Analyze this receipt image. Return valid JSON with: date (YYYY-MM-DD), items (name in TW Chinese, price, category ID from: food, transport, entertainment, shopping, house, travel, other), and total.`;
    const payload = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }] }],
        generationConfig: { responseMimeType: "application/json" }
    };
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(text);
    } catch (error) { throw error; }
};

// --- Main App ---
let app;
try { app = initializeApp(firebaseConfig); } catch (e) {}
const auth = getAuth(app);
const db = getFirestore(app);
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'couple-ledger-pro';
const appId = rawAppId.replace(/\//g, '_').replace(/\./g, '_');

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
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  useEffect(() => {
    // 確保 Tailwind 加載
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }

    const initAuth = async () => { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try { await signInWithCustomToken(auth, __initial_auth_token); } catch(e) { await signInAnonymously(auth); }
        } else {
            try { await signInAnonymously(auth); } catch (e) {} 
        }
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

  useEffect(() => {
    if (!user) return;
    const unsubBooks = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'books'), (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        if (data.length === 0 && !s.metadata.hasPendingWrites) {
           addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), { name: "預設帳本", status: 'active', createdAt: serverTimestamp() });
           return; 
        }
        setBooks(data);
        setActiveBookId(prev => (prev && data.find(b => b.id === prev)) ? prev : (data.find(b => (b.status || 'active') === 'active')?.id || data[0]?.id));
    });

    const unsubTrans = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), (s) => {
      setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date) || (b.createdAt?.seconds - a.createdAt?.seconds)));
    });

    const unsubJars = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), (s) => {
      setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    });
    
    return () => { unsubTrans(); unsubJars(); unsubBooks(); };
  }, [user]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      return transactions.filter(t => t.bookId === activeBookId || (!t.bookId && activeBookId === books[0]?.id));
  }, [transactions, activeBookId, books]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  if (loading) return <AppLoading />;
  if (!role) return <RoleSelection onSelect={(r) => { setRole(r); localStorage.setItem('couple_app_role', r); }} />;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24 overflow-x-hidden">
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      
      {/* Header */}
      <div className={`p-4 text-white shadow-lg sticky top-0 z-40 transition-colors ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Heart className="fill-white animate-pulse" size={18} />
            <h1 className="text-lg font-bold">我們的小金庫</h1>
          </div>
          <div className="flex items-center gap-3">
             {activeTab === 'overview' && (
                <button onClick={() => setViewArchived(!viewArchived)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${viewArchived ? 'bg-white text-gray-800 border-white' : 'bg-transparent text-white/80 border-white/30'}`}>
                    {viewArchived ? <Archive size={12}/> : <Book size={12}/>}
                    {viewArchived ? '歷史帳本' : '使用中'}
                </button>
             )}
             <div className="text-xs bg-black/10 px-3 py-1 rounded-full">{role === 'bf' ? '👦 男朋友' : '👧 女朋友'}</div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Book Selector */}
        {activeTab === 'overview' && (
            <div className="mb-4 flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
                {books.filter(b => viewArchived ? b.status === 'archived' : b.status !== 'archived').map(book => (
                    <button key={book.id} onClick={() => setActiveBookId(book.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeBookId === book.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                        <Book size={14} /> {book.name}
                        {activeBookId === book.id && <Settings size={12} onClick={(e) => { e.stopPropagation(); setEditingBook(book); setShowBookManager(true); }} className="ml-1 opacity-60 hover:opacity-100"/>}
                    </button>
                ))}
                {!viewArchived && <button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2 bg-white text-gray-400 rounded-xl shadow-sm hover:bg-gray-50"><Plus size={18} /></button>}
            </div>
        )}
        
        {activeTab === 'overview' && <Overview transactions={filteredTransactions} role={role} readOnly={viewArchived} onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} onScan={() => setShowScanner(true)} onEdit={(t) => { if(!viewArchived) { setEditingTransaction(t); setShowAddTransaction(true); }}} onDelete={(id) => !viewArchived && setConfirmModal({ isOpen: true, title: "刪除紀錄", message: "確定要刪除這筆開銷嗎？", isDanger: true, onConfirm: () => { deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id)); setConfirmModal({isOpen:false}); showToast('已刪除'); } })} />}
        {activeTab === 'stats' && <Statistics transactions={filteredTransactions} />}
        {activeTab === 'savings' && <Savings jars={jars} role={role} onAdd={() => { setEditingJar(null); setShowAddJar(true); }} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onDelete={(id) => setConfirmModal({ isOpen: true, title: "打破存錢罐", message: "這將永久刪除此目標，確定嗎？", isDanger: true, onConfirm: () => { deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id)); setConfirmModal({isOpen:false}); showToast('目標已移除'); } })} onHistory={(j) => setShowJarHistory(j)} />}
        {activeTab === 'settings' && <SettingsView role={role} onLogout={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} />}
      </div>

      {/* Nav */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
        </div>
      </div>

      {/* Modals */}
      {showAddTransaction && <AddTransactionModal onClose={() => setShowAddTransaction(false)} onSave={async (data) => { 
          const cleanData = { ...data, bookId: activeBookId };
          editingTransaction ? await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', editingTransaction.id), cleanData) : await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), { ...cleanData, createdAt: serverTimestamp() });
          setShowAddTransaction(false); showToast('已儲存 ✨');
      }} currentUserRole={role} initialData={editingTransaction} />}
      
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={async (name, target) => {
          const jarData = { name, targetAmount: Number(target), updatedAt: serverTimestamp() };
          editingJar ? await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), jarData) : await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { ...jarData, currentAmount: 0, contributions: { bf: 0, gf: 0 }, history: [], createdAt: serverTimestamp() });
          setShowAddJar(false); showToast('存錢罐已就緒 💰');
      }} initialData={editingJar} />}

      {showJarDeposit && <DepositModal jar={jars.find(j => j.id === showJarDeposit)} onClose={() => setShowJarDeposit(null)} onConfirm={async (id, amount, depRole) => {
          const jar = jars.find(j => j.id === id);
          const amt = Number(amount);
          const newHistory = [{ id: Date.now().toString(), amount: amt, role: depRole, date: new Date().toISOString() }, ...(jar.history || [])];
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id), { 
            currentAmount: (jar.currentAmount || 0) + amt, 
            contributions: { ...jar.contributions, [depRole]: (jar.contributions?.[depRole] || 0) + amt },
            history: newHistory
          });
          setShowJarDeposit(null); showToast('存進去囉！');
      }} role={role} />}

      {showJarHistory && <JarHistoryModal jar={showJarHistory} onClose={() => setShowJarHistory(null)} />}
      {showScanner && <ReceiptScannerModal onClose={() => setShowScanner(false)} onConfirm={(data) => { setEditingTransaction(data); setShowScanner(false); setShowAddTransaction(true); }} />}
      {confirmModal.isOpen && <ConfirmModal {...confirmModal} onClose={() => setConfirmModal({isOpen:false})} />}
      {toast && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-xl z-[100] flex items-center gap-3 animate-bounce"><CheckCircle size={18} className="text-green-400" />{toast}</div>}
    </div>
  );
}

// --- Components ---

const AppLoading = () => (
  <div className="fixed inset-0 bg-white flex flex-col items-center justify-center">
    <div className="animate-pulse bg-pink-100 p-6 rounded-full mb-4"><Heart className="text-pink-500" size={48} /></div>
    <h2 className="text-xl font-bold text-gray-700">正在準備小金庫...</h2>
  </div>
);

const RoleSelection = ({ onSelect }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border border-gray-100">
      <h1 className="text-2xl font-bold mb-6">歡迎使用小金庫</h1>
      <p className="text-gray-400 text-sm mb-8">請選擇您在小金庫中的身分</p>
      <div className="space-y-4">
        <button onClick={() => onSelect('bf')} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all">我是男朋友 👦</button>
        <button onClick={() => onSelect('gf')} className="w-full py-4 bg-pink-500 text-white rounded-2xl font-bold shadow-lg shadow-pink-100 hover:scale-[1.02] active:scale-95 transition-all">我是女朋友 👧</button>
      </div>
    </div>
  </div>
);

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full transition-all ${active ? (role === 'bf' ? 'text-blue-600 scale-110' : 'text-pink-600 scale-110') : 'text-gray-400'}`}>
    <Icon size={24} strokeWidth={active ? 2.5 : 2} />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const Overview = ({ transactions, role, onAdd, onEdit, onDelete, onScan, readOnly }) => {
  const debt = useMemo(() => {
    let bfLent = 0;
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.category === 'repayment') { t.paidBy === 'bf' ? bfLent -= amt : bfLent += amt; }
      else {
        const { gf: gfShare, bf: bfShare } = getTransactionShares(t);
        if (t.paidBy === 'bf') bfLent += gfShare; else bfLent -= bfShare;
      }
    });
    return bfLent;
  }, [transactions]);

  const grouped = useMemo(() => {
    const groups = {};
    transactions.forEach(t => { 
        if (!t.date) return; 
        if (!groups[t.date]) groups[t.date] = { items: [], bfTotal: 0, gfTotal: 0 }; 
        groups[t.date].items.push(t);
        const { bf, gf } = getTransactionShares(t);
        groups[t.date].bfTotal += bf;
        groups[t.date].gfTotal += gf;
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [transactions]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1.5 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-3">帳本結算餘額</h2>
        <div className="flex items-center justify-center gap-3">
          {Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500 flex items-center gap-2"><CheckCircle size={28}/> 互不相欠</div> : <><span className={`text-3xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男朋友' : '女朋友'}</span><span className="text-gray-400 text-sm font-bold">目前多出了</span><span className="text-3xl font-black text-gray-800">{formatMoney(Math.abs(debt))}</span></>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
            <h3 className="font-extrabold text-xl text-gray-800">消費明細</h3>
            {!readOnly && (
                <div className="flex gap-2">
                    <button onClick={onScan} className="bg-purple-100 text-purple-600 p-3 rounded-2xl active:scale-90 transition-transform"><Camera size={20} /></button>
                    <button onClick={onAdd} className="bg-gray-900 text-white p-3 rounded-2xl shadow-lg active:scale-90 transition-transform"><Plus size={20} /></button>
                </div>
            )}
        </div>
        {grouped.length === 0 ? <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 text-gray-400 font-bold">還沒有任何紀錄喔</div> : grouped.map(([date, group]) => (
            <div key={date} className="space-y-2 mb-4">
              <div className="flex justify-between items-center px-3">
                  <div className="text-xs font-black text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{date}</div>
                  <div className="flex gap-4 text-[10px] font-black">
                      <span className="text-blue-500 bg-blue-50 px-2 py-1 rounded-md">👦 {formatMoney(group.bfTotal)}</span>
                      <span className="text-pink-500 bg-pink-50 px-2 py-1 rounded-md">👧 {formatMoney(group.gfTotal)}</span>
                  </div>
              </div>
              {group.items.map(t => (
                <div key={t.id} onClick={() => onEdit(t)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between hover:border-gray-200 transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center text-white text-xl shadow-inner" style={{ backgroundColor: CATEGORIES.find(c => c.id === t.category)?.color || '#999' }}>
                        {t.category === 'repayment' ? <RefreshCw size={20} /> : (t.category === 'food' ? '🍔' : (t.category === 'shopping' ? '🛍️' : '🛒'))}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-800 truncate leading-tight">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div>
                        <div className="text-[10px] text-gray-400 flex flex-wrap gap-x-2 gap-y-0.5 mt-1 items-center">
                            <span className={`font-black ${t.paidBy === 'bf' ? 'text-blue-400' : 'text-pink-400'}`}>{t.paidBy === 'bf' ? '男友支付' : '女友支付'}</span>
                            <span className="opacity-30">•</span>
                            <span className="font-medium">👦{formatMoney(getTransactionShares(t).bf)} 👧{formatMoney(getTransactionShares(t).gf)}</span>
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                      <span className={`font-black text-lg ${t.category === 'repayment' ? 'text-green-500' : 'text-gray-800'}`}>{formatMoney(t.amount)}</span>
                      {!readOnly && <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-200 hover:text-red-400 transition-colors p-1"><Trash2 size={18} /></button>}
                  </div>
                </div>
              ))}
            </div>
        ))}
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onDelete, onHistory }) => (
  <div className="space-y-6 animate-in slide-in-from-right duration-500">
    <div className="flex justify-between items-center px-2">
      <h2 className="font-extrabold text-2xl text-gray-800">存錢目標</h2>
      <button onClick={onAdd} className="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-2xl font-black text-sm shadow-lg shadow-yellow-100 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"><Plus size={18} /> 新目標</button>
    </div>
    <div className="grid gap-5">
      {jars.map(jar => {
        const cur = Number(jar.currentAmount) || 0;
        const tgt = Number(jar.targetAmount) || 1;
        const progress = Math.min((cur / tgt) * 100, 100);
        return (
          <div key={jar.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <h3 className="font-black text-xl text-gray-800 flex items-center gap-2">{jar.name} <button onClick={() => onEdit(jar)} className="text-gray-300 hover:text-gray-500"><Pencil size={14}/></button></h3>
                <p className="text-xs text-gray-400 font-bold mt-1">目標: {formatMoney(tgt)}</p>
              </div>
              <div className="bg-yellow-100 text-yellow-700 font-black px-3 py-1 rounded-full text-xs">{Math.round(progress)}%</div>
            </div>
            
            <div className="mb-5 relative z-10">
              <div className="text-4xl font-black text-gray-800 mb-2">{formatMoney(cur)}</div>
              <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden border border-gray-50">
                <div className="h-full bg-gradient-to-r from-yellow-300 to-orange-400 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
              </div>
            </div>

            <div className="flex justify-between items-center relative z-10">
                <div className="flex -space-x-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 border-4 border-white flex items-center justify-center text-[10px] text-white font-black" title="男友">{Math.round(((jar.contributions?.bf||0)/cur)*100 || 0)}%</div>
                    <div className="w-10 h-10 rounded-full bg-pink-500 border-4 border-white flex items-center justify-center text-[10px] text-white font-black" title="女友">{Math.round(((jar.contributions?.gf||0)/cur)*100 || 0)}%</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => onHistory(jar)} className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-gray-100 transition-colors"><History size={20}/></button>
                    <button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-md hover:scale-105 active:scale-95 transition-all">存錢</button>
                    <button onClick={() => onDelete(jar.id)} className="p-3 text-gray-200 hover:text-red-400 transition-colors"><Trash2 size={20}/></button>
                </div>
            </div>
            <PiggyBank className="absolute -bottom-6 -right-6 text-gray-50 opacity-40 z-0 transform -rotate-12" size={140} />
          </div>
        );
      })}
      {jars.length === 0 && <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100 text-gray-300 font-bold">還沒有存錢計畫，快來建立一個！</div>}
    </div>
  </div>
);

const Statistics = ({ transactions }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthTransactions = useMemo(() => transactions.filter(t => { 
      const d = new Date(t.date); 
      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear() && t.category !== 'repayment'; 
  }), [transactions, currentDate]);

  const { chartData, total, bfMonthTotal, gfMonthTotal } = useMemo(() => {
    const map = {}; let monthSum = 0, bfSum = 0, gfSum = 0;
    monthTransactions.forEach(t => { 
        const amt = Number(t.amount) || 0; 
        if (!map[t.category]) map[t.category] = 0; 
        map[t.category] += amt; monthSum += amt;
        const { bf, gf } = getTransactionShares(t);
        bfSum += bf; gfSum += gf;
    });
    const sorted = Object.entries(map).map(([id, value]) => ({ id, value, color: CATEGORIES.find(c => c.id === id)?.color || '#999', name: CATEGORIES.find(c => c.id === id)?.name || '未知' })).sort((a, b) => b.value - a.value);
    return { chartData: sorted, total: monthSum, bfMonthTotal: bfSum, gfMonthTotal: gfSum };
  }, [monthTransactions]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl shadow-sm border border-gray-50">
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); }} className="p-3 bg-gray-50 rounded-2xl"><ChevronLeft size={20}/></button>
        <span className="font-black text-xl text-gray-800">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); }} className="p-3 bg-gray-50 rounded-2xl"><ChevronRight size={20}/></button>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
        <SimpleDonutChart data={chartData} total={total} />
        
        {total > 0 && (
            <div className="mt-10 pt-8 border-t border-gray-50">
                <h4 className="text-center text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6">本月負擔比例統計</h4>
                <div className="flex justify-between items-end mb-4 px-2">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-blue-400 mb-1">男朋友負擔</span>
                        <span className="text-2xl font-black text-blue-600">{formatMoney(bfMonthTotal)}</span>
                        <span className="text-xs font-bold text-gray-400 mt-1">{Math.round((bfMonthTotal/total)*100)}%</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-pink-400 mb-1">女朋友負擔</span>
                        <span className="text-2xl font-black text-pink-600">{formatMoney(gfMonthTotal)}</span>
                        <span className="text-xs font-bold text-gray-400 mt-1">{Math.round((gfMonthTotal/total)*100)}%</span>
                    </div>
                </div>
                <div className="w-full h-4 bg-gray-100 rounded-full flex overflow-hidden border border-gray-50">
                    <div className="bg-gradient-to-r from-blue-400 to-blue-500 h-full transition-all duration-700" style={{ width: `${(bfMonthTotal/total)*100}%` }}></div>
                    <div className="bg-gradient-to-r from-pink-400 to-pink-500 h-full transition-all duration-700" style={{ width: `${(gfMonthTotal/total)*100}%` }}></div>
                </div>
            </div>
        )}
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 bg-gray-50 border-b border-gray-100 font-black text-gray-600 flex justify-between uppercase text-xs tracking-widest">
            <span>分類排行榜</span>
            <span>總額</span>
        </div>
        <div className="divide-y divide-gray-50">
            {chartData.length === 0 ? <div className="p-12 text-center text-gray-400 font-bold">目前無消費數據</div> : chartData.map(d => (
                <div key={d.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: d.color }}></div>
                        <div>
                            <span className="font-black text-gray-800">{d.name}</span>
                            <div className="text-[10px] text-gray-400 font-bold">{Math.round((d.value/total)*100)}% 的總支出</div>
                        </div>
                    </div>
                    <span className="font-black text-gray-700 text-lg">{formatMoney(d.value)}</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

const SimpleDonutChart = ({ data, total }) => {
  if (!total || total === 0) return <div className="h-48 flex items-center justify-center text-gray-300 font-black italic">暫無開銷數據</div>;
  let accumulated = 0;
  return (
    <div className="relative w-56 h-56 mx-auto">
      <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f9fafb" strokeWidth="5.5"></circle>
        {data.map((item, i) => {
          const p = (item.value / total) * 100;
          const stroke = `${p} ${100-p}`;
          const offset = 100 - accumulated;
          accumulated += p;
          return <circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={item.color} strokeWidth="5.5" strokeDasharray={stroke} strokeDashoffset={offset} className="transition-all duration-1000 ease-in-out" strokeLinecap="round" />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs text-gray-400 font-black uppercase tracking-widest mb-1">總開銷</span>
        <span className="text-3xl font-black text-gray-800">{formatMoney(total)}</span>
      </div>
    </div>
  );
};

// --- Modals ---

const ModalLayout = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-300" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
                <h2 className="font-black text-lg text-gray-800">{title}</h2>
                <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-400"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[85vh] hide-scrollbar">{children}</div>
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

  const calculateAndSave = () => {
      const finalAmt = Number(safeCalculate(amount));
      if (!finalAmt) return;
      const details = (splitType === 'custom' || splitType === 'ratio') ? { bf: Number(customBf), gf: Number(customGf) } : null;
      onSave({ amount: finalAmt, note, date, category, paidBy, splitType, splitDetails: details });
  };

  return (
    <ModalLayout title={initialData ? "修改這筆紀錄" : "記一筆開銷"} onClose={onClose}>
        <div className="space-y-5">
            <div className="bg-gray-50 p-6 rounded-[2rem] border-2 border-transparent focus-within:border-blue-100 transition-all">
                <div className="text-4xl font-black text-center tracking-tighter text-gray-800">{amount || '0'}</div>
            </div>
            <div className="flex gap-3">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold flex-shrink-0 focus:ring-2 focus:ring-gray-100" />
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="寫點什麼備註..." className="bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold flex-1 focus:ring-2 focus:ring-gray-100" />
            </div>
            
            <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar">
                {CATEGORIES.map(c => (
                    <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap border-2 transition-all ${category === c.id ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'}`}>{c.name}</button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-2xl text-center">
                    <div className="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">付款人</div>
                    <div className="flex gap-1.5 p-1 bg-white rounded-xl shadow-sm">
                        <button onClick={() => setPaidBy('bf')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${paidBy === 'bf' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-300'}`}>男友</button>
                        <button onClick={() => setPaidBy('gf')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${paidBy === 'gf' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-300'}`}>女友</button>
                    </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-2xl text-center">
                    <div className="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">分帳比例</div>
                    <select value={splitType} onChange={e => setSplitType(e.target.value)} className="w-full text-xs font-black bg-white border-none rounded-xl p-2 text-center shadow-sm">
                        <option value="shared">50/50 平分</option>
                        <option value="bf_personal">男友全額</option>
                        <option value="gf_personal">女友全額</option>
                        <option value="custom">自訂金額</option>
                    </select>
                </div>
            </div>
            {splitType === 'custom' && (
                <div className="flex gap-3 items-center bg-blue-50 p-4 rounded-2xl border border-blue-100 animate-in zoom-in-95 duration-300">
                    <div className="flex-1"><label className="text-[10px] font-black text-blue-400 block mb-1">男友負擔</label><input type="number" value={customBf} onChange={e => { const v = e.target.value; setCustomBf(v); setCustomGf(Number(amount)-v); }} className="w-full p-2 rounded-xl text-sm font-black text-center border-none" /></div>
                    <div className="text-blue-200 mt-4">+</div>
                    <div className="flex-1"><label className="text-[10px] font-black text-pink-400 block mb-1">女友負擔</label><input type="number" value={customGf} onChange={e => { const v = e.target.value; setCustomGf(v); setCustomBf(Number(amount)-v); }} className="w-full p-2 rounded-xl text-sm font-black text-center border-none" /></div>
                </div>
            )}
            <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={calculateAndSave} />
        </div>
    </ModalLayout>
  );
};

const CalculatorKeypad = ({ value, onChange, onConfirm }) => {
    const handle = (key) => {
        if (key === 'C') onChange('');
        else if (key === 'back') onChange(value.toString().slice(0,-1));
        else if (key === '=') onConfirm();
        else onChange(value + key);
    };
    const keys = ['7','8','9','/','4','5','6','*','1','2','3','-','C','0','.','+'];
    return (
        <div className="bg-gray-100 p-3 rounded-[2rem] grid grid-cols-4 gap-2.5">
            {keys.map(k => <button key={k} onClick={() => handle(k)} className={`h-12 rounded-2xl font-black text-lg shadow-sm active:scale-90 transition-all ${['/','*','-','+'].includes(k) ? 'bg-blue-50 text-blue-500' : 'bg-white text-gray-700'}`}>{k}</button>)}
            <button onClick={() => handle('back')} className="h-12 col-span-2 bg-gray-200 text-gray-500 rounded-2xl flex items-center justify-center active:scale-95 transition-all"><ArrowLeft size={22}/></button>
            <button onClick={() => handle('=')} className="h-12 col-span-2 bg-green-500 text-white rounded-2xl font-black shadow-lg shadow-green-100 active:scale-95 transition-all">確認儲存</button>
        </div>
    );
};

const AddJarModal = ({ onClose, onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [target, setTarget] = useState(initialData?.targetAmount?.toString() || '');
    return (
        <ModalLayout title={initialData ? "編輯目標" : "建立新存錢計畫"} onClose={onClose}>
            <div className="space-y-4">
                <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="計畫名稱 (如: 日本之旅)" className="w-full bg-gray-50 border-none rounded-2xl p-4 font-black focus:ring-2 focus:ring-yellow-200" />
                <div className="bg-yellow-50 p-6 rounded-[2rem] text-center border border-yellow-100">
                    <span className="text-xs font-black text-yellow-500 uppercase tracking-widest block mb-2">目標達成金額</span>
                    <div className="text-3xl font-black text-yellow-700 tracking-tight">{target || '0'}</div>
                </div>
                <CalculatorKeypad value={target} onChange={setTarget} onConfirm={() => { if(name && target) onSave(name, target); }} />
            </div>
        </ModalLayout>
    );
};

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
    const [amount, setAmount] = useState('');
    const [depRole, setDepRole] = useState(role);
    return (
        <ModalLayout title={`存錢到: ${jar.name}`} onClose={onClose}>
            <div className="space-y-4">
                <div className="flex gap-2 p-1 bg-gray-50 rounded-2xl">
                    <button onClick={() => setDepRole('bf')} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${depRole === 'bf' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-400'}`}>👦 男友存</button>
                    <button onClick={() => setDepRole('gf')} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${depRole === 'gf' ? 'bg-pink-500 text-white shadow-md' : 'text-gray-400'}`}>👧 女友存</button>
                </div>
                <div className="bg-green-50 p-6 rounded-[2rem] text-center border border-green-100">
                    <span className="text-xs font-black text-green-500 uppercase tracking-widest block mb-1">存入金額</span>
                    <div className="text-4xl font-black text-green-700">+{amount || '0'}</div>
                </div>
                <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={() => { if(amount > 0) onConfirm(jar.id, amount, depRole); }} />
            </div>
        </ModalLayout>
    );
};

const JarHistoryModal = ({ jar, onClose }) => (
    <ModalLayout title={`${jar.name} 的存錢紀錄`} onClose={onClose}>
        <div className="space-y-3">
            {(jar.history || []).length === 0 ? <div className="text-center py-10 text-gray-300 font-bold">尚無任何存款紀錄</div> : jar.history.map(h => (
                <div key={h.id} className="bg-gray-50 p-4 rounded-2xl flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-white font-black ${h.role === 'bf' ? 'bg-blue-500' : 'bg-pink-500'}`}>{h.role === 'bf' ? '👦' : '👧'}</div>
                        <div>
                            <div className="text-xs text-gray-400 font-bold">{new Date(h.date).toLocaleDateString()}</div>
                            <div className="font-black text-gray-800">{formatMoney(h.amount)}</div>
                        </div>
                    </div>
                    <CheckCircle className="text-green-400" size={20} />
                </div>
            ))}
        </div>
    </ModalLayout>
);

const ConfirmModal = ({ title, message, isDanger, onConfirm, onClose }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-xs rounded-[2rem] p-8 shadow-2xl text-center">
            <h3 className="text-xl font-black mb-2 text-gray-800">{title}</h3>
            <p className="text-gray-400 text-sm font-bold mb-8 leading-relaxed">{message}</p>
            <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-4 bg-gray-50 rounded-2xl text-sm font-black text-gray-500 hover:bg-gray-100 transition-colors">取消</button>
                <button onClick={onConfirm} className={`flex-1 py-4 rounded-2xl text-sm font-black text-white shadow-lg ${isDanger ? 'bg-red-500 shadow-red-100' : 'bg-blue-500 shadow-blue-100'}`}>確定</button>
            </div>
        </div>
    </div>
);

const ReceiptScannerModal = ({ onClose, onConfirm }) => {
    const [step, setStep] = useState('upload'); 
    const handleFile = async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        setStep('analyzing');
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            try {
                const result = await analyzeReceiptImage(base64);
                onConfirm({ amount: result.total, note: result.items?.map(i=>i.name).join(', ').slice(0,20), category: result.items?.[0]?.category || 'other', date: result.date || new Date().toISOString().split('T')[0] });
            } catch (e) { setStep('error'); }
        };
        reader.readAsDataURL(file);
    };

    return (
        <ModalLayout title="AI 智慧收據掃描" onClose={onClose}>
            <div className="flex flex-col items-center justify-center py-10 gap-6">
                {step === 'upload' && (
                    <label className="w-full flex flex-col items-center justify-center border-4 border-dashed border-gray-100 rounded-[2.5rem] py-16 cursor-pointer hover:bg-gray-50 transition-all group">
                        <div className="bg-purple-100 p-6 rounded-full text-purple-600 mb-4 group-hover:scale-110 transition-transform"><Camera size={40}/></div>
                        <span className="font-black text-gray-600">點擊上傳或拍攝收據</span>
                        <span className="text-xs text-gray-300 font-bold mt-2 italic">AI 將自動辨識日期、品項與金額</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                    </label>
                )}
                {step === 'analyzing' && (
                    <div className="text-center">
                        <Loader2 size={64} className="animate-spin text-purple-500 mb-6 mx-auto" />
                        <h3 className="font-black text-xl text-gray-800">正在辨識中...</h3>
                        <p className="text-sm text-gray-400 font-bold mt-2">請稍候，AI 正在分析您的收據內容</p>
                    </div>
                )}
                {step === 'error' && (
                    <div className="text-center">
                        <div className="bg-red-100 text-red-500 p-6 rounded-full mb-6 mx-auto w-fit"><X size={40}/></div>
                        <h3 className="font-black text-xl text-gray-800">辨識失敗</h3>
                        <button onClick={()=>setStep('upload')} className="mt-6 bg-gray-900 text-white px-8 py-3 rounded-2xl font-black">重試一次</button>
                    </div>
                )}
            </div>
        </ModalLayout>
    );
};

const SettingsView = ({ role, onLogout }) => (
  <div className="space-y-6 animate-in zoom-in-95 duration-500">
    <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 text-center">
      <div className={`w-24 h-24 rounded-[2rem] mx-auto flex items-center justify-center text-5xl mb-6 shadow-xl ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div>
      <h2 className="font-black text-2xl text-gray-800 mb-1">{role === 'bf' ? '男朋友' : '女朋友'}</h2>
      <p className="text-gray-400 font-bold text-sm mb-10">已登入小金庫帳號</p>
      
      <div className="space-y-3">
          <button className="w-full py-4 bg-gray-50 text-gray-600 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors"><User size={20}/> 編輯個人資料</button>
          <button onClick={onLogout} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-red-100 transition-colors"><LogOut size={20}/> 切換身分 (登出)</button>
      </div>
    </div>
    <div className="bg-gray-900 p-8 rounded-[2.5rem] text-white relative overflow-hidden">
        <div className="relative z-10">
            <h3 className="font-black text-lg mb-2">關於我們的小金庫</h3>
            <p className="text-gray-400 text-xs font-medium leading-relaxed">這是一個專為情侶設計的記帳軟體，旨在幫助你們更輕鬆地管理共同開銷與存錢目標。每一筆開支都代表著我們共同生活的點點滴滴。</p>
        </div>
        <Heart className="absolute -bottom-10 -right-10 text-white/5" size={200} />
    </div>
  </div>
);
