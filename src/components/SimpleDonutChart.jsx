import { formatMoney } from '../lib/format.js';

const SimpleDonutChart = ({ data, total }) => {
  if (!total || total === 0) return (<div className="h-64 w-full flex items-center justify-center"><div className="w-48 h-48 rounded-full border-4 border-gray-100 flex items-center justify-center"><span className="text-gray-300 font-bold text-sm">本月尚無數據</span></div></div>);
  let accumulatedPercent = 0;
  return (
    <div className="relative w-64 h-64 mx-auto my-6">
      <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="var(--color-gray-100)" strokeWidth="5"></circle>
        {data.map((item, index) => {
          const percent = (item.value / total) * 100;
          const strokeDasharray = `${percent} ${100 - percent}`;
          const offset = 100 - accumulatedPercent; 
          accumulatedPercent += percent;
          return (<circle key={index} cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke={item.color} strokeWidth="5" strokeDasharray={strokeDasharray} strokeDashoffset={offset} className="transition-all duration-500 ease-out" />);
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-xs text-gray-400 font-bold uppercase tracking-wider">總支出</span><span className="text-2xl font-black text-gray-800">{formatMoney(total)}</span></div>
    </div>
  );
};

export default SimpleDonutChart;
