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
  Heart, Wallet, PiggyBank, ChartPie, 
  Plus, Trash2, User, Calendar, Target, Settings, LogOut,
  RefreshCw, Pencil, CheckCircle, X, ChevronLeft, ChevronRight, 
  ArrowLeft, ArrowRight, Check, History, Percent, Book, MoreHorizontal,
  Camera, Archive, Reply, Loader2, Dices, Users,
  Coins, TrendingUp, TrendingDown, BarChart3, RefreshCcw, Scale, Store, Tag, AlertCircle,
  Calculator, ChevronDown, ChevronUp, Trophy,
  Moon, Coffee
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
    const apiKey = ""; // Keep empty as per instructions
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
    if (unit === 'tw_liang') {
        // 1 台兩 = 10 台錢 = 37.5 克
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(num / 37.5) + '兩';
    }
    if (unit === 'kg') {
        return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(num / 1000) + '公斤';
    }
    return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + '克';
};

const safeCalculate = (expression) => {
  try {
    const sanitized = (expression || '').toString().replace(/[^0-9+\-*/.]/g, '');
    if (!sanitized) return '';
    
    // Manual parser to avoid eval()
    const parts = sanitized.split(/([+\-*/])/).filter(p => p.trim() !== '');
    if (parts.length === 0) return '';
    
    let tokens = [...parts];
    
    // First pass: Multiplication and Division
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
    
    // Second pass: Addition and Subtraction
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

// --- COMPONENTS ---

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

// --- Gold Converter Component ---
const GoldConverter = ({ goldPrice, isVisible, toggleVisibility }) => {
    const [amount, setAmount] = useState('');
    const [unit, setUnit] = useState('g'); // 'g', 'tw_qian', 'tw_liang', 'kg', 'twd'

    // 基礎單位是公克 (grams)
    const getGrams = () => {
        const val = parseFloat(amount);
        if (isNaN(val)) return 0;
        
        switch(unit) {
            case 'g': return val;
            case 'tw_qian': return val * 3.75;
            case 'tw_liang': return val * 37.5;
            case 'kg': return val * 1000;
            case 'twd': return val / (goldPrice || 1); // 如果輸入金額，除以金價得到克數
            default: return 0;
        }
    };

    const grams = getGrams();
    
    // 計算顯示數值
    const displayValues = {
        twd: grams * goldPrice,
        g: grams,
        tw_qian: grams / 3.75,
        tw_liang: grams / 37.5,
        kg: grams / 1000
    };

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all duration-300">
            <button 
                onClick={toggleVisibility}
                className="w-full p-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100 transition-colors"
            >
                <div className="flex items-center gap-2 font-bold text-gray-700">
                    <Calculator size={18} className="text-orange-500"/>
                    黃金計算機
                </div>
                {isVisible ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
            </button>

            {isVisible && (
                <div className="p-5 animate-[fadeIn_0.3s]">
                    <div className="flex gap-2 mb-4">
                        <div className="relative flex-1">
                            <input 
                                type="number" 
                                value={amount} 
                                onChange={(e) => setAmount(e.target.value)} 
                                placeholder="0" 
                                className="w-full bg-gray-50 text-2xl font-black text-gray-800 p-3 rounded-xl border-2 border-transparent focus:border-orange-200 outline-none transition-colors"
                            />
                        </div>
                        <select 
                            value={unit} 
                            onChange={(e) => setUnit(e.target.value)}
                            className="bg-gray-100 font-bold text-gray-600 rounded-xl px-2 outline-none border-r-[10px] border-transparent"
                        >
                            <option value="g">公克 (g)</option>
                            <option value="tw_qian">台錢</option>
                            <option value="tw_liang">台兩</option>
                            <option value="kg">公斤</option>
                            <option value="twd">金額 (NTD)</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className={`p-3 rounded-xl border ${unit === 'twd' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="text-[10px] text-gray-400 mb-1">金額 (TWD)</div>
                            <div className="font-black text-gray-800 text-lg">{formatMoney(displayValues.twd)}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${unit === 'tw_liang' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="text-[10px] text-gray-400 mb-1">台兩</div>
                            <div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 }).format(displayValues.tw_liang)} <span className="text-xs font-normal text-gray-400">兩</span></div>
                        </div>
                        <div className={`p-3 rounded-xl border ${unit === 'tw_qian' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="text-[10px] text-gray-400 mb-1">台錢</div>
                            <div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 3 }).format(displayValues.tw_qian)} <span className="text-xs font-normal text-gray-400">錢</span></div>
                        </div>
                        <div className={`p-3 rounded-xl border ${unit === 'g' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="text-[10px] text-gray-400 mb-1">公克 (g)</div>
                            <div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(displayValues.g)} <span className="text-xs font-normal text-gray-400">克</span></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Gold Chart Component (Smooth & Beautiful) ---
// Helper functions for Bezier Curve generation
const svgPath = (points, command) => {
  const d = points.reduce((acc, point, i, a) => i === 0
    ? `M ${point[0]},${point[1]}`
    : `${acc} ${command(point, i, a)}`
  , '');
  return d;
}

const line = (pointA, pointB) => {
  const lengthX = pointB[0] - pointA[0];
  const lengthY = pointB[1] - pointA[1];
  return {
    length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
    angle: Math.atan2(lengthY, lengthX)
  };
}

const controlPoint = (current, previous, next, reverse) => {
  const p = previous || current;
  const n = next || current;
  const smoothing = 0.15; // Smoothness factor (0.15 is good for gentle curves)
  const o = line(p, n);
  const angle = o.angle + (reverse ? Math.PI : 0);
  const length = o.length * smoothing;
  const x = current[0] + Math.cos(angle) * length;
  const y = current[1] + Math.sin(angle) * length;
  return [x, y];
}

const bezierCommand = (point, i, a) => {
  const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point);
  const [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true);
  return `C ${cpsX.toFixed(2)},${cpsY.toFixed(2)} ${cpeX.toFixed(2)},${cpeY.toFixed(2)} ${point[0]},${point[1]}`;
}

const GoldChart = ({ data, intraday, period, loading, isVisible, toggleVisibility, goldPrice, setPeriod }) => {
    const [hoverData, setHoverData] = useState(null);
    const containerRef = useRef(null);

    // 決定要使用的數據源
    const chartData = useMemo(() => {
        if (period === '1d') {
            return intraday && intraday.length > 0 ? intraday : []; 
        }
        if (!data || data.length === 0) return [];
        if (period === '10d') return data.slice(-10);
        if (period === '3m') return data.slice(-90); 
        return data.slice(-10);
    }, [data, intraday, period]);

    const handleMouseMove = (e) => {
        if (!containerRef.current || chartData.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; 
        const width = rect.width;
        let index = Math.round((x / width) * (chartData.length - 1));
        index = Math.max(0, Math.min(index, chartData.length - 1));
        setHoverData({
            index,
            item: chartData[index],
            xPos: (index / (chartData.length - 1)) * 100 
        });
    };

    const handleMouseLeave = () => {
        setHoverData(null);
    };

    if (loading) return null; // Or skeleton

    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.999;
    const maxPrice = Math.max(...prices) * 1.001;
    const range = maxPrice - minPrice || 100;
    
    const getY = (price) => 100 - ((price - minPrice) / range) * 100;
    const getX = (index) => (index / (chartData.length - 1)) * 100;

    // Generate Points for Bezier
    const points = chartData.map((d, i) => [getX(i), getY(d.price)]);
    
    // Create Smooth Path
    const pathD = points.length > 1 ? svgPath(points, bezierCommand) : '';
    const fillPathD = points.length > 1 ? `${pathD} L 100,100 L 0,100 Z` : '';

    // Check if it's weekend (0=Sun, 6=Sat)
    const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    // 如果是週末且選即時，強制判定為休市
    const isMarketClosed = period === '1d' && isWeekend;

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all duration-300 relative group">
            {/* Header (Integrated Price Info & Toggle) */}
            <div className="p-5 flex justify-between items-start cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={toggleVisibility}>
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        {isMarketClosed ? (
                            <>
                                <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
                                <span className="text-sm font-bold text-orange-500 flex items-center gap-1">休市中 <Moon size={12}/></span>
                            </>
                        ) : (
                            <>
                                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div>
                                <span className="text-sm font-bold text-gray-400">台銀賣出金價</span>
                            </>
                        )}
                    </div>
                    <div className="text-3xl font-black text-gray-800 tracking-tight">
                        {formatMoney(goldPrice)} <span className="text-sm text-gray-400 font-normal">/克</span>
                    </div>
                    {/* Multi-unit display */}
                    <div className="flex flex-wrap gap-2 mt-2">
                        <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-100 px-2 py-1 rounded-lg">
                            <Scale size={10} className="text-yellow-600"/>
                            <span className="text-[10px] font-bold text-yellow-700">
                                {formatMoney(goldPrice * 3.75)} /台錢
                            </span>
                        </div>
                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                            <span className="text-[10px] font-bold text-gray-600">
                                {formatMoney(goldPrice * 1000)} /公斤
                            </span>
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-col items-end gap-3">
                    <div className="flex bg-gray-100 rounded-lg p-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {['1d', '10d', '3m'].map(p => (
                            <button 
                                type="button" 
                                key={p} 
                                onClick={() => setPeriod(p)} 
                                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${period === p ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {p === '1d' ? '即時' : (p === '10d' ? '近十日' : '近三月')}
                            </button>
                        ))}
                    </div>
                    {isVisible ? <ChevronUp size={20} className="text-gray-300"/> : <ChevronDown size={20} className="text-gray-300"/>}
                </div>
            </div>

            {/* Collapsible Chart Body */}
            {isVisible && (
                <div className="px-5 pb-5 animate-[fadeIn_0.3s]">
                    {loading ? (
                        <div className="w-full h-48 flex items-center justify-center text-gray-400 text-xs">
                            <Loader2 className="animate-spin mr-2" size={16}/> 正在取得金價數據...
                        </div>
                    ) : (isMarketClosed) ? (
                        <div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 gap-3 bg-gray-50/50 rounded-2xl border border-gray-100/50">
                            <div className="bg-white p-3 rounded-full shadow-sm">
                                <Coffee size={24} className="text-orange-300"/>
                            </div>
                            <div className="text-center">
                                <div className="text-xs font-bold text-gray-500">市場休市中</div>
                                <div className="text-[10px] text-gray-400 mt-1">顯示最後收盤價格</div>
                            </div>
                        </div>
                    ) : (!chartData || chartData.length === 0) ? (
                        <div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2">
                            <BarChart3 size={24} className="opacity-50"/>
                            <span>尚無足夠的歷史數據</span>
                        </div>
                    ) : (
                        <div className="w-full h-48 relative select-none mt-2" 
                             ref={containerRef}
                             onMouseMove={handleMouseMove}
                             onTouchMove={(e) => handleMouseMove(e.touches[0])}
                             onMouseLeave={handleMouseLeave}
                             onTouchEnd={handleMouseLeave}
                        >
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                <defs>
                                    <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#eab308" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                
                                {/* Grid Lines (0%, 50%, 100%) */}
                                <line x1="0" y1="0" x2="100" y2="0" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="2" />
                                <line x1="0" y1="50" x2="100" y2="50" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="2" />
                                <line x1="0" y1="100" x2="100" y2="100" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="2" />

                                {/* Area Fill */}
                                <path d={fillPathD} fill="url(#goldGradient)" />
                                
                                {/* Smooth Curve Line */}
                                <path d={pathD} fill="none" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                
                                {/* Hover Indicator */}
                                {hoverData && (
                                    <g>
                                        <line 
                                            x1={hoverData.xPos} y1="0" 
                                            x2={hoverData.xPos} y2="100" 
                                            stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="2"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                        <circle 
                                            cx={hoverData.xPos} 
                                            cy={getY(hoverData.item.price)} 
                                            r="2.5" 
                                            fill="#eab308" stroke="white" strokeWidth="1.5"
                                        />
                                    </g>
                                )}
                            </svg>

                            {/* Y-Axis Labels (Right Side) */}
                            <div className="absolute right-0 top-0 text-[8px] text-gray-300 font-bold -translate-y-1/2 bg-white px-1">{formatMoney(maxPrice)}</div>
                            <div className="absolute right-0 bottom-0 text-[8px] text-gray-300 font-bold translate-y-1/2 bg-white px-1">{formatMoney(minPrice)}</div>

                            {/* HTML Overlay for Tooltip */}
                            {hoverData && (
                                <div 
                                    style={{ 
                                        position: 'absolute', 
                                        left: `${hoverData.xPos}%`, 
                                        top: 0,
                                        transform: `translateX(${hoverData.xPos > 50 ? '-105%' : '5%'})`,
                                        pointerEvents: 'none'
                                    }}
                                    className="bg-gray-800/90 text-white p-2 rounded-lg shadow-xl text-xs z-10 backdrop-blur-sm border border-white/10"
                                >
                                    <div className="font-bold text-yellow-400 mb-0.5">{formatMoney(hoverData.item.price)}</div>
                                    <div className="text-gray-300 text-[10px]">{hoverData.item.date} {hoverData.item.label !== hoverData.item.date ? hoverData.item.label : ''}</div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Footer Labels */}
                    {chartData && chartData.length > 0 && (
                        <div className="flex justify-between text-[10px] text-gray-400 mt-3 px-1 border-t border-gray-50 pt-2">
                            <span>{chartData[0].label}</span>
                            {chartData.length > 5 && <span>{chartData[Math.floor(chartData.length/2)].label}</span>}
                            <span>{chartData[chartData.length - 1].label}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 w-full ${active ? (role === 'bf' ? 'text-blue-600' : 'text-pink-600') : 'text-gray-400'}`}>
    <Icon size={24} strokeWidth={active ? 2.5 : 2} />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

// --- Missing RoleSelection Component ---
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
    // UI States for Collapsible Sections
    const [showConverter, setShowConverter] = useState(false);
    const [showChart, setShowChart] = useState(false);

    // Filter transactions by current user
    const myTransactions = transactions.filter(t => t.owner === role);
    
    // Calculations based on "My" gold
    const totalWeightGrams = myTransactions.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
    const totalCost = myTransactions.reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0);
    const currentValue = totalWeightGrams * goldPrice;
    const profit = currentValue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    
    // NEW: Calculate Average Cost
    const avgCost = totalWeightGrams > 0 ? totalCost / totalWeightGrams : 0;

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
                        <button type="button" onClick={onRefresh} disabled={loading} className={`p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors ${loading ? 'animate-spin' : ''}`}>
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

                    {/* Enhanced Footer with Avg Cost */}
                    <div className="mt-4 grid grid-cols-2 gap-y-1 text-xs font-bold text-white/70">
                         <span>購入成本: {formatMoney(totalCost)}</span>
                         <span>平均成本: {formatMoney(avgCost)}/g</span>
                         <span className={profit >= 0 ? 'text-green-100' : 'text-red-100'}>ROI: {roi.toFixed(2)}%</span>
                         <span></span>
                    </div>
                </div>
            </div>

            {/* Action Button - Moved to Top & Styled */}
            <button 
                type="button" 
                onClick={onAdd} 
                className={`w-full p-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform text-white font-bold text-lg
                    ${role === 'bf' 
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-200' 
                        : 'bg-gradient-to-r from-pink-500 to-rose-500 shadow-pink-200'}`}
            >
                <Plus size={24} />
                記一筆黃金
            </button>

            {/* Collapsible Converter */}
            <GoldConverter 
                goldPrice={goldPrice} 
                isVisible={showConverter} 
                toggleVisibility={() => setShowConverter(!showConverter)} 
            />

            {/* Collapsible Chart (Merged Price Info & Chart) */}
            <GoldChart 
                data={history} 
                intraday={intraday} 
                period={period} 
                setPeriod={setPeriod}
                goldPrice={goldPrice}
                loading={loading} 
                isVisible={showChart}
                toggleVisibility={() => setShowChart(!showChart)}
            />
            
            {error && <div className="text-xs text-red-500 text-center mt-2 bg-red-50 p-2 rounded-lg">{error}</div>}

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
                            const weightG = Number(t.weight) || 0;
                            const cost = Number(t.totalCost) || 0;
                            const itemValue = weightG * goldPrice;
                            const itemProfit = itemValue - cost;
                            const itemRoi = cost > 0 ? (itemProfit / cost) * 100 : 0;
                            const costPerGram = weightG > 0 ? cost / weightG : 0;

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
                                            <div className="text-[10px] text-gray-400 mt-1 flex gap-2">
                                                <span>總成本 {formatMoney(t.totalCost)}</span>
                                                <span className="text-gray-300">|</span>
                                                <span>均價 {formatMoney(costPerGram)}/g</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-bold text-sm ${itemProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {itemProfit >= 0 ? '+' : ''}{formatMoney(itemProfit)}
                                        </div>
                                        <div className={`text-[10px] font-bold ${itemProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {itemRoi.toFixed(1)}%
                                        </div>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="mt-2 text-gray-300 hover:text-red-400 p-1">
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

// ... (Rest of App.jsx components)
// ... (AddGoldModal, Overview, SettingsView, Statistics, Savings, ModalLayout, BookManagerModal, ReceiptScannerModal, AddTransactionModal, AddJarModal, DepositModal, JarHistoryModal, RouletteModal, RepaymentModal)

// --- Main App Component ---
export default function App() {
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
  const [goldIntraday, setGoldIntraday] = useState([]); 
  // 修正預設為 '1d' (即時)
  const [goldPeriod, setGoldPeriod] = useState('1d'); 
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
              let price = data.currentPrice;
              // Weekend check: if currentPrice is 0 or null, use last history price
              if (!price && data.history && data.history.length > 0) {
                  price = data.history[data.history.length - 1].price;
              }
              setGoldPrice(price);
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

  const handleSaveJar = async (name, target, owner) => {
    if (!user) return;
    try {
      const finalTarget = Number(safeCalculate(target));
      if (editingJar) {
         // Update existing jar (owner is usually not changed on edit to avoid confusion, but if new owner passed we use it)
         const updateData = { name, targetAmount: finalTarget, updatedAt: serverTimestamp() };
         if (owner) updateData.owner = owner; // Only update owner if provided (e.g. creating new)
         
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), updateData);
         showToast('存錢罐已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { 
            name, 
            targetAmount: finalTarget, 
            currentAmount: 0, 
            contributions: { bf: 0, gf: 0 }, 
            history: [], 
            owner: owner || 'shared', // Default to shared if undefined
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
    try {
        const diff = Number(newAmount) - oldItem.amount;
        const newTotal = (jar.currentAmount || 0) + diff;
        const newContrib = { ...jar.contributions };
        if (oldItem.role === 'both') {
            const halfDiff = diff / 2;
            newContrib.bf = (newContrib.bf || 0) + halfDiff;
            newContrib.gf = (newContrib.gf || 0) + halfDiff;
        } else {
            newContrib[oldItem.role] = (newContrib[oldItem.role] || 0) + diff;
        }
        const newHistory = (jar.history || []).map(item => item.id === oldItem.id ? { ...item, amount: Number(newAmount) } : item);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { currentAmount: newTotal, contributions: newContrib, history: newHistory });
        showToast('紀錄已修正 ✨');
    } catch(e) { console.error(e); }
  };

  const handleDeleteJarHistoryItem = async (jar, item) => {
    setConfirmModal({
        isOpen: true, title: "刪除存錢紀錄", message: "確定要刪除這筆存款嗎？", isDanger: true,
        onConfirm: async () => {
            try {
                const newTotal = (jar.currentAmount || 0) - item.amount;
                const newContrib = { ...jar.contributions };
                if (item.role === 'both') {
                    const half = item.amount / 2;
                    newContrib.bf = Math.max(0, (newContrib.bf || 0) - half);
                    newContrib.gf = Math.max(0, (newContrib.gf || 0) - half);
                } else {
                    newContrib[item.role] = Math.max(0, (newContrib[item.role] || 0) - item.amount);
                }
                const newHistory = (jar.history || []).filter(h => h.id !== item.id);
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { currentAmount: newTotal, contributions: newContrib, history: newHistory });
                showToast('紀錄已刪除 🗑️');
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            } catch(e) { console.error(e); }
        }
    });
  };

  const handleCompleteJar = async (jar) => {
    setConfirmModal({
        isOpen: true,
        title: "恭喜達成目標！🎉",
        message: `確定要將「${jar.name}」標記為已完成嗎？這將會把它移至榮譽殿堂。`,
        isDanger: false, 
        onConfirm: async () => {
            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), {
                    status: 'completed',
                    completedAt: serverTimestamp()
                });
                showToast('目標達成！太棒了 🏆');
                setConfirmModal({ isOpen: false });
            } catch (e) { console.error(e); }
        }
    });
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
                onComplete={handleCompleteJar}
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
                intraday={goldIntraday}
            />
        )}
        {activeTab === 'settings' && <SettingsView role={role} onLogout={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} />}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around py-3 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={ChartPie} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
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
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={handleSaveJar} initialData={editingJar} role={role} />}
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
