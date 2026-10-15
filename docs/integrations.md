# Integrations

## GitHub Actions

After placing a reviewed copy of Task Relay at `tools/task-relay`, run your
project's committed task graph:

```yaml
- name: Run development pipeline
  run: node tools/task-relay/bin/task-relay.mjs run --config task-relay.json --json
```

The exit code fails the workflow if any required task fails. Nothing is
uploaded by Task Relay. If you want an artifact, use your existing CI artifact
process to collect the JSON report. Preserve the command's exit code if you
add output redirection or another wrapper.

## Use Env Contract Check as a prerequisite

[Env Contract Check](https://github.com/Dcastroro/env-contract-check) validates
configuration presence; Task Relay decides when that check must run.
Place reviewed copies of both tools in your project's `tools/` directory.

```json
{
  "version": 1,
  "tasks": {
    "environment": {
      "command": ["$node", "tools/env-contract-check/bin/env-contract-check.mjs", "--example", ".env.example", "--env", ".env", "--strict"]
    },
    "test": {
      "command": ["$node", "--test"],
      "needs": ["environment"],
      "timeoutMs": 60000
    }
  }
}
```

If configuration validation fails, tests are skipped. Environment files stay
local to your chosen process. Task Relay's default/JSON reports omit child
output; `--verbose` forwards it. Both commands can still read local files and
inherit environment variables, so use your existing credential handling.

## Check API contract changes before a build

[API Drift Guard](https://github.com/Dcastroro/api-drift-guard) compares two local
OpenAPI JSON contracts and blocks breaking/review findings by default. Add it
as a prerequisite to skip a build when the contract gate fails. The comparator
requires no credentials and emits line-based reports without input names or
values. See its [Task Relay example](https://github.com/Dcastroro/api-drift-guard/blob/main/docs/automation.md)
for a complete configuration and supported-input limits.

## Other languages

Task Relay is not limited to Node commands. An argument array such as
`["python", "-m", "unittest", "discover"]` works when that executable is
installed and accessible to the child process. Its installation, environment
and language-specific tooling remain the project's responsibility.
