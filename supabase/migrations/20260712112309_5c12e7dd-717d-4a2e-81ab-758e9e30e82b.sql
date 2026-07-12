
REVOKE EXECUTE ON FUNCTION public.can_access_trip(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_share(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_share(text) TO authenticated;
