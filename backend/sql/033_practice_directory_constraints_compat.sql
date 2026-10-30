alter table content_practice_entries
  drop constraint if exists content_practice_observation_enabled,
  drop constraint if exists content_practice_shared_disabled,
  drop constraint if exists content_practice_daily_goods_disabled;
