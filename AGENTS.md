# Project Rules

## Process Model

- Build two independent process entry points: `src/api-server.ts` compiles to `dist/api-server.js`, and `src/worker.ts` compiles to `dist/worker.js`.
- The API process owns HTTP concerns and creates durable jobs; it does not perform indexing work.
- The worker process owns polling, atomic job claims, heartbeats, retries, and semantic indexing; it does not expose HTTP routes.
- API and worker share services, helpers, DAOs, connectors, configuration, and the CodeRAG facade, but must scale independently.

## Clean Architecture

- Services are the KING orchestration layer: they decide what the application does and coordinate dependencies.
- Helpers implement platform-specific business operations requested by services; they do not orchestrate use cases.
- Repository processing accepts an explicit `ScannedFile[]` from initial indexing or delta detection. It must not independently rescan an entire repository during refresh.
- Follow the documented project structure. Do not introduce new top-level source folders such as `factories/` or `scripts/` without explicit approval.
- Use simple kebab-case filenames without role suffixes such as `.service`, `.helper`, or `.connector` for new files.
- Reusable RAG verification composition belongs under `tests/helpers`, not production source, and temporary runners must be invoked manually rather than added to package scripts.
- Keep hybrid retrieval, source-aware context assembly, and LLM augmentation as separate operations.
- Preserve both Markdown and external documentation rails such as Confluence by converting them to CodeRAG `doc` chunks before shared enrichment/indexing.
- Tests that clean Qdrant must assert point creation before teardown and clearly identify the collection they clean.
- DAOs contain direct PostgreSQL access and transaction/locking details.
- Connectors construct and expose external clients.
- Controllers translate HTTP input/output and remain thin.
- Routes bind controllers only.
- `src/services/core` contains selective folder-level `index.ts` facades that import and re-export `@code-rag/core@0.1.10`; do not copy or reimplement CodeRAG internals.
- Application code imports CodeRAG capabilities through `@/services/core/index.js`.

## Engineering Principles

- Follow SOLID principles, DRY, and simple design. Introduce a pattern or abstraction only when it establishes a real boundary or removes demonstrated duplication.
- Prefer constructor injection and narrow interfaces at service boundaries.
- Keep provider selection and environment configuration outside the CodeRAG facade.
- Do not expose Ollama-specific providers or lifecycle managers through the facade; use OpenAI-compatible provider contracts.
- Use `Repository.last_processed_job_id` as the pointer to the latest successful job. Derive the processed commit from that job's `commit_head`.
- Advance `last_processed_job_id` only in the same transaction that completes a successful job.

## Testing and Verification

- Use test-driven development: add a failing test before implementation.
- Every implemented behavior requires an associated test.
- Mocks, spies, intercepted network calls, and stub providers are prohibited.
- Use real implementations, temporary repositories/files, and isolated real PostgreSQL, Qdrant, and OpenAI-compatible services.
- Run `npm test` and `npm run build` before considering work complete.
- Use Podman commands and `podman-compose`; do not use Docker commands.

## TypeScript

- Use strict TypeScript and ESM imports with `.js` extensions.
- Use `@/...` path aliases for application imports instead of relative imports.
- Prefer named exports.

## Configuration

- Environment variables use dotted key format in `.env` files (e.g., `app.server.port=3000`)
- Configuration loading follows precedence: `.env` > YAML files (app.yaml, prompts.yaml) > fallback values
- `src/utils/env-loader.ts` handles all `.env` file reading and parsing with dotted key support
- `src/utils/yaml-loader.ts` only handles YAML file loading and parsing
- `getConfigValue` function uses env-loader for `.env` lookup, then falls back to YAML nested values
- Prompt templates use Nunjucks templating engine with Jinja-like syntax for variable substitution
