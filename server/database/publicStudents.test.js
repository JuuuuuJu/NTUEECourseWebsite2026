const {
  requestedStudentFields,
  serializeStudents,
} = require("./publicStudents");

describe("public student API projection", () => {
  test("rejects any request for password", () => {
    expect(() => requestedStudentFields({ name: "1", password: "1" })).toThrow(
      expect.objectContaining({ status: 403 })
    );
  });

  test("serializes only explicitly requested non-password fields", () => {
    const fields = requestedStudentFields({ name: "1", grade: "1" });
    expect(
      serializeStudents(
        [
          {
            userID: "B15000001",
            name: "陳子涵",
            grade: 1,
            password: "bcrypt-hash",
          },
        ],
        fields
      )
    ).toEqual([{ id: "B15000001", name: "陳子涵", grade: 1 }]);
  });
});
