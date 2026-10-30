update content_practice_page
set shared_practice_copy = jsonb_set(
  jsonb_set(
    jsonb_set(shared_practice_copy, '{onlineIssueLabel}', '{"richText":"ISSUE 02","fontSize":11,"color":"#8b6b58"}'::jsonb, true),
    '{onlineIssueTheme}', '{"richText":"手指一根一根松开","fontSize":11,"color":"#8b6b58"}'::jsonb, true
  ),
  '{onlineQuestion}', '{"richText":"事情过去以后，<br/>我们还在握紧什么？","fontSize":20,"color":"#5c493c"}'::jsonb, true
)
where id = 1
  and (shared_practice_copy -> 'onlineIssueLabel') is null;
