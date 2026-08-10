import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  makeStyles,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  TextField,
  Typography,
} from "@material-ui/core";
import { Alert } from "@material-ui/lab";

import { EmailAPI, StudentDataAPI } from "../../api";

const categories = [
  { key: "ten-select-two", label: "十選二" },
  { key: "ee-lab", label: "電電實驗" },
];
const purposes = [
  { key: "schedule", label: "時程通知" },
  { key: "account", label: "帳密通知" },
  { key: "reminder", label: "未選通知" },
  { key: "result", label: "結果通知" },
];

const useStyles = makeStyles((theme) => ({
  root: { maxWidth: 1280, margin: "auto" },
  section: { padding: theme.spacing(2), marginBottom: theme.spacing(2) },
  selector: { marginBottom: theme.spacing(1) },
  editor: { fontFamily: "monospace" },
  variables: { display: "flex", gap: theme.spacing(1), flexWrap: "wrap" },
  recipients: { maxHeight: 320, overflow: "auto" },
  preview: { width: "100%", minHeight: 320, border: 0, background: "white" },
  summary: {
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    overflowX: "auto",
  },
  fileInput: { display: "none" },
}));

const initialTemplate = { subject: "", senderName: "", body: "" };
const initialVariables = {
  websiteUrl: "https://course.ntuee.org/",
  contactEmail: "ntueesaad2@gmail.com",
  openTimeText: "",
  importantLinks: "",
};

const selectMenuProps = {
  getContentAnchorEl: null,
  anchorOrigin: { vertical: "bottom", horizontal: "left" },
  transformOrigin: { vertical: "top", horizontal: "left" },
};

const getErrorMessage = (error) =>
  error.response?.data?.error || error.message || "操作失敗";

