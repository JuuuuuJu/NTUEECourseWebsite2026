import React, { useEffect, useState } from "react";
import {
  Typography,
  Container,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { ResultAPI } from "../../api";
import ResultTable from "./ResultTable";

const useStyles = makeStyles((theme) => ({
  section: { marginTop: theme.spacing(4) },
  hint: { marginTop: theme.spacing(2) },
  table: {
    marginTop: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
}));

function AdmissionTable({ admissions }) {
  const classes = useStyles();
  return (
    <TableContainer component={Paper} className={classes.table}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>課程</TableCell>
            <TableCell>錄取</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {admissions.map(({ _id, courseName, optionName }) => (
            <TableRow key={_id}>
              <TableCell>{courseName}</TableCell>
              <TableCell>{optionName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const admissionHint = (phase, admissions) => {
  if (phase === "selecting") return "選課結束後公布分發結果";
  if (!admissions.length) return "尚未公布分發結果，或本次未錄取任何課程";
  return "";
};

export default function Result() {
  const classes = useStyles();
  const [data, setData] = useState(null);
  useEffect(() => {
    ResultAPI.getResult()
      .then((res) => setData(res.data))
      .catch(() => setData({ phase: "error", admissions: [], selections: [], coursesId2Name: {} }));
  }, []);

  if (!data) return null;
  const { phase, admissions, selections, coursesId2Name } = data;

  if (phase === "error") {
    return (
      <Container maxWidth="md">
        <Typography variant="h5">無法取得結果，請重新登入後再試</Typography>
      </Container>
    );
  }
  if (phase === "not-open" && !selections.length) {
    return (
      <Container maxWidth="md">
        <Typography variant="h5">選課尚未開始</Typography>
      </Container>
    );
  }

  const hint = admissionHint(phase, admissions);
  return (
    <Container maxWidth="md">
      <Typography variant="h5">錄取結果</Typography>
      {hint ? (
        <Typography className={classes.hint} color="textSecondary">
          {hint}
        </Typography>
      ) : (
        <AdmissionTable admissions={admissions} />
      )}

      <Typography variant="h5" className={classes.section}>
        我的志願
      </Typography>
      {selections.length ? (
        <ResultTable result={selections} id2Name={coursesId2Name} />
      ) : (
        <Typography className={classes.hint} color="textSecondary">
          沒有志願紀錄
        </Typography>
      )}
    </Container>
  );
}
