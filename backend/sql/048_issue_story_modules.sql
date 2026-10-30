-- Add the editorial story slot and action to existing drafts without changing published snapshots.
update content_issues
set draft_content = jsonb_set(
  draft_content,
  '{sections}',
  coalesce(draft_content->'sections', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', 'story',
      'type', 'story',
      'order', jsonb_array_length(coalesce(draft_content->'sections', '[]'::jsonb)),
      'enabled', false,
      'eyebrow', '人物纪实',
      'title', '',
      'body', '',
      'imageObjectKey', '',
      'altText', '',
      'captionLeft', '',
      'captionRight', ''
    )
  )
)
where not exists (
  select 1
  from jsonb_array_elements(coalesce(draft_content->'sections', '[]'::jsonb)) section
  where section->>'type' = 'story'
);

update content_issues
set draft_content = jsonb_set(
  draft_content,
  '{sections}',
  coalesce(draft_content->'sections', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', 'story-action',
      'type', 'storyAction',
      'order', jsonb_array_length(coalesce(draft_content->'sections', '[]'::jsonb)),
      'enabled', false,
      'title', '进入本期人物',
      'body', '',
      'targetId', 'story'
    )
  )
)
where not exists (
  select 1
  from jsonb_array_elements(coalesce(draft_content->'sections', '[]'::jsonb)) section
  where section->>'type' = 'storyAction'
);
