import { type Currency } from './constants';
import { toMajorString } from './money';
import type { Settings } from './types';

/**
 * KHQR (Bakong) payload builder. KHQR is EMV-QR TLV with a CRC-16/CCITT-FALSE trailer.
 * Generating the string is fully offline; no Bakong API token is needed.
 */

export interface KhqrAccount {
  account_type: 'individual' | 'merchant';
  /** Bakong account id, e.g. "lonhv@aclb" */
  account_id: string;
  merchant_name: string;
  merchant_city: string;
  phone?: string | null;
  /** merchant accounts only */
  merchant_id?: string | null;
  acquiring_bank?: string | null;
  store_label?: string | null;
}

export interface KhqrInput {
  account: KhqrAccount;
  currency: Currency;
  /** minor units; omit for a static QR where the payer types the amount */
  amount_minor?: number;
  bill_number?: string;
  note?: string;
  now?: Date;
  /** dynamic QRs expire; default 15 minutes */
  expires_in_minutes?: number;
}

export class KhqrError extends Error {}

export const KHQR_LIMITS = { account_id: 32, merchant_name: 25, merchant_city: 15, phone: 25, store_label: 25 } as const;

const CURRENCY_NUMERIC: Record<Currency, string> = { USD: '840', KHR: '116' };

function tlv(tag: string, value: string): string {
  if (value.length > 99) throw new KhqrError(`KHQR field ${tag} is too long`);
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Everything Bakong needs before a QR can be produced; returns the missing field names. */
export function khqrMissing(a: Partial<KhqrAccount> | null | undefined): string[] {
  const missing: string[] = [];
  if (!a?.account_id) missing.push('account_id');
  if (!a?.merchant_name) missing.push('merchant_name');
  if (!a?.merchant_city) missing.push('merchant_city');
  if (a?.account_type === 'merchant') {
    if (!a.merchant_id) missing.push('merchant_id');
    if (!a.acquiring_bank) missing.push('acquiring_bank');
  }
  return missing;
}

export function buildKhqr(input: KhqrInput): string {
  const a = input.account;
  const missing = khqrMissing(a);
  if (missing.length) throw new KhqrError(`Missing KHQR settings: ${missing.join(', ')}`);
  if (a.account_id.length > KHQR_LIMITS.account_id) throw new KhqrError('Bakong account id is too long');
  const dynamic = input.amount_minor !== undefined;
  if (dynamic && !(Number.isSafeInteger(input.amount_minor) && (input.amount_minor as number) > 0)) {
    throw new KhqrError('Amount must be a positive number');
  }

  let account: string;
  if (a.account_type === 'merchant') {
    account = tlv(
      '30',
      tlv('00', a.account_id) + tlv('01', a.merchant_id as string) + tlv('02', a.acquiring_bank as string),
    );
  } else {
    account =
      tlv(
        '29',
        tlv('00', a.account_id) +
          (a.phone ? tlv('01', a.phone) : '') +
          (a.acquiring_bank ? tlv('02', a.acquiring_bank) : ''),
      );
  }

  const additional =
    (input.bill_number ? tlv('01', input.bill_number.slice(0, 25)) : '') +
    (a.phone ? tlv('02', a.phone) : '') +
    (a.store_label ? tlv('03', a.store_label) : '') +
    (input.note ? tlv('08', input.note.slice(0, 25)) : '');

  const now = (input.now ?? new Date()).getTime();
  const expires = now + (input.expires_in_minutes ?? 15) * 60_000;

  const body =
    tlv('00', '01') +
    tlv('01', dynamic ? '12' : '11') +
    account +
    tlv('52', '5999') +
    tlv('53', CURRENCY_NUMERIC[input.currency]) +
    (dynamic ? tlv('54', toMajorString(input.amount_minor as number, input.currency)) : '') +
    tlv('58', 'KH') +
    tlv('59', a.merchant_name.slice(0, KHQR_LIMITS.merchant_name)) +
    tlv('60', a.merchant_city.slice(0, KHQR_LIMITS.merchant_city)) +
    (additional ? tlv('62', additional) : '') +
    (dynamic ? tlv('99', tlv('00', String(now)) + tlv('01', String(expires))) : '') +
    '6304';
  return body + crc16(body);
}

/** The receiving account stored in user settings, in the shape the builder wants. */
export function khqrAccountFromSettings(s: Settings): KhqrAccount {
  return {
    account_type: s.bakong_account_type,
    account_id: s.bakong_account_id ?? '',
    merchant_name: s.bakong_merchant_name ?? '',
    merchant_city: s.bakong_merchant_city,
    phone: s.bakong_phone,
    merchant_id: s.bakong_merchant_id,
    acquiring_bank: s.bakong_acquiring_bank,
    store_label: s.bakong_store_label,
  };
}
