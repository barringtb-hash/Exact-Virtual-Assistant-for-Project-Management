const manifestLoaders = {
  charter: () => import("../../templates/charter/manifest.json"),
  ddp: () => import("../../templates/ddp/manifest.json"),
};

function normalizeManifestModule(module) {
  if (!module) {
    return null;
  }
  if (module.default) {
    return module.default;
  }
  return module;
}

export async function loadDocTypeManifest(type) {
  const normalized = typeof type === "string" ? type.trim() : "";
  if (!normalized) {
    return null;
  }
  const loader = manifestLoaders[normalized];
  if (typeof loader !== "function") {
    return null;
  }
  try {
    const module = await loader();
    return normalizeManifestModule(module);
  } catch (error) {
    console.error("Failed to load manifest for doc type", normalized, error);
    return null;
  }
}

export default loadDocTypeManifest;
