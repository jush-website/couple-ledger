// 金額／重量格式化、計算機字串求值、分帳金額、圖片壓縮。
// 都是純函式，不依賴 React 或 Firebase。

// Intl.NumberFormat 建構成本很高，列表每一列都會呼叫好幾次，所以建一次重複用。
const moneyFmt = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
const fixedFmt = (digits) => new Intl.NumberFormat('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const weightFmt = {
  tw_qian: { fmt: fixedFmt(2), divisor: 3.75, suffix: '錢' },
  tw_liang: { fmt: fixedFmt(3), divisor: 37.5, suffix: '兩' },
  kg: { fmt: fixedFmt(4), divisor: 1000, suffix: '公斤' },
  g: { fmt: fixedFmt(2), divisor: 1, suffix: '克' },
};

export const formatMoney = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '$0';
  return moneyFmt.format(num);
};

export const formatWeight = (grams, unit = 'g') => {
    const num = Number(grams);
    if (isNaN(num)) return '0.00';
    const { fmt, divisor, suffix } = weightFmt[unit] || weightFmt.g;
    return fmt.format(num / divisor) + suffix;
};

export const safeCalculate = (expression) => {
  try {
    const sanitized = (expression || '').toString().replace(/[^0-9+\-*/.]/g, '');
    if (!sanitized) return '';
    const parts = sanitized.split(/([+\-*/])/).filter(p => p.trim() !== '');
    if (parts.length === 0) return '';
    let tokens = [...parts];
    for (let i = 1; i < tokens.length - 1; i += 2) {
      if (tokens[i] === '*' || tokens[i] === '/') {
        const prev = parseFloat(tokens[i-1]);
        const next = parseFloat(tokens[i+1]);
        const op = tokens[i];
        let res = 0;
        if (op === '*') res = prev * next;
        if (op === '/') res = prev / next;
        tokens.splice(i-1, 3, res);
        i -= 2;
      }
    }
    let result = parseFloat(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const next = parseFloat(tokens[i+1]);
      if (op === '+') result += next;
      if (op === '-') result -= next;
    }
    return isNaN(result) || !isFinite(result) ? '' : result.toString();
  } catch {
    return '';
  }
};

export const calculateExpense = (t) => {
  const amt = Number(t.amount) || 0;
  let bf = 0, gf = 0;
  if (t.category === 'repayment') return { bf: 0, gf: 0 }; 
  if (t.splitType === 'shared') {
    bf = amt / 2; gf = amt / 2;
  } else if (t.splitType === 'bf_personal') {
    bf = amt; gf = 0;
  } else if (t.splitType === 'gf_personal') {
    bf = 0; gf = amt;
  } else if ((t.splitType === 'custom' || t.splitType === 'ratio') && t.splitDetails) {
    bf = Number(t.splitDetails.bf) || 0; gf = Number(t.splitDetails.gf) || 0;
  } else {
    bf = amt / 2; gf = amt / 2;
  }
  return { bf, gf };
};

export const compressImage = (base64Str, maxWidth = 800, quality = 0.6) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64Str);
    });
};

// 壓到指定位元組數以下再送去辨識 —— NVIDIA NIM 的內嵌圖片有大小上限，
// 原尺寸的手機照片一定超標。收據要看得清字，所以先降品質、真的不行才縮尺寸。
export const compressForOcr = async (base64Str, maxBytes = 170 * 1024) => {
    const sizeOf = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
    const steps = [[1600, 0.8], [1280, 0.7], [1024, 0.6], [800, 0.5]];
    let out = base64Str;
    for (const [width, quality] of steps) {
        out = await compressImage(base64Str, width, quality);
        if (sizeOf(out) <= maxBytes) return out;
    }
    return out; // 還是超標就照送，讓後端回明確的「圖片太大」訊息
};
