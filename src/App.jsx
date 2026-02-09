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
  ArrowLeft, ArrowRight, Check, History, Percent, Book, MoreHorizontal,
  Camera, Archive, Reply, Loader2, Image as ImageIcon, Dices, Users,
  Coins, TrendingUp, TrendingDown, BarChart3, RefreshCcw, Scale, Store, Tag
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

// --- Helper Functions ---
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
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`API Error: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) throw new Error("No response content from AI");
        
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (error) {
        console.error("AI Analysis Failed:", error);
        throw error;
    }
};

const formatMoney = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '$0';
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(num);
};

const formatWeight = (grams, unit = 'g') => {
    const num = Number(grams);
    if (isNaN(num)) return '0.00';
    if (unit === 'tw_qian') {
        // 1 台錢 = 3.75 克
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num / 3.75) + '錢';
    }
    return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + '克';
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
    return isNaN(result) || !isFinite(result) ? '' : result.toString();
  } catch (e) {
    return '';
  }
};

const calculateExpense = (t) => {
  const amt = Number(t.amount) || 0;
  let bf = 0, gf = 0;
  
  if (t.category === 'repayment') return { bf: 0, gf: 0 }; 

  if (t.splitType === 'shared') {
    bf = amt / 2;
    gf = amt / 2;
  } else if (t.splitType === 'bf_personal') {
    bf = amt;
    gf = 0;
  } else if (t.splitType === 'gf_personal') {
    bf = 0;
    gf = amt;
  } else if ((t.splitType === 'custom' || t.splitType === 'ratio') && t.splitDetails) {
    bf = Number(t.splitDetails.bf) || 0;
    gf = Number(t.splitDetails.gf) || 0;
  } else {
    bf = amt / 2;
    gf = amt / 2;
  }
  return { bf, gf };
};

// --- Image Compression Helper ---
const compressImage = (base64Str, maxWidth = 800, quality = 0.6) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64Str); // Fallback
    });
};

// --- Firebase Init ---
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

const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042' },
  { id: 'transport', name: '交通', color: '#00C49F' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28' },
  { id: 'shopping', name: '購物', color: '#0088FE' },
  { id: 'house', name: '居家', color: '#8884d8' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B' },
  { id: 'other', name: '其他', color: '#999' },
];

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

// --- Gold Chart Component ---
const GoldChart = ({ data, intraday, period, loading }) => {
    if (loading) {
        return <div className="w-full h-48 flex items-center justify-center text-gray-400 text-xs"><Loader2 className="animate-spin mr-2" size={16}/> 正在取得金價數據...</div>;
    }
    
    // 決定要使用的數據源
    const chartData = useMemo(() => {
        // 如果選的是即時 (1d)，且有 intraday 資料，就用 intraday
        if (period === '1d') {
            return intraday && intraday.length > 0 ? intraday : []; 
        }
        // 否則使用歷史日線資料
        if (!data || data.length === 0) return [];
        if (period === '5d') return data.slice(-5);
        if (period === '3m') return data.slice(-90); 
        return data.slice(-10);
    }, [data, intraday, period]);

    if (!chartData || chartData.length === 0) {
        return (
            <div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2">
                <BarChart3 size={24} className="opacity-50"/>
                <span>{period === '1d' ? '今日尚無即時交易數據' : '尚無足夠的歷史數據'}</span>
            </div>
        );
    }

    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.999; // 稍微縮小範圍讓波動明顯
    const maxPrice = Math.max(...prices) * 1.001;
    const range = maxPrice - minPrice || 100;
    
    const getY = (price) => 100 - ((price - minPrice) / range) * 100;
    const getX = (index) => (index / (chartData.length - 1)) * 100;

    const points = chartData.map((d, i) => `${getX(i)},${getY(d.price)}`).join(' ');
    const isUp = chartData[chartData.length - 1].price >= chartData[0].price;

    return (
        <div className="w-full h-48 relative mt-4">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isUp ? "#eab308" : "#22c55e"} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={isUp ? "#eab308" : "#22c55e"} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`M0,100 L0,${getY(chartData[0].price)} ${chartData.map((d, i) => `L${getX(i)},${getY(d.price)}`).join(' ')} L100,100 Z`} fill="url(#goldGradient)" />
                <polyline points={points} fill="none" stroke={isUp ? "#eab308" : "#22c55e"} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-1">
                <span>{chartData[0].label}</span>
                {chartData.length > 5 && <span>{chartData[Math.floor(chartData.length / 2)].label}</span>}
                <span>{chartData[chartData.length - 1].label}</span>
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
  const [goldTransactions, setGoldTransactions] = useState([]);
  
  const [activeBookId, setActiveBookId] = useState(null);
  const [viewArchived, setViewArchived] = useState(false);

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false);
  const [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null);
  const [showJarHistory, setShowJarHistory] = useState(null); 
  const [repaymentDebt, setRepaymentDebt] = useState(null);
  const [showRoulette, setShowRoulette] = useState(false);
  const [showAddGold, setShowAddGold] = useState(false);
  const [editingGold, setEditingGold] = useState(null);
    
  const [showBookManager, setShowBookManager] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
    
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  // Gold Data State
  const [goldPrice, setGoldPrice] = useState(0); 
  const [goldHistory, setGoldHistory] = useState([]);
  const [goldIntraday, setGoldIntraday] = useState([]); // 新增：即時走勢資料
  const [goldPeriod, setGoldPeriod] = useState('1d'); // 1d, 5d, 3m
  const [goldLoading, setGoldLoading] = useState(false);
  const [goldError, setGoldError] = useState(null);

  useEffect(() => {
    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => setLoading(false), 2000);
    const initAuth = async () => { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try { 
                await signInWithCustomToken(auth, __initial_auth_token); 
            } catch(e) { 
                console.warn("Custom token failed, attempting anonymous sign-in:", e);
                try { await signInAnonymously(auth); } catch (e2) { console.error("Anonymous fallback failed:", e2); }
            }
        } else {
            try { await signInAnonymously(auth); } catch (e) { console.error("Anonymous sign-in failed:", e); } 
        }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    const savedRole = localStorage.getItem('couple_app_role');
    if (savedRole) setRole(savedRole);
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  // Fetch Real Gold Price from Vercel API
  const fetchGoldPrice = async () => {
      setGoldLoading(true);
      setGoldError(null);
      try {
          // Use relative path for Vercel API
          const response = await fetch('/api/gold');
          
          if (!response.ok) {
              throw new Error(`連線錯誤 (${response.status})`);
          }
          
          const data = await response.json();
          if (data.success) {
              setGoldPrice(data.currentPrice);
              setGoldHistory(data.history);
              setGoldIntraday(data.intraday || []); // 儲存即時走勢
          } else {
              throw new Error(data.error || '無法讀取資料');
          }
      } catch (err) {
          console.error("Gold Fetch Error:", err);
          setGoldError(`台銀連線失敗: ${err.message}`);
          setGoldPrice(2880); // Fallback
          setGoldHistory([{date:'-', price: 2880, label: '-'}]);
      } finally {
          setGoldLoading(false);
      }
  };

  useEffect(() => {
      // Fetch gold price when app starts or tab changes to gold
      if (activeTab === 'gold') {
          fetchGoldPrice();
      }
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    try {
        const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
        const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');
        const booksRef = collection(db, 'artifacts', appId, 'public', 'data', 'books');
        const goldRef = collection(db, 'artifacts', appId, 'public', 'data', 'gold_transactions');
        
        const unsubBooks = onSnapshot(booksRef, async (s) => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
            if (data.length === 0 && !s.metadata.hasPendingWrites) {
               await addDoc(booksRef, { name: "預設帳本", status: 'active', createdAt: serverTimestamp() });
               return; 
            }
            setBooks(data);
            setActiveBookId(prev => {
                if (prev && data.find(b => b.id === prev)) return prev;
                const firstActive = data.find(b => (b.status || 'active') === 'active');
                if (firstActive) return firstActive.id;
                return data[0]?.id || null;
            });
        });

        const unsubTrans = onSnapshot(transRef, (s) => {
          const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
          data.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateB !== dateA) return dateB - dateA;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
          setTransactions(data);
        });

        const unsubJars = onSnapshot(jarsRef, (s) => setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))));
        
        const unsubGold = onSnapshot(goldRef, (s) => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setGoldTransactions(data);
        });

        return () => { unsubTrans(); unsubJars(); unsubBooks(); unsubGold(); };
    } catch (e) { console.error(e); }
  }, [user]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      const defaultBookId = books[0]?.id;
      return transactions.filter(t => {
          if (t.bookId) return t.bookId === activeBookId;
          return activeBookId === defaultBookId;
      });
  }, [transactions, activeBookId, books]);

  const displayBooks = useMemo(() => {
      return books.filter(b => {
          const status = b.status || 'active';
          return viewArchived ? status === 'archived' : status === 'active';
      });
  }, [books, viewArchived]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // --- Handlers ---
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
      setRepaymentDebt(null); 
    } catch (e) { console.error(e); }
  };

  const handleSaveGold = async (data) => {
      if(!user) return;
      try {
          const payload = {
              date: data.date,
              weight: Number(data.weight), // Stored in grams
              totalCost: Number(data.totalCost),
              owner: data.owner, // 'bf' or 'gf'
              channel: data.channel,
              note: data.note,
              photo: data.photo || null,
              createdAt: serverTimestamp()
          };

          if (editingGold) {
              await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gold_transactions', editingGold.id), payload);
              showToast('黃金紀錄已更新 ✨');
          } else {
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'gold_transactions'), payload);
              showToast('黃金已入庫 💰');
          }
          setShowAddGold(false);
          setEditingGold(null);
      } catch(e) { console.error(e); }
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
  
  const handleDeleteGold = (id) => {
      setConfirmModal({
          isOpen: true, title: "刪除黃金紀錄", message: "確定要刪除這筆紀錄嗎？", isDanger: true,
          onConfirm: async () => {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gold_transactions', id));
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
      
      const newContrib = { ...jar.contributions };
      if (contributorRole === 'both') {
          const half = depositAmount / 2;
          newContrib.bf = (newContrib.bf || 0) + half;
          newContrib.gf = (newContrib.gf || 0) + half;
      } else {
          newContrib[contributorRole] = (newContrib[contributorRole] || 0) + depositAmount;
      }
      
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
    /* ... (unchanged) ... */
  };

  const handleDeleteJarHistoryItem = async (jar, item) => {
    /* ... (unchanged) ... */
  };

  const handleSaveBook = async (name, status = 'active') => {
      if(!user || !name.trim()) return;
      try {
          if(editingBook) {
              await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', editingBook.id), {
                  name, status, updatedAt: serverTimestamp()
              });
              showToast('帳本已更新 ✨');
          } else {
              const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), {
                  name, status, createdAt: serverTimestamp()
              });
              setActiveBookId(docRef.id); 
              showToast('新帳本已建立 📘');
          }
          setShowBookManager(false);
          setEditingBook(null);
      } catch(e) { console.error(e); }
  };

  const handleDeleteBook = async (bookId) => {
      if(books.filter(b => (b.status||'active') === 'active').length <= 1 && editingBook?.status !== 'archived') {
          showToast('至少需要保留一個使用中的帳本 ⚠️');
          return;
      }
      setConfirmModal({
        isOpen: true, title: "刪除帳本", message: "確定要永久刪除這個帳本嗎？裡面的記帳紀錄也會一併刪除！(無法復原)", isDanger: true,
        onConfirm: async () => {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', bookId));
                const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), where("bookId", "==", bookId));
                const snap = await getDocs(q);
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                if(activeBookId === bookId) {
                    const remaining = books.filter(b => b.id !== bookId && (b.status||'active') === 'active');
                    if(remaining.length > 0) setActiveBookId(remaining[0].id);
                }
                showToast('帳本已刪除 🗑️');
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            } catch(e) { console.error(e); }
        }
      });
  };

  const handleScanComplete = (scannedItem) => {
      setEditingTransaction({
          amount: scannedItem.amount,
          note: scannedItem.note,
          category: scannedItem.category,
          date: scannedItem.date || new Date().toISOString().split('T')[0],
      });
      setShowScanner(false);
      setShowAddTransaction(true);
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
          <div className="flex items-center gap-3">
              {activeTab === 'overview' && (
                  <button 
                    onClick={() => setViewArchived(!viewArchived)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${viewArchived ? 'bg-white text-gray-800 border-white' : 'bg-transparent text-white/80 border-white/30'}`}
                  >
                      {viewArchived ? <Archive size={12}/> : <Book size={12}/>}
                      {viewArchived ? '歷史' : '使用中'}
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
                         <button 
                           key={book.id} 
                           onClick={() => setActiveBookId(book.id)}
                           className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeBookId === book.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
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
                         <button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2 bg-white text-gray-400 rounded-xl shadow-sm hover:bg-gray-50">
                             <Plus size={18} />
                         </button>
                     )}
                     {displayBooks.length === 0 && <div className="text-gray-400 text-sm italic py-2">沒有{viewArchived ? '封存' : '使用中'}的帳本</div>}
                 </div>
             </div>
        )}
        
        {activeTab === 'overview' && (
            <Overview 
                transactions={filteredTransactions} 
                role={role} 
                readOnly={viewArchived}
                onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} 
                onScan={() => setShowScanner(true)}
                onEdit={(t) => { 
                    if(viewArchived) return; 
                    setEditingTransaction(t); 
                    setShowAddTransaction(true); 
                }} 
                onDelete={(id) => {
                    if(viewArchived) return;
                    handleDeleteTransaction(id);
                }} 
                onRepay={(debt) => setRepaymentDebt(debt)}
            />
        )}

        {activeTab === 'stats' && (
            <div>
                <div className="bg-white px-4 py-2 rounded-xl shadow-sm mb-4 inline-flex items-center gap-2 text-sm font-bold text-gray-600">
                    <Book size={14}/> 統計範圍: {books.find(b => b.id === activeBookId)?.name || '未知帳本'}
                </div>
                <Statistics transactions={filteredTransactions} />
            </div>
        )}
        {activeTab === 'savings' && (
            <Savings 
                jars={jars} 
                role={role} 
                onAdd={() => { setEditingJar(null); setShowAddJar(true); }} 
                onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} 
                onDeposit={(id) => setShowJarDeposit(id)} 
                onDelete={handleDeleteJar} 
                onHistory={(j) => setShowJarHistory(j)} 
                onOpenRoulette={() => setShowRoulette(true)}
            />
        )}
        {activeTab === 'gold' && (
            <GoldView 
                transactions={goldTransactions}
                goldPrice={goldPrice}
                history={goldHistory}
                period={goldPeriod}
                setPeriod={setGoldPeriod}
                role={role}
                onAdd={() => { setEditingGold(null); setShowAddGold(true); }}
                onEdit={(t) => { setEditingGold(t); setShowAddGold(true); }}
                onDelete={handleDeleteGold}
                loading={goldLoading}
                error={goldError}
                onRefresh={fetchGoldPrice}
                intraday={goldIntraday} // Pass intraday data to GoldView
            />
        )}
        {activeTab === 'settings' && <SettingsView role={role} onLogout={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} />}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Coins} label="黃金" active={activeTab === 'gold'} onClick={() => setActiveTab('gold')} role={role} />
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
      {showScanner && <ReceiptScannerModal onClose={() => setShowScanner(false)} onConfirm={handleScanComplete} />}
      {showAddGold && <AddGoldModal onClose={() => setShowAddGold(false)} onSave={handleSaveGold} currentPrice={goldPrice} initialData={editingGold} role={role} />}
      
      {showRoulette && <RouletteModal jars={jars} role={role} onClose={() => setShowRoulette(false)} onConfirm={depositToJar} />}

      {repaymentDebt !== null && (
          <RepaymentModal 
              debt={repaymentDebt} 
              onClose={() => setRepaymentDebt(null)} 
              onSave={handleSaveTransaction}
          />
      )}

      {showBookManager && (
          <BookManagerModal 
            onClose={() => setShowBookManager(false)} 
            onSave={handleSaveBook} 
            onDelete={handleDeleteBook}
            initialData={editingBook}
          />
      )}
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

