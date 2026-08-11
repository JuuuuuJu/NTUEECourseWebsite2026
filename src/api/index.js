import axios from "axios";
import qs from "qs";

const errorHandling = (error) => {
  if (error.response.status === 403) window.location.replace("/");
};

export const SessionAPI = {
  getSession: () => axios.get(`/api/session`),
  postSession: (userID, password) =>
    axios.post(
      `/api/session`,
      qs.stringify({
        userID,
        password,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    ),
  deleteSession: () => axios.delete(`/api/session`),
};

export const CourseAPI = {
  getCourses: () =>
    axios
      .get(`/api/courses?name&type&description&options&number&students`)
      .catch((error) => errorHandling(error)),
  postCourse: (course) =>
    axios.post(`/api/course`, [course]).catch((error) => errorHandling(error)),
  deleteCourse: (id) =>
    axios
      .delete(`/api/course`, { data: [id] })
      .catch((error) => errorHandling(error)),
  putCourse: (course) =>
    axios.put(`/api/course`, [course]).catch((error) => errorHandling(error)),
  exportCourses: () =>
    axios.get("/api/exportCourses.json").catch((error) => errorHandling(error)),
  importCourses: (courses) =>
    axios
      .post(`/api/importCourses`, courses)
      .catch((error) => errorHandling(error)),
};

export const StudentDataAPI = {
  getStudentData: () =>
    axios
      .get(`/api/users`, {
        params: {
          name: 1,
          grade: 1,
          authority: 1,
        },
      })
      .catch((error) => errorHandling(error)),
  postStudentData: (users) =>
    axios.post(`/api/users`, users).catch((error) => errorHandling(error)),
  deleteStudentData: (ids) =>
    axios
      .delete(`/api/users`, { data: [...ids] })
      .catch((error) => errorHandling(error)),
  putStudentData: (user) =>
    axios.put(`/api/users`, user).catch((error) => errorHandling(error)),
};

export const PasswordAPI = {
  putPassword: (passwords) =>
    axios
      .put(`/api/password`, passwords)
      .catch((error) => errorHandling(error)),
};

export const SelectAPI = {
  getSelections: (courseID) => axios.get(`/api/selections/${courseID}`),
  putSelections: (courseID, data) =>
    axios.put(`/api/selections/${courseID}`, [...data]),
  getSelectionCheckpoint: (courseID) =>
    axios.get(`/api/selection_checkpoint/${courseID}`),
  putSelectionCheckpoint: (courseID, data) =>
    axios.put(`/api/selection_checkpoint/${courseID}`, data),
  deleteSelectionCheckpoint: (courseID) =>
    axios.delete(`/api/selection_checkpoint/${courseID}`),
};

export const DigitalLabAPI = {
  getGroup: (courseID) => axios.get(`/api/digital-lab-group/${courseID}`),
  createGroup: (courseID) => axios.post(`/api/digital-lab-group/${courseID}`),
  joinGroup: (courseID, code) =>
    axios.post(`/api/digital-lab-group/${courseID}/join`, { code }),
  leaveGroup: (courseID) => axios.delete(`/api/digital-lab-group/${courseID}`),
};

export const BackupAPI = {
  create: () => axios.post("/api/db-backups"),
  list: () => axios.get("/api/db-backups"),
  remove: (filename) =>
    axios.delete(`/api/db-backups/${encodeURIComponent(filename)}`),
  download: (filename) =>
    axios.get(`/api/db-backups/${encodeURIComponent(filename)}/download`, {
      responseType: "blob",
    }),
};

export const DistributeAPI = {
  // postDistribute: () => axios.post(`/api/distribute`),
  postDistribute: () => axios.post(`/api/new_distribute`),
  putPreselect: (ids) =>
    axios.put(`/api/preselect`, ids).catch((error) => errorHandling(error)),
  getResult: () => axios.get(`/api/result.csv`),
  getStatistics: () => axios.get(`/api/statistics.csv`),
  resetSelection: () => axios.delete("/api/reset_selection"),
};

export const OpentimeAPI = {
  getOpentime: () => axios.get(`/api/opentime`),
  putOpentime: (start, end) =>
    axios
      .put(`/api/opentime`, { start, end })
      .catch((error) => errorHandling(error)),
};

export const ResultAPI = {
  getResult: () =>
    axios.get("/api/result").catch((error) => errorHandling(error)),
};

export const SampleAPI = {
  getSample: (userID) =>
    axios
      .get("/api/sample", { params: { userID } })
      .catch((error) => errorHandling(error)),
};

export const EmailAPI = {
  getTemplates: () => axios.get("/api/email-templates"),
  getTemplate: (key) => axios.get(`/api/email-templates/${key}`),
  putTemplate: (key, template) =>
    axios.put(`/api/email-templates/${key}`, template),
  previewTemplate: (key, data) =>
    axios.post(`/api/email-templates/${key}/preview`, data),
  sendEmail: (data) => axios.post("/api/email-send", data),
  previewRecipients: (data) => axios.post("/api/email-recipients/preview", data),
  getJobs: (history = false) => axios.get("/api/email-jobs", { params: { history: history ? 1 : 0 } }),
  getJob: (id) => axios.get(`/api/email-jobs/${id}`),
  acknowledgeJob: (id) => axios.post(`/api/email-jobs/${id}/acknowledge`),
  reportUrl: (id) => `/api/email-jobs/${id}/report.csv`,
  passwordReportUrl: (id) => `/api/email-jobs/${id}/passwords.csv`,
};
