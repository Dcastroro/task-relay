# Security model

Task Relay executes commands. Configuration files must be trusted; they are
code in practical terms. The child inherits user permissions, current
environment variables and access to the host. Working directories can point
outside the configuration directory. There is no isolation, allowlist,
credential filtering or rollback.

The runner inserts no shell. Arrays preserve individual arguments, but a
configured executable can itself interpret scripts, invoke a shell or access
the network. Review a graph before running it; `plan` validates without
executing commands. Planning does not certify that those commands are safe.

Normal/JSON reports contain task names, statuses, durations and exit codes,
not raw commands, paths or child output. Treat task names as public report
metadata. `--verbose` can expose whatever commands print, including secrets;
it is capped at 64 KiB per task and is not redacted.

Timeout/cancel cleanup targets POSIX process groups or Windows process trees.
Deliberately detached processes and forced OS termination of the runner are
outside the guarantee. Process control is not a security boundary.

Configuration-file reads are bounded to 128 KiB; graphs to 200 tasks;
concurrency to 32. These limits do not constrain the CPU, memory, network or
disk use of executed commands.

For a security report, contact the maintainer through the contact channel
linked on their GitHub profile. Do not post credentials or private command
output in public issues. Use a minimal reproduction with fabricated data.
