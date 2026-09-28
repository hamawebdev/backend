-- current_uses mirrors the number of redemption rows of each code. Bring back in line
-- any code whose counter drifted (redemptions made before the counter and the rows were
-- written in one transaction, or rows removed outside the app). Data only, no schema change.
UPDATE "activation_codes" AS ac
SET "current_uses" = usage.uses
FROM (
  SELECT c.id, count(r.id)::int AS uses
  FROM "activation_codes" c
  LEFT JOIN "code_redemptions" r ON r.activation_code_id = c.id
  GROUP BY c.id
) AS usage
WHERE usage.id = ac.id AND ac.current_uses <> usage.uses;
