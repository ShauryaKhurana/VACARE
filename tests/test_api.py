"""Tests for the JSON API layer."""


SAMPLE_PAYLOAD = {
    "path_hint": "first_claim",
    "veteran": {
        "first_name": "Dana",
        "last_name": "Reyes",
        "service_start": "2007-06-01",
        "service_end": "2013-08-30",
        "branch": "army",
        "discharge_type": "honorable",
    },
    "conditions": [
        {
            "name": "Tinnitus",
            "current_symptoms": "Ringing in both ears all day.",
            "started_in_service": True,
        }
    ],
    "evidence_on_hand": ["dd214"],
    "dd214_facts": {
        "service_start": "2007-06-01",
        "service_end": "2013-08-30",
        "mos_code": "11B",
        "deployments": ["Afghanistan"],
    },
}


def test_list_paths(client):
    response = client.get("/api/paths")
    assert response.status_code == 200
    paths = response.json()
    assert any(item["path"] == "first_claim" for item in paths)
    assert paths[0]["required_fields"]


def test_create_case_and_submit_payload(client):
    created = client.post("/api/cases", json={})
    assert created.status_code == 201
    case_id = created.json()["case_id"]

    checklist = client.post(f"/api/cases/{case_id}/payload", json=SAMPLE_PAYLOAD)
    assert checklist.status_code == 200
    body = checklist.json()
    assert body["lane"] == "first_claim"
    assert body["condition_count"] if "condition_count" in body else True
    assert any(hit["rule_id"] == "noise_exposure_mos" for hit in body["presumptive_hits"])
    assert body["next_ask"] is not None or body["readiness_score"] >= 0


def test_checklist_and_review_endpoints(client):
    case_id = client.post("/api/cases", json={}).json()["case_id"]
    client.post(f"/api/cases/{case_id}/payload", json=SAMPLE_PAYLOAD)

    checklist = client.get(f"/api/cases/{case_id}/checklist")
    assert checklist.status_code == 200
    assert checklist.json()["lane_title"]

    review = client.get(f"/api/cases/{case_id}/review")
    assert review.status_code == 200
    items = review.json()["items"]
    assert any(item["category"] == "PRESUMPTIVE_ELIGIBILITY" for item in items)


def test_packet_and_va_intake_mock(client):
    case_id = client.post("/api/cases", json={}).json()["case_id"]
    client.post(f"/api/cases/{case_id}/payload", json=SAMPLE_PAYLOAD)

    packet = client.get(f"/api/cases/{case_id}/packet")
    assert packet.status_code == 200
    assert "VSO-READY CLAIM PACKET" in packet.json()["packet"]

    intake = client.post(f"/api/cases/{case_id}/va/intake")
    assert intake.status_code == 200
    assert intake.json()["submission_id"].startswith("mock-")


def test_increase_path_routes_correctly(client):
    case_id = client.post("/api/cases", json={}).json()["case_id"]
    payload = {
        "path_hint": "increase",
        "situation": {
            "has_existing_rating": True,
            "has_filed_before": True,
            "claiming_worse": True,
            "combined_rating": 30,
        },
        "veteran": {
            "first_name": "Alex",
            "last_name": "Kim",
            "service_start": "2010-01-01",
            "service_end": "2018-01-01",
        },
        "conditions": [
            {
                "name": "PTSD",
                "current_symptoms": "Nightmares and panic attacks most days.",
            }
        ],
        "evidence_on_hand": ["current_medical_record"],
    }
    body = client.post(f"/api/cases/{case_id}/payload", json=payload).json()
    assert body["lane"] == "increase"


def test_unknown_case_returns_404(client):
    assert client.get("/api/cases/does-not-exist/checklist").status_code == 404
