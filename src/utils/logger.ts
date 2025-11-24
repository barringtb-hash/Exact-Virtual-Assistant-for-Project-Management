/**
 * Centralized logging utility for frontend
 * Provides structured logging with environment-based filtering
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Determines if we're in development mode
 */
function isDevelopment(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.DEV === true || import.meta.env.MODE === 'development';
  }
  return false;
}

/**
 * Gets the minimum log level from environment
 */
function getMinLogLevel(): LogLevel {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOG_LEVEL) {
    const level = import.meta.env.VITE_LOG_LEVEL.toLowerCase();
    if (level in LOG_LEVEL_PRIORITY) {
      return level as LogLevel;
    }
  }
  return isDevelopment() ? 'debug' : 'warn';
}

/**
 * Formats a log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
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
  private minLevel: LogLevel;
  private prefix: string;

  constructor(prefix: string = '') {
    this.minLevel = getMinLogLevel();
    this.prefix = prefix;
  }

  /**
   * Checks if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Creates a log entry
   */
  private createEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
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
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const formatted = formatLogEntry(entry);

    switch (entry.level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(formatted);
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.info(formatted);
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(formatted);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(formatted);
        break;
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.output(this.createEntry('debug', message, context));
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    this.output(this.createEntry('info', message, context));
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.output(this.createEntry('warn', message, context));
  }

  /**
   * Log an error message
   */
  error(message: string, context?: LogContext): void {
    this.output(this.createEntry('error', message, context));
  }

  /**
   * Log an error with the Error object
   */
  logError(message: string, error: unknown, context?: LogContext): void {
    const errorContext: LogContext = { ...context };

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
   */
  child(prefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger(childPrefix);
  }

  /**
   * Sets the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Creates a logger with a specific namespace
 */
export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

// Named loggers for common use cases
export const chatLogger = createLogger('chat');
export const audioLogger = createLogger('audio');
export const syncLogger = createLogger('sync');
export const apiLogger = createLogger('api');
export const stateLogger = createLogger('state');
