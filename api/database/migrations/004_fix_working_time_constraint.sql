-- Fix working_time_type constraint to match new schedule types
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_working_time_type_check;
ALTER TABLE users ADD CONSTRAINT users_working_time_type_check
  CHECK (working_time_type IN ('FULL_TIME','PART_TIME','CONTRACT','INTERN','REGULAR','FLEXIBLE','SHIFT','CUSTOM'));