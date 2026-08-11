const express = require("express");
const asyncHandler = require("express-async-handler");

const constants = require("../constants");
const model = require("../database/mongo/model");
const { extractVariables, renderTemplate } = require("./renderTemplate");
const { encryptCredential } = require("./credentials");
const {
  BUILT_IN_VARIABLES,
  DEFAULT_TEMPLATES,
  isTemplateKey,
  usesBccDelivery,
} = require("./templates");

const router = express.Router();
const json = express.json({ limit: "2mb", strict: true });
const identityPattern = /^[A-Za-z0-9._-]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminRequired = (req, res, next) => {
  if (
    !req.session.userID ||
    req.session.authority < constants.AUTHORITY_ADMIN
  ) {
    res.sendStatus(403);
    return;
  }
  next();
};

router.use(["/email-templates", "/email-send", "/email-recipients", "/email-jobs"], adminRequired);

const ensureDefaultTemplates = async () => {
  await Promise.all(
    DEFAULT_TEMPLATES.map((template) =>
      model.EmailTemplate.updateOne(
        { key: template.key },
        { $setOnInsert: template },
        { upsert: true, runValidators: true }
      )
    )
  );
};

const getDefaultTemplateValues = async () => {
  const [start, end] = await Promise.all([
    model.OpenTime.findOne({ type: constants.START_TIME_KEY }),
    model.OpenTime.findOne({ type: constants.END_TIME_KEY }),
  ]);
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const openTimeText =
    start && end
      ? `${formatter.format(start.time * 1000)} 至 ${formatter.format(
          end.time * 1000
        )}`
      : "請依網站公告時間為準";
  return {
    websiteUrl: process.env.WEBSITE_URL || "https://course.ntuee.org/",
    openTimeText,
    contactEmail: process.env.CONTACT_EMAIL || "ntueesaad2@gmail.com",
    importantLinks: "",
  };
};

const publicTemplate = (template) => ({
  key: template.key,
  category: template.category,
  purpose: template.purpose,
  subject: template.subject,
  senderName: template.senderName,
  body: template.body,
  updatedBy: template.updatedBy,
  updatedAt: template.updatedAt,
});

router.get(
  "/email-templates",
  asyncHandler(async (_req, res) => {
    await ensureDefaultTemplates();
    const [templates, defaultValues] = await Promise.all([
      model.EmailTemplate.find({}).sort({ key: 1 }),
      getDefaultTemplateValues(),
    ]);
    res.send({
      templates: templates.map(publicTemplate),
      builtInVariables: BUILT_IN_VARIABLES,
      defaultValues,
    });
  })
);

