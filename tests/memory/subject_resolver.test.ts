import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemorySubjectStore, SubjectRepository, SubjectCore } from '@/lib/memory/subject_memory';
import { buildIndex, resolveSubject, SubjectResolver } from '@/lib/memory/subject_resolver';

function makeRepo() {
  return new SubjectRepository(new InMemorySubjectStore());
}

describe('Subject Resolver', () => {
  let repo: SubjectRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('exakt primary-namn → confidence 1.0', async () => {
    const anna = await repo.create('Anna', { id: 'S1' });
    const idx = buildIndex([anna]);
    const result = resolveSubject({ text: 'Jag pratade med Anna igår.' }, idx)!;

    expect(result.subject_id).toBe('S1');
    expect(result.confidence).toBeCloseTo(1, 5);
  });

  it('fuzzy alias (Fredrick→Fredrik) → träff med hög confidence', async () => {
    const subject = await repo.create('Fredrik', { id: 'F' });
    await repo.addAlias('F', 'Fredrick');

    const idx = buildIndex([await repo.get('F') as any]);
    const result = resolveSubject({ text: 'Jag tror Fredrick sa något klokt.' }, idx)!;

    expect(result.subject_id).toBe('F');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('relationstitel + hint lyfter rätt subject', async () => {
    const a = await repo.create('Johan', { id: 'A' });
    const b = await repo.create('Kalle', { id: 'B' });

    const idx = buildIndex([a, b]);
    const result = resolveSubject({ text: 'Min chef bad mig leverera tidigare.', hint_subject_id: 'B' }, idx)!;

    expect(['A', 'B']).toContain(result.subject_id);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('LRU cache returnerar samma resultat för samma input', async () => {
    const subject = await repo.create('Elin', { id: 'E' });
    const idx = buildIndex([subject]);

    const r1 = resolveSubject({ text: 'Elin föreslog en promenad.' }, idx)!;
    const r2 = resolveSubject({ text: 'Elin föreslog en promenad.' }, idx)!;

    expect(r1.subject_id).toBe(r2.subject_id);
  });

  it('stateful resolver bygger index från SubjectCore (TTL)', async () => {
    const resolver = new SubjectResolver(1);
    await SubjectCore.create('Sara', { id: 'SARA' });

    const result = await resolver.resolve({ text: 'Sara ringde mig.' });

    expect(result && result.confidence).toBeGreaterThan(0.7);
  });
});
