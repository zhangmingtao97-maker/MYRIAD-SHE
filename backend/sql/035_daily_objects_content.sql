create table if not exists content_daily_objects (
  id smallint primary key check (id = 1),
  content jsonb not null,
  edit_version integer not null default 1 check (edit_version > 0),
  updated_at timestamptz not null default now()
);

insert into content_daily_objects (id, content)
values (1, '{"brandName":"Hitherbreath","brandSubtitle":"此刻归安","bagLabel":"购物袋","bagCount":"00","eyebrow":"OBJECTS FOR EVERYDAY","title":"日常之物","intro":"把一些物，慢慢放回生活。\n与日常实践相伴的商品空间。","previewNote":"商店样式预览 · 商品资料与金额均为示意","supportLabel":"联系支持","products":[{"id":"01","name":"日常之物 01","english":"OBJECT No. 01","image":"/assets/shop/shop-item-01.svg","price":"¥100.00","priceLabel":"演示金额","description":"物品图示用于排版预览。\n正式商品、介绍与价格待确定后替换。","enabled":true},{"id":"02","name":"日常之物 02","english":"OBJECT No. 02","image":"/assets/shop/shop-item-02.svg","price":"¥80.00","priceLabel":"演示金额","description":"物品图示用于排版预览。\n正式商品、介绍与价格待确定后替换。","enabled":true}]}')
on conflict (id) do nothing;
