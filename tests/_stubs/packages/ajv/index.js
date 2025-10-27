class StubValidator {
  constructor(schema) {
    this.schema = schema || {};
    this.errors = null;
  }

  validate(data) {
    const errors = [];
    const required = Array.isArray(this.schema.required)
      ? this.schema.required
      : [];

    for (const key of required) {
      const value = data?.[key];
      if (value === undefined || value === null || value === "") {
        errors.push({ instancePath: `/${key}`, message: "is required" });
      }
    }

    if (data && typeof data.project_name === "string" && data.project_name.length < 3) {
      errors.push({ instancePath: "/project_name", message: "must NOT have fewer than 3 characters" });
    }

    this.errors = errors.length > 0 ? errors : null;
    return errors.length === 0;
  }
}

export default class Ajv {
  constructor() {}

  compile(schema) {
    const validatorInstance = new StubValidator(schema);
    const validator = (data) => validatorInstance.validate(data);
    Object.defineProperty(validator, "errors", {
      get() {
        return validatorInstance.errors;
      },
      set(value) {
        validatorInstance.errors = value;
      },
    });
    return validator;
  }
}
