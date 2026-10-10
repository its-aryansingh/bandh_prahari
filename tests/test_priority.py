"""One test per row of the priority table (docs/SPEC.md, "The priority rules"), plus the two
rules around it: a stretch's history raises one level, and engineers raise but never lower."""

import pytest

from rules.priority import (
    P1,
    P2,
    P3,
    Observed,
    River,
    Stretch,
    UnknownSign,
    answer_minutes,
    priority,
    raise_to,
)

HIGH = River(above_danger=True)
RISING = River(rising=True)


# Row 1: overtopping, or water within 0.5 m of the top: P1, already highest.
def test_overtopping_is_p1():
    assert priority("overtopping").priority == P1


def test_water_within_half_a_metre_of_the_top_is_p1_whatever_the_sign():
    assert priority("crack", seen=Observed(freeboard_m=0.4)).priority == P1
    assert priority("crack", seen=Observed(freeboard_m=0.6)).priority == P2


# Row 2: boil or piping carrying soil, or the top slumping: P1.
def test_boil_carrying_soil_is_p1():
    assert priority("boil_soil").priority == P1


def test_top_slumping_is_p1():
    assert priority("top_slumping").priority == P1


# Row 3: boil with clear water: P2; to P1 if the flow grows or turns muddy.
def test_clear_boil_is_p2():
    assert priority("boil_clear").priority == P2


@pytest.mark.parametrize("seen", [Observed(flow_growing=True), Observed(muddy=True)])
def test_clear_boil_growing_or_muddy_is_p1(seen):
    assert priority("boil_clear", seen=seen).priority == P1


# Row 4: slip of the land-side slope: P2; to P1 if the river is above danger level.
def test_slip_is_p2():
    assert priority("slip").priority == P2


def test_slip_with_river_above_danger_is_p1():
    assert priority("slip", river=HIGH).priority == P1


def test_slip_with_river_only_rising_stays_p2():
    assert priority("slip", river=RISING).priority == P2


# Row 5: crack along the top: P2; to P1 if the river is rising.
def test_crack_is_p2():
    assert priority("crack").priority == P2


def test_crack_with_river_rising_is_p1():
    assert priority("crack", river=RISING).priority == P1


# Row 6: seepage with clear water: P3; to P2 if it carries soil or soaks a large area.
def test_clear_seepage_is_p3():
    assert priority("seepage_clear").priority == P3


@pytest.mark.parametrize("seen", [Observed(muddy=True), Observed(large_area=True)])
def test_seepage_with_soil_or_large_area_is_p2(seen):
    assert priority("seepage_clear", seen=seen).priority == P2


def test_seepage_tapped_as_carrying_soil_is_p2():
    assert priority("seepage_soil").priority == P2


# Row 7: rat or animal holes: P3; to P2 if the river is above danger level.
def test_rathole_is_p3():
    assert priority("rathole").priority == P3


def test_rathole_with_river_above_danger_is_p2():
    assert priority("rathole", river=HIGH).priority == P2


# A stretch that breached in the last five years, or is on the vulnerable list, goes up one level.
@pytest.mark.parametrize("stretch", [Stretch(breach_last_5y=True), Stretch(vulnerable=True)])
def test_stretch_history_raises_one_level(stretch):
    assert priority("seepage_clear", stretch=stretch).priority == P2
    assert priority("crack", stretch=stretch).priority == P1
    assert priority("overtopping", stretch=stretch).priority == P1


def test_history_raises_after_the_row_rule():
    # a rat hole with the river above danger is P2, and a vulnerable stretch makes it P1
    assert priority("rathole", river=HIGH, stretch=Stretch(vulnerable=True)).priority == P1


# Engineers can raise a priority, never lower it.
def test_engineers_can_raise():
    assert raise_to(P3, P1) == P1
    assert raise_to(P2, P1) == P1


def test_engineers_cannot_lower():
    assert raise_to(P1, P3) == P1
    assert raise_to(P2, P3) == P2


def test_every_decision_says_why():
    d = priority("crack", river=RISING, stretch=Stretch(vulnerable=True))
    assert d.priority == P1 and d.reasons[0] == "crack: P2" and any("rising" in r for r in d.reasons)


def test_unknown_sign_is_refused():
    with pytest.raises(UnknownSign):
        priority("something the AI made up")


def test_pure_same_inputs_same_answer():
    assert priority("slip", river=HIGH) == priority("slip", river=HIGH)


def test_answer_clock_follows_priority():
    assert answer_minutes(P1) == 10 and answer_minutes(P2) == 30
