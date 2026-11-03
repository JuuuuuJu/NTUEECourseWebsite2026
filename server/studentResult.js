// Builds the student /result payload: admitted courses plus own selections.

const getPhase = (now, start, end) => {
  if (start != null && now < start) return "not-open";
  if (end != null && now <= end) return "selecting";
  return "ended";
};

// `results` is not cleared between semesters, so only results created after
// this semester's selection started belong to the current round.
const isCurrentResult = (result, start) => {
  if (start == null || !result._id || !result._id.getTimestamp) return true;
  return result._id.getTimestamp().getTime() / 1000 >= start;
};

const buildStudentResult = ({ now, start, end, isMaintainer, selections, results, courses }) => {
  const phase = getPhase(now, start, end);
  const coursesId2Name = {};
  courses.forEach((course) => {
    coursesId2Name[course.id] = course.name;
  });
  if (phase === "not-open" && !isMaintainer) {
    return { phase, start, end, admissions: [], selections: [], coursesId2Name };
  }
  const admissions = results
    .filter((result) => isCurrentResult(result, start))
    .map(({ _id, courseName, optionName }) => ({ _id, courseName, optionName }));
  return { phase, start, end, admissions, selections, coursesId2Name };
};

module.exports = { buildStudentResult, getPhase };
