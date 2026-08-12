const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const ANY_PLACEHOLDER_PATTERN = /{{[\s\S]*?}}/g;

const extractVariables = (...values) => {
  const variables = new Set();
  values.forEach((value) => {
    String(value || "").replace(PLACEHOLDER_PATTERN, (_match, variable) => {
      variables.add(variable);
      return _match;
    });
  });
  return [...variables];
};

const missingVariables = (template, values) =>
  extractVariables(template.subject, template.body).filter(
    (variable) =>
      !Object.prototype.hasOwnProperty.call(values, variable) ||
      values[variable] === null ||
      values[variable] === undefined
  );

const renderString = (source, values) =>
  String(source || "").replace(PLACEHOLDER_PATTERN, (_match, variable) =>
    String(values[variable])
  );

const renderHtml = (source, values) =>
  renderString(source, values)
    // Formatting newlines between HTML tags are not visible content. Turning
    // them into <br> adds an extra blank line on top of block element margins.
    .replace(/>\s*</g, "><")
    .replace(/\r?\n/g, "<br>");

const renderTemplate = (template, values) => {
  const invalid = [
    ...`${template.subject || ""}${template.body || ""}`.matchAll(
      ANY_PLACEHOLDER_PATTERN
    ),
  ]
    .map((match) => match[0])
    .filter(
      (placeholder) =>
        !new RegExp(`^${PLACEHOLDER_PATTERN.source}$`).test(placeholder)
    );
  if (invalid.length) {
    const error = new Error(
      `Invalid template placeholders: ${invalid.join(", ")}`
    );
    error.code = "INVALID_PLACEHOLDERS";
    error.placeholders = invalid;
    throw error;
  }
  const missing = missingVariables(template, values);
  if (missing.length) {
    const error = new Error(
      `Missing template variables: ${missing.join(", ")}`
    );
    error.code = "MISSING_VARIABLES";
    error.variables = missing;
    throw error;
  }
  return {
    subject: renderString(template.subject, values),
    html: renderHtml(template.body, values),
  };
};

module.exports = { extractVariables, missingVariables, renderTemplate };