router
  .route("/email-templates/:key")
  .get(
    asyncHandler(async (req, res) => {
      if (!isTemplateKey(req.params.key)) return res.sendStatus(404);
      await ensureDefaultTemplates();
      const template = await model.EmailTemplate.findOne({
        key: req.params.key,
      });
      return res.send(publicTemplate(template));
    })
  )
  .put(
    json,
    asyncHandler(async (req, res) => {
      const { key } = req.params;
      const { subject, senderName, body } = req.body;
      if (
        !isTemplateKey(key) ||
        typeof subject !== "string" ||
        typeof senderName !== "string" ||
        typeof body !== "string" ||
        !subject.trim() ||
        !senderName.trim() ||
        !body.trim() ||
        /[\r\n]/.test(senderName) ||
        /[\r\n]/.test(subject)
      ) {
        return res.status(400).send({ error: "Invalid template content." });
      }
      const [category, purpose] = key.split(".");
      const template = await model.EmailTemplate.findOneAndUpdate(
        { key },
        {
          $set: {
            category,
            purpose,
            subject,
            senderName,
            body,
            updatedBy: req.session.userID,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );
      return res.send(publicTemplate(template));
    })
  );

const resolveStudent = async (row) => {
  const identity = row.userID || row.account;
  if (!identity || typeof identity !== "string") return null;
  return model.Student.findOne({ userID: identity.toUpperCase() });
};

const recipientValues = async (row, defaults, suppliedVariables = {}) => {
  const student = await resolveStudent(row);
  const userID = String(
    row.userID || row.account || (student && student.userID) || ""
  ).toUpperCase();
  const account = String(row.account || userID);
  const email = String(row.email || (account ? `${account}@ntu.edu.tw` : ""));
  const values = {
    ...defaults,
    ...suppliedVariables,
    ...(student
      ? { name: student.name, userID: student.userID, account: student.userID }
      : {}),
    ...row,
  };
  if (userID) values.userID = userID;
  if (account) values.account = account;
  if (email) values.email = email;
  const name = row.name || (student && student.name);
  if (name) values.name = name;
  return { student, values };
};

const validateRecipientIdentity = (values) =>
  (values.email && emailPattern.test(values.email)) ||
  (values.account && identityPattern.test(values.account)) ||
  (values.userID && identityPattern.test(values.userID));

const getPreviewTemplate = async (key, body) => {
  const stored = await model.EmailTemplate.findOne({ key });
  if (!stored) return null;
  if (!body.subject && !body.senderName && !body.body) return stored;
  return {
    ...publicTemplate(stored),
    subject: body.subject,
    senderName: body.senderName,
    body: body.body,
  };
};

router.post(
  "/email-templates/:key/preview",
  json,
  asyncHandler(async (req, res) => {
    if (!isTemplateKey(req.params.key)) return res.sendStatus(404);
    await ensureDefaultTemplates();
    const template = await getPreviewTemplate(req.params.key, req.body);
    if (
      !template ||
      typeof template.subject !== "string" ||
      typeof template.body !== "string" ||
      typeof template.senderName !== "string"
    ) {
      return res.status(400).send({ error: "Invalid preview template." });
    }
    const defaults = await getDefaultTemplateValues();
    const { values } = await recipientValues(
      req.body.recipient || {},
      defaults,
      req.body.variables || {}
    );
    try {
      const rendered = renderTemplate(template, values);
      return res.send({
        ...rendered,
        senderName: template.senderName,
        to: values.email,
      });
    } catch (error) {
      if (
        error.code === "MISSING_VARIABLES" ||
        error.code === "INVALID_PLACEHOLDERS"
      ) {
        return res.status(400).send({
          error: error.message,
          missing: error.variables || [],
          invalid: error.placeholders || [],
        });
      }
      throw error;
    }
  })
);

const normalizeGrades = (grades) =>
  [...new Set((grades || []).map(Number))].filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 7).sort();

const normalizeCourseIDs = (courseIDs) =>
  [...new Set((courseIDs || []).filter((id) => typeof id === "string").map((id) => id.trim()).filter(Boolean))].sort();

const validateReminderCourses = async (courseIDs) => {
  const selectedCourseIDs = normalizeCourseIDs(courseIDs);
  if (!selectedCourseIDs.length) return { selectedCourseIDs, valid: false };
  const existing = await model.Course.find({ id: { $in: selectedCourseIDs } }, "id");
  return {
    selectedCourseIDs,
    valid: existing.length === selectedCourseIDs.length,
  };
};

const buildRows = async ({ sourceMode, grades, csvRows, reminderCourseIDs = [] }) => {
  if (sourceMode === "database") {
    const selectedGrades = normalizeGrades(grades);
    if (!selectedGrades.length) return [];
    const studentQuery = { grade: { $in: selectedGrades } };
    if (reminderCourseIDs.length) {
      const selections = await model.Selection.find(
        { courseID: { $in: reminderCourseIDs } },
        "userID"
      );
      const savedUserIDs = [...new Set(selections.map((selection) => selection.userID))];
      if (savedUserIDs.length) studentQuery.userID = { $nin: savedUserIDs };
    }
    const students = await model.Student.find(studentQuery).sort({ userID: 1 });
    return students.map((student) => ({
      userID: student.userID,
      name: student.name,
      grade: student.grade,
      email: `${student.userID}@ntu.edu.tw`,
    }));
  }
  return csvRows.map((row) => ({ ...row }));
};

router.get(
  "/email-recipients/courses",
  asyncHandler(async (_req, res) => {
    const courses = await model.Course.find({}, "id name").sort({ id: 1 });
    res.send(courses.map((course) => ({ id: course.id, name: course.name })));
  })
);

router.post(
  "/email-recipients/preview",
  json,
  asyncHandler(async (req, res) => {
    const sourceMode = req.body.sourceMode || "csv";
    if (!["csv", "database"].includes(sourceMode)) return res.status(400).send({ error: "Invalid recipient source." });
    const isReminder = req.body.templateKey && req.body.templateKey.endsWith(".reminder");
    if (isReminder && sourceMode !== "database") {
      return res.status(400).send({ error: "未選通知只能使用學生資料庫收件人。" });
    }
    let reminderCourseIDs = [];
    if (isReminder) {
      const validation = await validateReminderCourses(req.body.reminderCourseIDs);
      if (!validation.valid) return res.status(400).send({ error: "未選通知須選擇至少一門現存課程。" });
      reminderCourseIDs = validation.selectedCourseIDs;
    }
    const rows = await buildRows({ sourceMode, grades: req.body.grades, csvRows: Array.isArray(req.body.csvRows) ? req.body.csvRows : [], reminderCourseIDs });
    const defaults = await getDefaultTemplateValues();
    const recipients = [];
    for (const row of rows) {
      const { values } = await recipientValues(row, defaults);
      recipients.push({
        userID: values.userID || "",
        name: values.name || "",
        grade: Number(values.grade) || null,
        email: values.email || "",
      });
    }
    res.send({ count: recipients.length, recipients: recipients.slice(0, 500) });
  })
);

const prepareRecipients = async (rows, defaults, variables, override) => {
  const recipients = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const { student, values } = await recipientValues(row, defaults, variables);
    const email = values.email && emailPattern.test(values.email) ? values.email : "";
    const actualRecipient = override || email;
    const base = {
      index,
      userID: values.userID || "",
      name: values.name || "",
      grade: Number(values.grade || (student && student.grade)) || undefined,
      email,
      actualRecipient,
      values,
      attempts: 0,
    };
    if (!actualRecipient || !emailPattern.test(actualRecipient)) {
      recipients.push({ ...base, status: "skipped", error: "Missing or invalid email." });
    } else {
      recipients.push({ ...base, status: "queued" });
    }
  }
  return recipients;
};

