// pages/api/jaspar.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawUrl = req.query.url;

  if (!rawUrl || (Array.isArray(rawUrl) && rawUrl.length === 0)) {
    res.status(400).json({ error: 'Missing url query parameter' });
    return;
  }

  // Handle both ?url=... and ?url[]=... just in case
  const encoded = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

  let targetUrl: string;
  try {
    // Frontend sends encodeURIComponent(targetUrl), so decode it here
    targetUrl = decodeURIComponent(encoded);
  } catch {
    // Fallback: if somehow not encoded, just use as-is
    targetUrl = encoded;
  }

  // Safety: only allow JASPAR host through this proxy
  try {
    const parsed = new URL(targetUrl);
    if (parsed.hostname !== 'jaspar.elixir.no') {
      res.status(400).json({ error: 'Only jaspar.elixir.no is allowed' });
      return;
    }
  } catch (e) {
    res.status(400).json({ error: 'Invalid target URL' });
    return;
  }

  try {
    const jasparRes = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    const contentType = jasparRes.headers.get('content-type') || 'application/json';
    const text = await jasparRes.text();

    res.status(jasparRes.status);
    res.setHeader('Content-Type', contentType);
    res.send(text);
  } catch (err) {
    console.error('JASPAR proxy error:', err);
    res.status(502).json({ error: 'Failed to reach JASPAR' });
  }
}
