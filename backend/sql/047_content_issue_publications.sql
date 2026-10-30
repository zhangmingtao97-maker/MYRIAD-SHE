alter table content_issues
  add column if not exists draft_content jsonb not null default '{"sections":[]}'::jsonb,
  add column if not exists published_version integer not null default 0 check (published_version >= 0);

create table if not exists content_issue_publications (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references content_issues(id) on delete restrict,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by text,
  unique (issue_id, version)
);

create index if not exists content_issue_publications_history_idx
  on content_issue_publications(issue_id, version desc);

-- Convert the currently stored editorial fields into safe, typed modules.
update content_issues
set draft_content = jsonb_build_object('sections', jsonb_build_array(
  jsonb_build_object('id','issue-meta','type','issueMeta','order',0,'enabled',true,'eyebrow',label,'month',month),
  jsonb_build_object('id','cover','type','cover','order',1,'enabled',true,'imageObjectKey',cover_object_key,'altText',theme,'captionLeft',home_cover_caption_left,'captionRight',home_cover_caption_right),
  jsonb_build_object('id','opener','type','opener','order',2,'enabled',true,'eyebrow','本期主题','title',theme,'body',regexp_replace(home_meta_rich_text, '<[^>]*>', '', 'g')),
  jsonb_build_object('id','audio','type','audio','order',3,'enabled',micro_voice_object_key is not null,'title',coalesce(micro_voice_title,''),'duration',coalesce(micro_voice_duration,''),'audioObjectKey',micro_voice_object_key,'transcript',''),
  jsonb_build_object('id','question','type','question','order',4,'enabled',true,'title',question),
  jsonb_build_object('id','observation-action','type','observationAction','order',5,'enabled',true,'title','留给自己观察','body','从现实处境开始，记录保持私密'),
  jsonb_build_object('id','shared-practice-action','type','sharedPracticeAction','order',6,'enabled',true,'title','一起谈谈','body','围绕本期问题，进入共同实践'),
  jsonb_build_object('id','contents','type','contents','order',7,'enabled',true,'title','本期目录'),
  jsonb_build_object('id','archive','type','archive','order',8,'enabled',true,'title','往期策展'),
  jsonb_build_object('id','brand-footer','type','brandFooter','order',9,'enabled',true,'title','我有我的时节','body','记录真实的女性经验，也为看见之后的生活留下一条可行的路。')
))
where draft_content = '{"sections":[]}'::jsonb;

-- Preserve the exact content users currently see as immutable version 1.
insert into content_issue_publications (issue_id, version, snapshot, published_at)
select id, 1, jsonb_build_object(
  'issue', jsonb_build_object(
    'code',code,'label',label,'month',month,'theme',theme,'question',question,
    'microVoiceTitle',micro_voice_title,'microVoiceDuration',micro_voice_duration,
    'homeMetaRichText',home_meta_rich_text,'homeMetaFontSize',home_meta_font_size,
    'homeMetaColor',home_meta_color,'homeCoverCaptionLeft',home_cover_caption_left,
    'homeCoverCaptionRight',home_cover_caption_right,'coverObjectKey',cover_object_key,
    'microVoiceObjectKey',micro_voice_object_key
  ),
  'sections', draft_content->'sections'
), updated_at
from content_issues
where status = 'published'
on conflict (issue_id, version) do nothing;

update content_issues issue
set published_version = 1
where issue.status = 'published' and issue.published_version = 0
  and exists (select 1 from content_issue_publications publication where publication.issue_id = issue.id and publication.version = 1);
