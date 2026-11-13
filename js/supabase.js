import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// A URL E A CHAVE PUBLICÁVEL SÃO ENTREGUES PELA API DA VERCEL.
// A CHAVE SERVICE_ROLE NUNCA DEVE CHEGAR AO NAVEGADOR.
const response = await fetch("/api/config", { cache: "no-store" });
let settings = {};
try {
  settings = await response.json();
} catch {
  throw new Error("NÃO FOI POSSÍVEL LER A CONFIGURAÇÃO. CONFIRA A ROTA /API/CONFIG NA VERCEL.");
}
if (!response.ok || !settings.url || !settings.anonKey) {
  throw new Error(settings.error || "CONFIGURE SUPABASE_URL E SUPABASE_ANON_KEY NAS VARIÁVEIS DA VERCEL.");
}
export const supabase = createClient(settings.url, settings.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
