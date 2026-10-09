import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// 任何畫面在渲染時出錯，都顯示這個而不是整頁白掉；錯誤訊息直接印出來，方便截圖回報。
// 「重新載入」會先清掉 Service Worker 的快取，避免舊快取讓問題一直重現。
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('畫面錯誤', error, info?.componentStack);
  }

  reload = async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* 沒有 Cache API 就直接重新整理 */ }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${this.props.compact ? 'py-16' : 'min-h-screen bg-gray-50'}`}>
        <div className="bg-red-100 text-red-500 p-4 rounded-full"><AlertTriangle size={28} /></div>
        <h2 className="font-bold text-gray-800">畫面出了點問題</h2>
        <p className="text-xs text-gray-500 max-w-xs">資料都還在雲端，不會不見。按下面的按鈕重新載入；如果一直出現，請把這個畫面截圖回報。</p>
        <pre className="text-[10px] text-gray-400 bg-surface border border-gray-100 rounded-lg p-2 max-w-xs whitespace-pre-wrap break-all">{String(error?.message || error)}</pre>
        <button type="button" onClick={this.reload} className="px-5 py-2.5 bg-gray-900 text-surface rounded-xl text-sm font-bold flex items-center gap-2"><RefreshCw size={16} />重新載入</button>
      </div>
    );
  }
}
