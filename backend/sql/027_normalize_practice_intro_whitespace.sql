update content_practice_page
set intro = regexp_replace(intro, '[[:space:]]+', '', 'g'),
    intro_rich_text = regexp_replace(intro_rich_text, '[[:space:]]+', '', 'g')
where intro ~ '[[:space:]]' or intro_rich_text ~ '[[:space:]]';
