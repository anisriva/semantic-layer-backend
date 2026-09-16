/**
 * Prompts configuration loading
 * Loads and validates prompts.yaml with Nunjucks templating
 */

import nunjucks from 'nunjucks';
import { loadPromptsConfig } from '@/utils/yaml-loader.js';
import { promptsConfigSchema, type PromptsConfig } from '@/types/config/prompts-config.schema.js';

// Load prompts YAML configuration
const yamlConfig = loadPromptsConfig() as PromptsConfig;

// Validate YAML configuration
const validatedConfig = promptsConfigSchema.parse(yamlConfig);

/**
 * Render a template string using Nunjucks
 * @param template - Template string with Jinja-like syntax
 * @param context - Variables to substitute in the template
 * @returns Rendered string
 */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return nunjucks.renderString(template, context);
}

/**
 * Get prompts configuration
 */
export function getPromptsConfig(): PromptsConfig {
  return validatedConfig;
}

/**
 * Get and render a specific prompt template
 */
export function renderPrompt(templatePath: string, context: Record<string, unknown>): string {
  const parts = templatePath.split('.');
  let template: string = '';
  let current: unknown = validatedConfig;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
      if (typeof current === 'string') {
        template = current;
        break;
      }
    } else {
      throw new Error(`Template path not found: ${templatePath}`);
    }
  }
  
  if (!template) {
    throw new Error(`Template path did not resolve to a string: ${templatePath}`);
  }
  
  return renderTemplate(template, context);
}