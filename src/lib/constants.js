// 分類色是圖表用的資料色，跟主題無關，所以維持寫死。
export const CATEGORIES = [
  { id: 'food', name: '餐飲', color: '#FF8042' },
  { id: 'transport', name: '交通', color: '#00C49F' },
  { id: 'entertainment', name: '娛樂', color: '#FFBB28' },
  { id: 'shopping', name: '購物', color: '#0088FE' },
  { id: 'house', name: '居家', color: '#8884d8' },
  { id: 'travel', name: '旅遊', color: '#FF6B6B' },
  { id: 'other', name: '其他', color: '#999' },
];


// 備份／還原涵蓋的集合。順序有意義：books 先還原，交易才找得到所屬帳本。
// events / anniversaries 是後來加的：舊備份檔裡沒有這兩個，還原時會整個跳過、不會被清空。
export const BACKUP_COLLECTIONS = ['books', 'transactions', 'savings_jars', 'gold_transactions', 'events', 'anniversaries'];
