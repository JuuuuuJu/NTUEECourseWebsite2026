import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, FormControl, FormControlLabel, Grid, InputLabel, LinearProgress,
  makeStyles, MenuItem, Paper, Radio, RadioGroup, Select, Snackbar, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import { EmailAPI } from "../../api";

const categories = [{ key: "ten-select-two", label: "十選二" }, { key: "ee-lab", label: "電電實驗" }];
const purposes = [{ key: "schedule", label: "時程通知" }, { key: "account", label: "帳密通知" }, { key: "reminder", label: "未選通知" }, { key: "result", label: "結果通知" }];
const grades = [1, 2, 3, 4, 5, 6, 7];
const statusText = { queued: "排隊中", sending: "寄送中", "rate-limited": "速率限制等待", completed: "已完成", failed: "失敗", canceled: "已取消", sent: "已寄送", skipped: "略過" };
const initialVariables = { websiteUrl: "https://course.ntuee.org/", contactEmail: "ntueesaad2@gmail.com", openTimeText: "", importantLinks: "" };
const useStyles = makeStyles((theme) => ({
  root: { maxWidth: 1280, margin: "auto" },
  section: { padding: theme.spacing(2), marginBottom: theme.spacing(2) },
  editor: { fontFamily: "monospace" },
  variables: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap" },
  preview: { width: "100%", minHeight: 260, border: 0, background: "white" },
  tableWrap: { maxHeight: 360, overflow: "auto" },
  override: {
    border: `3px solid ${theme.palette.warning.main}`,
    background: "#fff8e1",
    color: "#3e2723",
    "& .MuiTypography-root": { color: "inherit" },
    "& .MuiInputBase-root": { color: "#212121" },
    "& .MuiInputLabel-root": { color: "#5d4037" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#6d4c41" },
    "& .MuiFormHelperText-root": { color: "#5d4037" },
    "& .MuiInputBase-input::placeholder": { color: "#6d4c41", opacity: 1 },
    "& .MuiInputBase-input.Mui-disabled": {
      color: "#5f6368",
      WebkitTextFillColor: "#5f6368",
      opacity: 1,
    },
    "& .MuiInputLabel-root.Mui-disabled": { color: "#6d625f" },
    "& .MuiInput-underline:before": { borderBottomColor: "#795548" },
    "& .MuiInput-underline:hover:not(.Mui-disabled):before": { borderBottomColor: "#4e342e" },
    "& .MuiInput-underline.Mui-disabled:before": { borderBottomColor: "#9e8f8a" },
  },
  job: { padding: theme.spacing(2), marginTop: theme.spacing(2) },
  progress: { height: 12, borderRadius: 6, margin: theme.spacing(1, 0) },
  jobToolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) 180px max-content max-content",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(2),
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "minmax(220px, 1fr) 180px",
    },
    [theme.breakpoints.down("xs")]: {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  jobSearch: {
    minWidth: 0,
  },
  jobStatus: {
    minWidth: 0,
  },
  jobStatusMenu: {
    backgroundColor: `${theme.palette.background.paper} !important`,
    opacity: "1 !important",
  },
  jobToolbarButton: {
    width: "100%",
    maxWidth: "100%",
    whiteSpace: "normal",
  },
  jobTableWrap: {
    marginTop: theme.spacing(3),
  },
  courseChecklist: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: theme.spacing(0.5, 2),
    margin: theme.spacing(1, 0),
    padding: theme.spacing(1, 2),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  fileInput: { display: "none" },
}));
const errorMessage = (error) => {
  const data = error.response?.data;
  if (data?.error) return data.error;
  const details = [...new Set(
    (data?.statuses || [])
      .filter((status) => status.status === "failed" && status.message)
      .map((status) => status.message)
  )];
  if (details.length) return details.join("；");
  return error.message || "操作失敗";
};
const fmt = (value) => value ? new Date(value).toLocaleString("zh-TW") : "—";

