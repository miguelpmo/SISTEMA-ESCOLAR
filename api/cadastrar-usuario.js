
import { admin, requireAdmin } from "./_supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  let createdUserId = null;

  try {
    // Verifica se quem está realizando a operação é administrador
    await requireAdmin(req);

    const {
      nome,
      tipo,
      identificador,
      senha
    } = req.body || {};

    const cleanName = String(nome || "").trim();
    const cleanIdentifier = String(identificador || "").trim();
    const cleanPassword = String(senha || "");

    // Validação dos campos
    if (
      !cleanName ||
      !cleanIdentifier ||
      !cleanPassword ||
      cleanPassword.length < 6
    ) {
      return res.status(400).json({
        error: "Confira os campos. A senha precisa ter ao menos 6 caracteres."
      });
    }

    // Validação do tipo
    if (!["aluno", "professor"].includes(tipo)) {
      return res.status(400).json({
        error: "Tipo de usuário inválido."
      });
    }

    const isStudent = tipo === "aluno";

    // Domínio dos e-mails dos alunos
    const studentDomain = String(
      process.env.STUDENT_EMAIL_DOMAIN ||
      "alunos.sistema-escolar.com"
    ).trim().toLowerCase();

    // Gera o e-mail
    const email = isStudent
      ? `${cleanIdentifier}@${studentDomain}`
      : cleanIdentifier.toLowerCase();

    // Validação do formato do e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: isStudent
          ? "Não foi possível gerar um e-mail válido para o aluno. Verifique o identificador e o domínio."
          : "Informe um e-mail válido para o professor."
      });
    }

    // Validação da matrícula do aluno
    if (isStudent && !/^[a-zA-Z0-9_-]+$/.test(cleanIdentifier)) {
      return res.status(400).json({
        error: "A matrícula deve conter apenas letras, números, hífen ou underline."
      });
    }

    // Criação do usuário pelo Supabase Admin
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        nome: cleanName
      }
    });

    if (error) {
      throw error;
    }

    if (!data?.user?.id) {
      throw new Error(
        "O Supabase não retornou o usuário criado."
      );
    }

    createdUserId = data.user.id;

    // Criação do perfil
    const profile = {
      id: createdUserId,
      nome: cleanName,
      tipo,
      matricula: isStudent ? cleanIdentifier : null
    };

    const { error: profileError } = await admin
      .from("perfis")
      .upsert(profile, {
        onConflict: "id"
      });

    if (profileError) {
      throw profileError;
    }

    // Resposta de sucesso
    return res.status(200).json({
      ok: true,
      message: "Usuário cadastrado com sucesso.",
      usuario: {
        id: createdUserId,
        nome: cleanName,
        tipo,
        identificador: cleanIdentifier,
        email
      }
    });

  } catch (error) {

    console.error(
      "Erro em cadastrar-usuario:",
      error
    );

    // Se o usuário foi criado, mas o perfil falhou,
    // exclui o usuário para evitar cadastro incompleto.
    if (createdUserId) {
      const { error: deleteError } =
        await admin.auth.admin.deleteUser(createdUserId);

      if (deleteError) {
        console.error(
          "Erro ao reverter criação do usuário:",
          deleteError
        );
      }
    }

    return res.status(400).json({
      error:
        error.message ||
        "Erro ao cadastrar usuário."
    });
  }
}
