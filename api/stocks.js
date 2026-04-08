// api/stocks.js — Vercel Serverless Function
// 呼叫方式：GET /api/stocks?type=twse-disposal
// type 可以是：twse-disposal | twse-attention | tpex-disposal | tpex-attention

function getEndpoint(type, query) {
  const map = {
    'twse-disposal':  'https://www.twse.com.tw/rwd/zh/surveillance/disposalStockList?response=json',
    'twse-attention': 'https://www.twse.com.tw/rwd/zh/surveillance/attentionStockList?response=json',
    'tpex-disposal':  'https://www.tpex.org.tw/web/stock/supervision/disposal/disposal_stock_result.php?l=zh-tw&o=json',
    'tpex-attention': 'https://www.tpex.org.tw/web/stock/supervision/attention/attention_stock_result.php?l=zh-tw&o=json',
    'holidays':       `https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&queryYear=${query.year || new Date().getFullYear()}`,
  };
  return map[type] || null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;
  const url  = getEndpoint(type, req.query);

  if (!url) {
    return res.status(400).json({ error: 'invalid type', valid: ['twse-disposal','twse-attention','tpex-disposal','tpex-attention','holidays'] });
  }

  try {
    const isTpex = type.startsWith('tpex');
    const response = await fetch(`${url}&_=${Date.now()}`, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Referer':         isTpex ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `upstream ${response.status}` });
    }

    const data = await response.json();

    // 不快取，每次都即時
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);

  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
