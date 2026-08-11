const runDistribution = require("./run");

describe("safe distribution runner", () => {
  test("creates a backup before invoking distribution", async () => {
    const order = [];
    const backup = { filename: "before-run.json.gz" };
    const result = await runDistribution({
      connection: {},
      backupService: { createBackup: async () => { order.push("backup"); return backup; } },
      fetchImpl: async () => { order.push("distribute"); return { ok: true }; },
      url: "http://worker/new_distribute",
      body: [],
    });
    expect(order).toEqual(["backup", "distribute"]);
    expect(result.backup).toBe(backup);
  });

  test("does not invoke distribution when backup fails", async () => {
    const fetchImpl = jest.fn();
    await expect(runDistribution({
      connection: {},
      backupService: { createBackup: async () => { throw new Error("disk full"); } },
      fetchImpl,
      url: "http://worker/new_distribute",
      body: [],
    })).rejects.toThrow("disk full");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
