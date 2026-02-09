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
    // 如果需要補足歷史資料 (CSV 可能只有一個月) 或台銀失敗，使用 Yahoo
    // 這裡我們強制檢查歷史資料長度，如果不夠長(少於 60 天)，就嘗試用 Yahoo 補完
    if (!currentPrice || history.length < 60) {
        console.log("Fetching Strategy 3: Yahoo Finance (for history extension)");
        try {
            // 改為 range=3mo 以支援三個月圖表
            const goldRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=3mo', { headers });
            const twdRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&range=1d', { headers });

            if (goldRes.ok && twdRes.ok) {
                const goldData = await goldRes.json();
                const twdData = await twdRes.json();

                const goldQuote = goldData.chart.result[0];
                const twdQuote = twdData.chart.result[0];

                const currentTwdRate = twdQuote.meta.regularMarketPrice;
                const ozToGram = 31.1034768;
                const premium = 1.01; 

                // 如果還沒有即時價格，才用 Yahoo 計算
                if (!currentPrice) {
                    const currentGoldUsd = goldQuote.meta.regularMarketPrice;
                    currentPrice = Math.floor(((currentGoldUsd * currentTwdRate) / ozToGram) * premium);
                }

                // 如果 CSV 歷史資料不足，使用 Yahoo 的資料
                if (history.length < 60) {
                    const timestamps = goldQuote.timestamp;
                    const prices = goldQuote.indicators.quote[0].close;
                    
                    if (timestamps && prices) {
                        history = timestamps.map((ts, i) => {
                            if (!prices[i]) return null;
                            const priceTwd = Math.floor(((prices[i] * currentTwdRate) / ozToGram) * premium);
                            const dateObj = new Date(ts * 1000);
                            const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                            const d = dateObj.getDate().toString().padStart(2, '0');
                            
                            return {
                                date: dateObj.toISOString().split('T')[0],
                                price: priceTwd,
                                label: `${m}/${d}`
                            };
                        }).filter(x => x !== null);
                    }
                }
            }
        } catch (e) {
            console.error("Yahoo Finance Fallback failed:", e.message);
        }
    }

    if (!currentPrice) {
        throw new Error('All data sources failed');
    }

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