export default function EmailManagement() {
  const classes = useStyles();
  const [category, setCategory] = useState("ten-select-two");
  const [purpose, setPurpose] = useState("account");
  const [templates, setTemplates] = useState({});
  const [template, setTemplate] = useState({ subject: "", senderName: "", body: "" });
  const [builtIns, setBuiltIns] = useState([]);
  const [variables, setVariables] = useState(initialVariables);
  const [sourceMode, setSourceMode] = useState("database");
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [courses, setCourses] = useState([]);
  const [reminderCourseIDs, setReminderCourseIDs] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [recipientOverride, setRecipientOverride] = useState("");
  const [smtpUserid, setSmtpUserid] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [generatePasswords, setGeneratePasswords] = useState(false);
  const [updatePasswords, setUpdatePasswords] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobDetails, setJobDetails] = useState({});
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatus, setJobStatus] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [largeConfirmed, setLargeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false });
  const key = `${category}.${purpose}`;
  const notify = (severity, message) => setAlert({ open: true, severity, message });

  const loadJobs = async () => {
    const response = await EmailAPI.getJobs();
    setJobs(response.data);
    const detailResponses = await Promise.all(response.data.map((job) => EmailAPI.getJob(job.id)));
    setJobDetails(Object.fromEntries(detailResponses.map((response) => [response.data.id, response.data])));
  };

  useEffect(() => {
    setBusy(true);
    Promise.all([EmailAPI.getTemplates(), loadJobs(), EmailAPI.getRecipientCourses()])
      .then(([response, _jobs, courseResponse]) => {
        const byKey = Object.fromEntries(response.data.templates.map((item) => [item.key, item]));
        setTemplates(byKey);
        setTemplate(byKey[key] || {});
        setBuiltIns(response.data.builtInVariables || []);
        setVariables({ ...initialVariables, ...(response.data.defaultValues || {}) });
        setCourses(courseResponse.data || []);
      })
      .catch((error) => notify("error", errorMessage(error)))
      .finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (templates[key]) setTemplate(templates[key]);
    if (purpose !== "account") {
      setGeneratePasswords(false);
      setUpdatePasswords(false);
    }
    if (purpose === "reminder") setSourceMode("database");
  }, [key, purpose, templates]);

  useEffect(() => {
    const timer = setInterval(() => loadJobs().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);

  const refreshRecipients = async () => {
    try {
      const response = await EmailAPI.previewRecipients({ templateKey: key, sourceMode, grades: selectedGrades, csvRows, reminderCourseIDs });
      setRecipients(response.data.recipients);
      setRecipientCount(response.data.count);
    } catch (error) { notify("error", errorMessage(error)); }
  };
  useEffect(() => { refreshRecipients(); }, [key, sourceMode, selectedGrades, csvRows, reminderCourseIDs]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTemplate = async () => {
    setBusy(true);
    try {
      const response = await EmailAPI.putTemplate(key, template);
      setTemplates((old) => ({ ...old, [key]: response.data }));
      setTemplate(response.data);
      notify("success", "模板已儲存");
    } catch (error) { notify("error", errorMessage(error)); } finally { setBusy(false); }
  };

  const renderPreview = async () => {
    setBusy(true);
    try {
      const sample = recipients[0] || { userID: "B12345678", name: "王小明", grade: 1, email: "B12345678@ntu.edu.tw" };
      const response = await EmailAPI.previewTemplate(key, {
        ...template, recipient: { ...sample, account: sample.userID, password: "sample-password" }, variables,
      });
      setPreview(response.data);
    } catch (error) { notify("error", errorMessage(error)); } finally { setBusy(false); }
  };

  const handleCsv = (file) => {
    if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim(),
      complete: ({ data, meta, errors }) => {
        if (errors.length || !meta.fields?.some((field) => ["userID", "account", "email"].includes(field))) {
          notify("error", "CSV 第一列須為欄名，並包含 userID、account 或 email"); return;
        }
        setCsvRows(data); setCsvHeaders(meta.fields); notify("success", `已載入 ${data.length} 筆`);
      },
    });
  };

  const send = async () => {
    setConfirmOpen(false); setBusy(true);
    try {
      const response = await EmailAPI.sendEmail({
        templateKey: key, sourceMode, grades: selectedGrades, csvRows, dryRun,
        reminderCourseIDs,
        generatePasswords, updatePasswords, variables, recipientOverride,
        smtp: { userid: smtpUserid, password: smtpPassword },
        confirmedLargeSend: largeConfirmed,
      });
      setResult(response.data);
      if (!dryRun) {
        notify("success", "寄信工作已加入佇列，可離開此頁後再回來查看");
        setSmtpPassword("");
        await loadJobs();
      } else notify("success", "Dry-run 完成：未寄信、未更新密碼、未使用額度");
    } catch (error) {
      setResult(error.response?.data || null);
      notify("error", errorMessage(error));
    } finally { setBusy(false); setLargeConfirmed(false); }
  };

  const requestSend = () => {
    if (!recipientCount) return notify("error", "目前沒有收件人");
    if (sourceMode === "database" && !selectedGrades.length) return notify("error", "請選擇至少一個年級");
    if (purpose === "reminder" && !reminderCourseIDs.length) return notify("error", "未選通知請選擇至少一門課程");
    if (!dryRun && (!smtpUserid.trim() || !smtpPassword)) return notify("error", "請輸入 SMTP userid 與 password");
    if (dryRun) send(); else setConfirmOpen(true);
  };

  const acknowledge = async (id) => {
    await EmailAPI.acknowledgeJob(id);
    await loadJobs();
  };

  const retryFailed = async (id) => {
    setBusy(true);
    try {
      const response = await EmailAPI.retryFailedJob(id);
      notify("success", `已重新排入 ${response.data.remaining} 位失敗收件人`);
      await loadJobs();
    } catch (error) {
      notify("error", errorMessage(error));
    } finally { setBusy(false); }
  };

  const cancelJob = async (id) => {
    if (!window.confirm("確定要停止這個寄信工作嗎？已經寄出的信件無法收回。")) return;
    setBusy(true);
    try {
      await EmailAPI.cancelJob(id);
      notify("success", "已停止寄信，正在寄送中的單封信件完成後不會再寄下一封");
      await loadJobs();
    } catch (error) {
      notify("error", errorMessage(error));
    } finally { setBusy(false); }
  };

  const sourceSummary = sourceMode === "database" ? `學生資料庫；年級：${selectedGrades.join(", ") || "未選"}` : `CSV；${csvRows.length} 筆`;

  return <div className={classes.root}>
    <Typography variant="h4" gutterBottom>寄信管理 / Email Management</Typography>

    {jobs.length > 0 && <Paper className={classes.section}>
      <Typography variant="h5">寄信工作進度</Typography>
      <Typography color="textSecondary">工作保存在資料庫；完成後會保留，直到管理員按「OK / 關閉進度」。</Typography>
      {jobs.map((summary) => {
        const job = jobDetails[summary.id] || summary;
        const percent = job.total ? ((job.sent + job.failed + job.skipped + (job.canceled || 0)) / job.total) * 100 : 0;
        const detail = (job.recipients || []).filter((item) => {
          const haystack = `${item.userID} ${item.name} ${item.grade} ${item.email} ${item.actualRecipient} ${item.error}`.toLowerCase();
          return haystack.includes(jobSearch.toLowerCase()) && (jobStatus === "all" || item.status === jobStatus);
        });
        return <Paper variant="outlined" className={classes.job} key={job.id}>
          <Grid container justifyContent="space-between" spacing={1}>
            <Grid item><Typography variant="h6">{job.templateKey} — {job.subject}</Typography></Grid>
            <Grid item><Chip color={["completed"].includes(job.status) ? "primary" : "default"} label={statusText[job.status] || job.status} /></Grid>
          </Grid>
          <Typography>{job.recipientSource?.summary}{job.recipientSource?.override ? `；⚠ 全部實際寄至 ${job.recipientSource.override}` : ""}</Typography>
          <LinearProgress className={classes.progress} variant="determinate" value={percent} />
          <Typography>已寄 {job.sent} / 失敗 {job.failed} / 略過 {job.skipped} / 已停止 {job.canceled || 0} / 剩餘 {job.remaining} / 總計 {job.total}</Typography>
          <Typography>滾動 60 分鐘硬上限：{job.hourlyLimit} 封；下次寄送：{fmt(job.nextRunAt)}</Typography>
          <Typography color="textSecondary">建立 {fmt(job.createdAt)}　更新 {fmt(job.updatedAt)}　完成 {fmt(job.completedAt)}</Typography>
          {["queued", "sending", "rate-limited"].includes(job.status) && <Button disabled={busy} color="secondary" variant="contained" onClick={() => cancelJob(job.id)}>停止寄信</Button>}
          {job.failed > 0 && ["completed", "failed", "canceled"].includes(job.status) && <Button disabled={busy} color="secondary" variant="contained" onClick={() => retryFailed(job.id)}>所有失敗收件人一鍵重寄（{job.failed}）</Button>}
          <div className={classes.jobToolbar}>
            <TextField className={classes.jobSearch} variant="outlined" size="small" label="搜尋收件人" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} />
            <FormControl className={classes.jobStatus} variant="outlined" size="small">
              <InputLabel id={`job-status-label-${job.id}`}>狀態</InputLabel>
              <Select
                labelId={`job-status-label-${job.id}`}
                label="狀態"
                value={jobStatus}
                onChange={(e) => setJobStatus(e.target.value)}
                MenuProps={{
                  getContentAnchorEl: null,
                  anchorOrigin: { vertical: "top", horizontal: "left" },
                  transformOrigin: { vertical: "bottom", horizontal: "left" },
                  PaperProps: { className: classes.jobStatusMenu },
                }}
              >
                <MenuItem value="all">全部狀態</MenuItem>
                {["queued","sending","sent","failed","skipped","canceled"].map((value) => <MenuItem key={value} value={value}>{statusText[value] || value}</MenuItem>)}
              </Select>
            </FormControl>
            <Button className={classes.jobToolbarButton} href={EmailAPI.reportUrl(job.id)} variant="outlined">下載報告</Button>
            {job.hasPasswordReport && <Button className={classes.jobToolbarButton} href={EmailAPI.passwordReportUrl(job.id)} color="primary" variant="contained">下載本次寄信密碼紀錄</Button>}
          </div>
          <div className={`${classes.tableWrap} ${classes.jobTableWrap}`}><Table size="small" stickyHeader>
            <TableHead><TableRow>{["userID","姓名","年級","Email / 實際收件人","狀態","寄出時間","嘗試","錯誤"].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{detail.map((item) => <TableRow key={item.id}><TableCell>{item.userID}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.grade}</TableCell><TableCell>{item.email}{item.actualRecipient !== item.email ? ` → ${item.actualRecipient}` : ""}</TableCell><TableCell>{statusText[item.status] || item.status}</TableCell><TableCell>{fmt(item.sentAt)}</TableCell><TableCell>{item.attempts}</TableCell><TableCell>{item.error}</TableCell></TableRow>)}</TableBody>
          </Table></div>
          {["completed","failed","canceled"].includes(job.status) && <Button color="primary" variant="contained" onClick={() => acknowledge(job.id)}>OK / 關閉進度</Button>}
        </Paper>;
      })}
    </Paper>}

    <Paper className={classes.section}><Grid container spacing={2}>
      <Grid item xs={12} sm={6}><FormControl fullWidth><InputLabel>類別</InputLabel><Select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((x) => <MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} sm={6}><FormControl fullWidth><InputLabel>用途</InputLabel><Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>{purposes.map((x) => <MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12}><TextField fullWidth label="主旨" value={template.subject || ""} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} /></Grid>
      <Grid item xs={12}><TextField fullWidth label="寄件者名稱" value={template.senderName || ""} onChange={(e) => setTemplate({ ...template, senderName: e.target.value })} /></Grid>
      <Grid item xs={12}><TextField fullWidth multiline rows={10} variant="outlined" className={classes.editor} label="信件內容（HTML）" value={template.body || ""} onChange={(e) => setTemplate({ ...template, body: e.target.value })} /></Grid>
      {["schedule", "reminder"].includes(purpose) && <Grid item xs={12}><Alert severity="info">時程通知與未選通知固定以單封 BCC 寄送。所有收件人的主旨與內容必須完全相同；請勿使用姓名、帳號、Email 等會因收件人而改變的欄位，系統也會在建立工作前逐一比對並阻擋不一致內容。</Alert></Grid>}
      <Grid item xs={12}><div className={classes.variables}>{[...new Set([...builtIns, ...csvHeaders])].map((v) => <Chip key={v} label={`{{${v}}}`} />)}</div></Grid>
      {Object.keys(initialVariables).map((v) => <Grid item xs={12} sm={6} key={v}><TextField fullWidth label={v} value={variables[v]} onChange={(e) => setVariables({ ...variables, [v]: e.target.value })} /></Grid>)}
      <Grid item><Button color="primary" variant="contained" disabled={busy} onClick={saveTemplate}>儲存模板</Button></Grid>
      <Grid item><Button variant="outlined" disabled={busy} onClick={renderPreview}>更新預覽</Button></Grid>
    </Grid></Paper>

    {preview && <Paper className={classes.section}><Typography>To: {preview.to}　Subject: {preview.subject}</Typography><iframe title="Email preview" sandbox="" className={classes.preview} srcDoc={preview.html} /></Paper>}

    <Paper className={classes.section}>
      <Typography variant="h6">收件人來源（{recipientCount} 人）</Typography>
      <RadioGroup row value={sourceMode} onChange={(e) => setSourceMode(e.target.value)}><FormControlLabel value="database" control={<Radio />} label="Student database" /><FormControlLabel disabled={purpose === "reminder"} value="csv" control={<Radio />} label="CSV upload" /></RadioGroup>
      {purpose === "reminder" && <div>
        <Typography variant="subtitle1">未儲存志願的課程（可複選）</Typography>
        <div className={classes.courseChecklist}>
          {courses.map((course) => <FormControlLabel
            key={course.id}
            control={<Checkbox
              color="primary"
              checked={reminderCourseIDs.includes(course.id)}
              onChange={() => setReminderCourseIDs((selected) => selected.includes(course.id)
                ? selected.filter((id) => id !== course.id)
                : [...selected, course.id])}
            />}
            label={`${course.name}（${course.id}）`}
          />)}
        </div>
        <Typography color="textSecondary">只寄給上述每一門課都沒有正式儲存志願的學生；任一門已有正式 Selection 即排除。</Typography>
      </div>}
      {sourceMode === "database" ? <><Typography>精確選擇年級：</Typography>{grades.map((grade) => <FormControlLabel key={grade} control={<Checkbox checked={selectedGrades.includes(grade)} onChange={() => setSelectedGrades((old) => old.includes(grade) ? old.filter((x) => x !== grade) : [...old, grade].sort())} />} label={String(grade)} />)}</> : <>
        <input className={classes.fileInput} id="email-csv" type="file" accept=".csv,text/csv" onChange={(e) => handleCsv(e.target.files[0])} /><label htmlFor="email-csv"><Button component="span" variant="outlined">匯入 CSV</Button></label><Button onClick={() => { setCsvRows([]); setCsvHeaders([]); }}>清除</Button>
      </>}
      <div className={classes.tableWrap}><Table size="small"><TableHead><TableRow><TableCell>userID</TableCell><TableCell>name</TableCell><TableCell>grade</TableCell><TableCell>email</TableCell></TableRow></TableHead><TableBody>{recipients.map((r, i) => <TableRow key={`${r.userID}-${i}`}><TableCell>{r.userID}</TableCell><TableCell>{r.name}</TableCell><TableCell>{r.grade}</TableCell><TableCell>{r.email}</TableCell></TableRow>)}</TableBody></Table></div>
    </Paper>

    <Paper className={`${classes.section} ${classes.override}`}><Typography variant="h6">⚠ 收件人覆寫（僅 staging / 測試）</Typography><Typography>填入後，所有信件都會實際寄到此地址；原始收件人仍顯示於報告。</Typography><TextField fullWidth label="Override email（留白為關閉）" value={recipientOverride} onChange={(e) => setRecipientOverride(e.target.value)} /></Paper>

    <Paper className={classes.section}><Typography variant="h6">寄送設定</Typography>
      <RadioGroup row value={dryRun ? "dry-run" : "real"} onChange={(event) => setDryRun(event.target.value === "dry-run")}>
        <FormControlLabel value="dry-run" control={<Radio color="primary" />} label="Dry-run（只驗證，不寄信）" />
        <FormControlLabel value="real" control={<Radio color="secondary" />} label="真實寄信" />
      </RadioGroup>
      {!dryRun && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Alert severity="warning">真實寄信會將工作加入寄送佇列，並寄至下方預覽的實際收件人。{["schedule", "reminder"].includes(purpose) ? " 本通知會以單封 BCC 寄給所有人。" : ""}</Alert>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              label="SMTP userid"
              value={smtpUserid}
              onChange={(event) => setSmtpUserid(event.target.value)}
              helperText="例如 B00123456（可不含 @ntu.edu.tw）"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              type="password"
              autoComplete="new-password"
              label="SMTP password"
              value={smtpPassword}
              onChange={(event) => setSmtpPassword(event.target.value)}
              helperText="只會加密保存於本次 job，不會顯示於報告或 log"
            />
          </Grid>
        </Grid>
      )}
      {purpose === "account" && <><FormControlLabel control={<Checkbox checked={generatePasswords} onChange={(e) => { setGeneratePasswords(e.target.checked); if (!e.target.checked) setUpdatePasswords(false); }} />} label="為每位收件人產生密碼" /><FormControlLabel control={<Checkbox disabled={!generatePasswords} checked={updatePasswords} onChange={(e) => setUpdatePasswords(e.target.checked)} />} label="寄送成功後才更新該學生密碼" /></>}
      <br/><Button size="large" color="primary" variant="contained" disabled={busy} onClick={requestSend}>{dryRun ? "執行 Dry-run" : "建立寄信工作並開始寄送"}</Button>
      {result && <Typography>結果：總計 {result.total || 0}、已寄 {result.sent || 0}、失敗 {result.failed || 0}、略過 {result.skipped || 0}</Typography>}
    </Paper>

    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}><DialogTitle>確認真實寄送</DialogTitle><DialogContent><DialogContentText>
      來源：{sourceSummary}<br/>人數：{recipientCount}<br/>模板：{key} — {template.subject}<br/>密碼模式：{generatePasswords ? (updatePasswords ? "產生，且每封成功後更新" : "僅產生於信件") : "不產生 / 不更新"}<br/>SMTP userid：{smtpUserid || "未填"}<br/>Override：{recipientOverride || "關閉"}
    </DialogContentText>{recipientCount > 50 && !recipientOverride && <FormControlLabel control={<Checkbox checked={largeConfirmed} onChange={(e) => setLargeConfirmed(e.target.checked)} />} label={`我確認要寄送 ${recipientCount} 位真實收件人（超過 50 人）`} />}</DialogContent><DialogActions><Button onClick={() => setConfirmOpen(false)}>取消</Button><Button color="primary" variant="contained" disabled={recipientCount > 50 && !recipientOverride && !largeConfirmed} onClick={send}>確認建立工作</Button></DialogActions></Dialog>
    <Snackbar open={alert.open} autoHideDuration={6000} onClose={() => setAlert({ ...alert, open: false })}><Alert variant="filled" severity={alert.severity || "info"}>{alert.message}</Alert></Snackbar>
  </div>;
}
