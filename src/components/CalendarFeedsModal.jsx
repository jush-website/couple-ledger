import { useState } from 'react';
import { Trash2, Loader2, Link2, ChevronDown, AlertCircle, CheckCircle } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import { EVENT_COLORS, colorHex } from '../lib/events.js';
import { fetchFeedEvents } from '../lib/icalFeed.js';
import { todayYmd, addDays } from '../lib/calendar.js';

const OWNERS = [
  { id: 'bf', label: '男友的', on: 'bg-blue-500 text-surface' },
  { id: 'gf', label: '女友的', on: 'bg-pink-500 text-surface' },
  { id: 'shared', label: '共同', on: 'bg-purple-500 text-surface' },
];
const OWNER_LABEL = { bf: '男友', gf: '女友', shared: '共同' };

// 連結 Google 日曆：貼上「iCal 格式的私人網址」，兩個人的日曆都會顯示（唯讀）
const CalendarFeedsModal = ({ feeds, errors, role, onClose, onSave, onDelete }) => {
  const [adding, setAdding] = useState(feeds.length === 0);
  const [showHelp, setShowHelp] = useState(feeds.length === 0);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [owner, setOwner] = useState(role === 'bf' || role === 'gf' ? role : 'shared');
  const [color, setColor] = useState('blue');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');

  // 先實際讀一次，網址錯了當場告訴使用者，不要存一個讀不到的日曆
  const handleAdd = async () => {
    setTesting(true); setTestError('');
    try {
      const today = todayYmd();
      const data = await fetchFeedEvents({ url: url.trim() }, today, addDays(today, 60));
      onSave({ name: name.trim() || data.calendarName || 'Google 日曆', url: url.trim(), owner, color });
      setAdding(false); setName(''); setUrl('');
    } catch (e) {
      setTestError(e.message || '讀取失敗');
    } finally {
      setTesting(false);
    }
  };

  return (
    <ModalLayout title="連結 Google 日曆" onClose={onClose}>
      <div className="space-y-4 pt-1">
        <p className="text-[11px] text-gray-500">連結後，Google 日曆的行程會顯示在這裡，<b>你們兩個人都看得到</b>。只能看、不能改；要修改請到 Google 日曆，大約 5 分鐘內會同步過來。</p>

        {feeds.length > 0 && (
          <div className="space-y-2">
            {feeds.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorHex(f.color) }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-gray-800 truncate">{f.name}</div>
                  <div className={`text-[11px] truncate ${errors[f.id] ? 'text-red-500' : 'text-gray-400'}`}>{errors[f.id] || `${OWNER_LABEL[f.owner]}的行程`}</div>
                </div>
                <button type="button" onClick={() => onDelete(f.id)} aria-label="取消連結" className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="space-y-3 p-3 rounded-xl border-2 border-gray-100">
            <button type="button" onClick={() => setShowHelp(!showHelp)} className="w-full flex items-center justify-between text-xs font-bold text-gray-600">
              怎麼找到私人網址？<ChevronDown size={14} className={`transition-transform ${showHelp ? 'rotate-180' : ''}`} />
            </button>
            {showHelp && (
              <ol className="text-[11px] text-gray-500 space-y-1 list-decimal pl-4 bg-gray-50 rounded-lg p-3">
                <li>用電腦（或手機瀏覽器切換成「電腦版網站」）打開 <b>calendar.google.com</b>。手機的 Google 日曆 App 沒有這個選項。</li>
                <li>右上角齒輪 →「設定」→ 左邊「我的日曆的設定」點你要分享的日曆。</li>
                <li>往下找到「整合日曆」→ 複製「<b>iCal 格式的私人網址</b>」（.ics 結尾）。</li>
                <li>貼到下面。這個網址等於日曆的鑰匙，不要傳給別人；外流的話可以在同一個地方按「重設」。</li>
              </ol>
            )}
            <input type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setTestError(''); }} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className="w-full bg-gray-50 rounded-xl p-3 text-xs font-mono outline-hidden focus:ring-2 focus:ring-blue-100" />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="名稱（選填，例如：我的班表）" className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold outline-hidden" />
            <div className="flex bg-gray-100 rounded-xl p-1">
              {OWNERS.map((o) => (
                <button key={o.id} type="button" onClick={() => setOwner(o.id)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${owner === o.id ? o.on : 'text-gray-500'}`}>{o.label}</button>
              ))}
            </div>
            <div className="flex gap-2.5">
              {EVENT_COLORS.map((c) => (
                <button key={c.id} type="button" aria-label={c.id} onClick={() => setColor(c.id)} className={`w-7 h-7 rounded-full ${color === c.id ? 'ring-2 ring-offset-2 ring-gray-800' : ''}`} style={{ backgroundColor: c.hex }} />
              ))}
            </div>
            {testError && <div className="flex items-start gap-1.5 text-xs font-bold text-red-500 bg-red-50 rounded-lg p-2"><AlertCircle size={14} className="shrink-0 mt-px" />{testError}</div>}
            <button type="button" onClick={handleAdd} disabled={!url.trim() || testing} className="w-full py-3 bg-gray-900 text-surface rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {testing ? <><Loader2 size={16} className="animate-spin" />讀取中…</> : <><CheckCircle size={16} />連結這個日曆</>}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 flex items-center justify-center gap-1.5"><Link2 size={16} />再連結一個日曆</button>
        )}
      </div>
    </ModalLayout>
  );
};

export default CalendarFeedsModal;
