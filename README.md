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
│   └── utils/                          # Global utility functions
├── tests/                              # Test suite
├── docker-compose.yaml                 # Qdrant and external services
├── .env.example
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

### Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose (for Qdrant)

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

3. Start Qdrant (optional, for future use):
```bash
docker-compose up -d
```

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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment (development/production/test) | development |
| QDRANT_URL | Qdrant vector database URL | http://localhost:6333 |
| QDRANT_API_KEY | Qdrant API key (optional) | - |
| OPENAI_API_KEY | OpenAI API key (for future use) | - |
| MODEL_URL | LLM model URL (for future use) | http://localhost:11434 |
| MODEL_NAME | LLM model name (for future use) | - |

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

Tests should mirror the `src/` structure in the `tests/` directory.
