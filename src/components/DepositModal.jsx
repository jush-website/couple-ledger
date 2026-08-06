import { useState } from 'react';
import { formatMoney } from '../lib/format.js';
import ModalLayout from './ModalLayout.jsx';
import CalculatorKeypad from './CalculatorKeypad.jsx';

const DepositModal = ({ jar, onClose, onConfirm, role }) => {
  const [amount, setAmount] = useState('');
  const [depositor, setDepositor] = useState(role);
  if (!jar) return null;
  return (
    <ModalLayout title={`存入: ${jar.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-center"><div className="text-gray-400 text-xs mb-1">目前進度</div><div className="font-bold text-xl text-gray-800">{formatMoney(jar.currentAmount)} <span className="text-gray-300 text-sm">/ {formatMoney(jar.targetAmount)}</span></div></div>
        <div className="bg-gray-50 p-2 rounded-xl"><div className="text-[10px] text-gray-400 text-center mb-1">是誰存的?</div><div className="flex bg-surface rounded-lg p-1 shadow-xs"><button onClick={() => setDepositor('bf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${depositor === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button><button onClick={() => setDepositor('gf')} className={`flex-1 py-1 rounded-md text-xs font-bold ${depositor === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button></div></div>
        <div className="bg-gray-50 p-3 rounded-2xl text-center"><div className="text-xs text-gray-400 mb-1">存入金額</div><div className="text-3xl font-black text-gray-800 tracking-wider h-10 flex items-center justify-center text-green-500 overflow-hidden">{amount ? `+${amount}` : <span className="text-gray-300">0</span>}</div></div>
        <CalculatorKeypad value={amount} onChange={setAmount} onConfirm={(val) => { if(Number(val) > 0) onConfirm(jar.id, val, depositor); }} compact={true} />
      </div>
    </ModalLayout>
  );
};

export default DepositModal;
