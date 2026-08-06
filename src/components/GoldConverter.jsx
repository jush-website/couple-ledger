import { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney } from '../lib/format.js';

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
        <div className="bg-surface rounded-3xl shadow-xs border border-gray-100 overflow-hidden mb-4 transition-all duration-300">
            <button onClick={toggleVisibility} className="w-full p-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100 transition-colors"><div className="flex items-center gap-2 font-bold text-gray-700"><Calculator size={18} className="text-orange-500"/>黃金計算機</div>{isVisible ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}</button>
            {isVisible && (
                <div className="p-5 animate-[fadeIn_0.3s]">
                    <div className="flex gap-2 mb-4"><div className="relative flex-1"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full bg-gray-50 text-2xl font-black text-gray-800 p-3 rounded-xl border-2 border-transparent focus:border-orange-200 outline-hidden transition-colors"/></div><select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-gray-100 font-bold text-gray-600 rounded-xl px-2 outline-hidden border-r-[10px] border-transparent"><option value="g">公克 (g)</option><option value="tw_qian">台錢</option><option value="tw_liang">台兩</option><option value="kg">公斤</option><option value="twd">金額 (NTD)</option></select></div>
                    <div className="grid grid-cols-2 gap-3"><div className={`p-3 rounded-xl border ${unit === 'twd' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">金額 (TWD)</div><div className="font-black text-gray-800 text-lg">{formatMoney(displayValues.twd)}</div></div><div className={`p-3 rounded-xl border ${unit === 'tw_liang' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">台兩</div><div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 }).format(displayValues.tw_liang)} <span className="text-xs font-normal text-gray-400">兩</span></div></div><div className={`p-3 rounded-xl border ${unit === 'tw_qian' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">台錢</div><div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 3 }).format(displayValues.tw_qian)} <span className="text-xs font-normal text-gray-400">錢</span></div></div><div className={`p-3 rounded-xl border ${unit === 'g' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}><div className="text-[10px] text-gray-400 mb-1">公克 (g)</div><div className="font-bold text-gray-800 text-lg">{new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(displayValues.g)} <span className="text-xs font-normal text-gray-400">克</span></div></div></div>
                </div>
            )}
        </div>
    );
};

export default GoldConverter;
