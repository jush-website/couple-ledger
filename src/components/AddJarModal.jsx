import { useState } from 'react';
import { User, Users } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import CalculatorKeypad from './CalculatorKeypad.jsx';

const AddJarModal = ({ onClose, onSave, initialData, role }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [target, setTarget] = useState(initialData?.targetAmount?.toString() || '');
  const [type, setType] = useState(initialData?.owner && initialData.owner !== 'shared' ? 'personal' : 'shared');

  return (
    <ModalLayout title={initialData ? "編輯存錢罐" : "新存錢罐"} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-100 p-1 rounded-xl flex mb-2"><button type="button" onClick={() => setType('shared')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${type === 'shared' ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400 hover:text-gray-600'}`}><Users size={16}/> 🤝 一起存</button><button type="button" onClick={() => setType('personal')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${type === 'personal' ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400 hover:text-gray-600'}`}><User size={16}/> 👤 個人存</button></div>
        <div className="bg-gray-50 p-3 rounded-2xl"><label className="block mb-1 text-xs font-bold text-gray-400">目標金額</label><div className="text-2xl font-black text-gray-800 tracking-wider h-8 flex items-center overflow-hidden">{target ? target : <span className="text-gray-300">0</span>}</div></div>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="名稱 (例如: 旅遊基金)" className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-hidden" />
        <CalculatorKeypad value={target} onChange={setTarget} onConfirm={(val) => { if (name && val) { const owner = type === 'shared' ? 'shared' : role; onSave(name, val, owner); } }} compact={true} />
      </div>
    </ModalLayout>
  );
};

export default AddJarModal;
