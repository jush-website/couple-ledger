// 這是運行在 Vercel 伺服器端的程式碼 (Node.js)
export default async function handler(req, res) {
  // 設定偽裝表頭，避免被防火牆擋下
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
  };

  try {
    let currentPrice = 0;
    let history = [];
    let intraday = []; // 用於存放當天即時走勢 (15分鐘一盤)
    
    // --- 階段一：從 HTML 網頁抓取「台銀即時金價」 (最準確的當下價格) ---
    try {
        const htmlResponse = await fetch('https://rate.bot.com.tw/gold?Lang=zh-TW', { headers });
        if (htmlResponse.ok) {
            const html = await htmlResponse.text();
            // 尋找包含 "1 公克" 的那一列
            const gramRowMatch = html.match(/1\s*公克.*?<\/tr>/s);
            if (gramRowMatch) {
                const rowHtml = gramRowMatch[0];
                // 抓取本行賣出價 (通常是第二個數字)
                const prices = rowHtml.match(/>([0-9,]+)<\/td>/g);
                if (prices && prices.length >= 2) {
                    const rawPrice = prices[1].replace(/<[^>]+>/g, '').replace(/,/g, '');
                    currentPrice = parseFloat(rawPrice);
                }
            }
        }
    } catch (e) {
        console.warn("HTML Scraping failed:", e.message);
    }

    // --- 階段二：從 CSV 抓取「歷史日線走勢」 ---
    // 只有在確認網站存活 (HTML 成功) 後才嘗試抓 CSV，避免被連續阻擋
    if (currentPrice > 0) {
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
                    if (!dateStr || isNaN(price) || dateStr.length < 8) return null;
                    const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
                    return {
                        date: formattedDate,
                        price: price,
                        label: `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}`
                    };
                }).filter(item => item !== null);

                if (parsedHistory.length > 0) {
                    history = parsedHistory.reverse();
                }
            }
        } catch (e) {
            console.warn("CSV Fetch failed:", e.message);
        }
    }

    // --- 階段三：抓取 Yahoo Finance 取得「當天即時走勢」 (Intraday) ---
    // 台銀不提供分鐘級 API，我們抓國際金價 (GC=F) 配合 匯率 (TWD=X) 來模擬走勢
    try {
        // range=1d (一天), interval=15m (每15分鐘一點)
        const yahooGoldUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=15m&range=1d';
        const yahooTwdUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&range=1d'; 

        const [gRes, tRes] = await Promise.all([
            fetch(yahooGoldUrl, { headers }),
            fetch(yahooTwdUrl, { headers })
        ]);

        if (gRes.ok && tRes.ok) {
            const gData = await gRes.json();
            const tData = await tRes.json();
            
            const quote = gData.chart.result[0];
            const timestamps = quote.timestamp;
            const prices = quote.indicators.quote[0].close;
            
            // 取得今日即時匯率
            const twdRate = tData.chart.result[0].meta.regularMarketPrice;
            const ozToGram = 31.1034768; // 1 盎司 = 31.1035 克
            
            if (timestamps && prices) {
                 // 計算校正參數 (Scaler)
                 // 台銀賣出價包含手續費與溢價，通常比 (國際金價 * 匯率) 高
                 // 我們計算目前的價差倍率，並套用到整條走勢線上，讓圖表數值接近台銀掛牌價
                 let scaler = 1.0;
                 
                 // 找出 Yahoo 最後一筆有效價格 (目前的理論價格)
                 const validPrices = prices.filter(p => p);
                 const lastRawPrice = validPrices.length > 0 ? validPrices[validPrices.length-1] : 0;
                 const lastYahooPriceTwd = (lastRawPrice * twdRate) / ozToGram;
                 
                 if (currentPrice && lastYahooPriceTwd) {
                     scaler = currentPrice / lastYahooPriceTwd;
                 } else {
                     scaler = 1.02; // 如果沒抓到台銀價格，預設溢價 2%
                     // 如果階段一失敗，就用算的當作 Current Price
                     if (!currentPrice) currentPrice = Math.floor(lastYahooPriceTwd * scaler);
                 }

                 intraday = timestamps.map((ts, i) => {
                     if (!prices[i]) return null;
                     // 公式: (美金金價 * 匯率 / 31.1035) * 校正參數
                     const p = ((prices[i] * twdRate) / ozToGram) * scaler;
                     const d = new Date(ts * 1000);
                     // 轉為台灣時間 (UTC+8) 的小時:分鐘
                     const timeStr = d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
                     
                     return {
                         date: d.toISOString(),
                         price: Math.floor(p),
                         label: timeStr
                     };
                 }).filter(x => x !== null);
            }
        }
    } catch (e) {
        console.error("Intraday fetch failed", e);
    }

    // --- 備援機制：如果歷史資料還是空的 (例如台銀 CSV 完全掛點)，用 Yahoo 補歷史日線 ---
    if (history.length < 5) {
         try {
            // 抓 3 個月歷史
            const yHistRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=3mo', { headers });
            if (yHistRes.ok) {
                const yData = await yHistRes.json();
                const quotes = yData.chart.result[0];
                // 這裡簡化計算，假設匯率固定為 32 (因為抓不到每天的歷史匯率，僅作備援顯示趨勢用)
                const estTwdRate = 32.5; 
                const premium = 1.02;
                
                if (quotes.timestamp && quotes.indicators.quote[0].close) {
                    history = quotes.timestamp.map((ts, i) => {
                        const p = quotes.indicators.quote[0].close[i];
                        if (!p) return null;
                        const priceTwd = Math.floor(((p * estTwdRate) / 31.1034768) * premium);
                        const d = new Date(ts * 1000);
                        return {
                            date: d.toISOString().split('T')[0],
                            price: priceTwd,
                            label: `${d.getMonth()+1}/${d.getDate()}`
                        };
                    }).filter(x => x !== null);
                }
            }
         } catch (e) {
             console.error("History fallback failed", e);
         }
         
         // 如果真的全都空，補一個單點避免前端壞掉
         if (!currentPrice) currentPrice = 2880; 
         if (history.length === 0) history = [{ date: new Date().toISOString().split('T')[0], price: currentPrice, label: 'Today' }];
    }

    res.status(200).json({
      success: true,
      currentPrice,
      history,
      intraday // 回傳這個新欄位給前端畫分時圖
    });

  } catch (error) {
    console.error('Gold API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Unknown error",
      currentPrice: 2880, 
      history: [],
      intraday: []
    });
  }
}
