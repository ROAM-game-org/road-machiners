select stage as from_stage, next_stage as to_stage, count(*)::integer as moves
from stage_visits($now)
where end_ms > $now - $days * 86400000::bigint and end_ms <= $now and next_stage <> stage
group by stage, next_stage order by stage, next_stage;
