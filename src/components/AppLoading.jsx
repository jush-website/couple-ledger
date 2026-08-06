import { Heart } from 'lucide-react';


// 原本整段寫成 inline style，是為了在 Tailwind CDN 載入前也有樣式。
// 現在 Tailwind 是打包進 CSS 的，第一次繪製就有樣式，改回 class 才吃得到主題。
const AppLoading = () => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-linear-to-br from-pink-50 to-blue-50">
    <div className="bg-surface p-6 rounded-full shadow-xl mb-5">
      <Heart className="text-pink-500 animate-pulse" size={32} />
    </div>
    <h2 className="text-2xl font-bold text-gray-700 tracking-[0.1em]">載入中...</h2>
    <p className="text-gray-400 text-sm mt-2">正在同步我們的小金庫</p>
  </div>
);

export default AppLoading;
