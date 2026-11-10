-- 实践页主标题采用更舒展的 32px / 1.4 版式，与设计稿的层级和间距一致。
alter table content_practice_page
  alter column intro_font_size set default 32;

update content_practice_page
   set intro_font_size = 32
 where intro_font_size = 28;