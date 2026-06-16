// api/overpass.js
// Proxy do Overpass uruchamiany po stronie serwera na Vercelu.
// Przegladarka pyta /api/overpass (same-origin -> zero CORS), a serwer odpytuje
// Overpass z poprawnymi naglowkami (User-Agent + Referer), wiec nie ma 406.

// WAZNE: darmowy plan Vercela ubija funkcje po ~10s, chyba ze ustawimy maxDuration.
export const maxDuration = 60;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

export default async function handler(req, res) {
  // wyciagnij zapytanie
  let query = '';
  if (req.method === 'POST') {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    query = (b && (b.query || b.data)) || '';
  } else {
    query = (req.query && req.query.data) || '';
  }

  // GET bez danych = test "czy proxy zyje" (mozna otworzyc w przegladarce)
  if (!query) {
    res.status(200).json({ ok: true, message: 'Proxy dziala. Wyslij POST { query }.' });
    return;
  }

  let lastInfo = '';
  for (const ep of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000); // 12s na serwer
      const r = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'HUMBAK-Leads/1.0 (https://humbakleads.vercel.app)',
          'Referer': 'https://humbakleads.vercel.app/'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(t);
      if (!r.ok) { lastInfo = ep.replace('https://', '') + ' -> ' + r.status; continue; }
      const data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      res.status(200).json(data);
      return;
    } catch (e) {
      lastInfo = ep.replace('https://', '') + ' -> ' + (e.name === 'AbortError' ? 'timeout 12s' : e.message);
    }
  }
  res.status(502).json({ error: 'Zaden serwer Overpass nie odpowiedzial', detail: lastInfo });
}
