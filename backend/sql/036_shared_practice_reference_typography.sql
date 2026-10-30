update content_practice_page
set shared_practice_copy = jsonb_set(shared_practice_copy, '{heroTitle,fontSize}', '28'::jsonb)
where shared_practice_copy #>> '{heroTitle,richText}' = '一起谈谈，<br/>也在生活中相见。'
  and shared_practice_copy #>> '{heroTitle,fontSize}' = '32';

update content_practice_page
set shared_practice_copy = jsonb_set(shared_practice_copy, '{heroIntro,fontSize}', '16'::jsonb)
where shared_practice_copy #>> '{heroIntro,richText}' = '线上围绕本期问题，听见不同的经历；线下活动开启后，再在这里相见。'
  and shared_practice_copy #>> '{heroIntro,fontSize}' = '14';

update content_practice_page
set shared_practice_copy = jsonb_set(shared_practice_copy, '{onlineCopy,fontSize}', '15'::jsonb)
where shared_practice_copy #>> '{onlineCopy,richText}' = '讲一个真实处境，也听听其他人如何理解自己的经验。'
  and shared_practice_copy #>> '{onlineCopy,fontSize}' = '13';

update content_practice_page
set shared_practice_copy = jsonb_set(shared_practice_copy, '{offlineTitle,fontSize}', '19'::jsonb)
where shared_practice_copy #>> '{offlineTitle,richText}' = '目前没有正在招募的线下活动。'
  and shared_practice_copy #>> '{offlineTitle,fontSize}' = '16';

update content_practice_page
set shared_practice_copy = jsonb_set(shared_practice_copy, '{offlineCopy,fontSize}', '15'::jsonb)
where shared_practice_copy #>> '{offlineCopy,richText}' = '时间、地点和带领者确认后，会在这里完整说明。'
  and shared_practice_copy #>> '{offlineCopy,fontSize}' = '13';
