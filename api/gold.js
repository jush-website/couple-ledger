// 這是運行在 Vercel 伺服器端的程式碼 (Node.js)
export default async function handler(req, res) {
  // 設定偽裝表頭，讓請求看起來像從瀏覽器發出
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://rate.bot.com.tw/gold', // 關鍵：告訴伺服器我們從哪裡來
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };

  // 輔助函式：嘗試抓取資料
  const fetchData = async (url) => {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  };

  try {
    let csvText = '';
    
    // 策略 1: 嘗試抓取標準 "當月" 端點 (/csv/0)
    try {
      csvText = await fetchData('https://rate.bot.com.tw/gold/csv/0');
    } catch (e) {
      console.warn('Strategy 1 failed, trying Strategy 2 (YYYYMM)...', e.message);
      
      // 策略 2: 如果失敗 (例如 404)，嘗試直接抓取 "指定月份" (例如 /csv/202402)
      const now = new Date();
      // 調整時區至台灣時間 (UTC+8) 以確保月份正確
      const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); 
      const year = twTime.getUTCFullYear();
      const month = (twTime.getUTCMonth() + 1).toString().padStart(2, '0');
      const yyyymm = `${year}${month}`;
      
      csvText = await fetchData(`https://rate.bot.com.tw/gold/csv/${yyyymm}`);
    }

    // 解析 CSV
    const rows = csvText.split('\n').filter(row => row.trim() !== '');
    // 移除第一行標題
    const dataRows = rows.slice(1); 

    const history = dataRows.map(row => {
      const columns = row.split(',');
      if (columns.length < 4) return null;

      // 清理日期欄位 (移除可能存在的隱藏字元 BOM)
      const dateStr = columns[0].trim(); 
      // 賣出價通常在 columns[3] (本行賣出)
      const price = parseFloat(columns[3]); 
      
      if (!dateStr || isNaN(price)) return null;

      // 格式化日期 YYYYMMDD -> YYYY-MM-DD
      if (dateStr.length < 8) return null;
      const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;

      return {
        date: formattedDate,
        price: price,
        label: `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}`
      };
    }).filter(item => item !== null);

    // 確保有資料
    if (history.length === 0) {
        console.warn('Parsed gold data is empty');
        // 回傳預設值避免前端崩潰
        return res.status(200).json({
            success: true,
            currentPrice: 2880, 
            history: [] 
        });
    }

    const sortedHistory = history.reverse();
    const currentPrice = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].price : 2880;

    res.status(200).json({
      success: true,
      currentPrice,
      history: sortedHistory
    });

  } catch (error) {
    console.error('Gold API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      currentPrice: 2880, 
      history: []
    });
  }
}