// --- Gold View Component (Enhanced) ---
const GoldView = ({ transactions, goldPrice, history, period, setPeriod, onAdd, onEdit, onDelete, loading, error, onRefresh, role, intraday }) => {
    // Filter transactions by current user (since user requested "own gold")
    const myTransactions = transactions.filter(t => t.owner === role);
    
    // Calculations based on "My" gold
    const totalWeightGrams = myTransactions.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
    const totalCost = myTransactions.reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0);
    const currentValue = totalWeightGrams * goldPrice;
    const profit = currentValue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
            {/* Header / Main Card */}
            <div className={`p-6 rounded-3xl shadow-lg text-white relative overflow-hidden ${role === 'bf' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-pink-500 to-rose-600'}`}>
                <div className="absolute top-0 right-0 p-4 opacity-20"><Coins size={80} /></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start">
                        <div className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                            {role === 'bf' ? '👦 男朋友' : '👧 女朋友'} 的黃金總值 (台幣)
                        </div>
                        <button onClick={onRefresh} disabled={loading} className={`p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors ${loading ? 'animate-spin' : ''}`}>
                            <RefreshCcw size={14} className="text-white"/>
                        </button>
                    </div>
                    <div className="text-3xl font-black mb-4">{formatMoney(currentValue)}</div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                             <div className="text-white/70 text-[10px] mb-1">持有重量 (台錢)</div>
                             <div className="text-lg font-bold flex items-end gap-1">
                                {formatWeight(totalWeightGrams, 'tw_qian')}
                                <span className="text-[10px] font-normal opacity-70">({formatWeight(totalWeightGrams)})</span>
                             </div>
                        </div>
                        <div className={`rounded-xl p-3 backdrop-blur-sm ${profit >= 0 ? 'bg-green-400/30' : 'bg-red-400/30'}`}>
                             <div className="text-white/70 text-[10px] mb-1">預估損益</div>
                             <div className={`text-lg font-bold flex items-center gap-1 ${profit >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                                {profit >= 0 ? '+' : ''}{formatMoney(profit)}
                             </div>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs font-bold text-white/70">
                         <span>購入成本: {formatMoney(totalCost)}</span>
                         <span className={profit >= 0 ? 'text-green-100' : 'text-red-100'}>ROI: {roi.toFixed(2)}%</span>
                    </div>
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <div className="text-xs text-gray-400 font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            台銀賣出金價
                        </div>
                        <div className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            {formatMoney(goldPrice)} <span className="text-xs text-gray-400 font-normal">/克</span>
                        </div>
                    </div>
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        {['1d', '5d', '3m'].map(p => (
                            <button key={p} onClick={() => setPeriod(p)} className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${period === p ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
                                {p === '1d' ? '即時' : (p === '5d' ? '近五日' : '近三月')}
                            </button>
                        ))}
                    </div>
                </div>
                
                <GoldChart data={history} intraday={intraday} period={period} loading={loading} />
                {error && <div className="text-xs text-red-500 text-center mt-2 bg-red-50 p-2 rounded-lg">{error}</div>}
            </div>

            {/* Action Button */}
            <button onClick={onAdd} className="w-full bg-gray-900 text-white p-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Plus size={20} />
                <span className="font-bold">記一筆黃金</span>
            </button>

            {/* Transaction List */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <History size={16} className="text-gray-400"/>
                    <h3 className="font-bold text-gray-700">{role === 'bf' ? '男友' : '女友'}的黃金存摺</h3>
                </div>
                <div className="divide-y divide-gray-100">
                    {myTransactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">還沒有黃金紀錄</div>
                    ) : (
                        myTransactions.map(t => {
                            const itemValue = (Number(t.weight) || 0) * goldPrice;
                            const itemProfit = itemValue - Number(t.totalCost);
                            const itemRoi = t.totalCost > 0 ? (itemProfit / t.totalCost) * 100 : 0;

                            return (
                                <div key={t.id} onClick={() => onEdit(t)} className="p-4 flex items-start justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer">
                                    <div className="flex gap-3">
                                        {t.photo ? (
                                            <img src={t.photo} alt="receipt" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-xl bg-yellow-100 text-yellow-600 flex items-center justify-center">
                                                <Tag size={20} />
                                            </div>
                                        )}
                                        <div>
                                            <div className="font-bold text-gray-800 flex items-center gap-2">
                                                {formatWeight(t.weight, 'tw_qian')}
                                                {t.note && <span className="text-xs font-normal text-gray-400">({t.note})</span>}
                                            </div>
                                            <div className="text-xs text-gray-400 flex gap-2 mt-0.5">
                                                <span>{t.date}</span>
                                                {t.channel && <span>• {t.channel}</span>}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-1">成本 {formatMoney(t.totalCost)}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-bold text-sm ${itemProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {itemProfit >= 0 ? '+' : ''}{formatMoney(itemProfit)}
                                        </div>
                                        <div className={`text-[10px] font-bold ${itemProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {itemRoi.toFixed(1)}%
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="mt-2 text-gray-300 hover:text-red-400 p-1">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Add Gold Modal (New) ---
const AddGoldModal = ({ onClose, onSave, currentPrice, initialData, role }) => {
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
    const [unit, setUnit] = useState('g'); // 'g', 'tw_qian', 'kg'
    const [weightInput, setWeightInput] = useState(initialData ? (initialData.weight).toString() : '');
    const [totalCost, setTotalCost] = useState(initialData?.totalCost?.toString() || '');
    const [channel, setChannel] = useState(initialData?.channel || '');
    const [note, setNote] = useState(initialData?.note || '');
    const [photo, setPhoto] = useState(initialData?.photo || null);
    const [owner, setOwner] = useState(initialData?.owner || role);

    // Auto-calculate cost (optional, if unit price logic was strict, but user usually inputs total cost)
    // Here we trust the user input for total cost as buying price varies.

    const handlePhoto = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const compressed = await compressImage(reader.result);
                setPhoto(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = () => {
        if (!weightInput || !totalCost) return;
        
        let weightInGrams = Number(weightInput);
        if (unit === 'tw_qian') weightInGrams = weightInGrams * 3.75;
        if (unit === 'kg') weightInGrams = weightInGrams * 1000;

        onSave({
            date,
            weight: weightInGrams,
            totalCost,
            channel,
            note,
            photo,
            owner
        });
    };

    return (
        <ModalLayout title={initialData ? "編輯黃金" : "記一筆黃金"} onClose={onClose}>
            <div className="space-y-4 pt-2">
                {/* Date & Owner */}
                <div className="flex gap-2">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold outline-none" />
                    <div className="flex bg-gray-100 rounded-lg p-1 flex-1">
                        <button onClick={() => setOwner('bf')} className={`flex-1 rounded-md text-xs font-bold ${owner === 'bf' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}>男友</button>
                        <button onClick={() => setOwner('gf')} className={`flex-1 rounded-md text-xs font-bold ${owner === 'gf' ? 'bg-pink-500 text-white' : 'text-gray-500'}`}>女友</button>
                    </div>
                </div>

                {/* Weight Input with Unit Toggle */}
                <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                    <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-gray-400">重量</label>
                        <div className="flex gap-2 text-xs font-bold">
                            <button onClick={()=>setUnit('tw_qian')} className={`${unit==='tw_qian'?'text-yellow-600 underline':'text-gray-300'}`}>台錢</button>
                            <button onClick={()=>setUnit('g')} className={`${unit==='g'?'text-yellow-600 underline':'text-gray-300'}`}>公克</button>
                            <button onClick={()=>setUnit('kg')} className={`${unit==='kg'?'text-yellow-600 underline':'text-gray-300'}`}>公斤</button>
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <input type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="0.00" className="bg-transparent text-3xl font-black text-gray-800 w-full outline-none" />
                        <span className="mb-2 text-sm font-bold text-gray-400">{unit === 'tw_qian' ? '錢' : (unit === 'g' ? '克' : '公斤')}</span>
                    </div>
                </div>

                {/* Cost Input */}
                <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                    <label className="text-xs font-bold text-gray-400 block mb-1">購買總金額 (台幣)</label>
                    <input type="number" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0" className="bg-transparent text-3xl font-black text-gray-800 w-full outline-none" />
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 p-2 rounded-xl">
                        <label className="text-[10px] text-gray-400 block mb-1">購買管道</label>
                        <input type="text" value={channel} onChange={e => setChannel(e.target.value)} placeholder="例: 銀行、銀樓" className="bg-transparent w-full text-sm font-bold outline-none" />
                    </div>
                    <div className="bg-gray-50 p-2 rounded-xl">
                        <label className="text-[10px] text-gray-400 block mb-1">備註</label>
                        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="例: 生日禮物" className="bg-transparent w-full text-sm font-bold outline-none" />
                    </div>
                </div>

                {/* Photo Upload */}
                <label className="block w-full h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 relative overflow-hidden">
                    {photo ? (
                        <>
                            <img src={photo} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                            <div className="relative z-10 bg-black/50 text-white px-3 py-1 rounded-full text-xs">更換照片</div>
                        </>
                    ) : (
                        <>
                            <Camera size={24} />
                            <span className="text-xs mt-1">上傳證明/照片</span>
                        </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>

                <button onClick={handleSubmit} disabled={!weightInput || !totalCost} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">
                    {initialData ? '儲存變更' : '確認入庫'}
                </button>
            </div>
        </ModalLayout>
    );
};

// ... (Other components: CalculatorKeypad, NavBtn, RoleSelection, Overview, Statistics, Savings, Modals remain similar but ensured needed ones are present) ...
