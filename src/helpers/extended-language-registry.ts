/**
 * Extended Language Registry
 *
 * Extends CodeRAG's LanguageRegistry to support all 37 languages available
 * in tree-sitter-wasms package, not just the 12 languages configured in CodeRAG.
 *
 * This wrapper approach avoids forking @code-rag/core while enabling full language support.
 * It uses CodeRAG's LanguageRegistry as a fallback and only adds additional language support.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import TSParser from 'web-tree-sitter';
import { 
  LanguageRegistry as CodeRAGLanguageRegistry,
  SupportedLanguage as CodeRAGSupportedLanguage 
} from '@/helpers/core/parser/index.js';

type Language = TSParser.Language;

/**
 * Extended supported languages beyond CodeRAG's base 12 languages.
 */
export type ExtendedSupportedLanguage =
  | CodeRAGSupportedLanguage
  | 'kotlin'
  | 'bash'
  | 'yaml'
  | 'json'
  | 'toml'
  | 'css'
  | 'html'
  | 'lua'
  | 'dart'
  | 'elixir'
  | 'elm'
  | 'elisp'
  | 'objc'
  | 'ocaml'
  | 'rescript'
  | 'scala'
  | 'solidity'
  | 'swift'
  | 'vue'
  | 'zig'
  | 'ql'
  | 'systemrdl'
  | 'tlaplus'
  | 'xml';

/**
 * Additional file extension mappings (beyond CodeRAG's base support).
 * Uses ReadonlyMap for immutability following CodeRAG's pattern.
 */
const ADDITIONAL_EXTENSIONS: ReadonlyMap<string, ExtendedSupportedLanguage> = new Map([
  // Kotlin
  ['.kt', 'kotlin'],
  ['.kts', 'kotlin'],
  // Bash/Shell
  ['.sh', 'bash'],
  ['.bash', 'bash'],
  // YAML
  ['.yml', 'yaml'],
  ['.yaml', 'yaml'],
  // JSON
  ['.json', 'json'],
  // TOML
  ['.toml', 'toml'],
  // CSS
  ['.css', 'css'],
  // HTML
  ['.html', 'html'],
  ['.htm', 'html'],
  // XML
  ['.xml', 'xml'],
  // Lua
  ['.lua', 'lua'],
  // Dart
  ['.dart', 'dart'],
  // Elixir
  ['.ex', 'elixir'],
  ['.exs', 'elixir'],
  // Elm
  ['.elm', 'elm'],
  // Emacs Lisp
  ['.el', 'elisp'],
  // Objective-C
  ['.m', 'objc'],
  ['.mm', 'objc'],
  // OCaml
  ['.ml', 'ocaml'],
  ['.mli', 'ocaml'],
  // ReScript
  ['.res', 'rescript'],
  ['.resi', 'rescript'],
  // Scala
  ['.scala', 'scala'],
  // Solidity
  ['.sol', 'solidity'],
  // Swift
  ['.swift', 'swift'],
  // Vue
  ['.vue', 'vue'],
  // Zig
  ['.zig', 'zig'],
  // QL
  ['.ql', 'ql'],
  // SystemRDL
  ['.rdl', 'systemrdl'],
  // TLA+
  ['.tla', 'tlaplus'],
]);

/**
 * Special filename patterns for files without standard extensions.
 */
const FILENAME_PATTERNS: ReadonlyMap<string, ExtendedSupportedLanguage> = new Map([
  ['Dockerfile', 'bash'],
  ['Dockerfile.*', 'bash'],
  ['*.Dockerfile', 'bash'],
]);

/**
 * Additional language to WASM mappings.
 * Uses ReadonlyMap for immutability following CodeRAG's pattern.
 */
