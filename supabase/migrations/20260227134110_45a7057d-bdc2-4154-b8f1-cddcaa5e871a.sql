-- Delete duplicate profile for Jeppe Chris
DELETE FROM public.profiles WHERE user_id = 'cdfa53b9-ec5e-45a1-91cf-8c353bc3210f';

-- Delete duplicate auth user for Jeppe Chris
DELETE FROM auth.users WHERE id = 'cdfa53b9-ec5e-45a1-91cf-8c353bc3210f';