with m(id, kind, src) as (values
('6ec18185-6d2d-45d7-8e94-f7b10f50d6c4'::uuid,'rec','The SHEL’TTER TOKYO Tokyu Plaza Omotesando “Omokado”'),
('ef11e966-e3be-40ab-8e92-0ca880c3a826'::uuid,'rec','Amam Dacotan Kyoto'),
('a5dce03a-48f9-47ce-b756-b24e7da44aa1'::uuid,'hotel','Hotel Resol Kyoto Shijo Muromachi'),
('2e26fc96-7779-4a59-bdf8-0a706e2f2c86'::uuid,'rec','Nishiki Market'),
('372defaa-8bcb-44d5-9960-98e45d3053e8'::uuid,'rec','MOTOI Gyoza'),
('f0bf71d0-c690-48d4-8d8b-ae4fe9307d98'::uuid,'rec','Arashiyama Yusai-Tei Gallery'),
('62e36868-be9d-48ba-8232-e640002458d0'::uuid,'rec','Pontocho Alley'),
('f4e99803-83b8-40ec-b115-8f0e4d192695'::uuid,'hotel','Rakuyu'),
('c982605d-ea2d-43b3-b166-ae9cfffcd5db'::uuid,'rec','Hanamikoji Street')),
s as (
 select m.id, coalesce(
   (select array[latitude,longitude] from recommendations where m.kind='rec' and trip_id='845ca94b-8cfb-460f-99ff-cd0dbd0ae438' and name_norm=lower(btrim(m.src)) and latitude is not null),
   (select array[latitude,longitude] from hotels where m.kind='hotel' and trip_id='845ca94b-8cfb-460f-99ff-cd0dbd0ae438' and hotel_name=m.src and latitude is not null)) c
 from m)
update day_entries e set latitude=s.c[1], longitude=s.c[2]
from s, itinerary_days d, trips t
where e.id=s.id and s.c is not null and e.latitude is null and e.longitude is null
 and d.id=e.day_id and t.id=d.trip_id and t.id='845ca94b-8cfb-460f-99ff-cd0dbd0ae438' and t.title='Japan 2026'
returning e.id, e.latitude, e.longitude;
