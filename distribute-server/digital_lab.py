import random


DIGITAL_LAB_OPTION = "數電實驗"
DIGITAL_LAB_MAX_GROUPS = 12


def select_digital_lab_groups(groups, student_grades, max_groups=DIGITAL_LAB_MAX_GROUPS, rng=None):
    """Select complete groups, higher grade first and random within a grade tier.

    A group's tier is its lowest member grade, capped at fourth grade. This keeps
    the three-person group indivisible and prevents one senior member from
    elevating an otherwise lower-grade group.
    """
    rng = rng or random
    by_grade = {}
    for group in groups:
        members = list(dict.fromkeys(group.get("memberUserIDs", [])))
        if len(members) != 3 or any(member not in student_grades for member in members):
            continue
        grade = min(min(student_grades[member], 4) for member in members)
        by_grade.setdefault(grade, []).append(group)

    ordered = []
    for grade in sorted(by_grade, reverse=True):
        same_grade = by_grade[grade]
        rng.shuffle(same_grade)
        ordered.extend(same_grade)
    return ordered[:max_groups]
