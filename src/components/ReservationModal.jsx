import { useState } from 'react';
import { Trash2, Lock } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import { CATEGORIES } from '../lib/constants.js';

const OWNERS = [
  { id: 'shared', label: '共同', on: 'bg-purple-500 text-surface' },
  { id: 'bf', label: '男友', on: 'bg-blue-500 text-surface' },
  { id: 'gf', label: '女友', on: 'bg-pink-500 text-surface' },
];

// 新增／編輯一筆預留款。付款日選填：沒填的一律算進本月預算（寧可提醒多一點）
const ReservationModal = ({ initialData, role, onClose, onSave, onDelete }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [amount, setAmount] = useState(initialData?.amount ? String(initialData.amount) : '');
  const [category, setCategory] = useState(initialData?.category || 'shopping');
  const [owner, setOwner] = useState(initialData?.owner || (role === 'bf' || role === 'gf' ? role : 'shared'));
  const [dueDate, setDueDate] = useState(initialData?.dueDate || '');
  const valid = name.trim() && Number(amount) > 0;

  const handleSave = () => {
    if (!valid) return;
    onSave({ name: name.trim(), amount: Math.round(Number(amount)), category, owner, dueDate });
  };

  return (
    <ModalLayout title={initialData ? '編輯預留款' : '預留待付款'} onClose={onClose}>
      <div className="space-y-4 pt-1">
        <p className="text-[11px] text-gray-400 flex items-start gap-1.5"><Lock size={14} className="shrink-0 mt-px" />先把要付的錢圈起來。設了預算的話，「可自由花用」會扣掉這筆，提醒這些錢不能動。</p>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">買了什麼</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：手機預購、演唱會門票" className="w-full bg-gray-50 rounded-xl p-3 text-base font-bold outline-hidden focus:ring-2 focus:ring-blue-100" autoFocus={!initialData} />
        </div>
        <div className="bg-gray-50 p-3 rounded-xl">
          <label className="block text-xs font-bold text-gray-400 mb-1">要付多少</label>
          <div className="flex items-center gap-1"><span className="text-gray-400 text-lg font-bold">$</span><input type="number" inputMode="numeric" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="bg-transparent text-3xl font-black text-gray-800 w-full outline-hidden" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">預計付款日（選填）</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-gray-50 rounded-xl px-2 py-2.5 text-sm font-bold outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">誰的</label>
            <div className="flex bg-gray-100 rounded-xl p-1 h-[42px]">
              {OWNERS.map((o) => (
                <button key={o.id} type="button" onClick={() => setOwner(o.id)} className={`flex-1 rounded-lg text-xs font-bold transition-all ${owner === o.id ? o.on : 'text-gray-500'}`}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">分類</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${category === c.id ? 'border-gray-800 bg-gray-800 text-surface' : 'border-gray-100 bg-surface text-gray-500'}`}>{c.name}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={handleSave} disabled={!valid} className="w-full py-3 bg-gray-900 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">{initialData ? '儲存變更' : '預留這筆錢'}</button>
        {initialData && (
          <button type="button" onClick={() => onDelete(initialData.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2"><Trash2 size={16} />不買了，取消預留</button>
        )}
      </div>
    </ModalLayout>
  );
};

export default ReservationModal;
