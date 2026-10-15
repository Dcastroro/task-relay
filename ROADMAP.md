# Roadmap

Version 0.1.0 ships the core: validated dependency graphs, target selection,
bounded concurrency, timeouts, cancellation and versioned reports.

Potential next increments, not current features:

1. **Changed-file task selection:** map file patterns to targets, with tests
   for deleted/renamed files and shared prerequisites.
2. **Report comparison:** compare two saved runs without confusing machine
   startup noise with a performance regression.
3. **Editor support:** a JSON Schema and examples for configuration completion.

No automatic caching or retries until side effects, invalidation and duplicate
execution are explicitly addressed. Keep the runner small enough to audit and
embed in existing projects.
