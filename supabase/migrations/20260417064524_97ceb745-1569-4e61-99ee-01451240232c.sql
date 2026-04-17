
CREATE OR REPLACE FUNCTION public._cleanup_orphan_auth_users_2026_04()
RETURNS TABLE(deleted_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _uid uuid;
  _email text;
BEGIN
  FOR _uid, _email IN
    SELECT * FROM (VALUES
      ('30dd105b-e4b1-439a-a21d-081c745d6b06'::uuid, 'ditte@mondokaos.dk'),
      ('135b51db-c451-4dcd-95d4-1bce3dde1dd2'::uuid, 'jonas+endeligtest@topix.dk'),
      ('b8ae1ffa-6a96-4874-9470-331b6a972434'::uuid, 'jonas+legat1@topix.dk'),
      ('7574eb02-6ea8-4534-a437-1828286d0ae9'::uuid, 'jonas+legat2@topix.dk'),
      ('5ab9d120-1644-43a2-9ada-6a7e08f09cae'::uuid, 'jonas+legat3@topix.dk'),
      ('c08b114b-387c-4c26-9e94-71f3289644a2'::uuid, 'jonas+legat4@topix.dk'),
      ('5a0f0cb5-f6b7-45f4-8f15-0607f572633c'::uuid, 'jonas+legat5@topix.dk'),
      ('16b8d5a4-c400-421f-ac64-c2f5f4691aac'::uuid, 'jonas+test2endelig@topix.dk'),
      ('f54ac2b7-da6d-4356-a6cb-76a2b555b2a4'::uuid, 'jonasherlev@hotmail.com'),
      ('beb06346-cc79-4a06-95d7-5ab2a94b7b26'::uuid, 'linealmegaard@gmail.com'),
      ('67526eb6-058b-4d30-857c-580279f0c21c'::uuid, 'roskilde.dan@gmail.com')
    ) AS t(uid, email)
  LOOP
    DELETE FROM auth.identities WHERE user_id = _uid;
    DELETE FROM auth.sessions WHERE user_id = _uid;
    DELETE FROM auth.refresh_tokens WHERE user_id::text = _uid::text;
    DELETE FROM auth.mfa_factors WHERE user_id = _uid;
    DELETE FROM auth.one_time_tokens WHERE user_id = _uid;
    DELETE FROM auth.users WHERE id = _uid;
    deleted_email := _email;
    RETURN NEXT;
  END LOOP;
END;
$$;

SELECT * FROM public._cleanup_orphan_auth_users_2026_04();

DROP FUNCTION public._cleanup_orphan_auth_users_2026_04();
