"""Validation should reject obviously incomplete or malformed records."""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from src.models import Condition, ServiceEvent, Veteran


def valid_veteran(**overrides):
    data = dict(first_name="Dana", last_name="Reyes", dob=date(1988, 3, 12))
    data.update(overrides)
    return Veteran(**data)


def test_accepts_a_complete_veteran():
    veteran = valid_veteran(service_start=date(2007, 6, 1), service_end=date(2013, 8, 30))
    assert veteran.full_name == "Dana Reyes"
    assert veteran.id


def test_rejects_one_letter_name():
    with pytest.raises(ValidationError):
        valid_veteran(first_name="D")


def test_rejects_future_birth_date():
    with pytest.raises(ValidationError):
        valid_veteran(dob=date.today() + timedelta(days=1))


def test_rejects_service_end_before_service_start():
    with pytest.raises(ValidationError):
        valid_veteran(service_start=date(2010, 1, 1), service_end=date(2009, 1, 1))


def test_rejects_service_starting_before_birth():
    with pytest.raises(ValidationError):
        valid_veteran(service_start=date(1980, 1, 1))


def test_rejects_malformed_email_and_short_phone():
    with pytest.raises(ValidationError):
        valid_veteran(email="dana-at-example")
    with pytest.raises(ValidationError):
        valid_veteran(phone="555")


def test_blank_optional_contact_fields_become_none():
    veteran = valid_veteran(email="  ", phone="")
    assert veteran.email is None and veteran.phone is None


def test_condition_requires_a_symptom_description():
    with pytest.raises(ValidationError):
        Condition(name="Tinnitus", current_symptoms="bad")


def test_condition_rejects_future_onset():
    with pytest.raises(ValidationError):
        Condition(
            name="Tinnitus",
            current_symptoms="Ringing in both ears all day.",
            onset_date=date.today() + timedelta(days=30),
        )


def test_service_connection_story_needs_at_least_one_signal():
    unlinked = Condition(name="Tinnitus", current_symptoms="Ringing in both ears all day.")
    assert not unlinked.has_service_connection_story

    linked = Condition(
        name="Tinnitus", current_symptoms="Ringing in both ears all day.", worsened_in_service=True
    )
    assert linked.has_service_connection_story


def test_service_event_requires_a_real_description():
    with pytest.raises(ValidationError):
        ServiceEvent(title="Blast", description="x")