const ADDITIONAL_WASM: ReadonlyMap<ExtendedSupportedLanguage, string> = new Map([
  ['kotlin', 'tree-sitter-kotlin.wasm'],
  ['bash', 'tree-sitter-bash.wasm'],
  ['yaml', 'tree-sitter-yaml.wasm'],
  ['json', 'tree-sitter-json.wasm'],
  ['toml', 'tree-sitter-toml.wasm'],
  ['css', 'tree-sitter-css.wasm'],
  ['html', 'tree-sitter-html.wasm'],
  ['xml', 'tree-sitter-html.wasm'], // XML uses HTML parser as fallback
  ['lua', 'tree-sitter-lua.wasm'],
  ['dart', 'tree-sitter-dart.wasm'],
  ['elixir', 'tree-sitter-elixir.wasm'],
  ['elm', 'tree-sitter-elm.wasm'],
  ['elisp', 'tree-sitter-elisp.wasm'],
  ['objc', 'tree-sitter-objc.wasm'],
  ['ocaml', 'tree-sitter-ocaml.wasm'],
  ['rescript', 'tree-sitter-rescript.wasm'],
  ['scala', 'tree-sitter-scala.wasm'],
  ['solidity', 'tree-sitter-solidity.wasm'],
  ['swift', 'tree-sitter-swift.wasm'],
  ['vue', 'tree-sitter-vue.wasm'],
  ['zig', 'tree-sitter-zig.wasm'],
  ['ql', 'tree-sitter-ql.wasm'],
  ['systemrdl', 'tree-sitter-systemrdl.wasm'],
  ['tlaplus', 'tree-sitter-tlaplus.wasm'],
]);

/**
 * Additional declaration node types.
 * Uses ReadonlyMap and ReadonlySet for immutability following CodeRAG's pattern.
 */
const ADDITIONAL_DECLARATIONS: ReadonlyMap<ExtendedSupportedLanguage, ReadonlySet<string>> = new Map([
  [
    'kotlin',
    new Set([
      'function_declaration',
      'class_declaration',
      'object_declaration',
      'property_declaration',
      'type_alias',
      'enum_entry',
      'secondary_constructor',
    ]),
  ],
  [
    'bash',
    new Set(['function_definition']),
  ],
  [
    'yaml',
    new Set(['block_mapping', 'block_sequence']),
  ],
  [
    'json',
    new Set(['object', 'array']),
  ],
  [
    'toml',
    new Set(['table', 'key_value_pair']),
  ],
  [
    'css',
    new Set(['rule_set', 'at_rule']),
  ],
  [
    'html',
    new Set(['element', 'script_element', 'style_element']),
  ],
  [
    'xml',
    new Set(['element', 'start_tag', 'end_tag']),
  ],
  [
    'lua',
    new Set(['function_declaration', 'assignment_statement']),
  ],
  [
    'dart',
    new Set(['function_definition', 'class_definition', 'field_declaration']),
  ],
  [
    'elixir',
    new Set(['function_definition', 'module_definition', 'struct_definition']),
  ],
  [
    'elm',
    new Set(['function_declaration', 'type_alias_declaration', 'port_declaration']),
  ],
  [
    'elisp',
    new Set(['defun', 'defvar']),
  ],
  [
    'objc',
    new Set(['function_definition', 'interface_declaration', 'implementation_definition']),
  ],
  [
    'ocaml',
    new Set(['value_definition', 'type_definition', 'module_definition']),
  ],
  [
    'rescript',
    new Set(['function_definition', 'type_definition', 'module_definition']),
  ],
  [
    'scala',
    new Set(['function_definition', 'class_definition', 'object_definition', 'trait_definition']),
  ],
  [
    'solidity',
    new Set(['function_definition', 'contract_definition', 'struct_definition']),
  ],
  [
    'swift',
    new Set(['function_declaration', 'class_declaration', 'struct_declaration', 'protocol_declaration']),
  ],
  [
    'vue',
    new Set(['template_element', 'script_element', 'style_element']),
  ],
  [
    'zig',
    new Set(['function_declaration', 'struct_declaration', 'enum_declaration']),
  ],
  [
    'ql',
    new Set(['function_definition', 'class_definition', 'predicate_definition']),
  ],
  [
    'systemrdl',
    new Set(['component_definition', 'property_definition']),
  ],
  [
    'tlaplus',
    new Set(['function_definition', 'module_definition']),
  ],
]);

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Extended Language Registry that wraps CodeRAG's LanguageRegistry
 * and adds support for additional languages from tree-sitter-wasms.
 */
export class ExtendedLanguageRegistry {
  private codeRagRegistry: CodeRAGLanguageRegistry;
  private languageCache: Map<ExtendedSupportedLanguage, Language>;

