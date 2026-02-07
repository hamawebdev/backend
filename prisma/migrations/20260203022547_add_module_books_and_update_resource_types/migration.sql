-- CreateTable
CREATE TABLE "module_books" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "module_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cover_path" TEXT,
    "view_url" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "module_books_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "module_books_module_id_idx" ON "module_books"("module_id");
