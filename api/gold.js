// 這是運行在 Vercel 伺服器端的程式碼 (Node.js)
export default async function handler(req, res) {
  // 設定偽裝表頭
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
  };

  try {
    let currentPrice = 0;
    let history = [];
    
    // --- 階段一：嘗試從 HTML 網頁直接抓取「即時金價」 (最穩定) ---
    // 說明: 台銀可能會擋 CSV 下載，但通常不會擋一般網頁瀏覽
    try {
        const htmlResponse = await fetch('https://rate.bot.com.tw/gold?Lang=zh-TW', { headers });
        if (htmlResponse.ok) {
            const html = await htmlResponse.text();
            
            // 使用 Regex (正規表達式) 在 HTML 原始碼中尋找價格
            // 尋找包含 "1 公克" 的那一列
            const gramRowMatch = html.match(/1\s*公克.*?<\/tr>/s);
            
            if (gramRowMatch) {
                const rowHtml = gramRowMatch[0];
                // 在這一列中尋找所有的數字欄位 (>2,880<)
                // 台銀表格順序通常是: 買進, 賣出 (我們需要賣出，即第二個數字)
                const prices = rowHtml.match(/>([0-9,]+)<\/td>/g);
                
                if (prices && prices.length >= 2) {
                    // 移除 HTML 標籤和逗號，轉成數字
                    const rawPrice = prices[1].replace(/<[^>]+>/g, '').replace(/,/g, '');
                    currentPrice = parseFloat(rawPrice);
                }
            }
        }
    } catch (e) {
        console.error("HTML Scraping failed:", e);
    }

    // --- 階段二：嘗試從 CSV 抓取「歷史走勢」 ---
    try {
      const csvResponse = await fetch('https://rate.bot.com.tw/gold/csv/0', { headers });
      
      if (csvResponse.ok) {
          const csvText = await csvResponse.text();
          const rows = csvText.split('\n').filter(row => row.trim() !== '');
          const dataRows = rows.slice(1); 

          const parsedHistory = dataRows.map(row => {
            const columns = row.split(',');
            if (columns.length < 4) return null;
            const dateStr = columns[0].trim(); 
            const price = parseFloat(columns[3]); 
            
            if (!dateStr || isNaN(price)) return null;
            if (dateStr.length < 8) return null;
            
            const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            return {
              date: formattedDate,
              price: price,
              label: `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}`
            };
          }).filter(item => item !== null);

          if (parsedHistory.length > 0) {
              history = parsedHistory.reverse();
              // 如果剛剛 HTML 沒抓到，就用 CSV 最新的價格當作目前價格
              if (!currentPrice && history.length > 0) {
                  currentPrice = history[history.length - 1].price;
              }
          }
      }
    } catch (e) {
        console.warn("CSV Fetch failed:", e);
        // CSV 失敗是可以接受的，只要 HTML 成功，至少能顯示目前價格
    }

    // --- 最終檢查與資料補救 ---
    if (!currentPrice && history.length === 0) {
        throw new Error('All data sources failed (HTML & CSV)');
    }

    // 如果只有抓到目前價格 (HTML 成功)，但沒抓到歷史 (CSV 失敗)
    // 我們手動建立一個只有「今日」的歷史資料，避免前端圖表壞掉
    if (history.length === 0 && currentPrice) {
        const today = new Date();
        const dateStr = `${today.getMonth() + 1}/${today.getDate()}`;
        history = [{ 
            date: today.toISOString().split('T')[0], 
            price: currentPrice, 
            label: dateStr 
        }];
    }

    res.status(200).json({
      success: true,
      currentPrice,
      history
    });

  } catch (error) {
    console.error('Gold API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Unknown error",
      currentPrice: 2880, // 最後的 fallback
      history: []
    });
  }
}