  constructor() {
    this.codeRagRegistry = new CodeRAGLanguageRegistry();
    this.languageCache = new Map();
  }

  /**
   * Detect language from file extension or filename pattern.
   * First checks CodeRAG's registry, then falls back to additional mappings.
   */
  detectLanguage(filePath: string): ExtendedSupportedLanguage | undefined {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    // First try CodeRAG's detection
    const codeRagLanguage = this.codeRagRegistry.detectLanguage(filePath);
    if (codeRagLanguage) {
      return codeRagLanguage;
    }
    
    // Check filename patterns (e.g., Dockerfile, pom.xml)
    for (const [pattern, language] of FILENAME_PATTERNS) {
      if (pattern.startsWith('*')) {
        // Wildcard pattern: check if filename ends with pattern
        const suffix = pattern.slice(1);
        if (fileName.endsWith(suffix)) {
          return language;
        }
      } else if (pattern.endsWith('*')) {
        // Prefix pattern: check if filename starts with pattern
        const prefix = pattern.slice(0, -1);
        if (fileName.startsWith(prefix)) {
          return language;
        }
      } else if (fileName === pattern) {
        // Exact match
        return language;
      }
    }
    
    // Fall back to additional extension mappings
    return ADDITIONAL_EXTENSIONS.get(ext);
  }

  /**
   * Load language WASM.
   * First tries CodeRAG's loader, then falls back to additional WASM files.
   * For XML, falls back to HTML parser as they are similar.
   */
  async loadLanguage(language: ExtendedSupportedLanguage): Promise<Language> {
    const cached = this.languageCache.get(language);
    if (cached) {
      return cached;
    }

    // Special case: XML uses HTML parser as fallback (tree-sitter-xml.wasm not available in 0.1.13)
    if (language === 'xml') {
      console.log(`[ExtendedLanguageRegistry] XML support: Using HTML parser as fallback`);
      return this.loadLanguage('html');
    }

    // First try CodeRAG's loader
    try {
      const loaded = await this.codeRagRegistry.loadLanguage(language as CodeRAGSupportedLanguage);
      this.languageCache.set(language, loaded);
      return loaded;
    } catch (error) {
      // If CodeRAG doesn't have it, try additional mapping
      const wasmFile = ADDITIONAL_WASM.get(language);
      if (!wasmFile) {
        throw new Error(`No WASM mapping for language: ${language}`);
      }

      try {
        const require = createRequire(import.meta.url);
        const wasmsDir = path.dirname(require.resolve('tree-sitter-wasms/package.json'));
        const wasmPath = path.join(wasmsDir, 'out', wasmFile);
        
        const loaded = await TSParser.Language.load(wasmPath);
        this.languageCache.set(language, loaded);
        return loaded;
      } catch (wasmError) {
        const errorMessage = wasmError instanceof Error ? wasmError.message : String(wasmError);
        console.warn(`WASM ABI compatibility issue for ${language}: ${errorMessage}. This language will be skipped.`);
        throw new Error(`Failed to load WASM for ${language}: ${errorMessage}`);
      }
    }
  }

  /**
   * Get declaration node types.
   * Returns CodeRAG's types for base languages, additional types for new languages.
   * Returns empty set for unrecognized languages.
   */
  getDeclarationNodeTypes(language: ExtendedSupportedLanguage): ReadonlySet<string> {
    // Check additional mappings first
    const additionalTypes = ADDITIONAL_DECLARATIONS.get(language);
    if (additionalTypes) {
      return additionalTypes;
    }
    
    // Fall back to CodeRAG's types (will return empty set for unknown languages)
    const codeRagTypes = this.codeRagRegistry.getDeclarationNodeTypes(language as CodeRAGSupportedLanguage);
    return codeRagTypes || EMPTY_SET;
  }

  /**
   * Get all supported languages (CodeRAG + extended).
   * Does not include XML since tree-sitter-xml.wasm is not available in tree-sitter-wasms 0.1.13.
   */
  supportedLanguages(): ExtendedSupportedLanguage[] {
    const codeRagLanguages = this.codeRagRegistry.supportedLanguages();
    const additionalLanguages = [...ADDITIONAL_WASM.keys()];
    const allLanguages = [...new Set([...codeRagLanguages, ...additionalLanguages])];
    return allLanguages;
  }
}