const mongoose = require("mongoose");
const { buildStudentResult, getPhase } = require("./studentResult");

const idAt = (seconds) => mongoose.Types.ObjectId.createFromTime(seconds);
const courses = [{ id: "Ten-Select-Two", name: "十選二實驗" }];
const selection = { _id: "s1", courseID: "Ten-Select-Two", name: "光電", ranking: 1 };

describe("student result", () => {
  test("phase follows the selection open time", () => {
    expect(getPhase(50, 100, 200)).toBe("not-open");
    expect(getPhase(150, 100, 200)).toBe("selecting");
    expect(getPhase(250, 100, 200)).toBe("ended");
    expect(getPhase(250, null, null)).toBe("ended");
  });

  test("hides everything from students before selection opens", () => {
    const payload = buildStudentResult({
      now: 50, start: 100, end: 200, isMaintainer: false,
      selections: [selection], results: [{ _id: idAt(150), courseName: "十選二實驗", optionName: "光電" }], courses,
    });
    expect(payload.selections).toEqual([]);
    expect(payload.admissions).toEqual([]);
  });

  test("returns admissions and selections after selection ends", () => {
    const payload = buildStudentResult({
      now: 300, start: 100, end: 200, isMaintainer: false,
      selections: [selection],
      results: [
        { _id: idAt(250), courseName: "十選二實驗", optionName: "光電" },
        { _id: idAt(260), courseName: "十選二實驗", optionName: "數電實驗" },
      ],
      courses,
    });
    expect(payload.phase).toBe("ended");
    expect(payload.selections).toEqual([selection]);
    expect(payload.admissions.map((item) => item.optionName)).toEqual(["光電", "數電實驗"]);
    expect(payload.coursesId2Name).toEqual({ "Ten-Select-Two": "十選二實驗" });
  });

  test("drops results left over from a previous semester", () => {
    const payload = buildStudentResult({
      now: 300, start: 100, end: 200, isMaintainer: false,
      selections: [],
      results: [{ _id: idAt(50), courseName: "十選二實驗", optionName: "舊結果" }],
      courses,
    });
    expect(payload.admissions).toEqual([]);
  });
});
