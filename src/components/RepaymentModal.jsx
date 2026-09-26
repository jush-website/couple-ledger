import { useState } from 'react';
import { formatMoney, safeCalculate } from '../lib/format.js';
import ModalLayout from './ModalLayout.jsx';
import CalculatorKeypad from './CalculatorKeypad.jsx';

// 欠款可能有小數（平分奇數金額），差不到 1 元就當作全部還清
const TOLERANCE = 1;
const toInput = (n) => String(Math.round(n * 100) / 100);

// 可以分批還：金額預設全額，也可以改成任意金額。
// 還款就是一筆 category: 'repayment' 的交易，Overview 的結算會照金額扣掉，所以部分還款不用改資料格式。
const RepaymentModal = ({ debt, onClose, onSave }) => {
    const owed = Math.abs(debt);
    const payer = debt > 0 ? 'gf' : 'bf';
    const [amount, setAmount] = useState(toInput(owed));
    const [error, setError] = useState('');

    const value = Number(safeCalculate(amount)) || 0;
    const remaining = owed - value;
    const isFull = Math.abs(remaining) < TOLERANCE;

    const handleConfirm = (result) => {
        const paid = Number(result) || 0;
        if (paid <= 0) { setError('請輸入還款金額'); return; }
        if (paid - owed >= TOLERANCE) { setError(`超過欠款金額 ${formatMoney(owed)}`); return; }
        const full = Math.abs(owed - paid) < TOLERANCE;
        onSave({
            // 還清時用精確的欠款金額，結算才會剛好歸零，不會留下幾毛錢
            amount: full ? owed : paid,
            category: 'repayment',
            note: full ? '結清欠款' : '部分還款',
            // 用本機日期：toISOString 是 UTC，台灣早上 8 點前記會變成前一天
            date: new Date().toLocaleDateString('en-CA'),
            paidBy: payer,
            splitType: 'shared',
        });
        onClose();
    };

    const quick = [
        { label: '全額', value: owed },
        { label: '一半', value: Math.round(owed / 2) },
    ];

    return (
        <ModalLayout title="登記還款" onClose={onClose}>
            <div className="space-y-3 pb-2">
                <div className="text-center text-sm text-gray-500">
                    {payer === 'gf' ? '👧 女朋友' : '👦 男朋友'} 目前欠 {payer === 'gf' ? '男朋友 👦' : '女朋友 👧'}
                    <span className="font-bold text-gray-800"> {formatMoney(owed)}</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-2xl text-center">
                    <div className="text-[10px] font-bold text-gray-400 mb-1">這次還多少？</div>
                    <div className="text-4xl font-black text-gray-800 tracking-wider h-11 flex items-center justify-center overflow-hidden">{amount || <span className="text-gray-300">0</span>}</div>
                    <div className={`text-xs font-bold mt-1 ${error ? 'text-red-500' : isFull ? 'text-green-600' : remaining < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                        {error || (value <= 0 ? '輸入金額，可以分批還' : isFull ? '這次會全部結清 🎉' : remaining < 0 ? `超過欠款金額 ${formatMoney(owed)}` : `還完後還欠 ${formatMoney(remaining)}`)}
                    </div>
                </div>
                <div className="flex gap-2">
                    {quick.map((q) => (
                        <button key={q.label} type="button" onClick={() => { setAmount(toInput(q.value)); setError(''); }} className="flex-1 py-2 rounded-xl bg-surface border border-gray-200 text-xs font-bold text-gray-600 active:scale-95 transition-transform">
                            {q.label} {formatMoney(q.value)}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-gray-400 text-center">確認對方已收到款項後，按 ✓ 登記</p>
                <CalculatorKeypad value={amount} onChange={(v) => { setAmount(v); setError(''); }} onConfirm={handleConfirm} compact={true} />
            </div>
        </ModalLayout>
    );
};

export default RepaymentModal;
