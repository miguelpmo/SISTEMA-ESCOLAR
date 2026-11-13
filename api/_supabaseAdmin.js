import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

// Evita que a inicialização do módulo falhe com uma mensagem HTML genérica
// quando uma variável estiver ausente. As rotas chamam assertSupabaseEnv().
const safeUrl = supabaseUrl || "https://placeholder.supabase.co";
const safeServiceRoleKey = serviceRoleKey || "missing-service-role-key";
const safeAnonKey = anonKey || "missing-anon-key";

export const admin = createClient(safeUrl, safeServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export const anon = createClient(safeUrl, safeAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export function assertSupabaseEnv() {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");

  if (missing.length) {
    throw new Error(`Configure estas variáveis no Vercel: ${missing.join(", ")}.`);
  }
}

export async function requireAdmin(req) {
  assertSupabaseEnv();

  const authorization = req.headers.authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Faça login novamente.");

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error("Sessão inválida. Faça login novamente.");

  const { data: profile, error: profileError } = await admin
    .from("perfis")
    .select("tipo")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.tipo !== "admin") {
    throw new Error("Apenas o administrador pode realizar esta ação.");
  }

  return user;
}
