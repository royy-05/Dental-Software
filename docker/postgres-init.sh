#!/bin/sh
# Runs once when the Postgres volume is created. Creates the runtime role the app connects as.
# kivi_app is NOT the table owner and has NOBYPASSRLS, so row-level security always applies to it.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kivi_app') THEN
    CREATE ROLE kivi_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${KIVI_APP_PASSWORD}';
  END IF;
END \$\$;
CREATE DATABASE kivi_test OWNER kivi;
SQL
