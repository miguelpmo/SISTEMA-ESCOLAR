export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "MÉTODO NÃO PERMITIDO." });
  }

  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    return res.status(500).json({
      error: "CONFIGURE SUPABASE_URL E SUPABASE_ANON_KEY NAS VARIÁVEIS DE AMBIENTE DA VERCEL."
    });
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    return res.status(500).json({ error: "SUPABASE_URL INVÁLIDA. USE A URL HTTPS DO PROJETO SUPABASE." });
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(200).json({ url, anonKey });
}
