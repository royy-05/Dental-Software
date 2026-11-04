-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_monthly" INTEGER NOT NULL,
    "limits" JSONB NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_carriers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "insurance_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starter_templates" (
    "id" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "flow" JSONB NOT NULL,
    "default_reasons" JSONB NOT NULL,

    CONSTRAINT "starter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_templates" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "legal_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percent_off" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "redemptions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "clinic_ids" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tone" TEXT NOT NULL DEFAULT 'info',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "platform_role" TEXT,
    "group_id" TEXT,
    "totp_secret_enc" TEXT,
    "two_factor" BOOLEAN NOT NULL DEFAULT false,
    "force_two_factor" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "invited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "impersonation_clinic_id" TEXT,
    "impersonation_reason" TEXT,
    "impersonation_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateTable
CREATE TABLE "clinic_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT,

    CONSTRAINT "clinic_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "custom_slug" TEXT,
    "specialty" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "plan_id" TEXT NOT NULL,
    "group_id" TEXT,
    "owner_user_id" TEXT,
    "time_zone" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "branding" JSONB NOT NULL,
    "hours" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "insurance_settings" JSONB NOT NULL,
    "sms_registration" TEXT NOT NULL DEFAULT 'not_started',
    "sms_credits_used" INTEGER NOT NULL DEFAULT 0,
    "emails_sent" INTEGER NOT NULL DEFAULT 0,
    "rwg" JSONB NOT NULL,
    "pms" JSONB NOT NULL,
    "custom_domain" TEXT,
    "retention_days" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3),
    "trial_ends_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockouts" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "provider_id" TEXT,
    "operatory_id" TEXT,

    CONSTRAINT "blockouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operatories" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "operatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_id" TEXT NOT NULL DEFAULT '',
    "photo_url" TEXT,
    "role" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "show_online" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_hours" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,

    CONSTRAINT "provider_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_breaks" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "weekday" INTEGER,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "provider_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_time_off" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "start" DATE NOT NULL,
    "end" DATE NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "provider_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_operatories" (
    "clinic_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "operatory_id" TEXT NOT NULL,

    CONSTRAINT "provider_operatories_pkey" PRIMARY KEY ("provider_id","operatory_id")
);

-- CreateTable
CREATE TABLE "reasons" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "long_description" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL,
    "patient_type" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "estimated_value" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'online',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "redirect_url" TEXT,
    "notice_override_hours" INTEGER,

    CONSTRAINT "reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_providers" (
    "clinic_id" TEXT NOT NULL,
    "reason_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,

    CONSTRAINT "reason_providers_pkey" PRIMARY KEY ("reason_id","provider_id")
);

-- CreateTable
CREATE TABLE "reason_operatories" (
    "clinic_id" TEXT NOT NULL,
    "reason_id" TEXT NOT NULL,
    "operatory_id" TEXT NOT NULL,

    CONSTRAINT "reason_operatories_pkey" PRIMARY KEY ("reason_id","operatory_id")
);

-- CreateTable
CREATE TABLE "clinic_insurances" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "carrier_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "custom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "clinic_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrers" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "public_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "redirect_url" TEXT,

    CONSTRAINT "referrers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_flows" (
    "clinic_id" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published_version" INTEGER NOT NULL,
    "draft_updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "clinic_flows_pkey" PRIMARY KEY ("clinic_id")
);

