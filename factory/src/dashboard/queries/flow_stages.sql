with visits as (
  select * from stage_visits($now) where end_ms > $now - $days * 86400000::bigint and end_ms <= $now
),
card_jobs as (
  select line, stage as job_stage, issue, start_ms, end_ms, has_parts from jobs where issue is not null
  union all
  select line, stage, unnest(batch), start_ms, end_ms, has_parts from jobs where batch is not null
),
pairs as (
  select v.issue, v.stage, v.start_ms as visit_start, v.end_ms as visit_end, j.line, j.has_parts,
    least(j.end_ms, v.end_ms) - greatest(j.start_ms, v.start_ms) as job_ms
  from visits v
  join stage_jobs s on s.stage = v.stage
  join card_jobs j on j.issue = v.issue and j.job_stage = s.job_stage and j.start_ms < v.end_ms and j.end_ms > v.start_ms
),
split as (
  select p.issue, p.stage, p.visit_start, p.line, p.has_parts, p.job_ms,
    coalesce(sum(least(k.end_ms, p.visit_end) - greatest(k.start_ms, p.visit_start)) filter (where k.kind = 'agent'), 0) as agent_ms,
    coalesce(sum(least(k.end_ms, p.visit_end) - greatest(k.start_ms, p.visit_start)) filter (where k.kind = 'checks'), 0) as checks_ms,
    coalesce(sum(least(k.end_ms, p.visit_end) - greatest(k.start_ms, p.visit_start)) filter (where k.kind = 'build'), 0) as build_ms
  from pairs p
  left join job_parts k on k.line = p.line and k.start_ms < p.visit_end and k.end_ms > p.visit_start
  group by p.issue, p.stage, p.visit_start, p.line, p.has_parts, p.job_ms
),
cardless_jobs as (
  select s.stage, j.start_ms, j.end_ms from jobs j join stage_jobs s on s.job_stage = j.stage where j.issue is null and j.batch is null
),
measured as (
  select v.issue, v.stage, v.end_ms - v.start_ms as visit_ms,
    coalesce(sum(x.agent_ms), 0) as agent_ms, coalesce(sum(x.checks_ms), 0) as checks_ms, coalesce(sum(x.build_ms), 0) as build_ms,
    coalesce(sum(greatest(0, x.job_ms - x.agent_ms - x.checks_ms - x.build_ms)), 0) as factory_ms,
    coalesce(bool_or(not x.has_parts), false)
      or exists (select 1 from cardless_jobs c where c.stage = v.stage and c.start_ms < v.end_ms and c.end_ms > v.start_ms) as unknown
  from visits v
  left join split x on x.issue = v.issue and x.stage = v.stage and x.visit_start = v.start_ms
  group by v.issue, v.stage, v.start_ms, v.end_ms
)
select d.stage, w.waits_on,
  (count(m.issue) filter (where not m.unknown))::integer as visits,
  (count(m.issue) filter (where m.unknown))::integer as unknown_visits,
  coalesce(sum(greatest(0, m.visit_ms - m.agent_ms - m.checks_ms - m.build_ms - m.factory_ms)) filter (where not m.unknown), 0)::double as wait_ms,
  coalesce(sum(m.agent_ms) filter (where not m.unknown), 0)::double as agent_ms,
  coalesce(sum(m.checks_ms) filter (where not m.unknown), 0)::double as checks_ms,
  coalesce(sum(m.build_ms) filter (where not m.unknown), 0)::double as build_ms,
  coalesce(sum(m.factory_ms) filter (where not m.unknown), 0)::double as factory_ms
from delivery_stages d
join stage_waits w on w.stage = d.stage
left join measured m on m.stage = d.stage
group by d.stage, d.ord, w.waits_on order by d.ord;
