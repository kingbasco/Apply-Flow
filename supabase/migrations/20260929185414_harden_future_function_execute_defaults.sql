-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- Remove that global default so future functions require an explicit grant.
alter default privileges for role postgres
  revoke execute on functions from public;
