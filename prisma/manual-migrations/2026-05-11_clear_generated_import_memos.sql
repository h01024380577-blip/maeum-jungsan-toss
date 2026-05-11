-- Idempotent cleanup for legacy app-generated memo labels.
-- Memo should be reserved for user-entered notes.

UPDATE "Event" AS e
SET "memo" = ''
WHERE e."memo" IN ('대량 불러오기', '백업 복원')
  AND EXISTS (
    SELECT 1
    FROM "Transaction" AS t
    WHERE t."eventId" = e."id"
      AND t."source" = 'CSV'
  );

UPDATE "Event" AS e
SET "memo" = ''
WHERE (e."memo" = '알림 파싱' OR e."memo" LIKE '% 알림 파싱')
  AND EXISTS (
    SELECT 1
    FROM "Transaction" AS t
    WHERE t."eventId" = e."id"
      AND t."source" = 'SMS_PASTE'
  );
