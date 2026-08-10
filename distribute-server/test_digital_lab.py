import random
import unittest

from digital_lab import select_digital_lab_groups
from algorithm import Algorithm, Course, Student


class DigitalLabLotteryTest(unittest.TestCase):
    def test_requires_exactly_three_unique_known_members(self):
        groups = [
            {"code": "VALID", "memberUserIDs": ["A", "B", "C"]},
            {"code": "SHORT", "memberUserIDs": ["D", "E"]},
            {"code": "DUP", "memberUserIDs": ["D", "D", "E"]},
            {"code": "UNKNOWN", "memberUserIDs": ["D", "E", "X"]},
        ]
        grades = {key: 3 for key in "ABCDE"}
        selected = select_digital_lab_groups(groups, grades, rng=random.Random(1))
        self.assertEqual([group["code"] for group in selected], ["VALID"])

    def test_higher_minimum_group_grade_wins_before_lower_grade(self):
        groups = [
            {"code": "LOW", "memberUserIDs": ["A", "B", "C"]},
            {"code": "HIGH", "memberUserIDs": ["D", "E", "F"]},
        ]
        grades = {"A": 4, "B": 4, "C": 2, "D": 3, "E": 3, "F": 3}
        selected = select_digital_lab_groups(
            groups, grades, max_groups=1, rng=random.Random(1)
        )
        self.assertEqual(selected[0]["code"], "HIGH")

    def test_capacity_is_twelve_groups(self):
        groups = []
        grades = {}
        for index in range(13):
            members = [f"S{index}-{member}" for member in range(3)]
            groups.append({"code": str(index), "memberUserIDs": members})
            grades.update({member: 3 for member in members})
        selected = select_digital_lab_groups(groups, grades, rng=random.Random(1))
        self.assertEqual(len(selected), 12)

    def test_winner_skips_first_normal_ten_select_two_round(self):
        students = [
            Student("Winner", "W", {"T": ["A", "B"]}, 3),
            Student("Normal", "N", {"T": ["A", "B"]}, 3),
        ]
        course = Course({
            "id": "T",
            "name": "Ten Select Two",
            "type": "Ten-Select-Two",
            "number": 2,
            "students": [],
            "options": {
                "A": {"limit": 2, "priority_type": "none", "priority_value": 0},
                "B": {"limit": 2, "priority_type": "none", "priority_value": 0},
            },
        })
        results = Algorithm.distribute([course], students, {"T": ["W"]})
        winner_normal_results = [item for item in results if item["studentID"] == "W"]
        normal_results = [item for item in results if item["studentID"] == "N"]
        self.assertEqual(len(winner_normal_results), 1)
        self.assertEqual(len(normal_results), 2)


if __name__ == "__main__":
    unittest.main()
