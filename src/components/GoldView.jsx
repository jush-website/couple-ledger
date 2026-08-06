import { useState } from 'react';
import { Plus, Trash2, History, Coins, RefreshCcw, Tag } from 'lucide-react';
import { formatMoney, formatWeight } from '../lib/format.js';
import GoldConverter from './GoldConverter.jsx';
import GoldChart from './GoldChart.jsx';

const GoldView = ({ transactions, goldPrice, history, period, setPeriod, onAdd, onEdit, onDelete, loading, error, onRefresh, role, intraday }) => {
    const [showConverter, setShowConverter] = useState(false);
    const [showChart, setShowChart] = useState(false);
    const myTransactions = transactions.filter(t => t.owner === role);
    const totalWeightGrams = myTransactions.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
    const totalCost = myTransactions.reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0);
    const currentValue = totalWeightGrams * goldPrice;
    const profit = currentValue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const avgCost = totalWeightGrams > 0 ? totalCost / totalWeightGrams : 0;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
            <div className={`p-6 rounded-3xl shadow-lg text-surface relative overflow-hidden ${role === 'bf' ? 'bg-linear-to-br from-blue-500 to-indigo-600' : 'bg-linear-to-br from-pink-500 to-rose-600'}`}>
                <div className="absolute top-0 right-0 p-4 opacity-20"><Coins size={80} /></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start"><div className="text-surface/80 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">{role === 'bf' ? '👦 男朋友' : '👧 女朋友'} 的黃金總值 (台幣)</div><button type="button" onClick={onRefresh} disabled={loading} className={`p-1 rounded-full bg-surface/10 hover:bg-surface/20 transition-colors ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={14} className="text-surface"/></button></div>
                    <div className="text-3xl font-black mb-4">{formatMoney(currentValue)}</div>
                    <div className="grid grid-cols-2 gap-4"><div className="bg-surface/10 rounded-xl p-3 backdrop-blur-xs"><div className="text-surface/70 text-[10px] mb-1">持有重量 (台錢)</div><div className="text-lg font-bold flex items-end gap-1">{formatWeight(totalWeightGrams, 'tw_qian')}<span className="text-[10px] font-normal opacity-70">({formatWeight(totalWeightGrams)})</span></div></div><div className={`rounded-xl p-3 backdrop-blur-xs ${profit >= 0 ? 'bg-green-400/30' : 'bg-red-400/30'}`}><div className="text-surface/70 text-[10px] mb-1">預估損益</div><div className={`text-lg font-bold flex items-center gap-1 ${profit >= 0 ? 'text-green-100' : 'text-red-100'}`}>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</div></div></div>
                    <div className="mt-4 grid grid-cols-2 gap-y-1 text-xs font-bold text-surface/70"><span>購入成本: {formatMoney(totalCost)}</span><span>平均成本: {formatMoney(avgCost)}/g</span><span className={profit >= 0 ? 'text-green-100' : 'text-red-100'}>ROI: {roi.toFixed(2)}%</span><span></span></div>
                </div>
            </div>
            <button type="button" onClick={onAdd} className={`w-full p-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform text-surface font-bold text-lg ${role === 'bf' ? 'bg-linear-to-r from-blue-600 to-indigo-600 shadow-blue-200' : 'bg-linear-to-r from-pink-500 to-rose-500 shadow-pink-200'}`}><Plus size={24} /> 記一筆黃金</button>
            <GoldConverter goldPrice={goldPrice} isVisible={showConverter} toggleVisibility={() => setShowConverter(!showConverter)} />
            <GoldChart data={history} intraday={intraday} period={period} setPeriod={setPeriod} goldPrice={goldPrice} loading={loading} isVisible={showChart} toggleVisibility={() => setShowChart(!showChart)} />
            {error && <div className="text-xs text-red-500 text-center mt-2 bg-red-50 p-2 rounded-lg">{error}</div>}
            <div className="bg-surface rounded-3xl shadow-xs border border-gray-100 overflow-hidden"><div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2"><History size={16} className="text-gray-400"/><h3 className="font-bold text-gray-700">{role === 'bf' ? '男友' : '女友'}的黃金存摺</h3></div><div className="divide-y divide-gray-100">
                    {myTransactions.length === 0 ? (<div className="p-8 text-center text-gray-400 text-sm">還沒有黃金紀錄</div>) : (myTransactions.map(t => { const weightG = Number(t.weight) || 0; const cost = Number(t.totalCost) || 0; const itemValue = weightG * goldPrice; const itemProfit = itemValue - cost; const itemRoi = cost > 0 ? (itemProfit / cost) * 100 : 0; const costPerGram = weightG > 0 ? cost / weightG : 0; return (<div key={t.id} onClick={() => onEdit(t)} className="p-4 flex items-start justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"><div className="flex gap-3">{t.photo ? (<img src={t.photo} alt="receipt" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />) : (<div className="w-12 h-12 rounded-xl bg-yellow-100 text-yellow-600 flex items-center justify-center"><Tag size={20} /></div>)}<div><div className="font-bold text-gray-800 flex items-center gap-2">{formatWeight(t.weight, 'tw_qian')}{t.note && <span className="text-xs font-normal text-gray-400">({t.note})</span>}</div><div className="text-xs text-gray-400 flex gap-2 mt-0.5"><span>{t.date}</span>{t.channel && <span>• {t.channel}</span>}</div><div className="text-[10px] text-gray-400 mt-1 flex gap-2"><span>總成本 {formatMoney(t.totalCost)}</span><span className="text-gray-300">|</span><span>均價 {formatMoney(costPerGram)}/g</span></div></div></div><div className="text-right"><div className={`font-bold text-sm ${itemProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{itemProfit >= 0 ? '+' : ''}{formatMoney(itemProfit)}</div><div className={`text-[10px] font-bold ${itemProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{itemRoi.toFixed(1)}%</div><button type="button" onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="mt-2 text-gray-300 hover:text-red-400 p-1"><Trash2 size={14} /></button></div></div>); }))}
            </div></div>
        </div>
    );
};

export default GoldView;
