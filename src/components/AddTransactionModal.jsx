import { useState, useRef } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { formatMoney, safeCalculate } from '../lib/format.js';
import { CATEGORIES } from '../lib/constants.js';
import ModalLayout from './ModalLayout.jsx';
import CalculatorKeypad from './CalculatorKeypad.jsx';

const AddTransactionModal = ({ onClose, onSave, currentUserRole, initialData, quickPicks = [] }) => {
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [note, setNote] = useState(initialData?.note || '');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(initialData?.category || 'food');
  const [paidBy, setPaidBy] = useState(initialData?.paidBy || currentUserRole);
  const [splitType, setSplitType] = useState(initialData?.splitType || 'shared');
  const [customBf, setCustomBf] = useState(initialData?.splitDetails?.bf || '');
  const [customGf, setCustomGf] = useState(initialData?.splitDetails?.gf || '');
  const [ratioValue, setRatioValue] = useState(initialData?.splitType === 'ratio' && initialData.amount ? Math.round((initialData.splitDetails.bf / initialData.amount) * 100) : 50);
  const scrollRef = useRef(null);
  const scroll = (offset) => { if(scrollRef.current) scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' }); };
  // 比例分帳的金額直接由總額與比例算出來，不用 effect 同步回 state（省一次多餘的 render）
  const ratioTotal = splitType === 'ratio' ? Number(safeCalculate(amount)) || 0 : 0;
  const ratioBf = Math.round(ratioTotal * (ratioValue / 100));
  const splitBf = splitType === 'ratio' ? ratioBf.toString() : customBf;
  const splitGf = splitType === 'ratio' ? (ratioTotal - ratioBf).toString() : customGf;
  // 常用項目只帶入欄位、不直接存檔：還是要按 ✓，順便可以改金額或日期
  const applyQuickPick = (p) => { setAmount(String(p.amount)); setNote(p.note); setCategory(p.category); setSplitType(p.splitType); setPaidBy(currentUserRole); };
  const showQuickPicks = !initialData && quickPicks.length > 0;
  const handleCustomChange = (who, val) => { const numVal = Number(val); const total = Number(safeCalculate(amount)) || 0; if (who === 'bf') { setCustomBf(val); setCustomGf((total - numVal).toString()); } else { setCustomGf(val); setCustomBf((total - numVal).toString()); } };
  const handleSubmit = (finalAmount) => { if (!finalAmount || finalAmount === '0' || isNaN(Number(finalAmount))) return; const payload = { amount: finalAmount, note, date, category, paidBy, splitType, updatedAt: serverTimestamp() }; if (splitType === 'custom' || splitType === 'ratio') { payload.splitDetails = { bf: Number(splitBf) || 0, gf: Number(splitGf) || 0 }; } onSave(payload); };
  return (
    <ModalLayout title={initialData?.id ? "編輯紀錄" : "記一筆"} onClose={onClose}>
      <div className="space-y-3 pb-2">
        {showQuickPicks && (<div className="flex items-center gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1"><span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-gray-400"><Zap size={12} />常用</span>{quickPicks.map((p) => (<button key={`${p.note}|${p.category}|${p.amount}|${p.splitType}`} type="button" onClick={() => applyQuickPick(p)} className="shrink-0 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-600 whitespace-nowrap active:scale-95 transition-transform">{p.note} <span className="text-gray-400">{formatMoney(p.amount)}</span></button>))}</div>)}
        <div className="bg-gray-50 p-2 rounded-xl text-center border-2 border-transparent focus-within:border-blue-200 transition-colors"><div className="text-3xl font-black text-gray-800 tracking-wider h-9 flex items-center justify-center overflow-hidden">{amount ? amount : <span className="text-gray-300">0</span>}</div></div>
        <div className="flex gap-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 border-none rounded-xl px-2 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-hidden w-[130px] shrink-0 text-center"/><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="備註 (例如: 晚餐)" className="bg-gray-50 border-none rounded-xl p-2 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-hidden flex-1 min-w-0" /></div>
        <div className="relative group"><button onClick={() => scroll(-100)} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-surface/80 p-1 rounded-full shadow-md text-gray-600 hidden group-hover:block hover:bg-surface"><ChevronLeft size={16}/></button><div ref={scrollRef} className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar scroll-smooth">{CATEGORIES.map(c => (<button key={c.id} onClick={() => setCategory(c.id)} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all border-2 whitespace-nowrap ${category === c.id ? 'border-gray-800 bg-gray-800 text-surface' : 'border-gray-100 bg-surface text-gray-500'}`}>{c.name}</button>))}</div><button onClick={() => scroll(100)} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-surface/80 p-1 rounded-full shadow-md text-gray-600 hidden group-hover:block hover:bg-surface"><ChevronRight size={16}/></button></div>
        <div className="grid grid-cols-2 gap-2 text-sm"><div className="bg-gray-50 p-2 rounded-xl"><div className="text-[10px] text-gray-400 text-center mb-1">誰付的錢?</div><div className="flex bg-surface rounded-lg p-1 shadow-xs"><button onClick={() => setPaidBy('bf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${paidBy === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button><button onClick={() => setPaidBy('gf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${paidBy === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button></div></div><div className="bg-gray-50 p-2 rounded-xl"><div className="text-[10px] text-gray-400 text-center mb-1">分帳方式</div><select value={splitType} onChange={e => { setSplitType(e.target.value); if(e.target.value === 'custom') { const half = (Number(safeCalculate(amount)) || 0) / 2; setCustomBf(half.toString()); setCustomGf(half.toString()); } if(e.target.value === 'ratio') { setRatioValue(50); } }} className="w-full bg-surface text-xs font-bold py-1.5 rounded-md border-none outline-hidden text-center"><option value="shared">平分 (50/50)</option><option value="ratio">比例分帳 (滑動)</option><option value="custom">自訂金額</option><option value="bf_personal">男友100%</option><option value="gf_personal">女友100%</option></select></div></div>
        {splitType === 'ratio' && (<div className="bg-purple-50 p-3 rounded-xl border border-purple-100 animate-[fadeIn_0.2s]"><div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1"><span className="text-blue-500">男友 {ratioValue}%</span><span className="text-purple-400">比例分配</span><span className="text-pink-500">女友 {100 - ratioValue}%</span></div><input type="range" min="0" max="100" value={ratioValue} onChange={(e) => setRatioValue(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-2"/><div className="flex justify-between text-xs font-bold"><span className="text-blue-600">{formatMoney(splitBf)}</span><span className="text-pink-600">{formatMoney(splitGf)}</span></div></div>)}
        {splitType === 'custom' && (<div className="bg-blue-50 p-3 rounded-xl border border-blue-100 animate-[fadeIn_0.2s]"><div className="text-[10px] text-blue-400 font-bold mb-2 text-center">輸入金額 (自動計算剩餘)</div><div className="flex gap-3 items-center"><div className="flex-1"><label className="text-[10px] text-gray-500 block mb-1">男友應付</label><input type="number" value={customBf} onChange={(e) => handleCustomChange('bf', e.target.value)} className="w-full p-2 rounded-lg text-center font-bold text-sm border-none outline-hidden focus:ring-2 focus:ring-blue-200" placeholder="0" /></div><div className="text-gray-400 font-bold">+</div><div className="flex-1"><label className="text-[10px] text-gray-500 block mb-1">女友應付</label><input type="number" value={customGf} onChange={(e) => handleCustomChange('gf', e.target.value)} className="w-full p-2 rounded-lg text-center font-bold text-sm border-none outline-hidden focus:ring-2 focus:ring-pink-200" placeholder="0" /></div></div></div>)}
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={handleSubmit} compact={true} />
      </div>
    </ModalLayout>
  );
};

export default AddTransactionModal;