export default function EmailManagement() {
  const classes = useStyles();
  const [category, setCategory] = useState("ten-select-two");
  const [purpose, setPurpose] = useState("account");
  const [templates, setTemplates] = useState({});
  const [template, setTemplate] = useState(initialTemplate);
  const [builtIns, setBuiltIns] = useState([]);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [csvRows, setCsvRows] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [variables, setVariables] = useState(initialVariables);
  const [smtpUserid, setSmtpUserid] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [generatePasswords, setGeneratePasswords] = useState(false);
  const [updatePasswords, setUpdatePasswords] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false });
  const activeEditor = useRef("body");
  const key = `${category}.${purpose}`;

  const showAlert = (severity, message) =>
    setAlert({ open: true, severity, message });

  const load = async () => {
    setBusy(true);
    try {
      const [templateResponse, studentResponse] = await Promise.all([
        EmailAPI.getTemplates(),
        StudentDataAPI.getStudentData(),
      ]);
      const byKey = Object.fromEntries(
        templateResponse.data.templates.map((item) => [item.key, item])
      );
      setTemplates(byKey);
      setTemplate(byKey[key] || initialTemplate);
      setBuiltIns(templateResponse.data.builtInVariables || []);
      setVariables({
        ...initialVariables,
        ...(templateResponse.data.defaultValues || {}),
      });
      setStudents(studentResponse.data || []);
    } catch (error) {
      showAlert("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // Initial page load only; selectors switch the cached template below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (templates[key]) setTemplate(templates[key]);
    setPreview(null);
    setResult(null);
    if (purpose !== "account") {
      setGeneratePasswords(false);
      setUpdatePasswords(false);
    }
  }, [key, templates, purpose]);

  const availableVariables = useMemo(
    () => [...new Set([...builtIns, ...csvHeaders])],
    [builtIns, csvHeaders]
  );
  const visibleStudents = students.filter((student) =>
    `${student.id} ${student.name}`.toLowerCase().includes(search.toLowerCase())
  );

  const saveTemplate = async () => {
    setBusy(true);
    try {
      const response = await EmailAPI.putTemplate(key, template);
      setTemplates((old) => ({ ...old, [key]: response.data }));
      setTemplate(response.data);
      showAlert("success", "模板已儲存");
    } catch (error) {
      showAlert("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const sampleRecipient = () => {
    const selectedStudent = students.find((student) =>
      selected.includes(student.id)
    );
    return {
      userID: selectedStudent?.id || "B12345678",
      account: selectedStudent?.id || "B12345678",
      email: `${selectedStudent?.id || "B12345678"}@ntu.edu.tw`,
      name: selectedStudent?.name || "王小明",
      password: purpose === "account" ? "sample-password" : undefined,
      ...(csvRows[0] || {}),
    };
  };

  const renderPreview = async () => {
    setBusy(true);
    try {
      const response = await EmailAPI.previewTemplate(key, {
        subject: template.subject,
        senderName: template.senderName,
        body: template.body,
        recipient: sampleRecipient(),
        variables,
      });
      setPreview(response.data);
      showAlert("success", "預覽已更新");
    } catch (error) {
      showAlert("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCsv = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: ({ data, meta, errors }) => {
        if (errors.length || !meta.fields?.length) {
          showAlert("error", "CSV 格式無效，第一列必須是欄位名稱");
          return;
        }
        const hasIdentity = meta.fields.some((field) =>
          ["userID", "account", "email"].includes(field)
        );
        if (!hasIdentity) {
          showAlert("error", "CSV 必須包含 userID、account 或 email 欄位");
          return;
        }
        setCsvRows(data);
        setCsvHeaders(meta.fields);
        showAlert("success", `已載入 ${data.length} 筆 CSV 收件人`);
      },
    });
  };

  const insertVariable = (variable) => {
    const field = activeEditor.current;
    const insertion = `{{${variable}}}`;
    setTemplate((old) => ({
      ...old,
      [field]: `${old[field] || ""}${insertion}`,
    }));
  };

  const copyVariable = async (variable) => {
    await navigator.clipboard.writeText(`{{${variable}}}`);
    showAlert("info", `已複製 {{${variable}}}`);
  };

  const send = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const response = await EmailAPI.sendEmail({
        templateKey: key,
        selectedUserIDs: selected,
        csvRows,
        smtp: { userid: smtpUserid, password: smtpPassword },
        dryRun,
        generatePasswords,
        updatePasswords,
        variables,
      });
      setResult(response.data);
      setSmtpPassword("");
      showAlert(
        "success",
        dryRun ? "Dry-run 完成，未寄信且未更新密碼" : "寄信作業完成"
      );
    } catch (error) {
      setResult(error.response?.data || null);
      setSmtpPassword("");
      showAlert("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const requestSend = () => {
    if (!selected.length && !csvRows.length) {
      showAlert("error", "請選擇網站學生或匯入 CSV 收件人");
      return;
    }
    if (dryRun) send();
    else setConfirmOpen(true);
  };

  return (
    <div className={classes.root}>
      <Typography variant="h4" gutterBottom>
        寄信管理 / Email Management
      </Typography>
      <Paper className={classes.section}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl
              className={classes.selector}
              fullWidth
              margin="normal"
              variant="outlined"
            >
              <InputLabel id="email-category-label">類別</InputLabel>
              <Select
                id="email-category"
                labelId="email-category-label"
                label="類別"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                MenuProps={selectMenuProps}
              >
                {categories.map((item) => (
                  <MenuItem key={item.key} value={item.key}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl
              className={classes.selector}
              fullWidth
              margin="normal"
              variant="outlined"
            >
              <InputLabel id="email-purpose-label">用途</InputLabel>
              <Select
                id="email-purpose"
                labelId="email-purpose-label"
                label="用途"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                MenuProps={selectMenuProps}
              >
                {purposes.map((item) => (
                  <MenuItem key={item.key} value={item.key}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="主旨"
              value={template.subject || ""}
              onFocus={() => {
                activeEditor.current = "subject";
              }}
              onChange={(e) =>
                setTemplate({ ...template, subject: e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="寄件者顯示名稱"
              value={template.senderName || ""}
              onChange={(e) =>
                setTemplate({ ...template, senderName: e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={12}
              variant="outlined"
              label="完整信件內容（可使用 HTML）"
              className={classes.editor}
              value={template.body || ""}
              onFocus={() => {
                activeEditor.current = "body";
              }}
              onChange={(e) =>
                setTemplate({ ...template, body: e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle1">可用變數</Typography>
            <div className={classes.variables}>
              {availableVariables.map((variable) => (
                <span key={variable}>
                  <Chip
                    label={`{{${variable}}}`}
                    onClick={() => insertVariable(variable)}
                  />
                  <Button size="small" onClick={() => copyVariable(variable)}>
                    複製
                  </Button>
                </span>
              ))}
            </div>
          </Grid>
          {Object.keys(initialVariables).map((variable) => (
            <Grid item xs={12} sm={6} key={variable}>
              <TextField
                fullWidth
                label={variable}
                value={variables[variable]}
                onChange={(e) =>
                  setVariables({ ...variables, [variable]: e.target.value })
                }
              />
            </Grid>
          ))}
          <Grid item>
            <Button
              color="primary"
              variant="contained"
              disabled={busy}
              onClick={saveTemplate}
            >
              儲存模板
            </Button>
          </Grid>
          <Grid item>
            <Button variant="outlined" disabled={busy} onClick={renderPreview}>
              更新預覽
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper className={classes.section}>
        <Typography variant="h6" gutterBottom>
          信件預覽
        </Typography>
        {preview ? (
          <>
            <Typography>From: {preview.senderName}</Typography>
            <Typography>To: {preview.to}</Typography>
            <Typography>Subject: {preview.subject}</Typography>
            <iframe
              title="Email preview"
              sandbox=""
              className={classes.preview}
              srcDoc={preview.html}
            />
          </>
        ) : (
          <Typography color="textSecondary">
            選擇範例收件人後按「更新預覽」。
          </Typography>
        )}
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper className={classes.section}>
            <Typography variant="h6">
              網站學生（已選 {selected.length} 人）
            </Typography>
            <TextField
              fullWidth
              label="搜尋學號或姓名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <List dense className={classes.recipients}>
              {visibleStudents.map((student) => (
                <ListItem
                  button
                  key={student.id}
                  onClick={() =>
                    setSelected((old) =>
                      old.includes(student.id)
                        ? old.filter((id) => id !== student.id)
                        : [...old, student.id]
                    )
                  }
                >
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={selected.includes(student.id)}
                    />
                  </ListItemIcon>
                  <ListItemText primary={`${student.id} — ${student.name}`} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper className={classes.section}>
            <Typography variant="h6">CSV 收件人</Typography>
            <Typography color="textSecondary">
              第一列需為欄位名稱，且包含 userID、account 或
              email。其他欄位會成為模板變數。
            </Typography>
            <input
              className={classes.fileInput}
              id="email-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleCsv(e.target.files[0])}
            />
            <label htmlFor="email-csv">
              <Button component="span" variant="outlined">
                匯入 CSV
              </Button>
            </label>
            <Button
              onClick={() => {
                setCsvRows([]);
                setCsvHeaders([]);
              }}
            >
              清除 CSV
            </Button>
            <Typography>
              {csvRows.length} 筆；欄位：{csvHeaders.join(", ") || "無"}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper className={classes.section}>
        <Typography variant="h6">寄送設定</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="SMTP userid"
              value={smtpUserid}
              onChange={(e) => setSmtpUserid(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="password"
              autoComplete="new-password"
              label="SMTP password（不儲存）"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
              }
              label="Dry-run（只驗證與渲染，不寄信、不更新密碼）"
            />
          </Grid>
          {purpose === "account" && (
            <>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={generatePasswords}
                      onChange={(e) => setGeneratePasswords(e.target.checked)}
                    />
                  }
                  label="由後端產生新密碼，寄送成功後更新學生密碼"
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={updatePasswords}
                      disabled={generatePasswords}
                      onChange={(e) => setUpdatePasswords(e.target.checked)}
                    />
                  }
                  label="使用 CSV password，寄送成功後更新相符學生密碼"
                />
              </Grid>
            </>
          )}
          <Grid item xs={12}>
            <Button
              color="primary"
              variant="contained"
              disabled={busy}
              onClick={requestSend}
            >
              {dryRun ? "執行 Dry-run" : "寄送信件"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {result && (
        <Paper className={classes.section}>
          <Typography variant="h6">結果摘要</Typography>
          <Typography>
            Total {result.total || 0} / Sent {result.sent || 0} / Failed{" "}
            {result.failed || 0} / Skipped {result.skipped || 0} / Dry-run{" "}
            {result.dryRun || 0}
          </Typography>
          <pre className={classes.summary}>
            {JSON.stringify(result.statuses || [], null, 2)}
          </pre>
        </Paper>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>確認寄送真實信件</DialogTitle>
        <DialogContent>
          <DialogContentText>
            即將處理 {selected.length + csvRows.length}{" "}
            筆收件人。寄送成功的帳密信可能同時更新學生登入密碼；此操作無法由系統自動復原。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button color="primary" variant="contained" onClick={send}>
            確認寄送
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={alert.open}
        autoHideDuration={6000}
        onClose={() => setAlert({ ...alert, open: false })}
      >
        <Alert variant="filled" severity={alert.severity || "info"}>
          {alert.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
