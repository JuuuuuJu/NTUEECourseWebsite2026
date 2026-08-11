const mongoose = require("mongoose");
// const courses = require("../data/courses.json");
// const { conn, conn_atlas } = require("./connection");
require("dotenv").config();

const { MONGO_HOST, MONGO_DBNAME, MONGO_USERNAME, MONGO_PASSWORD, MONGO_PORT } = process.env;
const conn = mongoose.createConnection(
  `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DBNAME}?authSource=admin`,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

// ========================================

const courseSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    immutable: true,
  },
  name: {
    type: String,
    required: true,
    immutable: false,
  },
  type: {
    type: String,
    required: true,
    immutable: false,
  },
  description: {
    type: String,
    immutable: false,
  },
  number: {
    type: Number,
    required: true,
    immutable: false,
  },
  students: {
    type: [String],
    required: true,
    immutable: false,
  },
  options: [
    {
      name: String,
      limit: Number,
      priority_type: String,
      priority_value: {},
    },
  ],
});

const Course = conn.model("Course", courseSchema);

// ========================================

// const courseIDs = courses.map((course) => course.id);
// const selections = {};
// courseIDs.forEach((courseID) => {
//   selections[courseID] = [String];
// });

const userSchema = new mongoose.Schema({
  userID: {
    type: String,
    required: true,
    immutable: true,
  },
  grade: {
    type: Number,
    required: true,
    immutable: false,
  },
  password: {
    type: String,
    required: true,
    immutable: false,
  },
  name: {
    type: String,
    required: true,
    immutable: false,
  },
  authority: {
    type: Number,
    required: true,
    immutable: false,
  },
  // selections,
});

const Student = conn.model("Student", userSchema);

// ========================================

const selectionSchema = new mongoose.Schema({
  courseID: {
    type: String,
    required: true,
    immutable: true,
  },
  userID: {
    type: String,
    required: true,
    immutable: true,
  },
  name: {
    type: String,
    required: true,
    immutable: true,
  },
  ranking: {
    type: Number,
    required: true,
    immutable: true,
  },
});

const Selection = conn.model("Selection", selectionSchema);

// ========================================

const selectionCheckpointSchema = new mongoose.Schema(
  {
    courseID: {
      type: String,
      required: true,
      immutable: true,
    },
    userID: {
      type: String,
      required: true,
      immutable: true,
    },
    selections: {
      selected: {
        type: [String],
        required: true,
      },
      unselected: {
        type: [String],
        required: true,
      },
    },
  },
  { timestamps: true }
);

selectionCheckpointSchema.index({ userID: 1, courseID: 1 }, { unique: true });

const SelectionCheckpoint = conn.model(
  "SelectionCheckpoint",
  selectionCheckpointSchema
);

// ========================================

const digitalLabGroupSchema = new mongoose.Schema(
  {
    courseID: { type: String, required: true, immutable: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    leaderUserID: { type: String, required: true },
    memberUserIDs: {
      type: [String],
      required: true,
      validate: {
        validator: (members) => members.length > 0 && members.length <= 3,
        message: "A Digital Lab group must contain one to three members.",
      },
    },
    status: {
      type: String,
      enum: ["forming", "registered", "selected", "rejected"],
      default: "forming",
      required: true,
    },
  },
  { timestamps: true }
);

digitalLabGroupSchema.index({ courseID: 1, code: 1 }, { unique: true });
// MongoDB unique multikey index: a student can occur in only one group per course.
digitalLabGroupSchema.index(
  { courseID: 1, memberUserIDs: 1 },
  { unique: true }
);

const DigitalLabGroup = conn.model("DigitalLabGroup", digitalLabGroupSchema);

// ========================================

// 只有數電實驗需要
const preselectSchema = new mongoose.Schema({
  userID: {
    type: String,
    required: true,
    immutable: true,
  },
});

const Preselect = conn.model("Preselect", preselectSchema);

// ========================================

const openTimeSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    immutable: true,
  },
  time: {
    type: Number,
    required: true,
    immutable: false,
  },
});

const OpenTime = conn.model("OpenTime", openTimeSchema);

// ========================================

const resultSchema = new mongoose.Schema({
  studentID: {
    type: String,
    required: true,
    immutable: true,
  },
  courseName: {
    type: String,
    required: true,
    immutable: true,
  },
  optionName: {
    type: String,
    required: true,
    immutable: true,
  },
});

const Result = conn.model("Result", resultSchema);

// ========================================

const emailTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, immutable: true },
    category: { type: String, required: true, immutable: true },
    purpose: { type: String, required: true, immutable: true },
    subject: { type: String, required: true },
    senderName: { type: String, required: true },
    body: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true }
);

const EmailTemplate = conn.model("EmailTemplate", emailTemplateSchema);

// ========================================


const emailJobRecipientSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    userID: String,
    name: String,
    grade: Number,
    email: String,
    actualRecipient: String,
    values: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["queued", "sending", "sent", "failed", "skipped", "canceled"], required: true, default: "queued" },
    sentAt: Date,
    attempts: { type: Number, required: true, default: 0 },
    reportPassword: String,
    error: String,
  },
  { _id: true }
);

const emailJobSchema = new mongoose.Schema(
  {
    templateKey: { type: String, required: true },
    subject: { type: String, required: true },
    senderName: { type: String, required: true },
    templateBody: { type: String, required: true },
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    recipientSource: {
      mode: { type: String, enum: ["csv", "database"], required: true },
      grades: [Number],
      reminderCourseIDs: [String],
      summary: { type: String, required: true },
      override: String,
    },
    generatePasswords: { type: Boolean, default: false },
    updatePasswords: { type: Boolean, default: false },
    smtpUserid: { type: String, required: true },
    smtpCredential: mongoose.Schema.Types.Mixed,
    createdBy: { type: String, required: true },
    status: { type: String, enum: ["queued", "sending", "rate-limited", "completed", "failed", "canceled"], default: "queued", required: true },
    nextRunAt: Date,
    completedAt: Date,
    acknowledgedAt: Date,
    acknowledgedBy: String,
    recipients: { type: [emailJobRecipientSchema], default: [] },
  },
  { timestamps: true }
);
emailJobSchema.index({ acknowledgedAt: 1, createdAt: -1 });
emailJobSchema.index({ status: 1, nextRunAt: 1 });
emailJobSchema.index({ "recipients.sentAt": 1 });
const EmailJob = conn.model("EmailJob", emailJobSchema);

// ========================================
module.exports = {
  Course,
  Student,
  Selection,
  SelectionCheckpoint,
  DigitalLabGroup,
  Preselect,
  OpenTime,
  Result,
  EmailTemplate,
  EmailJob,
  conn,
  courseSchema,
  userSchema,
  selectionSchema,
  selectionCheckpointSchema,
  digitalLabGroupSchema,
  preselectSchema,
  openTimeSchema,
  resultSchema,
  emailTemplateSchema,
  emailJobSchema,
};
