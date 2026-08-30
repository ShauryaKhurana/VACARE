#!/usr/bin/env bash
# Back-compat wrapper — use start_demo.sh for the full demo setup.
exec "$(cd "$(dirname "$0")" && pwd)/start_demo.sh" "$@"
