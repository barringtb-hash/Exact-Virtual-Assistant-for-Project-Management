const units = [
  { limit: 45, divisor: 1, unit: "second" },
  { limit: 2700, divisor: 60, unit: "minute" },
  { limit: 64800, divisor: 3600, unit: "hour" },
  { limit: 561600, divisor: 86400, unit: "day" },
  { limit: 2419200, divisor: 604800, unit: "week" },
  { limit: 29030400, divisor: 2592000, unit: "month" },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export default function formatRelativeTime(timestamp, { now = Date.now() } = {}) {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return "";
  }

  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 1) {
    return "just now";
  }

  for (const { limit, divisor, unit } of units) {
    if (absSeconds < limit) {
      const value = Math.round(diffSeconds / divisor);
      return rtf.format(value, unit);
    }
  }

  const years = Math.round(diffSeconds / 31536000);
  return rtf.format(years, "year");
}
