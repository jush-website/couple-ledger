import { useState } from 'react';
import { Trash2, Archive, Target, ChevronDown } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import { CATEGORIES } from '../lib/constants.js';
import { normalizeBudget } from '../lib/budget.js';

const toInput = (n) => (n ? String(n) : '');

const BookManagerModal = ({ onClose, onSave, onDelete, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [isArchived, setIsArchived] = useState(initialData?.status === 'archived');
    const initialBudget = normalizeBudget(initialData?.budget);
    const [budgetTotal, setBudgetTotal] = useState(toInput(initialBudget.total));
    const [catBudgets, setCatBudgets] = useState(() => Object.fromEntries(CATEGORIES.map(c => [c.id, toInput(initialBudget.categories[c.id])])));
    const [showCats, setShowCats] = useState(Object.keys(initialBudget.categories).length > 0);
    const handleSave = () => onSave(name, isArchived ? 'archived' : 'active', normalizeBudget({ total: budgetTotal, categories: catBudgets }));
    return (
        <ModalLayout title={initialData ? "編輯帳本" : "新增帳本"} onClose={onClose}>
            <div className="space-y-4 pt-2">
                <div><label className="block text-xs font-bold text-gray-400 mb-1">帳本名稱</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例如: 日常開銷、日本旅遊" className="w-full bg-gray-50 border-none rounded-xl p-3 text-base font-bold focus:ring-2 focus:ring-blue-100 outline-hidden" autoFocus/></div>
                {initialData && (<div className="bg-orange-50 p-3 rounded-xl border border-orange-100"><div className="flex items-center justify-between"><span className="text-sm font-bold text-orange-800 flex items-center gap-2"><Archive size={16}/> 封存此帳本?</span><button onClick={() => setIsArchived(!isArchived)} className={`w-12 h-6 rounded-full transition-colors relative ${isArchived ? 'bg-orange-400' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-surface transition-transform ${isArchived ? 'left-7' : 'left-1'}`}></div></button></div><p className="text-xs text-orange-600 mt-2">{isArchived ? '此帳本將移至歷史區，主畫面將隱藏。' : '此帳本目前正在使用中。'}</p></div>)}
                <div className="bg-gray-50 p-3 rounded-xl space-y-2">
                    <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><Target size={14}/> 每月預算（選填，留空＝不設）</label>
                    <div className="flex items-center gap-2 bg-surface rounded-lg px-3"><span className="text-gray-400 font-bold">$</span><input type="number" inputMode="numeric" min="0" value={budgetTotal} onChange={e => setBudgetTotal(e.target.value)} placeholder="整本帳每月總預算" className="w-full py-2.5 text-sm font-bold outline-hidden bg-transparent"/></div>
                    <button type="button" onClick={() => setShowCats(!showCats)} className="text-[11px] font-bold text-gray-400 flex items-center gap-1">分類預算 <ChevronDown size={12} className={`transition-transform ${showCats ? 'rotate-180' : ''}`}/></button>
                    {showCats && (<div className="grid grid-cols-2 gap-2">{CATEGORIES.map(c => (<div key={c.id} className="flex items-center gap-1.5 bg-surface rounded-lg px-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }}/><span className="text-[11px] font-bold text-gray-500 shrink-0">{c.name}</span><input type="number" inputMode="numeric" min="0" value={catBudgets[c.id]} onChange={e => setCatBudgets(prev => ({ ...prev, [c.id]: e.target.value }))} placeholder="—" className="w-full min-w-0 py-2 text-xs font-bold text-right outline-hidden bg-transparent"/></div>))}</div>)}
                    <p className="text-[10px] text-gray-400">用到 80% 會在總覽頁提醒，超過會標紅色。</p>
                </div>
                <button onClick={handleSave} disabled={!name.trim()} className="w-full py-3 bg-gray-900 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">儲存變更</button>
                {initialData && (<button onClick={() => onDelete(initialData.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100"><Trash2 size={16} /> 永久刪除</button>)}
            </div>
        </ModalLayout>
    );
};

export default BookManagerModal;
