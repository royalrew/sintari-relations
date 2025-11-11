import { describe, it, expect } from '@jest/globals';
import { goalCoach } from '../../lib/policy/goal_coach';

describe('Goal Coach', () => {
  it('blockerar utan evidens', () => {
    const res = goalCoach({ goal_text: 'Lyssna mer i möten', context_facts: [] });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Ingen evidens/i);
  });

  it('ger nästa mikrosteg med evidens', () => {
    const res = goalCoach({
      goal_text: 'Lyssna mer i möten',
      context_facts: ['Teamet upplever avbrott i samtal'],
    });
    expect(res.ok).toBe(true);
    expect(res.next_step).toMatch(/10[\u2010-\u2015-]min/i);
  });
});