router.post(
  "/email-send",
  json,
  asyncHandler(async (req, res) => {
    const {
      templateKey,
      sourceMode = "csv",
      grades = [],
      csvRows = [],
      dryRun = true,
      generatePasswords = false,
      updatePasswords = false,
      variables = {},
      recipientOverride = "",
      confirmedLargeSend = false,
      smtp = {},
      reminderCourseIDs = [],
    } = req.body;
    if (
      !isTemplateKey(templateKey) ||
      !["csv", "database"].includes(sourceMode) ||
      !Array.isArray(grades) ||
      !Array.isArray(csvRows) ||
      !Array.isArray(reminderCourseIDs) ||
      typeof dryRun !== "boolean" ||
      typeof generatePasswords !== "boolean" ||
      typeof updatePasswords !== "boolean" ||
      typeof recipientOverride !== "string" ||
      !smtp || typeof smtp !== "object" || Array.isArray(smtp)
    ) return res.status(400).send({ error: "Invalid send request." });
    const selectedGrades = normalizeGrades(grades);
    const isReminder = templateKey.endsWith(".reminder");
    if (isReminder && sourceMode !== "database") {
      return res.status(400).send({ error: "未選通知只能使用學生資料庫收件人。" });
    }
    let selectedReminderCourseIDs = [];
    if (isReminder) {
      const validation = await validateReminderCourses(reminderCourseIDs);
      if (!validation.valid) return res.status(400).send({ error: "未選通知須選擇至少一門現存課程。" });
      selectedReminderCourseIDs = validation.selectedCourseIDs;
    }
    if (sourceMode === "database" && selectedGrades.length !== grades.length) {
      return res.status(400).send({ error: "Grades must be selected exactly from 1 through 7." });
    }
    if (generatePasswords && !templateKey.endsWith(".account")) {
      return res.status(400).send({ error: "Passwords can only be generated for account templates." });
    }
    if (updatePasswords && !generatePasswords) {
      return res.status(400).send({ error: "Password updates require generated passwords." });
    }
    const override = recipientOverride.trim();
    if (override && !emailPattern.test(override)) return res.status(400).send({ error: "Invalid recipient override." });

    await ensureDefaultTemplates();
    const template = await model.EmailTemplate.findOne({ key: templateKey });
    const defaults = await getDefaultTemplateValues();
    const rows = await buildRows({ sourceMode, grades: selectedGrades, csvRows, reminderCourseIDs: selectedReminderCourseIDs });
    if (!rows.length) return res.status(400).send({ error: "No recipients selected." });
    if (!dryRun && rows.length > 50 && !override && confirmedLargeSend !== true) {
      return res.status(409).send({ error: "Large send confirmation required.", requiresConfirmation: true, count: rows.length });
    }
    const recipients = await prepareRecipients(rows, defaults, variables, override);
    const statuses = [];
    let validationFailed = false;
    let sharedBccContent;
    for (const recipient of recipients) {
      if (recipient.status === "skipped") {
        statuses.push({ index: recipient.index, identity: recipient.userID, to: recipient.actualRecipient, status: "skipped", message: recipient.error });
        continue;
      }
      try {
        const previewValues = { ...recipient.values };
        if (generatePasswords) previewValues.password = "dry-run-generated-password";
        const rendered = renderTemplate(template, previewValues);
        if (usesBccDelivery(templateKey)) {
          if (!sharedBccContent) sharedBccContent = rendered;
          else if (
            rendered.subject !== sharedBccContent.subject ||
            rendered.html !== sharedBccContent.html
          ) {
            const error = new Error("時程通知與未選通知使用 BCC 寄送，所有收件人的信件主旨與內容必須完全相同。");
            error.code = "BCC_CONTENT_MISMATCH";
            throw error;
          }
        }
        statuses.push({ index: recipient.index, identity: recipient.userID || recipient.email, to: recipient.actualRecipient, status: "dry-run", message: "Rendered successfully; no email sent and no password updated." });
      } catch (error) {
        validationFailed = true;
        statuses.push({ index: recipient.index, identity: recipient.userID || recipient.email, to: recipient.actualRecipient, status: "failed", message: error.message });
        recipient.status = "failed";
        recipient.error = error.message;
      }
    }
    if (dryRun || validationFailed) {
      const validationMessages = [...new Set(
        statuses
          .filter((item) => item.status === "failed")
          .map((item) => item.message)
      )];
      return res.status(validationFailed ? 400 : 200).send({
        error: validationFailed
          ? `寄送前驗證失敗：${validationMessages.join("；")}`
          : undefined,
        total: recipients.length,
        sent: 0,
        failed: statuses.filter((item) => item.status === "failed").length,
        skipped: statuses.filter((item) => item.status === "skipped").length,
        dryRun: statuses.filter((item) => item.status === "dry-run").length,
        statuses,
        variables: extractVariables(template.subject, template.body),
      });
    }

    const suppliedSmtpUserid = typeof smtp.userid === "string" ? smtp.userid.trim() : "";
    const suppliedSmtpPassword = typeof smtp.password === "string" ? smtp.password : "";
    if (Boolean(suppliedSmtpUserid) !== Boolean(suppliedSmtpPassword)) {
      return res.status(400).send({ error: "SMTP userid and password are both required." });
    }
    const smtpUserid = suppliedSmtpUserid || process.env.SMTP_USERID || process.env.SMTP_USER;
    const smtpPassword = suppliedSmtpPassword || process.env.SMTP_PASSWORD;
    if (!smtpUserid || !smtpPassword) {
      return res.status(400).send({ error: "請輸入 SMTP userid 與 password。" });
    }
    let smtpCredential;
    if (suppliedSmtpPassword) {
      try {
        smtpCredential = encryptCredential(suppliedSmtpPassword);
      } catch (error) {
        return res.status(503).send({ error: "SMTP credential encryption is not configured." });
      }
    }
    const reminderSummary = selectedReminderCourseIDs.length
      ? `; no checkpoint in courses ${selectedReminderCourseIDs.join(", ")}`
      : "";
    const summary = sourceMode === "database"
      ? `Student database — grades ${selectedGrades.join(", ")}${reminderSummary}`
      : `CSV upload — ${rows.length} rows`;
    const job = await model.EmailJob.create({
      templateKey,
      subject: template.subject,
      senderName: template.senderName,
      templateBody: template.body,
      variables: { ...defaults, ...variables },
      recipientSource: { mode: sourceMode, grades: selectedGrades, reminderCourseIDs: selectedReminderCourseIDs, summary, override: override || undefined },
      generatePasswords,
      updatePasswords,
      smtpUserid,
      smtpCredential,
      createdBy: req.session.userID,
      status: "queued",
      nextRunAt: new Date(),
      recipients,
    });
    return res.status(202).send(require("./jobs").publicJob(job));
  })
);

