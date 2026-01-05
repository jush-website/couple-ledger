import React, { useState, useEffect, useMemo } from 'react';
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
  Plus, Minus, ArrowRightLeft, Trash2, Check, User, 
  Calendar, DollarSign, Target, Settings, LogOut,
  RefreshCw, Pencil, CheckCircle, AlertTriangle, X
} from 'lucide-react';

// --- Firebase Configuration & Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDPUjZ1dUV52O7JUeY-7befolezIWpI6vo",
  authDomain: "money-49190.firebaseapp.com",
  projectId: "money-49190",
  storageBucket: "money-49190.firebasestorage.app",
  messagingSenderId: "706278541664",
  appId: "1:706278541664:web:aef08ba776587a1101b605",
  measurementId: "G-XD01TYP1PQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Constants & Helpers ---
const ROLES = {
  BF: { id: 'bf', label: '男朋友', color: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500', light: 'bg-blue-100' },
  GF: { id: 'gf', label: '女朋友', color: 'bg-pink-500', text: 'text-pink-500', border: 'border-pink-500', light: 'bg-pink-100' }
};

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
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(amount);
};

// --- Custom Simple Chart Component ---
const SimpleDonutChart = ({ data, total }) => {
  if (total === 0) {
    return (
      <div className="h-64 w-full flex items-center justify-center">
        <div className="w-48 h-48 rounded-full border-4 border-gray-100 flex items-center justify-center">
           <span className="text-gray-300 font-bold text-sm">尚無數據</span>
        </div>
      </div>
    );
  }

  let accumulatedPercent = 0;

  return (
    <div className="relative w-64 h-64 mx-auto">
      <svg viewBox="0 0 42 42" className="w-full h-full">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#f3f4f6" strokeWidth="5"></circle>
        {data.map((item, index) => {
          const percent = (item.value / total) * 100;
          const strokeDasharray = `${percent} ${100 - percent}`;
          const offset = 25 - accumulatedPercent;
          accumulatedPercent += percent;
          return (
            <circle
              key={index}
              cx="21"
              cy="21"
              r="15.91549430918954"
              fill="transparent"
              stroke={item.color}
              strokeWidth="5"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={offset}
              className="transition-all duration-500 ease-out"
            />
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

// --- Main Component ---
export default function CoupleLedgerApp() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data States
  const [transactions, setTransactions] = useState([]);
  const [jars, setJars] = useState([]);
  
  // Modals & Editing States
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false);
  const [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null); 

  // Notification State
  const [toast, setToast] = useState(null); 

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isDanger: false
  });

  // --- Auto-Inject Tailwind & Styles ---
  useEffect(() => {
    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // Helper to show toast
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Helper to open confirmation
  const openConfirm = (title, message, onConfirm, isDanger = false) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, isDanger });
  };

  const closeConfirm = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  // --- Authentication & Identity ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    const savedRole = localStorage.getItem('couple_app_role');
    if (savedRole) setRole(savedRole);
    return () => unsubscribe();
  }, []);

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;
    const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');

    const unsubTrans = onSnapshot(transRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
      setTransactions(data);
    });

    const unsubJars = onSnapshot(jarsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setJars(data);
    });

    return () => {
      unsubTrans();
      unsubJars();
    };
  }, [user]);

  // --- Handlers ---
  const handleSetRole = (selectedRole) => {
    setRole(selectedRole);
    localStorage.setItem('couple_app_role', selectedRole);
  };

  const handleLogoutRole = () => {
    openConfirm("登出確認", "切換身分後需要重新選擇，確定登出嗎？", () => {
      localStorage.removeItem('couple_app_role');
      setRole(null);
      window.location.reload();
    }, true);
  };

  // --- CRUD Operations ---
  const handleSaveTransaction = async (data) => {
    if (!user) return;
    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', editingTransaction.id), {
          ...data, updatedAt: serverTimestamp()
        });
        showToast('紀錄已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), {
          ...data, createdAt: serverTimestamp()
        });
        showToast('紀錄已新增 🎉');
      }
      setShowAddTransaction(false);
      setEditingTransaction(null);
    } catch (error) { console.error(error); }
  };

  const handleDeleteTransaction = (id) => {
    openConfirm("刪除紀錄", "確定要刪除這筆紀錄嗎？此動作無法復原。", async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id));
        showToast('紀錄已刪除 🗑️');
      } catch (e) { console.error(e); }
      closeConfirm();
    }, true);
  };

  const handleSaveJar = async (name, target) => {
    if (!user) return;
    try {
      if (editingJar) {
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), {
           name, targetAmount: Number(target), updatedAt: serverTimestamp()
         });
         showToast('存錢罐已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), {
          name, targetAmount: Number(target), currentAmount: 0, contributions: { bf: 0, gf: 0 }, createdAt: serverTimestamp()
        });
        showToast('存錢罐已建立 🎯');
      }
      setShowAddJar(false);
      setEditingJar(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteJar = (id) => {
    openConfirm("打破存錢罐", "確定要刪除這個目標嗎？刪除後所有存錢紀錄也會消失。", async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id));
        showToast('存錢罐已刪除 🗑️');
      } catch (e) { console.error(e); }
      closeConfirm();
    }, true);
  }

  const depositToJar = async (jarId, amount, contributorRole) => {
    const jar = jars.find(j => j.id === jarId);
    if (!jar) return;
    const newAmount = jar.currentAmount + Number(amount);
    const newContrib = {
      ...jar.contributions,
      [contributorRole]: (jar.contributions?.[contributorRole] || 0) + Number(amount)
    };
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jarId), {
        currentAmount: newAmount, contributions: newContrib
      });
      setShowJarDeposit(null);
      showToast('資金已存入 💰');
    } catch (e) { console.error(e); }
  };

  // --- Views ---
  
  if (!role) {
    return (
      <>
        <style>{`
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          * { box-sizing: border-box; }
        `}</style>
        <RoleSelection onSelect={handleSetRole} />
      </>
    );
  }

  return (
    // 使用 w-full 和 min-h-screen 確保全螢幕，移除 max-w-md 限制
    <div className="min-h-screen w-full bg-gray-50 pb-20 font-sans text-gray-800">
      <style>{`
        /* Scrollbar Hiding */
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* Keyframes for animations */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes zoomIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-gray-900/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-xl z-[100] flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]">
          <CheckCircle size={20} className="text-green-400" />
          <span className="font-medium text-sm whitespace-nowrap">{toast}</span>
        </div>
      )}

      {/* Header - Full Width */}
      <div className={`p-4 text-white shadow-md flex justify-between items-center transition-colors sticky top-0 z-40 ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex items-center gap-2">
          <Heart className="fill-white animate-pulse" size={20} />
          <h1 className="text-xl font-bold tracking-wide">我們的小金庫</h1>
        </div>
        <div className="flex items-center gap-2 text-sm bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
          <User size={14} />
          <span>我是{role === 'bf' ? '男朋友' : '女朋友'}</span>
        </div>
      </div>

      {/* Main Content Area - Full Width Container */}
      <div className="p-4 w-full max-w-4xl mx-auto">
        {activeTab === 'overview' && (
          <Overview 
            transactions={transactions} 
            role={role} 
            onAdd={() => {
              setEditingTransaction(null);
              setShowAddTransaction(true);
            }}
            onEdit={(t) => {
              setEditingTransaction(t);
              setShowAddTransaction(true);
            }}
            onDelete={handleDeleteTransaction}
          />
        )}
        {activeTab === 'stats' && (
          <Statistics transactions={transactions} />
        )}
        {activeTab === 'savings' && (
          <Savings 
            jars={jars} 
            role={role} 
            onAdd={() => {
              setEditingJar(null);
              setShowAddJar(true);
            }}
            onEdit={(j) => {
               setEditingJar(j);
               setShowAddJar(true);
            }}
            onDeposit={(id) => setShowJarDeposit(id)}
            onDelete={handleDeleteJar}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView role={role} onLogout={handleLogoutRole} />
        )}
      </div>

      {/* Bottom Navigation - Fixed Bottom Full Width */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around py-3 z-50 text-xs shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
        <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
        <NavBtn icon={PiggyBank} label="存錢罐" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
        <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
      </div>

      {/* Modals Layer */}
      {showAddTransaction && (
        <AddTransactionModal 
          onClose={() => setShowAddTransaction(false)} 
          onSave={handleSaveTransaction} 
          currentUserRole={role}
          initialData={editingTransaction}
        />
      )}
      {showAddJar && (
        <AddJarModal 
          onClose={() => setShowAddJar(false)} 
          onSave={handleSaveJar} 
          initialData={editingJar}
        />
      )}
      {showJarDeposit && (
        <DepositModal 
          jar={jars.find(j => j.id === showJarDeposit)}
          onClose={() => setShowJarDeposit(null)}
          onConfirm={depositToJar}
          role={role}
        />
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <ConfirmationModal 
          title={confirmModal.title}
          message={confirmModal.message}
          isDanger={confirmModal.isDanger}
          onConfirm={confirmModal.onConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}

// --- Sub-Components ---

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => {
  const activeColor = role === 'bf' ? 'text-blue-600' : 'text-pink-600';
  return (
    <button 
      onClick={onClick} 
      className={`flex flex-col items-center gap-1 w-full ${active ? activeColor : 'text-gray-400'}`}
    >
      <Icon size={24} strokeWidth={active ? 2.5 : 2} />
      <span className={active ? 'font-medium' : ''}>{label}</span>
    </button>
  );
};

const RoleSelection = ({ onSelect }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-100 to-blue-100 p-6">
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center space-y-8 animate-[zoomIn_0.5s_ease-out]">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">歡迎回來</h1>
        <p className="text-gray-500">請確認您的身分以繼續</p>
      </div>
      
      <div className="space-y-4">
        <button 
          onClick={() => onSelect('bf')}
          className="w-full py-4 px-6 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl flex items-center justify-between transition-transform transform hover:scale-105 shadow-lg"
        >
          <span className="text-lg font-bold">我是男朋友 👦</span>
          <ArrowRightLeft size={20} className="opacity-50" />
        </button>
        <button 
          onClick={() => onSelect('gf')}
          className="w-full py-4 px-6 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl flex items-center justify-between transition-transform transform hover:scale-105 shadow-lg"
        >
          <span className="text-lg font-bold">我是女朋友 👧</span>
          <ArrowRightLeft size={20} className="opacity-50" />
        </button>
      </div>
      <p className="text-xs text-gray-400">選擇後將會綁定此裝置</p>
    </div>
  </div>
);

const ConfirmationModal = ({ title, message, onConfirm, onCancel, isDanger }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_0.2s_ease-out]">
    <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl scale-100 animate-[zoomIn_0.2s_ease-out]">
      <div className="flex flex-col items-center text-center mb-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isDanger ? 'bg-red-100 text-red-500' : 'bg-blue-100 text-blue-500'}`}>
          <AlertTriangle size={24} />
        </div>
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        <p className="text-sm text-gray-500 mt-2">{message}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold text-sm transition-colors">取消</button>
        <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-transform active:scale-95 ${isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}>確定</button>
      </div>
    </div>
  </div>
);

const Overview = ({ transactions, role, onAdd, onDelete, onEdit }) => {
  const debtSummary = useMemo(() => {
    let bfLent = 0; 
    transactions.forEach(t => {
      const amount = Number(t.amount);
      if (t.category === 'repayment') {
        if (t.paidBy === 'bf') bfLent -= amount; else bfLent += amount; 
      } else {
        let gfShare = 0, bfShare = 0;
        if (t.splitDetails) { gfShare = Number(t.splitDetails.gf); bfShare = Number(t.splitDetails.bf); } 
        else {
          if (t.splitType === 'shared') { gfShare = amount / 2; bfShare = amount / 2; }
          else if (t.splitType === 'gf_personal') { gfShare = amount; bfShare = 0; }
          else if (t.splitType === 'bf_personal') { gfShare = 0; bfShare = amount; }
        }
        if (t.paidBy === 'bf') bfLent += gfShare; else bfLent -= bfShare;
      }
    });
    return bfLent;
  }, [transactions]);

  const monthlyExpense = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.category !== 'repayment';
    }).reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [transactions]);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"></div>
        <h2 className="text-gray-500 text-sm mb-2 font-medium">當前債務關係</h2>
        <div className="flex items-center justify-center gap-3">
          {Math.abs(debtSummary) < 1 ? (
             <div className="text-2xl font-bold text-green-500 flex items-center gap-2"><Check size={24} /> 互不相欠</div>
          ) : (
            <>
              <span className={`text-xl font-bold ${debtSummary > 0 ? 'text-pink-500' : 'text-blue-500'}`}>{debtSummary > 0 ? '女朋友' : '男朋友'}</span>
              <span className="text-gray-400 text-sm">欠</span>
              <span className={`text-xl font-bold ${debtSummary > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debtSummary > 0 ? '男朋友' : '女朋友'}</span>
              <div className="text-3xl font-extrabold text-gray-800 ml-2">{formatMoney(Math.abs(debtSummary))}</div>
            </>
          )}
        </div>
        {Math.abs(debtSummary) > 0 && (
           <p className="text-xs text-gray-400 mt-2">{debtSummary > 0 && role === 'gf' ? "記得還錢喔！" : ""}{debtSummary < 0 && role === 'bf' ? "記得還錢喔！" : ""}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 mb-1"><Calendar size={16} /><span className="text-xs">本月總支出</span></div>
          <div className="text-xl font-bold text-gray-800">{formatMoney(monthlyExpense)}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={onAdd}>
          <div className={`p-3 rounded-full mb-2 ${role === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}><Plus size={24} /></div>
          <span className="text-sm font-medium text-gray-600">記一筆</span>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-3 ml-1">最近紀錄</h3>
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">尚無紀錄，開始記帳吧！</div>
          ) : (
            transactions.map(t => (
              <div key={t.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center group">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg shrink-0`} style={{ backgroundColor: CATEGORIES.find(c => c.id === t.category)?.color || '#999' }}>
                     {t.category === 'repayment' ? <RefreshCw size={18} /> : (CATEGORIES.find(c => c.id === t.category)?.name[0] || '?')}
                  </div>
                  <div>
                    <div className="font-bold text-gray-800">{t.note || CATEGORIES.find(c => c.id === t.category)?.name}</div>
                    <div className="text-xs text-gray-400 flex gap-2">
                      <span>{t.date}</span><span>•</span>
                      <span className={`${t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}`}>{t.paidBy === 'bf' ? '男友付' : '女友付'}</span>
                      <span>•</span>
                      <span>{t.category === 'repayment' ? '還款' : (t.splitDetails ? (t.splitDetails.bf > 0 && t.splitDetails.gf > 0 ? '分帳' : t.splitDetails.bf > 0 ? '男友個人' : '女友個人') : '一般支出')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <div className="text-right">
                     <span className={`font-bold block ${t.category === 'repayment' ? 'text-green-500' : 'text-gray-800'}`}>{t.category === 'repayment' ? '+' : '-'}{formatMoney(t.amount)}</span>
                     {t.splitDetails && t.category !== 'repayment' && ( <span className="text-[10px] text-gray-400 block">(B:{formatMoney(t.splitDetails.bf)} G:{formatMoney(t.splitDetails.gf)})</span> )}
                   </div>
                   <div className="flex gap-1">
                     <button onClick={() => onEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"><Pencil size={16} /></button>
                     <button onClick={() => onDelete(t.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={16} /></button>
                   </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const Statistics = ({ transactions }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const handlePrevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else { setMonth(m => m - 1); } };
  const handleNextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else { setMonth(m => m + 1); } };

  const statsData = useMemo(() => {
    const filtered = transactions.filter(t => {
      const d = new Date(t.date);
      return t.category !== 'repayment' && d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const categoryMap = {};
    filtered.forEach(t => { categoryMap[t.category] = (categoryMap[t.category] || 0) + Number(t.amount); });
    return Object.entries(categoryMap).map(([id, value]) => ({
        name: CATEGORIES.find(c => c.id === id)?.name || id,
        value,
        color: CATEGORIES.find(c => c.id === id)?.color || '#999'
      })).sort((a, b) => b.value - a.value);
  }, [transactions, year, month]);

  const total = statsData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm">
        <button onClick={handlePrevMonth} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><Minus size={16} /></button>
        <div className="font-bold text-lg">{year}年 {month}月</div>
        <button onClick={handleNextMonth} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><Plus size={16} /></button>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center">
        <h3 className="text-gray-500 mb-4">月支出分佈</h3>
        <div className="w-full"><SimpleDonutChart data={statsData} total={total} /></div>
      </div>
      <div className="space-y-2">
        {statsData.map((item, idx) => (
          <div key={idx} className="bg-white p-3 rounded-xl flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div><span className="font-medium">{item.name}</span></div>
            <div className="flex items-center gap-4"><span className="text-gray-800 font-bold">{formatMoney(item.value)}</span><span className="text-gray-400 text-xs w-10 text-right">{((item.value / total) * 100).toFixed(0)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onDeposit, onDelete, onEdit }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold">存錢目標</h2>
        <button onClick={onAdd} className="flex items-center gap-1 bg-gradient-to-r from-teal-400 to-emerald-400 text-white px-4 py-2 rounded-full shadow-md text-sm font-bold active:scale-95 transition-transform"><Plus size={16} /> 新增罐子</button>
      </div>
      {jars.length === 0 && (
         <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200"><PiggyBank size={48} className="mx-auto text-gray-300 mb-4" /><p className="text-gray-400">還沒有存錢罐，一起設立一個夢想吧！</p></div>
      )}
      {jars.map(jar => {
        const progress = Math.min((jar.currentAmount / jar.targetAmount) * 100, 100);
        return (
          <div key={jar.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative group overflow-hidden">
             <div className="absolute top-4 right-4 flex gap-2 z-10">
               <button onClick={(e) => { e.stopPropagation(); onEdit(jar); }} className="p-1.5 bg-white/80 hover:bg-blue-100 text-gray-400 hover:text-blue-500 rounded-full transition-colors shadow-sm"><Pencil size={16} /></button>
               <button onClick={(e) => { e.stopPropagation(); onDelete(jar.id); }} className="p-1.5 bg-white/80 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded-full transition-colors shadow-sm"><Trash2 size={16} /></button>
             </div>
             <div className="flex items-center gap-4 mb-4">
               <div className="bg-yellow-100 p-3 rounded-2xl text-yellow-600"><Target size={24} /></div>
               <div><h3 className="font-bold text-lg text-gray-800">{jar.name}</h3><div className="text-xs text-gray-400 flex gap-2"><span>目標: {formatMoney(jar.targetAmount)}</span></div></div>
             </div>
             <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-3">
               <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-300 to-orange-400 transition-all duration-1000 ease-out" style={{ width: `${progress}%` }}></div>
             </div>
             <div className="flex justify-between items-end">
                <div>
                   <div className="text-2xl font-bold text-gray-800">{formatMoney(jar.currentAmount)}</div>
                   <div className="text-xs text-gray-400 mt-1 flex gap-2"><span className="text-blue-500">👦 {formatMoney(jar.contributions?.bf || 0)}</span><span className="text-pink-500">👧 {formatMoney(jar.contributions?.gf || 0)}</span></div>
                </div>
                <button onClick={() => onDeposit(jar.id)} className="bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform">存入</button>
             </div>
          </div>
        )
      })}
    </div>
  );
};

const SettingsView = ({ role, onLogout }) => (
  <div className="space-y-4">
    <div className="bg-white p-6 rounded-3xl shadow-sm">
       <h2 className="text-xl font-bold mb-4">設定</h2>
       <div className="flex items-center gap-4 mb-6">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl ${role === 'bf' ? 'bg-blue-500' : 'bg-pink-500'}`}>{role === 'bf' ? 'BF' : 'GF'}</div>
          <div><div className="font-bold">當前身分：{role === 'bf' ? '男朋友' : '女朋友'}</div><div className="text-xs text-gray-400">ID: {localStorage.getItem('couple_app_role')}</div></div>
       </div>
       <button onClick={onLogout} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-medium flex items-center justify-center gap-2"><LogOut size={18} /> 重選身分 / 登出</button>
    </div>
    <div className="bg-white p-6 rounded-3xl shadow-sm text-center"><p className="text-gray-400 text-sm">我們的小金庫 v1.9</p><p className="text-gray-300 text-xs mt-2">Designed for Couples</p></div>
  </div>
);

const AddTransactionModal = ({ onClose, onSave, currentUserRole, initialData }) => {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('food');
  const [payer, setPayer] = useState(currentUserRole); 
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRepayment, setIsRepayment] = useState(false);
  const [splitMode, setSplitMode] = useState('equal'); 
  const [bfAmount, setBfAmount] = useState(''); 
  const [gfAmount, setGfAmount] = useState(''); 
  const [bfPercent, setBfPercent] = useState(50); 

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setNote(initialData.note || '');
      setCategory(initialData.category);
      setPayer(initialData.paidBy);
      setDate(initialData.date);
      const isRepay = initialData.category === 'repayment';
      setIsRepayment(isRepay);
      if (!isRepay) {
         if (initialData.splitType === 'custom_amount') { setSplitMode('amount'); setBfAmount(initialData.splitDetails?.bf || 0); setGfAmount(initialData.splitDetails?.gf || 0); } 
         else if (initialData.splitType === 'custom_percent') { setSplitMode('percent'); const total = Number(initialData.amount); const bf = initialData.splitDetails?.bf || 0; setBfPercent(Math.round((bf / total) * 100)); } 
         else if (initialData.splitType === 'bf_personal') { setSplitMode('amount'); setBfAmount(initialData.amount); setGfAmount(0); } 
         else if (initialData.splitType === 'gf_personal') { setSplitMode('amount'); setBfAmount(0); setGfAmount(initialData.amount); } 
         else { setSplitMode('equal'); }
      }
    }
  }, [initialData]);

  useEffect(() => {
    const total = Number(amount) || 0;
    if (splitMode === 'amount') {
      if (bfAmount !== '' && gfAmount !== '') { const currentTotal = Number(bfAmount) + Number(gfAmount); if (currentTotal !== total) { setBfAmount(total/2); setGfAmount(total/2); } } 
      else { setBfAmount(total / 2); setGfAmount(total / 2); }
    }
  }, [amount]); 

  const handleSubmit = () => {
    if (!amount) return;
    const total = Number(amount);
    let splitDetails = { bf: 0, gf: 0 };
    let splitType = splitMode; 
    if (isRepayment) { splitType = 'repayment'; } 
    else {
      if (splitMode === 'equal') { splitDetails = { bf: total / 2, gf: total / 2 }; splitType = 'shared'; } 
      else if (splitMode === 'percent') { const bf = Math.round(total * (bfPercent / 100)); splitDetails = { bf: bf, gf: total - bf }; splitType = 'custom_percent'; } 
      else if (splitMode === 'amount') {
        const bf = Number(bfAmount); const gf = Number(gfAmount);
        if (Math.abs(bf + gf - total) > 1) { alert(`分帳金額總和 (${bf+gf}) 必須等於總支出金額 (${total})`); return; }
        splitDetails = { bf, gf }; splitType = 'custom_amount';
      }
    }
    onSave({ amount: total, note: isRepayment ? '還款' : note, category: isRepayment ? 'repayment' : category, paidBy: payer, splitType, splitDetails, date });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-[slideInUp_0.3s_ease-out] h-[85vh] sm:h-auto overflow-y-auto">
        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">{initialData ? '編輯紀錄' : (isRepayment ? '還款給對方' : '記一筆')}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button></div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 font-bold ml-1">金額</label>
            <div className="relative"><DollarSign size={20} className="absolute left-3 top-3 text-gray-400" /><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-gray-50 p-3 pl-10 rounded-xl text-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100" placeholder="0" autoFocus={!initialData} /></div>
          </div>
          {!initialData && (
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl"><button onClick={() => setIsRepayment(false)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${!isRepayment ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}>一般支出</button><button onClick={() => { setIsRepayment(true); setCategory('repayment'); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${isRepayment ? 'bg-white shadow-sm text-green-600' : 'text-gray-400'}`}>債務還款</button></div>
          )}
          {!isRepayment && (
            <>
              <div>
                <label className="text-xs text-gray-400 font-bold ml-1">分類</label>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {CATEGORIES.filter(c => c.id !== 'repayment').map(c => (
                    <button key={c.id} onClick={() => setCategory(c.id)} className={`flex flex-col items-center gap-1 min-w-[60px] p-2 rounded-xl transition-all ${category === c.id ? 'bg-gray-800 text-white scale-105' : 'bg-gray-50 text-gray-500'}`}><div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: category === c.id ? 'rgba(255,255,255,0.2)' : c.color }}><span className="text-white text-xs">{c.name[0]}</span></div><span className="text-xs">{c.name}</span></button>
                  ))}
                </div>
              </div>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-100" placeholder="備註 (選填)" />
              
              {/* Payer Section: Full width now to prevent squishing */}
              <div>
                 <label className="text-xs text-gray-400 font-bold ml-1 mb-1 block">誰付錢？</label>
                 <div className="flex gap-2">
                    <button onClick={() => setPayer('bf')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${payer === 'bf' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'border-gray-100 text-gray-400'}`}>男友</button>
                    <button onClick={() => setPayer('gf')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${payer === 'gf' ? 'bg-pink-50 border-pink-500 text-pink-600' : 'border-gray-100 text-gray-400'}`}>女友</button>
                 </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <label className="text-xs text-gray-400 font-bold mb-2 block">分帳設定</label>
                <div className="flex gap-1 bg-gray-200 p-1 rounded-lg mb-4">{['equal', 'percent', 'amount'].map(m => (<button key={m} onClick={() => setSplitMode(m)} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${splitMode === m ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>{m === 'equal' ? '均分' : m === 'percent' ? '比例' : '金額'}</button>))}</div>
                {splitMode === 'equal' && (<div className="flex gap-2"><button onClick={() => { setSplitMode('amount'); setBfAmount(Number(amount)); setGfAmount(0); }} className="flex-1 py-2 border border-blue-200 text-blue-500 rounded-lg text-xs font-bold hover:bg-blue-50">男友全出</button><button onClick={() => { setSplitMode('amount'); setBfAmount(0); setGfAmount(Number(amount)); }} className="flex-1 py-2 border border-pink-200 text-pink-500 rounded-lg text-xs font-bold hover:bg-pink-50">女友全出</button></div>)}
                {splitMode === 'amount' && (<div className="flex gap-3"><input type="number" value={bfAmount} onChange={(e) => { setBfAmount(e.target.value); setGfAmount(Number(amount)-e.target.value); }} className="flex-1 min-w-0 p-2 bg-white border border-gray-200 rounded-lg text-sm text-center font-bold" /><input type="number" value={gfAmount} onChange={(e) => { setGfAmount(e.target.value); setBfAmount(Number(amount)-e.target.value); }} className="flex-1 min-w-0 p-2 bg-white border border-gray-200 rounded-lg text-sm text-center font-bold" /></div>)}
                {splitMode === 'percent' && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-bold"><span className="text-blue-500">男友 {bfPercent}%</span><span className="text-pink-500">女友 {100 - bfPercent}%</span></div>
                    <input type="range" min="0" max="100" step="5" value={bfPercent} onChange={(e) => setBfPercent(Number(e.target.value))} className="w-full accent-gray-800 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                  </div>
                )}
              </div>
            </>
          )}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-50 p-2 rounded-xl text-gray-500 text-sm text-center mt-2" />
          <button onClick={handleSubmit} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform mt-4">{initialData ? '儲存修改' : (isRepayment ? '確認還款' : '儲存紀錄')}</button>
        </div>
      </div>
    </div>
  );
};

const AddJarModal = ({ onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  useEffect(() => { if (initialData) { setName(initialData.name); setTarget(initialData.targetAmount); } }, [initialData]);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold mb-4">{initialData ? '編輯存錢目標' : '新增存錢目標'}</h3>
        <div className="space-y-3">
          <input className="w-full bg-gray-50 p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-100" placeholder="目標名稱" value={name} onChange={e => setName(e.target.value)} />
          <input type="number" className="w-full bg-gray-50 p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-100" placeholder="目標金額" value={target} onChange={e => setTarget(e.target.value)} />
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-3 text-gray-500 font-bold">取消</button>
            <button onClick={() => { if(name && target) onSave(name, target); }} className="flex-1 py-3 bg-gradient-to-r from-teal-400 to-emerald-500 text-white rounded-xl font-bold shadow-lg">{initialData ? '儲存' : '建立'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
  const [amount, setAmount] = useState('');
  if (!jar) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-2">存入資金</h3>
        <p className="text-gray-400 text-sm mb-4">目標：{jar.name}</p>
        <div className="relative mb-4"><DollarSign size={20} className="absolute left-3 top-3 text-gray-400" /><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-gray-50 p-3 pl-10 rounded-xl text-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100" placeholder="0" autoFocus /></div>
        <div className="flex gap-2"><button onClick={onClose} className="flex-1 py-3 text-gray-500 font-bold">取消</button><button onClick={() => { if(amount) onConfirm(jar.id, amount, role); }} className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold shadow-lg">確認存入</button></div>
      </div>
    </div>
  );
};
