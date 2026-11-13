-- EXECUTE NO SQL EDITOR DO SUPABASE PARA CONFERIR O ESQUEMA.
-- ESTE ARQUIVO SOMENTE CONSULTA METADADOS; NÃO ALTERA DADOS.

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'perfis',
    'turmas',
    'disciplinas',
    'professor_turmas',
    'matriculas',
    'notas'
  )
ORDER BY table_name, ordinal_position;

-- CONFERIR SE RLS ESTÁ ATIVO NAS TABELAS DO SISTEMA.
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'perfis',
    'turmas',
    'disciplinas',
    'professor_turmas',
    'matriculas',
    'notas'
  )
ORDER BY tablename;

-- CONFERIR O ADMINISTRADOR EXISTENTE.
SELECT id, nome, tipo, matricula
FROM public.perfis
WHERE lower(tipo) = 'admin';

-- CONFERIR SE EXISTEM NOTAS DUPLICADAS ANTES DE CRIAR A CONSTRAINT DO UPSERT.
SELECT matricula_id, disciplina_id, bimestre, COUNT(*) AS quantidade
FROM public.notas
GROUP BY matricula_id, disciplina_id, bimestre
HAVING COUNT(*) > 1;
