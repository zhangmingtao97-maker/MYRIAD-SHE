update content_practice_page
set intro = regexp_replace(intro, E'\\s+', ' ', 'g'),
    intro_rich_text = regexp_replace(intro_rich_text, E'\\s+', ' ', 'g')
where intro ~ E'\\s{2,}' or intro_rich_text ~ E'\\s{2,}';
