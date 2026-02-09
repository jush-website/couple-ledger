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
    
    // --- 階段一：嘗試從 HTML 網頁直接抓取「台銀即時金價」 (最準確) ---
    try {
        const htmlResponse = await fetch('https://rate.bot.com.tw/gold?Lang=zh-TW', { headers });
        if (htmlResponse.ok) {
            const html = await htmlResponse.text();
            const gramRowMatch = html.match(/1\s*公克.*?<\/tr>/s);
            if (gramRowMatch) {
                const rowHtml = gramRowMatch[0];
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

    // --- 階段二：嘗試從 CSV 抓取「歷史走勢」 ---
    if (currentPrice > 0) {
        // 只有在 HTML 成功時才嘗試抓 CSV 補歷史，不然直接跳到備援方案
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

    // --- 階段三：備援方案 (Yahoo Finance 國際金價換算) ---
    // 如果台銀完全抓不到資料 (HTML & CSV 都失敗)，改用國際金價換算
    if (!currentPrice && history.length === 0) {
        console.log("Switching to Strategy 3: Yahoo Finance Fallback");
        try {
            // 1. 抓取黃金期貨價格 (USD/盎司)
            // range=1mo (一個月)
            const goldRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1mo', { headers });
            // 2. 抓取匯率 (USD/TWD)
            const twdRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&range=1d', { headers });

            if (goldRes.ok && twdRes.ok) {
                const goldData = await goldRes.json();
                const twdData = await twdRes.json();

                const goldQuote = goldData.chart.result[0];
                const twdQuote = twdData.chart.result[0];

                const currentGoldUsd = goldQuote.meta.regularMarketPrice;
                const currentTwdRate = twdQuote.meta.regularMarketPrice;
                const ozToGram = 31.1034768;

                // 計算每克台幣價格 (含一些溢價緩衝，台銀賣出價通常比國際盤高一點，這裡加 1% 讓感覺更真實)
                const premium = 1.01; 
                currentPrice = Math.floor(((currentGoldUsd * currentTwdRate) / ozToGram) * premium);

                // 建構歷史資料
                const timestamps = goldQuote.timestamp;
                const prices = goldQuote.indicators.quote[0].close;
                
                if (timestamps && prices) {
                    history = timestamps.map((ts, i) => {
                        if (!prices[i]) return null;
                        // 使用當下匯率估算歷史價格 (雖不精確但足夠顯示趨勢)
                        const priceTwd = Math.floor(((prices[i] * currentTwdRate) / ozToGram) * premium);
                        const dateObj = new Date(ts * 1000);
                        return {
                            date: dateObj.toISOString().split('T')[0],
                            price: priceTwd,
                            label: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                        };
                    }).filter(x => x !== null);
                }
            }
        } catch (e) {
            console.error("Yahoo Finance Fallback failed:", e.message);
        }
    }

    // --- 最終檢查 ---
    if (!currentPrice) {
        throw new Error('All data sources failed (HTML, CSV, and Yahoo)');
    }

    // 如果有價格但沒歷史 (例如 Yahoo 抓歷史失敗)，補一個單點
    if (history.length === 0) {
        const today = new Date();
        history = [{ 
            date: today.toISOString().split('T')[0], 
            price: currentPrice, 
            label: `${today.getMonth() + 1}/${today.getDate()}` 
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
      currentPrice: 2880, 
      history: []
    });
  }
}
