const model = require("../database/mongo/model");
const { createTransport, sendRenderedBccEmail, sendRenderedEmail } = require("./mailer");
const { generatePassword, updateStudentPassword } = require("./passwords");
const { renderTemplate } = require("./renderTemplate");
const { decryptCredential } = require("./credentials");
const { usesBccDelivery } = require("./templates");

const HOURLY_LIMIT = Math.min(Number(process.env.EMAIL_HOURLY_LIMIT) || 200, 200);
const BATCH_SIZE = Math.min(Number(process.env.EMAIL_BATCH_SIZE) || 20, HOURLY_LIMIT);
const POLL_MS = Number(process.env.EMAIL_WORKER_POLL_MS) || 15000;
let timer;
let running = false;
const cancellationRequests = new Set();

const safeErrorSummary = (error) => {
  const metadata = [error && error.code, error && error.command]
    .filter(Boolean)
    .join("/");
  const message = String((error && error.message) || "Unknown error")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240);
  return `${metadata ? `[${metadata}] ` : ""}${message}`;
};

const requestCancellation = async (job) => {
  cancellationRequests.add(String(job._id));
  job.recipients.forEach((recipient) => {
    if (recipient.status === "queued") recipient.status = "canceled";
  });
  job.status = "canceled";
  job.completedAt = new Date();
  job.nextRunAt = undefined;
  await job.save();
  return job;
};

const publicRecipient = (recipient) => ({
  id: recipient._id,
  userID: recipient.userID,
  name: recipient.name,
  grade: recipient.grade,
  email: recipient.email,
  actualRecipient: recipient.actualRecipient,
  status: recipient.status,
  sentAt: recipient.sentAt,
  attempts: recipient.attempts,
  error: recipient.error,
});

const publicJob = (job, includeRecipients = true) => {
  const recipients = job.recipients || [];
  const count = (status) => recipients.filter((item) => item.status === status).length;
  const result = {
    id: job._id,
    templateKey: job.templateKey,
    subject: job.subject,
    recipientSource: job.recipientSource,
    status: job.status,
    total: recipients.length,
    sent: count("sent"),
    failed: count("failed"),
    skipped: count("skipped"),
    canceled: count("canceled"),
    remaining: count("queued") + count("sending"),
    hourlyLimit: HOURLY_LIMIT,
    nextRunAt: job.nextRunAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    acknowledgedAt: job.acknowledgedAt,
    hasPasswordReport: Boolean(job.generatePasswords),
  };
  if (includeRecipients) result.recipients = recipients.map(publicRecipient);
  return result;
};

const sentInWindow = async (now) => {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const rows = await model.EmailJob.aggregate([
    { $unwind: "$recipients" },
    { $match: { "recipients.status": "sent", "recipients.sentAt": { $gt: since } } },
    { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: "$recipients.sentAt" } } },
  ]);
  return rows[0] || { count: 0, oldest: null };
};

const finishIfDone = async (job) => {
  const remaining = job.recipients.some((item) => ["queued", "sending"].includes(item.status));
  if (remaining) return false;
  job.status = job.recipients.some((item) => item.status === "sent") ? "completed" : "failed";
  job.completedAt = new Date();
  job.nextRunAt = undefined;
  await job.save();
  return true;
};

