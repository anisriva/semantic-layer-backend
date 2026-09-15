import {
  getAnswerModelConfig,
  getEnrichmentModelConfig,
  getFullAppConfig,
  renderPrompt,
} from '@/config/index.js';
import { describe, expect, it } from 'vitest';

describe('role-specific LLM configuration', () => {
  it('loads independent enrichment and answer providers', () => {
    // Test that enrichment and answer configs are independent
    const fullConfig = getFullAppConfig();
    const enrichmentConfig = getEnrichmentModelConfig(fullConfig);
    const answerConfig = getAnswerModelConfig(fullConfig);
    
    // They should have the same structure but can have different values
    expect(enrichmentConfig).toHaveProperty('baseUrl');
    expect(enrichmentConfig).toHaveProperty('model');
    expect(enrichmentConfig).toHaveProperty('maxRetries');
    expect(enrichmentConfig).toHaveProperty('retryDelayMs');
    expect(enrichmentConfig).toHaveProperty('timeout');
    
    expect(answerConfig).toHaveProperty('baseUrl');
    expect(answerConfig).toHaveProperty('model');
    expect(answerConfig).toHaveProperty('maxRetries');
    expect(answerConfig).toHaveProperty('retryDelayMs');
    expect(answerConfig).toHaveProperty('timeout');
    
    // They should be independent objects
    expect(enrichmentConfig).not.toBe(answerConfig);
  });
});

describe('prompt template rendering', () => {
  it('renders enrichment chunk summary template with context variables', () => {
    const rendered = renderPrompt('enrichment.chunkSummary', {
      language: 'TypeScript',
      chunkType: 'function',
      content: 'function add(a: number, b: number): number { return a + b; }',
    });
    
    expect(rendered).toContain('TypeScript');
    expect(rendered).toContain('function');
    expect(rendered).toContain('function add(a: number, b: number): number { return a + b; }');
    expect(rendered).toContain('Summarize this');
  });

  it('renders answer system prompt', () => {
    const rendered = renderPrompt('answer.systemPrompt', {});
    
    expect(rendered).toContain('helpful code assistant');
    expect(rendered).toContain('repository context');
  });

  it('renders answer user prompt with question and context', () => {
    const rendered = renderPrompt('answer.userPrompt', {
      question: 'How does authentication work?',
      context: 'File: src/auth.ts\nType: module',
    });
    
    expect(rendered).toContain('How does authentication work?');
    expect(rendered).toContain('File: src/auth.ts');
    expect(rendered).toContain('Type: module');
  });

  it('renders context chunk template with metadata', () => {
    const rendered = renderPrompt('context.chunkTemplate', {
      filePath: 'src/utils/helpers.ts',
      chunkType: 'function',
    });
    
    expect(rendered).toContain('src/utils/helpers.ts');
    expect(rendered).toContain('function');
  });

  it('throws error for non-existent template path', () => {
    expect(() => {
      renderPrompt('nonexistent.path', {});
    }).toThrow('Template path not found');
  });
});
