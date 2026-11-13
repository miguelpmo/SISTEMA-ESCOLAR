-- MODELO DE POLÍTICAS PARA O ESQUEMA DESCRITO EM GUIA_COMPLETO.MD.
-- LEIA ANTES DE EXECUTAR. FAÇA BACKUP E CONFIRME NOMES/TIPOS DAS COLUNAS.
-- ESTE SCRIPT HABILITA RLS E SUBSTITUI POLÍTICAS COM OS NOMES ABAIXO.
-- NÃO REMOVE OUTRAS POLÍTICAS EXISTENTES COM NOMES DIFERENTES.

CREATE OR REPLACE FUNCTION public.app_perfil_tipo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(tipo::text)
  FROM public.perfis
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_e_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.app_perfil_tipo() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.app_professor_tem_turma(p_turma_id bigint, p_disciplina_id bigint DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professor_turmas pt
    WHERE pt.professor_id = auth.uid()
      AND pt.turma_id = p_turma_id
      AND (p_disciplina_id IS NULL OR pt.disciplina_id = p_disciplina_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.app_aluno_tem_matricula(p_matricula_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.id = p_matricula_id
      AND m.aluno_id = auth.uid()
  );
$$;

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;

-- PERFIS: ADMIN VÊ TODOS; CADA USUÁRIO VÊ O PRÓPRIO PERFIL;
-- PROFESSOR VÊ PERFIS DE ALUNOS MATRICULADOS EM TURMAS ATRIBUÍDAS.
DROP POLICY IF EXISTS app_perfis_select ON public.perfis;
CREATE POLICY app_perfis_select ON public.perfis
FOR SELECT TO authenticated
USING (
  public.app_e_admin()
  OR id = auth.uid()
  OR (
    lower(tipo::text) = 'aluno'
    AND EXISTS (
      SELECT 1
      FROM public.matriculas m
      JOIN public.professor_turmas pt ON pt.turma_id = m.turma_id
      WHERE m.aluno_id = perfis.id
        AND pt.professor_id = auth.uid()
    )
  )
);
DROP POLICY IF EXISTS app_perfis_admin_all ON public.perfis;
CREATE POLICY app_perfis_admin_all ON public.perfis
FOR ALL TO authenticated
USING (public.app_e_admin())
WITH CHECK (public.app_e_admin());

-- TURMAS
DROP POLICY IF EXISTS app_turmas_select ON public.turmas;
CREATE POLICY app_turmas_select ON public.turmas
FOR SELECT TO authenticated
USING (
  public.app_e_admin()
  OR EXISTS (SELECT 1 FROM public.professor_turmas pt WHERE pt.turma_id = turmas.id AND pt.professor_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.matriculas m WHERE m.turma_id = turmas.id AND m.aluno_id = auth.uid())
);
DROP POLICY IF EXISTS app_turmas_admin_all ON public.turmas;
CREATE POLICY app_turmas_admin_all ON public.turmas
FOR ALL TO authenticated
USING (public.app_e_admin())
WITH CHECK (public.app_e_admin());

-- DISCIPLINAS
DROP POLICY IF EXISTS app_disciplinas_select ON public.disciplinas;
CREATE POLICY app_disciplinas_select ON public.disciplinas
FOR SELECT TO authenticated
USING (
  public.app_e_admin()
  OR EXISTS (SELECT 1 FROM public.professor_turmas pt WHERE pt.disciplina_id = disciplinas.id AND pt.professor_id = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.notas n
    JOIN public.matriculas m ON m.id = n.matricula_id
    WHERE n.disciplina_id = disciplinas.id AND m.aluno_id = auth.uid()
  )
);
DROP POLICY IF EXISTS app_disciplinas_admin_all ON public.disciplinas;
CREATE POLICY app_disciplinas_admin_all ON public.disciplinas
FOR ALL TO authenticated
USING (public.app_e_admin())
WITH CHECK (public.app_e_admin());

-- VÍNCULOS PROFESSOR/TURMA/DISCIPLINA
DROP POLICY IF EXISTS app_professor_turmas_select ON public.professor_turmas;
CREATE POLICY app_professor_turmas_select ON public.professor_turmas
FOR SELECT TO authenticated
USING (public.app_e_admin() OR professor_id = auth.uid());
DROP POLICY IF EXISTS app_professor_turmas_admin_all ON public.professor_turmas;
CREATE POLICY app_professor_turmas_admin_all ON public.professor_turmas
FOR ALL TO authenticated
USING (public.app_e_admin())
WITH CHECK (public.app_e_admin());

-- MATRÍCULAS
DROP POLICY IF EXISTS app_matriculas_select ON public.matriculas;
CREATE POLICY app_matriculas_select ON public.matriculas
FOR SELECT TO authenticated
USING (
  public.app_e_admin()
  OR aluno_id = auth.uid()
  OR public.app_professor_tem_turma(turma_id)
);
DROP POLICY IF EXISTS app_matriculas_admin_all ON public.matriculas;
CREATE POLICY app_matriculas_admin_all ON public.matriculas
FOR ALL TO authenticated
USING (public.app_e_admin())
WITH CHECK (public.app_e_admin());

-- NOTAS: ALUNO VÊ AS PRÓPRIAS; PROFESSOR VÊ/ALTERA NOTAS DA SUA ATRIBUIÇÃO;
-- ADMINISTRADOR VÊ TODAS. O UPSERT EXIGE A CONSTRAINT UNIQUE INDICADA NO GUIA.
DROP POLICY IF EXISTS app_notas_select ON public.notas;
CREATE POLICY app_notas_select ON public.notas
FOR SELECT TO authenticated
USING (
  public.app_e_admin()
  OR public.app_aluno_tem_matricula(matricula_id)
  OR EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.id = notas.matricula_id
      AND public.app_professor_tem_turma(m.turma_id, notas.disciplina_id)
  )
);
DROP POLICY IF EXISTS app_notas_insert ON public.notas;
CREATE POLICY app_notas_insert ON public.notas
FOR INSERT TO authenticated
WITH CHECK (
  public.app_e_admin()
  OR (
    professor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.matriculas m
      WHERE m.id = notas.matricula_id
        AND public.app_professor_tem_turma(m.turma_id, notas.disciplina_id)
    )
  )
);
DROP POLICY IF EXISTS app_notas_update ON public.notas;
CREATE POLICY app_notas_update ON public.notas
FOR UPDATE TO authenticated
USING (
  public.app_e_admin()
  OR EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.id = notas.matricula_id
      AND public.app_professor_tem_turma(m.turma_id, notas.disciplina_id)
  )
)
WITH CHECK (
  public.app_e_admin()
  OR (
    professor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.matriculas m
      WHERE m.id = notas.matricula_id
        AND public.app_professor_tem_turma(m.turma_id, notas.disciplina_id)
    )
  )
);

-- OBS: ESTE MODELO SUPÕE IDS NUMÉRICOS (BIGINT) PARA TURMAS, DISCIPLINAS E MATRÍCULAS.
-- SE O DIAGNÓSTICO MOSTRAR INTEGER, O POSTGRES CONVERTE INTEGER PARA BIGINT EM CHAMADAS.
-- SE USAR UUID OU OUTROS NOMES DE COLUNA, ADAPTE AS FUNÇÕES ANTES DE EXECUTAR.
