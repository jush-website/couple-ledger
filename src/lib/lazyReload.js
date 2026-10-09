// 部署新版後，手機上還開著的舊頁面去抓「舊檔名」的分頁程式檔會失敗（伺服器上已經換成新檔名），
// 沒處理的話 React 整個停掉、變成白畫面。這裡遇到載入失敗就自動重新整理一次，拿到新版就好了。
// - 每個分頁階段（sessionStorage）只自動重整一次，真的壞掉時不會無限重新整理，改由 ErrorBoundary 顯示錯誤
// - 離線時不重整（重整也拿不到新檔案）
// - 只包 React.lazy 用的那份；背景預抓（prefetch）失敗不該把使用者正在用的畫面重新整理掉
const KEY = 'chunk-reload-tried';

export const withReload = (load) => () =>
  load()
    .then((mod) => {
      try { sessionStorage.removeItem(KEY); } catch { /* 無痕模式 */ }
      return mod;
    })
    .catch((err) => {
      let tried = false;
      try { tried = sessionStorage.getItem(KEY) === '1'; } catch { tried = true; }
      if (!tried && navigator.onLine) {
        try { sessionStorage.setItem(KEY, '1'); } catch { /* 無痕模式 */ }
        window.location.reload();
        return new Promise(() => {}); // 等重新整理，不要先丟錯
      }
      throw err;
    });
