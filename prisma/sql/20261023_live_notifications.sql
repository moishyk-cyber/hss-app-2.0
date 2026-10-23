-- Apply only in the intended environment (testing here; public at production deployment).
-- The browser never receives this privileged key. Only the authenticated app server subscribes.
-- Do not grant Notification access to anon/authenticated roles or loosen its RLS policies.
DO $$
DECLARE target_schema text := current_schema();
BEGIN
  IF target_schema NOT IN ('testing', 'public') THEN
    RAISE EXCEPTION 'Select the app environment schema before applying this migration';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', target_schema);
  EXECUTE format('GRANT SELECT ON TABLE %I."Notification" TO service_role', target_schema);
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname=target_schema AND tablename='Notification') THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I."Notification"', target_schema);
  END IF;
END $$;
