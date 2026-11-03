const compareText = (left, right) => String(left).localeCompare(String(right));

const getOptionOrderByCourse = (courses) => {
  const optionOrderByCourse = new Map();
  courses.forEach((course) => {
    const optionOrder = new Map();
    course.options.forEach((option, index) => optionOrder.set(option.name, index));
    optionOrderByCourse.set(course.name, optionOrder);
  });
  return optionOrderByCourse;
};

const sortResultsForCsv = (results, courses) => {
  const optionOrderByCourse = getOptionOrderByCourse(courses);
  const getOptionOrder = (result) => {
    const optionOrder = optionOrderByCourse.get(result.courseName);
    if (!optionOrder || !optionOrder.has(result.optionName)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return optionOrder.get(result.optionName);
  };

  return [...results].sort(
    (left, right) =>
      compareText(left.courseName, right.courseName) ||
      getOptionOrder(left) - getOptionOrder(right) ||
      compareText(left.optionName, right.optionName) ||
      compareText(left.studentID, right.studentID)
  );
};

module.exports = { sortResultsForCsv };
