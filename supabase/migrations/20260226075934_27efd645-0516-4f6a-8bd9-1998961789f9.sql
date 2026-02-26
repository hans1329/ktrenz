-- Insert admin role for hans1329@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('5a66ab0f-0ede-4c84-8b1f-8aa2fd9a1929', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;