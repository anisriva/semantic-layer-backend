/**
 * Test script for LLM providers
 * Tests OpenAI-compatible LLM connector with different authentication methods:
 * 1. Ollama (local, no auth)
 * 2. Groq (API key auth)
 * 3. Gemma (OAuth2 auth)
 */

import { OpenAICompatibleLlm } from '@/connectors/openai-compatible-llm.js';
import { err, ok, type Result } from 'neverthrow';
import { getConfigValue } from '@/utils/env-loader.js';

interface TestConfig {
  name: string;
  config: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    maxRetries?: number;
    retryDelayMs?: number;
    timeout?: number;
    oauth2?: {
      oauthUrl: string;
      clientId: string;
      clientSecret: string;
    };
  };
}

async function testProvider(testConfig: TestConfig): Promise<Result<string, Error>> {
  try {
    console.log(`\n=== Testing ${testConfig.name} ===`);
    console.log('Configuration:', {
      baseUrl: testConfig.config.baseUrl,
      model: testConfig.config.model,
      hasApiKey: !!testConfig.config.apiKey,
      hasOAuth2: !!testConfig.config.oauth2,
    });

    const provider = new OpenAICompatibleLlm(testConfig.config);
    const testPrompt = 'What is 2 + 2? Please answer with just the number.';
    
    console.log('Sending test prompt...');
    const result = await provider.generate(testPrompt);
    
    if (result.isErr()) {
      console.error('❌ Test failed:', result.error.message);
      return err(new Error(`${testConfig.name} failed: ${result.error.message}`));
    }
    
    console.log('✅ Test successful!');
    console.log('Response:', result.value);
    return ok(result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Test failed with exception:', message);
    return err(new Error(`${testConfig.name} failed: ${message}`));
  }
}

async function main(): Promise<void> {
  console.log('LLM Provider Test Script');
  console.log('========================');

  const testConfigs: TestConfig[] = [
    {
      name: 'Ollama (Local)',
      config: {
        baseUrl: getConfigValue('test.ollama.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue('test.ollama.apiKey', '') as string,
        model: getConfigValue('test.ollama.model', 'qwen2.5-coder:7b-instruct') as string,
        maxRetries: getConfigValue('test.ollama.maxRetries', 2) as number,
        retryDelayMs: getConfigValue('test.ollama.retryDelayMs', 1000) as number,
        timeout: getConfigValue('test.ollama.timeout', 120000) as number,
      },
    },
    {
      name: 'Groq (API Key)',
      config: {
        baseUrl: getConfigValue('test.groq.baseUrl', 'https://api.groq.com/openai/v1') as string,
        apiKey: getConfigValue('test.groq.apiKey', '') as string,
        model: getConfigValue('test.groq.model', 'qwen/qwen3.8-27b') as string,
        maxRetries: getConfigValue('test.groq.maxRetries', 2) as number,
        retryDelayMs: getConfigValue('test.groq.retryDelayMs', 1000) as number,
        timeout: getConfigValue('test.groq.timeout', 120000) as number,
      },
    },
    {
      name: 'Gemma (OAuth2)',
      config: {
        baseUrl: getConfigValue('test.gemma.baseUrl', 'https://api-int-hawkeye-dev.carbon.lowes.com/gemma4/v1') as string,
        model: getConfigValue('test.gemma.model', 'google/gemma-4-31B-it') as string,
        maxRetries: getConfigValue('test.gemma.maxRetries', 2) as number,
        retryDelayMs: getConfigValue('test.gemma.retryDelayMs', 1000) as number,
        timeout: getConfigValue('test.gemma.timeout', 120000) as number,
        oauth2: {
          oauthUrl: getConfigValue('test.gemma.oauth2.oauthUrl', '') as string,
          clientId: getConfigValue('test.gemma.oauth2.clientId', '') as string,
          clientSecret: getConfigValue('test.gemma.oauth2.clientSecret', '') as string,
        },
      },
    },
  ];

  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const testConfig of testConfigs) {
    const result = await testProvider(testConfig);
    results.push({
      name: testConfig.name,
      success: result.isOk(),
      error: result.isErr() ? result.error.message : undefined,
    });
  }

  console.log('\n\n=== Test Summary ===');
  results.forEach(({ name, success, error }) => {
    const status = success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status}: ${name}`);
    if (error) {
      console.log(`  Error: ${error}`);
    }
  });

  const passedCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  console.log(`\nTotal: ${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run the tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});