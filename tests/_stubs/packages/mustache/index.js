export default {
  render: (template, data) => {
    if (!template) {
      return "";
    }
    // Simple interpolation for testing; replace {{key}} with value
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
      const value = key.split(".").reduce((acc, part) => acc?.[part], data);
      return value == null ? "" : String(value);
    });
  },
};
