/**
 * Extended TreeSitter Parser
 *
 * Wraps CodeRAG's TreeSitterParser to use ExtendedLanguageRegistry
 * for full language support (37 languages vs 12 in base CodeRAG).
 */
import TSParser from 'web-tree-sitter';
import { ok, err, type Result } from 'neverthrow';
import { ExtendedLanguageRegistry, ExtendedSupportedLanguage } from './extended-language-registry.js';
import { ParseError, type ParsedFile } from '@/helpers/core/types/index.js';

/**
 * Extended TreeSitter Parser that uses ExtendedLanguageRegistry
 * to support all 37 languages from tree-sitter-wasms.
 */
export class ExtendedTreeSitterParser {
  private parser: TSParser | null = null;
  private extendedRegistry: ExtendedLanguageRegistry | null = null;
  private initialized = false;

  /**
   * Initialize the tree-sitter WASM runtime and create internal instances.
   * Must be called before `parse()`.
   */
  async initialize(): Promise<Result<void, ParseError>> {
    try {
      await TSParser.init();
      this.parser = new TSParser();
      this.extendedRegistry = new ExtendedLanguageRegistry();
      this.initialized = true;
      return ok(undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(new ParseError(`Failed to initialize tree-sitter: ${message}`));
    }
  }

  /**
   * Parse a source file and extract its top-level declarations.
   *
   * Detects the language from the file path, loads the corresponding WASM grammar,
   * parses the content into an AST, and extracts declaration names.
   */
  async parse(filePath: string, content: string): Promise<Result<ParsedFile, ParseError>> {
    if (!this.initialized || !this.parser || !this.extendedRegistry) {
      return err(new ParseError('TreeSitterParser not initialized. Call initialize() first.'));
    }

    const language = this.extendedRegistry.detectLanguage(filePath);
    if (!language) {
      return err(new ParseError(`Unsupported file type: ${filePath}`));
    }

    try {
      const tsLanguage = await this.extendedRegistry.loadLanguage(language);
      this.parser.setLanguage(tsLanguage);

      const tree = this.parser.parse(content);
      if (!tree) {
        return err(new ParseError(`Failed to parse file: ${filePath}`));
      }

      const declarationTypes = this.extendedRegistry.getDeclarationNodeTypes(language);
      const declarations = this.extractDeclarations(tree.rootNode, declarationTypes);

      tree.delete();

      return ok({
        filePath,
        language,
        content,
        declarations,
      });
    } catch (error: unknown) {
      const message = error instanceof Error
        ? (error.message || error.constructor.name)
        : String(error);
      return err(new ParseError(`Error parsing ${filePath}: ${message}`));
    }
  }

  /**
   * Extract declaration names from AST nodes (copied from CodeRAG implementation).
   */
  private extractDeclarations(rootNode: any, declarationTypes: ReadonlySet<string>): string[] {
    const declarations: string[] = [];

    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      if (!child) continue;

      if (!declarationTypes.has(child.type)) continue;

      const name = this.extractNodeName(child);
      if (name) {
        declarations.push(name);
      }
    }

    return declarations;
  }

  /**
   * Extract node name from AST node (copied from CodeRAG implementation).
   */
  private extractNodeName(node: any): string | undefined {
    // Strategy 1: direct 'name' field
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      return nameNode.text;
    }

    // Strategy 2: 'declaration' field with a 'name' sub-field
    const declarationNode = node.childForFieldName('declaration');
    if (declarationNode) {
      const declName = declarationNode.childForFieldName('name');
      if (declName) {
        return declName.text;
      }
    }

    // Strategy 3: 'declarator' field with a 'name' sub-field
    const declaratorNode = node.childForFieldName('declarator');
    if (declaratorNode) {
      const declrName = declaratorNode.childForFieldName('name');
      if (declrName) {
        return declrName.text;
      }
      // Some declarators (e.g. simple variable declarators) have the name directly as text
      if (declaratorNode.type === 'identifier') {
        return declaratorNode.text;
      }
    }

    return undefined;
  }

  /**
   * Get the list of all file extensions / languages this parser supports.
   */
  supportedLanguages(): ExtendedSupportedLanguage[] {
    if (!this.extendedRegistry) {
      return [];
    }
    return this.extendedRegistry.supportedLanguages();
  }

  /**
   * Detect language from file path.
   */
  detectLanguage(filePath: string): ExtendedSupportedLanguage | undefined {
    if (!this.extendedRegistry) {
      return undefined;
    }
    return this.extendedRegistry.detectLanguage(filePath);
  }

  /**
   * Clean up parser resources.
   */
  dispose(): void {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }
    this.extendedRegistry = null;
    this.initialized = false;
  }
}