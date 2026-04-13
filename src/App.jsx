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
    const apiKey = ""; 
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
    if (unit === 'tw_qian') return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num / 3.75) + '錢';
    if (unit === 'tw_liang') return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(num / 37.5) + '兩';
    if (unit === 'kg') return new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(num / 1000) + '公斤';
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
        const prev = parseFloat(tokens[i-1]), next = parseFloat(tokens[i+1]), op = tokens[i];
        let res = 0;
        if (op === '*') res = prev * next;
        if (op === '/') res = prev / next;
        tokens.splice(i-1, 3, res);
        i -= 2;
      }
    }
    let result = parseFloat(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i], next = parseFloat(tokens[i+1]);
      if (op === '+') result += next;
      if (op === '-') result -= next;
    }
    return isNaN(result) || !isFinite(result) ? '' : result.toString();
  } catch (e) { return ''; }
};

const calculateExpense = (t) => {
  const amt = Number(t.amount) || 0;
  let bf = 0, gf = 0;
  if (t.category === 'repayment') return { bf: 0, gf: 0 }; 
  if (t.splitType === 'shared') { bf = amt / 2; gf = amt / 2; } 
  else if (t.splitType === 'bf_personal') { bf = amt; gf = 0; } 
  else if (t.splitType === 'gf_personal') { bf = 0; gf = amt; } 
  else if ((t.splitType === 'custom' || t.splitType === 'ratio') && t.splitDetails) { bf = Number(t.splitDetails.bf) || 0; gf = Number(t.splitDetails.gf) || 0; } 
  else { bf = amt / 2; gf = amt / 2; }
  return { bf, gf };
};

const compressImage = (base64Str, maxWidth = 800, quality = 0.6) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width, height = img.height;
            if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64Str);
    });
};

// --- Firebase Init ---
let app;
try { app = initializeApp(firebaseConfig); } catch (e) {}
const auth = getAuth(app);
const db = getFirestore(app);

const getInitialAppId = () => {
    try {
        const saved = localStorage.getItem('custom_app_id');
        if (saved) return saved;
    } catch(e) {}
    return typeof __app_id !== 'undefined' ? __app_id : 'couple-ledger-pro';
};
const rawAppId = getInitialAppId();
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
  <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-pink-50 to-blue-50 flex flex-col items-center justify-center font-sans">
    <div className="bg-white p-6 rounded-full shadow-xl mb-5">
       <svg width="64" height="64" viewBox="0 0 24 24" fill="#ec4899" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
    </div>
    <h2 className="text-2xl font-bold text-gray-700 tracking-widest">載入中...</h2>
    <p className="text-gray-400 text-sm mt-2">正在同步我們的小金庫</p>
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
          <button key={i} type="button" onClick={(e) => { e.stopPropagation(); handlePress(k.val || k.label); }} className={`${compact ? 'h-9 text-base' : 'h-11 text-lg'} rounded-xl font-bold shadow-sm active:scale-95 transition-transform flex items-center justify-center ${k.type === 'op' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-700'} ${k.color || ''}`}>{k.label}</button>
        ))}
      </div>
      <div className="flex gap-2">
         <button type="button" onClick={(e) => { e.stopPropagation(); handlePress('backspace'); }} className={`${compact ? 'h-9' : 'h-11'} flex-1 bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 active:scale-95 transition-transform hover:bg-gray-300`}><ArrowLeft size={compact ? 20 : 24} /></button>
         <button type="button" onClick={(e) => { e.stopPropagation(); const result = safeCalculate(value); onChange(result); onConfirm && onConfirm(result); }} className={`${compact ? 'h-9' : 'h-11'} flex-[2] bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md`}><Check size={20} /> <span>確認</span></button>
      </div>
    </div>
  );
};

const SimpleDonutChart = ({ data, total }) => {
  if (!total || total === 0) return (<div className="h-64 w-full flex items-center justify-center"><div className="w-48 h-48 rounded-full border-4 border-gray-100 flex items-center justify-center"><span className="text-gray-300 font-bold text-sm">本月尚無數據</span></div></div>);
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
          return (<circle key={index} cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke={item.color} strokeWidth="5" strokeDasharray={strokeDasharray} strokeDashoffset={offset} className="transition-all duration-500 ease-out" />);
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
         <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">總支出</span>
         <span className="text-2xl font-black text-gray-800">{formatMoney(total)}</span>
      </div>
    </div>
  );
};

