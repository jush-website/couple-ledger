import { useState, useMemo, useRef } from 'react';
import { Loader2, BarChart3, Scale, ChevronDown, ChevronUp, Moon, Coffee } from 'lucide-react';
import { formatMoney } from '../lib/format.js';

const svgPath = (points, command) => points.reduce((acc, point, i, a) => i === 0 ? `M ${point[0]},${point[1]}` : `${acc} ${command(point, i, a)}`, '');
const line = (pointA, pointB) => { const lengthX = pointB[0] - pointA[0]; const lengthY = pointB[1] - pointA[1]; return { length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)), angle: Math.atan2(lengthY, lengthX) }; }
const controlPoint = (current, previous, next, reverse) => { const p = previous || current; const n = next || current; const smoothing = 0.15; const o = line(p, n); const angle = o.angle + (reverse ? Math.PI : 0); const length = o.length * smoothing; const x = current[0] + Math.cos(angle) * length; const y = current[1] + Math.sin(angle) * length; return [x, y]; }
const bezierCommand = (point, i, a) => { const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point); const [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true); return `C ${cpsX.toFixed(2)},${cpsY.toFixed(2)} ${cpeX.toFixed(2)},${cpeY.toFixed(2)} ${point[0]},${point[1]}`; }

const GoldChart = ({ data, intraday, period, loading, isVisible, toggleVisibility, goldPrice, setPeriod }) => {
    const [hoverData, setHoverData] = useState(null);
    const containerRef = useRef(null);
    const chartData = useMemo(() => { if (period === '1d') return intraday && intraday.length > 0 ? intraday : []; if (!data || data.length === 0) return []; if (period === '10d') return data.slice(-10); if (period === '3m') return data.slice(-90); return data.slice(-10); }, [data, intraday, period]);
    const handleMouseMove = (e) => { if (!containerRef.current || chartData.length === 0) return; const rect = containerRef.current.getBoundingClientRect(); const x = e.clientX - rect.left; const width = rect.width; let index = Math.round((x / width) * (chartData.length - 1)); index = Math.max(0, Math.min(index, chartData.length - 1)); setHoverData({ index, item: chartData[index], xPos: (index / (chartData.length - 1)) * 100 }); };
    const handleMouseLeave = () => setHoverData(null);
    if (loading) return null; 
    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.999;
    const maxPrice = Math.max(...prices) * 1.001;
    const range = maxPrice - minPrice || 100;
    const getY = (price) => 100 - ((price - minPrice) / range) * 100;
    const getX = (index) => (index / (chartData.length - 1)) * 100;
    const points = chartData.map((d, i) => [getX(i), getY(d.price)]);
    const pathD = points.length > 1 ? svgPath(points, bezierCommand) : '';
    const fillPathD = points.length > 1 ? `${pathD} L 100,100 L 0,100 Z` : '';
    const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    const isMarketClosed = period === '1d' && isWeekend;

    return (
        <div className="bg-surface rounded-3xl shadow-xs border border-gray-100 overflow-hidden mb-4 transition-all duration-300 relative group">
            <div className="p-5 flex justify-between items-start cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={toggleVisibility}>
                <div><div className="flex items-center gap-2 mb-1.5">{isMarketClosed ? (<><div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div><span className="text-sm font-bold text-orange-500 flex items-center gap-1">休市中 <Moon size={12}/></span></>) : (<><div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div><span className="text-sm font-bold text-gray-400">賣出金價</span></>)}</div><div className="text-3xl font-black text-gray-800 tracking-tight">{formatMoney(goldPrice)} <span className="text-sm text-gray-400 font-normal">/克</span></div><div className="flex flex-wrap gap-2 mt-2"><div className="flex items-center gap-1 bg-yellow-50 border border-yellow-100 px-2 py-1 rounded-lg"><Scale size={10} className="text-yellow-600"/><span className="text-[10px] font-bold text-yellow-700">{formatMoney(goldPrice * 3.75)} /台錢</span></div><div className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg"><span className="text-[10px] font-bold text-gray-600">{formatMoney(goldPrice * 1000)} /公斤</span></div></div></div>
                <div className="flex flex-col items-end gap-3"><div className="flex bg-gray-100 rounded-lg p-1 shrink-0" onClick={(e) => e.stopPropagation()}>{['1d', '10d', '3m'].map(p => (<button type="button" key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${period === p ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400 hover:text-gray-600'}`}>{p === '1d' ? '即時' : (p === '10d' ? '近十日' : '近三月')}</button>))}</div>{isVisible ? <ChevronUp size={20} className="text-gray-300"/> : <ChevronDown size={20} className="text-gray-300"/>}</div>
            </div>
            {isVisible && (
                <div className="px-5 pb-5 animate-[fadeIn_0.3s]">
                    {loading ? (<div className="w-full h-48 flex items-center justify-center text-gray-400 text-xs"><Loader2 className="animate-spin mr-2" size={16}/> 正在取得金價數據...</div>) : (isMarketClosed) ? (<div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 gap-3 bg-gray-50/50 rounded-2xl border border-gray-100/50"><div className="bg-surface p-3 rounded-full shadow-xs"><Coffee size={24} className="text-orange-300"/></div><div className="text-center"><div className="text-xs font-bold text-gray-500">市場休市中</div><div className="text-[10px] text-gray-400 mt-1">顯示最後收盤價格</div></div></div>) : (!chartData || chartData.length === 0) ? (<div className="w-full h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2"><BarChart3 size={24} className="opacity-50"/><span>尚無足夠的歷史數據</span></div>) : (
                        <div className="w-full h-48 relative select-none mt-2" ref={containerRef} onMouseMove={handleMouseMove} onTouchMove={(e) => handleMouseMove(e.touches[0])} onMouseLeave={handleMouseLeave} onTouchEnd={handleMouseLeave}>
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible"><defs><linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eab308" stopOpacity="0.3" /><stop offset="100%" stopColor="#eab308" stopOpacity="0" /></linearGradient></defs><line x1="0" y1="0" x2="100" y2="0" stroke="var(--color-gray-100)" strokeWidth="0.5" strokeDasharray="2" /><line x1="0" y1="50" x2="100" y2="50" stroke="var(--color-gray-100)" strokeWidth="0.5" strokeDasharray="2" /><line x1="0" y1="100" x2="100" y2="100" stroke="var(--color-gray-100)" strokeWidth="0.5" strokeDasharray="2" /><path d={fillPathD} fill="url(#goldGradient)" /><path d={pathD} fill="none" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />{hoverData && (<g><line x1={hoverData.xPos} y1="0" x2={hoverData.xPos} y2="100" stroke="var(--color-gray-300)" strokeWidth="0.5" strokeDasharray="2" vectorEffect="non-scaling-stroke"/><circle cx={hoverData.xPos} cy={getY(hoverData.item.price)} r="2.5" fill="#eab308" stroke="white" strokeWidth="1.5"/></g>)}</svg>
                            <div className="absolute right-0 top-0 text-[8px] text-gray-300 font-bold -translate-y-1/2 bg-surface px-1">{formatMoney(maxPrice)}</div><div className="absolute right-0 bottom-0 text-[8px] text-gray-300 font-bold translate-y-1/2 bg-surface px-1">{formatMoney(minPrice)}</div>
                            {hoverData && (<div style={{ position: 'absolute', left: `${hoverData.xPos}%`, top: 0, transform: `translateX(${hoverData.xPos > 50 ? '-105%' : '5%'})`, pointerEvents: 'none' }} className="bg-gray-800/90 text-surface p-2 rounded-lg shadow-xl text-xs z-10 backdrop-blur-xs border border-surface/10"><div className="font-bold text-yellow-400 mb-0.5">{formatMoney(hoverData.item.price)}</div><div className="text-gray-300 text-[10px]">{hoverData.item.date} {hoverData.item.label !== hoverData.item.date ? hoverData.item.label : ''}</div></div>)}
                        </div>
                    )}
                    {chartData && chartData.length > 0 && (<div className="flex justify-between text-[10px] text-gray-400 mt-3 px-1 border-t border-gray-50 pt-2"><span>{chartData[0].label}</span>{chartData.length > 5 && <span>{chartData[Math.floor(chartData.length/2)].label}</span>}<span>{chartData[chartData.length - 1].label}</span></div>)}
                </div>
            )}
        </div>
    );
};

export default GoldChart;
