const requestedStudentFields = (query) => {
  const fields = Object.keys(query || {});
  if (fields.includes("password")) {
    const error = new Error("Student passwords are not available.");
    error.status = 403;
    throw error;
  }
  return fields;
};

const serializeStudents = (students, fields) =>
  students.map((student) => {
    const result = { id: student.userID };
    fields.forEach((field) => {
      result[field] = student[field];
    });
    return result;
  });

module.exports = { requestedStudentFields, serializeStudents };
