import { useState } from 'react';
import { Trash2, Pencil, ArrowLeft } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import ModalLayout from './ModalLayout.jsx';
import CalculatorKeypad from './CalculatorKeypad.jsx';

const JarHistoryModal = ({ jar, onClose, onUpdateItem, onDeleteItem }) => {
  const [editingItem, setEditingItem] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const history = [...(jar.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <ModalLayout title={`${jar.name} - 存錢紀錄`} onClose={onClose}>
        {editingItem ? (<div className="space-y-4 animate-[fadeIn_0.2s]"><button onClick={() => setEditingItem(null)} className="flex items-center gap-1 text-gray-500 text-xs font-bold mb-2"><ArrowLeft size={14}/> 返回列表</button><div className="bg-gray-50 p-3 rounded-2xl text-center"><div className="text-xs text-gray-400 mb-1">修改金額</div><div className="text-3xl font-black text-gray-800 tracking-wider h-10 flex items-center justify-center overflow-hidden">{editAmount}</div></div><CalculatorKeypad value={editAmount} onChange={setEditAmount} onConfirm={(val) => { if(Number(val) >= 0) { onUpdateItem(jar, editingItem, val); setEditingItem(null); } }} compact={true} /></div>) : (<div className="space-y-2">{history.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">尚無詳細紀錄</div> : history.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${item.role === 'bf' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{item.role === 'bf' ? '👦' : '👧'}</div><div><div className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString()}</div><div className="font-bold text-gray-800">{formatMoney(item.amount)}</div></div></div><div className="flex gap-2"><button onClick={() => { setEditingItem(item); setEditAmount(item.amount.toString()); }} className="p-2 bg-surface rounded-lg shadow-xs text-gray-400 hover:text-blue-500"><Pencil size={16}/></button><button onClick={() => onDeleteItem(jar, item)} className="p-2 bg-surface rounded-lg shadow-xs text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></div></div>))}</div>)}
    </ModalLayout>
  );
};

export default JarHistoryModal;
