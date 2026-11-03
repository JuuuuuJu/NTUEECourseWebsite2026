const { sortResultsForCsv } = require("./resultCsv");

describe("result CSV ordering", () => {
  test("keeps the configured option order and sorts IDs within each option", () => {
    const results = [
      { studentID: "B09", courseName: "實驗", optionName: "週二" },
      { studentID: "B03", courseName: "實驗", optionName: "週一" },
      { studentID: "B01", courseName: "實驗", optionName: "週一" },
      { studentID: "A12", courseName: "實驗", optionName: "週二" },
      { studentID: "C02", courseName: "專題", optionName: "甲班" },
    ];
    const courses = [
      { name: "實驗", options: [{ name: "週二" }, { name: "週一" }] },
      { name: "專題", options: [{ name: "甲班" }] },
    ];

    expect(sortResultsForCsv(results, courses)).toEqual([
      { studentID: "A12", courseName: "實驗", optionName: "週二" },
      { studentID: "B09", courseName: "實驗", optionName: "週二" },
      { studentID: "B01", courseName: "實驗", optionName: "週一" },
      { studentID: "B03", courseName: "實驗", optionName: "週一" },
      { studentID: "C02", courseName: "專題", optionName: "甲班" },
    ]);
  });

  test("does not mutate the database result array", () => {
    const results = [
      { studentID: "B02", courseName: "實驗", optionName: "週一" },
      { studentID: "B01", courseName: "實驗", optionName: "週一" },
    ];

    const courses = [
      { name: "實驗", options: [{ name: "週一" }] },
    ];

    sortResultsForCsv(results, courses);

    expect(results.map((result) => result.studentID)).toEqual(["B02", "B01"]);
  });
});
