import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { loadAppConfig } from './yaml-loader.js';

/**
 * Parse .env file with dotted key format
 * Converts keys like 'app.server.port=3000' to nested object structure
 * @param filePath - Path to .env file
 * @returns Parsed environment variables as nested object
 */
export function loadEnvFile(filePath: string): Record<string, unknown> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    return {};
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');
  // dotenv.parse handles quoting, escaping, inline comments, CRLF, etc.
  const flatEnv = dotenv.parse(fileContent);

  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(flatEnv)) {
    // Convert dotted key to nested structure
    // app.server.port -> { app: { server: { port: value } } }
    const parts = key.split('.');
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = parseEnvValue(rawValue);
  }

  return result;
}

/**
 * Parse environment value to appropriate type
 * @param value - String value from .env file
 * @returns Parsed value (string, number, boolean, or array)
 */
function parseEnvValue(value: string): unknown {
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (value.toLowerCase() === 'false') {
    return false;
  }
  if (value.includes(',')) {
    return value.split(',').map(item => item.trim());
  }
  return value;
}

/**
 * Get nested value from object using dot notation
 * @param obj - Object to traverse
 * @param path - Dot-separated path (e.g., 'app.server.port')
 * @param fallback - Fallback value if path not found
 * @returns Value at path or fallback
 */
export function getNestedValue(obj: unknown, path: string, fallback: unknown): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return fallback;
    }
  }
  return current ?? fallback;
}

/**
 * Get configuration value with precedence: .env > YAML > fallback
 * @param path - Dot-separated path (e.g., 'app.server.port')
 * @param fallback - Ultimate fallback value
 * @returns Configuration value
 */
export function getConfigValue(
  path: string,
  fallback: unknown
): unknown {
  const envPath = '.env';
  const yamlConfig = loadAppConfig();
  
  // Try .env file first
  const envConfig = loadEnvFile(envPath);
  const envValue = getNestedValue(envConfig, path, undefined);
  if (envValue !== undefined) {
    return envValue;
  }
  
  // Fall back to YAML
  const yamlValue = getNestedValue(yamlConfig, path, undefined);
  if (yamlValue !== undefined) {
    return yamlValue;
  }
  
  // Ultimate fallback
  return fallback;
}