-- CreateTable
CREATE TABLE "flow_versions" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "config" JSONB NOT NULL,

    CONSTRAINT "flow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "reason_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "operatory_id" TEXT,
    "patient_type" TEXT NOT NULL,
    "message" TEXT,
    "booking_for_someone_else" BOOLEAN NOT NULL DEFAULT false,
    "booker_name" TEXT,
    "insurance" JSONB NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "files" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    "referrer_id" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "status" TEXT NOT NULL,
    "decline_reason" TEXT,
    "booked_by" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_notes" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT NOT NULL,
    "author_user_id" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "appointment_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "kind" TEXT NOT NULL,
    "given" BOOLEAN NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,
    "terms_version" TEXT NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_holds" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "operatory_id" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "session_id" TEXT NOT NULL,

    CONSTRAINT "slot_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_sessions" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "local_hour" INTEGER NOT NULL,
    "local_weekday" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reason_id" TEXT,
    "furthest_step" TEXT NOT NULL,
    "booked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "widget_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_events" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "step" TEXT,
    "reason_id" TEXT,
    "source" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "widget_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opt_outs" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "href" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "assignee_id" TEXT,
    "screenshot_name" TEXT,
    "first_response_at" TIMESTAMPTZ(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_name" TEXT NOT NULL,
    "author_role" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "dunning_emails_sent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_spend" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "ad_spend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "clinic_id" TEXT,
    "ip" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_carriers_name_key" ON "insurance_carriers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_slug_key" ON "clinics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_custom_slug_key" ON "clinics"("custom_slug");

-- CreateIndex
CREATE INDEX "clinics_status_idx" ON "clinics"("status");

-- CreateIndex
CREATE INDEX "memberships_clinic_id_idx" ON "memberships"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_clinic_id_key" ON "memberships"("user_id", "clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_clinic_id_key_key" ON "feature_flags"("clinic_id", "key");

-- CreateIndex
CREATE INDEX "holidays_clinic_id_date_idx" ON "holidays"("clinic_id", "date");

-- CreateIndex
CREATE INDEX "blockouts_clinic_id_start_idx" ON "blockouts"("clinic_id", "start");

-- CreateIndex
CREATE INDEX "operatories_clinic_id_idx" ON "operatories"("clinic_id");

-- CreateIndex
CREATE INDEX "providers_clinic_id_idx" ON "providers"("clinic_id");

-- CreateIndex
CREATE INDEX "provider_hours_clinic_id_idx" ON "provider_hours"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_hours_provider_id_weekday_key" ON "provider_hours"("provider_id", "weekday");

-- CreateIndex
CREATE INDEX "provider_breaks_provider_id_idx" ON "provider_breaks"("provider_id");

-- CreateIndex
CREATE INDEX "provider_breaks_clinic_id_idx" ON "provider_breaks"("clinic_id");

-- CreateIndex
CREATE INDEX "provider_time_off_provider_id_idx" ON "provider_time_off"("provider_id");

-- CreateIndex
CREATE INDEX "provider_time_off_clinic_id_idx" ON "provider_time_off"("clinic_id");

-- CreateIndex
CREATE INDEX "provider_operatories_clinic_id_idx" ON "provider_operatories"("clinic_id");

-- CreateIndex
CREATE INDEX "reasons_clinic_id_order_idx" ON "reasons"("clinic_id", "order");

-- CreateIndex
CREATE INDEX "reason_providers_clinic_id_idx" ON "reason_providers"("clinic_id");

-- CreateIndex
CREATE INDEX "reason_operatories_clinic_id_idx" ON "reason_operatories"("clinic_id");

-- CreateIndex
CREATE INDEX "clinic_insurances_clinic_id_idx" ON "clinic_insurances"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrers_clinic_id_public_id_key" ON "referrers"("clinic_id", "public_id");

-- CreateIndex
CREATE UNIQUE INDEX "flow_versions_clinic_id_version_key" ON "flow_versions"("clinic_id", "version");

-- CreateIndex
CREATE INDEX "patients_clinic_id_email_idx" ON "patients"("clinic_id", "email");

-- CreateIndex
CREATE INDEX "patients_clinic_id_phone_idx" ON "patients"("clinic_id", "phone");

-- CreateIndex
CREATE INDEX "patients_clinic_id_last_name_dob_idx" ON "patients"("clinic_id", "last_name", "dob");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_start_idx" ON "appointments"("clinic_id", "start");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_created_at_idx" ON "appointments"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_status_idx" ON "appointments"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "appointments_provider_id_start_idx" ON "appointments"("provider_id", "start");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "status_history_appointment_id_at_idx" ON "status_history"("appointment_id", "at");

-- CreateIndex
CREATE INDEX "status_history_clinic_id_idx" ON "status_history"("clinic_id");

-- CreateIndex
CREATE INDEX "appointment_notes_appointment_id_idx" ON "appointment_notes"("appointment_id");

-- CreateIndex
CREATE INDEX "appointment_notes_clinic_id_idx" ON "appointment_notes"("clinic_id");

-- CreateIndex
CREATE INDEX "consent_records_patient_id_idx" ON "consent_records"("patient_id");

-- CreateIndex
CREATE INDEX "consent_records_appointment_id_idx" ON "consent_records"("appointment_id");

-- CreateIndex
CREATE INDEX "consent_records_clinic_id_idx" ON "consent_records"("clinic_id");

-- CreateIndex
CREATE INDEX "slot_holds_clinic_id_provider_id_start_idx" ON "slot_holds"("clinic_id", "provider_id", "start");

-- CreateIndex
CREATE INDEX "slot_holds_expires_at_idx" ON "slot_holds"("expires_at");

-- CreateIndex
CREATE INDEX "widget_sessions_clinic_id_at_idx" ON "widget_sessions"("clinic_id", "at");

-- CreateIndex
CREATE INDEX "widget_events_clinic_id_at_idx" ON "widget_events"("clinic_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_clinic_id_event_channel_key" ON "message_templates"("clinic_id", "event", "channel");

-- CreateIndex
CREATE INDEX "message_logs_clinic_id_created_at_idx" ON "message_logs"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_appointment_id_idx" ON "message_logs"("appointment_id");

-- CreateIndex
CREATE INDEX "message_logs_status_idx" ON "message_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "opt_outs_clinic_id_phone_kind_key" ON "opt_outs"("clinic_id", "phone", "kind");

-- CreateIndex
CREATE INDEX "notifications_clinic_id_at_idx" ON "notifications"("clinic_id", "at");

-- CreateIndex
CREATE INDEX "tickets_clinic_id_created_at_idx" ON "tickets"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_messages_ticket_id_at_idx" ON "ticket_messages"("ticket_id", "at");

-- CreateIndex
CREATE INDEX "ticket_messages_clinic_id_idx" ON "ticket_messages"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_clinic_id_idx" ON "invoices"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_spend_clinic_id_month_source_key" ON "ad_spend"("clinic_id", "month", "source");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "audit_logs_clinic_id_at_idx" ON "audit_logs"("clinic_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_category_at_idx" ON "audit_logs"("category", "at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "clinic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "clinic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockouts" ADD CONSTRAINT "blockouts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operatories" ADD CONSTRAINT "operatories_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_hours" ADD CONSTRAINT "provider_hours_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_breaks" ADD CONSTRAINT "provider_breaks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_time_off" ADD CONSTRAINT "provider_time_off_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_operatories" ADD CONSTRAINT "provider_operatories_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_operatories" ADD CONSTRAINT "provider_operatories_operatory_id_fkey" FOREIGN KEY ("operatory_id") REFERENCES "operatories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasons" ADD CONSTRAINT "reasons_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reason_providers" ADD CONSTRAINT "reason_providers_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "reasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reason_providers" ADD CONSTRAINT "reason_providers_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reason_operatories" ADD CONSTRAINT "reason_operatories_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "reasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reason_operatories" ADD CONSTRAINT "reason_operatories_operatory_id_fkey" FOREIGN KEY ("operatory_id") REFERENCES "operatories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_insurances" ADD CONSTRAINT "clinic_insurances_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrers" ADD CONSTRAINT "referrers_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_flows" ADD CONSTRAINT "clinic_flows_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
