"""Seed disk parse cache for the sample DD-214 (no API call).

Prefer: PYTHONPATH=. python scripts/seed_sample_caches.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seed_sample_caches import main  # noqa: E402

if __name__ == "__main__":
    main()