router.get(
  "/email-jobs",
  asyncHandler(async (req, res) => {
    const query = req.query.history === "1" ? {} : { acknowledgedAt: null };
    const jobs = await model.EmailJob.find(query).sort({ createdAt: -1 }).limit(50);
    res.send(jobs.map((job) => require("./jobs").publicJob(job, false)));
  })
);

router.get(
  "/email-jobs/:id",
  asyncHandler(async (req, res) => {
    const job = await model.EmailJob.findById(req.params.id);
    if (!job) return res.sendStatus(404);
    return res.send(require("./jobs").publicJob(job));
  })
);

router.post(
  "/email-jobs/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const job = await model.EmailJob.findByIdAndUpdate(
      req.params.id,
      { acknowledgedAt: new Date(), acknowledgedBy: req.session.userID },
      { new: true }
    );
    if (!job) return res.sendStatus(404);
    return res.send(require("./jobs").publicJob(job, false));
  })
);

router.post(
  "/email-jobs/:id/cancel",
  asyncHandler(async (req, res) => {
    const job = await model.EmailJob.findById(req.params.id);
    if (!job) return res.sendStatus(404);
    if (!['queued', 'sending', 'rate-limited'].includes(job.status)) {
      return res.status(409).send({ error: "此寄信工作已經結束，無法停止。" });
    }
    await require("./jobs").requestCancellation(job);
    return res.send(require("./jobs").publicJob(job));
  })
);

