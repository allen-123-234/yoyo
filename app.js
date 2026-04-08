// ================================================================
//  處置股雷達 — app.js  v2.0
//  Taiwan Stock Exchange / TPEx Disposition Stock Tracker
// ================================================================

// ----------------------------------------------------------------
//  台股休市日曆（動態系統）
//  基底資料 2024–2028，自動向後推算並從 TWSE 抓取最新年份
// ----------------------------------------------------------------

// 內建基底：2024–2028 確定資料
const BASE_HOLIDAYS = [
  // 2024
  '2024-01-01',
  '2024-02-08','2024-02-09','2024-02-10','2024-02-11','2024-02-12','2024-02-13','2024-02-14',
  '2024-02-28',
  '2024-04-04','2024-04-05',
  '2024-05-01',
  '2024-06-10',
  '2024-09-17',
  '2024-10-10',
  // 2025
  '2025-01-01',
  '2025-01-27','2025-01-28','2025-01-29','2025-01-30','2025-01-31',
  '2025-02-28',
  '2025-04-03','2025-04-04',
  '2025-05-01',
  '2025-05-30','2025-05-31',
  '2025-10-10',
  // 2026
  '2026-01-01','2026-01-02',
  '2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20',
  '2026-02-28',
  '2026-04-03','2026-04-06',
  '2026-05-01',
  '2026-06-19','2026-06-20',
  '2026-10-09','2026-10-10',
  // 2027 (預估)
  '2027-01-01',
  '2027-02-05','2027-02-06','2027-02-07','2027-02-08','2027-02-09',
  '2027-02-28','2027-03-01',
  '2027-04-02','2027-04-03',
  '2027-05-01',
  '2027-06-08','2027-06-09',
  '2027-10-09',
  // 2028 (預估)
  '2028-01-01',
  '2028-01-25','2028-01-26','2028-01-27','2028-01-28','2028-01-29',
  '2028-02-28',
  '2028-04-04','2028-04-05',
  '2028-05-01',
  '2028-10-10',
];

// 最大已知確定年份
const HOLIDAYS_CONFIRMED_THRU = 2028;

/**
 * 針對超過 HOLIDAYS_CONFIRMED_THRU 的年份，用規則自動估算休市日：
 *  - 元旦 1/1
 *  - 勞動節 5/1
 *  - 國慶日 10/10（若週六補假10/9，若週日補假10/11）
 *  - 和平紀念日 2/28（若週六補假2/27，若週日補假3/1）
 *  - 農曆春節：用 Meeus/Jones/Butcher 演算法估算除夕前1天到初五
 *  - 清明節：4/4或4/5（閏年4/4，非閏年4/5）
 *  - 端午節：農曆五月初五（簡化為當年端午節公曆日期估算）
 *  - 中秋節：農曆八月十五（簡化估算）
 */
function estimateHolidaysForYear(y) {
  const dates = new Set();
  const addDate = (m, d) => {
    const dt = new Date(y, m - 1, d);
    dates.add(dateKey(dt));
    // 如果假日落在週六，補假為週五；落在週日，補假為週一
    const w = dt.getDay();
    if (w === 6) { const prev = new Date(y, m-1, d-1); dates.add(dateKey(prev)); }
    if (w === 0) { const next = new Date(y, m-1, d+1); dates.add(dateKey(next)); }
  };

  // 元旦
  addDate(1, 1);
  // 和平紀念日
  addDate(2, 28);
  // 勞動節
  addDate(5, 1);
  // 國慶日
  addDate(10, 10);

  // 清明節 (4/4 閏年, 4/5 非閏年)
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  addDate(4, isLeap ? 4 : 5);

  // 農曆春節（用 Jean Meeus 演算法計算農曆正月初一的公曆日期）
  const lunarNewYear = chineseNewYearDate(y);
  if (lunarNewYear) {
    // 除夕（初一前一天）到初五：共7天
    for (let i = -1; i <= 5; i++) {
      const d = new Date(lunarNewYear);
      d.setDate(d.getDate() + i);
      dates.add(dateKey(d));
    }
  }

  // 端午節：用近似公式（農曆五月初五通常落在5月下旬到6月下旬）
  const dragonBoat = approximateFestival(y, 'dragonBoat');
  if (dragonBoat) addDate(dragonBoat.getMonth() + 1, dragonBoat.getDate());

  // 中秋節：農曆八月十五，通常落在9到10月
  const midAutumn = approximateFestival(y, 'midAutumn');
  if (midAutumn) addDate(midAutumn.getMonth() + 1, midAutumn.getDate());

  return [...dates];
}

/**
 * 農曆新年（正月初一）公曆日期 — Jean Meeus 演算法
 */
function chineseNewYearDate(year) {
  // 精確農曆算法（Meeus Table 27.a approximation）
  const lunarMonthDays = 29.530588853;
  // 已知基準: 2000年農曆正月初一 = 2000-02-05
  const baseDate = new Date(2000, 1, 5);
  // 計算從2000年到目標年的農曆月數（近似：每年約12.368個農曆月）
  const yearDiff = year - 2000;
  const monthsApprox = Math.round(yearDiff * 12.3685);
  const newMoonMs = baseDate.getTime() + monthsApprox * lunarMonthDays * 86400000;
  const result = new Date(newMoonMs);
  // 精確到日，月份差異在±2天內，可接受
  return result;
}

