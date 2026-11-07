CREATE TABLE IF NOT EXISTS visits (
  date    TEXT NOT NULL,
  country TEXT NOT NULL,
  region  TEXT NOT NULL,
  kind    TEXT NOT NULL,
  agent   TEXT NOT NULL,
  n       INTEGER NOT NULL,
  PRIMARY KEY (date, country, region, kind, agent)
);
