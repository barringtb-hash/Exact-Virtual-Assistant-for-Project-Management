const ROOT_PATH = "";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function joinPath(segments = []) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return ROOT_PATH;
  }
  return segments.join(".");
}

function isPathLocked(locks = {}, segments = []) {
  if (!locks || !Array.isArray(segments) || segments.length === 0) {
    return false;
  }

  let current = "";
  for (const segment of segments) {
    current = current ? `${current}.${segment}` : `${segment}`;
    if (locks[current]) {
      return true;
    }
  }

  return false;
}

function expandPathsWithAncestors(paths = []) {
  const set = new Set();
  paths.forEach((path) => {
    if (!path) return;
    const segments = path.split(".").filter(Boolean);
    for (let index = 1; index <= segments.length; index += 1) {
      set.add(segments.slice(0, index).join("."));
    }
  });
  return set;
}

function mergeRecursive(currentValue, nextValue, segments, locks, touchedPaths) {
  if (isPathLocked(locks, segments)) {
    return currentValue;
  }

  if (Array.isArray(nextValue)) {
    const currentArray = Array.isArray(currentValue) ? currentValue : [];
    const result = currentArray.slice();

    for (let index = 0; index < nextValue.length; index += 1) {
      const childSegments = [...segments, String(index)];
      result[index] = mergeRecursive(
        currentArray[index],
        nextValue[index],
        childSegments,
        locks,
        touchedPaths
      );
    }

    for (let index = result.length - 1; index >= nextValue.length; index -= 1) {
      const childSegments = [...segments, String(index)];
      if (!isPathLocked(locks, childSegments)) {
        result.splice(index, 1);
        const removedPath = joinPath(childSegments);
        if (removedPath) {
          touchedPaths.add(removedPath);
        }
      }
    }

    const path = joinPath(segments);
    if (path) {
      touchedPaths.add(path);
    }

    return result;
  }

  if (isPlainObject(nextValue)) {
    const currentObject = isPlainObject(currentValue) ? currentValue : {};
    const result = { ...currentObject };

    for (const [key, value] of Object.entries(nextValue)) {
      const childSegments = [...segments, key];
      result[key] = mergeRecursive(
        currentObject[key],
        value,
        childSegments,
        locks,
        touchedPaths
      );
    }

    const path = joinPath(segments);
    if (path) {
      touchedPaths.add(path);
    }

    return result;
  }

  if (typeof nextValue === "undefined") {
    return currentValue;
  }

  const path = joinPath(segments);
  if (path) {
    touchedPaths.add(path);
  }

  return nextValue;
}

export function mergeIntoDraftWithLocks(currentDraft, incomingDraft, locks = {}) {
  if (!isPlainObject(incomingDraft) && !Array.isArray(incomingDraft)) {
    return {
      draft: currentDraft ?? incomingDraft,
      touchedPaths: new Set(),
      updatedPaths: new Set(),
    };
  }

  const baseDraft =
    isPlainObject(currentDraft) || Array.isArray(currentDraft) ? currentDraft : {};

  const touchedPaths = new Set();
  const merged = mergeRecursive(baseDraft, incomingDraft, [], locks, touchedPaths);
  const filtered = [...touchedPaths].filter((path) => {
    if (!path) return false;
    const segments = path.split(".").filter(Boolean);
    return !isPathLocked(locks, segments);
  });

  return {
    draft: merged,
    touchedPaths: new Set(filtered),
    updatedPaths: expandPathsWithAncestors(filtered),
  };
}

export function mergeExtractedDraft(currentDraft, extractedDraft, locks = {}) {
  return mergeIntoDraftWithLocks(currentDraft, extractedDraft, locks).draft;
}

export { isPathLocked, expandPathsWithAncestors };

export default mergeIntoDraftWithLocks;
