import { useState, useMemo, useRef } from 'react';
import { Loader2, Dices, Users } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import ModalLayout from './ModalLayout.jsx';

const RouletteModal = ({ jars, onClose, onConfirm, role }) => {
  const activeJars = useMemo(() => jars.filter(j => !j.status || j.status === 'active'), [jars]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null); 
  const [displayNum, setDisplayNum] = useState(1);
  const [selectedJarId, setSelectedJarId] = useState('');
  const [depositor, setDepositor] = useState(role);
  const intervalRef = useRef(null);
  
  // 還沒選就預設第一個進行中的罐子（推導即可，不用 effect 回寫 state）
  const jarId = selectedJarId || activeJars[0]?.id || '';
  const spin = () => { setSpinning(true); setResult(null); intervalRef.current = setInterval(() => { setDisplayNum(Math.floor(Math.random() * 99) + 1); }, 50); setTimeout(() => { if (intervalRef.current) clearInterval(intervalRef.current); const final = Math.floor(Math.random() * 99) + 1; setDisplayNum(final); setResult(final); setSpinning(false); }, 1500); };
  const handleDeposit = () => { if(result && jarId) { let finalAmount = result; if (depositor === 'both') { finalAmount = result * 2; } onConfirm(jarId, finalAmount.toString(), depositor); onClose(); } };
  return (
      <ModalLayout title="🎲 命運轉盤 (1~99元)" onClose={onClose}>
          <div className="flex flex-col items-center gap-6 py-4">
              <div className="relative w-48 h-48 rounded-full border-8 border-purple-100 flex items-center justify-center shadow-inner bg-surface"><div className="absolute inset-0 rounded-full border-4 border-dashed border-purple-200 animate-spin-slow" style={{ animationDuration: spinning ? '2s' : '10s' }}></div><div className="text-center z-10"><div className="text-xs font-bold text-gray-400 mb-1">{spinning ? '轉動中...' : (result ? '恭喜選中!' : '試試手氣')}</div><div className={`text-6xl font-black tracking-tight transition-colors ${spinning ? 'text-gray-300 scale-90 blur-[1px]' : 'text-purple-600 scale-100'}`}>{displayNum}</div><div className="text-sm font-bold text-purple-300 mt-1">NT$</div></div></div>
              {!result ? (<button onClick={spin} disabled={spinning} className="w-full py-4 bg-purple-600 text-surface rounded-2xl font-bold shadow-lg shadow-purple-200 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 text-lg flex items-center justify-center gap-2">{spinning ? <Loader2 className="animate-spin" /> : <Dices />}{spinning ? '命運轉動中...' : '開始轉動！'}</button>) : (<div className="w-full space-y-4 animate-[fadeIn_0.3s]"><div className="bg-gray-50 p-4 rounded-2xl space-y-3"><div className="flex justify-between items-center text-sm font-bold text-gray-600 border-b border-gray-200 pb-2"><span>存入金額</span><div className="text-right"><span className="text-purple-600 text-lg block">{formatMoney(depositor === 'both' ? result * 2 : result)}</span>{depositor === 'both' && <span className="text-[10px] text-gray-400 block">({result} x 2人)</span>}</div></div><div><div className="text-[10px] text-gray-400 mb-1">誰要存?</div><div className="flex bg-surface rounded-lg p-1 shadow-xs"><button onClick={() => setDepositor('bf')} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${depositor === 'bf' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}>男友</button><button onClick={() => setDepositor('gf')} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${depositor === 'gf' ? 'bg-pink-100 text-pink-600' : 'text-gray-400'}`}>女友</button><button onClick={() => setDepositor('both')} className={`flex-[1.2] py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 ${depositor === 'both' ? 'bg-purple-100 text-purple-600' : 'text-gray-400'}`}><Users size={12}/> 一起 (+100%)</button></div></div><div><div className="text-[10px] text-gray-400 mb-1">存到哪?</div>{activeJars.length > 0 ? (<select value={jarId} onChange={(e) => setSelectedJarId(e.target.value)} className="w-full bg-surface p-3 rounded-lg text-sm font-bold border-none outline-hidden text-gray-700 shadow-xs">{activeJars.map(j => (<option key={j.id} value={j.id}>{j.name}</option>))}</select>) : (<div className="text-sm text-red-500 font-bold p-2 bg-red-50 rounded-lg text-center">沒有進行中的存錢罐</div>)}</div></div><div className="flex gap-2"><button onClick={spin} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">重轉一次</button><button onClick={handleDeposit} disabled={activeJars.length === 0} className="flex-[2] py-3 bg-gray-900 text-surface rounded-xl font-bold text-sm shadow-lg disabled:opacity-50">確認存入</button></div></div>)}
          </div>
      </ModalLayout>
  );
};

export default RouletteModal;
