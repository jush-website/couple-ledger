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
      {showJarHistory && <JarHistoryModal jar={showJarHistory} onClose