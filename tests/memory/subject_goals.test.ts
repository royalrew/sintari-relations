import { describe, it, expect, beforeEach } from '@jest/globals';
import { GoalRepository, InMemoryGoalStore } from '../../lib/memory/subject_goals';

describe('Goals Model', () => {
  let repo: GoalRepository;
  const subject = 'S1';
  const author = 'jimmy@sintari.se';

  beforeEach(() => {
    repo = new GoalRepository(new InMemoryGoalStore());
  });

  it('skapar prosocialt mål med defaults', async () => {
    const goal = await repo.create({
      subject_id: subject,
      goal_text: 'Minska missförstånd',
      created_by: author,
    });
    expect(goal.subject_id).toBe(subject);
    expect(goal.valence).toBe('prosocial');
    expect(goal.progress).toBe(0);
    expect(goal.cadence).toBe('weekly');
    expect(goal.due_ts).toBeUndefined();
    expect(goal.owner).toBeUndefined();
    expect(goal.blockers).toEqual([]);
  });

  it('progress clampas till [0,1]', async () => {
    const goal = await repo.create({
      subject_id: subject,
      goal_text: 'Lyssna mer',
      created_by: author,
      progress: 2,
    });
    expect(goal.progress).toBe(1);

    const updated = await repo.setProgress(goal.goal_id, -0.5);
    expect(updated.progress).toBe(0);
  });

  it('uppdaterar text och constraints', async () => {
    const goal = await repo.create({
      subject_id: subject,
      goal_text: 'Bättre sömn',
      created_by: author,
    });
    await repo.updateText(goal.goal_id, 'Bättre sömn och återhämtning');
    const out = await repo.setConstraints(goal.goal_id, { cadence: 'weekly', max_minutes: 15 });
    expect(out.goal_text).toMatch(/återhämtning/);
    expect(out.constraints?.cadence).toBe('weekly');
  });

  it('uppdaterar meta-fält', async () => {
    const goal = await repo.create({
      subject_id: subject,
      goal_text: 'Träffa vänner',
      created_by: author,
    });
    await repo.setCadence(goal.goal_id, 'daily');
    await repo.setDueTs(goal.goal_id, '2025-11-10T12:00:00.000Z');
    await repo.setOwner(goal.goal_id, 'anna@sintari.se');
    const updated = await repo.setBlockers(goal.goal_id, ['Tidsbrist', 'Resa']);

    expect(updated.cadence).toBe('daily');
    expect(updated.due_ts).toBe('2025-11-10T12:00:00.000Z');
    expect(updated.owner).toBe('anna@sintari.se');
    expect(updated.blockers).toEqual(['Tidsbrist', 'Resa']);
  });

  it('arkiverar mål och exkluderar i standardlistning', async () => {
    const goal = await repo.create({
      subject_id: subject,
      goal_text: '1:1-samtal på torsdagar',
      created_by: author,
    });
    await repo.archive(goal.goal_id);

    const visible = await repo.listBySubject(subject);
    expect(visible.find((item) => item.goal_id === goal.goal_id)).toBeUndefined();

    const all = await repo.listBySubject(subject, { includeArchived: true });
    expect(all.find((item) => item.goal_id === goal.goal_id)).toBeDefined();
  });
});

