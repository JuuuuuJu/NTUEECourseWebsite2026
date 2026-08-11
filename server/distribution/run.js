async function runDistribution({ connection, backupService, fetchImpl, url, body }) {
  const backup = await backupService.createBackup(connection);
  const response = await fetchImpl(url, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
  });
  return { backup, response };
}
module.exports = runDistribution;
