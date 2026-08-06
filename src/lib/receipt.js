// 實際呼叫模型的部分在 api/receipt.js（Vercel serverless），金鑰不會進前端。
// 回傳結構維持 { date, items: [{name, price, category}], total }。
export const analyzeReceiptImage = async (dataUrl) => {
    const response = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `辨識服務錯誤 (${response.status})`);
    }
    return data;
};
