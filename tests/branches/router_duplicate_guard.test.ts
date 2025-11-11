/**
 * Router Duplicate Guard Test
 * 
 * Testar att det bara finns ett router-block per branch i templates_v1.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('Router: only one definition per branch', () => {
  const templatesPath = join(__dirname, '../../lib/coach/templates_v1.ts');
  const fileContent = readFileSync(templatesPath, 'utf8');

  test('anger followup: only one definition', () => {
    // Räkna antal gånger "isAngerFollowup" definieras (inte bara används)
    const angerFollowupDefs = (fileContent.match(/const\s+isAngerFollowup\s*=/g) || []).length;
    expect(angerFollowupDefs).toBeLessThanOrEqual(1);
  });

  test('router functions: only imported, not duplicated', () => {
    // Kontrollera att router-funktioner importeras från modul, inte definieras inline
    const hasRouterImport = /from\s+['"]\.\/router\/branchRouter['"]/.test(fileContent);
    expect(hasRouterImport).toBe(true);
    
    // Kontrollera att isAngerBranchInput inte definieras inline
    const angerDefs = (fileContent.match(/function\s+isAngerBranchInput|const\s+isAngerBranchInput\s*=/g) || []).length;
    expect(angerDefs).toBe(0); // Bara import, ingen definition
    
    // Kontrollera att isLongingBranchInput inte definieras inline
    const longingDefs = (fileContent.match(/function\s+isLongingBranchInput|const\s+isLongingBranchInput\s*=/g) || []).length;
    expect(longingDefs).toBe(0); // Bara import, ingen definition
  });

  test('policy functions: only imported, not duplicated', () => {
    // Kontrollera att policy-funktioner importeras från modul
    const hasPolicyImport = /from\s+['"]\.\/policy\/branchPolicy['"]/.test(fileContent);
    expect(hasPolicyImport).toBe(true);
    
    // Kontrollera att enforceBranchPolicy inte definieras inline
    const policyDefs = (fileContent.match(/function\s+enforceBranchPolicy|const\s+enforceBranchPolicy\s*=/g) || []).length;
    expect(policyDefs).toBe(0); // Bara import, ingen definition
  });

  test('detectLoveHurtPattern: only imported, not duplicated', () => {
    // Kontrollera att detectLoveHurtPattern importeras från modul
    const hasLoveHurtImport = /from\s+['"]\.\/detectors['"]/.test(fileContent);
    expect(hasLoveHurtImport).toBe(true);
    
    // Kontrollera att detectLoveHurtPattern inte definieras inline i templates_v1.ts
    const loveHurtDefs = (fileContent.match(/function\s+detectLoveHurtPattern|const\s+detectLoveHurtPattern\s*=/g) || []).length;
    expect(loveHurtDefs).toBe(0); // Bara import, ingen definition
  });
});

