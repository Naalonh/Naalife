import { describe, expect, it } from 'vitest';
import { KhqrError, buildKhqr, crc16, khqrMissing } from '../src';

const individual = {
  account_type: 'individual' as const,
  account_id: 'lonhv@aclb',
  merchant_name: 'Lon Hv',
  merchant_city: 'Phnom Penh',
};

describe('KHQR', () => {
  it('computes CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('builds a dynamic individual QR with a valid checksum', () => {
    const qr = buildKhqr({ account: individual, currency: 'USD', amount_minor: 250, now: new Date(1_700_000_000_000) });
    expect(qr.startsWith('000201010212')).toBe(true);
    expect(qr).toContain('29140010lonhv@aclb');
    expect(qr).toContain('5303840');
    expect(qr).toContain('54042.50');
    expect(qr).toContain('5802KH');
    expect(qr).toContain('9934' + '0013' + '1700000000000' + '0113' + '1700000900000');
    expect(qr.slice(-8, -4)).toBe('6304');
    expect(crc16(qr.slice(0, -4))).toBe(qr.slice(-4));
  });

  it('uses whole riel for KHR and builds merchant accounts', () => {
    const qr = buildKhqr({
      account: { ...individual, account_type: 'merchant', merchant_id: '123456', acquiring_bank: 'ACLEDA Bank' },
      currency: 'KHR',
      amount_minor: 40000,
    });
    expect(qr).toContain('5303116');
    expect(qr).toContain('540540000');
    expect(qr).toContain('0106123456');
  });

  it('reports missing settings and rejects bad amounts', () => {
    expect(
      khqrMissing({ account_type: 'merchant', account_id: 'a@b', merchant_name: 'x', merchant_city: 'y' }),
    ).toEqual(['merchant_id', 'acquiring_bank']);
    expect(() => buildKhqr({ account: { ...individual, account_id: '' }, currency: 'USD', amount_minor: 100 })).toThrow(
      KhqrError,
    );
    expect(() => buildKhqr({ account: individual, currency: 'USD', amount_minor: 0 })).toThrow(KhqrError);
  });
});
