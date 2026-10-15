# Report contract, version 1

Run reports have `version`, `ok`, `durationMs`, `counts` and `tasks`.
Task order follows configuration declaration order, not completion order.
No command arguments, paths or child output are included.

Example with fictional durations:

```json
{
  "version": 1,
  "ok": false,
  "durationMs": 120,
  "counts": { "passed": 1, "failed": 1, "timed-out": 0, "skipped": 1, "cancelled": 0 },
  "tasks": [
    { "name": "test", "status": "failed", "exitCode": 1, "durationMs": 80 },
    { "name": "build", "status": "skipped", "reason": "dependency", "exitCode": null, "durationMs": 0 },
    { "name": "docs", "status": "passed", "exitCode": 0, "durationMs": 90 }
  ]
}
```

Task states in final reports: `passed`, `failed`, `timed-out`, `skipped`,
`cancelled`. `pending` and `running` are internal/event states only. Elapsed
milliseconds are rounded, so very short operations can report zero.

`exitCode` is null when no normal exit code is available or a task never
started. Optional reasons include `spawn-error`, `signal`, `dependency`,
`interrupted`, and `executor-error`. A timeout/cancelled running task is
identified by its status; its exit code can vary by platform.

Plan reports have `version: 1`, `action: "plan"`, effective `concurrency` and
`tasks` containing only `name`, `needs` and `timeoutMs`. The order is declaration
order, with edges explicitly shown; it is not a sequential execution list.

Configuration/usage failures return exit 2 and an `error` object:

```json
{ "version": 1, "ok": false, "error": { "code": "dependency-cycle", "task": "build" } }
```

The validated task name is included when useful. Codes include `usage`,
`read-config`, `invalid-config`, `task-limit`, `invalid-concurrency`,
`invalid-task-name`, `invalid-task`, `invalid-command`, `invalid-dependencies`,
`invalid-cwd`, `invalid-timeout`, `unknown-dependency`, `dependency-cycle`,
`unknown-target`, and unexpected `internal` errors. Raw parser and OS error text
is not printed. Consumers should branch on codes, not human messages.
