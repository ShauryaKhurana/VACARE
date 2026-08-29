"""Lane routing, form sequencing, and the deadline clocks."""

from datetime import date, timedelta

from src import lanes
from src.claim_intake import ClaimIntake
from src.forms import CATALOG, FilledBy
from src.lanes import Lane
from src.models import LaneContext, Veteran

TODAY = date(2026, 8, 29)


def claim_with(context: LaneContext, conditions=(("Tinnitus", "Ringing in both ears all day."),)):
    session = ClaimIntake()
    claim = session.start_claim(Veteran(first_name="Dana", last_name="Reyes", dob=date(1988, 3, 12)))
    claim.context = context
    for name, symptoms in conditions:
        session.add_condition(name=name, current_symptoms=symptoms, started_in_service=True)
    return claim


# --- routing ---------------------------------------------------------------


def test_bdd_window_is_180_to_90_days_before_separation():
    inside = LaneContext(still_serving=True, separation_date=TODAY + timedelta(days=120))
    assert lanes.determine_lane(inside, TODAY) == Lane.BDD

    day_89 = LaneContext(still_serving=True, separation_date=TODAY + timedelta(days=89))
    assert lanes.determine_lane(day_89, TODAY) == Lane.PRE_DISCHARGE

    too_early = LaneContext(still_serving=True, separation_date=TODAY + timedelta(days=200))
    assert lanes.determine_lane(too_early, TODAY) == Lane.PRE_DISCHARGE


def test_medical_board_beats_the_bdd_window():
    context = LaneContext(
        still_serving=True, separation_date=TODAY + timedelta(days=120), meb_referral=True
    )
    assert lanes.determine_lane(context, TODAY) == Lane.IDES


def test_first_claim_is_the_default_for_a_veteran_who_never_filed():
    assert lanes.determine_lane(LaneContext(), TODAY) == Lane.FIRST_CLAIM


def test_increase_and_secondary_are_told_apart_by_the_intake_answers():
    increase = LaneContext(has_filed_before=True, has_existing_rating=True, claiming_worse=True)
    assert lanes.determine_lane(increase, TODAY) == Lane.INCREASE

    secondary = LaneContext(
        has_filed_before=True, has_existing_rating=True, caused_by_rated_condition=True
    )
    assert lanes.determine_lane(secondary, TODAY) == Lane.NEW_CONDITION


def test_a_decision_to_review_outranks_an_increase():
    context = LaneContext(
        has_filed_before=True, has_existing_rating=True, claiming_worse=True,
        disagrees_with_decision=True, decision_date=TODAY - timedelta(days=30),
    )
    assert lanes.determine_lane(context, TODAY) == Lane.DECISION_REVIEW


def test_the_three_lane_five_doors():
    base = dict(disagrees_with_decision=True, decision_date=TODAY - timedelta(days=30))
    assert lanes.decision_review_door(LaneContext(**base, has_new_evidence=True)) == "20-0995"
    assert lanes.decision_review_door(LaneContext(**base)) == "20-0996"
    assert lanes.decision_review_door(LaneContext(**base, wants_judge=True)) == "10182"


def test_pre_2019_decisions_route_to_the_legacy_form():
    context = LaneContext(disagrees_with_decision=True, decision_date=date(2018, 5, 1))
    assert lanes.decision_review_door(context) == "21-0958"


# --- sequences -------------------------------------------------------------


def forms_in(claim) -> list:
    return [step.form_number for step in lanes.build_sequence(claim, TODAY) if step.form_number]


def test_first_claim_sequence_leads_with_the_intent_to_file():
    claim = claim_with(LaneContext())
    sequence = lanes.build_sequence(claim, TODAY)
    assert sequence[0].form_number == "21-0966"
    assert "21-526EZ" in forms_in(claim)


def test_bdd_skips_the_itf_because_the_effective_date_is_already_fixed():
    claim = claim_with(LaneContext(still_serving=True, separation_date=TODAY + timedelta(days=120)))
    assert "21-0966" not in forms_in(claim)
    assert lanes.build_sequence(claim, TODAY)[0].gate  # the window check


