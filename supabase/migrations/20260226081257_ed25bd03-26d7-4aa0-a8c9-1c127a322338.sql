INSERT INTO public.user_roles (user_id, role)
VALUES ('2369c3e8-c2e7-43f6-800d-60dd2bd674c8', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;