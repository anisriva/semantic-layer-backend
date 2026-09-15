# Semantic Code Backend

Express + TypeScript backend service for semantic code analysis and RAG implementation.

## Architecture

### Layer Responsibilities

- **Services** (`src/services/`): Orchestrators that tell WHAT to do
- **Helpers** (`src/helpers/`): Business logic implementers that do HOW
- **DAOs** (`src/daos/`): Data access for direct DB calls
- **Connectors** (`src/connectors/`): External interface implementations (Qdrant, LLM providers, HTTP connectors)
- **Controllers** (`src/controllers/`): Thin HTTP request handlers
- **Models** (`src/models/`): Data shapes and DTOs
- **Config** (`src/config/`): Centralized configuration with zod validation
- **Utils** (`src/utils/`): Generic, reusable, domain-agnostic functions

### Directory Structure

```
backend/
├── src/
│   ├── app.ts                          # Express app factory
│   ├── server.ts                       # Application entry point
│   ├── config/                         # Configuration management
│   │   ├── app-config.ts              # Application config loading
│   │   ├── prompts-config.ts          # Prompts config with Nunjucks
│   │   └── index.ts
│   ├── connectors/                     # External interface implementations
│   ├── constants/                      # Application constants and enums
│   ├── controllers/                    # Request handlers
│   ├── daos/                           # Data access layer
│   ├── helpers/                        # Business logic implementers
│   ├── middlewares/                    # Express middleware
│   ├── models/                         # Data models, schemas
│   ├── routes/                         # Route definitions
│   ├── services/                       # Business orchestrators
│   ├── types/                          # Shared TS types/interfaces
│   │   └── config/                     # Config type definitions
│   └── utils/                          # Global utility functions
│       ├── env-loader.ts               # .env file loading with dotted key support
│       └── yaml-loader.ts              # YAML loading utilities
├── config/                             # YAML configuration files
│   ├── app.yaml                        # Application configuration
│   └── prompts.yaml                    # LLM prompts
├── tests/                              # Test suite
├── docker-compose.yaml                 # Qdrant and external services (compatible with podman-compose)
├── .env.example
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

### Prerequisites

- Node.js (v18 or higher)
- Podman and podman-compose (for Qdrant and Ollama)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start Qdrant and Ollama:
```bash
podman-compose up -d
```

For detailed Ollama setup instructions, including model recommendations for Apple M3 Pro (qwen2.5-coder:7b for code tasks), see [Ollama Setup Guide](../../artifacts/new/ollama-setup-guide.md).

## Semantic Core

The backend is pinned to `@code-rag/core` 0.1.10. Parser, chunker, Qdrant storage, BM25, and hybrid retrieval behavior is consumed directly from that package; application orchestration remains outside the core boundary.

`@qdrant/js-client-rest` is pinned to 1.17.0 because CodeRAG 0.1.10 uses its `search()` API.

### Running the Application

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### Health Check

Once the server is running, check the health endpoint:
```bash
curl http://localhost:3000/health
```

## Configuration

The configuration system uses a hierarchical approach with YAML files and environment variables:

### Configuration Files

- `config/app.yaml` - Application configuration (app, models, rag-pipeline sections)
- `config/prompts.yaml` - LLM prompts with Jinja-like templating

### Configuration Loading Priority

1. **.env file** (highest priority) - Dotted key format matching YAML hierarchy
2. **YAML files** (fallback) - Default values in config files
3. **Code defaults** (lowest priority) - Hardcoded fallbacks

### Environment Variables

The `.env` file uses dotted key format that matches the YAML hierarchy for intuitive configuration:

```text
# Server
app.server.port=3000
app.server.nodeEnv=development

# Worker
app.worker.pollIntervalMs=5000
app.worker.heartbeatIntervalMs=30000
app.worker.staleAfterMs=300000
app.worker.maxRetries=3

# RAG Database
app.ragDb.qdrant.url=http://localhost:6333
app.ragDb.qdrant.collectionPrefix=semantic-layer

# Application Database
app.appDb.postgres.host=localhost
app.appDb.postgres.port=5432
app.appDb.postgres.database=semantic_layer
app.appDb.postgres.user=semantic_layer

# Models
models.embedding.baseUrl=http://localhost:11434/v1
models.embedding.model=nomic-embed-text
models.embedding.dimensions=768
models.enrichment.baseUrl=http://localhost:11434/v1
models.enrichment.model=qwen2.5-coder:7b-instruct
models.enrichment.maxRetries=2
models.enrichment.retryDelayMs=1000
models.enrichment.timeout=120000
models.answer.baseUrl=http://localhost:11434/v1
models.answer.model=qwen2.5-coder:7b-instruct
models.answer.maxRetries=2
models.answer.retryDelayMs=1000
models.answer.timeout=120000

# RAG Pipeline
ragPipeline.ingestion.maxTokensPerChunk=512
ragPipeline.ingestion.excludePatterns=node_modules,dist,.git,coverage
ragPipeline.retrieval.topK=10
ragPipeline.retrieval.vectorWeight=0.7
ragPipeline.retrieval.bm25Weight=0.3
```

**Role-Specific LLM Configuration:**
- `models.enrichment.*` variables control the model used for chunk enrichment during indexing
- `models.answer.*` variables control the model used for generating grounded answers after retrieval
- These can be configured independently to use different providers or models for each role

### Configuration Utilities

- `src/utils/env-loader.ts` - Handles `.env` file parsing with dotted key support and type conversion
- `src/utils/yaml-loader.ts` - Handles YAML file loading and parsing only
- `getConfigValue()` - Main function that looks up values in `.env` first, then falls back to YAML

### Type Safety

All configuration is validated using Zod schemas with types inferred directly from the schemas (no duplicate type definitions).

## Development

### Adding a New Feature

1. **Define models** in `src/models/` if needed
2. **Create connector** in `src/connectors/` for external services
3. **Create DAO** in `src/daos/` for data access
4. **Create helper** in `src/helpers/` for business logic
5. **Create service** in `src/services/` to orchestrate
6. **Create controller** in `src/controllers/` for HTTP handling
7. **Create routes** in `src/routes/` to bind controller to paths
8. **Register routes** in `src/routes/index.ts`

### Testing

Tests should mirror the `src/` structure in the `tests/` directory. Integration tests use real services rather than mocks.

```bash
podman-compose up -d
npm test
npm run build
```

The RAG integration test parses and chunks TypeScript, generates embeddings through the configured OpenAI-compatible endpoint, persists vectors in Qdrant, and executes hybrid retrieval.

### Query-Only Verification

Querying is decoupled from indexing under `tests/helpers/query-index.ts`. This helper reloads persisted Qdrant payloads, rebuilds BM25 in memory, embeds only the new question, performs hybrid retrieval, assembles source-aware context, and invokes only the answer-role LLM. This allows testing retrieval and answer generation without re-indexing repository chunks.

To run query-only verification against a persisted index:
```bash
npx tsx tests/helpers/query-current-index.ts "Your question"
```

The persistent `semantic-layer-backend-verification` collection currently contains 101 points for verification purposes.