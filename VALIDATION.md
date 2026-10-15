# Validation

Verified locally on 15 October 2026 with Windows and Node.js v24.20.0.

- `npm run check`: syntax checks passed; 35 tests passed and one POSIX-only
  CLI signal test was skipped, out of 36 tests total.
- `npm run pipeline -- --verbose`: Task Relay ran its own syntax/tests and
  then both demo checks; all four pipeline tasks passed.
- Demo planning started no commands. The five-step demo graph passed.
- Real subprocess tests cover exit-code propagation, timeouts, cancellation,
  literal arguments, output bounds and ordinary descendant cleanup.

CI defines Ubuntu/Windows with Node.js 22/24. The Windows suite skips the
POSIX CLI signal test; programmatic cancellation runs on both platforms.
See the repository's Actions tab for actual remote results.

No performance benchmarks or production-use claims are made. Demo timings
are illustrative and do not measure a real build system.
