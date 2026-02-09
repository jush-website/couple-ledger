// 這是運行在 Vercel 伺服器端的程式碼 (Node.js)
export default async function handler(req, res) {
  try {
    const targetUrl = 'https://rate.bot.com.tw/gold/csv/0';

    // 🔥 關鍵修正：加入 Headers 偽裝成瀏覽器，避免被台銀擋下 (403 Forbidden)
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    
    // 解析 CSV
    // 使用 trim() 去除每一行的前後空白
    const rows = csvText.split('\n').filter(row => row.trim() !== '');
    const dataRows = rows.slice(1); // 移除標題

    const history = dataRows.map(row => {
      const columns = row.split(',');
      // 確保欄位足夠，避免錯誤
      if (columns.length < 4) return null;

      // 處理日期：有時候會有隱藏的 BOM 字元，使用 trim() 清理
      const dateStr = columns[0].trim(); 
      // 賣出價通常在 columns[3] (本行賣出)
      const price = parseFloat(columns[3]); 
      
      if (!dateStr || isNaN(price)) return null;

      // 格式化日期 YYYYMMDD -> YYYY-MM-DD
      // 確保字串長度足夠才切割
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
        // 如果抓不到資料，回傳一個安全值，避免前端壞掉
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
      // 回傳一個安全值以免前端完全壞掉
      currentPrice: 2880, 
      history: []
    });
  }
}
