import { anon, admin, assertSupabaseEnv } from "./_supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    assertSupabaseEnv();

    const { matricula, senha } = req.body || {};
    const cleanMatricula = String(matricula || "").trim();

    if (!cleanMatricula || !senha) {
      return res.status(400).json({ error: "Informe matrícula e senha." });
    }

    const studentDomain = process.env.STUDENT_EMAIL_DOMAIN || "alunos.sistema-escolar.com";
    const email = `${cleanMatricula}@${studentDomain}`;

    const { data, error } = await anon.auth.signInWithPassword({
      email,
      password: String(senha)
    });

    if (error || !data?.session || !data?.user) {
      throw new Error("Matrícula ou senha inválida.");
    }

    const { data: profile, error: profileError } = await admin
      .from("perfis")
      .select("tipo, matricula")
      .eq("id", data.user.id)
      .single();

    if (profileError || profile?.tipo !== "aluno" || profile?.matricula !== cleanMatricula) {
      throw new Error("Cadastro de aluno não localizado ou matrícula divergente.");
    }

    return res.status(200).json({ session: data.session });
  } catch (error) {
    console.error("Erro em login-aluno:", error);
    return res.status(401).json({
      error: error.message || "Não foi possível entrar."
    });
  }
}
