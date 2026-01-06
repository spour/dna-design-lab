export default async function handler(req, res) {
  try {
    const { path = "", ...query } = req.query;

    const cleanPath = String(path).replace(/^\/+|\/+$/g, "");
    const upstream = new URL(`https://jaspar.elixir.no/api/v1/${cleanPath}`);

    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) v.forEach((x) => upstream.searchParams.append(k, x));
      else if (v !== undefined) upstream.searchParams.set(k, v);
    }

    const r = await fetch(upstream.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const body = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.send(body);
  } catch (e) {
    res.status(500).json({ error: "Proxy failed", details: String(e?.message || e) });
  }
}
