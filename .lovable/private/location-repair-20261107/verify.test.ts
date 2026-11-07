import {test,expect} from 'bun:test';import {readFileSync} from 'node:fs';
const dir=import.meta.dir;const before=JSON.parse(readFileSync(dir+'/before.json','utf8')),after=JSON.parse(readFileSync(dir+'/after.json','utf8')),manifest=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
test('66 verified-source repairs preserve itinerary associations and all booking/source data',()=>{
 expect(manifest.length).toBe(66);
 const old=new Map(before.entries.map((e:any)=>[e.id,e]));
 for(const e of after.entries){const prior:any=old.get(e.id);expect(Object.fromEntries(Object.entries(e).filter(([k])=>!['latitude','longitude'].includes(k)))).toEqual(Object.fromEntries(Object.entries(prior).filter(([k])=>!['latitude','longitude'].includes(k))));}
 for(const k of ['recs','hotels','days'])expect(after[k]).toEqual(before[k]);
});
test('same-name branches and area centers are never automatically filled',()=>{
 for(const id of ['1f81c110-568d-4b4a-a7b3-c1e795b51457','3c137775-4f2a-41cb-b77e-ed42ea8babbe','636a3c71-274c-4935-b131-ad8ece50d246','abd8ce35-441b-4060-a7c8-eb18b55e6b56'])expect(manifest.some((m:any)=>m.id===id)).toBe(false);
});
test('Shinjuku garden missing coords filled from verified same-trip source only',()=>{
 const row=after.entries.find((e:any)=>e.id==='dd66e9e2-afac-4d1d-b51b-a989459dced3');expect(row.latitude).toBe(35.6851763);expect(row.longitude).toBe(139.7100517);expect(row.linked_recommendation_id).toBeNull();
 const source=before.recs.find((r:any)=>r.id==='d1227866-6c8b-4b33-a681-c4239fe2fe38');expect(source.trip_id).toBe('845ca94b-8cfb-460f-99ff-cd0dbd0ae438');
});
