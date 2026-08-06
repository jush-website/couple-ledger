import { useEffect, useState } from 'react';

// 色票只用來畫設定頁的預覽圓點，真正的配色在 src/index.css 的 [data-theme] 區塊
export const THEMES = [
  { id: 'classic', name: '經典藍粉', swatch: ['#2563eb', '#ec4899', '#ffffff'] },
  { id: 'cream', name: '暖奶油', swatch: ['#3f6a4c', '#d06c46', '#fffdf8'] },
  { id: 'morandi', name: '莫蘭迪', swatch: ['#4e6274', '#9a7070', '#fbfbfa'] },
  { id: 'night', name: '暗夜', swatch: ['#74acf7', '#e46aae', '#1b1f27'] },
];

const STORAGE_KEY = 'couple-ledger-theme';
const DEFAULT_THEME = 'classic';

// ponytail: 主題存 localStorage 而非 Firestore — 資料格式不能動，而且主題本來就該跟裝置走
export const readStoredTheme = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const applyTheme = (id) => {
  document.documentElement.dataset.theme = id;
};

export const useTheme = () => {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* 無痕模式等寫不進去就算了，畫面還是會套用 */
    }
  }, [theme]);

  return [theme, setTheme];
};
