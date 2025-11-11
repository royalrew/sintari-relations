import { InMemorySubjectStore, SubjectRepository } from "@/lib/memory/subject_memory";

describe("SubjectRepository — core", () => {
  let repo: SubjectRepository;

  beforeEach(() => {
    repo = new SubjectRepository(new InMemorySubjectStore());
  });

  it("skapar subject med defaults och validerad shape", async () => {
    const subject = await repo.create("Anna", { pronouns: "hon/henne", trust_score: 0.7, id: "test_anna" });

    expect(subject.subject_id).toBe("test_anna");
    expect(subject.primary_name).toBe("Anna");
    expect(subject.trust_score).toBeCloseTo(0.7, 5);
    expect(subject.aliases).toHaveLength(0);
    expect(typeof subject.last_seen_ts).toBe("string");
  });

  it("addAlias undviker dubbletter & case-insensitive", async () => {
    const subject = await repo.create("Johan", { id: "johan" });

    await repo.addAlias(subject.subject_id, "JOHN");
    await repo.addAlias(subject.subject_id, "john");

    const out = await repo.get("johan");
    expect(out).toBeDefined();
    expect(out!.aliases).toHaveLength(1);
    expect(out!.aliases[0].value).toBe("JOHN");
  });

  it("pinAsPrimary flyttar primary till alias och deduplicerar", async () => {
    const subject = await repo.create("Frederik", { id: "fred" });

    await repo.addAlias(subject.subject_id, "Fredrik");
    await repo.pinAsPrimary(subject.subject_id, "Fredrik");

    const out = await repo.get("fred");
    expect(out).toBeDefined();
    expect(out!.primary_name).toBe("Fredrik");
    expect(out!.aliases.some((alias) => alias.value === "Frederik")).toBe(true);
    expect(out!.aliases.some((alias) => alias.value === "Fredrik")).toBe(false);
  });

  it("mergeAliases kombinerar och tar bort source", async () => {
    const a = await repo.create("Alice", { id: "A" });
    const b = await repo.create("Alicia", { id: "B", trust_score: 0.9 });

    await repo.addAlias(b.subject_id, "Ally");

    const merged = await repo.mergeAliases(a.subject_id, b.subject_id);
    const all = await repo.list();

    expect(merged.aliases.map((alias) => alias.value)).toEqual(expect.arrayContaining(["Alicia", "Ally"]));
    expect(all.find((subject) => subject.subject_id === "B")).toBeUndefined();
    expect(merged.trust_score).toBeGreaterThanOrEqual(0.6);
  });

  it("findByName matchar både primary och alias, case-insensitive", async () => {
    const subject = await repo.create("Elin", { id: "elin" });

    await repo.addAlias(subject.subject_id, "Elli");

    const byPrimary = await repo.findByName("elin");
    const byAlias = await repo.findByName("elli");

    expect(byPrimary?.subject_id).toBe("elin");
    expect(byAlias?.subject_id).toBe("elin");
  });

  it("touch uppdaterar last_seen_ts framåt i tiden", async () => {
    const subject = await repo.create("Nils", { id: "nils" });
    const before = (await repo.get(subject.subject_id))!.last_seen_ts;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.touch(subject.subject_id);

    const after = (await repo.get(subject.subject_id))!.last_seen_ts;

    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
});
