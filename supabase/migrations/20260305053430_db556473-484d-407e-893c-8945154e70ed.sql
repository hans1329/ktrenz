-- Drop the overloaded version with extra parameter
DROP FUNCTION IF EXISTS public.ktrenz_check_agent_usage(uuid, integer);

-- Also drop and recreate the old ktrenz_get_agent_usage if overloaded
DROP FUNCTION IF EXISTS public.ktrenz_get_agent_usage(uuid, integer);