router.post(
  "/email-jobs/:id/retry-failed",
  asyncHandler(async (req, res) => {
    const job = await model.EmailJob.findById(req.params.id);
    if (!job) return res.sendStatus(404);
    if (!["completed", "failed", "canceled"].includes(job.status)) {
      return res.status(409).send({ error: "寄信工作尚未結束，無法安全重寄失敗收件人。" });
    }
    const failed = job.recipients.filter((recipient) => recipient.status === "failed");
    if (!failed.length) return res.status(409).send({ error: "此工作沒有失敗收件人可重寄。" });
    failed.forEach((recipient) => {
      recipient.status = "queued";
      recipient.error = undefined;
      recipient.sentAt = undefined;
      recipient.reportPassword = undefined;
    });
    job.status = "queued";
    job.nextRunAt = new Date();
    job.completedAt = undefined;
    job.acknowledgedAt = undefined;
    job.acknowledgedBy = undefined;
    await job.save();
    return res.status(202).send(require("./jobs").publicJob(job));
  })
);

const csvCell = (value) => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
router.get(
  "/email-jobs/:id/report.csv",
  asyncHandler(async (req, res) => {
    const job = await model.EmailJob.findById(req.params.id);
    if (!job) return res.sendStatus(404);
    const header = ["userID", "name", "grade", "email", "actualRecipient", "status", "sentAt", "attempts", "error"];
    const lines = [header.map(csvCell).join(",")].concat(
      job.recipients.map((item) => header.map((key) => csvCell(item[key])).join(","))
    );
    res.type("text/csv").attachment(`email-job-${job._id}.csv`).send(lines.join("\n"));
  })
);


router.get(
  "/email-jobs/:id/passwords.csv",
  asyncHandler(async (req, res) => {
    const job = await model.EmailJob.findById(req.params.id);
    if (!job) return res.sendStatus(404);
    if (!job.generatePasswords) {
      return res.status(400).send({
        error: "This job did not generate passwords.",
      });
    }
    const header = [
      "userID",
      "name",
      "grade",
      "email",
      "password",
      "status",
      "sentAt",
      "error",
    ];
    const lines = [header.map(csvCell).join(",")].concat(
      job.recipients.map((item) =>
        [
          item.userID,
          item.name,
          item.grade,
          item.email,
          item.reportPassword,
          item.status,
          item.sentAt,
          item.error,
        ]
          .map(csvCell)
          .join(",")
      )
    );
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res
      .type("text/csv")
      .attachment(`email-job-${job._id}-passwords.csv`)
      .send(`\uFEFF${lines.join("\n")}`);
  })
);

module.exports = router;