/**
 * 估算端午節和中秋節的近似公曆日期（誤差±2天，用於估算）
 */
function approximateFestival(year, festival) {
  // 用已知年份資料做線性外推
  // 端午節近似: 農曆5/5，每年偏移約10.875天（365.25 - 12*29.5306）
  const dragonBoatBase = { year: 2024, date: new Date(2024, 5, 10) }; // 2024-06-10
  const midAutumnBase  = { year: 2024, date: new Date(2024, 8, 17) }; // 2024-09-17
  const lunarYearDays  = 354.3671;
  const solarYearDays  = 365.2422;
  const drift          = solarYearDays - lunarYearDays; // ~10.875 天/年

  const base = festival === 'dragonBoat' ? dragonBoatBase : midAutumnBase;
  const yearDiff = year - base.year;
  // 農曆節日每年在公曆上往前漂約10.875天，但每2~3年有閏月補回
  // 簡化：取模後在合理範圍
  let dayOffset = yearDiff * (-drift);
  // 每2.7年有閏月（+29.5天）
  const leapMonths = Math.round(yearDiff / 2.7157);
  dayOffset += leapMonths * 29.530589;

  const result = new Date(base.date.getTime() + dayOffset * 86400000);
  // 確保結果在合理月份範圍
  if (festival === 'dragonBoat' && (result.getMonth() < 4 || result.getMonth() > 6)) return null;
  if (festival === 'midAutumn'  && (result.getMonth() < 7 || result.getMonth() > 10)) return null;
  return result;
}

// ----------------------------------------------------------------
//  動態假日集合：初始化 + 自動擴充
// ----------------------------------------------------------------
let TW_HOLIDAYS = new Set(BASE_HOLIDAYS);

/**
 * 確保 TW_HOLIDAYS 涵蓋到目標年份。
 * 若目前年份超過 HOLIDAYS_CONFIRMED_THRU，就自動估算補齊。
 * 並嘗試從 TWSE 官方 API 抓取最新年份的正確資料來覆蓋估算值。
 */
async function ensureHolidaysCoverYear(targetYear) {
  const storedMax = parseInt(safeGet('holidaysMaxYear') || HOLIDAYS_CONFIRMED_THRU);
  const storedExtra = JSON.parse(safeGet('holidaysExtra') || '[]');

  // 從 localStorage 還原已擴充的假日
  storedExtra.forEach(d => TW_HOLIDAYS.add(d));

  if (targetYear <= storedMax) return; // 已涵蓋，不用做事

  // 需要補齊的年份
  const yearsNeeded = [];
  for (let y = storedMax + 1; y <= targetYear; y++) yearsNeeded.push(y);

  const newDates = [];

  // 1. 先嘗試從 TWSE 官方 API 抓取（有最新正式資料）
  for (const y of yearsNeeded) {
    const fetched = await fetchOfficialHolidays(y);
    if (fetched && fetched.length > 0) {
      fetched.forEach(d => { TW_HOLIDAYS.add(d); newDates.push(d); });
      console.log(`✅ 從 TWSE 抓取 ${y} 年假日 ${fetched.length} 筆`);
    } else {
      // API 失敗 → 用規則估算
      const estimated = estimateHolidaysForYear(y);
      estimated.forEach(d => { TW_HOLIDAYS.add(d); newDates.push(d); });
      console.warn(`⚠️ ${y} 年假日 API 失敗，使用規則估算 ${estimated.length} 筆`);
    }
  }

  // 儲存已擴充的假日和最大年份
  const allExtra = [...new Set([...storedExtra, ...newDates])];
  safeSet('holidaysExtra', JSON.stringify(allExtra));
  safeSet('holidaysMaxYear', targetYear.toString());
}

/**
 * 從 TWSE 官方「休市日期」API 抓取指定年份的假日
 * TWSE 有 /rwd/zh/holidaySchedule/holidaySchedule 端點
 */
