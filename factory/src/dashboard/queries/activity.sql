select stage, case when stage in (select stage from private_stages) then null else issue end as issue,
  outcome, ended_at as at
from range_jobs($now, $days) order by ended_at desc, line desc
