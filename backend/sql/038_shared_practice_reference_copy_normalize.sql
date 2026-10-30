update content_practice_page
set shared_practice_copy = jsonb_set(
  jsonb_set(
    shared_practice_copy,
    '{heroTitle}',
    '{"richText":"一起谈谈，<br/>也在生活中相见。","fontSize":28,"color":"#5c493c"}'::jsonb,
    true
  ),
  '{heroIntro}',
  '{"richText":"线上围绕本期问题，听见不同的经历；线下活动开放后，再在这里相见。","fontSize":16,"color":"#5c493c"}'::jsonb,
  true
)
where id = 1
  and (
    shared_practice_copy #>> '{heroTitle,richText}' = '<span style="font-size:32px">一起谈谈，<br/>也在生活中相见。</span>'
    or shared_practice_copy #>> '{heroIntro,richText}' like '%<p>%'
  );

update content_practice_page
set shared_practice_copy = (
  select jsonb_object_agg(key, case
    when value ->> 'color' = '#40362f' then jsonb_set(value, '{color}', '"#5c493c"'::jsonb, true)
    else value
  end)
  from jsonb_each(shared_practice_copy)
)
where id = 1;
