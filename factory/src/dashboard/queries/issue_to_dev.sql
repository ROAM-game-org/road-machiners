with features as (
  select issue from cards where issue is not null group by issue having bool_and(flow is null)
),
merges as (
  select issue, min(at_ms) as merged_ms from cards where step = 'merged' and issue in (select issue from features) group by issue
),
opens as (
  select issue, min(opened_ms) as opened_ms from cards where step = 'entered' and opened_ms is not null group by issue
),
inside as (
  select m.issue, m.merged_ms - o.opened_ms as age_ms
  from merges m left join opens o using (issue)
  where m.merged_ms > $now - $days * 86400000::bigint and m.merged_ms <= $now
)
select
  (count(age_ms))::integer as issues,
  (avg(age_ms))::double as mean_ms,
  (median(age_ms))::double as median_ms,
  (min(age_ms))::double as fastest_ms,
  (max(age_ms))::double as slowest_ms,
  (count(*) filter (where age_ms is null))::integer as missing_open
from inside;
