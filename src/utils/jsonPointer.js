const ESCAPE_TILDE = /~/g;
const ESCAPE_SLASH = /\//g;
const UNESCAPE_SLASH = /~1/g;
const UNESCAPE_TILDE = /~0/g;

function escapeSegment(segment) {
  if (segment === undefined || segment === null) {
    return "";
  }
  const stringValue = String(segment);
  return stringValue.replace(ESCAPE_TILDE, "~0").replace(ESCAPE_SLASH, "~1");
}

function unescapeSegment(segment) {
  if (segment === undefined || segment === null) {
    return "";
  }
  const stringValue = String(segment);
  return stringValue.replace(UNESCAPE_SLASH, "/").replace(UNESCAPE_TILDE, "~");
}

export function pointerToSegments(pointer) {
  if (typeof pointer !== "string") {
    return [];
  }
  const trimmed = pointer.startsWith("/") ? pointer.slice(1) : pointer;
  if (!trimmed) {
    return [];
  }
  return trimmed.split("/").map((segment) => unescapeSegment(segment));
}

export function segmentsToPointer(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return "";
  }
  return `/${segments.map((segment) => escapeSegment(segment)).join("/")}`;
}

export function pathToPointer(path) {
  if (path == null) {
    return "";
  }
  if (typeof path === "string" && path.startsWith("/")) {
    const normalizedSegments = pointerToSegments(path);
    if (normalizedSegments.length === 0) {
      return "";
    }
    return segmentsToPointer(normalizedSegments);
  }
  const segments = Array.isArray(path)
    ? path.map((segment) => String(segment))
    : String(path)
        .split(".")
        .map((segment) => segment.trim())
        .filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  return segmentsToPointer(segments);
}

export function pointerToPath(pointer) {
  const segments = pointerToSegments(pointer);
  if (segments.length === 0) {
    return "";
  }
  return segments.join(".");
}

export function normalizePointerInput(paths) {
  const result = [];
  if (!paths) {
    return result;
  }

  const addPointer = (entry) => {
    if (typeof entry !== "string") {
      return;
    }
    const pointer = pathToPointer(entry);
    if (pointer) {
      result.push(pointer);
    }
  };

  if (typeof paths === "string") {
    addPointer(paths);
    return result;
  }

  if (paths instanceof Set) {
    paths.forEach((entry) => addPointer(entry));
    return result;
  }

  if (Array.isArray(paths)) {
    paths.forEach((entry) => addPointer(entry));
  }

  return result;
}

export function pointerSetToPathSet(collection) {
  const result = new Set();
  if (!collection) {
    return result;
  }

  if (collection instanceof Set) {
    collection.forEach((pointer) => {
      if (typeof pointer !== "string") {
        return;
      }
      const path = pointerToPath(pointer);
      if (path) {
        result.add(path);
      }
    });
    return result;
  }

  if (Array.isArray(collection)) {
    collection.forEach((pointer) => {
      if (typeof pointer !== "string") {
        return;
      }
      const path = pointerToPath(pointer);
      if (path) {
        result.add(path);
      }
    });
  }

  return result;
}

export function pointerMapToPathObject(collection) {
  const result = {};
  if (!collection) {
    return result;
  }

  if (collection instanceof Map) {
    collection.forEach((value, pointer) => {
      if (typeof pointer !== "string") {
        return;
      }
      const path = pointerToPath(pointer);
      if (path) {
        result[path] = value;
      }
    });
    return result;
  }

  if (typeof collection === "object") {
    for (const [pointer, value] of Object.entries(collection)) {
      if (typeof pointer !== "string") {
        continue;
      }
      const path = pointerToPath(pointer);
      if (path) {
        result[path] = value;
      }
    }
  }

  return result;
}

export function pointerMapToPathMap(collection) {
  const result = new Map();
  if (!collection) {
    return result;
  }

  if (collection instanceof Map) {
    collection.forEach((value, pointer) => {
      if (typeof pointer !== "string") {
        return;
      }
      const path = pointerToPath(pointer);
      if (path) {
        result.set(path, value);
      }
    });
    return result;
  }

  if (typeof collection === "object") {
    for (const [pointer, value] of Object.entries(collection)) {
      if (typeof pointer !== "string") {
        continue;
      }
      const path = pointerToPath(pointer);
      if (path) {
        result.set(path, value);
      }
    }
  }

  return result;
}

export function pointerAncestors(pointer) {
  const segments = pointerToSegments(pointer);
  const result = new Set();
  if (segments.length === 0) {
    return result;
  }
  for (let index = 1; index <= segments.length; index += 1) {
    result.add(segmentsToPointer(segments.slice(0, index)));
  }
  return result;
}

export default {
  pathToPointer,
  pointerToPath,
  pointerToSegments,
  segmentsToPointer,
  normalizePointerInput,
  pointerSetToPathSet,
  pointerMapToPathObject,
  pointerMapToPathMap,
  pointerAncestors,
};
