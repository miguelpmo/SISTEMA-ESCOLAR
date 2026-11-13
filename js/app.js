import { supabase } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let user = null;
let profile = null;
let cache = {};

const msg = (selector, text) => {
  const element = $(selector);
  if (element) element.textContent = text || "";
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

// Lê a resposta como texto primeiro para não quebrar quando o servidor
// retornar uma página de erro ou uma mensagem que não seja JSON.
async function readApiResponse(response, context = "servidor") {
  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    console.error(`Resposta não JSON (${context}):`, response.status, responseText);
    throw new Error(
      `O servidor retornou uma resposta inválida (HTTP ${response.status}). ` +
      "Consulte os logs da função no Vercel."
    );
  }

  if (!response.ok) {
    throw new Error(data.error || `Falha na requisição (HTTP ${response.status}).`);
  }

  return data;
}

async function api(path, body) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) {
    throw new Error("Sua sessão expirou. Faça login novamente.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  });

  return readApiResponse(response, path);
}

async function boot() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  if (!session) {
    $("#login").hidden = false;
    $("#app").hidden = true;
    return;
  }

  user = session.user;
  const { data, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  profile = data;

  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#who").textContent = `${profile.nome} • ${profile.tipo}`;
  $("#admin").hidden = profile.tipo !== "admin";
  $("#teacher").hidden = profile.tipo !== "professor";
  $("#student").hidden = profile.tipo !== "aluno";

  if (profile.tipo === "admin") await loadAdmin();
  if (profile.tipo === "professor") await loadTeacher();
  if (profile.tipo === "aluno") await loadStudent();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  msg("#loginMsg", "Entrando...");

  try {
    const identifier = $("#identificador").value.trim();
    const password = $("#senha").value;

    if (identifier.includes("@")) {
      const { error } = await supabase.auth.signInWithPassword({
        email: identifier,
        password
      });
      if (error) throw error;
    } else {
      const response = await fetch("/api/login-aluno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula: identifier, senha: password })
      });
      const result = await readApiResponse(response, "/api/login-aluno");

      if (!result.session?.access_token || !result.session?.refresh_token) {
        throw new Error("O servidor não retornou uma sessão válida. Verifique a API de login.");
      }

      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
    }

    await boot();
  } catch (error) {
    console.error("Erro no login:", error);
    msg("#loginMsg", error.message || "Não foi possível entrar.");
  }
});

$("#logout").onclick = async () => {
  await supabase.auth.signOut();
  location.reload();
};

$$("[data-tab]").forEach((button) => {
  button.onclick = () => {
    $$(".tab").forEach((element) => { element.hidden = true; });
    $$("[data-tab]").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    $(`#tab-${button.dataset.tab}`).hidden = false;
  };
});

async function rows(table, columns = "*") {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw error;
  return data || [];
}

