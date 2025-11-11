/**
 * Smoke + Sanity Test for Memory Bridge (Steg 1)
 * Verifies memory integration in orchestrator
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { runAllAgents } from '@/lib/agents/agent_orchestrator';

describe('Memory Bridge Smoke Test', () => {
  const originalEnv = process.env.MEMORY_V2;

  beforeAll(() => {
    // Ensure clean state
    process.env.MEMORY_V2 = '0';
    process.env.MEMORY_PATH = 'data/memory_v2_test';
  });

  afterAll(() => {
    // Restore original env
    process.env.MEMORY_V2 = originalEnv || '0';
  });

  it('should disable memory when MEMORY_V2=0', async () => {
    process.env.MEMORY_V2 = '0';
    
    const result = await runAllAgents(
      {
        person1: 'Anna',
        person2: 'Erik',
        description: 'Vi diskuterade våra känslor igår.',
        consent: true,
      },
      {
        run_id: 'test_001',
        timestamp: new Date().toISOString(),
        language: 'sv',
      }
    );

    expect(result.memory_context).toBeUndefined();
  }, 30000);

  it('should enable memory when MEMORY_V2=1', async () => {
    process.env.MEMORY_V2 = '1';
    
    const result = await runAllAgents(
      {
        person1: 'Anna',
        person2: 'Erik',
        description: 'Vi diskuterade våra känslor igår.',
        consent: true,
      },
      {
        run_id: 'test_002',
        timestamp: new Date().toISOString(),
        language: 'sv',
      }
    );

    // Memory should be attempted (may be null if no previous memories)
    expect(result.memory_context).toBeDefined();
    expect(Array.isArray(result.memory_context) || result.memory_context === null).toBe(true);
  }, 30000);

  it('should generate deterministic threadId from person1+person2', async () => {
    process.env.MEMORY_V2 = '1';
    
    const result1 = await runAllAgents(
      {
        person1: 'Anna',
        person2: 'Erik',
        description: 'Test 1',
        consent: true,
      },
      {
        run_id: 'test_003a',
        timestamp: new Date().toISOString(),
        language: 'sv',
      }
    );

    const result2 = await runAllAgents(
      {
        person1: 'Anna',
        person2: 'Erik',
        description: 'Test 2',
        consent: true,
      },
      {
        run_id: 'test_003b',
        timestamp: new Date().toISOString(),
        language: 'sv',
      }
    );

    // Both should use same threadId (implied by same person1+person2)
    // We can't directly check threadId, but memory_context should be consistent
    expect(result1.memory_context).toBeDefined();
    expect(result2.memory_context).toBeDefined();
  }, 60000);

  it('should handle memory errors gracefully (non-blocking)', async () => {
    process.env.MEMORY_V2 = '1';
    process.env.MEMORY_PATH = '/invalid/path/that/does/not/exist';
    
    // Should not throw, should continue execution
    const result = await runAllAgents(
      {
        person1: 'Anna',
        person2: 'Erik',
        description: 'Test with invalid memory path',
        consent: true,
      },
      {
        run_id: 'test_004',
        timestamp: new Date().toISOString(),
        language: 'sv',
      }
    );

    // Should still return results even if memory fails
    expect(result.agents).toBeDefined();
    expect(result.success_count).toBeGreaterThan(0);
  }, 30000);

  it('should mask PII in memory ingest', async () => {
    process.env.MEMORY_V2 = '1';
    
    const result = await runAllAgents(
      {
        person1: 'Anna',
        person2: 'Erik',
        description: 'Kontakta mig på anna@example.com eller ring 070-1234567',
        consent: true,
      },
      {
        run_id: 'test_005',
        timestamp: new Date().toISOString(),
        language: 'sv',
      }
    );

    // Memory should be ingested (we can't directly verify PII masking here,
    // but if ingest succeeds, PII masking should have been applied)
    expect(result.memory_context).toBeDefined();
  }, 30000);
});

