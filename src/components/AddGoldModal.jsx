import { useState } from 'react';
import { RefreshCw, Camera, AlertCircle } from 'lucide-react';
import { compressImage } from '../lib/format.js';
import ModalLayout from './ModalLayout.jsx';

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
    const handlePhoto = async (e) => { const file = e.target.files[0]; if (file) { try { const reader = new FileReader(); reader.onloadend = async () => { const compressed = await compressImage(reader.result); setPhoto(compressed); }; reader.readAsDataURL(file); } catch(e) { setError('照片處理失敗'); } } };
    const handleSubmit = () => {
        if (!weightInput || !totalCost) { setError('請輸入重量與金額'); return; }
        const weightNum = parseFloat(weightInput); const costNum = parseFloat(totalCost);
        if (isNaN(weightNum) || weightNum <= 0) { setError('重量格式錯誤'); return; }
        if (isNaN(costNum) || costNum < 0) { setError('金額格式錯誤'); return; }
        let weightInGrams = weightNum;
        if (unit === 'tw_qian') weightInGrams = weightInGrams * 3.75; if (unit === 'tw_liang') weightInGrams = weightInGrams * 37.5; if (unit === 'kg') weightInGrams = weightInGrams * 1000;
        onSave({ date, weight: weightInGrams, totalCost: costNum, channel, note, photo, owner });
    };
    return (
        <ModalLayout title={initialData ? "編輯黃金" : "記一筆黃金"} onClose={onClose}>
            <div className="space-y-4 pt-2">
                {error && (<div className="bg-red-50 text-red-500 p-3 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle size={16}/> {error}</div>)}
                <div className="flex gap-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold outline-hidden border-2 border-transparent focus:border-blue-200" /><div className="flex bg-gray-100 rounded-xl p-1 flex-1"><button type="button" onClick={() => setOwner('bf')} className={`flex-1 rounded-lg text-xs font-bold transition-all ${owner === 'bf' ? 'bg-blue-500 text-surface shadow-xs' : 'text-gray-500 hover:bg-gray-200'}`}>男友</button><button type="button" onClick={() => setOwner('gf')} className={`flex-1 rounded-lg text-xs font-bold transition-all ${owner === 'gf' ? 'bg-pink-500 text-surface shadow-xs' : 'text-gray-500 hover:bg-gray-200'}`}>女友</button></div></div>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-transparent focus-within:border-yellow-200 transition-colors"><div className="flex justify-between mb-2"><label className="text-xs font-bold text-gray-400">重量</label><div className="flex bg-surface rounded-lg p-0.5 shadow-xs overflow-auto hide-scrollbar">{[{id:'tw_qian', label:'台錢'}, {id:'tw_liang', label:'台兩'}, {id:'g', label:'公克'}, {id:'kg', label:'公斤'}].map(u => (<button type="button" key={u.id} onClick={()=>setUnit(u.id)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${unit===u.id ? 'bg-yellow-500 text-surface' : 'text-gray-400 hover:bg-gray-50'}`}>{u.label}</button>))}</div></div><div className="flex items-baseline gap-2"><input type="number" inputMode="decimal" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="0.00" className="bg-transparent text-4xl font-black text-gray-800 w-full outline-hidden" /><span className="text-sm font-bold text-gray-400 mb-1">{unit === 'tw_qian' ? '錢' : (unit === 'tw_liang' ? '兩' : (unit === 'g' ? '克' : '公斤'))}</span></div></div>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-transparent focus-within:border-green-200 transition-colors"><label className="text-xs font-bold text-gray-400 block mb-1">購買總金額 (台幣)</label><div className="flex items-center gap-1"><span className="text-gray-400 text-lg font-bold">$</span><input type="number" inputMode="numeric" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0" className="bg-transparent text-3xl font-black text-gray-800 w-full outline-hidden" /></div></div>
                <div className="grid grid-cols-2 gap-2"><div className="bg-gray-50 p-3 rounded-2xl"><label className="text-[10px] text-gray-400 block mb-1 font-bold">購買管道</label><input type="text" value={channel} onChange={e => setChannel(e.target.value)} placeholder="例: 銀樓" className="bg-transparent w-full text-sm font-bold outline-hidden" /></div><div className="bg-gray-50 p-3 rounded-2xl"><label className="text-[10px] text-gray-400 block mb-1 font-bold">備註</label><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="例: 生日禮物" className="bg-transparent w-full text-sm font-bold outline-hidden" /></div></div>
                <label className="block w-full h-24 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all relative overflow-hidden group">{photo ? (<><img src={photo} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" /><div className="relative z-10 bg-black/70 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2"><RefreshCw size={12}/> 更換照片</div></>) : (<><Camera size={24} className="mb-1 text-gray-300 group-hover:text-gray-500 transition-colors"/><span className="text-xs font-bold">上傳證明/照片</span></>)}<input type="file" accept="image/*" className="hidden" onChange={handlePhoto} /></label>
                <button type="button" onClick={handleSubmit} disabled={!weightInput || !totalCost} className="w-full py-4 bg-gray-900 text-surface rounded-2xl font-bold shadow-lg disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all text-lg">{initialData ? '儲存變更' : '確認入庫'}</button>
            </div>
        </ModalLayout>
    );
};

export default AddGoldModal;
