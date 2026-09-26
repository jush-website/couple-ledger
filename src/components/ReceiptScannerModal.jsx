import { useState } from 'react';
import { X, Check, Camera, Loader2 } from 'lucide-react';
import { formatMoney, compressForOcr } from '../lib/format.js';
import { analyzeReceiptImage } from '../lib/receipt.js';
import ModalLayout from './ModalLayout.jsx';

// 「每項各記一筆」時每個品項的分帳方式
const ITEM_SPLITS = [
    { id: 'shared', label: '平分', on: 'bg-purple-100 text-purple-600' },
    { id: 'bf_personal', label: '男友', on: 'bg-blue-100 text-blue-600' },
    { id: 'gf_personal', label: '女友', on: 'bg-pink-100 text-pink-600' },
];

const ReceiptScannerModal = ({ role, onClose, onConfirm, onSaveMany }) => {
    const [step, setStep] = useState('upload');
    const [scannedData, setScannedData] = useState(null);
    const [selectedItems, setSelectedItems] = useState({});
    const [errorMsg, setErrorMsg] = useState(null);
    // merge：合併成一筆、帶進記帳表單確認；split：每個品項各記一筆，分帳方式在這個畫面直接選
    const [mode, setMode] = useState('merge');
    const [paidBy, setPaidBy] = useState(role);
    const [itemSplits, setItemSplits] = useState({});
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
    const selected = scannedData ? scannedData.items.map((item, idx) => ({ item, idx })).filter(({ idx }) => selectedItems[idx]) : [];
    const selectedTotal = selected.reduce((acc, { item }) => acc + item.price, 0);
    // 這個畫面本身就是確認畫面：每一筆的金額、品名、分帳方式都列出來讓使用者勾選後才存
    const handleSaveSplit = () => {
        if (selected.length === 0) return;
        const date = scannedData.date || new Date().toISOString().split('T')[0];
        onSaveMany(selected.map(({ item, idx }) => ({
            amount: item.price, note: item.name.substring(0, 50), category: item.category, date, paidBy, splitType: itemSplits[idx] || 'shared',
        })));
    };
    const handleConfirm = () => { const itemsToImport = scannedData.items.filter((_, i) => selectedItems[i]); const total = itemsToImport.reduce((acc, curr) => acc + curr.price, 0); const note = itemsToImport.map(i => i.name).join(', ').substring(0, 50); const categories = itemsToImport.map(i => i.category); const modeCategory = categories.sort((a,b) => categories.filter(v=>v===a).length - categories.filter(v=>v===b).length).pop(); onConfirm({ amount: total, note: note || "收據匯入", category: modeCategory || 'other', date: scannedData.date || new Date().toISOString().split('T')[0] }); };
    return (
        <ModalLayout title="AI 智慧收據辨識" onClose={onClose}>
            {step === 'upload' && !errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><label className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"><div className="bg-purple-100 p-4 rounded-full mb-3 text-purple-600"><Camera size={32} /></div><span className="font-bold text-gray-600">拍照或上傳收據</span><input type="file" accept="image/*" className="hidden" onChange={handleFile} /></label></div>)}
            {step === 'analyzing' && !errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4"><Loader2 size={48} className="animate-spin text-purple-500" /><div className="text-center"><h3 className="font-bold text-gray-800">正在分析收據...</h3></div></div>)}
            {errorMsg && (<div className="flex flex-col items-center justify-center h-64 gap-4 px-4"><div className="bg-red-100 p-4 rounded-full text-red-500"><X size={32} /></div><h3 className="font-bold text-gray-800">糟糕，出錯了</h3><p className="text-xs text-gray-500 text-center leading-relaxed max-w-xs">{errorMsg}</p><button onClick={() => { setStep('upload'); setErrorMsg(null); }} className="px-6 py-2 bg-gray-900 text-surface rounded-xl text-sm font-bold mt-2">重試</button></div>)}
            {step === 'review' && scannedData && !errorMsg && (
                <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm font-bold text-gray-500 bg-gray-100 p-2 rounded-lg"><span>日期: {scannedData.date}</span><span>總計: {formatMoney(scannedData.total)}</span></div>
                    <div className="flex bg-gray-100 rounded-xl p-1 text-xs font-bold">
                        <button type="button" onClick={() => setMode('merge')} className={`flex-1 py-2 rounded-lg transition-all ${mode === 'merge' ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400'}`}>合併成一筆</button>
                        <button type="button" onClick={() => setMode('split')} className={`flex-1 py-2 rounded-lg transition-all ${mode === 'split' ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400'}`}>每項各記一筆</button>
                    </div>
                    {mode === 'split' && (
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                            <span className="shrink-0">誰付的錢?</span>
                            <div className="flex flex-1 bg-gray-100 rounded-lg p-1">
                                <button type="button" onClick={() => setPaidBy('bf')} className={`flex-1 py-1 rounded-md ${paidBy === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button>
                                <button type="button" onClick={() => setPaidBy('gf')} className={`flex-1 py-1 rounded-md ${paidBy === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button>
                            </div>
                        </div>
                    )}
                    <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                        {scannedData.items.map((item, idx) => (
                            <div key={idx} onClick={() => toggleItem(idx)} className={`p-3 rounded-xl border transition-all cursor-pointer ${selectedItems[idx] ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-surface opacity-60'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 min-w-0"><div className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${selectedItems[idx] ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>{selectedItems[idx] && <Check size={12} className="text-surface" />}</div><div className="font-bold text-sm text-gray-800 truncate">{item.name}</div></div>
                                    <div className="font-bold text-gray-700 shrink-0 ml-2">{formatMoney(item.price)}</div>
                                </div>
                                {mode === 'split' && selectedItems[idx] && (
                                    <div className="flex gap-1 mt-2 ml-8" onClick={(e) => e.stopPropagation()}>
                                        {ITEM_SPLITS.map(sp => (
                                            <button key={sp.id} type="button" onClick={() => setItemSplits(prev => ({ ...prev, [idx]: sp.id }))} className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${(itemSplits[idx] || 'shared') === sp.id ? sp.on : 'bg-surface text-gray-400'}`}>{sp.label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                        {mode === 'merge'
                            ? <button onClick={handleConfirm} disabled={selected.length === 0} className="w-full py-3 bg-purple-600 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50">匯入並前往分帳</button>
                            : <button onClick={handleSaveSplit} disabled={selected.length === 0} className="w-full py-3 bg-purple-600 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50">記 {selected.length} 筆（共 {formatMoney(selectedTotal)}）</button>}
                    </div>
                </div>
            )}
        </ModalLayout>
    );
};

export default ReceiptScannerModal;
