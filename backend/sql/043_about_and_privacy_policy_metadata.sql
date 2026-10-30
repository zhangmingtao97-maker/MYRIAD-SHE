create table if not exists content_about_page (
  id smallint primary key check (id = 1),
  edit_version integer not null default 1 check (edit_version > 0),
  draft jsonb not null,
  published jsonb not null,
  published_version integer not null default 1 check (published_version > 0),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into content_about_page (id, draft, published)
values (1,
  '{"brandIntro":"MYRIAD SHE 是一个陪伴女性回到自身经验的观察与实践空间。","contentSources":"内容来自团队原创研究、实践设计与经授权引用的资料。","contactInfo":"如需联系，请通过应用内客服渠道与我们联系。"}'::jsonb,
  '{"brandIntro":"MYRIAD SHE 是一个陪伴女性回到自身经验的观察与实践空间。","contentSources":"内容来自团队原创研究、实践设计与经授权引用的资料。","contactInfo":"如需联系，请通过应用内客服渠道与我们联系。"}'::jsonb
) on conflict (id) do nothing;

alter table content_privacy_policy
  add column if not exists draft_version_label text not null default '1.0',
  add column if not exists version_label text not null default '1.0',
  add column if not exists draft_update_notes text not null default '',
  add column if not exists update_notes text not null default '';

alter table content_privacy_revisions drop constraint if exists content_privacy_revisions_content_key_check;
alter table content_privacy_revisions add constraint content_privacy_revisions_content_key_check
  check (content_key in ('about-page', 'privacy-policy', 'privacy-page'));

insert into content_privacy_revisions (content_key, version, content)
select 'about-page', published_version, published
from content_about_page
on conflict (content_key, version) do nothing;
