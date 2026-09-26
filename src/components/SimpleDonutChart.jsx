import { formatMoney } from '../lib/format.js';

const SimpleDonutChart = ({ data, total }) => {
  if (!total || total === 0) return (<div className="h-64 w-full flex items-center justify-center"><div className="w-48 h-48 rounded-full border-4 border-gray-100 flex items-center justify-center"><span className="text-gray-300 font-bold text-sm">本月尚無數據</span></div></div>);
  // 每一段的起點＝前面所有段的百分比總和，先算好再畫，render 期間不修改變數
  const segments = data.reduce((acc, item) => {
    const percent = (item.value / total) * 100;
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].percent : 0;
    acc.push({ ...item, percent, start });
    return acc;
  }, []);
  return (
    <div className="relative w-64 h-64 mx-auto my-6">
      <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="var(--color-gray-100)" strokeWidth="5"></circle>
        {segments.map((item, index) => {
          const strokeDasharray = `${item.percent} ${100 - item.percent}`;
          const offset = 100 - item.start;
          return (<circle key={index} cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke={item.color} strokeWidth="5" strokeDasharray={strokeDasharray} strokeDashoffset={offset} className="transition-all duration-500 ease-out" />);
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-xs text-gray-400 font-bold uppercase tracking-wider">總支出</span><span className="text-2xl font-black text-gray-800">{formatMoney(total)}</span></div>
    </div>
  );
};

export default SimpleDonutChart;
