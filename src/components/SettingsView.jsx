import { useRef } from 'react';
import { LogOut, Check, Copy, Database, Download, UploadCloud, Palette } from 'lucide-react';
import { THEMES } from '../lib/theme.js';

const SettingsView = ({ role, coupleId, onLogout, onCopyCode, onExport, onImport, autoBackupTime, onRestoreAutoBackup, theme, onThemeChange }) => {
  const fileInputRef = useRef(null);

  return (
  <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
    <div className="bg-surface p-6 rounded-3xl shadow-xs border border-gray-100">
      <div className="flex items-center gap-4 mb-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${role === 'bf' ? 'bg-blue-100' : 'bg-pink-100'}`}>{role === 'bf' ? '👦' : '👧'}</div><div><h2 className="font-bold text-xl">{role === 'bf' ? '男朋友' : '女朋友'}</h2><p className="text-gray-400 text-sm">目前登入身分</p></div></div>
      
      <div className="bg-gray-50 p-4 rounded-2xl mb-6">
        <p className="text-xs font-bold text-gray-500 mb-2">你們的專屬配對碼</p>
        <div className="flex items-center gap-2">
            <input type="text" readOnly value={coupleId} id="pairing-code-input" className="flex-1 bg-surface p-3 rounded-xl border border-gray-200 text-sm font-mono text-gray-600 outline-hidden"/>
            <button onClick={onCopyCode} className="p-3 bg-gray-900 text-surface rounded-xl shadow-md active:scale-95 transition-transform"><Copy size={18}/></button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">將此代碼分享給另一半，讓對方加入這個空間。</p>
      </div>

      <div className="bg-gray-50 p-4 rounded-2xl mb-6">
          <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><Palette size={14}/> 外觀主題</p>
          <div className="grid grid-cols-2 gap-3">
              {THEMES.map(t => (
                  <button key={t.id} onClick={() => onThemeChange(t.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95 ${theme === t.id ? 'border-gray-800 bg-surface shadow-xs' : 'border-gray-200 bg-surface/60'}`}>
                      <div className="flex -space-x-1.5 shrink-0">
                          {t.swatch.map((c, i) => (
                              <span key={i} className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: c }} />
                          ))}
                      </div>
                      <span className="text-xs font-bold text-gray-700 truncate">{t.name}</span>
                      {theme === t.id && <Check size={14} className="text-gray-800 ml-auto shrink-0" />}
                  </button>
              ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">主題只儲存在這台裝置上，不會影響帳目資料。</p>
      </div>

      <div className="bg-gray-50 p-4 rounded-2xl mb-6">
          <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><Database size={14}/> 資料安全與備份</p>
          <div className="grid grid-cols-2 gap-3">
              <button onClick={onExport} className="flex flex-col items-center justify-center gap-2 bg-surface p-3 rounded-xl border border-gray-200 shadow-xs hover:border-blue-300 transition-all active:scale-95">
                  <Download size={20} className="text-blue-500" />
                  <span className="text-xs font-bold text-gray-700">下載備份檔</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 bg-surface p-3 rounded-xl border border-gray-200 shadow-xs hover:border-green-300 transition-all active:scale-95">
                  <UploadCloud size={20} className="text-green-500" />
                  <span className="text-xs font-bold text-gray-700">還原備份</span>
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={onImport} />
          </div>
          {autoBackupTime && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                  <div>
                      <div className="text-[10px] text-blue-500 font-bold mb-0.5">本機設備自動備份</div>
                      <div className="text-xs font-bold text-blue-700">{new Date(autoBackupTime).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <button onClick={onRestoreAutoBackup} className="px-3 py-1.5 bg-blue-600 text-surface text-xs font-bold rounded-lg shadow-xs active:scale-95 transition-transform">
                      一鍵還原
                  </button>
              </div>
          )}
          <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">Firebase 雲端很安全，但為防止您不小心誤刪，系統已開啟本機自動備份，您也可以定期下載 <b>.json</b> 備份檔。</p>
      </div>

      <button onClick={onLogout} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2"><LogOut size={18} /> 登出</button>
    </div>
  </div>
  );
};

export default SettingsView;