const GoldConverter = ({ goldPrice, isVisible, toggleVisibility }) => {
    const [amount, setAmount] = useState('');
    const [unit, setUnit] = useState('g'); 
    const getGrams = () => {
        const val = parseFloat(amount);
        if (isNaN(val)) return 0;
        switch(unit) { case 'g': return val; case 'tw_qian': return val * 3.75; case 'tw_liang': return val * 37.5; case 'kg': return val * 1000; case 'twd': return val / (goldPrice || 1); default: return 0; }
    };
    const grams = getGrams();
    const displayValues = { twd: grams * goldPrice, g: grams, tw_qian: grams / 3.75, tw_liang: grams / 37.5, kg: grams / 1000 };
    return (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all duration-300">
            <button onClick={toggleVisibility} className="w-full p-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2 font-bold text-gray-700"><Calculator size={18} className="text-orange-500"/>黃金計算機</div>
                {isVisible ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
            </button>
            {isVisible && (
                <div className="p-5 animate-[fadeIn_0.3s]">
                    <div className="flex gap-2 mb-4">
                        <div className="relative flex-1"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full bg-gray-50 text-2xl font-black text-gray-800 p-3 rounded-xl border-2 border-transparent focus:border-orange-200 outline-none transition-colors" /></div>
                        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-gray-100 font-bold text-gray-600 rounded-xl px-2 outline-none border-r-[10px] border-transparent"><option value="g">公克 (g)</option><option value="tw_qian">台錢</option><option value="tw_liang">台兩</option><option value="kg">公斤</option><option value="twd">金額 (NTD)</option></select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className={`p-3 rounded-xl border ${unit === 'twd' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">金額 (TWD)</div><div className="font-black text-gray-800 text-lg">{formatMoney(displayValues.twd)}</div></div>
                        <div className={`p-3 rounded-xl border ${unit === 'tw_liang' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">台兩</div><div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 }).format(displayValues.tw_liang)} <span className="text-xs font-normal text-gray-400">兩</span></div></div>
                        <div className={`p-3 rounded-xl border ${unit === 'tw_qian' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">台錢</div><div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 3 }).format(displayValues.tw_qian)} <span className="text-xs font-normal text-gray-400">錢</span></div></div>
                        <div className={`p-3 rounded-xl border ${unit === 'g' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">公克 (g)</div><div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(displayValues.g)} <span className="text-xs font-normal text-gray-400">克</span></div></div>
                    </div>
                </div>
            )}
        </div>
    );
};

const svgPath = (points, command) => points.reduce((acc, point, i, a) => i === 0 ? `M ${point[0]},${point[1]}` : `${acc} ${command(point, i, a)}`, '');
const line = (pointA, pointB) => ({ length: Math.sqrt(Math.pow(pointB[0] - pointA[0], 2) + Math.pow(pointB[1] - pointA[1], 2)), angle: Math.atan2(pointB[1] - pointA[1], pointB[0] - pointA[0]) });
const controlPoint = (current, previous, next, reverse) => { const p = previous || current, n = next || current, smoothing = 0.15, o = line(p, n), angle = o.angle + (reverse ? Math.PI : 0), length = o.length * smoothing; return [current[0] + Math.cos(angle) * length, current[1] + Math.sin(angle) * length]; }
const bezierCommand = (point, i, a) => { const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point), [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true); return `C ${cpsX.toFixed(2)},${cpsY.toFixed(2)} ${cpeX.toFixed(2)},${cpeY.toFixed(2)} ${point[0]},${point[1]}`; }

const GoldChart = ({ data, intraday, period, loading, isVisible, toggleVisibility, goldPrice, setPeriod }) => {
    const [hoverData, setHoverData] = useState(null);
    const containerRef = useRef(null);

    const chartData = useMemo(() => {
        if (period === '1d') return intraday && intraday.length > 0 ? intraday : []; 
        if (!data || data.length === 0) return [];
        if (period === '10d') return data.slice(-10);
        if (period === '3m') return data.slice(-90); 
        return data.slice(-10);
    }, [data, intraday, period]);

    const handleMouseMove = (e) => {
        if (!containerRef.current || chartData.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect(), x = e.clientX - rect.left, width = rect.width;
        let index = Math.max(0, Math.min(Math.round((x / width) * (chartData.length - 1)), chartData.length - 1));
        setHoverData({ index, item: chartData[index], xPos: (index / (chartData.length - 1)) * 100 });
    };

    if (loading) return null;

    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.999, maxPrice = Math.max(...prices) * 1.001, range = maxPrice - minPrice || 100;
    const getY = (price) => 100 - ((price - minPrice) / range) * 100, getX = (index) => (index / (chartData.length - 1)) * 100;
    const points = chartData.map((d, i) => [getX(i), getY(d.price)]);
    const pathD = points.length > 1 ? svgPath(points, bezierCommand) : '', fillPathD = points.length > 1 ? `${pathD} L 100,100 L 0,100 Z` : '';

    const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    const isMarketClosed = period === '1d' && isWeekend;

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all duration-300 relative group">
            <div className="p-5 flex justify-between items-start cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={toggleVisibility}>
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        {isMarketClosed ? (<><div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div><span className="text-sm font-bold text-orange-500 flex items-center gap-1">休市中 <Moon size={12}/></span></>) : (<><div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div><span className="text-sm font-bold text-gray-400">賣出金價</span></>)}
                    </div>
                    <div className="text-3xl font-black text-gray-800 tracking-tight">{formatMoney(goldPrice)} <span className="text-sm text-gray-400 font-normal">/克</span></div>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-100 px-2 py-1 rounded-lg"><Scale size={10} className="text-yellow-600"/><span className="text-[10px] font-bold text-yellow-700">{formatMoney(goldPrice * 3.75)} /台錢</span></div>
                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg"><span className="text-[10px] font-bold text-gray-600">{formatMoney(goldPrice * 1000)} /公斤</span></div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                    <div className="flex bg-gray-100 rounded-lg p-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {['1d', '10d', '3m'].map(p => (<button type="button" key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${period === p ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>{p === '1d' ? '即時' : (p === '10d' ? '近十日' : '近三月')}</button>))}
                    </div>
                    {isVisible ? <ChevronUp size={20} className="text-gray-300"/> : <ChevronDown size={20} className="text-gray-300"/>}
                </div>
            </div>

            {isVisible && (
                <div className="px-5 pb-5 animate-[fadeIn_0.3s]">
                    {loading ? (<div className="w-full h-48 flex items-center justify-center text-gray-400 text-xs"><Loader2 className="animate-spin mr-2" size={16}/> 正在取得金價數據...</div>) : (isMarketClosed) ? (<div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 gap-3 bg-gray-50/50 rounded-2xl border border-gray-100/50"><div className="bg-white p-3 rounded-full shadow-sm"><Coffee size={24} className="text-orange-300"/></div><div className="text-center"><div className="text-xs font-bold text-gray-500">市場休市中</div><div className="text-[10px] text-gray-400 mt-1">顯示最後收盤價格</div></div></div>) : (!chartData || chartData.length === 0) ? (<div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2"><BarChart3 size={24} className="opacity-50"/><span>尚無足夠的歷史數據</span></div>) : (
                        <div className="w-full h-48 relative select-none mt-2" ref={containerRef} onMouseMove={handleMouseMove} onTouchMove={(e) => handleMouseMove(e.touches[0])} onMouseLeave={() => setHoverData(null)} onTouchEnd={() => setHoverData(null)}>
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                <defs><linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eab308" stopOpacity="0.3" /><stop offset="100%" stopColor="#eab308" stopOpacity="0" /></linearGradient></defs>
                                <line x1="0" y1="0" x2="100" y2="0" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="2" /><line x1="0" y1="50" x2="100" y2="50" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="2" /><line x1="0" y1="100" x2="100" y2="100" stroke="#f3f4f6" strokeWidth="0.5" strokeDasharray="2" />
                                <path d={fillPathD} fill="url(#goldGradient)" />
                                <path d={pathD} fill="none" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                {hoverData && (<g><line x1={hoverData.xPos} y1="0" x2={hoverData.xPos} y2="100" stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="2" vectorEffect="non-scaling-stroke"/><circle cx={hoverData.xPos} cy={getY(hoverData.item.price)} r="2.5" fill="#eab308" stroke="white" strokeWidth="1.5"/></g>)}
                            </svg>
                            <div className="absolute right-0 top-0 text-[8px] text-gray-300 font-bold -translate-y-1/2 bg-white px-1">{formatMoney(maxPrice)}</div>
                            <div className="absolute right-0 bottom-0 text-[8px] text-gray-300 font-bold translate-y-1/2 bg-white px-1">{formatMoney(minPrice)}</div>
                            {hoverData && (<div style={{ position: 'absolute', left: `${hoverData.xPos}%`, top: 0, transform: `translateX(${hoverData.xPos > 50 ? '-105%' : '5%'})`, pointerEvents: 'none' }} className="bg-gray-800/90 text-white p-2 rounded-lg shadow-xl text-xs z-10 backdrop-blur-sm border border-white/10"><div className="font-bold text-yellow-400 mb-0.5">{formatMoney(hoverData.item.price)}</div><div className="text-gray-300 text-[10px]">{hoverData.item.date} {hoverData.item.label !== hoverData.item.date ? hoverData.item.label : ''}</div></div>)}
                        </div>
                    )}
                    {chartData && chartData.length > 0 && (<div className="flex justify-between text-[10px] text-gray-400 mt-3 px-1 border-t border-gray-50 pt-2"><span>{chartData[0].label}</span>{chartData.length > 5 && <span>{chartData[Math.floor(chartData.length/2)].label}</span>}<span>{chartData[chartData.length - 1].label}</span></div>)}
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

const GoldView = ({ transactions, goldPrice, history, period, setPeriod, onAdd, onEdit, onDelete, loading, error, onRefresh, role, intraday }) => {
    const [showConverter, setShowConverter] = useState(false);
    const [showChart, setShowChart] = useState(false);
    const myTransactions = transactions.filter(t => t.owner === role);
    const totalWeightGrams = myTransactions.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
    const totalCost = myTransactions.reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0);
    const currentValue = totalWeightGrams * goldPrice;
    const profit = currentValue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const avgCost = totalWeightGrams > 0 ? totalCost / totalWeightGrams : 0;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
            <div className={`p-6 rounded-3xl shadow-lg text-white relative overflow-hidden ${role === 'bf' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-pink-500 to-rose-600'}`}>
                <div className="absolute top-0 right-0 p-4 opacity-20"><Coins size={80} /></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start"><div className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">{role === 'bf' ? '👦 男朋友' : '👧 女朋友'} 的黃金總值 (台幣)</div><button type="button" onClick={onRefresh} disabled={loading} className={`p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={14} className="text-white"/></button></div>
                    <div className="text-3xl font-black mb-4">{formatMoney(currentValue)}</div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm"><div className="text-white/70 text-[10px] mb-1">持有重量 (台錢)</div><div className="text-lg font-bold flex items-end gap-1">{formatWeight(totalWeightGrams, 'tw_qian')}<span className="text-[10px] font-normal opacity-70">({formatWeight(totalWeightGrams)})</span></div></div>
                        <div className={`rounded-xl p-3 backdrop-blur-sm ${profit >= 0 ? 'bg-green-400/30' : 'bg-red-400/30'}`}><div className="text-white/70 text-[10px] mb-1">預估損益</div><div className={`text-lg font-bold flex items-center gap-1 ${profit >= 0 ? 'text-green-100' : 'text-red-100'}`}>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</div></div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-y-1 text-xs font-bold text-white/70"><span>購入成本: {formatMoney(totalCost)}</span><span>平均成本: {formatMoney(avgCost)}/g</span><span className={profit >= 0 ? 'text-green-100' : 'text-red-100'}>ROI: {roi.toFixed(2)}%</span><span></span></div>
                </div>
            </div>

            <button type="button" onClick={onAdd} className={`w-full p-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform text-white font-bold text-lg ${role === 'bf' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-200' : 'bg-gradient-to-r from-pink-500 to-rose-500 shadow-pink-200'}`}><Plus size={24} />記一筆黃金</button>
            <GoldConverter goldPrice={goldPrice} isVisible={showConverter} toggleVisibility={() => setShowConverter(!showConverter)} />
            <GoldChart data={history} intraday={intraday} period={period} setPeriod={setPeriod} goldPrice={goldPrice} loading={loading} isVisible={showChart} toggleVisibility={() => setShowChart(!showChart)}/>
            
            {error && <div className="text-xs text-red-500 text-center mt-2 bg-red-50 p-2 rounded-lg">{error}</div>}

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><History size={16} className="text-gray-400"/><h3 className="font-bold text-gray-700">{role === 'bf' ? '男友' : '女友'}的黃金存摺</h3></div>
                <div className="divide-y divide-gray-100">
                    {myTransactions.length === 0 ? (<div className="p-8 text-center text-gray-400 text-sm">還沒有黃金紀錄</div>) : (
                        myTransactions.map(t => {
                            const weightG = Number(t.weight) || 0, cost = Number(t.totalCost) || 0, itemValue = weightG * goldPrice, itemProfit = itemValue - cost, itemRoi = cost > 0 ? (itemProfit / cost) * 100 : 0, costPerGram = weightG > 0 ? cost / weightG : 0;
                            return (
                                <div key={t.id} onClick={() => onEdit(t)} className="p-4 flex items-start justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer">
                                    <div className="flex gap-3">
                                        {t.photo ? (<img src={t.photo} alt="receipt" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />) : (<div className="w-12 h-12 rounded-xl bg-yellow-100 text-yellow-600 flex items-center justify-center"><Tag size={20} /></div>)}
                                        <div>
                                            <div className="font-bold text-gray-800 flex items-center gap-2">{formatWeight(t.weight, 'tw_qian')} {t.note && <span className="text-xs font-normal text-gray-400">({t.note})</span>}</div>
                                            <div className="text-xs text-gray-400 flex gap-2 mt-0.5"><span>{t.date}</span>{t.channel && <span>• {t.channel}</span>}</div>
                                            <div className="text-[10px] text-gray-400 mt-1 flex gap-2"><span>總成本 {formatMoney(t.totalCost)}</span><span className="text-gray-300">|</span><span>均價 {formatMoney(costPerGram)}/g</span></div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-bold text-sm ${itemProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{itemProfit >= 0 ? '+' : ''}{formatMoney(itemProfit)}</div>
                                        <div className={`text-[10px] font-bold ${itemProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{itemRoi.toFixed(1)}%</div>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="mt-2 text-gray-300 hover:text-red-400 p-1"><Trash2 size={14} /></button>
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

const AddGoldModal = ({ onClose, onSave, currentPrice, initialData, role }) => {
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
    const [unit, setUnit] = useState('g');
    const [weightInput, setWeightInput] = useState(initialData?.weight ? (initialData.weight / (unit==='tw_qian'?3.75 : (unit==='tw_liang'?37.5 : (unit==='kg'?1000:1)))).toString() : '');
    const [totalCost, setTotalCost] = useState(initialData?.totalCost?.toString() ?? '');
    const [channel, setChannel] = useState(initialData?.channel || '');
    const [note, setNote] = useState(initialData?.note || '');
    const [photo, setPhoto] = useState(initialData?.photo || null);
    const [owner, setOwner] = useState(initialData?.owner || role);
    const [error, setError] = useState('');

    const handlePhoto = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const reader = new FileReader();
                reader.onloadend = async () => { const compressed = await compressImage(reader.result); setPhoto(compressed); };
                reader.readAsDataURL(file);
            } catch(e) { setError('照片處理失敗'); }
        }
    };

    const handleSubmit = () => {
        if (!weightInput || !totalCost) return setError('請輸入重量與金額');
        const weightNum = parseFloat(weightInput), costNum = parseFloat(totalCost);
        if (isNaN(weightNum) || weightNum <= 0) return setError('重量格式錯誤');
        if (isNaN(costNum) || costNum < 0) return setError('金額格式錯誤');
        let weightInGrams = weightNum;
        if (unit === 'tw_qian') weightInGrams = weightInGrams * 3.75;
        if (unit === 'tw_liang') weightInGrams = weightInGrams * 37.5;
        if (unit === 'kg') weightInGrams = weightInGrams * 1000;
        onSave({ date, weight: weightInGrams, totalCost: costNum, channel, note, photo, owner });
    };

    return (
        <ModalLayout title={initialData ? "編輯黃金" : "記一筆黃金"} onClose={onClose}>
            <div className="space-y-4 pt-2">
                {error && (<div className="bg-red-50 text-red-500 p-3 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle size={16}/> {error}</div>)}
                <div className="flex gap-2">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold outline-none border-2 border-transparent focus:border-blue-200" />
                    <div className="flex bg-gray-100 rounded-xl p-1 flex-1">
                        <button type="button" onClick={() => setOwner('bf')} className={`flex-1 rounded-lg text-xs font-bold transition-all ${owner === 'bf' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>男友</button>
                        <button type="button" onClick={() => setOwner('gf')} className={`flex-1 rounded-lg text-xs font-bold transition-all ${owner === 'gf' ? 'bg-pink-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>女友</button>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-transparent focus-within:border-yellow-200 transition-colors">
                    <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-gray-400">重量</label>
                        <div className="flex bg-white rounded-lg p-0.5 shadow-sm overflow-auto hide-scrollbar">
                            {[{id:'tw_qian', label:'台錢'}, {id:'tw_liang', label:'台兩'}, {id:'g', label:'公克'}, {id:'kg', label:'公斤'}].map(u => (<button type="button" key={u.id} onClick={()=>setUnit(u.id)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${unit===u.id ? 'bg-yellow-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>{u.label}</button>))}
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <input type="number" inputMode="decimal" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="0.00" className="bg-transparent text-4xl font-black text-gray-800 w-full outline-none" />
                        <span className="text-sm font-bold text-gray-400 mb-1">{unit === 'tw_qian' ? '錢' : (unit === 'tw_liang' ? '兩' : (unit === 'g' ? '克' : '公斤'))}</span>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-transparent focus-within:border-green-200 transition-colors">
                    <label className="text-xs font-bold text-gray-400 block mb-1">購買總金額 (台幣)</label>
                    <div className="flex items-center gap-1"><span className="text-gray-400 text-lg font-bold">$</span><input type="number" inputMode="numeric" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0" className="bg-transparent text-3xl font-black text-gray-800 w-full outline-none" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 p-3 rounded-2xl"><label className="text-[10px] text-gray-400 block mb-1 font-bold">購買管道</label><input type="text" value={channel} onChange={e => setChannel(e.target.value)} placeholder="例: 銀樓" className="bg-transparent w-full text-sm font-bold outline-none" /></div>
                    <div className="bg-gray-50 p-3 rounded-2xl"><label className="text-[10px] text-gray-400 block mb-1 font-bold">備註</label><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="例: 生日禮物" className="bg-transparent w-full text-sm font-bold outline-none" /></div>
                </div>
                <label className="block w-full h-24 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all relative overflow-hidden group">
                    {photo ? (<><img src={photo} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" /><div className="relative z-10 bg-black/70 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2"><RefreshCw size={12}/> 更換照片</div></>) : (<><Camera size={24} className="mb-1 text-gray-300 group-hover:text-gray-500 transition-colors"/><span className="text-xs font-bold">上傳證明/照片</span></>)}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>
                <button type="button" onClick={handleSubmit} disabled={!weightInput || !totalCost} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all text-lg">{initialData ? '儲存變更' : '確認入庫'}</button>
            </div>
        </ModalLayout>
    );
};

const Overview = ({ transactions, role, readOnly, onAdd, onEdit, onDelete, onScan, onRepay }) => {
  const debt = useMemo(() => {
    let bfLent = 0;
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.category === 'repayment') { t.paidBy === 'bf' ? bfLent += amt : bfLent -= amt; } 
      else {
        let gfShare = 0, bfShare = 0;
        if ((t.splitType === 'custom' || t.splitType === 'ratio') && t.splitDetails) { gfShare = Number(t.splitDetails.gf) || 0; bfShare = Number(t.splitDetails.bf) || 0; } 
        else if (t.splitType === 'shared') { gfShare = amt / 2; bfShare = amt / 2; } 
        else if (t.splitType === 'gf_personal') { gfShare = amt; } 
        else if (t.splitType === 'bf_personal') { bfShare = amt; }
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
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">本帳本結算</h2>
        <div className="flex items-center justify-center gap-2">
          {Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500 flex items-center gap-2"><CheckCircle /> 互不相欠</div> : <><span className={`text-3xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男朋友' : '女朋友'}</span><span className="text-gray-400 text-sm">先墊了</span><span className="text-2xl font-bold text-gray-800">{formatMoney(Math.abs(debt))}</span></>}
        </div>
        {Math.abs(debt) > 0 && !readOnly && (
            <button onClick={() => onRepay(debt)} className="mt-4 px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center gap-2 mx-auto"><RefreshCw size={16} /> 登記還款</button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-end px-2">
            <h3 className="font-bold text-lg text-gray-800">最近紀錄</h3>
            {!readOnly && (
                <div className="flex gap-2">
                    <button onClick={onScan} className="bg-purple-100 text-purple-600 p-3 rounded-xl shadow-sm active:scale-90 transition-transform"><Camera size={20} /></button>
                    <button onClick={onAdd} className="bg-gray-900 text-white p-3 rounded-xl shadow-lg shadow-gray-300 active:scale-90 transition-transform"><Plus size={20} /></button>
                </div>
            )}
        </div>
        {grouped.length === 0 ? <div className="text-center py-10 text-gray-400">本帳本還沒有紀錄喔</div> : grouped.map(([date, items]) => {
            const daily = items.reduce((acc, t) => { const { bf, gf } = calculateExpense(t); return { bf: acc.bf + bf, gf: acc.gf + gf }; }, { bf: 0, gf: 0 });
            return (
            <div key={date} className="space-y-2">
              <div className="flex items-center justify-between mb-2 mt-4 px-2">
                  <div className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{date}</div>
                  <div className="flex gap-3 text-xs font-bold bg-white px-2 py-1 rounded-full border border-gray-100 shadow-sm"><span className="text-blue-600 flex items-center gap-1">👦 {formatMoney(daily.bf)}</span><span className="text-gray-300">|</span><span className="text-pink-600 flex items-center gap-1">👧 {formatMoney(daily.gf)}</span></div>
              </div>
              {items.map(t => (
                <div key={t.id} onClick={() => onEdit(t)} className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between transition-colors ${readOnly ? '' : 'active:bg-gray-50 cursor-pointer'}`}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: CATEGORIES.find(c => c.id === t.category)?.color || '#999' }}>{t.category === 'repayment' ? <RefreshCw size={18} /> : (t.category === 'food' ? <span className="text-lg">🍔</span> : <span className="text-lg">🏷️</span>)}</div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-800 truncate">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div>
                        <div className="text-xs text-gray-400 flex gap-1 truncate"><span className={t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}>{t.paidBy === 'bf' ? '男友付' : '女友付'}</span><span>•</span><span>{t.category === 'repayment' ? '還款結清' : (t.splitType === 'shared' ? '平分' : (t.splitType === 'bf_personal' ? '男友個人' : (t.splitType === 'gf_personal' ? '女友個人' : (t.splitType === 'ratio' ? `比例 (${Math.round((t.splitDetails?.bf / (Number(t.amount)||1))*100)}%)` : '自訂分帳'))))}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`font-bold text-lg ${t.category === 'repayment' ? 'text-green-500' : 'text-gray-800'}`}>{formatMoney(t.amount)}</span>
                      {!readOnly && <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )})}
      </div>
    </div>
  );
};

// 💡 更新：在設定頁面加入系統診斷區塊
const SettingsView = ({ role, onLogout, diagnostics }) => {
  const [customId, setCustomId] = useState(rawAppId);

  const handleSwitchAppId = () => {
      if (!customId.trim()) return;
      localStorage.setItem('custom_app_id', customId.trim());
      window.location.reload();
  };

  const handleResetAppId = () => {
      localStorage.removeItem('custom_app_id');
      window.location.reload();
  };

  return (
  <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-4 mb-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div><div><h2 className="font-bold text-xl">{role === 'bf' ? '男朋友' : '女朋友'}</h2><p className="text-gray-400 text-sm">目前身分</p></div></div>
      <button onClick={onLogout} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 mb-4"><LogOut size={18} /> 切換身分 (登出)</button>
      
      <div className="mt-8 border-t border-gray-100 pt-6">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><Settings size={16}/> 找回舊資料 (資料夾切換器)</h3>
        <div className="bg-blue-50 p-4 rounded-xl space-y-3 border border-blue-100">
          <p className="text-xs text-blue-700 font-bold leading-relaxed">請將 Firebase 後台看到的資料夾名稱貼在下方，按切換即可立即讀取，不用再改程式碼！</p>
          <div className="flex gap-2">
            <input 
                type="text" 
                value={customId} 
                onChange={(e) => setCustomId(e.target.value)} 
                placeholder="例如: c_1fd1d2..."
                className="flex-1 p-2 rounded-lg text-xs font-mono border border-blue-200 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>
          <div className="flex gap-2 mt-2">
              <button onClick={handleSwitchAppId} className="flex-[2] py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-transform">切換並重新載入</button>
              <button onClick={handleResetAppId} className="flex-1 py-2 px-3 bg-white text-gray-500 rounded-lg text-xs font-bold border border-gray-200 active:scale-95 transition-transform">恢復預設</button>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><Settings size={16}/> 系統診斷資訊</h3>
        <div className="bg-gray-50 p-4 rounded-xl space-y-3 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">資料庫連線</span>
            <span className={diagnostics.dbError ? 'text-red-500 font-bold' : 'text-green-500 font-bold'}>
              {diagnostics.dbError ? '連線被拒' : '連線成功'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">目前的資料夾 ID</span>
            <span className="text-gray-700 font-mono font-bold bg-white px-2 py-1 rounded border border-gray-200 overflow-hidden text-ellipsis max-w-[140px] whitespace-nowrap" title={diagnostics.appId}>{diagnostics.appId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">載入的帳本 / 紀錄</span>
            <span className="text-gray-700 font-bold">{diagnostics.booksCount} 本 / {diagnostics.transCount} 筆</span>
          </div>
          {diagnostics.dbError && (
             <div className="mt-2 p-3 bg-red-100 text-red-600 rounded-lg font-bold break-words">{diagnostics.dbError}</div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};

const Statistics = ({ transactions }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const monthTransactions = useMemo(() => transactions.filter(t => { 
      const d = new Date(t.date); 
      if (isNaN(d.getTime())) return false; 
      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear() && t.category !== 'repayment'; 
  }), [transactions, currentDate]);
  
  const monthlyTotals = useMemo(() => {
      return monthTransactions.reduce((acc, t) => {
          const { bf, gf } = calculateExpense(t);
          return { bf: acc.bf + bf, gf: acc.gf + gf };
      }, { bf: 0, gf: 0 });
  }, [monthTransactions]);

  const chartData = useMemo(() => {
    const map = {}; let total = 0;
    monthTransactions.forEach(t => { const amt = Number(t.amount) || 0; if (!map[t.category]) map[t.category] = 0; map[t.category] += amt; total += amt; });
    return { data: Object.entries(map).map(([id, value]) => ({ id, value, color: CATEGORIES.find(c => c.id === id)?.color || '#999', name: CATEGORIES.find(c => c.id === id)?.name || '未知' })).sort((a, b) => b.value - a.value), total };
  }, [monthTransactions]);

  const changeMonth = (delta) => { const newDate = new Date(currentDate); newDate.setMonth(newDate.getMonth() + delta); setCurrentDate(newDate); };
  const groupedMonthTransactions = useMemo(() => {
    const groups = {};
    monthTransactions.forEach(t => { if (!t.date) return; if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [monthTransactions]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>
        <span className="font-bold text-lg">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button>
      </div>
      <div className="flex gap-3 px-1">
          <div className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-blue-400"></div><span className="text-xs font-bold text-gray-400 mb-1">👦 男友本月花費</span><span className="text-xl font-black text-blue-600">{formatMoney(monthlyTotals.bf)}</span></div>
          <div className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-pink-400"></div><span className="text-xs font-bold text-gray-400 mb-1">👧 女友本月花費</span><span className="text-xl font-black text-pink-600">{formatMoney(monthlyTotals.gf)}</span></div>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center">
        <SimpleDonutChart data={chartData.data} total={chartData.total} />
        <div className="flex flex-wrap gap-2 justify-center mt-4">{chartData.data.map(d => (<div key={d.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-100"><div className="w-2 h-2 rounded-full" style={{ background: d.color }}></div><span>{d.name}</span><span className="font-bold">{chartData.total ? Math.round(d.value / chartData.total * 100) : 0}%</span></div>))}</div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><Calendar size={18} className="text-gray-400"/><h3 className="font-bold text-gray-700">本月詳細紀錄</h3></div>
        <div className="divide-y divide-gray-100">
            {groupedMonthTransactions.length === 0 ? (<div className="p-8 text-center text-gray-400 text-sm">尚無消費紀錄</div>) : (
                groupedMonthTransactions.map(([date, items]) => {
                      const daily = items.reduce((acc, t) => { const { bf, gf } = calculateExpense(t); return { bf: acc.bf + bf, gf: acc.gf + gf }; }, { bf: 0, gf: 0 });
                      return (
                          <div key={date}>
                             <div className="bg-gray-50/50 px-4 py-2 flex justify-between items-center border-b border-gray-50"><span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{date.split('-')[1]}/{date.split('-')[2]}</span><div className="flex gap-3 text-xs font-bold"><span className="text-blue-600">👦 {formatMoney(daily.bf)}</span><span className="text-pink-600">👧 {formatMoney(daily.gf)}</span></div></div>
                             {items.map(t => (
                                 <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50"><div className="flex items-center gap-3"><div><div className="font-bold text-sm text-gray-800">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div><div className="text-xs text-gray-400" style={{ color: CATEGORIES.find(c => c.id === t.category)?.color }}>{CATEGORIES.find(c => c.id === t.category)?.name || '其他'}</div></div></div><div className="font-bold text-gray-700">{formatMoney(t.amount)}</div></div>
                             ))}
                          </div>
                      );
                })
            )}
        </div>
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onDelete, onHistory, onOpenRoulette, onComplete }) => {
  const [viewCompleted, setViewCompleted] = useState(false);
  const [viewType, setViewType] = useState('shared');

  const filterJars = (status) => {
      return jars.filter(j => {
          const jStatus = j.status || 'active';
          const isStatusMatch = status === 'completed' ? jStatus === 'completed' : jStatus !== 'completed';
          const jOwner = j.owner || 'shared';
          let isOwnerMatch = viewType === 'shared' ? jOwner === 'shared' : jOwner !== 'shared';
          return isStatusMatch && isOwnerMatch;
      }).sort((a, b) => status === 'completed' ? (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0) : (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  };

  const displayJars = filterJars(viewCompleted ? 'completed' : 'active');

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
        <div className="flex justify-between items-center px-2">
            <h2 className="font-bold text-xl text-gray-800">{viewCompleted ? '🏆 榮譽殿堂' : '🎯 存錢目標'}</h2>
            <div className="flex gap-2">
                <button onClick={() => setViewCompleted(!viewCompleted)} className={`px-3 py-2 rounded-xl shadow-sm text-xs font-bold flex items-center gap-1.5 transition-all ${viewCompleted ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'}`}>{viewCompleted ? <Target size={14}/> : <Trophy size={14}/>}{viewCompleted ? '返回目標' : '已完成'}</button>
            </div>
        </div>

        <div className="bg-gray-100 p-1 rounded-xl flex">
            <button onClick={() => setViewType('shared')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewType === 'shared' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><Users size={16}/> 共同</button>
            <button onClick={() => setViewType('personal')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewType === 'personal' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><User size={16}/> 個人</button>
        </div>

        {!viewCompleted && (
            <div className="flex gap-2">
                <button onClick={onOpenRoulette} className="flex-1 bg-white text-purple-600 p-3 rounded-xl shadow-sm border border-purple-100 active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm font-bold"><Dices size={18} /> 命運轉盤</button>
                <button onClick={onAdd} className="flex-1 bg-gray-900 text-white p-3 rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm font-bold"><Plus size={18} /> 新增目標</button>
            </div>
        )}

        <div className="space-y-4">
            {displayJars.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">{viewCompleted ? <Trophy size={48} className="opacity-20" /> : <PiggyBank size={48} className="opacity-20" />}<span className="text-sm">{viewCompleted ? `還沒有${viewType === 'shared' ? '共同' : '個人'}完成的目標，加油！` : `還沒有${viewType === 'shared' ? '共同' : '個人'}存錢計畫，快來建立一個！`}</span></div>
            ) : (
                displayJars.map(jar => {
                    const cur = Number(jar.currentAmount) || 0, tgt = Number(jar.targetAmount) || 1, progress = Math.min((cur / tgt) * 100, 100), isAchieved = cur >= tgt, isPersonal = jar.owner && jar.owner !== 'shared';
                    
                    if (!viewCompleted) {
                        return (
                            <div key={jar.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden group flex flex-col">
                                <div className="flex justify-between items-start mb-4 relative z-10"><div><div className="flex items-center gap-2"><h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">{jar.name}<button onClick={() => onEdit(jar)} className="text-gray-300 hover:text-blue-500"><Pencil size={14}/></button></h3>{isPersonal && (<span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${jar.owner === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{jar.owner === 'bf' ? '👦 男友' : '👧 女友'}</span>)}</div><div className="text-xs text-gray-400 mt-1">目標 {formatMoney(tgt)}</div></div><div className={`font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1 ${isAchieved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{isAchieved ? <CheckCircle size={12}/> : <Target size={12}/>} {Math.round(progress)}%</div></div>
                                <div className="mb-4 relative z-10"><div className="text-3xl font-black text-gray-800 mb-1">{formatMoney(cur)}</div><div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden"><div className={`h-full transition-all duration-1000 ${isAchieved ? 'bg-green-500' : 'bg-gradient-to-r from-yellow-300 to-orange-400'}`} style={{ width: `${progress}%` }}></div></div></div>
                                <div className="flex justify-between items-center relative z-10 mb-4"><div className="flex gap-2">{!isPersonal && (<><div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded-lg text-xs font-bold" title="男友貢獻"><span>👦</span><span>{formatMoney(jar.contributions?.bf || 0)}</span></div><div className="flex items-center gap-1 bg-pink-50 text-pink-600 px-2 py-1 rounded-lg text-xs font-bold" title="女友貢獻"><span>👧</span><span>{formatMoney(jar.contributions?.gf || 0)}</span></div></>)}</div><div className="flex gap-2 ml-auto"><button onClick={() => onHistory(jar)} className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200"><History size={18}/></button><button onClick={() => onDelete(jar.id)} className="p-2 text-gray-300 hover:text-red-400"><Trash2 size={18}/></button><button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-transform">存錢</button></div></div>
                                <button disabled={!isAchieved} onClick={() => onComplete(jar)} className={`w-full mt-auto py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${isAchieved ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-orange-200 active:scale-95 animate-pulse' : 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'}`}>{isAchieved ? <><Trophy size={16}/> 達成目標！點擊完成</> : '尚未達成目標'}</button>
                                <PiggyBank className="absolute -bottom-4 -right-4 text-gray-50 opacity-50 z-0 transform -rotate-12" size={120} />
                            </div>
                        );
                    } else {
                        const date = jar.completedAt ? new Date(jar.completedAt.seconds * 1000).toLocaleDateString() : '未知日期';
                        return (
                            <div key={jar.id} className="bg-yellow-50/50 border border-yellow-100 p-5 rounded-3xl relative overflow-hidden group"><div className="flex justify-between items-start relative z-10"><div><div className="flex items-center gap-2 mb-1"><h3 className="font-bold text-lg text-gray-800">{jar.name}</h3>{isPersonal && (<span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${jar.owner === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{jar.owner === 'bf' ? '👦 男友' : '👧 女友'}</span>)}</div><div className="flex gap-2"><span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">已完成</span><span className="text-xs text-gray-400 flex items-center">達成日期: {date}</span></div></div><Trophy className="text-yellow-400" size={24} /></div><div className="mt-4 flex items-end gap-2"><div className="text-3xl font-black text-gray-800">{formatMoney(jar.currentAmount)}</div><div className="text-xs text-gray-400 mb-1.5 font-bold">/ 目標 {formatMoney(jar.targetAmount)}</div></div><div className="mt-4 pt-3 border-t border-yellow-100 flex justify-between items-center"><div className="flex gap-2">{!isPersonal && (<><div className="flex items-center gap-1 text-xs font-bold text-blue-400"><span>👦</span><span>{formatMoney(jar.contributions?.bf || 0)}</span></div><div className="flex items-center gap-1 text-xs font-bold text-pink-400"><span>👧</span><span>{formatMoney(jar.contributions?.gf || 0)}</span></div></>)}</div><div className="flex gap-2 ml-auto"><button onClick={() => onHistory(jar)} className="p-2 bg-white text-gray-400 rounded-lg hover:text-gray-600 shadow-sm"><History size={16}/></button><button onClick={() => onDelete(jar.id)} className="p-2 bg-white text-gray-300 hover:text-red-400 rounded-lg shadow-sm"><Trash2 size={16}/></button></div></div></div>
                        );
                    }
                })
            )}
        </div>
    </div>
  );
};

const ModalLayout = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-white w-full sm:max-w-md h-auto max-h-[90vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]">
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10"><h2 className="text-base font-bold text-gray-800">{title}</h2><button onClick={onClose} className="bg-gray-50 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
      <div className="flex-1 overflow-y-auto p-3 hide-scrollbar">{children}</div>
    </div>
  </div>
);

const BookManagerModal = ({ onClose, onSave, onDelete, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [isArchived, setIsArchived] = useState(initialData?.status === 'archived');
    return (
        <ModalLayout title={initialData ? "編輯帳本" : "新增帳本"} onClose={onClose}>
            <div className="space-y-4 pt-2">
                <div><label className="block text-xs font-bold text-gray-400 mb-1">帳本名稱</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例如: 日常開銷、日本旅遊" className="w-full bg-gray-50 border-none rounded-xl p-3 text-base font-bold focus:ring-2 focus:ring-blue-100 outline-none" autoFocus/></div>
                {initialData && (<div className="bg-orange-50 p-3 rounded-xl border border-orange-100"><div className="flex items-center justify-between"><span className="text-sm font-bold text-orange-800 flex items-center gap-2"><Archive size={16}/> 封存此帳本?</span><button onClick={() => setIsArchived(!isArchived)} className={`w-12 h-6 rounded-full transition-colors relative ${isArchived ? 'bg-orange-400' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isArchived ? 'left-7' : 'left-1'}`}></div></button></div><p className="text-xs text-orange-600 mt-2">{isArchived ? '此帳本將移至歷史區，主畫面將隱藏。' : '此帳本目前正在使用中。'}</p></div>)}
                <button onClick={() => onSave(name, isArchived ? 'archived' : 'active')} disabled={!name.trim()} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">儲存變更</button>
                {initialData && (<button onClick={() => onDelete(initialData.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100"><Trash2 size={16} /> 永久刪除</button>)}
            </div>
        </ModalLayout>
    );
};

const ReceiptScannerModal = ({ onClose, onConfirm }) => {
    const [step, setStep] = useState('upload'), [image, setImage] = useState(null), [scannedData, setScannedData] = useState(null), [selectedItems, setSelectedItems] = useState({}), [errorMsg, setErrorMsg] = useState(null);
    const handleFile = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onloadend = () => { setImage(reader.result); const match = reader.result.match(/^data:(.*?);base64,(.*)$/); if (match) { processImage(match[2], match[1]); } else { processImage(reader.result.split(',')[1], "image/jpeg"); } }; reader.readAsDataURL(file); };
    const processImage = async (base64, mimeType) => { setStep('analyzing'); setErrorMsg(null); try { const result = await analyzeReceiptImage(base64, mimeType); setScannedData(result); const initialSel = {}; if (result.items) result.items.forEach((_, i) => initialSel[i] = true); setSelectedItems(initialSel); setStep('review'); } catch (e) { console.error(e); setErrorMsg("辨識失敗"); } };
    const toggleItem = (idx) => { setSelectedItems(prev => ({ ...prev, [idx]: !prev[idx] })); };
    const handleConfirm = () => { const itemsToImport = scannedData.items.filter((_, i) => selectedItems[i]); const total = itemsToImport.reduce((acc, curr) => acc + curr.price, 0); const note = itemsToImport.map(i => i.name).join(', ').substring(0, 50); const categories = itemsToImport.map(i => i.category); const modeCategory = categories.sort((a,b) => categories.filter(v=>v===a).length - categories.filter(v=>v===b).length).pop(); onConfirm({ amount: total, note: note || "收據匯入", category: modeCategory || 'other', date: scannedData.date || new Date().toISOString().split('T')[0] }); };
    return (
        <ModalLayout title="AI 智慧收據辨識" onClose={onClose}>
            {step === 'upload' && !errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><label className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"><div className="bg-purple-100 p-4 rounded-full mb-3 text-purple-600"><Camera size={32} /></div><span className="font-bold text-gray-600">拍照或上傳收據</span><input type="file" accept="image/*" className="hidden" onChange={handleFile} /></label></div>)}
            {step === 'analyzing' && !errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><Loader2 size={48} className="animate-spin text-purple-500" /><div className="text-center"><h3 className="font-bold text-gray-800">正在分析收據...</h3></div></div>)}
            {errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><div className="bg-red-100 p-4 rounded-full mb-3 text-red-500"><X size={32} /></div><h3 className="font-bold text-gray-800">糟糕，出錯了</h3><button onClick={() => { setStep('upload'); setErrorMsg(null); }} className="px-6 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold mt-2">重試</button></div>)}
            {step === 'review' && scannedData && !errorMsg && (<div className="space-y-4"><div className="flex justify-between items-center text-sm font-bold text-gray-500 bg-gray-100 p-2 rounded-lg"><span>日期: {scannedData.date}</span><span>總計: {formatMoney(scannedData.total)}</span></div><div className="space-y-2 max-h-[50vh] overflow-y-auto">{scannedData.items.map((item, idx) => (<div key={idx} onClick={() => toggleItem(idx)} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedItems[idx] ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-white opacity-60'}`}><div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedItems[idx] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>{selectedItems[idx] && <Check size={12} className="text-white" />}</div><div><div className="font-bold text-sm text-gray-800">{item.name}</div></div></div><div className="font-bold text-gray-700">{formatMoney(item.price)}</div></div>))}</div><div className="border-t border-gray-100 pt-3"><button onClick={handleConfirm} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg">匯入並前往分帳</button></div></div>)}
        </ModalLayout>
    );
};

const AddTransactionModal = ({ onClose, onSave, currentUserRole, initialData }) => {
  const [amount, setAmount] = useState(initialData?.amount?.toString() || ''), [note, setNote] = useState(initialData?.note || ''), [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]), [category, setCategory] = useState(initialData?.category || 'food'), [paidBy, setPaidBy] = useState(initialData?.paidBy || currentUserRole), [splitType, setSplitType] = useState(initialData?.splitType || 'shared'), [customBf, setCustomBf] = useState(initialData?.splitDetails?.bf || ''), [customGf, setCustomGf] = useState(initialData?.splitDetails?.gf || ''), [ratioValue, setRatioValue] = useState(initialData?.splitType === 'ratio' && initialData.amount ? Math.round((initialData.splitDetails.bf / initialData.amount) * 100) : 50);
  const scrollRef = useRef(null);
  const scroll = (offset) => { if(scrollRef.current) scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' }); };
  useEffect(() => { if (splitType === 'ratio') { const total = Number(safeCalculate(amount)) || 0; const bf = Math.round(total * (ratioValue / 100)), gf = total - bf; setCustomBf(bf.toString()); setCustomGf(gf.toString()); } }, [amount, ratioValue, splitType]);
  const handleCustomChange = (who, val) => { const numVal = Number(val), total = Number(safeCalculate(amount)) || 0; if (who === 'bf') { setCustomBf(val); setCustomGf((total - numVal).toString()); } else { setCustomGf(val); setCustomBf((total - numVal).toString()); } };
  const handleSubmit = (finalAmount) => { if (!finalAmount || finalAmount === '0' || isNaN(Number(finalAmount))) return; const payload = { amount: finalAmount, note, date, category, paidBy, splitType, updatedAt: serverTimestamp() }; if (splitType === 'custom' || splitType === 'ratio') { payload.splitDetails = { bf: Number(customBf) || 0, gf: Number(customGf) || 0 }; } onSave(payload); };
  return (
    <ModalLayout title={initialData ? "編輯紀錄" : "記一筆"} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <div className="bg-gray-50 p-2 rounded-xl text-center border-2 border-transparent focus-within:border-blue-200 transition-colors"><div className="text-3xl font-black text-gray-800 tracking-wider h-9 flex items-center justify-center overflow-hidden">{amount ? amount : <span className="text-gray-300">0</span>}</div></div>
        <div className="flex gap-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 border-none rounded-xl px-2 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none w-[130px] flex-shrink-0 text-center"/><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="備註 (例如: 晚餐)" className="bg-gray-50 border-none rounded-xl p-2 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none flex-1 min-w-0" /></div>
        <div className="relative group"><button onClick={() => scroll(-100)} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 p-1 rounded-full shadow-md text-gray-600 hidden group-hover:block hover:bg-white"><ChevronLeft size={16}/></button><div ref={scrollRef} className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar scroll-smooth">{CATEGORIES.map(c => (<button key={c.id} onClick={() => setCategory(c.id)} className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all border-2 whitespace-nowrap ${category === c.id ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-100 bg-white text-gray-500'}`}>{c.name}</button>))}</div><button onClick={() => scroll(100)} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 p-1 rounded-full shadow-md text-gray-600 hidden group-hover:block hover:bg-white"><ChevronRight size={16}/></button></div>
        <div className="grid grid-cols-2 gap-2 text-sm"><div className="bg-gray-50 p-2 rounded-xl"><div className="text-[10px] text-gray-400 text-center mb-1">誰付的錢?</div><div className="flex bg-white rounded-lg p-1 shadow-sm"><button onClick={() => setPaidBy('bf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${paidBy === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button><button onClick={() => setPaidBy('gf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${paidBy === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button></div></div><div className="bg-gray-50 p-2 rounded-xl"><div className="text-[10px] text-gray-400 text-center mb-1">分帳方式</div><select value={splitType} onChange={e => { setSplitType(e.target.value); if(e.target.value === 'custom') { const half = (Number(safeCalculate(amount)) || 0) / 2; setCustomBf(half.toString()); setCustomGf(half.toString()); } if(e.target.value === 'ratio') { setRatioValue(50); } }} className="w-full bg-white text-xs font-bold py-1.5 rounded-md border-none outline-none text-center"><option value="shared">平分 (50/50)</option><option value="ratio">比例分帳 (滑動)</option><option value="custom">自訂金額</option><option value="bf_personal">男友100%</option><option value="gf_personal">女友100%</option></select></div></div>
        {splitType === 'ratio' && (<div className="bg-purple-50 p-3 rounded-xl border border-purple-100 animate-[fadeIn_0.2s]"><div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1"><span className="text-blue-500">男友 {ratioValue}%</span><span className="text-purple-400">比例分配</span><span className="text-pink-500">女友 {100 - ratioValue}%</span></div><input type="range" min="0" max="100" value={ratioValue} onChange={(e) => setRatioValue(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-2"/><div className="flex justify-between text-xs font-bold"><span className="text-blue-600">{formatMoney(customBf)}</span><span className="text-pink-600">{formatMoney(customGf)}</span></div></div>)}
        {splitType === 'custom' && (<div className="bg-blue-50 p-3 rounded-xl border border-blue-100 animate-[fadeIn_0.2s]"><div className="text-[10px] text-blue-400 font-bold mb-2 text-center">輸入金額 (自動計算剩餘)</div><div className="flex gap-3 items-center"><div className="flex-1"><label className="text-[10px] text-gray-500 block mb-1">男友應付</label><input type="number" value={customBf} onChange={(e) => handleCustomChange('bf', e.target.value)} className="w-full p-2 rounded-lg text-center font-bold text-sm border-none outline-none focus:ring-2 focus:ring-blue-200" placeholder="0" /></div><div className="text-gray-400 font-bold">+</div><div className="flex-1"><label className="text-[10px] text-gray-500 block mb-1">女友應付</label><input type="number" value={customGf} onChange={(e) => handleCustomChange('gf', e.target.value)} className="w-full p-2 rounded-lg text-center font-bold text-sm border-none outline-none focus:ring-2 focus:ring-pink-200" placeholder="0" /></div></div></div>)}
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={handleSubmit} compact={true} />
      </div>
    </ModalLayout>
  );
};

const AddJarModal = ({ onClose, onSave, initialData, role }) => {
  const [name, setName] = useState(initialData?.name || ''), [target, setTarget] = useState(initialData?.targetAmount?.toString() || ''), [type, setType] = useState(initialData?.owner && initialData.owner !== 'shared' ? 'personal' : 'shared');
  return (
    <ModalLayout title={initialData ? "編輯存錢罐" : "新存錢罐"} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-100 p-1 rounded-xl flex mb-2"><button type="button" onClick={() => setType('shared')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${type === 'shared' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><Users size={16}/> 🤝 一起存</button><button type="button" onClick={() => setType('personal')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${type === 'personal' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><User size={16}/> 👤 個人存</button></div>
        <div className="bg-gray-50 p-3 rounded-2xl"><label className="block mb-1 text-xs font-bold text-gray-400">目標金額</label><div className="text-2xl font-black text-gray-800 tracking-wider h-8 flex items-center overflow-hidden">{target ? target : <span className="text-gray-300">0</span>}</div></div>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="名稱 (例如: 旅遊基金)" className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none" />
        <CalculatorKeypad value={target} onChange={setTarget} onConfirm={(val) => { if (name && val) { const owner = type === 'shared' ? 'shared' : role; onSave(name, val, owner); } }} compact={true} />
      </div>
    </ModalLayout>
  );
};

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
  const [amount, setAmount] = useState(''), [depositor, setDepositor] = useState(role);
  if (!jar) return null;
  return (
    <ModalLayout title={`存入: ${jar.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-center"><div className="text-gray-400 text-xs mb-1">目前進度</div><div className="font-bold text-xl text-gray-800">{formatMoney(jar.currentAmount)} <span className="text-gray-300 text-sm">/ {formatMoney(jar.targetAmount)}</span></div></div>
        <div className="bg-gray-50 p-2 rounded-xl"><div className="text-[10px] text-gray-400 text-center mb-1">是誰存的?</div><div className="flex bg-white rounded-lg p-1 shadow-sm"><button onClick={() => setDepositor('bf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${depositor === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button><button onClick={() => setDepositor('gf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${depositor === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button></div></div>
        <div className="bg-gray-50 p-3 rounded-2xl text-center"><div className="text-xs text-gray-400 mb-1">存入金額</div><div className="text-3xl font-black text-gray-800 tracking-wider h-10 flex items-center justify-center text-green-500 overflow-hidden">{amount ? `+${amount}` : <span className="text-gray-300">0</span>}</div></div>
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={(val) => { if(Number(val) > 0) onConfirm(jar.id, val, depositor); }} compact={true} />
      </div>
    </ModalLayout>
  );
};

const JarHistoryModal = ({ jar, onClose, onUpdateItem, onDeleteItem }) => {
  const [editingItem, setEditingItem] = useState(null), [editAmount, setEditAmount] = useState('');
  const history = [...(jar.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <ModalLayout title={`${jar.name} - 存錢紀錄`} onClose={onClose}>
        {editingItem ? (<div className="space-y-4 animate-[fadeIn_0.2s]"><button onClick={() => setEditingItem(null)} className="flex items-center gap-1 text-gray-500 text-xs font-bold mb-2"><ArrowLeft size={14}/> 返回列表</button><div className="bg-gray-50 p-3 rounded-2xl text-center"><div className="text-xs text-gray-400 mb-1">修改金額</div><div className="text-3xl font-black text-gray-800 tracking-wider h-10 flex items-center justify-center overflow-hidden">{editAmount}</div></div><CalculatorKeypad value={editAmount} onChange={setEditAmount} onConfirm={(val) => { if(Number(val) >= 0) { onUpdateItem(jar, editingItem, val); setEditingItem(null); } }} compact={true} /></div>) : (<div className="space-y-2">{history.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">尚無詳細紀錄</div> : history.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${item.role === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{item.role === 'bf' ? '👦' : '👧'}</div><div><div className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString()}</div><div className="font-bold text-gray-800">{formatMoney(item.amount)}</div></div></div><div className="flex gap-2"><button onClick={() => { setEditingItem(item); setEditAmount(item.amount.toString()); }} className="p-2 bg-white rounded-lg shadow-sm text-gray-400 hover:text-blue-500"><Pencil size={16}/></button><button onClick={() => onDeleteItem(jar, item)} className="p-2 bg-white rounded-lg shadow-sm text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></div></div>))}</div>)}
    </ModalLayout>
  );
};

const RouletteModal = ({ jars, onClose, onConfirm, role }) => {
  const activeJars = useMemo(() => jars.filter(j => !j.status || j.status === 'active'), [jars]);
  const [spinning, setSpinning] = useState(false), [result, setResult] = useState(null), [displayNum, setDisplayNum] = useState(1), [selectedJarId, setSelectedJarId] = useState(''), [depositor, setDepositor] = useState(role);
  const intervalRef = useRef(null);
  useEffect(() => { if (activeJars.length > 0 && !selectedJarId) { setSelectedJarId(activeJars[0].id); } }, [activeJars, selectedJarId]);
  const spin = () => { setSpinning(true); setResult(null); intervalRef.current = setInterval(() => { setDisplayNum(Math.floor(Math.random() * 99) + 1); }, 50); setTimeout(() => { if (intervalRef.current) clearInterval(intervalRef.current); const final = Math.floor(Math.random() * 99) + 1; setDisplayNum(final); setResult(final); setSpinning(false); }, 1500); };
  const handleDeposit = () => { if(result && selectedJarId) { let finalAmount = result; if (depositor === 'both') { finalAmount = result * 2; } onConfirm(selectedJarId, finalAmount.toString(), depositor); onClose(); } };
  return (
      <ModalLayout title="🎲 命運轉盤 (1~99元)" onClose={onClose}>
          <div className="flex flex-col items-center gap-6 py-4">
              <div className="relative w-48 h-48 rounded-full border-8 border-purple-100 flex items-center justify-center shadow-inner bg-white"><div className="absolute inset-0 rounded-full border-4 border-dashed border-purple-200 animate-spin-slow" style={{ animationDuration: spinning ? '2s' : '10s' }}></div><div className="text-center z-10"><div className="text-xs font-bold text-gray-400 mb-1">{spinning ? '轉動中...' : (result ? '恭喜選中!' : '試試手氣')}</div><div className={`text-6xl font-black tracking-tight transition-colors ${spinning ? 'text-gray-300 scale-90 blur-[1px]' : 'text-purple-600 scale-100'}`}>{displayNum}</div><div className="text-sm font-bold text-purple-300 mt-1">NT$</div></div></div>
              {!result ? (<button onClick={spin} disabled={spinning} className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-200 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 text-lg flex items-center justify-center gap-2">{spinning ? <Loader2 className="animate-spin" /> : <Dices />}{spinning ? '命運轉動中...' : '開始轉動！'}</button>) : (<div className="w-full space-y-4 animate-[fadeIn_0.3s]"><div className="bg-gray-50 p-4 rounded-2xl space-y-3"><div className="flex justify-between items-center text-sm font-bold text-gray-600 border-b border-gray-200 pb-2"><span>存入金額</span><div className="text-right"><span className="text-purple-600 text-lg block">{formatMoney(depositor === 'both' ? result * 2 : result)}</span>{depositor === 'both' && <span className="text-[10px] text-gray-400 block">({result} x 2人)</span>}</div></div><div><div className="text-[10px] text-gray-400 mb-1">誰要存?</div><div className="flex bg-white rounded-lg p-1 shadow-sm"><button onClick={() => setDepositor('bf')} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${depositor === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button><button onClick={() => setDepositor('gf')} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${depositor === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button><button onClick={() => setDepositor('both')} className={`flex-[1.2] py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 ${depositor === 'both' ? 'bg-purple-100 text-purple-600' : 'text-gray-400'}`}><Users size={12}/> 一起 (+100%)</button></div></div><div><div className="text-[10px] text-gray-400 mb-1">存到哪?</div>{activeJars.length > 0 ? (<select value={selectedJarId} onChange={(e) => setSelectedJarId(e.target.value)} className="w-full bg-white p-3 rounded-lg text-sm font-bold border-none outline-none text-gray-700 shadow-sm">{activeJars.map(j => (<option key={j.id} value={j.id}>{j.name}</option>))}</select>) : (<div className="text-sm text-red-500 font-bold p-2 bg-red-50 rounded-lg text-center">沒有進行中的存錢罐</div>)}</div></div><div className="flex gap-2"><button onClick={spin} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">重轉一次</button><button onClick={handleDeposit} disabled={activeJars.length === 0} className="flex-[2] py-3 bg-gray-900 text-white rounded-xl font-bold text-sm shadow-lg disabled:opacity-50">確認存入</button></div></div>)}
          </div>
      </ModalLayout>
  );
};

const RepaymentModal = ({ debt, onClose, onSave }) => {
    const displayAmount = Math.abs(debt);
    const handleConfirm = () => { onSave({ amount: displayAmount, category: 'repayment', note: '結清欠款', date: new Date().toISOString().split('T')[0], paidBy: debt > 0 ? 'gf' : 'bf', splitType: 'shared' }); onClose(); };
    return (
        <ModalLayout title="結清款項" onClose={onClose}>
            <div className="text-center space-y-4 py-4"><div className="text-gray-500 text-sm">{debt > 0 ? '👧 女朋友' : '👦 男朋友'} 需要支付給<br/><span className="font-bold text-gray-800 text-lg">{debt > 0 ? '男朋友 👦' : '女朋友 👧'}</span></div><div className="text-4xl font-black text-gray-800">{formatMoney(displayAmount)}</div><p className="text-xs text-gray-400">確認對方已收到款項後再點擊結清</p><button onClick={handleConfirm} className="w-full py-3 bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-200 active:scale-95 transition-transform"><CheckCircle className="inline mr-2" size={18}/>確認已還款</button></div>
        </ModalLayout>
    );
};

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

  const [showAddTransaction, setShowAddTransaction] = useState(false), [editingTransaction, setEditingTransaction] = useState(null); 
  const [showAddJar, setShowAddJar] = useState(false), [editingJar, setEditingJar] = useState(null); 
  const [showJarDeposit, setShowJarDeposit] = useState(null), [showJarHistory, setShowJarHistory] = useState(null); 
  const [repaymentDebt, setRepaymentDebt] = useState(null), [showRoulette, setShowRoulette] = useState(false);
  const [showAddGold, setShowAddGold] = useState(false), [editingGold, setEditingGold] = useState(null);
  const [showBookManager, setShowBookManager] = useState(false), [editingBook, setEditingBook] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
    
  const [toast, setToast] = useState(null); 
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  const [goldPrice, setGoldPrice] = useState(0), [goldHistory, setGoldHistory] = useState([]);
  const [goldIntraday, setGoldIntraday] = useState([]), [goldPeriod, setGoldPeriod] = useState('1d'); 
  const [goldLoading, setGoldLoading] = useState(false), [goldError, setGoldError] = useState(null);

  const [dbError, setDbError] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const script = document.createElement('script'); script.src = "https://cdn.tailwindcss.com"; document.head.appendChild(script);
    }
    const timer = setTimeout(() => setLoading(false), 2000);
    
    const initAuth = async () => { 
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                try { 
                    await signInWithCustomToken(auth, __initial_auth_token); 
                    return;
                } catch(e) { console.warn("Custom token failed:", e); }
            }
            await signInAnonymously(auth); 
        } catch (e) {
            console.error("Firebase Auth failed:", e);
            setAuthError("無法匿名登入。請至 Firebase Console 的 Authentication 開啟「匿名登入 (Anonymous)」。");
        }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) setAuthError(null); 
    });
    const savedRole = localStorage.getItem('couple_app_role');
    if (savedRole) setRole(savedRole);
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  const fetchGoldPrice = async () => {
      setGoldLoading(true);
      setGoldError(null);
      try {
          const response = await fetch('/api/gold');
          if (!response.ok) throw new Error(`API連線錯誤 (${response.status})`);
          
          const data = await response.json();
          if (data.success) {
              let price = data.currentPrice;
              if (!price && data.history?.length > 0) price = data.history[data.history.length - 1].price;
              setGoldPrice(price); setGoldHistory(data.history); setGoldIntraday(data.intraday || []);
          } else {
              throw new Error(data.error || '無法讀取資料');
          }
      } catch (err) {
          console.warn("Vercel Gold API failed, attempting direct bypass proxy...", err);
          try {
              const botUrl = encodeURIComponent('https://rate.bot.com.tw/gold?Lang=zh-TW');
              const proxyRes = await fetch(`https://api.allorigins.win/get?url=${botUrl}`);
              const proxyData = await proxyRes.json();
              const gramRowMatch = proxyData.contents.match(/1\s*公克.*?<\/tr>/s);
              if (gramRowMatch) {
                  const prices = gramRowMatch[0].match(/>([0-9,]+)<\/td>/g);
                  if (prices && prices.length >= 2) {
                      const rawPrice = prices[1].replace(/<[^>]+>/g, '').replace(/,/g, '');
                      const fbPrice = parseFloat(rawPrice);
                      setGoldPrice(fbPrice);
                      setGoldHistory([{date: new Date().toISOString().split('T')[0], price: fbPrice, label: '今日'}]);
                      setGoldError("備援模式：使用即時網頁抓取，無歷史線圖");
                      return;
                  }
              }
          } catch (e2) { console.error("Proxy fetch also failed:", e2); }

          setGoldError(`台銀連線失敗: ${err.message}`);
          setGoldPrice(2880); 
          setGoldHistory([{date:'-', price: 2880, label: '-'}]);
      } finally {
          setGoldLoading(false);
      }
  };

  useEffect(() => { if (activeTab === 'gold') fetchGoldPrice(); }, [activeTab]);

  useEffect(() => {
    setDbError(null); 
    
    const handleSnapError = (err) => {
        console.error("Firestore DB Error:", err);
        if (err.code === 'permission-denied') {
            setDbError("資料庫權限被拒絕：請確認是否已開放 Rules (if true)");
        } else {
            setDbError(`連線錯誤: ${err.message}`);
        }
    };

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
        }, handleSnapError);

        const unsubTrans = onSnapshot(transRef, (s) => {
          const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
          data.sort((a, b) => {
            const dateA = new Date(a.date).getTime(), dateB = new Date(b.date).getTime();
            if (dateB !== dateA) return dateB - dateA;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
          setTransactions(data);
        }, handleSnapError);

        const unsubJars = onSnapshot(jarsRef, (s) => setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))), handleSnapError);
        const unsubGold = onSnapshot(goldRef, (s) => setGoldTransactions(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date))), handleSnapError);

        return () => { unsubTrans(); unsubJars(); unsubBooks(); unsubGold(); };
    } catch (e) { console.error(e); }
  }, []);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      const defaultBookId = books[0]?.id;
      return transactions.filter(t => (t.bookId ? t.bookId === activeBookId : activeBookId === defaultBookId));
  }, [transactions, activeBookId, books]);

  const displayBooks = useMemo(() => books.filter(b => (viewArchived ? (b.status || 'active') === 'archived' : (b.status || 'active') === 'active')), [books, viewArchived]);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // --- Handlers ---
  const handleSaveTransaction = async (data) => {
    try {
      const finalAmount = Number(safeCalculate(data.amount));
      const cleanData = { ...data, amount: finalAmount, bookId: activeBookId }; 
      if (editingTransaction) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', editingTransaction.id), { ...cleanData, updatedAt: serverTimestamp() }); showToast('紀錄已更新 ✨'); } 
      else { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), { ...cleanData, createdAt: serverTimestamp() }); showToast('紀錄已新增 🎉'); }
      setShowAddTransaction(false); setEditingTransaction(null); setRepaymentDebt(null); 
    } catch (e) { console.error(e); }
  };

  const handleSaveGold = async (data) => {
      try {
          const payload = { date: data.date, weight: Number(data.weight), totalCost: Number(data.totalCost), owner: data.owner, channel: data.channel, note: data.note, photo: data.photo || null, createdAt: serverTimestamp() };
          if (editingGold) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gold_transactions', editingGold.id), payload); showToast('黃金紀錄已更新 ✨'); } 
          else { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'gold_transactions'), payload); showToast('黃金已入庫 💰'); }
          setShowAddGold(false); setEditingGold(null);
      } catch(e) { console.error(e); }
  };

  const handleDeleteTransaction = (id) => setConfirmModal({ isOpen: true, title: "刪除紀錄", message: "確定要刪除這筆紀錄嗎？", isDanger: true, onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id)); showToast('已刪除 🗑️'); setConfirmModal({ isOpen: false }); } });
  const handleDeleteGold = (id) => setConfirmModal({ isOpen: true, title: "刪除黃金紀錄", message: "確定要刪除這筆紀錄嗎？", isDanger: true, onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gold_transactions', id)); showToast('已刪除 🗑️'); setConfirmModal({ isOpen: false }); } });
  
  const handleSaveJar = async (name, target, owner) => {
    try {
      const finalTarget = Number(safeCalculate(target));
      if (editingJar) {
         const updateData = { name, targetAmount: finalTarget, updatedAt: serverTimestamp() };
         if (owner) updateData.owner = owner; 
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), updateData);
         showToast('存錢罐已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { name, targetAmount: finalTarget, currentAmount: 0, contributions: { bf: 0, gf: 0 }, history: [], owner: owner || 'shared', createdAt: serverTimestamp() });
        showToast('存錢罐已建立 🎯');
      }
      setShowAddJar(false); setEditingJar(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteJar = (id) => setConfirmModal({ isOpen: true, title: "刪除目標", message: "確定要打破這個存錢罐嗎？", isDanger: true, onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', id)); showToast('已刪除 🗑️'); setConfirmModal({ isOpen: false }); } });

  const depositToJar = async (jarId, amount, contributorRole) => {
    const jar = jars.find(j => j.id === jarId); if (!jar) return;
    try {
      const depositAmount = Number(safeCalculate(amount)), newAmount = (jar.currentAmount || 0) + depositAmount, newContrib = { ...jar.contributions };
      if (contributorRole === 'both') { const half = depositAmount / 2; newContrib.bf = (newContrib.bf || 0) + half; newContrib.gf = (newContrib.gf || 0) + half; } 
      else { newContrib[contributorRole] = (newContrib[contributorRole] || 0) + depositAmount; }
      const newHistoryItem = { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), amount: depositAmount, role: contributorRole, date: new Date().toISOString() };
      const newHistory = [newHistoryItem, ...(jar.history || [])];
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jarId), { currentAmount: newAmount, contributions: newContrib, history: newHistory });
      setShowJarDeposit(null); showToast(`已存入 $${depositAmount} 💰`);
    } catch (e) { console.error(e); }
  };

  const handleUpdateJarHistoryItem = async (jar, oldItem, newAmount) => {
    try {
        const diff = Number(newAmount) - oldItem.amount, newTotal = (jar.currentAmount || 0) + diff, newContrib = { ...jar.contributions };
        if (oldItem.role === 'both') { const halfDiff = diff / 2; newContrib.bf = (newContrib.bf || 0) + halfDiff; newContrib.gf = (newContrib.gf || 0) + halfDiff; } 
        else { newContrib[oldItem.role] = (newContrib[oldItem.role] || 0) + diff; }
        const newHistory = (jar.history || []).map(item => item.id === oldItem.id ? { ...item, amount: Number(newAmount) } : item);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { currentAmount: newTotal, contributions: newContrib, history: newHistory }); showToast('紀錄已修正 ✨');
    } catch(e) { console.error(e); }
  };

  const handleDeleteJarHistoryItem = async (jar, item) => setConfirmModal({ isOpen: true, title: "刪除存錢紀錄", message: "確定要刪除這筆存款嗎？", isDanger: true, onConfirm: async () => { try { const newTotal = (jar.currentAmount || 0) - item.amount, newContrib = { ...jar.contributions }; if (item.role === 'both') { const half = item.amount / 2; newContrib.bf = Math.max(0, (newContrib.bf || 0) - half); newContrib.gf = Math.max(0, (newContrib.gf || 0) - half); } else { newContrib[item.role] = Math.max(0, (newContrib[item.role] || 0) - item.amount); } const newHistory = (jar.history || []).filter(h => h.id !== item.id); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { currentAmount: newTotal, contributions: newContrib, history: newHistory }); showToast('紀錄已刪除 🗑️'); setConfirmModal(prev => ({ ...prev, isOpen: false })); } catch(e) { console.error(e); } } });
  
  const handleCompleteJar = async (jar) => setConfirmModal({ isOpen: true, title: "恭喜達成目標！🎉", message: `確定要將「${jar.name}」標記為已完成嗎？這將會把它移至榮譽殿堂。`, isDanger: false, onConfirm: async () => { try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jar.id), { status: 'completed', completedAt: serverTimestamp() }); showToast('目標達成！太棒了 🏆'); setConfirmModal({ isOpen: false }); } catch (e) { console.error(e); } } });

  const handleSaveBook = async (name, status = 'active') => {
      if(!name.trim()) return;
      try {
          if(editingBook) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', editingBook.id), { name, status, updatedAt: serverTimestamp() }); showToast('帳本已更新 ✨'); } 
          else { const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), { name, status, createdAt: serverTimestamp() }); setActiveBookId(docRef.id); showToast('新帳本已建立 📘'); }
          setShowBookManager(false); setEditingBook(null);
      } catch(e) { console.error(e); }
  };

  const handleDeleteBook = async (bookId) => {
      if(books.filter(b => (b.status||'active') === 'active').length <= 1 && editingBook?.status !== 'archived') { showToast('至少需要保留一個使用中的帳本 ⚠️'); return; }
      setConfirmModal({ isOpen: true, title: "刪除帳本", message: "確定要永久刪除這個帳本嗎？裡面的記帳紀錄也會一併刪除！(無法復原)", isDanger: true, onConfirm: async () => { try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', bookId)); const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), where("bookId", "==", bookId)); const snap = await getDocs(q); const batch = writeBatch(db); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); if(activeBookId === bookId) { const remaining = books.filter(b => b.id !== bookId && (b.status||'active') === 'active'); if(remaining.length > 0) setActiveBookId(remaining[0].id); } showToast('帳本已刪除 🗑️'); setConfirmModal(prev => ({ ...prev, isOpen: false })); } catch(e) { console.error(e); } } });
  };

  const handleScanComplete = (scannedItem) => { setEditingTransaction({ amount: scannedItem.amount, note: scannedItem.note, category: scannedItem.category, date: scannedItem.date || new Date().toISOString().split('T')[0], }); setShowScanner(false); setShowAddTransaction(true); };

  if (loading) return <AppLoading />;
  if (!role) return <RoleSelection onSelect={(r) => { setRole(r); localStorage.setItem('couple_app_role', r); }} />;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-24">
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      
      {/* ⚠️ 新增的錯誤橫幅，可以精準找出權限過期問題 */}
      {(authError || dbError) && (
        <div className="bg-red-500 text-white p-3 text-sm font-bold text-center z-50 relative flex items-center justify-center gap-2 shadow-md">
            <AlertCircle size={18} />
            <span>{authError || dbError}</span>
        </div>
      )}

      <div className={`p-4 text-white shadow-lg sticky top-0 z-40 transition-colors ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-md"><Heart className="fill-white animate-pulse" size={18} /></div>
            <h1 className="text-lg font-bold tracking-wide">我們的小金庫</h1>
          </div>
          <div className="flex items-center gap-3">
              {activeTab === 'overview' && (
                  <button onClick={() => setViewArchived(!viewArchived)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${viewArchived ? 'bg-white text-gray-800 border-white' : 'bg-transparent text-white/80 border-white/30'}`}>{viewArchived ? <Archive size={12}/> : <Book size={12}/>}{viewArchived ? '歷史' : '使用中'}</button>
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
                         <button key={book.id} onClick={() => setActiveBookId(book.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeBookId === book.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}><Book size={14} />{book.name}{activeBookId === book.id && (<div onClick={(e) => { e.stopPropagation(); setEditingBook(book); setShowBookManager(true); }} className="ml-1 p-1 rounded-full hover:bg-white/20"><Settings size={12} /></div>)}</button>
                     ))}
                     {!viewArchived && (<button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2 bg-white text-gray-400 rounded-xl shadow-sm hover:bg-gray-50"><Plus size={18} /></button>)}
                     {displayBooks.length === 0 && <div className="text-gray-400 text-sm italic py-2">沒有{viewArchived ? '封存' : '使用中'}的帳本</div>}
                 </div>
             </div>
        )}
        
        {activeTab === 'overview' && (<Overview transactions={filteredTransactions} role={role} readOnly={viewArchived} onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} onScan={() => setShowScanner(true)} onEdit={(t) => { if(viewArchived) return; setEditingTransaction(t); setShowAddTransaction(true); }} onDelete={(id) => { if(viewArchived) return; handleDeleteTransaction(id); }} onRepay={(debt) => setRepaymentDebt(debt)} />)}
        {activeTab === 'stats' && (<div><div className="bg-white px-4 py-2 rounded-xl shadow-sm mb-4 inline-flex items-center gap-2 text-sm font-bold text-gray-600"><Book size={14}/> 統計範圍: {books.find(b => b.id === activeBookId)?.name || '未知帳本'}</div><Statistics transactions={filteredTransactions} /></div>)}
        {activeTab === 'savings' && (<Savings jars={jars} role={role} onAdd={() => { setEditingJar(null); setShowAddJar(true); }} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onDelete={handleDeleteJar} onHistory={(j) => setShowJarHistory(j)} onOpenRoulette={() => setShowRoulette(true)} onComplete={handleCompleteJar} />)}
        {activeTab === 'gold' && (<GoldView transactions={goldTransactions} goldPrice={goldPrice} history={goldHistory} period={goldPeriod} setPeriod={setGoldPeriod} role={role} onAdd={() => { setEditingGold(null); setShowAddGold(true); }} onEdit={(t) => { setEditingGold(t); setShowAddGold(true); }} onDelete={handleDeleteGold} loading={goldLoading} error={goldError} onRefresh={fetchGoldPrice} intraday={goldIntraday} />)}
        {activeTab === 'settings' && <SettingsView role={role} onLogout={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} diagnostics={{ user, dbError, authError, appId, booksCount: books.length, transCount: transactions.length }} />}
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
      {repaymentDebt !== null && (<RepaymentModal debt={repaymentDebt} onClose={() => setRepaymentDebt(null)} onSave={handleSaveTransaction} />)}
      {showBookManager && (<BookManagerModal onClose={() => setShowBookManager(false)} onSave={handleSaveBook} onDelete={handleDeleteBook} initialData={editingBook} />)}
    </div>
  );
}