def test_mental_health_condition_adds_the_stressor_statement():
    without = claim_with(LaneContext())
    assert "21-0781" not in forms_in(without)

    with_ptsd = claim_with(LaneContext(), conditions=[("PTSD", "Nightmares and hypervigilance.")])
    assert "21-0781" in forms_in(with_ptsd)


def test_unemployability_pulls_in_both_tdiu_forms():
    claim = claim_with(LaneContext(unemployable=True))
    assert "21-8940" in forms_in(claim)
    assert "21-4192" in forms_in(claim)


def test_private_treatment_pulls_in_the_records_authorization():
    assert "21-4142" not in forms_in(claim_with(LaneContext()))
    assert "21-4142" in forms_in(claim_with(LaneContext(private_treatment=True)))


def test_increase_lane_carries_the_harsher_exam_warning():
    claim = claim_with(LaneContext(has_filed_before=True, has_existing_rating=True, claiming_worse=True))
    exam = [step for step in lanes.build_sequence(claim, TODAY) if step.gate][-1]
    assert "denial" in exam.lock


def test_third_party_dependencies_are_separated_from_veteran_tasks():
    claim = claim_with(LaneContext(unemployable=True, has_witness=True))
    owners = {step.filled_by for step in lanes.third_party_dependencies(claim)}
    assert FilledBy.EMPLOYER in owners      # 21-4192
    assert FilledBy.WITNESS in owners       # 21-10210
    assert FilledBy.VETERAN not in owners


def test_every_referenced_form_exists_in_the_catalog():
    """Guards against a typo silently dropping a form from a sequence."""
    contexts = [
        LaneContext(),
        LaneContext(still_serving=True, separation_date=TODAY + timedelta(days=120)),
        LaneContext(still_serving=True, meb_referral=True),
        LaneContext(has_filed_before=True, has_existing_rating=True, claiming_worse=True),
        LaneContext(has_filed_before=True, has_existing_rating=True, caused_by_rated_condition=True),
        LaneContext(disagrees_with_decision=True, decision_date=TODAY - timedelta(days=30)),
        LaneContext(unemployable=True, has_dependents=True, guard_or_reserve=True,
                    private_treatment=True, has_witness=True),
    ]
    for context in contexts:
        for step in lanes.build_sequence(claim_with(context), TODAY):
            if step.form_number:
                assert step.form_number in CATALOG, step.form_number
                assert step.form is not None


# --- deadlines -------------------------------------------------------------


def test_intent_to_file_expires_after_twelve_months():
    claim = claim_with(LaneContext(itf_filed_on=date.today() - timedelta(days=300)))
    itf = [d for d in lanes.deadlines(claim) if "Intent to File" in d.label][0]
    assert itf.days_left == 65
    assert itf.urgency == "soon"


def test_one_decision_date_starts_several_clocks():
    claim = claim_with(LaneContext(
        disagrees_with_decision=True,
        decision_date=date.today() - timedelta(days=10),
        has_dependents=True,
    ))
    labels = [d.label for d in lanes.deadlines(claim)]
    assert "Higher-Level Review deadline" in labels
    assert "Board Appeal deadline" in labels
    assert any("Dependents retro" in label for label in labels)


def test_an_expired_clock_is_reported_as_expired():
    claim = claim_with(LaneContext(itf_filed_on=date.today() - timedelta(days=400)))
    itf = [d for d in lanes.deadlines(claim) if "Intent to File" in d.label][0]
    assert itf.expired and itf.urgency == "expired"


def test_deadlines_come_back_soonest_first():
    claim = claim_with(LaneContext(
        itf_filed_on=date.today() - timedelta(days=300),
        records_auth_signed_on=date.today() - timedelta(days=350),
    ))
    due_dates = [d.due for d in lanes.deadlines(claim)]
    assert due_dates == sorted(due_dates)
