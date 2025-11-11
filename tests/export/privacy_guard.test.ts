import { describe, it, expect } from '@jest/globals';
import { privacyGuard, assertNoForbiddenKeys } from '../../lib/export/privacy_guard';

describe('Privacy Guard', () => {
  it('tar bort privata fält och behåller säkra', () => {
    const report = {
      subjects: [
        {
          subject_id: 'S1',
          display_name: 'Anna',
          aliases: ['Ann', 'Annie'],
          pronouns: 'hon/henne',
          trust_score: 0.82,
          hearts_private: 4,
          debug_chips: ['alias:heur'],
          last_seen_ts: '2025-11-07T21:14:00.000Z',
        },
      ],
      body: {
        sections: [
          { title: 'Sammanfattning', text: '...' },
          { title: 'Rekommendationer', text: '...' },
        ],
      },
      debug: { any: 'stuff' },
    };

    const sanitized = privacyGuard(report);

    expect(sanitized.subjects?.[0].display_name).toBe('Anna');
    expect(sanitized.subjects?.[0]).not.toHaveProperty('aliases');
    expect(sanitized.subjects?.[0]).not.toHaveProperty('subject_id');
    expect(sanitized.subjects?.[0]).not.toHaveProperty('hearts_private');
    expect(sanitized.subjects?.[0]).not.toHaveProperty('debug_chips');

    expect((sanitized as any).debug).toBeUndefined();

    expect(() => assertNoForbiddenKeys(sanitized)).not.toThrow();
  });
});

