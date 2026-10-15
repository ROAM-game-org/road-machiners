with per_job as (
  select j.line, j.stage, j.end_ms - j.start_ms as ms, j.has_parts,
    coalesce(sum(least(k.end_ms, j.end_ms) - greatest(k.start_ms, j.start_ms)) filter (where k.kind = 'agent'), 0) as agent_ms,
    coalesce(sum(least(k.end_ms, j.end_ms) - greatest(k.start_ms, j.start_ms)) filter (where k.kind = 'checks'), 0) as checks_ms,
    coalesce(sum(least(k.end_ms, j.end_ms) - greatest(k.start_ms, j.start_ms)) filter (where k.kind = 'build'), 0) as build_ms
  from range_jobs($now, $days) j
  left join job_parts k on k.line = j.line and k.start_ms < j.end_ms and k.end_ms > j.start_ms
  group by j.line, j.stage, j.start_ms, j.end_ms, j.has_parts
)
select stage, sum(ms)::double as worker_ms,
  coalesce(sum(agent_ms) filter (where has_parts), 0)::double as agent_ms,
  coalesce(sum(checks_ms) filter (where has_parts), 0)::double as checks_ms,
  coalesce(sum(build_ms) filter (where has_parts), 0)::double as build_ms,
  coalesce(sum(greatest(0, ms - agent_ms - checks_ms - build_ms)) filter (where has_parts), 0)::double as factory_ms,
  coalesce(sum(ms) filter (where not has_parts), 0)::double as unsplit_ms
from per_job group by stage order by min(line);
