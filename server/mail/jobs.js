const model = require("../database/mongo/model");
const { createTransport, sendRenderedBccEmail, sendRenderedEmail } = require("./mailer");
const { generatePassword, updateStudentPassword } = require("./passwords");
const { renderTemplate } = require("./renderTemplate");
const { decryptCredential } = require("./credentials");
const { usesBccDelivery } = require("./templates");

const ACCOUNT_BATCH_SIZE = 10;
const ACCOUNT_BATCH_INTERVAL_MS = 10 * 1000;
const TEN_MINUTE_LIMIT = 40;
const TEN_MINUTE_WINDOW_MS = 10 * 60 * 1000;
const HOURLY_LIMIT = 250;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const POLL_MS = Number(process.env.EMAIL_WORKER_POLL_MS) || 1000;
let timer;
let running = false;
const cancellationRequests = new Set();
const usesAccountRateLimit = (key) => /\.account$/.test(key || "");

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
    hourlyLimit: usesAccountRateLimit(job.templateKey) ? HOURLY_LIMIT : null,
    tenMinuteLimit: usesAccountRateLimit(job.templateKey) ? TEN_MINUTE_LIMIT : null,
    batchSize: usesAccountRateLimit(job.templateKey) ? ACCOUNT_BATCH_SIZE : null,
    batchIntervalSeconds: usesAccountRateLimit(job.templateKey) ? ACCOUNT_BATCH_INTERVAL_MS / 1000 : null,
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

const accountUsage = async (now) => {
  const hourAgo = new Date(now.getTime() - HOURLY_WINDOW_MS);
  const tenMinutesAgo = new Date(now.getTime() - TEN_MINUTE_WINDOW_MS);
  const rows = await model.EmailJob.aggregate([
    { $match: { templateKey: /\.account$/ } },
    { $unwind: "$recipients" },
    { $match: { "recipients.status": "sent", "recipients.sentAt": { $gt: hourAgo } } },
    {
      $group: {
        _id: null,
        sentAt: { $push: "$recipients.sentAt" },
      },
    },
  ]);
  const sentAt = rows && rows[0] && rows[0].sentAt
    ? rows[0].sentAt.map((value) => new Date(value))
    : [];
  const tenMinuteSentAt = sentAt.filter((value) => value > tenMinutesAgo);
  return sentAt.length ? {
    hourCount: sentAt.length,
    hourOldest: sentAt.reduce((oldest, value) => value < oldest ? value : oldest),
    tenMinuteCount: tenMinuteSentAt.length,
    tenMinuteOldest: tenMinuteSentAt.length
      ? tenMinuteSentAt.reduce((oldest, value) => value < oldest ? value : oldest)
      : null,
  } : {
    hourCount: 0,
    hourOldest: null,
    tenMinuteCount: 0,
    tenMinuteOldest: null,
  };
};

const limitReleaseAt = (usage) => {
  const releaseTimes = [];
  if (usage.tenMinuteCount >= TEN_MINUTE_LIMIT && usage.tenMinuteOldest) {
    releaseTimes.push(new Date(usage.tenMinuteOldest).getTime() + TEN_MINUTE_WINDOW_MS + 1000);
  }
  if (usage.hourCount >= HOURLY_LIMIT && usage.hourOldest) {
    releaseTimes.push(new Date(usage.hourOldest).getTime() + HOURLY_WINDOW_MS + 1000);
  }
  return releaseTimes.length ? new Date(Math.max(...releaseTimes)) : null;
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
    for (const job of jobs) {
      const bccDelivery = usesBccDelivery(job.templateKey);
      const accountRateLimit = usesAccountRateLimit(job.templateKey);
      let usage;
      if (accountRateLimit) {
        usage = await accountUsage(new Date());
        const releaseAt = limitReleaseAt(usage);
        if (releaseAt) {
          job.status = "rate-limited";
          job.nextRunAt = releaseAt;
          await job.save();
          continue;
        }
      }
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
      if (bccDelivery) {
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
      const available = accountRateLimit
        ? Math.min(
          ACCOUNT_BATCH_SIZE,
          TEN_MINUTE_LIMIT - usage.tenMinuteCount,
          HOURLY_LIMIT - usage.hourCount
        )
        : job.recipients.length;
      const queued = job.recipients.filter((item) => item.status === "queued").slice(0, available);
      let sentThisBatch = 0;
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
          sentThisBatch += 1;
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
      } else if (!(await finishIfDone(job)) && accountRateLimit) {
        const afterBatchUsage = {
          ...usage,
          hourCount: usage.hourCount + sentThisBatch,
          tenMinuteCount: usage.tenMinuteCount + sentThisBatch,
          hourOldest: usage.hourOldest || (sentThisBatch ? new Date() : null),
          tenMinuteOldest: usage.tenMinuteOldest || (sentThisBatch ? new Date() : null),
        };
        job.status = "rate-limited";
        job.nextRunAt = limitReleaseAt(afterBatchUsage) || new Date(Date.now() + ACCOUNT_BATCH_INTERVAL_MS);
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

module.exports = {
  ACCOUNT_BATCH_INTERVAL_MS,
  ACCOUNT_BATCH_SIZE,
  HOURLY_LIMIT,
  TEN_MINUTE_LIMIT,
  processJobs,
  publicJob,
  requestCancellation,
  startEmailWorker,
  stopEmailWorker,
};
