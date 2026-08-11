const CATEGORIES = ["ten-select-two", "ee-lab"];
const PURPOSES = ["schedule", "account", "reminder", "result"];
const TEMPLATE_KEYS = CATEGORIES.flatMap((category) =>
  PURPOSES.map((purpose) => `${category}.${purpose}`)
);

const BUILT_IN_VARIABLES = [
  "name",
  "account",
  "userID",
  "email",
  "password",
  "websiteUrl",
  "openTimeText",
  "contactEmail",
  "importantLinks",
];

const categoryNames = {
  "ten-select-two": "十選二",
  "ee-lab": "電電實驗",
};

const purposeNames = {
  schedule: "時程通知",
  account: "帳密通知",
  reminder: "未選通知",
  result: "結果通知",
};

const commonValues = {
  senderName: "臺大電機系學會學術部",
  updatedBy: "seed",
};

const bodies = {
  schedule:
    '<p>同學您好：</p>\n<p>{{categoryName}}預選時程為 {{openTimeText}}，請至 <a href="{{websiteUrl}}">預選網站</a> 完成操作。</p>\n<p>{{importantLinks}}</p>\n<p>如有問題請聯絡 {{contactEmail}}。本信由系統統一寄送，請勿直接回信。</p>',
  account:
    '<p>{{name}}同學您好：</p>\n<p>以下是{{categoryName}}預選系統帳號資訊：</p>\n<p>帳號：<b>{{account}}</b><br>密碼：<b>{{password}}</b></p>\n<p>請至 <a href="{{websiteUrl}}">預選網站</a> 參加預選，系統開放時間為 {{openTimeText}}。</p>\n<p>{{importantLinks}}</p>\n<p>如有問題請聯絡 {{contactEmail}}。本信由系統統一寄送，請勿直接回信。</p>',
  reminder:
    '<p>同學您好：</p>\n<p>系統尚未記錄到您完成{{categoryName}}預選，請於 {{openTimeText}} 前至 <a href="{{websiteUrl}}">預選網站</a> 確認並送出。</p>\n<p>{{importantLinks}}</p>\n<p>如有問題請聯絡 {{contactEmail}}。本信由系統統一寄送，請勿直接回信。</p>',
  result:
    '<p>{{name}}同學您好：</p>\n<p>{{categoryName}}預選結果已公布，請至 <a href="{{websiteUrl}}">預選網站</a> 查詢。</p>\n<p>{{importantLinks}}</p>\n<p>如有問題請聯絡 {{contactEmail}}。本信由系統統一寄送，請勿直接回信。</p>',
};

const DEFAULT_TEMPLATES = TEMPLATE_KEYS.map((key) => {
  const [category, purpose] = key.split(".");
  return {
    key,
    category,
    purpose,
    subject: `${categoryNames[category]}${purposeNames[purpose]}`,
    body: bodies[purpose]
      .split("{{categoryName}}")
      .join(categoryNames[category]),
    ...commonValues,
  };
});

const isTemplateKey = (key) => TEMPLATE_KEYS.includes(key);
const usesBccDelivery = (key) => /\.(schedule|reminder)$/.test(key || "");

module.exports = {
  BUILT_IN_VARIABLES,
  CATEGORIES,
  DEFAULT_TEMPLATES,
  PURPOSES,
  TEMPLATE_KEYS,
  isTemplateKey,
  usesBccDelivery,
};
