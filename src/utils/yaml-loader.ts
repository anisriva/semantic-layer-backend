import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

/**
 * Load and parse a YAML file
 * @param filePath - Relative or absolute path to the YAML file
 * @returns Parsed YAML content as an object
 */
export function loadYaml(filePath: string): unknown {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  const fileContent = fs.readFileSync(absolutePath, 'utf-8');
  return yaml.parse(fileContent);
}

/**
 * Load the application configuration YAML file
 * @returns Parsed application configuration
 */
export function loadAppConfig(): unknown {
  return loadYaml('config/app.yaml');
}

/**
 * Load the prompts configuration YAML file
 * @returns Parsed prompts configuration
 */
export function loadPromptsConfig(): unknown {
  return loadYaml('config/prompts.yaml');
}