DROP TABLE IF EXISTS "ProgressPhoto";
DROP TABLE IF EXISTS "IssueReport";
DROP TABLE IF EXISTS "ReviewItem";

CREATE INDEX IF NOT EXISTS "Exercise_muscleGroup_status_name_idx" ON "Exercise"("muscleGroup", "status", "name");
CREATE INDEX IF NOT EXISTS "Exercise_status_name_idx" ON "Exercise"("status", "name");
CREATE INDEX IF NOT EXISTS "WorkoutTemplate_userId_createdAt_idx" ON "WorkoutTemplate"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkoutExercise_workoutTemplateId_orderIndex_idx" ON "WorkoutExercise"("workoutTemplateId", "orderIndex");
CREATE INDEX IF NOT EXISTS "WorkoutLog_userId_date_idx" ON "WorkoutLog"("userId", "date");
CREATE INDEX IF NOT EXISTS "ExerciseLog_exerciseId_idx" ON "ExerciseLog"("exerciseId");
