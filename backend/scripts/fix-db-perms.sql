-- PURRE PETS — naprawa uprawnień PostgreSQL (błąd 42501 / insufficient_privilege).
-- Uruchamiać jako superuser: sudo -u postgres psql -d purrepets -f fix-db-perms.sql
-- Idempotentny — deploy.sh wykonuje go przy każdym wdrożeniu.

ALTER DATABASE purrepets OWNER TO postgres;
ALTER SCHEMA public OWNER TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Własność i pełne uprawnienia do WSZYSTKICH tabel i sekwencji (także Subscription).
DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', obj.tablename);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO postgres', obj.tablename);
  END LOOP;
  FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO postgres', obj.sequencename);
    EXECUTE format('GRANT ALL PRIVILEGES ON SEQUENCE public.%I TO postgres', obj.sequencename);
  END LOOP;
END
$$;

-- Domyślne uprawnienia dla tabel tworzonych przez przyszłe migracje Prisma.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
