import "dotenv/config";
import { Pool } from "pg";

// =============================================================================
// Setup Storage — Create the "attachments" bucket + RLS policies
// =============================================================================
// Supabase Storage uses two PostgreSQL tables under the hood:
//   - storage.buckets  → bucket config (name, public/private, size limits)
//   - storage.objects  → the actual files (paths, metadata)
//
// RLS policies on storage.objects control who can upload, read, and delete.
// We scope every policy to bucket_id = 'attachments' so they only affect
// our bucket and don't interfere with any future buckets.
//
// This script is idempotent — safe to run multiple times.
//
// Usage: npm run db:setup-storage
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });

async function main() {
  console.log("=== Setup Storage ===\n");

  // --- Step 1: Create the bucket (if it doesn't exist) ---
  // ON CONFLICT DO NOTHING makes this idempotent.
  // file_size_limit is in bytes (5 MB = 5 * 1024 * 1024 = 5242880).
  await pool.query(`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'attachments',
      'attachments',
      false,
      5242880,
      ARRAY['application/pdf', 'image/png', 'image/jpeg']
    )
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log("Bucket 'attachments' — OK (created or already exists)");

  // --- Step 2: Add RLS policies ---
  // PostgreSQL doesn't have CREATE POLICY IF NOT EXISTS, so we use a
  // DO block to check pg_policies first. This prevents errors on re-run.

  const policies = [
    {
      name: "Authenticated users can manage attachments - INSERT",
      command: "INSERT",
      // INSERT uses WITH CHECK (not USING) — it validates new rows being added
      clause: "WITH CHECK (bucket_id = 'attachments')",
    },
    {
      name: "Authenticated users can manage attachments - SELECT",
      command: "SELECT",
      // SELECT uses USING — it filters which existing rows are visible
      clause: "USING (bucket_id = 'attachments')",
    },
    {
      name: "Authenticated users can manage attachments - DELETE",
      command: "DELETE",
      // DELETE uses USING — it filters which existing rows can be deleted
      clause: "USING (bucket_id = 'attachments')",
    },
  ];

  for (const policy of policies) {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage'
            AND tablename = 'objects'
            AND policyname = '${policy.name}'
        ) THEN
          CREATE POLICY "${policy.name}"
            ON storage.objects
            FOR ${policy.command}
            TO authenticated
            ${policy.clause};
        END IF;
      END
      $$;
    `);
    console.log(`Policy '${policy.command}' — OK`);
  }

  console.log("\nDone! Storage bucket and RLS policies are ready.");
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
