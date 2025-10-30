export const identity = (value) => value;

export const normalizeGenericDocument = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export default {
  identity,
  normalizeGenericDocument,
};
