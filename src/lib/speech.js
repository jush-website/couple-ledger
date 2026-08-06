// 瀏覽器內建的聽寫。Chrome / Edge / Safari 都是 webkit 前綴，Firefox 目前沒有。
// 不支援時記帳頁的麥克風按鈕會整個不顯示，鍵盤輸入照舊。
export const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export const isVoiceSupported = () => Boolean(SpeechRecognition);
