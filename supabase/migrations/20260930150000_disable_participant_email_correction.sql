-- Participant email correction has been removed from the application.
-- Keep the function available only to service-side roles; browser-authenticated
-- users can no longer invoke it directly through the Data API.
revoke execute on function public.correct_participant_email(uuid,text,text,text) from authenticated;
