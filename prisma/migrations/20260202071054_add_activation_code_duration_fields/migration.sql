-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_activation_codes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "hashed_code" TEXT NOT NULL,
    "description" TEXT,
    "duration_months" INTEGER NOT NULL,
    "duration_days" INTEGER,
    "duration_type" TEXT NOT NULL DEFAULT 'MONTHS',
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "current_uses" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" DATETIME NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "activation_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_activation_codes" ("code", "created_at", "created_by_id", "current_uses", "description", "duration_months", "expires_at", "hashed_code", "id", "is_active", "max_uses", "updated_at") SELECT "code", "created_at", "created_by_id", "current_uses", "description", "duration_months", "expires_at", "hashed_code", "id", "is_active", "max_uses", "updated_at" FROM "activation_codes";
DROP TABLE "activation_codes";
ALTER TABLE "new_activation_codes" RENAME TO "activation_codes";
CREATE UNIQUE INDEX "activation_codes_code_key" ON "activation_codes"("code");
CREATE INDEX "activation_codes_code_idx" ON "activation_codes"("code");
CREATE INDEX "activation_codes_is_active_expires_at_idx" ON "activation_codes"("is_active", "expires_at");
CREATE INDEX "activation_codes_created_by_id_idx" ON "activation_codes"("created_by_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
