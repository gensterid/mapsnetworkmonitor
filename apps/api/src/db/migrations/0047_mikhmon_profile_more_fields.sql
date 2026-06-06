-- Phase A10 follow-up: full MikHMON v3 profile fields.
--
-- MikHMON external displays 5 user-configurable fields per profile:
--   Mode Kedaluwarsa (expired_mode)  — Remove | Notice | Notice & Remove
--   Masa Berlaku    (validity)       — already added in 0046
--   Harga Rp        (price)          — already added in 0046, operator cost
--   Harga Jual Rp   (selling_price)  — what voucher sells for (income)
--   Kunci Pengguna  (lock_user)      — already added in 0046
--
-- Two fields were missing: expired_mode + selling_price. Reports income
-- switches from `price` to `selling_price` so it represents revenue
-- (matches MikHMON external "Sales" semantic).

ALTER TABLE "mikhmon_profile_settings"
    ADD COLUMN IF NOT EXISTS "expired_mode" text NOT NULL DEFAULT 'Remove',
    ADD COLUMN IF NOT EXISTS "selling_price" numeric(14, 2) NOT NULL DEFAULT 0;

-- One-time seed: copy price -> selling_price for existing rows so they
-- don't suddenly show Rp 0 income after the new column is wired in.
UPDATE "mikhmon_profile_settings"
SET "selling_price" = "price"
WHERE "selling_price" = 0 AND "price" > 0;
