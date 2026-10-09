import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import { EVENT_COLORS, REPEATS } from '../lib/events.js';
import { WEEKDAYS, weekdayOf } from '../lib/calendar.js';

const OWNERS = [
  { id: 'shared', label: '共同', on: 'bg-purple-500 text-surface' },
  { id: 'bf', label: '男友', on: 'bg-blue-500 text-surface' },
  { id: 'gf', label: '女友', on: 'bg-pink-500 text-surface' },
];

// 新增／編輯行程。initialData 有 id＝編輯；occurrence＝從日曆點進來的那一天（重複事件刪單日用）
const EventModal = ({ initialData, defaultDate, occurrence, role, onClose, onSave, onDelete, onSkipDay }) => {
  const editing = !!initialData?.id;
  const [title, setTitle] = useState(initialData?.title || '');
  const [date, setDate] = useState(initialData?.date || defaultDate);
  const [allDay, setAllDay] = useState(!initialData?.time);
  const [time, setTime] = useState(initialData?.time || '09:00');
  const [owner, setOwner] = useState(initialData?.owner || (role === 'bf' || role === 'gf' ? role : 'shared'));
  const [color, setColor] = useState(initialData?.color || EVENT_COLORS[0].id);
  const [repeat, setRepeat] = useState(initialData?.repeat || 'none');
  const [until, setUntil] = useState(initialData?.until || '');
  const [note, setNote] = useState(initialData?.note || '');
  const valid = title.trim() && date;

  const handleSave = () => {
    if (!valid) return;
    onSave({
      title: title.trim(), date, time: allDay ? '' : time, owner, color, repeat,
      until: repeat === 'none' ? '' : until, note: note.trim(),
    });
  };

  const repeatHint = {
    weekly: `每週${WEEKDAYS[weekdayOf(date)]}`,
    monthly: `每月 ${Number(date.slice(8))} 號（沒有這天的月份跳過）`,
    yearly: `每年 ${Number(date.slice(5, 7))}/${Number(date.slice(8))}`,
  }[repeat];

  return (
    <ModalLayout title={editing ? '編輯行程' : '新增行程'} onClose={onClose}>
      <div className="space-y-4 pt-1">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="行程名稱（例如：休假、上班 7:00、看電影）" className="w-full bg-gray-50 rounded-xl p-3 text-base font-bold outline-hidden focus:ring-2 focus:ring-blue-100" autoFocus={!editing} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-50 rounded-xl px-2 py-2.5 text-sm font-bold outline-hidden" />
          </div>
          <div>
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 mb-1">
              時間
              <span className="flex items-center gap-1"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />整天</span>
            </label>
            <input type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} className="w-full bg-gray-50 rounded-xl px-2 py-2.5 text-sm font-bold outline-hidden disabled:opacity-40" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">誰的行程</label>
          <div className="flex bg-gray-100 rounded-xl p-1">
            {OWNERS.map((o) => (
              <button key={o.id} type="button" onClick={() => setOwner(o.id)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${owner === o.id ? o.on : 'text-gray-500'}`}>{o.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">顏色</label>
          <div className="flex gap-2.5">
            {EVENT_COLORS.map((c) => (
              <button key={c.id} type="button" aria-label={c.id} onClick={() => setColor(c.id)} className={`w-8 h-8 rounded-full transition-transform ${color === c.id ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : ''}`} style={{ backgroundColor: c.hex }} />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">重複</label>
          <div className="flex bg-gray-100 rounded-xl p-1">
            {REPEATS.map((r) => (
              <button key={r.id} type="button" onClick={() => setRepeat(r.id)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${repeat === r.id ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-500'}`}>{r.label}</button>
            ))}
          </div>
          {repeat !== 'none' && (
            <div className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-500">
              <span className="shrink-0">{repeatHint}，到</span>
              <input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} className="flex-1 min-w-0 bg-gray-50 rounded-lg px-2 py-1.5 outline-hidden" />
              {until ? <button type="button" onClick={() => setUntil('')} className="shrink-0 text-gray-400 underline">不限</button> : <span className="shrink-0 text-gray-400">（不限）</span>}
            </div>
          )}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（選填）" rows={2} className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-hidden resize-none" />

        <button type="button" onClick={handleSave} disabled={!valid} className="w-full py-3 bg-gray-900 text-surface rounded-xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform">{editing ? '儲存變更' : '新增行程'}</button>
        {editing && (initialData.repeat !== 'none' && occurrence ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onSkipDay(initialData.id, occurrence)} className="py-3 bg-red-50 text-red-500 rounded-xl font-bold text-sm">只刪 {Number(occurrence.slice(5, 7))}/{Number(occurrence.slice(8))} 這天</button>
            <button type="button" onClick={() => onDelete(initialData.id)} className="py-3 bg-red-50 text-red-500 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Trash2 size={14} />刪除整個重複</button>
          </div>
        ) : (
          <button type="button" onClick={() => onDelete(initialData.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2"><Trash2 size={16} />刪除行程</button>
        ))}
        {editing && initialData.repeat !== 'none' && <p className="text-[10px] text-gray-400 text-center">修改會套用到這個重複行程的每一天</p>}
      </div>
    </ModalLayout>
  );
};

export default EventModal;
