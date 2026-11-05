-- Row-level security: a clinic can never read or write another clinic's rows.
--
-- Every request runs inside a transaction that sets, with set_config(..., true) (transaction-local):
--   app.scope     = 'tenant' | 'platform'
--   app.clinic_id = the clinic the request is scoped to (tenant scope only)
-- Tenant scope sees only rows whose clinic_id matches. Platform scope (super admin panel, background jobs)
-- sees everything. No scope set = no rows (fail closed).
--
-- The runtime role kivi_app is not the table owner and is NOBYPASSRLS. FORCE ROW LEVEL SECURITY also applies
-- the policies to the owner role, so a mis-configured connection still fails closed.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kivi_app') THEN
    CREATE ROLE kivi_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_clinic_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.clinic_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.scope', true), '') = 'platform' $$;

-- Public booking pages need to turn a slug into a clinic id before any tenant scope exists.
-- SECURITY DEFINER exposes only the id of a bookable (not deleted) clinic. FORCE RLS applies to the owner too,
-- so the function switches to platform scope for the lookup and restores the caller's scope before returning.
CREATE OR REPLACE FUNCTION clinic_id_for_slug(p_slug text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev text := coalesce(current_setting('app.scope', true), '');
  found text;
BEGIN
  PERFORM set_config('app.scope', 'platform', true);
  SELECT id INTO found FROM clinics WHERE (slug = p_slug OR custom_slug = p_slug) AND deleted_at IS NULL LIMIT 1;
  PERFORM set_config('app.scope', prev, true);
  RETURN found;
END $$;
REVOKE ALL ON FUNCTION clinic_id_for_slug(text) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO kivi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kivi_app;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE _prisma_migrations FROM kivi_app;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION app_clinic_id(), app_is_platform(), clinic_id_for_slug(text) TO kivi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kivi_app;

-- clinics: a tenant sees only its own clinic row.
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON clinics
  USING (app_is_platform() OR id = app_clinic_id())
  WITH CHECK (app_is_platform() OR id = app_clinic_id());

-- message_templates: clinic_id NULL rows are the global defaults, readable by every tenant, writable by platform only.
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY template_read ON message_templates FOR SELECT
  USING (app_is_platform() OR clinic_id IS NULL OR clinic_id = app_clinic_id());
CREATE POLICY template_write ON message_templates FOR ALL
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

-- audit_logs: tenants may add and read entries for their clinic only; platform entries (clinic_id NULL) are platform-only.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_isolation ON audit_logs
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());
-- The audit trail is append-only for the runtime role.
REVOKE UPDATE ON audit_logs FROM kivi_app;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feature_flags
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON holidays
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE blockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockouts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blockouts
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE operatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE operatories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON operatories
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON providers
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE provider_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_hours FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_hours
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE provider_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_breaks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_breaks
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE provider_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_time_off FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_time_off
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE provider_operatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_operatories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_operatories
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasons FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reasons
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE reason_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reason_providers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reason_providers
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE reason_operatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE reason_operatories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reason_operatories
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE clinic_insurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_insurances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clinic_insurances
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE referrers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON referrers
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE clinic_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_flows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clinic_flows
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON flow_versions
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patients
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON status_history
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE appointment_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointment_notes
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON consent_records
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE slot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON slot_holds
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE widget_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON widget_sessions
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE widget_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON widget_events
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON message_logs
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_outs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON opt_outs
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticket_messages
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ad_spend
  USING (app_is_platform() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_platform() OR clinic_id = app_clinic_id());

-- Double-booking backstop: the booking engine checks availability under an advisory lock, and these
-- exclusion constraints make it impossible at the database level for two active appointments to overlap
-- for the same provider or the same operatory.
ALTER TABLE appointments ADD CONSTRAINT appointments_no_provider_overlap
  EXCLUDE USING gist (provider_id WITH =, tsrange(start, "end", '[)') WITH &&)
  WHERE (status NOT IN ('cancelled', 'declined'));
ALTER TABLE appointments ADD CONSTRAINT appointments_no_operatory_overlap
  EXCLUDE USING gist (operatory_id WITH =, tsrange(start, "end", '[)') WITH &&)
  WHERE (operatory_id IS NOT NULL AND status NOT IN ('cancelled', 'declined'));
ALTER TABLE appointments ADD CONSTRAINT appointments_end_after_start CHECK ("end" > start);
ALTER TABLE slot_holds ADD CONSTRAINT slot_holds_end_after_start CHECK ("end" > start);
