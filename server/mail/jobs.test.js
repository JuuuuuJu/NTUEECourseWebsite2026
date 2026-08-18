jest.mock("../database/mongo/model", () => ({
  EmailJob: {
    aggregate: jest.fn(),
    find: jest.fn(),
    updateMany: jest.fn(),
  },
  Student: { findOne: jest.fn() },
}));
jest.mock("./mailer", () => ({
  createTransport: jest.fn(() => ({ close: jest.fn() })),
  sendRenderedBccEmail: jest.fn(),
  sendRenderedEmail: jest.fn(),
}));
jest.mock("./passwords", () => ({
  generatePassword: jest.fn(() => "GENERATED-ONLY-IN-MEMORY"),
  updateStudentPassword: jest.fn(),
}));
jest.mock("./renderTemplate", () => ({
  renderTemplate: jest.fn(() => ({ subject: "subject", html: "body" })),
}));

const model = require("../database/mongo/model");
const { sendRenderedBccEmail, sendRenderedEmail } = require("./mailer");
const { updateStudentPassword } = require("./passwords");
const {
  ACCOUNT_BATCH_INTERVAL_MS,
  ACCOUNT_BATCH_SIZE,
  HOURLY_LIMIT,
  TEN_MINUTE_LIMIT,
  processJobs,
  publicJob,
} = require("./jobs");

const makeJob = (recipients, extra = {}) => ({
  _id: "job-1",
  templateKey: "ten-select-two.account",
  subject: "Account",
  senderName: "Admin",
  templateBody: "{{password}}",
  variables: {},
  recipientSource: { mode: "database", grades: [1], summary: "grade 1" },
  generatePasswords: true,
  updatePasswords: true,
  smtpUserid: "B00123456",
  status: "queued",
  recipients,
  createdAt: new Date(),
  updatedAt: new Date(),
  save: jest.fn(async function save() { return this; }),
  ...extra,
});

