-- people.profiles: opt-in profiles, job posts and first messages for the hiring side of Network Keeper.
-- Leif 2026-10-01 ~21:00: "I want to build profiles on myself and on individuals online when they opt in we can search for
-- jobs and also hire and find people for them" / "it should be easy to inport just using youer linked in profile".
-- A row is public only while listed=1 (the person opted in); email is never returned by a public read.
-- key_hash = SHA-256 of the edit key the person's phone keeps; it is the only way to change, read messages or delete.
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, ts INTEGER NOT NULL, updated INTEGER NOT NULL, listed INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL, headline TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]', experience TEXT NOT NULL DEFAULT '[]', education TEXT NOT NULL DEFAULT '[]',
  linkedin TEXT NOT NULL DEFAULT '', open_to TEXT NOT NULL DEFAULT '[]', email TEXT NOT NULL DEFAULT '', search TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, ts INTEGER NOT NULL, open INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL, org TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]', poster TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', search TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS messages (
  ts INTEGER NOT NULL, to_kind TEXT NOT NULL, to_id TEXT NOT NULL, from_name TEXT NOT NULL, from_email TEXT NOT NULL,
  from_profile TEXT NOT NULL DEFAULT '', text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_to ON messages(to_kind, to_id, ts);
