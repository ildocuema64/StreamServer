-- =============================================================================
-- StreamServer + Supabase Auth (run ONLY in Supabase SQL Editor)
-- =============================================================================
-- Prerequisites: already ran infrastructure/postgres/init.sql (users has auth_user_id).
--
-- 1) Foreign key to auth.users
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_auth_user_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2) On new Auth signup: mirror into public.users + dj_profile (main station)
CREATE OR REPLACE FUNCTION public.streamserver_handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname TEXT;
  dname TEXT;
  station_rec RECORD;
  new_user_id UUID;
  src_pwd TEXT;
BEGIN
  uname := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''), split_part(NEW.email, '@', 1));
  dname := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''), uname);

  IF EXISTS (SELECT 1 FROM public.users WHERE username = uname AND email IS DISTINCT FROM NEW.email) THEN
    uname := uname || '_' || substr(md5(NEW.id::text), 1, 8);
  END IF;

  SELECT id INTO new_user_id FROM public.users WHERE email = NEW.email LIMIT 1;

  IF new_user_id IS NOT NULL THEN
    UPDATE public.users
    SET auth_user_id = NEW.id,
        display_name = COALESCE(display_name, dname),
        updated_at = NOW()
    WHERE id = new_user_id AND (auth_user_id IS NULL OR auth_user_id = NEW.id);
  ELSE
    INSERT INTO public.users (username, email, password_hash, display_name, role, auth_user_id)
    VALUES (
      uname,
      NEW.email,
      NULL,
      dname,
      CASE
        WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'manager', 'dj', 'viewer')
        THEN (NEW.raw_user_meta_data->>'role')::varchar
        ELSE 'dj'
      END,
      NEW.id
    )
    RETURNING id INTO new_user_id;
  END IF;

  SELECT id, mountpoint, bitrate, format INTO station_rec FROM public.stations WHERE slug = 'main' AND is_active = true LIMIT 1;
  IF FOUND AND new_user_id IS NOT NULL THEN
    src_pwd := encode(digest(concat(gen_random_uuid()::text, NEW.id::text, random()::text), 'sha256'), 'hex');
    INSERT INTO public.dj_profiles (user_id, station_id, dj_name, source_password, allowed_mountpoints, is_active)
    VALUES (new_user_id, station_rec.id, dname, src_pwd, ARRAY[COALESCE(NULLIF(station_rec.mountpoint, ''), '/live')], true)
    ON CONFLICT (user_id, station_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS streamserver_on_auth_user_created ON auth.users;
CREATE TRIGGER streamserver_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.streamserver_handle_new_auth_user();
