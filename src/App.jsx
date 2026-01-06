import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, 
  deleteDoc, doc, updateDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  Heart, Wallet, PiggyBank, PieChart as PieChartIcon, 
  Plus, Trash2, User, Calendar, Target, Settings, LogOut,
  RefreshCw, Pencil, CheckCircle, X, ChevronLeft, ChevronRight, 
  ArrowLeft, Check, History
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

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  // Ignore
}
const auth = getAuth(app);
const db = getFirestore(app);

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const appId = rawAppId.replace(/\//g, '_').replace(/\./g, '_');

// --- Constants ---
const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042' },
  { id: 'transport', name: '交通', color: '#00C49F' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28' },
  { id: 'shopping', name: '購物', color: '#0088FE' },
  { id: 'house', name: '居家', color: '#8884d8' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B' },
  { id: 'other', name: '其他', color: '#999' },
  { id: 'repayment', name: '還款', color: '#4ADE80' },
];

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

// --- Components ---

const AppLoading = () => (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
    background: 'linear-gradient(135deg, #fdf2f8 0%, #eff6ff 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  }}>
    <div style={{
      backgroundColor: 'white', padding: '24px', borderRadius: '50%',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      marginBottom: '20px'
    }}>
       <svg width="64" height="64" viewBox="0 0 24 24" fill="#ec4899" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
         <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
       </svg>
    </div>
    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#374151', letterSpacing: '0.1em' }}>載入中...</h2>
    <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '8px' }}>正在同步我們的小金庫</p>
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

const SimpleDonutChart = ({ data, total }) => {
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
         <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">總支出</span>
         <span className="text-2xl font-black text-gray-800">{formatMoney(total)}</span>
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

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false);
  const [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null);
  const [showJarHistory, setShowJarHistory] = useState(null); 
  
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  useEffect(() => {
    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => setLoading(false), 2000);
    const initAuth = async () => { try { await signInAnonymously(auth); } catch (e) { console.error(e); } };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    const savedRole = localStorage.getItem('couple_app_role');
    if (savedRole) setRole(savedRole);
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
        const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
        const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');
        const unsubTrans = onSnapshot(transRef, (s) => setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date))));
        const unsubJars = onSnapshot(jarsRef, (s) => setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))));
        return () => { unsubTrans(); unsubJars(); };
    } catch (e) { console.error(e); }
  }, [user]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleSaveTransaction = async (data) => {
    if (!user) return;
    try {
      const finalAmount = Number(safeCalculate(data.amount));
      const cleanData = { ...data, amount: finalAmount };
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

  const handleDeleteTransaction = (id) => {
    setConfirmModal({
      isOpen: true, title: "刪除紀錄", message: "確定要刪除這筆紀錄嗎？", isDanger: true,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id));
        showToast('已刪除 🗑️');
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleSaveJar = async (name, target) => {
    if (!user) return;
    try {
      const finalTarget = Number(safeCalculate(target));
      if (editingJar) {
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), { name, targetAmount: finalTarget, updatedAt: serverTimestamp() });
         showToast('存錢罐已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { 
            name, 
            targetAmount: finalTarget, 
            currentAmount: 0, 
            contributions: { bf: 0, gf: 0 }, 
            history: [], 
            createdAt: serverTimestamp() 
        });
        showToast('存錢罐已建立 🎯');
      }
      setShowAddJar(false);
      setEditingJar(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteJar = (id) => {
    setConfirmModal({
      isOpen: true, title: "刪除目標", message: "確定要打破這個存錢罐嗎？", isDanger: true,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id));
        showToast('已刪除 🗑️');
        setConfirmModal({ isOpen: false });
      }
    });
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

  const handleUpdateJarHistoryItem = async (jar, oldItem, newAmount) => {
    try {
        const diff = Number(newAmount) - oldItem.amount;
        const newTotal = (jar.currentAmount || 0) + diff;
        const newContrib = { ...jar.contributions };
        newContrib[oldItem.role] = (newContrib[oldItem.role] || 0) + diff;
        const newHistory = (jar.history || []).map(item => item.id === oldItem.id ? { ...item, amount: Number(newAmount) } : item);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { currentAmount: newTotal, contributions: newContrib, history: newHistory });
        showToast('紀錄已修正 ✨');
    } catch(e) { console.error(e); }
  };

  const handleDeleteJarHistoryItem = async (jar, item) => {
    setConfirmModal({
        isOpen: true, title: "刪除存錢紀錄", message: "確定要刪除這筆存款嗎？金額將會從總數扣除。", isDanger: true,
        onConfirm: async () => {
            try {
                const newTotal = (jar.currentAmount || 0) - item.amount;
                const newContrib = { ...jar.contributions };
                newContrib[item.role] = Math.max(0, (newContrib[item.role] || 0) - item.amount);
                const newHistory = (jar.history || []).filter(h => h.id !== item.id);
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { currentAmount: newTotal, contributions: newContrib, history: newHistory });
                showToast('紀錄已刪除 🗑️');
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            } catch(e) { console.error(e); }
        }
    });
  };

  if (loading) return <AppLoading />;
  if (!role) return <RoleSelection onSelect={(r) => { setRole(r); localStorage.setItem('couple_app_role', r); }} />;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24">
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      <div className={`p-4 text-white shadow-lg sticky top-0 z-40 transition-colors ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-md"><Heart className="fill-white animate-pulse" size={18} /></div>
            <h1 className="text-lg font-bold tracking-wide">我們的小金庫</h1>
          </div>
          <div className="text-xs bg-black/10 px-3 py-1 rounded-full">{role === 'bf' ? '👦 男朋友' : '👧 女朋友'}</div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {activeTab === 'overview' && <Overview transactions={transactions} role={role} onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} onEdit={(t) => { setEditingTransaction(t); setShowAddTransaction(true); }} onDelete={handleDeleteTransaction} />}
        {activeTab === 'stats' && <Statistics transactions={transactions} />}
        {activeTab === 'savings' && <Savings jars={jars} role={role} onAdd={() => { setEditingJar(null); setShowAddJar(true); }} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onDelete={handleDeleteJar} onHistory={(j) => setShowJarHistory(j)} />}
        {activeTab === 'settings' && <SettingsView role={role} onLogout={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} />}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
        </div>
      </div>

      {toast && <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-xl z-[100] flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]"><CheckCircle size={18} className="text-green-400" /><span className="text-sm font-medium">{toast}</span></div>}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s]" onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(prev => ({ ...prev, isOpen: false })); }}>
          <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3>
            <p className="text-gray-500 text-sm mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ isOpen: false })} className="flex-1 py-3 bg-gray-100 rounded-xl text-sm font-bold text-gray-600">取消</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 py-3 rounded-xl text-sm font-bold text-white ${confirmModal.isDanger ? 'bg-red-500' : 'bg-blue-500'}`}>確定</button>
            </div>
          </div>
        </div>
      )}

      {showAddTransaction && <AddTransactionModal onClose={() => setShowAddTransaction(false)} onSave={handleSaveTransaction} currentUserRole={role} initialData={editingTransaction} />}
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={handleSaveJar} initialData={editingJar} />}
      {showJarDeposit && <DepositModal jar={jars.find(j => j.id === showJarDeposit)} onClose={() => setShowJarDeposit(null)} onConfirm={depositToJar} role={role} />}
      {showJarHistory && <JarHistoryModal jar={showJarHistory} onClose={() => setShowJarHistory(null)} onUpdateItem={handleUpdateJarHistoryItem} onDeleteItem={handleDeleteJarHistoryItem} />}
    </div>
  );
}

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full ${active ? (role === 'bf' ? 'text-blue-600' : 'text-pink-600') : 'text-gray-400'}`}>
    <Icon size={24} strokeWidth={active ? 2.5 : 2} />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

const RoleSelection = ({ onSelect }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">歡迎使用小金庫</h1>
      <div className="space-y-4">
        <button onClick={() => onSelect('bf')} className="w-full py-4 bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-transform">我是男朋友 👦</button>
        <button onClick={() => onSelect('gf')} className="w-full py-4 bg-pink-500 text-white rounded-xl font-bold shadow-lg shadow-pink-200 active:scale-95 transition-transform">我是女朋友 👧</button>
      </div>
    </div>
  </div>
);

const Overview = ({ transactions, role, onAdd, onEdit, onDelete }) => {
  const debt = useMemo(() => {
    let bfLent = 0;
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.category === 'repayment') {
        t.paidBy === 'bf' ? bfLent -= amt : bfLent += amt;
      } else {
        let gfShare = 0, bfShare = 0;
        if (t.splitType === 'custom' && t.splitDetails) {
            gfShare = Number(t.splitDetails.gf) || 0;
            bfShare = Number(t.splitDetails.bf) || 0;
        } else if (t.splitType === 'shared') { 
            gfShare = amt / 2; bfShare = amt / 2; 
        } else if (t.splitType === 'gf_personal') { 
            gfShare = amt; 
        } else if (t.splitType === 'bf_personal') { 
            bfShare = amt; 
        }
        if (t.paidBy === 'bf') bfLent += gfShare; else bfLent -= bfShare;
      }
    });
    return bfLent;
  }, [transactions]);

  const grouped = useMemo(() => {
    const groups = {};
    transactions.forEach(t => { if (!t.date) return; if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [transactions]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">當前狀態</h2>
        <div className="flex items-center justify-center gap-2">
          {Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500 flex items-center gap-2"><CheckCircle /> 互不相欠</div> : <><span className={`text-3xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男朋友' : '女朋友'}</span><span className="text-gray-400 text-sm">先墊了</span><span className="text-2xl font-bold text-gray-800">{formatMoney(Math.abs(debt))}</span></>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-end px-2"><h3 className="font-bold text-lg text-gray-800">最近紀錄</h3><button onClick={onAdd} className="bg-gray-900 text-white p-3 rounded-xl shadow-lg shadow-gray-300 active:scale-90 transition-transform"><Plus size={20} /></button></div>
        {grouped.length === 0 ? <div className="text-center py-10 text-gray-400">還沒有記帳紀錄喔</div> : grouped.map(([date, items]) => (
            <div key={date} className="space-y-2">
              <div className="text-xs font-bold text-gray-400 ml-2 bg-gray-100 inline-block px-2 py-1 rounded-md">{date}</div>
              {items.map(t => (
                <div key={t.id} onClick={() => onEdit(t)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between active:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: CATEGORIES.find(c => c.id === t.category)?.color || '#999' }}>{t.category === 'repayment' ? <RefreshCw size={18} /> : (t.category === 'food' ? <span className="text-lg">🍔</span> : <span className="text-lg">🏷️</span>)}</div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-800 truncate">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div>
                        <div className="text-xs text-gray-400 flex gap-1 truncate"><span className={t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}>{t.paidBy === 'bf' ? '男友付' : '女友付'}</span><span>•</span><span>{t.splitType === 'shared' ? '平分' : (t.splitType === 'bf_personal' ? '男友個人' : (t.splitType === 'gf_personal' ? '女友個人' : '自訂分帳'))}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0"><span className={`font-bold text-lg ${t.category === 'repayment' ? 'text-green-500' : 'text-gray-800'}`}>{formatMoney(t.amount)}</span><button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={16} /></button></div>
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
  const monthTransactions = useMemo(() => transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear() && t.category !== 'repayment'; }), [transactions, currentDate]);
  const chartData = useMemo(() => {
    const map = {}; let total = 0;
    monthTransactions.forEach(t => { const amt = Number(t.amount) || 0; if (!map[t.category]) map[t.category] = 0; map[t.category] += amt; total += amt; });
    return { data: Object.entries(map).map(([id, value]) => ({ id, value, color: CATEGORIES.find(c => c.id === id)?.color || '#999', name: CATEGORIES.find(c => c.id === id)?.name || '未知' })).sort((a, b) => b.value - a.value), total };
  }, [monthTransactions]);
  const changeMonth = (delta) => { const newDate = new Date(currentDate); newDate.setMonth(newDate.getMonth() + delta); setCurrentDate(newDate); };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>
        <span className="font-bold text-lg">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center">
        <SimpleDonutChart data={chartData.data} total={chartData.total} />
        <div className="flex flex-wrap gap-2 justify-center mt-4">{chartData.data.map(d => (<div key={d.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-100"><div className="w-2 h-2 rounded-full" style={{ background: d.color }}></div><span>{d.name}</span><span className="font-bold">{chartData.total ? Math.round(d.value / chartData.total * 100) : 0}%</span></div>))}</div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><Calendar size={18} className="text-gray-400"/><h3 className="font-bold text-gray-700">本月詳細紀錄</h3></div>
        <div className="divide-y divide-gray-100">{monthTransactions.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">尚無消費紀錄</div> : monthTransactions.map(t => (<div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50"><div className="flex items-center gap-3"><div className="text-gray-400 text-xs font-mono w-10 text-center bg-gray-100 rounded p-1">{t.date ? `${t.date.split('-')[1]}/${t.date.split('-')[2]}` : '--/--'}</div><div><div className="font-bold text-sm text-gray-800">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div><div className="text-xs text-gray-400" style={{ color: CATEGORIES.find(c => c.id === t.category)?.color }}>{CATEGORIES.find(c => c.id === t.category)?.name || '其他'}</div></div></div><div className="font-bold text-gray-700">{formatMoney(t.amount)}</div></div>))}</div>
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onDelete, onHistory }) => (
  <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
    <div className="flex justify-between items-center px-2">
      <h2 className="font-bold text-xl text-gray-800">存錢目標</h2>
      <button onClick={onAdd} className="bg-gray-900 text-white p-2 rounded-xl shadow-lg active:scale-95 transition-transform flex items-center gap-2 text-sm font-bold pr-4"><Plus size={18} /> 新增目標</button>
    </div>
    <div className="grid gap-4">
      {jars.map(jar => {
        const cur = Number(jar.currentAmount) || 0; const tgt = Number(jar.targetAmount) || 1; const progress = Math.min((cur / tgt) * 100, 100);
        return (
          <div key={jar.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10"><div><h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">{jar.name}<button onClick={() => onEdit(jar)} className="text-gray-300 hover:text-blue-500"><Pencil size={14}/></button></h3><div className="text-xs text-gray-400 mt-1">目標 {formatMoney(tgt)}</div></div><div className="bg-yellow-100 text-yellow-700 font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1"><Target size={12} /> {Math.round(progress)}%</div></div>
            <div className="mb-4 relative z-10"><div className="text-3xl font-black text-gray-800 mb-1">{formatMoney(cur)}</div><div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-yellow-300 to-orange-400 transition-all duration-1000" style={{ width: `${progress}%` }}></div></div></div>
            <div className="flex justify-between items-center relative z-10">
                <div className="flex -space-x-2"><div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] text-blue-600 font-bold" title="男友貢獻">{Math.round((jar.contributions?.bf || 0) / (cur || 1) * 100)}%</div><div className="w-8 h-8 rounded-full bg-pink-100 border-2 border-white flex items-center justify-center text-[10px] text-pink-600 font-bold" title="女友貢獻">{Math.round((jar.contributions?.gf || 0) / (cur || 1) * 100)}%</div></div>
                <div className="flex gap-2">
                    <button onClick={() => onHistory(jar)} className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200"><History size={18}/></button>
                    <button onClick={() => onDelete(jar.id)} className="p-2 text-gray-300 hover:text-red-400"><Trash2 size={18}/></button>
                    <button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-transform">存錢</button>
                </div>
            </div>
            <PiggyBank className="absolute -bottom-4 -right-4 text-gray-50 opacity-50 z-0 transform -rotate-12" size={120} />
          </div>
        );
      })}
      {jars.length === 0 && <div className="text-center py-10 text-gray-400">還沒有存錢計畫，快來建立一個！</div>}
    </div>
  </div>
);

const SettingsView = ({ role, onLogout }) => (
  <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-4 mb-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div><div><h2 className="font-bold text-xl">{role === 'bf' ? '男朋友' : '女朋友'}</h2><p className="text-gray-400 text-sm">目前身分</p></div></div>
      <button onClick={onLogout} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2"><LogOut size={18} /> 切換身分 (登出)</button>
    </div>
  </div>
);

const ModalLayout = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-white w-full sm:max-w-md h-auto max-h-[90vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]">
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="bg-gray-50 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 hide-scrollbar">{children}</div>
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

  const scrollRef = useRef(null);
  const scroll = (offset) => { if(scrollRef.current) scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' }); };

  useEffect(() => {
    if (splitType === 'custom' && amount && !isNaN(amount)) { }
  }, [amount, splitType]);

  const handleCustomChange = (who, val) => {
    const numVal = Number(val);
    const total = Number(safeCalculate(amount)) || 0;
    if (who === 'bf') { setCustomBf(val); setCustomGf((total - numVal).toString()); } 
    else { setCustomGf(val); setCustomBf((total - numVal).toString()); }
  };

  const handleSubmit = (finalAmount) => {
    if (!finalAmount || finalAmount === '0' || isNaN(Number(finalAmount))) return;
    const payload = { amount: finalAmount, note, date, category, paidBy, splitType, updatedAt: serverTimestamp() };
    if (splitType === 'custom') { payload.splitDetails = { bf: Number(customBf) || 0, gf: Number(customGf) || 0 }; }
    onSave(payload);
  };

  return (
    <ModalLayout title={initialData ? "編輯紀錄" : "記一筆"} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <div className="bg-gray-50 p-2 rounded-xl text-center border-2 border-transparent focus-within:border-blue-200 transition-colors">
          <div className="text-3xl font-black text-gray-800 tracking-wider h-9 flex items-center justify-center overflow-hidden">{amount ? amount : <span className="text-gray-300">0</span>}</div>
        </div>
        
        {/* FIX: Date input mobile layout fix */}
        <div className="flex gap-2">
           <input 
             type="date" 
             value={date} 
             onChange={e => setDate(e.target.value)} 
             className="bg-gray-50 border-none rounded-xl px-2 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none w-[130px] flex-shrink-0 text-center" 
             style={{ minHeight: '44px' }}
           />
           <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="備註 (例如: 晚餐)" className="bg-gray-50 border-none rounded-xl p-2 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none flex-1 min-w-0" />
        </div>
        
        <div className="relative group">
            <button onClick={() => scroll(-100)} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 p-1 rounded-full shadow-md text-gray-600 hidden group-hover:block hover:bg-white"><ChevronLeft size={16}/></button>
            <div ref={scrollRef} className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar scroll-smooth">
                {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)} className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all border-2 whitespace-nowrap ${category === c.id ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-100 bg-white text-gray-500'}`}>{c.name}</button>
                ))}
            </div>
            <button onClick={() => scroll(100)} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 p-1 rounded-full shadow-md text-gray-600 hidden group-hover:block hover:bg-white"><ChevronRight size={16}/></button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
             <div className="bg-gray-50 p-2 rounded-xl">
               <div className="text-[10px] text-gray-400 text-center mb-1">誰付的錢?</div>
               <div className="flex bg-white rounded-lg p-1 shadow-sm">
                 <button onClick={() => setPaidBy('bf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${paidBy === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button>
                 <button onClick={() => setPaidBy('gf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${paidBy === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button>
               </div>
             </div>
             <div className="bg-gray-50 p-2 rounded-xl">
               <div className="text-[10px] text-gray-400 text-center mb-1">分帳方式</div>
               <select value={splitType} onChange={e => { setSplitType(e.target.value); if(e.target.value === 'custom') { const half = (Number(safeCalculate(amount)) || 0) / 2; setCustomBf(half); setCustomGf(half); } }} className="w-full bg-white text-xs font-bold py-1.5 rounded-md border-none outline-none text-center"><option value="shared">平分 (50/50)</option><option value="custom">自訂金額</option><option value="bf_personal">男友全付</option><option value="gf_personal">女友全付</option></select>
             </div>
        </div>
        {splitType === 'custom' && (<div className="bg-blue-50 p-3 rounded-xl border border-blue-100 animate-[fadeIn_0.2s]"><div className="text-[10px] text-blue-400 font-bold mb-2 text-center">輸入金額 (自動計算剩餘)</div><div className="flex gap-3 items-center"><div className="flex-1"><label className="text-[10px] text-gray-500 block mb-1">男友應付</label><input type="number" value={customBf} onChange={(e) => handleCustomChange('bf', e.target.value)} className="w-full p-2 rounded-lg text-center font-bold text-sm border-none outline-none focus:ring-2 focus:ring-blue-200" placeholder="0" /></div><div className="text-gray-400 font-bold">+</div><div className="flex-1"><label className="text-[10px] text-gray-500 block mb-1">女友應付</label><input type="number" value={customGf} onChange={(e) => handleCustomChange('gf', e.target.value)} className="w-full p-2 rounded-lg text-center font-bold text-sm border-none outline-none focus:ring-2 focus:ring-pink-200" placeholder="0" /></div></div></div>)}
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
        <div className="bg-gray-50 p-3 rounded-2xl">
          <label className="block mb-1 text-xs font-bold text-gray-400">目標金額</label>
          <div className="text-2xl font-black text-gray-800 tracking-wider h-8 flex items-center overflow-hidden">{target ? target : <span className="text-gray-300">0</span>}</div>
        </div>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="名稱 (例如: 旅遊基金)" className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none" />
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
        <div className="text-center"><div className="text-gray-400 text-xs mb-1">目前進度</div><div className="font-bold text-xl text-gray-800">{formatMoney(jar.currentAmount)} <span className="text-gray-300 text-sm">/ {formatMoney(jar.targetAmount)}</span></div></div>
        
        <div className="bg-gray-50 p-2 rounded-xl">
           <div className="text-[10px] text-gray-400 text-center mb-1">是誰存的?</div>
           <div className="flex bg-white rounded-lg p-1 shadow-sm">
             <button onClick={() => setDepositor('bf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${depositor === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button>
             <button onClick={() => setDepositor('gf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${depositor === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button>
           </div>
         </div>

        <div className="bg-gray-50 p-3 rounded-2xl text-center"><div className="text-xs text-gray-400 mb-1">存入金額</div><div className="text-3xl font-black text-gray-800 tracking-wider h-10 flex items-center justify-center text-green-500 overflow-hidden">{amount ? `+${amount}` : <span className="text-gray-300">0</span>}</div></div>
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={(val) => { if(Number(val) > 0) onConfirm(jar.id, val, depositor); }} compact={true} />
      </div>
    </ModalLayout>
  );
};

const JarHistoryModal = ({ jar, onClose, onUpdateItem, onDeleteItem }) => {
  const [editingItem, setEditingItem] = useState(null);
  const [editAmount, setEditAmount] = useState('');

  const history = [...(jar.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <ModalLayout title={`${jar.name} - 存錢紀錄`} onClose={onClose}>
        {editingItem ? (
            <div className="space-y-4 animate-[fadeIn_0.2s]">
                <button onClick={() => setEditingItem(null)} className="flex items-center gap-1 text-gray-500 text-xs font-bold mb-2"><ArrowLeft size={14}/> 返回列表</button>
                <div className="bg-gray-50 p-3 rounded-2xl text-center">
                    <div className="text-xs text-gray-400 mb-1">修改金額</div>
                    <div className="text-3xl font-black text-gray-800 tracking-wider h-10 flex items-center justify-center overflow-hidden">{editAmount}</div>
                </div>
                <CalculatorKeypad 
                    value={editAmount} 
                    onChange={setEditAmount} 
                    onConfirm={(val) => {
                        if(Number(val) >= 0) {
                            onUpdateItem(jar, editingItem, val);
                            setEditingItem(null);
                        }
                    }} 
                    compact={true} 
                />
            </div>
        ) : (
            <div className="space-y-2">
                {history.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">尚無詳細紀錄</div> : history.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${item.role === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                                {item.role === 'bf' ? '👦' : '👧'}
                            </div>
                            <div>
                                <div className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString()}</div>
                                <div className="font-bold text-gray-800">{formatMoney(item.amount)}</div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setEditingItem(item); setEditAmount(item.amount.toString()); }} className="p-2 bg-white rounded-lg shadow-sm text-gray-400 hover:text-blue-500"><Pencil size={16}/></button>
                            <button onClick={() => onDeleteItem(jar, item)} className="p-2 bg-white rounded-lg shadow-sm text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </ModalLayout>
  );
};
