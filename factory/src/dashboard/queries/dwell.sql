with visits as (select * from stage_visits($now))
select s.stage,
  (count(*) filter (where v.end_ms > $now - $days * 86400000::bigint and v.end_ms <= $now))::integer as count,
  (avg(v.end_ms - v.start_ms) filter (where v.end_ms > $now - $days * 86400000::bigint and v.end_ms <= $now))::double as mean_ms,
  (median(v.end_ms - v.start_ms) filter (where v.end_ms > $now - $days * 86400000::bigint and v.end_ms <= $now))::double as median_ms,
  (count(*) filter (where v.stage is not null and v.end_ms is null))::integer as open,
  (avg($now - v.start_ms) filter (where v.stage is not null and v.end_ms is null))::double as open_mean_ms
from delivery_stages s left join visits v on v.stage = s.stage
group by s.stage, s.ord order by s.ord;