describe("persistent email jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    model.EmailJob.aggregate.mockResolvedValue([]);
    process.env.SMTP_USERID = "B00123456";
    process.env.SMTP_PASSWORD = "not-returned";
    process.env.EMAIL_CREDENTIAL_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  test("public progress includes counts and recipient-level statuses without values or credentials", () => {
    const result = publicJob(makeJob([
      { _id: "r1", userID: "B1", name: "One", grade: 1, email: "one@example.com", actualRecipient: "one@example.com", status: "sent", attempts: 1, reportPassword: "REPORT-ONLY-SECRET" },
      { _id: "r2", userID: "B2", status: "queued", attempts: 0, values: { password: "secret" } },
    ]));
    expect(result).toMatchObject({ total: 2, sent: 1, remaining: 1 });
    expect(result.recipients[0]).toMatchObject({ userID: "B1", status: "sent", attempts: 1 });
    expect(JSON.stringify(result)).not.toContain("not-returned");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("REPORT-ONLY-SECRET");
  });

  test("completed recipients are not resent after restart", async () => {
    const sent = { _id: "r1", status: "sent", sentAt: new Date(), attempts: 1 };
    const queued = { _id: "r2", userID: "B2", actualRecipient: "two@example.com", values: { userID: "B2" }, status: "queued", attempts: 0 };
    const job = makeJob([sent, queued]);
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    model.EmailJob.aggregate.mockResolvedValue([{ count: 1, oldest: new Date() }]);
    model.Student.findOne.mockResolvedValue({ _id: "student-2" });
    sendRenderedEmail.mockResolvedValue({});
    await processJobs();
    expect(sendRenderedEmail).toHaveBeenCalledTimes(1);
    expect(sendRenderedEmail.mock.calls[0][0].to).toBe("two@example.com");
    expect(sent.attempts).toBe(1);
  });

  test("password updates only after successful delivery", async () => {
    const events = [];
    const recipient = { _id: "r1", userID: "B1", actualRecipient: "one@example.com", values: { userID: "B1" }, status: "queued", attempts: 0 };
    const job = makeJob([recipient]);
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    model.EmailJob.aggregate.mockResolvedValue([]);
    model.Student.findOne.mockResolvedValue({ _id: "student-1" });
    sendRenderedEmail.mockImplementation(async () => events.push("sent"));
    updateStudentPassword.mockImplementation(async () => events.push("password"));
    await processJobs();
    expect(events).toEqual(["sent", "password"]);
    expect(recipient.status).toBe("sent");
    expect(recipient.reportPassword).toBe("GENERATED-ONLY-IN-MEMORY");
  });

  test("delivery failure never updates password", async () => {
    const recipient = { _id: "r1", userID: "B1", actualRecipient: "one@example.com", values: { userID: "B1" }, status: "queued", attempts: 0 };
    const job = makeJob([recipient]);
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    model.EmailJob.aggregate.mockResolvedValue([]);
    sendRenderedEmail.mockRejectedValue(new Error("SMTP failed"));
    await processJobs();
    expect(updateStudentPassword).not.toHaveBeenCalled();
    expect(recipient.status).toBe("failed");
    expect(recipient.reportPassword).toBe("GENERATED-ONLY-IN-MEMORY");
    expect(recipient.error).toContain("SMTP failed");
    expect(recipient.error).not.toContain("not-returned");
  });

  test("encrypted admin SMTP credentials survive backend restart", async () => {
    const { encryptCredential } = require("./credentials");
    const recipient = {
      _id: "r1",
      userID: "B1",
      actualRecipient: "one@example.com",
      values: { userID: "B1" },
      status: "queued",
      attempts: 0,
    };
    const job = makeJob([recipient], {
      smtpCredential: encryptCredential("admin-smtp-secret"),
    });
    delete process.env.SMTP_PASSWORD;
    model.EmailJob.find.mockReturnValue({
      sort: jest.fn(async () => [job]),
    });
    model.EmailJob.aggregate.mockResolvedValue([]);
    model.Student.findOne.mockResolvedValue({ _id: "student-1" });
    sendRenderedEmail.mockResolvedValue({});
    await processJobs();
    expect(sendRenderedEmail).toHaveBeenCalledTimes(1);
    expect(recipient.status).toBe("sent");
  });

  test("individual account emails send ten at a time and wait ten seconds", async () => {
    const recipients = Array.from({ length: 25 }, (_, index) => ({
      _id: `r${index}`,
      actualRecipient: `student${index}@example.com`,
      values: {},
      status: "queued",
      attempts: 0,
    }));
    const job = makeJob(recipients, {
      generatePasswords: false,
      updatePasswords: false,
    });
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    sendRenderedEmail.mockResolvedValue({});
    const before = Date.now();
    await processJobs();
    expect(sendRenderedEmail).toHaveBeenCalledTimes(ACCOUNT_BATCH_SIZE);
    expect(job.status).toBe("rate-limited");
    expect(job.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + ACCOUNT_BATCH_INTERVAL_MS);
    expect(recipients.filter((recipient) => recipient.status === "sent")).toHaveLength(10);
    expect(recipients.filter((recipient) => recipient.status === "queued")).toHaveLength(15);
  });

  test("account emails wait for the ten-minute limit to be released", async () => {
    const oldest = new Date(Date.now() - 2 * 60 * 1000);
    const recipient = { _id: "r1", actualRecipient: "one@example.com", values: {}, status: "queued", attempts: 0 };
    const job = makeJob([recipient], { generatePasswords: false, updatePasswords: false });
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    model.EmailJob.aggregate.mockResolvedValue([{
      sentAt: Array.from({ length: TEN_MINUTE_LIMIT }, (_, index) => new Date(oldest.getTime() + index)),
    }]);
    await processJobs();
    expect(sendRenderedEmail).not.toHaveBeenCalled();
    expect(job.status).toBe("rate-limited");
    expect(job.nextRunAt.getTime()).toBe(oldest.getTime() + 10 * 60 * 1000 + 1000);
  });

  test("account email public progress reports both school limits", () => {
    const result = publicJob(makeJob([]));
    expect(result).toMatchObject({
      batchSize: ACCOUNT_BATCH_SIZE,
      batchIntervalSeconds: ACCOUNT_BATCH_INTERVAL_MS / 1000,
      tenMinuteLimit: TEN_MINUTE_LIMIT,
      hourlyLimit: HOURLY_LIMIT,
    });
  });

  test("account emails also wait when the rolling hourly limit is full", async () => {
    const oldest = new Date(Date.now() - 50 * 60 * 1000);
    const recipient = { _id: "r1", actualRecipient: "one@example.com", values: {}, status: "queued", attempts: 0 };
    const job = makeJob([recipient], { generatePasswords: false, updatePasswords: false });
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    model.EmailJob.aggregate.mockResolvedValue([{
      sentAt: Array.from({ length: HOURLY_LIMIT }, (_, index) => new Date(oldest.getTime() + index)),
    }]);
    await processJobs();
    expect(sendRenderedEmail).not.toHaveBeenCalled();
    expect(job.nextRunAt.getTime()).toBe(oldest.getTime() + 60 * 60 * 1000 + 1000);
  });

  test("schedule notifications with identical content are sent once using BCC", async () => {
    const recipients = [
      { _id: "r1", actualRecipient: "one@example.com", values: { name: "One" }, status: "queued", attempts: 0 },
      { _id: "r2", actualRecipient: "two@example.com", values: { name: "Two" }, status: "queued", attempts: 0 },
    ];
    const job = makeJob(recipients, {
      templateKey: "ten-select-two.schedule",
      generatePasswords: false,
      updatePasswords: false,
      templateBody: "same body",
    });
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    model.EmailJob.aggregate.mockResolvedValue([]);
    sendRenderedBccEmail.mockResolvedValue({});
    await processJobs();
    expect(sendRenderedEmail).not.toHaveBeenCalled();
    expect(sendRenderedBccEmail).toHaveBeenCalledTimes(1);
    expect(publicJob(job)).toMatchObject({ hourlyLimit: null, tenMinuteLimit: null });
    expect(sendRenderedBccEmail.mock.calls[0][0].bcc).toEqual(["one@example.com", "two@example.com"]);
    expect(recipients.map((recipient) => recipient.status)).toEqual(["sent", "sent"]);
  });

  test("result notifications are sent once using BCC", async () => {
    const recipients = [
      { _id: "r1", actualRecipient: "one@example.com", values: {}, status: "queued", attempts: 0 },
      { _id: "r2", actualRecipient: "two@example.com", values: {}, status: "queued", attempts: 0 },
    ];
    const job = makeJob(recipients, {
      templateKey: "ten-select-two.result",
      generatePasswords: false,
      updatePasswords: false,
      templateBody: "same result body",
    });
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(async () => [job]) });
    sendRenderedBccEmail.mockResolvedValue({});
    await processJobs();
    expect(sendRenderedBccEmail).toHaveBeenCalledTimes(1);
    expect(job.status).toBe("completed");
    expect(recipients.map((recipient) => recipient.status)).toEqual(["sent", "sent"]);
  });
});
