#!/usr/bin/env python3
"""Seed demo claims for VACARE.

Default: wipe all claims and seed one (Tinnitus & Lower back pain).
Use --full for four lifecycle demo claims.

Usage:
    PYTHONPATH=. python scripts/seed_demo_journey.py
    PYTHONPATH=. python scripts/seed_demo_journey.py --full --replace
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.demo_seed import (  # noqa: E402
    clear_all_claims,
    demo_summary,
    primary_claim_summary,
    seed_demo_journey,
    seed_primary_claim,
)
from src.storage import DEFAULT_DB_PATH, ClaimStore  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed VACARE demo claims")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Seed four lifecycle demo claims instead of one primary claim",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="With --full: replace existing demo claims by email",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"SQLite path (default: {DEFAULT_DB_PATH})",
    )
    args = parser.parse_args()

    with ClaimStore(args.db) as db:
        if args.full:
            ids = seed_demo_journey(db, replace=args.replace)
            lines = demo_summary(ids)
        else:
            removed = clear_all_claims(db)
            if removed:
                print(f"Removed {removed} existing claim(s).")
            claim_id = seed_primary_claim(db)
            lines = primary_claim_summary(claim_id)

    for line in lines:
        print(line)


if __name__ == "__main__":
    main()
