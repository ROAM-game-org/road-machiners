create macro range_jobs(now_ms, days) as table
select * from jobs where end_ms >= now_ms - days * 86400000::bigint;

create macro range_agents(now_ms, days) as table
select a.line, a.idx, a.cost, a.model_rows, j.stage, j.ended_at, coalesce(o.wasted, 1) as wasted
from agents a join range_jobs(now_ms, days) j using (line) left join outcomes o on o.outcome = j.outcome;

create macro range_models(now_ms, days) as table
select m.*, a.stage, a.ended_at, a.wasted
from model_usage m join range_agents(now_ms, days) a using (line, idx);

create macro wait_spans(now_ms, days, budget_ms) as table
select line, reported, end_ms - at_ms > budget_ms as gap,
  greatest(0, least(end_ms, at_ms + budget_ms, now_ms) - greatest(at_ms, now_ms - days * 86400000::bigint)) as duration
from (
  select line, report is not null as reported, at_ms, coalesce(lead(at_ms) over (order by line), now_ms) as end_ms
  from scheduler where at_ms >= now_ms - 30 * 86400000::bigint
)
where end_ms >= now_ms - days * 86400000::bigint;

create macro stage_visits(now_ms) as table
with ordered as (
  select issue, step, col, at_ms, line, flow from cards where issue is not null and at_ms >= now_ms - 180 * 86400000::bigint
),
stepped as (
  select *, lag(step) over w as prev_step, lag(col) over w as prev_col from ordered window w as (partition by issue order by at_ms, line)
),
deduped as (
  select * from stepped where step is distinct from prev_step or col is distinct from prev_col
),
features as (
  select issue from deduped group by issue having bool_and(flow is null)
),
columns as (
  select issue, step, col, at_ms, line, lag(col) over (partition by issue order by at_ms, line) as prev_col from deduped join features using (issue)
),
moves as (
  select issue, step, col, at_ms, line, lead(at_ms) over (partition by issue order by at_ms, line) as end_ms
  from (select * from columns where prev_col is null or col <> prev_col)
),
mapped as (
  select m.issue, coalesce(o.stage, d.stage) as stage, m.at_ms as start_ms, m.end_ms,
    lead(coalesce(o.stage, d.stage, 'done')) over (partition by m.issue order by m.at_ms, m.line) as next_stage
  from moves m join column_stages d on d.col = m.col and d.step is null left join column_stages o on o.col = m.col and o.step = m.step
)
select issue, stage, start_ms, end_ms, next_stage from mapped where stage is not null;
