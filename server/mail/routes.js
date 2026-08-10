const express = require("express");
const asyncHandler = require("express-async-handler");

const constants = require("../constants");
const model = require("../database/mongo/model");
const { createTransport, sendRenderedEmail } = require("./mailer");
const { generatePassword, updateStudentPassword } = require("./passwords");
const { extractVariables, renderTemplate } = require("./renderTemplate");
const {
  BUILT_IN_VARIABLES,
  DEFAULT_TEMPLATES,
  isTemplateKey,
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

router.use(["/email-templates", "/email-send"], adminRequired);

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

const buildRows = async (selectedUserIDs, csvRows) => {
  const rows = [];
  const selected = [
    ...new Set(selectedUserIDs.map((id) => String(id).toUpperCase())),
  ];
  const students = await model.Student.find({ userID: { $in: selected } });
  const byID = new Map(students.map((student) => [student.userID, student]));
  selected.forEach((userID) => {
    const student = byID.get(userID);
    rows.push(
      student
        ? { data: { userID: student.userID, name: student.name } }
        : { data: { userID }, skip: "Student not found." }
    );
  });
  csvRows.forEach((row) => rows.push({ data: { ...row } }));
  return rows;
};

router.post(
  "/email-send",
  json,
  asyncHandler(async (req, res) => {
    const {
      templateKey,
      selectedUserIDs = [],
      csvRows = [],
      smtp = {},
      dryRun = true,
      generatePasswords = false,
      updatePasswords = false,
      variables = {},
    } = req.body;
    if (
      !isTemplateKey(templateKey) ||
      !Array.isArray(selectedUserIDs) ||
      !selectedUserIDs.every((id) => typeof id === "string") ||
      !Array.isArray(csvRows) ||
      !csvRows.every(
        (row) => row && typeof row === "object" && !Array.isArray(row)
      ) ||
      typeof dryRun !== "boolean" ||
      typeof generatePasswords !== "boolean" ||
      typeof updatePasswords !== "boolean" ||
      !variables ||
      typeof variables !== "object" ||
      Array.isArray(variables)
    ) {
      return res.status(400).send({ error: "Invalid send request." });
    }
    if (!selectedUserIDs.length && !csvRows.length) {
      return res.status(400).send({ error: "No recipients selected." });
    }
    if (generatePasswords && !templateKey.endsWith(".account")) {
      return res.status(400).send({
        error: "Passwords can only be generated for account templates.",
      });
    }
    if (
      !dryRun &&
      (typeof smtp.userid !== "string" || typeof smtp.password !== "string")
    ) {
      return res.status(400).send({ error: "SMTP credentials are required." });
    }

    await ensureDefaultTemplates();
    const template = await model.EmailTemplate.findOne({ key: templateKey });
    const defaults = await getDefaultTemplateValues();
    const rows = await buildRows(selectedUserIDs, csvRows);
    const statuses = [];
    const prepared = [];

    for (let index = 0; index < rows.length; index += 1) {
      const { data: row, skip } = rows[index];
      if (skip) {
        statuses.push({
          index,
          identity: row.userID,
          status: "skipped",
          message: skip,
        });
        continue;
      }
      const resolved = await recipientValues(row, defaults, variables);
      if (!validateRecipientIdentity(resolved.values)) {
        statuses.push({
          index,
          identity: "",
          status: "skipped",
          message: "Missing or invalid userID/account/email.",
        });
        continue;
      }
      if (
        (generatePasswords || (updatePasswords && row.password)) &&
        !resolved.student
      ) {
        statuses.push({
          index,
          identity: resolved.values.userID || resolved.values.email,
          status: "failed",
          message:
            "A matching student record is required to update the password.",
        });
        continue;
      }
      let rawPassword = resolved.values.password;
      if (generatePasswords) rawPassword = generatePassword();
      if (rawPassword !== undefined) resolved.values.password = rawPassword;
      try {
        const rendered = renderTemplate(template, resolved.values);
        prepared.push({ index, row, ...resolved, rawPassword, rendered });
      } catch (error) {
        if (
          error.code === "MISSING_VARIABLES" ||
          error.code === "INVALID_PLACEHOLDERS"
        ) {
          statuses.push({
            index,
            identity: resolved.values.userID || resolved.values.email,
            status: "failed",
            message: error.message,
          });
          continue;
        }
        throw error;
      }
    }

    const validationFailures = statuses.filter(
      (status) => status.status === "failed"
    );
    if (validationFailures.length) {
      return res.status(400).send({
        error: "Template variables are missing for one or more recipients.",
        total: rows.length,
        sent: 0,
        failed: validationFailures.length,
        skipped: statuses.filter((status) => status.status === "skipped")
          .length,
        statuses,
      });
    }

    if (dryRun) {
      prepared.forEach((item) =>
        statuses.push({
          index: item.index,
          identity: item.values.userID || item.values.email,
          to: item.values.email,
          status: "dry-run",
          message:
            "Rendered successfully; no email sent and no password updated.",
        })
      );
    } else {
      const transport = createTransport(smtp);
      try {
        for (const item of prepared) {
          try {
            await sendRenderedEmail({
              transport,
              smtpUserid: smtp.userid,
              senderName: template.senderName,
              to: item.values.email,
              rendered: item.rendered,
            });
            if (
              item.student &&
              item.rawPassword &&
              (generatePasswords || updatePasswords)
            ) {
              await updateStudentPassword(item.student._id, item.rawPassword);
            }
            statuses.push({
              index: item.index,
              identity: item.values.userID || item.values.email,
              to: item.values.email,
              status: "sent",
            });
          } catch (error) {
            statuses.push({
              index: item.index,
              identity: item.values.userID || item.values.email,
              to: item.values.email,
              status: "failed",
              message: "Email delivery failed.",
            });
          }
        }
      } finally {
        transport.close();
      }
    }

    statuses.sort((a, b) => a.index - b.index);
    return res.send({
      total: rows.length,
      sent: statuses.filter((status) => status.status === "sent").length,
      failed: statuses.filter((status) => status.status === "failed").length,
      skipped: statuses.filter((status) => status.status === "skipped").length,
      dryRun: statuses.filter((status) => status.status === "dry-run").length,
      statuses,
      variables: extractVariables(template.subject, template.body),
    });
  })
);

module.exports = router;
