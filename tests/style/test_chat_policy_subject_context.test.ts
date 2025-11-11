import { describe, it, expect, beforeEach } from '@jest/globals';
import { intentHook } from '@/lib/policy/intent_hook';
import { SubjectCore } from '@/lib/memory/subject_memory';
import { subjectResolver } from '@/lib/memory/subject_resolver';

async function resetSubjects() {
  const list = await SubjectCore.list();
  await Promise.all(list.map((subject) => SubjectCore.remove(subject.subject_id)));
  subjectResolver.invalidate();
}

describe('IntentHook — subject context', () => {
  beforeEach(async () => {
    await resetSubjects();
  });

  it('injekterar tokens när namn finns i texten', async () => {
    const output = await intentHook({ user_text: 'Jag träffade Anna igår.' });
    expect(output.inject_tokens).toBeDefined();
    expect(output!.inject_tokens).toMatch(/subject_id:/i);
    expect(output!.inject_tokens).toMatch(/namn:Anna/i);
    expect(output.active_subject_id).toBeDefined();
  });

  it('bär med sig subject mellan turer via hint_subject_id', async () => {
    const first = await intentHook({ user_text: 'Anna gillar att vandra.' });
    expect(first.active_subject_id).toBeDefined();

    const second = await intentHook({ user_text: 'Hon vill åka i helgen.', hint_subject_id: first.active_subject_id });
    expect(second.active_subject_id).toBe(first.active_subject_id);
    expect(second.inject_tokens).toBeDefined();
  });
});
