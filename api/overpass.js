// api/overpass.js
// Proxy do Overpass uruchamiany po stronie serwera na Vercelu.
// Dzieki temu przegladarka pyta TWOJ adres (/api/overpass), a serwer odpytuje
// Overpass z poprawnymi naglowkami (User-Agent + Referer) — co:
//   1) omija CORS calkowicie (zapytanie jest same-origin),
//   2) spelnia nowe reguly OSM (kwiecien 2026), wiec serwer nie zwraca 406,
//   3) pozwala probowac kilku serwerow po kolei.

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

export default async function handler(req, res) {
  // zapytanie przychodzi jako JSON { query: "..." } (POST) albo ?data=... (GET)
  let query = '';
  if (req.method === 'POST') {
    query = (req.body && (req.body.query || req.body.data)) || '';
  } else {
    query = (req.query && req.query.data) || '';
  }
  if (!query) {
    res.status(400).json({ error: 'Brak zapytania (query).' });
    return;
  }

  let lastStatus = 0;
  for (const ep of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25000);
      const r = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          // wlasnie te dwa naglowki sa kluczowe — przegladarka nie moze ich ustawic,
          // ale serwer Vercela tak. To one spelniaja nowe reguly OSM.
          'User-Agent': 'HUMBAK-Leads/1.0 (https://humbakleads.vercel.app)',
          'Referer': 'https://humbakleads.vercel.app/'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(t);
      lastStatus = r.status;
      if (!r.ok) continue; // np. 406/429/504 — probujemy nastepny serwer
      const data = await r.json();
      // krotki cache na brzegu Vercela — odciaza Overpass przy powtorkach
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      res.status(200).json(data);
      return;
    } catch (e) {
      // timeout / siec — probujemy nastepny serwer
    }
  }

  res.status(502).json({
    error: 'Zaden serwer Overpass nie odpowiedzial.',
    lastStatus
  });
}
