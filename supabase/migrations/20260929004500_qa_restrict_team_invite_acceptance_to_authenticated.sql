-- The client calls this RPC only after authentication and the function requires auth.uid().
-- Remove the unnecessary anonymous/public execute grant.
revoke all on function public.accept_team_invite_link(text,text,text,integer,integer) from public;
revoke execute on function public.accept_team_invite_link(text,text,text,integer,integer) from anon;
grant execute on function public.accept_team_invite_link(text,text,text,integer,integer) to authenticated;
