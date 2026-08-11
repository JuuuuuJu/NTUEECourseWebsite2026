import unittest

from algorithm import Course, Student
from statistics import Analysis


class StatisticsDigitalLabTest(unittest.TestCase):
    def setUp(self):
        self.course = Course({
            "id": "Ten-Select-Two",
            "name": "十選二實驗",
            "type": "Ten-Select-Two",
            "number": 2,
            "students": [],
            "options": {
                "A": {
                    "limit": 10,
                    "priority_type": "none",
                    "priority_value": 0,
                },
                "B": {
                    "limit": 10,
                    "priority_type": "none",
                    "priority_value": 0,
                },
                "數電實驗": {
                    "limit": 36,
                    "priority_type": "none",
                    "priority_value": 0,
                },
            },
        })
        self.students = [
            Student("Zero", "ZERO", {"Ten-Select-Two": []}, 2),
            Student("Digital", "DIGITAL", {"Ten-Select-Two": []}, 3),
            Student(
                "DigitalNormal",
                "DIGITAL_NORMAL",
                {"Ten-Select-Two": ["A", "B"]},
                4,
            ),
            Student("Normal", "NORMAL", {"Ten-Select-Two": ["A", "B"]}, 2),
        ]
        self.results = [
            {
                "studentID": "DIGITAL",
                "courseID": "Ten-Select-Two",
                "optionName": "數電實驗",
            },
            {
                "studentID": "DIGITAL_NORMAL",
                "courseID": "Ten-Select-Two",
                "optionName": "數電實驗",
            },
            {
                "studentID": "DIGITAL_NORMAL",
                "courseID": "Ten-Select-Two",
                "optionName": "B",
            },
            {
                "studentID": "NORMAL",
                "courseID": "Ten-Select-Two",
                "optionName": "A",
            },
            {
                "studentID": "NORMAL",
                "courseID": "Ten-Select-Two",
                "optionName": "B",
            },
        ]

    def test_total_counts_include_digital_but_ranks_remain_normal_only(self):
        analysis = Analysis([self.course], self.students, self.results)
        analysis.analyze()
        row = analysis._analysis_order_df.loc["十選二實驗"]
        self.assertEqual(row["中0個"], 1)
        self.assertEqual(row["中1個"], 1)
        self.assertEqual(row["中2個"], 2)
        self.assertEqual(row["第1志願"], 1)
        self.assertEqual(row["第2志願"], 2)

    def test_digital_is_in_grade_results_but_not_rank_tables(self):
        analysis = Analysis([self.course], self.students, self.results)
        analysis.analyze_grade()
        analysis.analyze_selection_grade()
        analysis.analyze_selection_result()
        digital_grades = analysis._analysis_grade_dict["十選二實驗"].loc[
            "數電實驗"
        ]
        self.assertEqual(int(digital_grades.sum()), 2)
        self.assertNotIn(
            "數電實驗",
            analysis._analysis_selections_grade_dict["Ten-Select-Two"],
        )
        self.assertNotIn(
            "數電實驗",
            analysis._analysis_order_option_dict["Ten-Select-Two"].index,
        )


if __name__ == "__main__":
    unittest.main()

