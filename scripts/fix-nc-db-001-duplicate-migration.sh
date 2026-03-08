#!/bin/bash
# fix-nc-db-001-duplicate-migration.sh
# Sprint 1 C200 | Conselho dos 6 IAs | 2026-03-08
#
# NC-DB-001: Duplicate migration file 0027_c189_missing_tables.sql
# Two files with prefix 0027 exist:
#   - 0027_c189_6_missing_tables.sql (correct — 6 tables)
#   - 0027_c189_missing_tables.sql (duplicate — older version)
#
# Fix: rename the older duplicate to 0028 to preserve sequential ordering
# and update drizzle meta/journal.json accordingly

set -e

DRIZZLE_DIR="$(dirname "$0")/../drizzle"
JOURNAL="$DRIZZLE_DIR/meta/_journal.json"

echo "[NC-DB-001] Checking for duplicate migration 0027..."

if [ ! -f "$DRIZZLE_DIR/0027_c189_missing_tables.sql" ]; then
  echo "[NC-DB-001] No duplicate found — already fixed or not present."
  exit 0
fi

if [ ! -f "$DRIZZLE_DIR/0027_c189_6_missing_tables.sql" ]; then
  echo "[NC-DB-001] Only one 0027 file exists — no action needed."
  exit 0
fi

echo "[NC-DB-001] Duplicate found. Renaming 0027_c189_missing_tables.sql → 0028_c189_missing_tables_v2.sql"

# Rename the older duplicate
mv "$DRIZZLE_DIR/0027_c189_missing_tables.sql" \
   "$DRIZZLE_DIR/0028_c189_missing_tables_v2.sql"

echo "[NC-DB-001] File renamed successfully."

# Update journal.json if it exists
if [ -f "$JOURNAL" ]; then
  echo "[NC-DB-001] Updating drizzle journal..."
  # Use node to update the JSON safely
  node -e "
const fs = require('fs');
const journal = JSON.parse(fs.readFileSync('$JOURNAL', 'utf-8'));
// Find and update the duplicate entry
if (journal.entries) {
  journal.entries = journal.entries.map(entry => {
    if (entry.tag === '0027_c189_missing_tables') {
      return { ...entry, idx: 28, tag: '0028_c189_missing_tables_v2' };
    }
    return entry;
  });
  // Sort by idx
  journal.entries.sort((a, b) => a.idx - b.idx);
  fs.writeFileSync('$JOURNAL', JSON.stringify(journal, null, 2));
  console.log('[NC-DB-001] Journal updated successfully.');
}
" 2>/dev/null || echo "[NC-DB-001] Journal update skipped (node not available or journal format different)."
fi

echo "[NC-DB-001] Fix complete. Run 'pnpm db:push' to apply migrations."
