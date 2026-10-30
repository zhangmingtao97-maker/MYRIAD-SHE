-- SEASON_SAVE_BIRTH_DATE is false in the current local policy. Remove any
-- previously persisted birth date from season observations before continuing.
update observations
set answers = answers - 'birthDate'
where method = 'season' and answers ? 'birthDate';
