import {
  pathToPointer,
  pointerAncestors,
  pointerToPath,
  pointerToSegments,
  segmentsToPointer,
} from "../../utils/jsonPointer.js";

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

function normalizeLocks(locks) {
  if (!locks) {
    return new Map();
  }
  if (locks instanceof Map) {
    return new Map(locks);
  }
  const map = new Map();

  const addPointer = (entry, value = true) => {
    if (typeof entry !== "string") {
      return;
    }
    const pointer = pathToPointer(entry);
    if (pointer) {
      map.set(pointer, value !== false && value != null);
    }
  };

  if (locks instanceof Set) {
    locks.forEach((entry) => addPointer(entry));
    return map;
  }

  if (Array.isArray(locks)) {
    locks.forEach((entry) => addPointer(entry));
    return map;
  }

  if (typeof locks === "object") {
    Object.entries(locks).forEach(([entry, value]) => addPointer(entry, value));
  }

  return map;
}

function hasLock(locksMap, pointer) {
  if (!locksMap || !(locksMap instanceof Map) || !pointer) {
    return false;
  }
  if (!locksMap.has(pointer)) {
    return false;
  }
  const value = locksMap.get(pointer);
  if (value === false || value === null) {
    return false;
  }
  return true;
}

function isPathLocked(locksMap, segments = []) {
  if (!locksMap || !(locksMap instanceof Map) || !Array.isArray(segments) || segments.length === 0) {
    return false;
  }

  for (let index = 1; index <= segments.length; index += 1) {
    const pointer = segmentsToPointer(segments.slice(0, index));
    if (hasLock(locksMap, pointer)) {
      return true;
    }
  }

  return false;
}

function isPointerLockedFromSegments(locksMap, pointerSegments = []) {
  if (!locksMap || !(locksMap instanceof Map) || !Array.isArray(pointerSegments)) {
    return false;
  }
  if (pointerSegments.length === 0) {
    return false;
  }

  for (let index = 1; index <= pointerSegments.length; index += 1) {
    const pointer = segmentsToPointer(pointerSegments.slice(0, index));
    if (hasLock(locksMap, pointer)) {
      return true;
    }
  }

  return false;
}

function expandPointersWithAncestors(pointers = []) {
  const set = new Set();
  if (!Array.isArray(pointers)) {
    return set;
  }

  pointers.forEach((pointer) => {
    if (typeof pointer !== "string") {
      return;
    }
    pointerAncestors(pointer).forEach((ancestor) => {
      if (ancestor) {
        set.add(ancestor);
      }
    });
  });

  return set;
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

function mergeRecursive(currentValue, nextValue, segments, locks, touchedPaths, touchedPointers) {
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
        touchedPaths,
        touchedPointers
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
        const removedPointer = segmentsToPointer(childSegments);
        if (removedPointer) {
          touchedPointers.add(removedPointer);
        }
      }
    }

    const path = joinPath(segments);
    if (path) {
      touchedPaths.add(path);
    }
    const pointer = segmentsToPointer(segments);
    if (pointer) {
      touchedPointers.add(pointer);
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
        touchedPaths,
        touchedPointers
      );
    }

    const path = joinPath(segments);
    if (path) {
      touchedPaths.add(path);
    }
    const pointer = segmentsToPointer(segments);
    if (pointer) {
      touchedPointers.add(pointer);
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
  const pointer = segmentsToPointer(segments);
  if (pointer) {
    touchedPointers.add(pointer);
  }

  return nextValue;
}

export function mergeIntoDraftWithLocks(
  currentDraft,
  incomingDraft,
  locks = {},
  { source = "AI", updatedAt } = {}
) {
  if (!isPlainObject(incomingDraft) && !Array.isArray(incomingDraft)) {
    return {
      draft: currentDraft ?? incomingDraft,
      touchedPaths: new Set(),
      touchedPointers: new Set(),
      updatedPaths: new Set(),
      updatedPointers: new Set(),
      metadataByPointer: new Map(),
      updatedAt: typeof updatedAt === "number" ? updatedAt : Date.now(),
    };
  }

  const baseDraft =
    isPlainObject(currentDraft) || Array.isArray(currentDraft) ? currentDraft : {};

  const locksMap = normalizeLocks(locks);
  const touchedPaths = new Set();
  const touchedPointers = new Set();
  const merged = mergeRecursive(
    baseDraft,
    incomingDraft,
    [],
    locksMap,
    touchedPaths,
    touchedPointers
  );

  const filteredPointers = [...touchedPointers].filter((pointer) => {
    if (!pointer) {
      return false;
    }
    const segments = pointerToSegments(pointer);
    return !isPointerLockedFromSegments(locksMap, segments);
  });

  const filteredPaths = filteredPointers
    .map((pointer) => pointerToPath(pointer))
    .filter(Boolean);

  const timestamp =
    typeof updatedAt === "number" && !Number.isNaN(updatedAt) ? updatedAt : Date.now();
  const metadataByPointer = new Map();
  filteredPointers.forEach((pointer) => {
    metadataByPointer.set(pointer, {
      source,
      updatedAt: timestamp,
    });
  });

  const updatedPointerAncestors = expandPointersWithAncestors(filteredPointers);
  const updatedPaths = new Set();
  updatedPointerAncestors.forEach((pointer) => {
    const path = pointerToPath(pointer);
    if (path) {
      updatedPaths.add(path);
    }
  });

  return {
    draft: merged,
    touchedPaths: new Set(filteredPaths),
    touchedPointers: new Set(filteredPointers),
    updatedPaths,
    updatedPointers: updatedPointerAncestors,
    metadataByPointer,
    updatedAt: timestamp,
  };
}

export function mergeExtractedDraft(currentDraft, extractedDraft, locks = {}) {
  return mergeIntoDraftWithLocks(currentDraft, extractedDraft, locks).draft;
}

export { expandPathsWithAncestors };

export default mergeIntoDraftWithLocks;
