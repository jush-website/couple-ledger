import { useState } from 'react';
import { X, Check, Camera, Loader2 } from 'lucide-react';
import { formatMoney, compressForOcr } from '../lib/format.js';
import { analyzeReceiptImage } from '../lib/receipt.js';
import ModalLayout from './ModalLayout.jsx';

const ReceiptScannerModal = ({ onClose, onConfirm }) => {
    const [step, setStep] = useState('upload');
    const [scannedData, setScannedData] = useState(null);
    const [selectedItems, setSelectedItems] = useState({});
    const [errorMsg, setErrorMsg] = useState(null);
    const handleFile = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onloadend = () => { processImage(reader.result); }; reader.readAsDataURL(file); };
    const processImage = async (dataUrl) => {
        setStep('analyzing'); setErrorMsg(null);
        try {
            // 一定要先壓：手機原圖遠超過 NIM 的內嵌圖片上限
            const compressed = await compressForOcr(dataUrl);
            const result = await analyzeReceiptImage(compressed);
            if (!result.items?.length) throw new Error('這張收據沒有辨識到任何品項，換一張清楚一點的試試。');
            setScannedData(result);
            const initialSel = {};
            result.items.forEach((_, i) => initialSel[i] = true);
            setSelectedItems(initialSel);
            setStep('review');
        } catch (e) { console.error(e); setErrorMsg(e.message || '辨識失敗'); }
    };
    const toggleItem = (idx) => { setSelectedItems(prev => ({ ...prev, [idx]: !prev[idx] })); };
    const handleConfirm = () => { const itemsToImport = scannedData.items.filter((_, i) => selectedItems[i]); const total = itemsToImport.reduce((acc, curr) => acc + curr.price, 0); const note = itemsToImport.map(i => i.name).join(', ').substring(0, 50); const categories = itemsToImport.map(i => i.category); const modeCategory = categories.sort((a,b) => categories.filter(v=>v===a).length - categories.filter(v=>v===b).length).pop(); onConfirm({ amount: total, note: note || "收據匯入", category: modeCategory || 'other', date: scannedData.date || new Date().toISOString().split('T')[0] }); };
    return (
        <ModalLayout title="AI 智慧收據辨識" onClose={onClose}>
            {step === 'upload' && !errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><label className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"><div className="bg-purple-100 p-4 rounded-full mb-3 text-purple-600"><Camera size={32} /></div><span className="font-bold text-gray-600">拍照或上傳收據</span><input type="file" accept="image/*" className="hidden" onChange={handleFile} /></label></div>)}
            {step === 'analyzing' && !errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><Loader2 size={48} className="animate-spin text-purple-500" /><div className="text-center"><h3 className="font-bold text-gray-800">正在分析收據...</h3></div></div>)}
            {errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4 px-4"><div className="bg-red-100 p-4 rounded-full text-red-500"><X size={32} /></div><h3 className="font-bold text-gray-800">糟糕，出錯了</h3><p className="text-xs text-gray-500 text-center leading-relaxed max-w-xs">{errorMsg}</p><button onClick={() => { setStep('upload'); setErrorMsg(null); }} className="px-6 py-2 bg-gray-900 text-surface rounded-xl text-sm font-bold mt-2">重試</button></div>)}
            {step === 'review' && scannedData && !errorMsg && (<div className="space-y-4"><div className="flex justify-between items-center text-sm font-bold text-gray-500 bg-gray-100 p-2 rounded-lg"><span>日期: {scannedData.date}</span><span>總計: {formatMoney(scannedData.total)}</span></div><div className="space-y-2 max-h-[50vh] overflow-y-auto">{scannedData.items.map((item, idx) => (<div key={idx} onClick={() => toggleItem(idx)} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedItems[idx] ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-surface opacity-60'}`}><div className="flex items-center gap-3"><div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedItems[idx] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>{selectedItems[idx] && <Check size={12} className="text-surface" />}</div><div><div className="font-bold text-sm text-gray-800">{item.name}</div></div></div><div className="font-bold text-gray-700">{formatMoney(item.price)}</div></div>))}</div><div className="border-t border-gray-100 pt-3"><button onClick={handleConfirm} className="w-full py-3 bg-purple-600 text-surface rounded-xl font-bold shadow-lg">匯入並前往分帳</button></div></div>)}
        </ModalLayout>
    );
};

export default ReceiptScannerModal;
