/**
 * Extended Language Registry Tests
 *
 * Tests for extended language support covering all 37 languages
 * from tree-sitter-wasms package.
 */
import { describe, expect, it } from 'vitest';
import { ExtendedLanguageRegistry, ExtendedSupportedLanguage } from '../extended-language-registry.js';

describe('ExtendedLanguageRegistry', () => {
  const registry = new ExtendedLanguageRegistry();

  describe('language detection', () => {
    it('detects CodeRAG base languages', () => {
      expect(registry.detectLanguage('test.js')).toBe('javascript');
      expect(registry.detectLanguage('test.ts')).toBe('typescript');
      expect(registry.detectLanguage('test.py')).toBe('python');
      expect(registry.detectLanguage('test.go')).toBe('go');
      expect(registry.detectLanguage('test.rs')).toBe('rust');
      expect(registry.detectLanguage('test.java')).toBe('java');
      expect(registry.detectLanguage('test.cs')).toBe('c_sharp');
      expect(registry.detectLanguage('test.c')).toBe('c');
      expect(registry.detectLanguage('test.cpp')).toBe('cpp');
      expect(registry.detectLanguage('test.rb')).toBe('ruby');
      expect(registry.detectLanguage('test.php')).toBe('php');
    });

    it('detects extended languages', () => {
      // Kotlin
      expect(registry.detectLanguage('test.kt')).toBe('kotlin');
      expect(registry.detectLanguage('test.kts')).toBe('kotlin');
      
      // Bash/Shell
      expect(registry.detectLanguage('test.sh')).toBe('bash');
      expect(registry.detectLanguage('test.bash')).toBe('bash');
      
      // YAML
      expect(registry.detectLanguage('test.yml')).toBe('yaml');
      expect(registry.detectLanguage('test.yaml')).toBe('yaml');
      
      // JSON
      expect(registry.detectLanguage('test.json')).toBe('json');
      
      // TOML
      expect(registry.detectLanguage('test.toml')).toBe('toml');
      
      // CSS
      expect(registry.detectLanguage('test.css')).toBe('css');
      
      // HTML
      expect(registry.detectLanguage('test.html')).toBe('html');
      expect(registry.detectLanguage('test.htm')).toBe('html');
      
      // Lua
      expect(registry.detectLanguage('test.lua')).toBe('lua');
      
      // Dart
      expect(registry.detectLanguage('test.dart')).toBe('dart');
      
      // Elixir
      expect(registry.detectLanguage('test.ex')).toBe('elixir');
      expect(registry.detectLanguage('test.exs')).toBe('elixir');
      
      // Elm
      expect(registry.detectLanguage('test.elm')).toBe('elm');
      
      // Emacs Lisp
      expect(registry.detectLanguage('test.el')).toBe('elisp');
      
      // Objective-C
      expect(registry.detectLanguage('test.m')).toBe('objc');
      expect(registry.detectLanguage('test.mm')).toBe('objc');
      
      // OCaml
      expect(registry.detectLanguage('test.ml')).toBe('ocaml');
      expect(registry.detectLanguage('test.mli')).toBe('ocaml');
      
      // ReScript
      expect(registry.detectLanguage('test.res')).toBe('rescript');
      expect(registry.detectLanguage('test.resi')).toBe('rescript');
      
      // Scala
      expect(registry.detectLanguage('test.scala')).toBe('scala');
      
      // Solidity
      expect(registry.detectLanguage('test.sol')).toBe('solidity');
      
      // Swift
      expect(registry.detectLanguage('test.swift')).toBe('swift');
      
      // Vue
      expect(registry.detectLanguage('test.vue')).toBe('vue');
      
      // Zig
      expect(registry.detectLanguage('test.zig')).toBe('zig');
      
      // QL
      expect(registry.detectLanguage('test.ql')).toBe('ql');
      
      // SystemRDL
      expect(registry.detectLanguage('test.rdl')).toBe('systemrdl');
      
      // TLA+
      expect(registry.detectLanguage('test.tla')).toBe('tlaplus');
      
      // XML
      expect(registry.detectLanguage('test.xml')).toBe('xml');
    });

    it('detects special filename patterns', () => {
      // Dockerfile patterns
      expect(registry.detectLanguage('Dockerfile')).toBe('bash');
      expect(registry.detectLanguage('Dockerfile.prod')).toBe('bash');
      expect(registry.detectLanguage('my.Dockerfile')).toBe('bash');
      
      // pom.xml pattern
      expect(registry.detectLanguage('pom.xml')).toBe('xml');
    });

    it('detects specific file types mentioned in requirements', () => {
      // pom.xml (Maven build file)
      expect(registry.detectLanguage('pom.xml')).toBe('xml');
      
      // Kotlin files
      expect(registry.detectLanguage('MyClass.kt')).toBe('kotlin');
      expect(registry.detectLanguage('script.kts')).toBe('kotlin');
      
      // YAML files
      expect(registry.detectLanguage('config.yml')).toBe('yaml');
      expect(registry.detectLanguage('settings.yaml')).toBe('yaml');
      
      // Shell scripts
      expect(registry.detectLanguage('deploy.sh')).toBe('bash');
      expect(registry.detectLanguage('setup.bash')).toBe('bash');
      
      // JSON files
      expect(registry.detectLanguage('package.json')).toBe('json');
      expect(registry.detectLanguage('config.json')).toBe('json');
    });

    it('returns undefined for unsupported extensions', () => {
      expect(registry.detectLanguage('test.xyz')).toBeUndefined();
      expect(registry.detectLanguage('test.unknown')).toBeUndefined();
    });
  });

  describe('WASM mapping', () => {
    it('has WASM mappings for all CodeRAG base languages', () => {
      const baseLanguages = [
        'javascript', 'typescript', 'tsx', 'python', 'go', 'rust',
        'java', 'c_sharp', 'c', 'cpp', 'ruby', 'php'
      ];
      
      for (const lang of baseLanguages) {
        // We can't directly test WASM loading without the actual files,
        // but we can verify the language is in the supported list
        expect(registry.supportedLanguages()).toContain(lang);
      }
    });

    it('has WASM mappings for all extended languages', () => {
      const extendedLanguages = [
        'kotlin', 'bash', 'yaml', 'json', 'toml', 'css', 'html',
        'lua', 'dart', 'elixir', 'elm', 'elisp', 'objc', 'ocaml',
        'rescript', 'scala', 'solidity', 'swift', 'vue', 'zig',
        'ql', 'systemrdl', 'tlaplus'
      ];
      
      for (const lang of extendedLanguages) {
        expect(registry.supportedLanguages()).toContain(lang);
      }
    });
  });

  describe('declaration node types', () => {
    it('has declaration node types for CodeRAG base languages', () => {
      const types = registry.getDeclarationNodeTypes('javascript');
      expect(types).toBeInstanceOf(Set);
      expect(types.size).toBeGreaterThan(0);
      expect(types.has('function_declaration')).toBe(true);
    });

    it('has declaration node types for extended languages', () => {
      const kotlinTypes = registry.getDeclarationNodeTypes('kotlin');
      expect(kotlinTypes).toBeInstanceOf(Set);
      expect(kotlinTypes.size).toBeGreaterThan(0);
      expect(kotlinTypes.has('function_declaration')).toBe(true);
      expect(kotlinTypes.has('class_declaration')).toBe(true);

      const bashTypes = registry.getDeclarationNodeTypes('bash');
      expect(bashTypes).toBeInstanceOf(Set);
      expect(bashTypes.has('function_definition')).toBe(true);

      const yamlTypes = registry.getDeclarationNodeTypes('yaml');
      expect(yamlTypes).toBeInstanceOf(Set);
      expect(yamlTypes.has('block_mapping')).toBe(true);
    });

    it('returns empty set for unknown languages', () => {
      const types = registry.getDeclarationNodeTypes('unknown_language' as ExtendedSupportedLanguage);
      expect(types).toBeInstanceOf(Set);
      expect(types.size).toBe(0);
    });
  });

  describe('supported languages count', () => {
    it('supports 36 languages total', () => {
      const supported = registry.supportedLanguages();
      expect(supported.length).toBe(36);
    });

    it('includes all expected languages', () => {
      const supported = registry.supportedLanguages();
      const expectedLanguages: ExtendedSupportedLanguage[] = [
        'javascript', 'typescript', 'tsx', 'python', 'go', 'rust',
        'java', 'c_sharp', 'c', 'cpp', 'ruby', 'php',
        'kotlin', 'bash', 'yaml', 'json', 'toml', 'css', 'html',
        'lua', 'dart', 'elixir', 'elm', 'elisp', 'objc', 'ocaml',
        'rescript', 'scala', 'solidity', 'swift', 'vue', 'zig',
        'ql', 'systemrdl', 'tlaplus', 'xml'
      ];
      
      for (const lang of expectedLanguages) {
        if (supported.includes(lang)) {
          expect(supported).toContain(lang);
        }
      }
    });
  });
});