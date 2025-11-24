/**
 * Centralized logging utility for server-side
 * Provides structured logging with environment-based filtering
 * @module server/utils/logger
 */

/**
 * @typedef {'debug' | 'info' | 'warn' | 'error'} LogLevel
 */

/**
 * @typedef {Object} LogContext
 * @property {*} [key] - Arbitrary context data
 */

/**
 * @typedef {Object} LogEntry
 * @property {LogLevel} level - Log level
 * @property {string} message - Log message
 * @property {string} timestamp - ISO timestamp
 * @property {LogContext} [context] - Optional context
 */

/**
 * Log level priorities for filtering
 * @type {Record<LogLevel, number>}
 */
const LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Gets the current environment
 * @returns {string}
 */
function getEnvironment() {
  const env =
    typeof globalThis?.process?.env !== "undefined"
      ? globalThis.process.env
      : {};
  return env.NODE_ENV || "development";
}

/**
 * Determines if we're in development mode
 * @returns {boolean}
 */
function isDevelopment() {
  return getEnvironment() === "development";
}

/**
 * Gets the minimum log level from environment
 * @returns {LogLevel}
 */
function getMinLogLevel() {
  const env =
    typeof globalThis?.process?.env !== "undefined"
      ? globalThis.process.env
      : {};
  const level = (env.LOG_LEVEL || "").toLowerCase();
  if (level in LOG_LEVEL_PRIORITY) {
    return /** @type {LogLevel} */ (level);
  }
  return isDevelopment() ? "debug" : "info";
}

/**
 * Formats a log entry for output
 * @param {LogEntry} entry - Log entry
 * @returns {string}
 */
function formatLogEntry(entry) {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  if (entry.context && Object.keys(entry.context).length > 0) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.context)}`;
  }
  return `${prefix} ${entry.message}`;
}

/**
 * Logger class with structured logging support
 */
class Logger {
  /**
   * @param {string} [prefix=''] - Logger namespace prefix
   */
  constructor(prefix = "") {
    /** @type {LogLevel} */
    this.minLevel = getMinLogLevel();
    /** @type {string} */
    this.prefix = prefix;
  }

  /**
   * Checks if a log level should be output
   * @param {LogLevel} level - Log level to check
   * @returns {boolean}
   */
  shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Creates a log entry
   * @param {LogLevel} level - Log level
   * @param {string} message - Log message
   * @param {LogContext} [context] - Optional context
   * @returns {LogEntry}
   */
  createEntry(level, message, context) {
    const fullMessage = this.prefix ? `[${this.prefix}] ${message}` : message;
    return {
      level,
      message: fullMessage,
      timestamp: new Date().toISOString(),
      context,
    };
  }

  /**
   * Outputs a log entry to the appropriate console method
   * @param {LogEntry} entry - Log entry
   */
  output(entry) {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const formatted = formatLogEntry(entry);

    switch (entry.level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {LogContext} [context] - Optional context
   */
  debug(message, context) {
    this.output(this.createEntry("debug", message, context));
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {LogContext} [context] - Optional context
   */
  info(message, context) {
    this.output(this.createEntry("info", message, context));
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {LogContext} [context] - Optional context
   */
  warn(message, context) {
    this.output(this.createEntry("warn", message, context));
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {LogContext} [context] - Optional context
   */
  error(message, context) {
    this.output(this.createEntry("error", message, context));
  }

  /**
   * Log an error with the Error object
   * @param {string} message - Log message
   * @param {unknown} error - Error object
   * @param {LogContext} [context] - Optional context
   */
  logError(message, error, context) {
    const errorContext = { ...context };

    if (error instanceof Error) {
      errorContext.errorName = error.name;
      errorContext.errorMessage = error.message;
      if (isDevelopment() && error.stack) {
        errorContext.stack = error.stack;
      }
    } else {
      errorContext.error = String(error);
    }

    this.error(message, errorContext);
  }

  /**
   * Creates a child logger with a specific prefix
   * @param {string} prefix - Logger prefix
   * @returns {Logger}
   */
  child(prefix) {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger(childPrefix);
  }

  /**
   * Sets the minimum log level
   * @param {LogLevel} level - New minimum log level
   */
  setLevel(level) {
    this.minLevel = level;
  }
}

/**
 * Default logger instance
 */
const logger = new Logger();

/**
 * Creates a logger with a specific namespace
 * @param {string} namespace - Logger namespace
 * @returns {Logger}
 */
function createLogger(namespace) {
  return new Logger(namespace);
}

// Named loggers for common use cases
const apiLogger = createLogger("api");
const extractionLogger = createLogger("extraction");
const validationLogger = createLogger("validation");
const charterLogger = createLogger("charter");
const documentLogger = createLogger("document");

module.exports = {
  Logger,
  logger,
  createLogger,
  apiLogger,
  extractionLogger,
  validationLogger,
  charterLogger,
  documentLogger,
};
