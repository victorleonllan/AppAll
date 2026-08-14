alter table events add column comienza_at timestamptz;
create index events_comienza_at_idx on events (comienza_at);
