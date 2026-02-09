// 這是運行在 Vercel 伺服器端的程式碼 (Node.js)
// 它可以繞過瀏覽器的 CORS 限制去抓取台灣銀行的資料

export default async function handler(req, res) {
  try {
    // 台灣銀行黃金存摺歷史價格 CSV 下載連結
    // 網址: https://rate.bot.com.tw/gold/csv/0 (0 代表本月/最近資料)
    const targetUrl = 'https://rate.bot.com.tw/gold/csv/0';

    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch data from Bank of Taiwan');
    }

    const csvText = await response.text();
    
    // 解析 CSV (簡單處理)
    // 台銀 CSV 格式通常是: 日期(0), 幣別(1), 買進(2), 賣出(3)...
    // 我們需要的是 "本行賣出" (因為這是我們買黃金的價格)
    
    const rows = csvText.split('\n').filter(row => row.trim() !== '');
    // 移除第一行標題
    const dataRows = rows.slice(1);

    const history = dataRows.map(row => {
      const columns = row.split(',');
      // 日期格式通常是 YYYYMMDD
      const dateStr = columns[0]; 
      // 賣出價在第 4 欄 (索引 3)，有時候台銀格式會微調，通常賣出價比較高
      // columns[2] 是買進 (銀行跟你買), columns[3] 是賣出 (銀行賣給你)
      const price = parseFloat(columns[3]); 
      
      // 格式化日期 YYYYMMDD -> YYYY-MM-DD
      const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;

      return {
        date: formattedDate,
        price: price,
        label: `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}`
      };
    }).filter(item => !isNaN(item.price)); // 過濾掉無效數據

    // 反轉陣列，讓最新的在最後面 (符合圖表由左至右的時間軸)
    const sortedHistory = history.reverse();
    
    // 取得最新價格 (最後一筆)
    const currentPrice = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].price : 2880;

    // 回傳 JSON 給前端
    res.status(200).json({
      success: true,
      currentPrice,
      history: sortedHistory
    });

  } catch (error) {
    console.error('Gold API Error:', error);
    // 發生錯誤時回傳假資料或錯誤訊息，避免前端壞掉
    res.status(500).json({ 
      success: false, 
      error: error.message,
      currentPrice: 2880, // Fallback
      history: []
    });
  }
}