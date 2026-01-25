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

// --- 安全初始化 Firebase 配置 ---
const getFirebaseConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined') {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.error("Firebase config parse error", e);
  }
  return {};
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const apiKey = ""; 

// --- 常數定義 ---
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
    const fn = new Function('return ' + sanitized);
    const result = fn();
    return isNaN(result) || !isFinite(result) ? '0' : Math.floor(result).toString();
  } catch (e) {
    return '0';
  }
};

// --- API 輔助函式 ---
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
      if (!response.ok) throw new Error('AI API Error');
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

// --- 子元件定義 ---

const AppLoading = () => (
  <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 text-center">
    <div className="bg-pink-50 p-6 rounded-full mb-4 animate-bounce">
       <Heart className="text-pink-500 fill-pink-500" size={48} />
    </div>
    <h2 className="text-xl font-bold text-gray-800">開啟甜蜜小金庫...</h2>
    <p className="text-gray-400 mt-2 text-sm italic">如果畫面一直沒動，請重新整理頁面</p>
  </div>
);

const NavBtn = ({ icon: Icon, label, active, onClick, role }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-full ${active ? (role === 'bf' ? 'text-blue-600' : 'text-pink-600') : 'text-gray-400'}`}>
    <Icon size={24} />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const CalculatorKeypad = ({ value, onChange, onConfirm, compact = false }) => {
  const handlePress = (key) => {
    const strVal = (value || '').toString();
    if (key === 'C') onChange('');
    else if (key === '=') onChange(safeCalculate(strVal));
    else if (key === 'backspace') onChange(strVal.length > 0 ? strVal.slice(0, -1) : '');
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
              ${compact ? 'h-10 text-base' : 'h-12 text-lg'} rounded-xl font-bold shadow-sm active:scale-95 transition-transform flex items-center justify-center
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
           <ArrowLeft size={20} />
         </button>
         <button type="button" onClick={(e) => { e.stopPropagation(); const result = safeCalculate(value); onChange(result); if(onConfirm) onConfirm(result); }} className={`${compact ? 'h-10' : 'h-12'} flex-[2] bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md`}>
            <Check size={20} /> <span>完成</span>
         </button>
      </div>
    </div>
  );
};

const RoleSelection = ({ onSelect }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
      <Heart className="mx-auto text-pink-500 mb-4" size={48} />
      <h1 className="text-2xl font-bold mb-6 text-gray-800">歡迎使用小金庫</h1>
      <p className="text-gray-400 text-sm mb-8">請選擇您在本帳本中的身份</p>
      <div className="space-y-4">
        <button onClick={() => onSelect('bf')} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all">我是男朋友 👦</button>
        <button onClick={() => onSelect('gf')} className="w-full py-4 bg-pink-500 text-white rounded-2xl font-bold shadow-lg shadow-pink-200 active:scale-95 transition-all">我是女朋友 👧</button>
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
        else if (t.splitDetails) { bfS = Number(t.splitDetails.bf) || 0; gfS = Number(t.splitDetails.gf) || 0; }
        if (t.paidBy === 'bf') bfLent += gfS; else bfLent -= bfS;
      }
    });
    return bfLent;
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">目前結算清單</h2>
        <div className="flex items-center justify-center gap-2">
          {Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500 flex items-center gap-2"><CheckCircle size={24}/> 平帳</div> : <><span className={`text-2xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男友' : '女友'}</span><span className="text-gray-400 text-xs">先墊了</span><span className="text-2xl font-bold text-gray-800">{formatMoney(Math.abs(debt))}</span></>}
        </div>
      </div>
      <div className="flex justify-between items-center px-1"><h3 className="font-bold text-lg text-gray-700">最近帳目</h3><button onClick={onAdd} className="bg-gray-900 text-white p-3 rounded-2xl shadow-lg active:scale-95 transition-all"><Plus size={20}/></button></div>
      <div className="space-y-3">
        {transactions.map(t => (
          <div key={t.id} onClick={() => onEdit(t)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between active:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-50 text-xl border border-gray-100 shadow-sm">{CATEGORIES.find(c => c.id === t.category)?.icon || '🏷️'}</div>
               <div><div className="font-bold text-gray-800">{t.note || '未命名項目'}</div><div className="text-[10px] text-gray-400 font-medium">{t.date} • <span className={t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}>{t.paidBy === 'bf' ? '男友付' : '女友付'}</span></div></div>
            </div>
            <div className="flex items-center gap-3">
               <span className="font-black text-gray-800">{formatMoney(t.amount)}</span>
               <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-200 hover:text-red-400 p-1"><Trash2 size={16}/></button>
            </div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200 text-gray-300 text-sm">此帳本尚無紀錄，開始第一筆記帳吧！</div>}
      </div>
    </div>
  );
};

const BookManagerModal = ({ initialData, onClose, onSave, onArchive }) => {
  const [name, setName] = useState(initialData?.name || '');
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-xl">{initialData ? '帳本設定' : '新增帳本'}</h2><button onClick={onClose} className="p-2"><X/></button></div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="帳本名稱 (例如：日本旅遊)" className="w-full bg-gray-100 p-4 rounded-2xl font-bold border-none outline-none mb-4 focus:ring-2 focus:ring-gray-200" autoFocus />
        <div className="grid grid-cols-1 gap-3">
           <button onClick={() => onSave(name)} disabled={!name} className="py-4 bg-gray-900 text-white rounded-2xl font-bold shadow-lg disabled:opacity-50">儲存帳本</button>
           {initialData && (
             <button onClick={() => onArchive(initialData.id)} className="py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold flex items-center justify-center gap-2">
                <Archive size={18}/> {initialData.status === 'archived' ? '恢復為現役帳本' : '封存帳本'}
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
          1. 辨識每個品項。
          2. 將品項名稱翻譯成台灣繁體中文。
          3. 提取金額、總金額、日期。
          4. 判斷品項類別 (food, transport, shopping, travel, entertainment, house, other)。
          請務必以 JSON 格式輸出。`;
        
        const res = await callGeminiAI(prompt, base64);
        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleanJson = text.replace(/```json|```/g, '').trim();
          onExtracted(JSON.parse(cleanJson));
        }
      };
    } catch (e) { 
      console.error(e); 
      alert("AI 辨識失敗，請重試");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-blue-50 rounded-3xl border-2 border-dashed border-blue-200 min-h-[250px]">
      {loading ? (
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <p className="font-bold text-blue-600">AI 正在努力翻譯並分析中...</p>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <Camera size={48} className="mx-auto text-blue-400 mb-2" />
          <div>
            <h3 className="font-bold text-lg text-gray-800">AI 智慧辨識</h3>
            <p className="text-sm text-gray-500 px-4">拍下或上傳收據照片，我們幫您自動翻譯品項並計算總帳</p>
          </div>
          <div className="flex gap-2 justify-center pt-2">
            <button onClick={() => onCancel()} className="px-6 py-3 bg-white text-gray-500 rounded-2xl font-bold border border-gray-100">取消</button>
            <button onClick={() => fileInputRef.current.click()} className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200">上傳照片</button>
          </div>
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
    setNote(data.items[0]?.translated_name || 'AI 自動辨識帳目');
    if (data.date) setDate(data.date);
    setScannerMode(false);
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
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl my-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-bold text-xl">{initialData ? '編輯明細' : (scannerMode ? 'AI 掃描' : '記帳')}</h2>
          <button onClick={onClose} className="p-2"><X/></button>
        </div>

        {scannerMode ? (
          <AIScanner onExtracted={handleAISuccess} onCancel={() => setScannerMode(false)} />
        ) : (
          <div className="space-y-4">
            {!initialData && !extractedItems && (
              <button onClick={() => setScannerMode(true)} className="w-full p-4 bg-blue-50 text-blue-600 rounded-2xl font-bold flex items-center justify-center gap-2 border border-blue-100 shadow-sm active:scale-95 transition-all">
                <Camera size={20} /> 使用 AI 自動辨識翻譯
              </button>
            )}

            {extractedItems ? (
              <div className="space-y-3 bg-gray-50 p-4 rounded-3xl border border-gray-100 max-h-[300px] overflow-y-auto hide-scrollbar">
                <div className="flex items-center gap-2 text-blue-600 mb-2"><Languages size={18}/> <span className="text-sm font-bold">品項細節辨識</span></div>
                {extractedItems.map((item, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-2xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-bold text-gray-700">{item.translated_name}</div>
                      <div className="font-bold text-gray-900">{formatMoney(item.price)}</div>
                    </div>
                    <div className="flex gap-1">
                       {['shared', 'bf', 'gf'].map(t => (
                         <button key={t} onClick={() => {
                           const updated = [...extractedItems];
                           updated[idx].split = t;
                           setExtractedItems(updated);
                         }} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${item.split === t ? 'bg-gray-800 text-white shadow-md' : 'bg-gray-100 text-gray-400'}`}>
                           {t === 'shared' ? '平分' : (t === 'bf' ? '男友' : '女友')}
                         </button>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 p-6 rounded-3xl text-center border border-gray-100">
                <div className="text-4xl font-black text-gray-800 tracking-tight">{amount || '0'}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">金額</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 p-3.5 rounded-2xl font-bold outline-none border border-gray-100" />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="備註(例如: 晚餐)" className="bg-gray-50 p-3.5 rounded-2xl font-bold outline-none border border-gray-100" />
            </div>

            <div className="flex overflow-x-auto gap-2 py-1 hide-scrollbar">
               {CATEGORIES.map(c => (
                 <button key={c.id} onClick={() => setCategory(c.id)} className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${category === c.id ? 'border-gray-800 bg-gray-800 text-white shadow-md' : 'border-gray-100 bg-white text-gray-400'}`}>{c.name}</button>
               ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="p-3 bg-gray-50 rounded-2xl text-center border border-gray-100">
                 <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase">付錢的人</div>
                 <div className="flex gap-1 p-1 bg-white rounded-xl shadow-inner">
                   <button onClick={() => setPaidBy('bf')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${paidBy === 'bf' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-400'}`}>男友</button>
                   <button onClick={() => setPaidBy('gf')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${paidBy === 'gf' ? 'bg-pink-500 text-white shadow-sm' : 'text-gray-400'}`}>女友</button>
                 </div>
               </div>
               {!extractedItems && (
                 <div className="p-3 bg-gray-50 rounded-2xl text-center border border-gray-100">
                  <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase">拆帳方式</div>
                  <select value={splitType} onChange={e => setSplitType(e.target.value)} className="w-full text-xs font-bold p-1 bg-transparent border-none outline-none text-center cursor-pointer">
                    <option value="shared">兩個人平分</option>
                    <option value="bf_personal">男友全付</option>
                    <option value="gf_personal">女友全付</option>
                  </select>
                </div>
               )}
            </div>

            {!extractedItems && <CalculatorKeypad value={amount} onChange={setAmount} compact={true} onConfirm={saveFinal} />}
            
            <button onClick={saveFinal} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
               <Save size={20} /> 儲存帳目
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
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><ChevronLeft /></button>
        <span className="font-bold text-lg text-gray-700">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
        <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><ChevronRight /></button>
      </div>
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
         <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">本月支出</div>
         <div className="text-4xl font-black text-gray-800">{formatMoney(total)}</div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
         {monthTransactions.map(t => (
           <div key={t.id} className="p-4 flex justify-between items-center active:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                 <div className="text-xl w-10 h-10 flex items-center justify-center bg-gray-50 rounded-full border border-gray-100">{CATEGORIES.find(c => c.id === t.category)?.icon || '🏷️'}</div>
                 <div><div className="text-sm font-bold text-gray-700">{t.note || '支出項目'}</div><div className="text-[10px] text-gray-400">{t.date}</div></div>
              </div>
              <div className="font-bold text-gray-700">{formatMoney(t.amount)}</div>
           </div>
         ))}
         {monthTransactions.length === 0 && <div className="p-12 text-center text-gray-300 text-sm">本月尚無消費數據</div>}
      </div>
    </div>
  );
};

const Savings = ({ jars, role, onAdd, onEdit, onDeposit, onDelete, onHistory }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center px-1"><h2 className="font-bold text-xl text-gray-700">存錢目標</h2><button onClick={onAdd} className="bg-gray-900 text-white py-2 px-5 rounded-2xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Plus size={18}/> 新目標</button></div>
    <div className="grid gap-4">
      {jars.map(jar => {
        const cur = Number(jar.currentAmount) || 0; const tgt = Number(jar.targetAmount) || 1; const progress = Math.min((cur / tgt) * 100, 100);
        return (
          <div key={jar.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10"><div><h3 className="font-bold text-lg text-gray-800">{jar.name}<button onClick={() => onEdit(jar)} className="ml-2 text-gray-200 hover:text-blue-500"><Pencil size={12}/></button></h3><div className="text-xs text-gray-400 font-medium">目標：{formatMoney(tgt)}</div></div><div className="bg-yellow-50 text-yellow-600 font-bold px-3 py-1 rounded-full text-[10px] border border-yellow-100">{Math.round(progress)}%</div></div>
            <div className="mb-5 relative z-10"><div className="text-3xl font-black text-gray-800 mb-2">{formatMoney(cur)}</div><div className="w-full bg-gray-50 h-3 rounded-full overflow-hidden border border-gray-100"><div className="h-full bg-gradient-to-r from-yellow-300 to-yellow-500 transition-all duration-1000 shadow-sm" style={{ width: `${progress}%` }}></div></div></div>
            <div className="flex justify-between items-center relative z-10">
                <div className="flex -space-x-2"><div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] text-blue-600 font-bold">👦</div><div className="w-8 h-8 rounded-full bg-pink-100 border-2 border-white flex items-center justify-center text-[10px] text-pink-600 font-bold">👧</div></div>
                <div className="flex gap-2">
                    <button onClick={() => onHistory(jar)} className="p-2.5 bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-100 transition-colors"><History size={16}/></button>
                    <button onClick={() => onDelete(jar.id)} className="p-2.5 bg-gray-50 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
                    <button onClick={() => onDeposit(jar.id)} className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all">存錢</button>
                </div>
            </div>
            <PiggyBank className="absolute -bottom-6 -right-6 text-pink-50 opacity-50 z-0 rotate-12" size={150} />
          </div>
        );
      })}
      {jars.length === 0 && <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 text-gray-300 text-sm">還沒有存錢計畫，快來一起存錢！</div>}
    </div>
  </div>
);

// --- 主應用元件 ---
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

  // 1. 驗證與身份初始化
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { 
        console.error("驗證失敗:", e);
        setLoading(false);
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

  // 2. 資料讀取監聽
  useEffect(() => {
    if (!user) return;
    const transRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const jarsRef = collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars');
    const booksRef = collection(db, 'artifacts', appId, 'public', 'data', 'books');
    
    const unsubBooks = onSnapshot(booksRef, (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        
        if (data.length === 0 && !s.metadata.hasPendingWrites) {
           addDoc(booksRef, { name: "我們的第一本帳本", status: 'active', createdAt: serverTimestamp() });
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
    });

    const unsubTrans = onSnapshot(transRef, (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(data);
    });

    const unsubJars = onSnapshot(jarsRef, (s) => {
      setJars(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    });
    
    return () => { unsubTrans(); unsubJars(); unsubBooks(); };
  }, [user]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // 過濾邏輯
  const displayedBooks = useMemo(() => {
      return books.filter(b => showArchived ? b.status === 'archived' : b.status === 'active');
  }, [books, showArchived]);

  const filteredTransactions = useMemo(() => {
      if (!activeBookId) return [];
      return transactions.filter(t => t.bookId === activeBookId || (!t.bookId && activeBookId === books[0]?.id));
  }, [transactions, activeBookId, books]);

  // 動作處理
  const handleSaveTransaction = async (data) => {
    if (!user) return;
    try {
      const finalAmount = Number(safeCalculate(data.amount));
      const cleanData = { ...data, amount: finalAmount, bookId: activeBookId };
      if (editingTransaction) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', editingTransaction.id), { ...cleanData, updatedAt: serverTimestamp() });
        showToast('帳目已更新 ✨');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), { ...cleanData, createdAt: serverTimestamp() });
        showToast('記帳成功 🎉');
      }
      setShowAddTransaction(false);
      setEditingTransaction(null);
    } catch (e) { console.error(e); }
  };

  const depositToJar = async (jarId, amount, contributorRole) => {
    const jar = jars.find(j => j.id === jarId);
    if (!jar) return;
    try {
      const depositAmount = Number(safeCalculate(amount));
      const newAmount = (jar.currentAmount || 0) + depositAmount;
      const newContrib = { ...jar.contributions, [contributorRole]: (jar.contributions?.[contributorRole] || 0) + depositAmount };
      const newHistoryItem = { id: Date.now().toString(), amount: depositAmount, role: contributorRole, date: new Date().toISOString() };
      const newHistory = [newHistoryItem, ...(jar.history || [])];

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', jarId), { 
          currentAmount: newAmount, contributions: newContrib, history: newHistory
      });
      setShowJarDeposit(null);
      showToast(`存入 $${depositAmount}，離目標更近了！💰`);
    } catch (e) { console.error(e); }
  };

  if (loading) return <AppLoading />;
  if (!role) return <RoleSelection onSelect={(r) => { setRole(r); localStorage.setItem('couple_app_role', r); }} />;

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-gray-800 pb-28">
      {/* 頂部標題 */}
      <div className={`p-4 text-white shadow-md sticky top-0 z-40 transition-all ${role === 'bf' ? 'bg-blue-600' : 'bg-pink-500'}`}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Heart className="fill-white animate-pulse" size={20} />
            <h1 className="text-lg font-bold tracking-tight">甜蜜小金庫 AI</h1>
          </div>
          <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-1.5 text-[10px] font-bold bg-black/10 px-4 py-1.5 rounded-full active:scale-95 transition-all">
             {showArchived ? <Eye size={12} /> : <Archive size={12} />}
             {showArchived ? '回現役帳本' : '歷史帳本'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* 帳本切換 */}
        {activeTab === 'overview' && (
          <div className="mb-6 flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
            {displayedBooks.map(book => (
              <button 
                key={book.id} 
                onClick={() => setActiveBookId(book.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-all shadow-sm border ${activeBookId === book.id ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-100'}`}
              >
                <Book size={14} />
                {book.name}
                <div onClick={(e) => { e.stopPropagation(); setEditingBook(book); setShowBookManager(true); }} className="ml-1 p-1 rounded-full hover:bg-white/20">
                  <Settings size={12} />
                </div>
              </button>
            ))}
            {!showArchived && <button onClick={() => { setEditingBook(null); setShowBookManager(true); }} className="px-3 py-2.5 bg-white text-gray-300 rounded-2xl shadow-sm border border-gray-100 active:bg-gray-50"><Plus size={18} /></button>}
          </div>
        )}

        {/* 內容分頁 */}
        {activeTab === 'overview' && <Overview transactions={filteredTransactions} onAdd={() => { setEditingTransaction(null); setShowAddTransaction(true); }} onEdit={(t) => { setEditingTransaction(t); setShowAddTransaction(true); }} onDelete={(id) => setConfirmModal({ isOpen: true, title: "刪除帳目", message: "確定要刪除這筆紀錄嗎？", isDanger: true, onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id)); showToast('已刪除紀錄'); setConfirmModal({isOpen:false}); } })} />}
        {activeTab === 'stats' && <Statistics transactions={filteredTransactions} />}
        {activeTab === 'savings' && <Savings jars={jars} role={role} onAdd={() => { setEditingJar(null); setShowAddJar(true); }} onEdit={(j) => { setEditingJar(j); setShowAddJar(true); }} onDeposit={(id) => setShowJarDeposit(id)} onDelete={(id) => setConfirmModal({isOpen:true, title:"打破金庫?", message:"確定要刪除這個存錢計畫嗎？", isDanger:true, onConfirm:async()=>{await deleteDoc(doc(db,'artifacts',appId,'public','data','savings_jars',id)); setConfirmModal({isOpen:false});}})} onHistory={(j) => setShowJarHistory(j)} />}
        {activeTab === 'settings' && <div className="space-y-6"><div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center"><div className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-4 border-4 border-white shadow-lg ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div><h2 className="font-bold text-2xl text-gray-800">{role === 'bf' ? '親愛的男友' : '親愛的女友'}</h2><p className="text-gray-400 text-sm mt-1">今天也辛苦囉！記得記帳喔 💕</p></div><button onClick={() => { localStorage.removeItem('couple_app_role'); window.location.reload(); }} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"><LogOut size={18} /> 登出身分</button></div>}
      </div>

      {/* 底部導航 */}
      <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-100 z-50">
        <div className="flex justify-around py-4 max-w-2xl mx-auto">
          <NavBtn icon={Wallet} label="總覽" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} role={role} />
          <NavBtn icon={PieChartIcon} label="統計" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} role={role} />
          <NavBtn icon={PiggyBank} label="存錢" active={activeTab === 'savings'} onClick={() => setActiveTab('savings')} role={role} />
          <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} role={role} />
        </div>
      </div>

      {/* 互動彈窗 */}
      {toast && <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white px-8 py-3 rounded-full shadow-2xl z-[100] animate-bounce text-sm font-bold">{toast}</div>}
      {showBookManager && <BookManagerModal initialData={editingBook} onClose={() => setShowBookManager(false)} onSave={async (name) => { if (editingBook) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', editingBook.id), { name }); else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), { name, status: 'active', createdAt: serverTimestamp() }); setShowBookManager(false); }} onArchive={(id) => { const newStatus = editingBook.status === 'active' ? 'archived' : 'active'; updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', id), { status: newStatus }); setShowBookManager(false); showToast(newStatus === 'archived' ? '已封存' : '已還原'); }} />}
      {showAddTransaction && <AddTransactionModal onClose={() => setShowAddTransaction(false)} onSave={handleSaveTransaction} role={role} initialData={editingTransaction} />}
      {showAddJar && <AddJarModal onClose={() => setShowAddJar(false)} onSave={async (name, target) => { const finalTarget = Number(safeCalculate(target)); if (editingJar) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'savings_jars', editingJar.id), { name, targetAmount: finalTarget }); else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'savings_jars'), { name, targetAmount: finalTarget, currentAmount: 0, contributions: { bf: 0, gf: 0 }, history: [], createdAt: serverTimestamp() }); setShowAddJar(false); }} initialData={editingJar} />}
      {showJarDeposit && <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-xl">存錢入庫</h2><button onClick={()=>setShowJarDeposit(null)}><X/></button></div>
          <CalculatorKeypad compact={true} onConfirm={(val)=>depositToJar(showJarDeposit, val, role)} />
        </div>
      </div>}
      {showJarHistory && <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[70vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-xl">存款紀錄：{showJarHistory.name}</h2><button onClick={()=>setShowJarHistory(null)}><X/></button></div>
          <div className="space-y-3">
             {(showJarHistory.history || []).map(item => (
               <div key={item.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-4">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 border-white shadow-sm ${item.role === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{item.role === 'bf' ? '👦' : '👧'}</div>
                     <div><div className="text-[10px] text-gray-400">{item.date?.split('T')[0]}</div><div className="font-bold text-gray-700">{formatMoney(item.amount)}</div></div>
                  </div>
               </div>
             ))}
             {(!showJarHistory.history || showJarHistory.history.length === 0) && <div className="text-center py-10 text-gray-300 italic">尚無存款紀錄</div>}
          </div>
        </div>
      </div>}
      {confirmModal.isOpen && <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"><div className="bg-white p-8 rounded-3xl w-full max-w-xs text-center shadow-2xl animate-[fadeIn_0.2s]"><h3 className="font-bold text-xl text-gray-800 mb-2">{confirmModal.title}</h3><p className="text-gray-400 text-sm mb-8 leading-relaxed">{confirmModal.message}</p><div className="flex gap-3"><button onClick={() => setConfirmModal({isOpen:false})} className="flex-1 py-3.5 bg-gray-50 text-gray-500 rounded-2xl font-bold active:bg-gray-100">取消</button><button onClick={confirmModal.onConfirm} className={`flex-1 py-3.5 text-white rounded-2xl font-bold shadow-lg ${confirmModal.isDanger ? 'bg-red-500 shadow-red-100' : 'bg-blue-500 shadow-blue-100'}`}>確定</button></div></div></div>}
    </div>
  );
}

// 樣式注入
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}
