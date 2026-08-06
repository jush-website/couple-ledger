import { ArrowLeft, Check } from 'lucide-react';
import { safeCalculate } from '../lib/format.js';

const CalculatorKeypad = ({ value, onChange, onConfirm, compact = false }) => {
  const handlePress = (key) => {
    const strVal = (value || '').toString();
    if (key === 'C') onChange('');
    else if (key === '=') onChange(safeCalculate(strVal));
    else if (key === 'backspace') onChange(strVal.slice(0, -1));
    else {
      const lastChar = strVal.slice(-1);
      const isOperator = ['+', '-', '*', '/'].includes(key);
      const isLastOperator = ['+', '-', '*', '/'].includes(lastChar);
      if (isOperator && isLastOperator) onChange(strVal.slice(0, -1) + key);
      else onChange(strVal + key);
    }
  };
  const keys = [
    { label: '7', type: 'num' }, { label: '8', type: 'num' }, { label: '9', type: 'num' }, { label: '÷', val: '/', type: 'op' },
    { label: '4', type: 'num' }, { label: '5', type: 'num' }, { label: '6', type: 'num' }, { label: '×', val: '*', type: 'op' },
    { label: '1', type: 'num' }, { label: '2', type: 'num' }, { label: '3', type: 'num' }, { label: '-', val: '-', type: 'op' },
    { label: 'C', type: 'action', color: 'text-red-500' }, { label: '0', type: 'num' }, { label: '.', type: 'num' }, { label: '+', val: '+', type: 'op' },
  ];
  return (
    <div className={`bg-gray-50 p-2 rounded-2xl select-none ${compact ? 'mt-1' : 'mt-4'}`}>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {keys.map((k, i) => (
          <button key={i} type="button" onClick={(e) => { e.stopPropagation(); handlePress(k.val || k.label); }} className={`${compact ? 'h-9 text-base' : 'h-11 text-lg'} rounded-xl font-bold shadow-xs active:scale-95 transition-transform flex items-center justify-center ${k.type === 'op' ? 'bg-blue-100 text-blue-600' : 'bg-surface text-gray-700'} ${k.color || ''}`}>{k.label}</button>
        ))}
      </div>
      <div className="flex gap-2">
         <button type="button" onClick={(e) => { e.stopPropagation(); handlePress('backspace'); }} className={`${compact ? 'h-9' : 'h-11'} flex-1 bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 active:scale-95 transition-transform hover:bg-gray-300`}><ArrowLeft size={compact ? 20 : 24} /></button>
         <button type="button" onClick={(e) => { e.stopPropagation(); const result = safeCalculate(value); onChange(result); onConfirm && onConfirm(result); }} className={`${compact ? 'h-9' : 'h-11'} flex-[2] bg-green-500 hover:bg-green-600 text-surface rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md`}><Check size={20} /> <span>確認</span></button>
      </div>
    </div>
  );
};

export default CalculatorKeypad;
