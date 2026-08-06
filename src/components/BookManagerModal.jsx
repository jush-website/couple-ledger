import { useState } from 'react';
import { Trash2, Archive } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';

const BookManagerModal = ({ onClose, onSave, onDelete, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [isArchived, setIsArchived] = useState(initialData?.status === 'archived');
    return (
        <ModalLayout title={initialData ? "編輯帳本" : "新增帳本"} onClose={onClose}>
            <div className="space-y-4 pt-2">
                <div><label className="block text-xs font-bold text-gray-400 mb-1">帳本名稱</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例如: 日常開銷、日本旅遊" className="w-full bg-gray-50 border-none rounded-xl p-3 text-base font-bold focus:ring-2 focus:ring-blue-100 outline-hidden" autoFocus/></div>
                {initialData && (<div className="bg-orange-50 p-3 rounded-xl border border-orange-100"><div className="flex items-center justify-between"><span className="text-sm font-bold text-orange-800 flex items-center gap-2"><Archive size={16}/> 封存此帳本?</span><button onClick={() => setIsArchived(!isArchived)} className={`w-12 h-6 rounded-full transition-colors relative ${isArchived ? 'bg-orange-400' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-surface transition-transform ${isArchived ? 'left-7' : 'left-1'}`}></div></button></div><p className="text-xs text-orange-600 mt-2">{isArchived ? '此帳本將移至歷史區，主畫面將隱藏。' : '此帳本目前正在使用中。'}</p></div>)}
                <button onClick={() => onSave(name, isArchived ? 'archived' : 'active')} disabled={!name.trim()} className="w-full py-3 bg-gray-900 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">儲存變更</button>
                {initialData && (<button onClick={() => onDelete(initialData.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100"><Trash2 size={16} /> 永久刪除</button>)}
            </div>
        </ModalLayout>
    );
};

export default BookManagerModal;
