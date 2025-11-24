const DEFAULT_INITIAL_VERSION = "1.0.0";

function parseVersion(version) {
  if (!version || typeof version !== "string") {
    return null;
  }
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function stringifyVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function incrementPatch(version) {
  return stringifyVersion({
    major: version.major,
    minor: version.minor,
    patch: version.patch + 1,
  });
}

export function computeNextVersion(records, requestedVersion) {
  if (requestedVersion) {
    const parsed = parseVersion(requestedVersion);
    if (!parsed) {
      throw new Error(
        `Requested version "${requestedVersion}" is not a valid semantic version (expected format: MAJOR.MINOR.PATCH).`
      );
    }
    return stringifyVersion(parsed);
  }

  const parsedRecords = (records || [])
    .map((record) => ({ record, parsed: parseVersion(record?.version) }))
    .filter((entry) => entry.parsed !== null);

  if (parsedRecords.length === 0) {
    return DEFAULT_INITIAL_VERSION;
  }

  parsedRecords.sort((a, b) => {
    if (a.parsed.major !== b.parsed.major) {
      return b.parsed.major - a.parsed.major;
    }
    if (a.parsed.minor !== b.parsed.minor) {
      return b.parsed.minor - a.parsed.minor;
    }
    return b.parsed.patch - a.parsed.patch;
  });

  return incrementPatch(parsedRecords[0].parsed);
}

export function compareVersions(a, b) {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA && !parsedB) return 0;
  if (!parsedA) return -1;
  if (!parsedB) return 1;

  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  return parsedA.patch - parsedB.patch;
}
