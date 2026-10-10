"""Priority rules: plain arithmetic, no AWS calls, no AI.

The table follows the USACE Flood Fight Handbook (2009) as written in docs/SPEC.md,
"The priority rules". The sign comes from the reporter's tap, the river state from the
official gauge, the history from the stretch's own record. Nothing here reads free text,
so a transcript or an AI draft can never set, raise or lower a priority.

Engineers can raise a priority (``raise_to``) but never lower one.
"""

from __future__ import annotations

from dataclasses import dataclass, field

P1, P2, P3 = "P1", "P2", "P3"
ORDER = {P1: 1, P2: 2, P3: 3}

# Every sign a reporter can tap, and where it starts.
BASE = {
    "overtopping": P1,  # overtopping, or water within 0.5 m of the top
    "boil_soil": P1,  # boil or piping carrying soil (muddy water, sand coming out)
    "top_slumping": P1,  # the top of the embankment slumping
    "boil_clear": P2,  # boil with clear water in a steady flow
    "slip": P2,  # slip of the land-side slope
    "crack": P2,  # crack along the top
    "seepage_clear": P3,  # seepage with clear water
    "seepage_soil": P2,  # seepage carrying soil (the seepage row, raised)
    "rathole": P3,  # rat or animal holes (local practice; not in the handbook)
}
SIGNS = frozenset(BASE)

# Freeboard below this many metres counts as overtopping (SPEC: "water within 0.5 m of the top").
NEAR_TOP_M = 0.5


@dataclass(frozen=True)
class River:
    """The nearest official gauge: its reading against its danger level, and its trend."""

    above_danger: bool = False
    rising: bool = False


@dataclass(frozen=True)
class Stretch:
    """The kilometre's own record."""

    breach_last_5y: bool = False
    vulnerable: bool = False


@dataclass(frozen=True)
class Observed:
    """Tapped details that raise a sign within its own row. Never from free text."""

    flow_growing: bool = False
    muddy: bool = False
    large_area: bool = False
    freeboard_m: float | None = None


@dataclass(frozen=True)
class Decision:
    priority: str
    reasons: tuple[str, ...] = field(default_factory=tuple)


class UnknownSign(ValueError):
    pass


def _up(p: str) -> str:
    return P1 if p in (P1, P2) else P2


def priority(sign: str, river: River = River(), stretch: Stretch = Stretch(), seen: Observed = Observed()) -> Decision:
    """The priority for one report. Pure: same inputs, same answer."""
    if sign not in BASE:
        raise UnknownSign(sign)
    p = BASE[sign]
    why = [f"{sign}: {p}"]

    if seen.freeboard_m is not None and seen.freeboard_m < NEAR_TOP_M and p != P1:
        p = P1
        why.append(f"water within {NEAR_TOP_M} m of the top: P1")
    if sign == "boil_clear" and (seen.flow_growing or seen.muddy):
        p = P1
        why.append("the boil's flow is growing or turning muddy: P1")
    if sign == "slip" and river.above_danger:
        p = P1
        why.append("the river is above danger level: P1")
    if sign == "crack" and river.rising:
        p = P1
        why.append("the river is rising: P1")
    if sign == "seepage_clear" and (seen.muddy or seen.large_area):
        p = P2
        why.append("the seepage carries soil or soaks a large area: P2")
    if sign == "rathole" and river.above_danger:
        p = P2
        why.append("the river is above danger level: P2")
    if (stretch.breach_last_5y or stretch.vulnerable) and p != P1:
        p = _up(p)
        why.append(f"the stretch breached in the last five years or is on the vulnerable list: {p}")
    return Decision(p, tuple(why))


def raise_to(current: str, requested: str) -> str:
    """An engineer's change. Raising is allowed; a request to lower keeps the current priority."""
    if current not in ORDER or requested not in ORDER:
        raise ValueError(f"unknown priority {current!r} or {requested!r}")
    return requested if ORDER[requested] < ORDER[current] else current


def answer_minutes(p: str) -> int:
    """Minutes the person paged has to tap "on my way" (SPEC: 10 for a P1, 30 for a P2)."""
    return {P1: 10, P2: 30, P3: 240}[p]
