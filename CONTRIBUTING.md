# Contributing

Use Node.js 22 or newer. Run `npm ci --ignore-scripts` and `npm run check`.
There are no external dependencies or build steps.

For a change, describe the problem, expected behavior and validation. Add
focused tests for scheduling rules or process lifecycle changes; prefer
deterministic barriers over timing-based assertions. Keep fixtures fictional.

Preserve argument-array execution, bounded concurrency, dependency failure
propagation and the report contract. Do not add command contents, paths or raw
child output to reports. Changes to timeouts and cancellation need process
tests on Windows and POSIX. Discuss new configuration syntax before using it
in another project.
