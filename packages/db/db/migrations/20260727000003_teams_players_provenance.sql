-- migrate:up
--
-- docs/data-dictionary.md lists raw_payload_id among the provenance columns
-- "every fact table carries", and teams/players reference "+ provenance
-- columns" — but ADR 0008's migration only added it to the observation tables.
-- Caught while writing the first real poller (#51), which could not record
-- which payload a club came from.

ALTER TABLE teams
  ADD COLUMN raw_payload_id bigint REFERENCES raw_payloads (id);

ALTER TABLE players
  ADD COLUMN raw_payload_id bigint REFERENCES raw_payloads (id);

-- migrate:down

ALTER TABLE players DROP COLUMN raw_payload_id;
ALTER TABLE teams DROP COLUMN raw_payload_id;
