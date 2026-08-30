"""Seed disk parse cache for sample fixtures (no API calls).

Usage (from repo root):
    PYTHONPATH=. python scripts/seed_sample_caches.py
"""

from pathlib import Path

from src import parse_cache
from tests.test_extract import DD214_PAYLOAD, MEDICAL_RECORD_PAYLOAD, SERVICE_TREATMENT_RECORD_PAYLOAD

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = {
    "sample_dd214.pdf": DD214_PAYLOAD,
    "sample_medical_record.pdf": MEDICAL_RECORD_PAYLOAD,
    "sample_service_treatment_record.pdf": SERVICE_TREATMENT_RECORD_PAYLOAD,
}


def main() -> None:
    for filename, payload in FIXTURES.items():
        path = ROOT / "tests" / "fixtures" / filename
        if not path.is_file():
            raise SystemExit(f"Missing fixture: {path} — run the matching generate script first.")
        data = path.read_bytes()
        parse_cache.store(data, payload)
        print(f"Cached {filename} ({len(data)} bytes) -> {parse_cache.file_hash(data)}")


if __name__ == "__main__":
    main()
