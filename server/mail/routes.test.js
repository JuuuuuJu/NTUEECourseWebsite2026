jest.mock("../database/mongo/model", () => ({
  EmailTemplate: { updateOne: jest.fn(), find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn() },
  OpenTime: { findOne: jest.fn() },
  Student: { find: jest.fn(), findOne: jest.fn() },
  Course: { find: jest.fn() },
  Selection: { find: jest.fn() },
  EmailJob: { find: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(), create: jest.fn(), aggregate: jest.fn(), updateMany: jest.fn() },
}));
const express = require("express");
const request = require("supertest");
const model = require("../database/mongo/model");
const routes = require("./routes");

const template = {
  key: "ten-select-two.schedule", category: "ten-select-two", purpose: "schedule",
  subject: "Hello {{name}}", senderName: "Admin", body: "<p>{{name}}</p>", updatedBy: "admin",
};
const app = () => {
  const server = express();
  server.use((req, _res, next) => {
    req.session = { userID: req.get("x-user") || undefined, authority: Number(req.get("x-authority") || 0) };
    next();
  });
  server.use(routes);
  server.post("/session", (_req, res) => res.sendStatus(401));
  server.get("/opentime", (_req, res) => res.send({ start: 1, end: 2 }));
  return server;
};

describe("email admin routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    model.EmailTemplate.updateOne.mockResolvedValue({});
    model.EmailTemplate.findOne.mockResolvedValue(template);
    model.OpenTime.findOne.mockResolvedValue(null);
    model.Student.findOne.mockResolvedValue(null);
    process.env.SMTP_USERID = "B00123456";
    process.env.SMTP_PASSWORD = "server-only";
    process.env.EMAIL_CREDENTIAL_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  test("mail job routes do not block public login or opentime", async () => {
    await request(app()).post("/session").expect(401);
    await request(app()).get("/opentime").expect(200, { start: 1, end: 2 });
  });

  test.each([
    ["get", "/email-jobs"],
    ["get", "/email-jobs/abc"],
    ["get", "/email-jobs/abc/passwords.csv"],
    ["post", "/email-jobs/abc/acknowledge"],
    ["post", "/email-jobs/abc/cancel"],
    ["post", "/email-jobs/abc/retry-failed"],
    ["post", "/email-recipients/preview"],
    ["post", "/email-send"],
  ])("non-admin cannot %s %s", async (method, path) => {
    await request(app())[method](path).send({}).expect(403);
  });

  test("database source filters exact selected grades and returns preview fields", async () => {
    const students = [
      { userID: "B1", name: "One", grade: 1 },
      { userID: "B3", name: "Three", grade: 3 },
    ];
    const sort = jest.fn(async () => students);
    model.Student.find.mockReturnValue({ sort });
    const response = await request(app()).post("/email-recipients/preview")
      .set("x-user", "ADMIN").set("x-authority", "2")
      .send({ sourceMode: "database", grades: [1, 3] }).expect(200);
    expect(model.Student.find).toHaveBeenCalledWith({ grade: { $in: [1, 3] } });
    expect(response.body).toMatchObject({ count: 2, recipients: [
      { userID: "B1", name: "One", grade: 1, email: "B1@ntu.edu.tw" },
      { userID: "B3", name: "Three", grade: 3, email: "B3@ntu.edu.tw" },
    ] });
  });

  test("dry-run is immediate and creates no persistent job", async () => {
    const response = await request(app()).post("/email-send")
      .set("x-user", "ADMIN").set("x-authority", "2")
      .send({ templateKey: template.key, sourceMode: "csv", csvRows: [{ userID: "B1", name: "One", email: "one@example.com" }], dryRun: true })
      .expect(200);
    expect(response.body).toMatchObject({ total: 1, dryRun: 1, sent: 0 });
    expect(model.EmailJob.create).not.toHaveBeenCalled();
  });

  test("BCC notifications reject recipient-specific rendered content", async () => {
    const response = await request(app()).post("/email-send")
      .set("x-user", "ADMIN").set("x-authority", "2")
      .send({
        templateKey: template.key,
        sourceMode: "csv",
        csvRows: [
          { userID: "B1", name: "One", email: "one@example.com" },
          { userID: "B2", name: "Two", email: "two@example.com" },
        ],
        dryRun: true,
      }).expect(400);
    expect(response.body.error).toContain("寄送前驗證失敗");
    expect(response.body.statuses.some((status) =>
      status.message.includes("所有收件人的信件主旨與內容必須完全相同")
    )).toBe(true);
    expect(model.EmailJob.create).not.toHaveBeenCalled();
  });

  test("reminder includes only students with no formal selection in every selected course", async () => {
    model.Course.find.mockResolvedValue([{ id: "electronics" }, { id: "em" }]);
    model.Selection.find.mockResolvedValue([
      { userID: "B1", courseID: "electronics" },
      { userID: "B2", courseID: "em" },
    ]);
    const students = [{ userID: "B3", name: "None saved", grade: 3 }];
    model.Student.find.mockReturnValue({ sort: jest.fn(async () => students) });
    const response = await request(app()).post("/email-recipients/preview")
      .set("x-user", "ADMIN").set("x-authority", "2")
      .send({
        templateKey: "ten-select-two.reminder",
        sourceMode: "database",
        grades: [3],
        reminderCourseIDs: ["electronics", "em"],
      }).expect(200);
    expect(model.Selection.find).toHaveBeenCalledWith(
      { courseID: { $in: ["electronics", "em"] } }, "userID"
    );
    expect(model.Student.find).toHaveBeenCalledWith({
      grade: { $in: [3] },
      userID: { $nin: ["B1", "B2"] },
    });
    expect(response.body.recipients).toEqual([
      { userID: "B3", name: "None saved", grade: 3, email: "B3@ntu.edu.tw" },
    ]);
  });

  test("retry-failed queues only failed recipients", async () => {
    const job = {
      _id: "job-retry",
      templateKey: template.key,
      subject: "Hi",
      recipientSource: { summary: "CSV" },
      status: "completed",
      completedAt: new Date(),
      recipients: [
        { _id: "sent", status: "sent", attempts: 1 },
        { _id: "failed", status: "failed", attempts: 1, error: "SMTP failed" },
        { _id: "skipped", status: "skipped", attempts: 0, error: "Invalid email" },
      ],
      save: jest.fn(async function save() { return this; }),
    };
    model.EmailJob.findById.mockResolvedValue(job);
    const response = await request(app()).post("/email-jobs/job-retry/retry-failed")
      .set("x-user", "ADMIN").set("x-authority", "2").expect(202);
    expect(job.recipients.map((recipient) => recipient.status)).toEqual(["sent", "queued", "skipped"]);
    expect(job.recipients[1].attempts).toBe(1);
    expect(job.recipients[2].error).toBe("Invalid email");
    expect(response.body).toMatchObject({ sent: 1, skipped: 1, failed: 0, remaining: 1 });
  });

  test("cancel stops an active job without changing recipient results", async () => {
    const job = {
      _id: "job-cancel",
      templateKey: template.key,
      subject: "Hi",
      recipientSource: { summary: "CSV" },
      status: "sending",
      recipients: [
        { _id: "sent", status: "sent", attempts: 1 },
        { _id: "queued", status: "queued", attempts: 0 },
      ],
      save: jest.fn(async function save() { return this; }),
    };
    model.EmailJob.findById.mockResolvedValue(job);
    const response = await request(app()).post("/email-jobs/job-cancel/cancel")
      .set("x-user", "ADMIN").set("x-authority", "2").expect(200);
    expect(job.status).toBe("canceled");
    expect(job.recipients.map((recipient) => recipient.status)).toEqual(["sent", "canceled"]);
    expect(response.body).toMatchObject({ status: "canceled", sent: 1, canceled: 1, remaining: 0 });
  });

  test("real send persists and returns a queued job without SMTP password", async () => {
    model.EmailJob.create.mockImplementation(async (data) => ({
      _id: "job-1", ...data, createdAt: new Date(), updatedAt: new Date(),
    }));
    const response = await request(app()).post("/email-send")
      .set("x-user", "ADMIN").set("x-authority", "2")
      .send({ templateKey: template.key, sourceMode: "csv", csvRows: [{ userID: "B1", name: "One", email: "one@example.com" }], dryRun: false })
      .expect(202);
    expect(model.EmailJob.create).toHaveBeenCalled();
    expect(response.body).toMatchObject({ id: "job-1", status: "queued", total: 1, remaining: 1 });
    expect(JSON.stringify(response.body)).not.toContain("server-only");
  });

  test("admin password CSV contains only this job generated passwords", async () => {
    model.EmailJob.findById.mockResolvedValue({
      _id: "job-passwords",
      generatePasswords: true,
      recipients: [
        {
          userID: "B1",
          name: "王小明",
          grade: 1,
          email: "one@example.com",
          reportPassword: "ThisJobOnly123",
          status: "sent",
          sentAt: new Date("2026-08-11T08:00:00.000Z"),
          error: "",
        },
        {
          userID: "B2",
          name: "陳小華",
          grade: 2,
          email: "two@example.com",
          reportPassword: "FailedJobPass456",
          status: "failed",
          sentAt: null,
          error: "Email delivery failed.",
        },
        {
          userID: "B3",
          name: "林小美",
          grade: 3,
          email: "three@example.com",
          status: "queued",
          sentAt: null,
          error: "",
        },
      ],
    });
    const response = await request(app())
      .get("/email-jobs/job-passwords/passwords.csv")
      .set("x-user", "ADMIN")
      .set("x-authority", "2")
      .expect(200)
      .expect("Cache-Control", "no-store");
    expect(response.headers["content-disposition"]).toContain(
      "email-job-job-passwords-passwords.csv"
    );
    expect(response.text).toContain(
      '"userID","name","grade","email","password","status","sentAt","error"'
    );
    expect(response.text).toContain('"ThisJobOnly123","sent"');
    expect(response.text).toContain('"FailedJobPass456","failed"');
    expect(response.text).toContain('"B3","林小美","3","three@example.com","","queued"');
  });

  test("password CSV rejects jobs that did not generate passwords", async () => {
    model.EmailJob.findById.mockResolvedValue({
      _id: "job-no-passwords",
      generatePasswords: false,
      recipients: [],
    });
    await request(app())
      .get("/email-jobs/job-no-passwords/passwords.csv")
      .set("x-user", "ADMIN")
      .set("x-authority", "2")
      .expect(400, { error: "This job did not generate passwords." });
  });

  test("admin SMTP password is encrypted in the queued job and never returned", async () => {
    delete process.env.SMTP_USERID;
    delete process.env.SMTP_PASSWORD;
    model.EmailJob.create.mockImplementation(async (data) => ({
      _id: "job-encrypted-smtp",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const response = await request(app())
      .post("/email-send")
      .set("x-user", "ADMIN")
      .set("x-authority", "2")
      .send({
        templateKey: template.key,
        sourceMode: "csv",
        csvRows: [
          {
            userID: "B1",
            name: "One",
            email: "one@example.com",
          },
        ],
        dryRun: false,
        smtp: {
          userid: "B00123456",
          password: "admin-smtp-secret",
        },
      })
      .expect(202);
    const created = model.EmailJob.create.mock.calls[0][0];
    expect(created.smtpUserid).toBe("B00123456");
    expect(created.smtpCredential).toMatchObject({ version: 1 });
    expect(JSON.stringify(created.smtpCredential)).not.toContain(
      "admin-smtp-secret"
    );
    expect(JSON.stringify(response.body)).not.toContain("admin-smtp-secret");
    expect(JSON.stringify(response.body)).not.toContain("ciphertext");
  });

  test("completed job remains listed until acknowledge and acknowledge persists actor", async () => {
    const job = { _id: "job-1", templateKey: template.key, subject: "Hi", recipientSource: { summary: "CSV" }, status: "completed", recipients: [], createdAt: new Date(), updatedAt: new Date() };
    model.EmailJob.find.mockReturnValue({ sort: jest.fn(() => ({ limit: jest.fn(async () => [job]) })) });
    let response = await request(app()).get("/email-jobs").set("x-user", "ADMIN").set("x-authority", "2").expect(200);
    expect(response.body).toHaveLength(1);
    model.EmailJob.findByIdAndUpdate.mockResolvedValue({ ...job, acknowledgedAt: new Date(), acknowledgedBy: "ADMIN" });
    await request(app()).post("/email-jobs/job-1/acknowledge").set("x-user", "ADMIN").set("x-authority", "2").expect(200);
    expect(model.EmailJob.findByIdAndUpdate).toHaveBeenCalledWith("job-1", expect.objectContaining({ acknowledgedBy: "ADMIN" }), { new: true });
    expect(model.EmailJob.find.mock.calls[0][0]).toEqual({ acknowledgedAt: null });
  });
});
