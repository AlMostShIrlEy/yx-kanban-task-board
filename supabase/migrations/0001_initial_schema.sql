-- ============================================================
-- 0001_initial_schema.sql — Kanban Task Board
-- ------------------------------------------------------------
-- Source of truth: docs/PLAN.md §3 (Database Schema)
-- Run in Supabase SQL Editor. To re-run with a clean slate during
-- development, FIRST run:   SET app.allow_destructive_migration = 'true';
-- in the same session.  Otherwise destructive drops are skipped.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ------------------------------------------------------------
-- 1. Destructive cleanup (GUC-guarded)
-- ------------------------------------------------------------
-- Only runs when the session has `app.allow_destructive_migration`
-- set to the literal string 'true'. Default off → safe re-run.
-- The second arg to current_setting() makes missing GUCs return NULL
-- instead of raising, so an unset GUC falls through to ELSE.
DO $$
BEGIN
  IF current_setting('app.allow_destructive_migration', true) = 'true' THEN
    DROP TABLE IF EXISTS public.task_labels CASCADE;
    DROP TABLE IF EXISTS public.labels      CASCADE;
    DROP TABLE IF EXISTS public.tasks       CASCADE;
    DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
    RAISE NOTICE 'Destructive drops executed.';
  ELSE
    RAISE NOTICE 'Skipping destructive drops (set app.allow_destructive_migration = ''true'' to enable).';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------

-- tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(title) <= 200),
  description text,
  status      text NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
  priority    text NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('low', 'normal', 'high')),
  due_date    date,
  color       text CHECK (color IN ('blue', 'purple', 'pink', 'orange', 'green', 'yellow')),
  position    double precision NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- labels
-- color check accepts 12 hues (the original 6 card colors + 6 label-only
-- additions). Keep aligned with LABEL_COLORS in src/types/index.ts.
CREATE TABLE IF NOT EXISTS public.labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) <= 30),
  color      text NOT NULL CHECK (color IN ('blue', 'purple', 'pink', 'orange', 'green', 'yellow', 'teal', 'cyan', 'red', 'lime', 'slate', 'fuchsia')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labels_user_name_unique UNIQUE (user_id, name)
);

-- task_labels (join table)
CREATE TABLE IF NOT EXISTS public.task_labels (
  task_id  uuid NOT NULL REFERENCES public.tasks(id)  ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------
-- Primary read pattern: board fetch grouped by status, ordered by position.
CREATE INDEX IF NOT EXISTS tasks_user_status_position_idx
  ON public.tasks (user_id, status, position);

-- Secondary read pattern: "due soon" / overdue queries.
-- Partial index: many tasks have no due_date. Skipping NULL rows keeps the
-- index small. All our planned queries on this column ("overdue", "due soon")
-- filter with predicates that imply due_date IS NOT NULL, so the planner can
-- use the partial index for them.
CREATE INDEX IF NOT EXISTS tasks_user_due_date_idx
  ON public.tasks (user_id, due_date)
  WHERE due_date IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Triggers
-- ------------------------------------------------------------
-- Auto-update updated_at on every row UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
-- Every table is RLS-enabled. Policies use auth.uid() to scope reads/writes
-- to the calling user. NEVER trust client-side user_id filtering.
-- All policies are scoped TO authenticated to match the Section 6 GRANTs;
-- the 'anon' role can't reach these tables anyway (no GRANT), but the
-- explicit TO clause makes intent unambiguous and is defense in depth.

ALTER TABLE public.tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;

-- ===== tasks policies =====
DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select_own ON public.tasks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
CREATE POLICY tasks_insert_own ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
CREATE POLICY tasks_update_own ON public.tasks
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_delete_own ON public.tasks
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ===== labels policies =====
DROP POLICY IF EXISTS labels_select_own ON public.labels;
CREATE POLICY labels_select_own ON public.labels
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS labels_insert_own ON public.labels;
CREATE POLICY labels_insert_own ON public.labels
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS labels_update_own ON public.labels;
CREATE POLICY labels_update_own ON public.labels
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS labels_delete_own ON public.labels;
CREATE POLICY labels_delete_own ON public.labels
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ===== task_labels policies =====
-- task_labels has no user_id column; isolation is enforced by joining
-- through the parent tasks row.
DROP POLICY IF EXISTS task_labels_select_own ON public.task_labels;
CREATE POLICY task_labels_select_own ON public.task_labels
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_labels.task_id
        AND tasks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS task_labels_insert_own ON public.task_labels;
CREATE POLICY task_labels_insert_own ON public.task_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_labels.task_id
        AND tasks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS task_labels_delete_own ON public.task_labels;
CREATE POLICY task_labels_delete_own ON public.task_labels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_labels.task_id
        AND tasks.user_id = auth.uid()
    )
  );

-- No UPDATE policy on task_labels: a (task_id, label_id) pair is the entire row;
-- to "change" a link the app deletes the old row and inserts a new one.

-- ------------------------------------------------------------
-- 6. Grants
-- ------------------------------------------------------------
-- Supabase exposes tables to the API only when the role has SQL-level
-- privileges. RLS policies above narrow which ROWS each role can see.
-- App uses Supabase Anonymous Auth → users are 'authenticated', not 'anon'.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labels      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.task_labels TO authenticated;
-- (no UPDATE on task_labels: PK-only row, app uses DELETE+INSERT)

-- ------------------------------------------------------------
-- 7. API exposure
-- ------------------------------------------------------------
-- This project has "Automatically expose new tables" disabled in Supabase
-- settings, so we must explicitly enable Data API access. Section 6 GRANTs
-- are the core mechanism; this section adds the two surrounding pieces:
--   1. Schema-level USAGE — a role can't reach a table unless it can also
--      "see" the schema. Supabase usually grants this by default, but with
--      hardening enabled we don't assume it.
--   2. PostgREST schema cache reload — the API gateway caches the schema
--      and may not pick up newly-GRANTed tables until told to refresh.

GRANT USAGE ON SCHEMA public TO authenticated;
-- (anon intentionally NOT granted: app uses Supabase Anonymous Auth, which
-- gives users the 'authenticated' role; we don't want truly-unauthenticated
-- requests to even reach the schema.)

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8. Realtime configuration
-- ------------------------------------------------------------
-- Required for realtime DELETE events: payload.old must include user_id
-- so the channel filter (user_id=eq.<userId>) can match. DEFAULT replica
-- identity only includes PK, which causes server-side filter to drop
-- DELETE events.
--
-- Applied to tables that the client subscribes to WITH a column-based
-- filter. task_labels is NOT changed because its channel listener has
-- no filter (RLS-only gating). Re-running these statements is safe —
-- REPLICA IDENTITY is a SET, not an ADD.

ALTER TABLE public.tasks  REPLICA IDENTITY FULL;
ALTER TABLE public.labels REPLICA IDENTITY FULL;

-- Publication membership is configured via the Supabase dashboard
-- (Database → Replication → supabase_realtime). The ALTER PUBLICATION
-- statements below are kept as a reference for fresh-DB recovery; do NOT
-- run them blindly because they error if the table is already a member
-- ("relation ... is already member of publication ...").
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.labels;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.task_labels;