const processJobs = async () => {
  if (running) return;
  running = true;
  let transport;
  try {
    const now = new Date();
    const jobs = await model.EmailJob.find({
      status: { $in: ["queued", "sending", "rate-limited"] },
      $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }],
    }).sort({ createdAt: 1 });
    if (!jobs.length) return;
    const usage = await sentInWindow(now);
    let available = Math.max(0, HOURLY_LIMIT - usage.count);
    if (!available) {
      const nextRunAt = new Date(new Date(usage.oldest).getTime() + 60 * 60 * 1000 + 1000);
      await model.EmailJob.updateMany(
        { _id: { $in: jobs.map((job) => job._id) } },
        { $set: { status: "rate-limited", nextRunAt } }
      );
      return;
    }
    for (const job of jobs) {
      if (!available) break;
      const smtpUserid = job.smtpUserid || process.env.SMTP_USERID || process.env.SMTP_USER;
      let smtpPassword;
      try {
        smtpPassword = job.smtpCredential
          ? decryptCredential(job.smtpCredential)
          : process.env.SMTP_PASSWORD;
        if (!smtpUserid || !smtpPassword) {
          throw new Error("SMTP credentials unavailable.");
        }
        transport = createTransport({ userid: smtpUserid, password: smtpPassword });
      } catch (error) {
        job.recipients.forEach((recipient) => {
          if (["queued", "sending"].includes(recipient.status)) {
            recipient.status = "failed";
            recipient.error = "SMTP credentials are unavailable for this job.";
          }
        });
        job.status = "failed";
        job.completedAt = new Date();
        job.nextRunAt = undefined;
        await job.save();
        continue;
      }
      smtpPassword = undefined;
      job.status = "sending";
      job.nextRunAt = undefined;
      await job.save();
      if (usesBccDelivery(job.templateKey)) {
        const queued = job.recipients.filter((item) => item.status === "queued");
        if (queued.length) {
          let sharedContent;
          try {
            for (const recipient of queued) {
              const rendered = renderTemplate(
                { subject: job.subject, body: job.templateBody },
                { ...job.variables, ...recipient.values }
              );
              if (!sharedContent) sharedContent = rendered;
              else if (
                rendered.subject !== sharedContent.subject ||
                rendered.html !== sharedContent.html
              ) {
                throw new Error("BCC content differs between recipients.");
              }
              recipient.status = "sending";
              recipient.attempts += 1;
            }
            await job.save();
            await sendRenderedBccEmail({
              transport,
              smtpUserid: job.smtpUserid,
              senderName: job.senderName,
              bcc: [...new Set(queued.map((recipient) => recipient.actualRecipient))],
              rendered: sharedContent,
            });
            const sentAt = new Date();
            queued.forEach((recipient) => {
              recipient.status = "sent";
              recipient.sentAt = sentAt;
              recipient.error = undefined;
            });
            available -= 1;
          } catch (error) {
            queued.forEach((recipient) => {
              recipient.status = "failed";
              recipient.error = error.message === "BCC content differs between recipients."
                ? "BCC delivery requires identical subject and content for every recipient."
                : `Email delivery failed: ${safeErrorSummary(error)}`;
            });
          }
          await job.save();
        }
        await finishIfDone(job);
        transport.close();
        transport = undefined;
        continue;
      }
      const queued = job.recipients.filter((item) => item.status === "queued").slice(0, Math.min(BATCH_SIZE, available));
      for (const recipient of queued) {
        if (cancellationRequests.has(String(job._id))) break;
        recipient.status = "sending";
        recipient.attempts += 1;
        await job.save();
        let rawPassword;
        try {
          if (job.generatePasswords) {
            rawPassword = generatePassword();
            recipient.reportPassword = rawPassword;
            await job.save();
          }
          const values = { ...job.variables, ...recipient.values };
          if (rawPassword !== undefined) values.password = rawPassword;
          const rendered = renderTemplate(
            { subject: job.subject, body: job.templateBody },
            values
          );
          await sendRenderedEmail({
            transport,
            smtpUserid: job.smtpUserid,
            senderName: job.senderName,
            to: recipient.actualRecipient,
            rendered,
          });
          if (recipient.userID && rawPassword && job.updatePasswords) {
            const student = await model.Student.findOne({ userID: recipient.userID });
            if (!student) throw new Error("Email sent, but matching student was not found for password update.");
            await updateStudentPassword(student._id, rawPassword);
          }
          recipient.status = "sent";
          recipient.sentAt = new Date();
          recipient.error = undefined;
          available -= 1;
        } catch (error) {
          recipient.status = "failed";
          recipient.error = `Email delivery or post-send password update failed: ${safeErrorSummary(error)}`;
        }
        rawPassword = undefined;
        if (cancellationRequests.has(String(job._id))) {
          job.recipients.forEach((item) => {
            if (item.status === "queued") item.status = "canceled";
          });
          job.status = "canceled";
          job.completedAt = job.completedAt || new Date();
          job.nextRunAt = undefined;
        }
        await job.save();
      }
      if (cancellationRequests.has(String(job._id))) {
        job.recipients.forEach((item) => {
          if (item.status === "queued") item.status = "canceled";
        });
        job.status = "canceled";
        job.completedAt = job.completedAt || new Date();
        job.nextRunAt = undefined;
        await job.save();
        cancellationRequests.delete(String(job._id));
      } else if (!(await finishIfDone(job)) && !available) {
        const latest = await sentInWindow(new Date());
        job.status = "rate-limited";
        job.nextRunAt = new Date(new Date(latest.oldest).getTime() + 60 * 60 * 1000 + 1000);
        await job.save();
      }
      transport.close();
      transport = undefined;
    }
  } finally {
    if (transport) transport.close();
    running = false;
  }
};

const startEmailWorker = async () => {
  await model.EmailJob.updateMany(
    { "recipients.status": "sending" },
    { $set: { "recipients.$[item].status": "queued", status: "queued" } },
    { arrayFilters: [{ "item.status": "sending" }] }
  );
  await processJobs();
  timer = setInterval(() => processJobs().catch((error) => console.error("Email worker error:", error.message)), POLL_MS);
};

const stopEmailWorker = () => {
  if (timer) clearInterval(timer);
};

module.exports = { HOURLY_LIMIT, processJobs, publicJob, requestCancellation, startEmailWorker, stopEmailWorker };
