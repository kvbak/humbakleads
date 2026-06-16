// api/overpass.js
// Proxy do Overpass + wbudowana DIAGNOSTYKA.
// Wejscie GET (zwykle otwarcie adresu w przegladarce) -> testuje wszystkie
// serwery malym zapytaniem i pokazuje ktory dziala. POST { query } -> normalne odpytanie.

export const maxDuration = 60;  // darmowy Vercel ubija funkcje po ~10s bez tego

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function callOverpass(ep, query, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(ep, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'HUMBAK-Leads/1.0 (https://humbakleads.vercel.app)',
        'Referer': 'https://humbakleads.vercel.app/'
      },
      body: 'data=' + encodeURIComponent(query),
      signal: c.signal
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  let query = '';
  if (req.method === 'POST') {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    query = (b && (b.query || b.data)) || '';
  }

  // --- TRYB DIAGNOSTYKI (GET / brak zapytania): testuje kazdy serwer ---
  if (!query) {
    const testQ = '[out:json][timeout:10];node["amenity"="cafe"](54.515,18.52,54.525,18.54);out 1;';
    const serwery = [];
    for (const ep of ENDPOINTS) {
      const nazwa = ep.replace('https://', '').replace('/api/interpreter', '');
      try {
        const r = await callOverpass(ep, testQ, 12000);
        if (r.ok) {
          const d = await r.json();
          serwery.push({ serwer: nazwa, dziala: true, znaleziono: (d.elements || []).length });
        } else {
          serwery.push({ serwer: nazwa, dziala: false, status: r.status });
        }
      } catch (e) {
        serwery.push({ serwer: nazwa, dziala: false, blad: e.name === 'AbortError' ? 'timeout 12s' : e.message });
      }
    }
    res.status(200).json({ diagnostyka: true, serwery });
    return;
  }

  // --- TRYB NORMALNY (POST z mapy) ---
  let lastInfo = '';
  for (const ep of ENDPOINTS) {
    try {
      const r = await callOverpass(ep, query, 12000);
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