async function fetchOfficialHolidays(year) {
  try {
    const url = `https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&queryYear=${year}&_=${Date.now()}`;
    const data = await apiFetch(url, 8000);
    if (!data || data.stat !== 'OK' || !Array.isArray(data.data)) return null;

    const dates = [];
    for (const row of data.data) {
      // row 格式通常是 [日期, 原因] 或 [序號, 日期, 原因]
      for (const cell of row) {
        const s = String(cell || '').trim();
        // 嘗試解析民國日期（如 "114/01/01"）
        if (/^\d{3}\/\d{2}\/\d{2}$/.test(s)) {
          const parsed = parseROCDate(s);
          if (parsed && parsed.getFullYear() === year) {
            dates.push(dateKey(parsed));
          }
        }
        // 也嘗試西元日期（如 "2025/01/01"）
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const parsed = new Date(s.replace(/\//g, '-') + 'T00:00:00');
          if (!isNaN(parsed) && parsed.getFullYear() === year) {
            dates.push(dateKey(parsed));
          }
        }
      }
    }
    return dates.length > 0 ? dates : null;
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------------------
//  localStorage 安全存取（避免 Safari ITP / 隱私模式 / 安全政策拋錯）
// ----------------------------------------------------------------
function safeGet(key, fallback = null) {
  try { return window.localStorage.getItem(key); } catch(e) { return fallback; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch(e) { /* ignore */ }
}
function safeRemove(key) {
  try { window.localStorage.removeItem(key); } catch(e) { /* ignore */ }
}

// ----------------------------------------------------------------
//  State
// ----------------------------------------------------------------
let extraClosures   = new Set(JSON.parse(safeGet('extraClosures') || '[]'));
let typhoonMode     = safeGet('typhoonMode') === 'true';
let notifEnabled    = safeGet('notifEnabled') === 'true';
let autoUpdate      = safeGet('autoUpdate') === 'true';
let currentTab      = 'twse';
let manualStocks    = (JSON.parse(safeGet('manualStocks') || '[]')).map(s => ({
  ...s,
  startDate: s.startDate ? new Date(s.startDate) : null,
  endDate:   s.endDate   ? new Date(s.endDate)   : null,
}));
let historyLog      = JSON.parse(safeGet('historyLog') || '{}');
let autoUpdateTimer = null;

const allStocks = { twse: [], tpex: [], attention: [] };

// ----------------------------------------------------------------
//  Date utilities
// ----------------------------------------------------------------
function dateKey(d) { return d.toISOString().split('T')[0]; }
function isHoliday(d) { return TW_HOLIDAYS.has(dateKey(d)) || extraClosures.has(dateKey(d)); }
function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }
function isTradingDay(d) { return !isWeekend(d) && !isHoliday(d); }

/**
 * Flexible date parser supports:
 *   ROC slash  "114/04/08"
 *   ROC kanji  "114年04月08日" or "114年4月8日"
 *   ISO        "2025/04/08" or "2025-04-08"
 */
function parseROCDate(s) {
  if (!s) return null;
  s = s.trim();

  // "114年04月08日"
  const kanji = s.match(/^(\d{2,3})年(\d{1,2})月(\d{1,2})日$/);
  if (kanji) {
    const [, y, m, d] = kanji;
    return new Date(`${+y + 1911}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
  }
  // "114/04/08"
  if (/^\d{2,3}\/\d{2}\/\d{2}$/.test(s)) {
    const [y, m, d] = s.split('/');
    return new Date(`${+y + 1911}-${m}-${d}T00:00:00`);
  }
  // "2025/04/08" or "2025-04-08"
  return new Date(s.replace(/\//g, '-') + (s.includes('T') ? '' : 'T00:00:00'));
}

function fmt(d) {
  if (!d) return '–';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Count remaining trading days to endDate (inclusive).
 * 0 = ends today   -1 = already expired
 */
function remainingTradingDays(endDate) {
  if (!endDate) return -99;
  const today = new Date(); today.setHours(0,0,0,0);
  const end   = new Date(endDate); end.setHours(0,0,0,0);

  const diff = end.getTime() - today.getTime();
  if (diff < 0) return -1;
  if (diff === 0) return typhoonMode ? 1 : 0;

  let count = 0;
  const cur = new Date(today);
  cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    if (isTradingDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return typhoonMode ? count + 1 : count;
}

// ----------------------------------------------------------------
//  History / repeat-offender tracking
// ----------------------------------------------------------------
function trackHistory(code, name) {
  if (!code) return;
  const today = dateKey(new Date());
  if (!historyLog[code]) historyLog[code] = { name, dates: [] };
  if (!historyLog[code].dates.includes(today)) historyLog[code].dates.push(today);
  const cutoff = Date.now() - 180 * 86400e3;
  historyLog[code].dates = historyLog[code].dates.filter(d => new Date(d).getTime() > cutoff);
  safeSet('historyLog', JSON.stringify(historyLog));
}

function isRepeat(code) {
  if (!historyLog[code]) return false;
  const cutoff = Date.now() - 180 * 86400e3;
  return historyLog[code].dates.filter(d => new Date(d).getTime() > cutoff).length >= 2;
}

// ----------------------------------------------------------------
//  API fetch helpers
// ----------------------------------------------------------------
const PROXY = 'https://corsproxy.io/?url=';

async function apiFetch(url, timeout = 9000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (r.ok) return await r.json();
  } catch (_) {}
  try {
    const r = await fetch(PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(timeout + 3000) });
    if (r.ok) {
      const w = await r.json();
      return typeof w.contents === 'string' ? JSON.parse(w.contents) : w;
    }
  } catch (_) {}
  return null;
}

// ----------------------------------------------------------------
//  TWSE API
// ----------------------------------------------------------------
async function fetchTWSEDisposal() {
  return apiFetch('https://www.twse.com.tw/rwd/zh/surveillance/disposalStockList?response=json&_=' + Date.now());
}

async function fetchTWSEAttention() {
  return apiFetch('https://www.twse.com.tw/rwd/zh/surveillance/attentionStockList?response=json&_=' + Date.now());
}

// ----------------------------------------------------------------
//  TPEx API  (try multiple known endpoints)
// ----------------------------------------------------------------
async function fetchTPExDisposal() {
  const urls = [
    'https://www.tpex.org.tw/web/stock/supervision/disposal/disposal_stock_result.php?l=zh-tw&o=json&_=' + Date.now(),
    'https://www.tpex.org.tw/www/zh-tw/supervision/disposal?response=json&_=' + Date.now(),
  ];
  for (const url of urls) {
    const data = await apiFetch(url);
    if (data) return data;
  }
  return null;
}

// ----------------------------------------------------------------
//  Parse TWSE disposal
// ----------------------------------------------------------------
function parseTWSEDisposal(data) {
  if (!data || data.stat !== 'OK' || !Array.isArray(data.data)) return [];
  const fields = data.fields || [];

  const idx = kws => {
    for (const kw of kws) {
      const i = fields.findIndex(f => f.includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };

  const codeI  = idx(['代號','代碼']) >= 0 ? idx(['代號','代碼']) : 1;
  const nameI  = idx(['名稱'])        >= 0 ? idx(['名稱'])        : 2;
  const methI  = idx(['方式','措施']) >= 0 ? idx(['方式','措施']) : 3;
  const startI = idx(['開始'])        >= 0 ? idx(['開始'])        : 5;
  const endI   = idx(['終止','結束']) >= 0 ? idx(['終止','結束']) : 6;

  return data.data.map(row => {
    const code   = (row[codeI]  || '').trim();
    const name   = (row[nameI]  || '').trim();
    const method = (row[methI]  || '').trim();
    const startD = parseROCDate(row[startI]);
    const endD   = parseROCDate(row[endI]);
    const rem    = remainingTradingDays(endD);
    const is20   = method.includes('20') || method.includes('二十');
    trackHistory(code, name);
    return { code, name, method: is20 ? '20min' : '5min', startDate: startD, endDate: endD, remaining: rem, isRepeat: isRepeat(code), source: 'twse' };
  }).filter(s => s.remaining >= 0 && s.code);
}

function parseTWSEAttention(data) {
  if (!data || data.stat !== 'OK' || !Array.isArray(data.data)) return [];
  const fields = data.fields || [];
  const codeI   = fields.findIndex(f => f.includes('代號') || f.includes('代碼'));
  const nameI   = fields.findIndex(f => f.includes('名稱'));
  const reasonI = fields.findIndex(f => f.includes('原因') || f.includes('情事') || f.includes('注意'));
  return data.data.map(row => ({
    code:   (row[codeI   >= 0 ? codeI   : 1] || '').trim(),
    name:   (row[nameI   >= 0 ? nameI   : 2] || '').trim(),
    reason: (row[reasonI >= 0 ? reasonI : 3] || '').trim(),
  })).filter(s => s.code);
}

async function fetchTPExAttention() {
  const urls = [
    'https://www.tpex.org.tw/web/stock/supervision/attention/attention_stock_result.php?l=zh-tw&o=json&_=' + Date.now(),
    'https://www.tpex.org.tw/www/zh-tw/supervision/attention?response=json&_=' + Date.now(),
  ];
  for (const url of urls) {
    const data = await apiFetch(url);
    if (data) return data;
  }
  return null;
}

function parseTPExAttention(raw) {
  if (!raw) return [];
  let rows = [], columns = [];

  if (raw.aaData && Array.isArray(raw.aaData)) {
    rows    = raw.aaData;
    columns = raw.aoColumns || [];
  } else if (Array.isArray(raw.data)) {
    rows    = raw.data;
    columns = raw.fields || raw.aoColumns || [];
  } else if (Array.isArray(raw)) {
    rows    = raw;
  } else {
    return [];
  }

  const colText = c => (typeof c === 'string' ? c : (c.sTitle || c.title || ''));
  const idxOf   = kws => {
    for (const kw of kws) {
      const i = columns.findIndex(c => colText(c).includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };

  const codeI   = idxOf(['代號','代碼']) >= 0 ? idxOf(['代號','代碼']) : 1;
  const nameI   = idxOf(['名稱'])        >= 0 ? idxOf(['名稱'])        : 2;
  const reasonI = idxOf(['原因','情事','注意']) >= 0 ? idxOf(['原因','情事','注意']) : 3;

  return rows.map(row => {
    const r      = Array.isArray(row) ? row : Object.values(row);
    const clean  = s => String(s || '').replace(/<[^>]+>/g, '').trim();
    const code   = clean(r[codeI]);
    const name   = clean(r[nameI]);
    const reason = clean(r[reasonI]);
    return { code, name, reason };
  }).filter(s => s.code);
}
function parseTPExDisposal(raw) {
  if (!raw) return [];
  let rows = [], columns = [];

  if (raw.aaData && Array.isArray(raw.aaData)) {
    rows    = raw.aaData;
    columns = raw.aoColumns || [];
  } else if (Array.isArray(raw.data)) {
    rows    = raw.data;
    columns = raw.fields || raw.aoColumns || [];
  } else if (Array.isArray(raw)) {
    rows    = raw;
    columns = [];
  } else {
    return [];
  }

  const colText = c => (typeof c === 'string' ? c : (c.sTitle || c.title || ''));
  const idx = kws => {
    for (const kw of kws) {
      const i = columns.findIndex(c => colText(c).includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };

  const codeI  = idx(['代號','代碼']) >= 0 ? idx(['代號','代碼']) : 1;
  const nameI  = idx(['名稱'])        >= 0 ? idx(['名稱'])        : 2;
  const methI  = idx(['方式','措施']) >= 0 ? idx(['方式','措施']) : 3;
  const startI = idx(['開始'])        >= 0 ? idx(['開始'])        : 5;
  const endI   = idx(['終止','結束']) >= 0 ? idx(['終止','結束']) : 6;

  return rows.map(row => {
    const r      = Array.isArray(row) ? row : Object.values(row);
    const clean  = s => String(s || '').replace(/<[^>]+>/g, '').trim();
    const code   = clean(r[codeI]);
    const name   = clean(r[nameI]);
    const method = clean(r[methI]);
    const startD = parseROCDate(clean(r[startI]));
    const endD   = parseROCDate(clean(r[endI]));
    if (!code || !endD) return null;
    const rem  = remainingTradingDays(endD);
    const is20 = method.includes('20') || method.includes('二十');
    trackHistory(code, name);
    return { code, name, method: is20 ? '20min' : '5min', startDate: startD, endDate: endD, remaining: rem, isRepeat: isRepeat(code), source: 'tpex' };
  }).filter(s => s && s.remaining >= 0 && s.code);
}

// ----------------------------------------------------------------
//  Sample / fallback data
// ----------------------------------------------------------------
function makeSampleStocks(src = 'sample') {
  const today = new Date(); today.setHours(0,0,0,0);
  const add = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  return [
    { code:'3163', name:'波若威',  method:'5min',  startDate:add(-15), endDate:today,   remaining:remainingTradingDays(today),   isRepeat:false, source:src },
    { code:'2451', name:'創見',    method:'20min', startDate:add(-10), endDate:add(1),  remaining:remainingTradingDays(add(1)),  isRepeat:true,  source:src },
    { code:'6271', name:'同欣電',  method:'5min',  startDate:add(-5),  endDate:add(3),  remaining:remainingTradingDays(add(3)),  isRepeat:false, source:src },
    { code:'6488', name:'環球晶',  method:'20min', startDate:add(-2),  endDate:add(7),  remaining:remainingTradingDays(add(7)),  isRepeat:true,  source:src },
    { code:'3060', name:'銘異',    method:'5min',  startDate:add(-3),  endDate:add(11), remaining:remainingTradingDays(add(11)), isRepeat:false, source:src },
  ].filter(s => s.remaining >= 0);
}

// ----------------------------------------------------------------
//  Render helpers
// ----------------------------------------------------------------
function countdownClass(rem, is20) {
  if (rem === 0) return 'c-green';
  if (rem <= 3 || is20) return 'c-amber';
  return 'c-dim';
}

function rowBorderClass(rem, is20) {
  if (rem === 0) return 'b-green';
  if (is20) return 'b-red';
  if (rem === 1) return 'b-amber';
  return 'b-none';
}

function renderStockRow(s) {
  const is20    = s.method === '20min';
  const rClass  = rowBorderClass(s.remaining, is20);
  const cdClass = countdownClass(s.remaining, is20);
  const cdNum   = s.remaining === 0 ? '✓' : String(s.remaining);
  const cdLbl   = s.remaining === 0 ? '今日出關' : '交易日';
  const blink   = s.remaining === 0 ? ' blink' : '';

  const sampleBadge = s.source === 'sample'
    ? '<span class="badge b-dim">示範</span>' : '';
  const tpexBadge = s.source === 'tpex'
    ? '<span class="badge b-dim" style="font-size:9px">上櫃</span>' : '';
  const deleteBadge = ((s.source === 'manual' || s.source === 'tpex') && manualStocks.find(m => m.code === s.code))
    ? `<span class="badge b-dim del-btn" onclick="deleteManualStock('${s.code}')" title="刪除此筆">✕ 刪除</span>` : '';

  return `
  <div class="stock-row ${rClass}" data-code="${s.code}">
    <div class="sr-info">
      <div class="sr-name">${s.name}${s.isRepeat ? ' <span class="repeat-dot" title="半年內二度處置">⚡</span>' : ''}</div>
      <div class="sr-code">${s.code}</div>
    </div>
    <div class="sr-badges">
      <span class="badge ${is20 ? 'b-red' : 'b-amber'}">${is20 ? '⚠ 20分撮' : '5分撮'}</span>
      ${s.isRepeat ? '<span class="badge b-blue">前科</span>' : ''}
      ${sampleBadge}${tpexBadge}${deleteBadge}
    </div>
    <div class="sr-dates">
      <div>${fmt(s.startDate)}</div>
      <div class="sr-date-end">→ ${fmt(s.endDate)}</div>
    </div>
    <div class="sr-cd ${cdClass}${blink}">
      <div class="sr-cd-num">${cdNum}</div>
      <div class="sr-cd-lbl">${cdLbl}</div>
    </div>
  </div>`;
}

function renderAttentionRow(s) {
  return `
  <div class="stock-row b-blue">
    <div class="sr-info">
      <div class="sr-name">${s.name}</div>
      <div class="sr-code">${s.code}</div>
    </div>
    <div class="sr-badges"><span class="badge b-blue">注意股</span></div>
    <div class="sr-dates" style="grid-column:span 2;font-size:11px;color:var(--blue);text-align:left">${s.reason || '異常交易注意'}</div>
  </div>`;
}

function sectionHeader(icon, label, color) {
  return `<div class="sec-hdr"><span style="color:${color}">${icon} ${label}</span></div>`;
}

// ----------------------------------------------------------------
//  Main render
// ----------------------------------------------------------------
function renderAll() {
  const container = document.getElementById('stock-container');
  let stocks = [];

  if (currentTab === 'attention') {
    const att = allStocks.attention;
    container.innerHTML = att.length
      ? `<div class="stock-list">${att.map(renderAttentionRow).join('')}</div>`
      : '<div class="empty-state">📭 目前無注意股資料</div>';
    updateSummary();
    return;
  }

  if (currentTab === 'twse') {
    stocks = [
      ...allStocks.twse,
      ...manualStocks.filter(s => s.source === 'manual'),
    ].filter(s => s.remaining >= 0);
  } else {
    stocks = [
      ...allStocks.tpex,
      ...manualStocks.filter(s => s.source === 'tpex'),
    ].filter(s => s.remaining >= 0);
  }

  if (!stocks.length) {
    container.innerHTML = '<div class="empty-state">🎉 目前無處置股資料</div>';
    updateSummary();
    return;
  }

  stocks.sort((a, b) => a.remaining - b.remaining);

  const g0 = stocks.filter(s => s.remaining === 0);
  const g1 = stocks.filter(s => s.remaining === 1);
  const g2 = stocks.filter(s => s.remaining >= 2 && s.remaining <= 3);
  const g3 = stocks.filter(s => s.remaining >= 4);

  let html = '';
  if (g0.length) html += sectionHeader('🟢', '今天出關', 'var(--green)')  + `<div class="stock-list">${g0.map(renderStockRow).join('')}</div>`;
  if (g1.length) html += sectionHeader('🟡', '明天出關', 'var(--amber)')  + `<div class="stock-list">${g1.map(renderStockRow).join('')}</div>`;
  if (g2.length) html += sectionHeader('⏱', '2–3 天後', '#94a3b8')       + `<div class="stock-list">${g2.map(renderStockRow).join('')}</div>`;
  if (g3.length) html += sectionHeader('🔒', '持續關押中', '#64748b')     + `<div class="stock-list">${g3.map(renderStockRow).join('')}</div>`;

  container.innerHTML = html;
  updateSummary();
  scheduleNotificationsIfEnabled();
}

function updateSummary() {
  const all = [...allStocks.twse, ...allStocks.tpex, ...manualStocks].filter(s => s.remaining >= 0);
  setEl('s-today',    all.filter(s => s.remaining === 0).length);
  setEl('s-tomorrow', all.filter(s => s.remaining === 1).length);
  setEl('s-high',     all.filter(s => s.method === '20min').length);
  setEl('s-total',    all.length);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ----------------------------------------------------------------
//  Tab badges
// ----------------------------------------------------------------
function updateTabBadges() {
  const twseCount = [...allStocks.twse, ...manualStocks.filter(s=>s.source==='manual')].filter(s => s.remaining >= 0).length;
  const tpexCount = [...allStocks.tpex, ...manualStocks.filter(s=>s.source==='tpex')].filter(s => s.remaining >= 0).length;
  const attCount  = allStocks.attention.length;

  setElInner('tab-twse',      `上市 TWSE${twseCount ? ` <span class="tab-cnt">${twseCount}</span>` : ''}`);
  setElInner('tab-tpex',      `上櫃 TPEX${tpexCount ? ` <span class="tab-cnt">${tpexCount}</span>` : ''}`);
  setElInner('tab-attention', `⚠ 注意股${attCount  ? ` <span class="tab-cnt">${attCount}</span>`  : ''}`);
}

function setElInner(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ----------------------------------------------------------------
//  Data loading
// ----------------------------------------------------------------
async function loadData() {
  showLoading();

  const cached    = safeGet('stockCache');
  const cacheTime = parseInt(safeGet('stockCacheTime') || '0');
  const ageMin    = (Date.now() - cacheTime) / 60000;

  if (cached && ageMin < 20) {
    try {
      const parsed = JSON.parse(cached);
      allStocks.twse      = parsed.twse      || [];
      allStocks.tpex      = parsed.tpex      || [];
      allStocks.attention = parsed.attention || [];
      renderAll();
      setUpdateTime(new Date(cacheTime));
      updateTabBadges();
      freshFetchBackground();
      return;
    } catch (_) {}
  }

  await freshFetch();
}

async function freshFetch() {
  showLoading();
  try {
    const [twseRes, tpexRes, attRes, tpexAttRes] = await Promise.allSettled([
      fetchTWSEDisposal(),
      fetchTPExDisposal(),
      fetchTWSEAttention(),
      fetchTPExAttention(),
    ]);

    // TWSE disposal
    if (twseRes.status === 'fulfilled' && twseRes.value) {
      allStocks.twse = parseTWSEDisposal(twseRes.value);
    } else {
      const cached = safeGet('stockCache');
      allStocks.twse = cached ? (JSON.parse(cached).twse || makeSampleStocks()) : makeSampleStocks();
      showToast('⚠️ 上市 API 連線失敗，顯示示範資料');
    }

    // TPEx disposal
    if (tpexRes.status === 'fulfilled' && tpexRes.value) {
      allStocks.tpex = parseTPExDisposal(tpexRes.value);
    } else {
      const cached = safeGet('stockCache');
      allStocks.tpex = cached ? (JSON.parse(cached).tpex || []) : [];
      if (allStocks.tpex.length === 0) showToast('⚠️ 上櫃 API 連線失敗');
    }

    // TWSE attention
    if (attRes.status === 'fulfilled' && attRes.value) {
      allStocks.attention = parseTWSEAttention(attRes.value);
    } else {
      allStocks.attention = [];
    }

    // TPEx attention — merge with TWSE attention, avoid duplicates
    if (tpexAttRes.status === 'fulfilled' && tpexAttRes.value) {
      const tpexAtt = parseTPExAttention(tpexAttRes.value);
      const existingCodes = new Set(allStocks.attention.map(s => s.code));
      tpexAtt.forEach(s => { if (!existingCodes.has(s.code)) allStocks.attention.push(s); });
    }

    saveCache();
    renderAll();
    setUpdateTime(new Date());
    updateTabBadges();
  } catch (e) {
    console.error('loadData error:', e);
    allStocks.twse = makeSampleStocks();
    renderAll();
    showToast('❌ 載入失敗，顯示示範資料');
  }
}

async function freshFetchBackground() {
  try {
    const [twseData, tpexData] = await Promise.allSettled([
      fetchTWSEDisposal(),
      fetchTPExDisposal(),
    ]);
    if (twseData.status === 'fulfilled' && twseData.value)
      allStocks.twse = parseTWSEDisposal(twseData.value);
    if (tpexData.status === 'fulfilled' && tpexData.value)
      allStocks.tpex = parseTPExDisposal(tpexData.value);
    saveCache();
    renderAll();
    setUpdateTime(new Date());
    updateTabBadges();
  } catch (_) {}
}

function saveCache() {
  safeSet('stockCache', JSON.stringify(allStocks));
  safeSet('stockCacheTime', Date.now().toString());
}

// ----------------------------------------------------------------
//  UI helpers
// ----------------------------------------------------------------
function showLoading() {
  document.getElementById('stock-container').innerHTML = `
    <div class="loading-card">
      <div class="spinner"></div>
      <div>正在從證交所 / 櫃買中心抓取最新資料…</div>
      <div class="loading-sub">若超過 10 秒請點重新整理</div>
    </div>`;
}

function setUpdateTime(d) {
  const pad = n => String(n).padStart(2,'0');
  const el  = document.getElementById('update-time');
  if (el) el.textContent = `更新 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dot = document.getElementById('update-dot');
  if (dot) dot.className = 'dot green';
}

function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const dateEl = document.getElementById('clock-date');
  const timeEl = document.getElementById('clock-time');
  if (dateEl) dateEl.textContent = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())}`;
  if (timeEl) timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function showToast(msg, dur = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}

// ----------------------------------------------------------------
//  Tabs
// ----------------------------------------------------------------
window.switchTab = function(tab) {
  currentTab = tab;
  ['twse','tpex','attention'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
  });
  renderAll();
};

// ----------------------------------------------------------------
//  Typhoon mode
// ----------------------------------------------------------------
window.toggleTyphoon = function() {
  typhoonMode = !typhoonMode;
  safeSet('typhoonMode', typhoonMode);
  document.getElementById('typhoon-banner')?.classList.toggle('hidden', !typhoonMode);
  const recalc = arr => arr.forEach(s => { s.remaining = remainingTradingDays(s.endDate); });
  recalc(allStocks.twse); recalc(allStocks.tpex); recalc(manualStocks);
  renderAll();
  showToast(typhoonMode ? '🌀 颱風假 +1 天已啟動' : '颱風假模式已關閉');
};

// ----------------------------------------------------------------
//  Manual add modal
// ----------------------------------------------------------------
window.openAddModal = function() {
  document.getElementById('add-modal').classList.remove('hidden');
  const today = dateKey(new Date());
  document.getElementById('inp-start').value = today;
  document.getElementById('inp-end').value   = today;
};

window.closeAddModal = function() {
  document.getElementById('add-modal').classList.add('hidden');
};

window.addManualStock = function() {
  const code   = document.getElementById('inp-code').value.trim();
  const name   = document.getElementById('inp-name').value.trim();
  const type   = document.getElementById('inp-type').value;
  const market = document.getElementById('inp-market').value;
  const start  = document.getElementById('inp-start').value;
  const end    = document.getElementById('inp-end').value;

  if (!code || !name || !end) { showToast('⚠️ 請填寫代號、名稱及結束日'); return; }

  const endDate   = new Date(end + 'T00:00:00');
  const startDate = new Date((start || end) + 'T00:00:00');
  const remaining = remainingTradingDays(endDate);
  trackHistory(code, name);

  manualStocks = manualStocks.filter(s => s.code !== code);
  manualStocks.push({
    code, name,
    method: type,
    startDate, endDate, remaining,
    isRepeat: isRepeat(code),
    source: market,   // 'manual' = 上市, 'tpex' = 上櫃
  });
  safeSet('manualStocks', JSON.stringify(manualStocks));

  closeAddModal();
  renderAll();
  updateTabBadges();
  showToast(`✅ 已新增 ${name} (${code})`);
};

window.deleteManualStock = function(code) {
  manualStocks = manualStocks.filter(s => s.code !== code);
  safeSet('manualStocks', JSON.stringify(manualStocks));
  renderAll();
  updateTabBadges();
  showToast('🗑 已刪除');
};

// ----------------------------------------------------------------
//  Notifications
// ----------------------------------------------------------------
window.toggleNotif = function() {
  if (!notifEnabled) {
    if (!('Notification' in window)) { showToast('❌ 此瀏覽器不支援通知'); return; }
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        notifEnabled = true;
        safeSet('notifEnabled', 'true');
        document.getElementById('tog-notif')?.classList.add('on');
        document.getElementById('btn-notif')?.classList.add('active');
        showToast('✅ 通知已啟用');
        scheduleNotificationsIfEnabled();
      } else {
        showToast('❌ 通知權限被拒絕，請至瀏覽器設定允許');
      }
    });
  } else {
    notifEnabled = false;
    safeSet('notifEnabled', 'false');
    document.getElementById('tog-notif')?.classList.remove('on');
    document.getElementById('btn-notif')?.classList.remove('active');
    showToast('通知已關閉');
  }
};

window.toggleAutoUpdate = function() {
  autoUpdate = !autoUpdate;
  safeSet('autoUpdate', autoUpdate);
  document.getElementById('tog-auto')?.classList.toggle('on', autoUpdate);
  showToast(autoUpdate ? '✅ 自動更新已啟用' : '自動更新已關閉');
  if (autoUpdate) startAutoUpdate();
  else if (autoUpdateTimer) { clearInterval(autoUpdateTimer); autoUpdateTimer = null; }
};

function scheduleNotificationsIfEnabled() {
  if (!notifEnabled || !('serviceWorker' in navigator)) return;
  const todayOut  = [...allStocks.twse, ...allStocks.tpex, ...manualStocks].filter(s => s.remaining === 0);
  const allActive = [...allStocks.twse, ...allStocks.tpex, ...manualStocks].filter(s => s.remaining >= 0);
  navigator.serviceWorker.ready.then(reg => {
    if (todayOut.length > 0)
      reg.active?.postMessage({ type: 'SCHEDULE_MORNING_ALERT', stocks: todayOut });
    if (allActive.length > 0)
      reg.active?.postMessage({ type: 'SCHEDULE_CLOSE_ALERT', stocks: allActive });
  });
}

// ----------------------------------------------------------------
//  Auto-update at 16:05 on trading days
// ----------------------------------------------------------------
function startAutoUpdate() {
  if (autoUpdateTimer) clearInterval(autoUpdateTimer);
  autoUpdateTimer = setInterval(() => {
    const now = new Date();
    if (now.getHours() === 16 && now.getMinutes() === 5 && isTradingDay(now)) {
      safeRemove('stockCache');
      freshFetch();
    }
  }, 60 * 1000);
}

// ----------------------------------------------------------------
//  Clear cache
// ----------------------------------------------------------------
window.clearCache = function() {
  safeRemove('stockCache');
  safeRemove('stockCacheTime');
  freshFetch();
  showToast('🔄 快取已清除，重新載入…');
};

// ----------------------------------------------------------------
//  iOS PWA install banner
// ----------------------------------------------------------------
function maybeShowInstallHint() {
  const isIOS      = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true;
  const dismissed  = safeGet('installHintDismissed');
  if (!isIOS || standalone || dismissed) return;
  document.getElementById('ios-install-banner')?.classList.remove('hidden');
}

window.dismissInstallHint = function() {
  document.getElementById('ios-install-banner')?.classList.add('hidden');
  safeSet('installHintDismissed', '1');
};

// ----------------------------------------------------------------
//  Midnight / date-change recalculation
//  每分鐘檢查一次日期，零點過後自動重算所有股票剩餘天數
// ----------------------------------------------------------------
let _lastDateKey = dateKey(new Date());

function checkDateChange() {
  const nowKey = dateKey(new Date());
  if (nowKey === _lastDateKey) return;
  _lastDateKey = nowKey;

  const newYear = new Date().getFullYear();
  // 確保假日資料涵蓋到下一年（非同步，完成後重算）
  ensureHolidaysCoverYear(newYear + 1).then(() => {
    const recalc = arr => arr.forEach(s => { s.remaining = remainingTradingDays(s.endDate); });
    recalc(allStocks.twse);
    recalc(allStocks.tpex);
    recalc(manualStocks);
    renderAll();
    updateTabBadges();

    if (isTradingDay(new Date())) {
      // 今天是交易日，清快取重新抓
      safeRemove('stockCache');
      freshFetch();
      showToast('📅 日期已更新，重新載入資料…');
    } else {
      showToast('📅 日期已更新（今日非交易日）');
    }
  });
}

// ----------------------------------------------------------------
//  Init
// ----------------------------------------------------------------
async function init() {
  updateClock();
  setInterval(updateClock, 1000);
  // 每分鐘檢查日期是否切換（零點自動重算）
  setInterval(checkDateChange, 60 * 1000);

  document.getElementById('tog-notif')?.classList.toggle('on', notifEnabled);
  document.getElementById('tog-auto')?.classList.toggle('on', autoUpdate);
  document.getElementById('btn-notif')?.classList.toggle('active', notifEnabled);
  document.getElementById('typhoon-banner')?.classList.toggle('hidden', !typhoonMode);

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    safeRemove('stockCache');
    freshFetch();
    showToast('🔄 重新整理中…');
  });

  // ★ 啟動時確保假日資料涵蓋當年+下一年
  //   若資料不夠，會自動從 TWSE 抓取或用規則估算補齊
  const thisYear = new Date().getFullYear();
  await ensureHolidaysCoverYear(thisYear + 1);

  // ★ 假日資料載入完成後，重新計算手動新增股票的剩餘天數
  manualStocks.forEach(s => { s.remaining = remainingTradingDays(s.endDate); });

  if (autoUpdate) startAutoUpdate();

  loadData();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('SW registered:', r.scope))
      .catch(e => console.warn('SW failed:', e));
  }

  setTimeout(maybeShowInstallHint, 2500);
}

document.addEventListener('DOMContentLoaded', init);
