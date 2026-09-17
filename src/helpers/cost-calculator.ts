import type { ProviderType, CostOperationType } from '@prisma/client';
import type { FullAppConfig } from '@/config/index.js';

/**
 * Abstract Cost Calculator
 *
 * This class provides the structure and interface for cost calculation strategies.
 * Currently unimplemented as cost calculation depends on:
 * - Specific provider pricing models (OpenAI, Ollama, custom hosted models)
 * - Token counting methodologies
 * - Internal vs external cost allocation
 * - Provider-specific response formats
 *
 * Future implementations should:
 * - Support multiple provider types (OpenAI, Ollama, Azure, Anthropic, custom)
 * - Handle different pricing models (per-token, per-request, flat-rate, etc.)
 * - Support internal cost allocation for self-hosted models
 * - Provide caching for pricing information
 * - Handle currency conversion if needed
 * - Support tiered pricing and volume discounts
 */
export abstract class CostCalculator {
  /**
   * Extracts provider type from base URL
   *
   * @param baseUrl - The base URL of the provider
   * @returns The provider type enum value
   *
   * Future enhancements:
   * - Support for custom provider detection patterns
   * - Configuration-based provider mapping
   * - Provider-specific URL parsing
   */
  abstract extractProviderType(baseUrl: string): ProviderType;

  /**
   * Extracts token usage from provider response
   *
   * @param response - The response object from the provider
   * @returns Object containing prompt, completion, and total token counts
   *
   * Future enhancements:
   * - Handle different response formats per provider
   * - Support for token counting in non-LLM operations
   * - Fallback strategies when token info is unavailable
   * - Character-to-token estimation for providers without token counts
   */
  abstract extractTokenUsage(response: any): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Gets pricing information for a specific model and operation
   *
   * @param model - The model name/identifier
   * @param operationType - The type of operation (embedding, enrichment, chat, retrieval)
   * @returns Pricing information including per-1k token costs
   *
   * Future enhancements:
   * - Dynamic pricing from provider APIs
   * - Cached pricing information
   * - Support for custom pricing tables
   * - Volume-based pricing tiers
   * - Currency conversion
   * - Internal cost allocation for self-hosted models
   */
  abstract getPricing(model: string, operationType: CostOperationType): {
    promptTokenCost?: number;
    completionTokenCost?: number;
    embeddingTokenCost?: number;
  };

  /**
   * Calculates cost based on token usage and pricing
   *
   * @param pricing - Pricing information from getPricing
   * @param promptTokens - Number of prompt tokens used
   * @param completionTokens - Number of completion tokens used
   * @returns Total cost in USD
   *
   * Future enhancements:
   * - Support for different pricing models (flat rate, per-request, etc.)
   * - Minimum charge handling
   * - Rounding strategies
   * - Currency conversion
   * - Internal cost allocation
   */
  abstract calculateCost(
    pricing: { promptTokenCost?: number; completionTokenCost?: number; embeddingTokenCost?: number },
    promptTokens: number,
    completionTokens: number
  ): number;

  /**
   * Creates cost metrics data structure from config and provider response
   *
   * @param config - Full application configuration
   * @param operationType - The type of operation performed
   * @param response - The response object from the provider
   * @param durationMs - Duration of the operation in milliseconds
   * @param additionalContext - Optional additional context (chunk count, etc.)
   * @returns Cost metrics data ready for database insertion
   *
   * Future enhancements:
   * - Support for additional context types
   * - Provider-specific metadata extraction
   * - Error handling for malformed responses
   * - Validation of cost data
   */
  abstract createCostMetricsData(
    config: FullAppConfig,
    operationType: CostOperationType,
    response: any,
    durationMs: number,
    additionalContext?: {
      chunkCount?: number;
    }
  ): {
    cost_operation_type: CostOperationType;
    provider_type: ProviderType;
    model_name: string;
    base_url: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
    cost_per_1k_prompt_tokens?: number;
    cost_per_1k_completion_tokens?: number;
    duration_ms: number;
    chunk_count?: number;
  };

  /**
   * Estimates cost before making an API call
   *
   * @param model - The model name/identifier
   * @param operationType - The type of operation
   * @param estimatedTokens - Estimated token count
   * @returns Estimated cost in USD
   *
   * Future enhancements:
   * - Input length estimation
   * - Historical cost averaging
   * - Model-specific estimation strategies
   * - Confidence intervals for estimates
   */
  abstract estimateCost(
    model: string,
    operationType: CostOperationType,
    estimatedTokens: number
  ): number;

  /**
   * Validates cost data before storage
   *
   * @param costData - Cost metrics data to validate
   * @returns Whether the data is valid
   *
   * Future enhancements:
   * - Range validation for costs
   * - Token count validation
   * - Provider-specific validation rules
   * - Currency validation
   */
  abstract validateCostData(costData: any): boolean;

  /**
   * Converts cost between currencies
   *
   * @param amount - Amount in source currency
   * @param fromCurrency - Source currency code
   * @param toCurrency - Target currency code
   * @returns Converted amount
   *
   * Future enhancements:
   * - Real-time exchange rates
   * - Cached exchange rate data
   * - Support for multiple currency pairs
   */
  abstract convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number;

  /**
   * Aggregates costs across multiple operations
   *
   * @param costDataArray - Array of cost data to aggregate
   * @returns Aggregated cost summary
   *
   * Future enhancements:
   * - Time-based aggregation
   * - User-based aggregation
   * - Model-based aggregation
   * - Custom aggregation functions
   */
  abstract aggregateCosts(costDataArray: any[]): {
    totalCost: number;
    totalTokens: number;
    operationBreakdown: Record<string, { cost: number; tokens: number }>;
  };
}
