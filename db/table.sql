CREATE TABLE schedules (
  id                 SERIAL      PRIMARY KEY,
  hour               INT         NOT NULL,
  minute             INT         NOT NULL,
  active             BOOLEAN     NOT NULL DEFAULT TRUE
)
