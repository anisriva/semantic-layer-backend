/**
 * Extended TreeSitter Parser Tests
 *
 * Tests for extended parser functionality with new languages.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExtendedTreeSitterParser } from '../extended-tree-sitter-parser.js';

describe('ExtendedTreeSitterParser', () => {
  let parser: ExtendedTreeSitterParser;
  let tempDir: string;

  beforeEach(async () => {
    parser = new ExtendedTreeSitterParser();
    const initialized = await parser.initialize();
    expect(initialized.isOk()).toBe(true);
    
    tempDir = await mkdtemp(join(tmpdir(), 'extended-parser-'));
  });

  afterEach(async () => {
    parser.dispose();
    await rm(tempDir, { force: true, recursive: true });
  });

  describe('Kotlin support', () => {
    it('detects Kotlin language correctly', async () => {
      const kotlinFile = join(tempDir, 'test.kt');
      const kotlinCode = `fun greet(name: String): String {
    return "Hello, $name!"
}

class Person(val name: String) {
    fun introduce() = "My name is $name"
}`;
      
      await writeFile(kotlinFile, kotlinCode);
      
      // Test that the language is detected correctly
      const detectedLanguage = parser.detectLanguage(kotlinFile);
      expect(detectedLanguage).toBe('kotlin');
    });
  });

  describe('YAML support', () => {
    it('detects YAML language correctly', async () => {
      const yamlFile = join(tempDir, 'config.yml');
      const yamlCode = `server:
  port: 8080
  host: localhost

database:
  url: postgresql://localhost:5432/mydb`;
      
      await writeFile(yamlFile, yamlCode);
      
      // Test that the language is detected correctly
      const { ExtendedLanguageRegistry } = await import('../extended-language-registry.js');
      const registry = new ExtendedLanguageRegistry();
      const detectedLanguage = registry.detectLanguage(yamlFile);
      
      expect(detectedLanguage).toBe('yaml');
    });
  });

  describe('Bash support', () => {
    it('detects Bash language correctly', async () => {
      const bashFile = join(tempDir, 'script.sh');
      const bashCode = `#!/bin/bash

function greet() {
    echo "Hello, World!"
}

greet`;
      
      await writeFile(bashFile, bashCode);
      
      const detectedLanguage = parser.detectLanguage(bashFile);
      expect(detectedLanguage).toBe('bash');
    });
  });

  describe('JSON support', () => {
    it('detects JSON language correctly', async () => {
      const jsonFile = join(tempDir, 'config.json');
      const jsonCode = JSON.stringify({
        name: "test",
        version: "1.0.0",
        dependencies: {
          express: "^4.18.0"
        }
      }, null, 2);
      
      await writeFile(jsonFile, jsonCode);
      
      const detectedLanguage = parser.detectLanguage(jsonFile);
      expect(detectedLanguage).toBe('json');
    });
  });

  describe('supported languages', () => {
    it('returns all supported languages', () => {
      const languages = parser.supportedLanguages();
      expect(languages.length).toBeGreaterThan(12); // More than CodeRAG's base 12
      expect(languages).toContain('kotlin');
      expect(languages).toContain('yaml');
      expect(languages).toContain('bash');
      expect(languages).toContain('json');
    });
  });
});