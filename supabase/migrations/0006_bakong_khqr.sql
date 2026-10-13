-- Bakong / KHQR receiving account, used to generate payment QRs for savings contributions.
-- Safe to run more than once.

alter table public.user_settings
  add column if not exists bakong_account_type text not null default 'individual'
    check (bakong_account_type in ('individual', 'merchant')),
  add column if not exists bakong_account_id text check (char_length(bakong_account_id) <= 32),
  add column if not exists bakong_merchant_name text check (char_length(bakong_merchant_name) <= 25),
  add column if not exists bakong_merchant_city text not null default 'Phnom Penh'
    check (char_length(bakong_merchant_city) between 1 and 15),
  add column if not exists bakong_phone text check (char_length(bakong_phone) <= 25),
  add column if not exists bakong_merchant_id text check (char_length(bakong_merchant_id) <= 32),
  add column if not exists bakong_acquiring_bank text check (char_length(bakong_acquiring_bank) <= 32),
  add column if not exists bakong_store_label text check (char_length(bakong_store_label) <= 25);
