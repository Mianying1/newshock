-- Add 'mixed' to exposure_type enum + new context_label column.
--
-- Audit (2026-04-24) found 75 tickers classified with conflicting exposure
-- across multiple themes (e.g. ANET = direct in AI Capex, pressure in CPO).
-- Some are true contradictions (HIMS/WBA), some are different business
-- segments hitting different themes (INTC CPU vs Foundry), and some are
-- legitimately mixed (ANET/AVGO benefit AI capex spend but threatened by CPO
-- integration). LLM second-pass disambiguation needs a 'mixed' value plus a
-- short human-readable label explaining the per-theme angle.

-- Drop the old CHECK and re-add with 'mixed' included.
-- (Some env paths may have created the column without the CHECK; both
-- migrations 20260422000011 and 20260423000001 added the column. Coalesce.)
do $$
declare
  conname text;
begin
  for conname in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'theme_recommendations'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%exposure_type%'
  loop
    execute format('alter table theme_recommendations drop constraint %I', conname);
  end loop;
end $$;

alter table theme_recommendations
  add constraint theme_recommendations_exposure_type_check
  check (exposure_type is null or exposure_type in ('direct', 'observational', 'pressure', 'mixed'));

alter table theme_recommendations
  add column if not exists context_label text;

comment on column theme_recommendations.context_label is
  'Short human-readable disambiguation shown alongside the ticker when its exposure differs across themes (e.g. "CPU business only", "Foundry play", "Mixed: benefits capex, pressured by integration").';
