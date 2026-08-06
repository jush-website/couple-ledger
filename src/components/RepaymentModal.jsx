import { CheckCircle } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import ModalLayout from './ModalLayout.jsx';

const RepaymentModal = ({ debt, onClose, onSave }) => {
    const displayAmount = Math.abs(debt);
    const handleConfirm = () => { onSave({ amount: displayAmount, category: 'repayment', note: '結清欠款', date: new Date().toISOString().split('T')[0], paidBy: debt > 0 ? 'gf' : 'bf', splitType: 'shared' }); onClose(); };
    return (
        <ModalLayout title="結清款項" onClose={onClose}>
            <div className="text-center space-y-4 py-4"><div className="text-gray-500 text-sm">{debt > 0 ? '👧 女朋友' : '👦 男朋友'} 需要支付給<br/><span className="font-bold text-gray-800 text-lg">{debt > 0 ? '男朋友 👦' : '女朋友 👧'}</span></div><div className="text-4xl font-black text-gray-800">{formatMoney(displayAmount)}</div><p className="text-xs text-gray-400">確認對方已收到款項後再點擊結清</p><button onClick={handleConfirm} className="w-full py-3 bg-green-500 text-surface rounded-xl font-bold shadow-lg shadow-green-200 active:scale-95 transition-transform"><CheckCircle className="inline mr-2" size={18}/>確認已還款</button></div>
        </ModalLayout>
    );
};

export default RepaymentModal;
