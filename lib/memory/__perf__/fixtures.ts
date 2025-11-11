import type { Subject } from "@/lib/memory/subject_memory";

function makeSubject(id: number, primary: string, aliases: string[]): Subject {
  const iso = new Date(2025, 0, 1, 12, 0, 0, 0).toISOString();
  return {
    subject_id: `subj_${id.toString().padStart(4, "0")}`,
    primary_name: primary,
    aliases: aliases.map((alias, index) => ({
      value: alias,
      added_ts: new Date(2025, 0, 1, 12, 0, index).toISOString(),
    })),
    pronouns: undefined,
    trust_score: 0.5,
    last_seen_ts: iso,
  };
}

const baseSwedish = [
  ["Anna Andersson", ["Anna A.", "Annie Andersson", "Anna A"]],
  ["Björn Karlsson", ["Bjorn Karlsson", "B Karlsson"]],
  ["Carina Lindberg", ["Carina L.", "C. Lindberg"]],
  ["David Öhman", ["David Ohman", "D Öhman"]],
  ["Elias Söderström", ["Elias S.", "E Söderstrom"]],
  ["Frida Jansson", ["Frida J.", "F Jansson"]],
  ["Gustav Wikström", ["Gustav W.", "G Wikstrom"]],
  ["Helena Nyberg", ["Helena N.", "H Nyberg"]],
  ["Isak Holm", ["Isak H.", "I Holm"]],
  ["Josefin Dahl", ["Josefin D.", "J Dahl"]],
];

const baseEnglish = [
  ["Alice Johnson", ["Alice J.", "A Johnson"]],
  ["Brian Smith", ["Brian S.", "B Smith"]],
  ["Charlotte Brown", ["Charlotte B.", "C Brown"]],
  ["Daniel Clark", ["Daniel C.", "D Clark"]],
  ["Emily Davis", ["Emily D.", "E Davis"]],
  ["Frank Wilson", ["Frank W.", "F Wilson"]],
  ["Grace Miller", ["Grace M.", "G Miller"]],
  ["Henry Moore", ["Henry M.", "H Moore"]],
  ["Isabella Taylor", ["Isabella T.", "I Taylor"]],
  ["Jack Anderson", ["Jack A.", "J Anderson"]],
];

const synthetic: Array<[string, string[]]> = [];
for (let i = 0; i < baseSwedish.length; i += 1) {
  const [primary, aliases] = baseSwedish[i];
  synthetic.push([primary, aliases]);
}
for (let i = 0; i < baseEnglish.length; i += 1) {
  const [primary, aliases] = baseEnglish[i];
  synthetic.push([primary, aliases]);
}

const variations = [" AB", " Consulting", " Team", " Support", " HR", " Friend", " Coach", " Mentor", " Leader"];

export const subjectsFixture: Subject[] = (() => {
  const items: Subject[] = [];
  let counter = 1;

  for (const [primary, aliases] of synthetic) {
    items.push(makeSubject(counter, primary, aliases));
    counter += 1;
  }

  // Generate variations to reach ~400 subjects
  for (let i = 0; i < 40; i += 1) {
    for (const [primary, aliases] of synthetic) {
      const suffix = variations[i % variations.length];
      const baseName = `${primary}${suffix}`;
      const aliasList = aliases.map((alias) => `${alias}${suffix}`);
      items.push(makeSubject(counter, baseName, aliasList));
      counter += 1;
      if (items.length >= 420) break;
    }
    if (items.length >= 420) break;
  }

  return items;
})();

