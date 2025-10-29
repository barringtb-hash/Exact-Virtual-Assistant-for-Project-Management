const schemaLoaders = {
  ddp: () => import("../../templates/doc-types/ddp/schema.json"),
};

function normalizeSchemaModule(module) {
  if (!module) {
    return null;
  }
  if (module.default) {
    return module.default;
  }
  return module;
}

export async function loadDocTypeSchema(type) {
  const normalized = typeof type === "string" ? type.trim() : "";
  if (!normalized) {
    return null;
  }
  const loader = schemaLoaders[normalized];
  if (typeof loader !== "function") {
    return null;
  }
  try {
    const module = await loader();
    return normalizeSchemaModule(module);
  } catch (error) {
    console.error("Failed to load schema for doc type", normalized, error);
    return null;
  }
}

export default loadDocTypeSchema;
