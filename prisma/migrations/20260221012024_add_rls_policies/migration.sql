-- ==========================================================================
-- Row Level Security (RLS) Policies
-- ==========================================================================
-- RLS is Supabase's security model. Even if someone bypasses your app code,
-- the DATABASE itself refuses to show them rows they don't own.
-- Think of it as a bouncer at the door of each table.
--
-- auth.uid() is a Supabase function that returns the currently authenticated
-- user's UUID from the JWT token.
-- ==========================================================================

-- 1. Enable RLS on all tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 2. Users table — you can only see/edit YOUR OWN row
-- ==========================================================================

CREATE POLICY "Users can view own data"
  ON "users" FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON "users" FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ==========================================================================
-- 3. Suppliers table — full CRUD scoped to owner
-- ==========================================================================

CREATE POLICY "Users can view own suppliers"
  ON "suppliers" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own suppliers"
  ON "suppliers" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own suppliers"
  ON "suppliers" FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own suppliers"
  ON "suppliers" FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================================================
-- 4. Payables table — full CRUD scoped to owner
-- ==========================================================================

CREATE POLICY "Users can view own payables"
  ON "payables" FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own payables"
  ON "payables" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payables"
  ON "payables" FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own payables"
  ON "payables" FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================================================
-- 5. Attachments table — access through payable ownership
--    This is a "join-based" policy: you can see an attachment only if
--    you own the payable it belongs to.
-- ==========================================================================

CREATE POLICY "Users can view own attachments"
  ON "attachments" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "payables"
      WHERE "payables".id = "attachments".payable_id
        AND "payables".user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own attachments"
  ON "attachments" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "payables"
      WHERE "payables".id = payable_id
        AND "payables".user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own attachments"
  ON "attachments" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "payables"
      WHERE "payables".id = "attachments".payable_id
        AND "payables".user_id = auth.uid()
    )
  );

-- ==========================================================================
-- 6. Storage bucket for attachments
-- ==========================================================================
-- Creates a PRIVATE bucket (public = false). Files are only accessible
-- through signed URLs or authenticated requests.
-- ==========================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false);

-- Storage policies: files must follow the path pattern {userId}/{filename}
-- so the policy can verify ownership by checking the first folder name.

CREATE POLICY "Users can upload own attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
