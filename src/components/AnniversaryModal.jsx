import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import { TYPES } from '../lib/anniversaries.js';

const AnniversaryModal = ({ initialData, defaultDate, onClose, onSave, onDelete }) => {
  const editing = !!initialData?.id;
  const [name, setName] = useState(initialData?.name || '');
  const [date, setDate] = useState(initialData?.date || defaultDate);
  const [type, setType] = useState(initialData?.type || 'since');
  const valid = name.trim() && date;

  return (
    <ModalLayout title={editing ? '編輯紀念日' : '新增紀念日'} onClose={onClose}>
      <div className="space-y-4 pt-1">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="名稱（例如：在一起、她的生日、日本旅行）" className="w-full bg-gray-50 rounded-xl p-3 text-base font-bold outline-hidden focus:ring-2 focus:ring-blue-100" autoFocus={!editing} />
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-bold outline-hidden" />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-400">類型</label>
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => setType(t.id)} className={`w-full text-left p-3 rounded-xl border-2 transition-all ${type === t.id ? 'border-gray-800 bg-surface' : 'border-gray-100 bg-gray-50'}`}>
              <div className="text-sm font-bold text-gray-800">{t.label}</div>
              <div className="text-[11px] text-gray-400">{t.hint}</div>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => valid && onSave({ name: name.trim(), date, type })} disabled={!valid} className="w-full py-3 bg-gray-900 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">{editing ? '儲存變更' : '新增紀念日'}</button>
        {editing && <button type="button" onClick={() => onDelete(initialData.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2"><Trash2 size={16} />刪除紀念日</button>}
      </div>
    </ModalLayout>
  );
};

export default AnniversaryModal;
