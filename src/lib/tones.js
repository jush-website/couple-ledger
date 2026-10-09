// 預算等級與付款倒數的文字顏色（Tailwind class），總覽摘要卡與各元件共用。
// 獨立成檔是因為元件檔只能 export 元件（react-refresh 的規則）。
export const LEVEL_TEXT = { ok: 'text-green-600', warn: 'text-orange-500', over: 'text-red-500' };
export const DUE_TEXT = { late: 'text-red-500', soon: 'text-orange-500', normal: 'text-gray-400', none: 'text-gray-400' };
