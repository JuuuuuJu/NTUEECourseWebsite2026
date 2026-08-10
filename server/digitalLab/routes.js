const crypto = require("crypto");
const express = require("express");
const asyncHandler = require("express-async-handler");

const model = require("../database/mongo/model");
const constants = require("../constants");

const router = express.Router();
const DIGITAL_LAB_NAME = "數電實驗";
const ACTIVE_STATUSES = ["forming", "registered"];

const loginRequired = (req, res, next) => {
  if (!req.session.userID) return res.sendStatus(403);
  return next();
};

const loadCourse = asyncHandler(async (req, res, next) => {
  const [start, end] = await Promise.all([
    model.OpenTime.findOne({ type: constants.START_TIME_KEY }),
    model.OpenTime.findOne({ type: constants.END_TIME_KEY }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  if (
    (!start || !end || now < start.time || now > end.time) &&
    req.session.authority < constants.AUTHORITY_MAINTAINER
  ) {
    return res.status(503).send({
      start: start ? start.time : null,
      end: end ? end.time : null,
    });
  }
  const course = await model.Course.findOne({
    id: req.params.courseID,
    type: "Ten-Select-Two",
    "options.name": DIGITAL_LAB_NAME,
  }).select("id students");
  if (!course) return res.sendStatus(404);
  if (course.students.length && !course.students.includes(req.session.userID)) {
    return res.sendStatus(403);
  }
  req.digitalLabCourse = course;
  return next();
});

const publicGroup = async (group) => {
  if (!group) return null;
  const students = await model.Student.find({
    userID: { $in: group.memberUserIDs },
  }).select("userID name grade -_id");
  const byID = Object.fromEntries(
    students.map((student) => [student.userID, student])
  );
  return {
    code: group.code,
    leaderUserID: group.leaderUserID,
    members: group.memberUserIDs.map((userID) => ({
      userID,
      name: byID[userID] ? byID[userID].name : "",
      grade: byID[userID] ? byID[userID].grade : null,
    })),
    status: group.status,
    isFull: group.memberUserIDs.length === 3,
    updatedAt: group.updatedAt,
  };
};

const generateCode = () => crypto.randomBytes(4).toString("hex").toUpperCase();

router.use("/digital-lab-group/:courseID", loginRequired, loadCourse);

router.get(
  "/digital-lab-group/:courseID",
  asyncHandler(async (req, res) => {
    const group = await model.DigitalLabGroup.findOne({
      courseID: req.params.courseID,
      memberUserIDs: req.session.userID,
    });
    res.status(200).send({ group: await publicGroup(group) });
  })
);

router.post(
  "/digital-lab-group/:courseID",
  asyncHandler(async (req, res) => {
    const existing = await model.DigitalLabGroup.findOne({
      courseID: req.params.courseID,
      memberUserIDs: req.session.userID,
    });
    if (existing)
      return res.status(409).send({ error: "你已經加入數電實驗小組。" });

    let group;
    for (let attempt = 0; attempt < 5 && !group; attempt += 1) {
      try {
        group = await model.DigitalLabGroup.create({
          courseID: req.params.courseID,
          code: generateCode(),
          leaderUserID: req.session.userID,
          memberUserIDs: [req.session.userID],
          status: "forming",
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
    if (!group)
      return res.status(503).send({ error: "無法產生組隊代碼，請重試。" });
    return res.status(201).send({ group: await publicGroup(group) });
  })
);

router.post(
  "/digital-lab-group/:courseID/join",
  express.json({ strict: true }),
  asyncHandler(async (req, res) => {
    const code =
      typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";
    if (!/^[A-F0-9]{8}$/.test(code)) {
      return res.status(400).send({ error: "組隊代碼格式不正確。" });
    }
    const student = await model.Student.findOne({ userID: req.session.userID });
    if (!student) return res.sendStatus(403);
    const existing = await model.DigitalLabGroup.findOne({
      courseID: req.params.courseID,
      memberUserIDs: req.session.userID,
    });
    if (existing)
      return res.status(409).send({ error: "你已經加入數電實驗小組。" });

    let group;
    try {
      group = await model.DigitalLabGroup.findOneAndUpdate(
        {
          courseID: req.params.courseID,
          code,
          status: { $in: ACTIVE_STATUSES },
          $expr: { $lt: [{ $size: "$memberUserIDs" }, 3] },
        },
        { $addToSet: { memberUserIDs: req.session.userID } },
        { new: true, runValidators: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).send({ error: "你已經加入數電實驗小組。" });
      }
      throw error;
    }
    if (!group)
      return res
        .status(409)
        .send({ error: "找不到小組，或小組已滿／已抽籤。" });
    if (group.memberUserIDs.length === 3) {
      group.status = "registered";
      await group.save();
    }
    return res.status(200).send({ group: await publicGroup(group) });
  })
);

router.delete(
  "/digital-lab-group/:courseID",
  asyncHandler(async (req, res) => {
    const group = await model.DigitalLabGroup.findOne({
      courseID: req.params.courseID,
      memberUserIDs: req.session.userID,
    });
    if (!group) return res.sendStatus(404);
    if (!ACTIVE_STATUSES.includes(group.status)) {
      return res.status(409).send({ error: "抽籤完成後無法退出小組。" });
    }
    group.memberUserIDs = group.memberUserIDs.filter(
      (userID) => userID !== req.session.userID
    );
    if (!group.memberUserIDs.length) {
      await group.deleteOne();
      return res.sendStatus(204);
    }
    if (group.leaderUserID === req.session.userID) {
      group.leaderUserID = group.memberUserIDs[0];
    }
    group.status = "forming";
    await group.save();
    return res.sendStatus(204);
  })
);

module.exports = router;
module.exports.DIGITAL_LAB_NAME = DIGITAL_LAB_NAME;