function tableHTML(headers, dataRows) {
  const body = dataRows.length
    ? dataRows.map((row) => `<tr>${row.map((item) => `<td>${item ?? ""}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">NENHUM REGISTRO ENCONTRADO.</td></tr>`;
  return `<table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

async function loadAdmin() {
  const [profiles, classes, subjects, enrollments, assignments, grades] = await Promise.all([
    rows("perfis"),
    rows("turmas"),
    rows("disciplinas"),
    rows("matriculas"),
    rows("professor_turmas"),
    rows("notas")
  ]);

  cache = { profiles, classes, subjects, enrollments, assignments, grades };

  $("#usersList").innerHTML = tableHTML(
    ["Nome", "Tipo", "Matrícula / e-mail"],
    profiles.map((item) => [esc(item.nome), esc(item.tipo), esc(item.matricula || "—")])
  );
  $("#classesList").innerHTML = tableHTML(
    ["Turma", "Ano"],
    classes.map((item) => [esc(item.nome), item.ano_letivo])
  );
  $("#subjectsList").innerHTML = tableHTML(
    ["Disciplina"],
    subjects.map((item) => [esc(item.nome)])
  );

  const students = profiles.filter((item) => item.tipo === "aluno");
  const teachers = profiles.filter((item) => item.tipo === "professor");

  $("#enrollStudent").innerHTML = students
    .map((item) => `<option value="${esc(item.id)}">${esc(item.nome)} (${esc(item.matricula || "")})</option>`)
    .join("");
  $("#assignTeacher").innerHTML = teachers
    .map((item) => `<option value="${esc(item.id)}">${esc(item.nome)}</option>`)
    .join("");

  const classOptions = classes
    .map((item) => `<option value="${esc(item.id)}">${esc(item.nome)}</option>`)
    .join("");
  $("#enrollClass").innerHTML = classOptions;
  $("#assignClass").innerHTML = classOptions;
  $("#assignSubject").innerHTML = subjects
    .map((item) => `<option value="${esc(item.id)}">${esc(item.nome)}</option>`)
    .join("");

  $("#enrollList").innerHTML = tableHTML(
    ["Aluno", "Turma"],
    enrollments.map((enrollment) => [
      esc(students.find((item) => item.id === enrollment.aluno_id)?.nome || enrollment.aluno_id),
      esc(classes.find((item) => item.id === enrollment.turma_id)?.nome || enrollment.turma_id)
    ])
  );
  $("#assignList").innerHTML = tableHTML(
    ["Professor", "Turma", "Disciplina"],
    assignments.map((assignment) => [
      esc(teachers.find((item) => item.id === assignment.professor_id)?.nome || ""),
      esc(classes.find((item) => item.id === assignment.turma_id)?.nome || ""),
      esc(subjects.find((item) => item.id === assignment.disciplina_id)?.nome || "")
    ])
  );
  $("#allGrades").innerHTML = tableHTML(
    ["Aluno", "Disciplina", "Bimestre", "Nota"],
    grades.map((grade) => {
      const enrollment = enrollments.find((item) => item.id === grade.matricula_id);
      return [
        esc(students.find((item) => item.id === enrollment?.aluno_id)?.nome || ""),
        esc(subjects.find((item) => item.id === grade.disciplina_id)?.nome || ""),
        grade.bimestre,
        grade.nota
      ];
    })
  );
}

$("#userForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    await api("/api/cadastrar-usuario", {
      nome: form.get("nome"),
      tipo: form.get("tipo"),
      identificador: form.get("identificador"),
      senha: form.get("senha")
    });
    msg("#userMsg", "Usuário cadastrado.");
    event.target.reset();
    await loadAdmin();
  } catch (error) {
    msg("#userMsg", error.message);
  }
};

$("#classForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const { error } = await supabase.from("turmas").insert({
      nome: form.get("nome"),
      ano_letivo: Number(form.get("ano_letivo"))
    });
    if (error) throw error;
    event.target.reset();
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

$("#subjectForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const { error } = await supabase.from("disciplinas").insert({ nome: form.get("nome") });
    if (error) throw error;
    event.target.reset();
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

$("#enrollForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const { error } = await supabase.from("matriculas").insert({
      aluno_id: form.get("aluno_id"),
      turma_id: Number(form.get("turma_id"))
    });
    if (error) throw error;
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

$("#assignForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const { error } = await supabase.from("professor_turmas").insert({
      professor_id: form.get("professor_id"),
      turma_id: Number(form.get("turma_id")),
      disciplina_id: Number(form.get("disciplina_id"))
    });
    if (error) throw error;
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

async function loadTeacher() {
  const [assignments, classes, subjects, enrollments, profiles] = await Promise.all([
    rows("professor_turmas"),
    rows("turmas"),
    rows("disciplinas"),
    rows("matriculas"),
    rows("perfis")
  ]);

  cache = {
    assignments: assignments.filter((item) => item.professor_id === user.id),
    classes,
    subjects,
    enrollments,
    profiles
  };

  const teacherAssignments = cache.assignments;
  $("#gradeClass").innerHTML = [...new Set(teacherAssignments.map((item) => item.turma_id))]
    .map((id) => `<option value="${esc(id)}">${esc(classes.find((item) => item.id === id)?.nome || id)}</option>`)
    .join("");
  $("#gradeClass").onchange = () => {
    updateTeacherSubjects();
    showGradeStudents().catch((error) => msg("#gradeMsg", error.message));
  };
  $("#gradeSubject").onchange = () => showGradeStudents().catch((error) => msg("#gradeMsg", error.message));
  updateTeacherSubjects();
  $("#gradeTerm").onchange = () => showGradeStudents().catch((error) => msg("#gradeMsg", error.message));
  await showGradeStudents();
}



function updateTeacherSubjects() {
  const classId = Number($("#gradeClass").value);
  const assignedSubjectIds = [...new Set(
    cache.assignments
      .filter((item) => Number(item.turma_id) === classId)
      .map((item) => Number(item.disciplina_id))
  )];
  $("#gradeSubject").innerHTML = assignedSubjectIds
    .map((id) => `<option value="${esc(id)}">${esc(cache.subjects.find((item) => Number(item.id) === id)?.nome || id)}</option>`)
    .join("");
}

async function showGradeStudents() {
  const classId = Number($("#gradeClass").value);
  const subjectId = Number($("#gradeSubject").value);
  const term = Number($("#gradeTerm").value);
  if (!classId || !subjectId) {
    $("#gradeStudents").innerHTML = "<p>NENHUMA TURMA OU DISCIPLINA DISPONÍVEL PARA ESTE PROFESSOR.</p>";
    return;
  }
  const allowed = cache.assignments.some((item) =>
    Number(item.turma_id) === classId && Number(item.disciplina_id) === subjectId
  );
  if (!allowed) {
    $("#gradeStudents").innerHTML = "<p>ESTA DISCIPLINA NÃO ESTÁ ATRIBUÍDA A ESTA TURMA.</p>";
    return;
  }

  const enrollments = cache.enrollments.filter((item) => Number(item.turma_id) === classId);
  const { data: grades, error } = await supabase
    .from("notas")
    .select("*")
    .eq("disciplina_id", subjectId)
    .eq("bimestre", term);
  if (error) throw error;

  $("#gradeStudents").innerHTML = enrollments.map((enrollment) => {
    const student = cache.profiles.find((item) => item.id === enrollment.aluno_id);
    const grade = grades.find((item) => item.matricula_id === enrollment.id);
    return `<label>${esc(student?.nome || "Aluno")}<input type="number" min="0" max="10" step="0.1" name="grade_${esc(enrollment.id)}" data-matricula="${esc(enrollment.id)}" value="${grade?.nota ?? ""}" placeholder="0 a 10"></label>`;
  }).join("") || "<p>Nenhum aluno matriculado nesta turma.</p>";
}

$("#gradeForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const classId = Number($("#gradeClass").value);
    const subjectId = Number($("#gradeSubject").value);
    const term = Number($("#gradeTerm").value);
    const allowed = cache.assignments.some((item) =>
      Number(item.turma_id) === classId && Number(item.disciplina_id) === subjectId
    );
    if (!allowed) throw new Error("VOCÊ NÃO ESTÁ ATRIBUÍDO A ESTA DISCIPLINA NESTA TURMA.");

    for (const input of $$('[data-matricula]')) {
      if (input.value === "") continue;
      const enrollmentId = Number(input.dataset.matricula);
      const validEnrollment = cache.enrollments.some((item) =>
        Number(item.id) === enrollmentId && Number(item.turma_id) === classId
      );
      if (!validEnrollment) throw new Error("ALUNO FORA DA TURMA SELECIONADA.");
      const grade = Number(input.value);
      if (!Number.isFinite(grade) || grade < 0 || grade > 10) {
        throw new Error("As notas devem estar entre 0 e 10.");
      }

      const { error } = await supabase.from("notas").upsert({
        matricula_id: Number(input.dataset.matricula),
        disciplina_id: subjectId,
        bimestre: term,
        nota: grade,
        professor_id: user.id
      }, { onConflict: "matricula_id,disciplina_id,bimestre" });
      if (error) throw error;
    }

    msg("#gradeMsg", "Notas salvas com sucesso.");
  } catch (error) {
    msg("#gradeMsg", error.message);
  }
};

async function loadStudent() {
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("matriculas")
    .select("*")
    .eq("aluno_id", user.id);
  if (enrollmentError) throw enrollmentError;

  const enrollmentIds = enrollments.map((item) => item.id);
  let grades = [];
  if (enrollmentIds.length) {
    const { data, error } = await supabase
      .from("notas")
      .select("*")
      .in("matricula_id", enrollmentIds);
    if (error) throw error;
    grades = data || [];
  }

  const subjects = await rows("disciplinas");
  const gradesBySubject = {};

  for (const grade of grades) {
    const subjectName = subjects.find((item) => item.id === grade.disciplina_id)?.nome || "Disciplina";
    (gradesBySubject[subjectName] ??= [])[grade.bimestre] = grade.nota;
  }

  const subjectNames = Object.keys(gradesBySubject);
  $("#myReport").innerHTML = subjectNames.length
    ? tableHTML(
      ["Disciplina", "1º bim.", "2º bim.", "3º bim.", "4º bim.", "Média parcial"],
      subjectNames.map((name) => {
        const subjectGrades = gradesBySubject[name];
        const values = [1, 2, 3, 4].map((term) => subjectGrades[term]);
        const validValues = values.filter((value) => value !== undefined && value !== null);
        const average = validValues.length
          ? (validValues.reduce((sum, value) => sum + Number(value), 0) / validValues.length).toFixed(1)
          : "—";
        return [esc(name), ...values.map((value) => value ?? "—"), average];
      })
    )
    : "<p>Seu boletim ainda não possui notas lançadas.</p>";
}

try {
  await boot();
} catch (error) {
  console.error("Erro ao iniciar o sistema:", error);
  $("#login").hidden = false;
  $("#app").hidden = true;
  msg("#loginMsg", error.message || "Não foi possível carregar o sistema.");
}
