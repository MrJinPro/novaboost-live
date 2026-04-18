Use these recovery SQL files only when the remote Supabase database is in a partial migration state.

Current recovery order:

1. Run supabase/recovery/20260418_backend_foundation_phase1_repair.sql
2. Run supabase/migrations/20260418014500_telegram_bot_moderation_phase2.sql
3. If phase3 was not started yet, run supabase/migrations/20260418143000_live_engagement_progression_phase3.sql
4. If phase3 was started and now fails with relation already exists, run supabase/recovery/20260418_live_engagement_phase3_repair.sql instead of rerunning phase3
5. If streamer studio saves successfully but public page/telegram/banner/logo do not persist, run supabase/recovery/20260418_streamer_profile_claim_fix.sql

Do not rerun supabase/migrations/20260418003000_backend_foundation_phase1.sql manually on a partially migrated database.

Typical symptoms that mean you need recovery first:

- type already exists
- function public.owns_streamer(uuid) does not exist
- relation public.streamer_subscriptions does not exist
- relation streamer_team_memberships already exists
- студия стримера не помнит banner/logo URL после сохранения
- публичная страница не показывает telegram/banner/logo после сохранения из студии