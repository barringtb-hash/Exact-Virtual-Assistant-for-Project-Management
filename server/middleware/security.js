/**
 * Security Middleware
 *
 * Provides authentication, authorization, rate limiting, and CSRF protection
 * for API endpoints. This module addresses CRIT-01, CRIT-02, CRIT-03, HIGH-01, HIGH-05.
 *
 * @module server/middleware/security
 */

import crypto from "crypto";

// ============================================================================
// Configuration Constants
// ============================================================================

/** Maximum requests per window for unauthenticated users */
const RATE_LIMIT_ANONYMOUS = 30;

/** Maximum requests per window for authenticated users */
const RATE_LIMIT_AUTHENTICATED = 100;

/** Maximum requests per window for OpenAI-consuming endpoints */
const RATE_LIMIT_OPENAI = 10;

/** Rate limit window in milliseconds (1 minute) */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum body size for API requests (5MB default) */
const MAX_BODY_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum body size for chat requests (reduced from 50MB to 10MB) */
const MAX_CHAT_BODY_SIZE_BYTES = 10 * 1024 * 1024;

/** Allowed origins for CORS/CSRF validation */
const ALLOWED_ORIGINS = new Set([
  // Add production domains here
]);

// ============================================================================
// Rate Limiting (In-Memory - for production use Redis)
// ============================================================================

/**
 * @typedef {Object} RateLimitEntry
 * @property {number} count - Request count
 * @property {number} resetAt - Reset timestamp
 */

/** @type {Map<string, RateLimitEntry>} */
const rateLimitStore = new Map();

/** Cleanup interval for expired entries */
let cleanupInterval = null;

/**
 * Get rate limit key for request
 * @param {Object} req - Request object
 * @param {string} [userId] - Optional user ID
 * @returns {string} Rate limit key
 */
function getRateLimitKey(req, userId = null) {
  const ip = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers?.["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  if (userId) {
    return `user:${userId}`;
  }
  return `ip:${ip}`;
}

/**
 * Check and update rate limit
 * @param {string} key - Rate limit key
 * @param {number} limit - Maximum requests allowed
 * @returns {{allowed: boolean, remaining: number, resetAt: number}}
 */
function checkRateLimit(key, limit) {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  entry.count += 1;

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Cleanup expired rate limit entries
 */
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Start periodic cleanup
if (cleanupInterval === null) {
  cleanupInterval = setInterval(cleanupRateLimits, RATE_LIMIT_WINDOW_MS);
  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }
}

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Timing-safe string comparison (fixes HIGH-01)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings match
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");

    // If lengths differ, comparison will always fail, but we want constant time
    if (bufA.length !== bufB.length) {
      // Compare with self to maintain constant time
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Extract API key from request
 * @param {Object} req - Request object
 * @returns {string|null} API key or null
 */
export function extractApiKey(req) {
  // Check X-API-Key header
  const apiKeyHeader = req.headers?.["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  // Check Authorization header
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string") {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7).trim();
    }
    // Allow raw API key in Authorization header
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Validate API key against configured key (with timing-safe comparison)
 * @param {string} providedKey - The provided API key
 * @param {string} expectedKey - The expected API key
 * @returns {boolean} True if valid
 */
export function validateApiKey(providedKey, expectedKey) {
  if (!providedKey || !expectedKey) {
    return false;
  }
  return timingSafeEqual(providedKey, expectedKey);
}

// ============================================================================
// CSRF Protection (fixes CRIT-03)
// ============================================================================

/**
 * Generate a CSRF token
 * @param {string} sessionId - Session identifier
 * @returns {string} CSRF token
 */
export function generateCsrfToken(sessionId) {
  const secret = process.env.CSRF_SECRET || process.env.FILES_LINK_SECRET || "";
  if (!secret) {
    console.warn("[Security] No CSRF secret configured");
    return "";
  }

  const timestamp = Date.now().toString(36);
  const payload = `${sessionId}:${timestamp}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 32);

  return `${payload}:${signature}`;
}

/**
 * Validate a CSRF token
 * @param {string} token - CSRF token to validate
 * @param {string} sessionId - Expected session ID
 * @param {number} [maxAgeMs=3600000] - Maximum token age (default 1 hour)
 * @returns {boolean} True if valid
 */
export function validateCsrfToken(token, sessionId, maxAgeMs = 3600000) {
  const secret = process.env.CSRF_SECRET || process.env.FILES_LINK_SECRET || "";
  if (!secret) {
    return false;
  }

  if (typeof token !== "string") {
    return false;
  }

  const parts = token.split(":");
  if (parts.length !== 3) {
    return false;
  }

  const [tokenSessionId, timestamp, signature] = parts;

  // Verify session ID matches
  if (tokenSessionId !== sessionId) {
    return false;
  }

  // Verify token age
  const tokenTime = parseInt(timestamp, 36);
  if (!Number.isFinite(tokenTime) || Date.now() - tokenTime > maxAgeMs) {
    return false;
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${tokenSessionId}:${timestamp}`)
    .digest("hex")
    .slice(0, 32);

  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Validate origin/referer headers for CSRF protection
 * @param {Object} req - Request object
 * @returns {boolean} True if origin is valid
 */
export function validateOrigin(req) {
  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  const host = req.headers?.host;

  // If no origin/referer, allow (may be same-origin request)
  if (!origin && !referer) {
    return true;
  }

  // Check against host
  if (host) {
    try {
      if (origin) {
        const originUrl = new URL(origin);
        if (originUrl.host === host) {
          return true;
        }
      }
      if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.host === host) {
          return true;
        }
      }
    } catch {
      // Invalid URL format
    }
  }

  // Check against allowed origins
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  // In development, allow localhost
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev && origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1") {
        return true;
      }
    } catch {
      // Invalid URL
    }
  }

  return false;
}

// ============================================================================
// Security Middleware Functions
// ============================================================================

/**
 * Rate limiting middleware
 * @param {Object} [options] - Configuration options
 * @param {number} [options.limit] - Request limit per window
 * @param {boolean} [options.isOpenAI] - Whether this is an OpenAI-consuming endpoint
 * @returns {Function} Middleware function
 */
export function rateLimiter(options = {}) {
  const {
    limit = RATE_LIMIT_ANONYMOUS,
    isOpenAI = false,
  } = options;

  const effectiveLimit = isOpenAI ? Math.min(limit, RATE_LIMIT_OPENAI) : limit;

  return (req, res, next) => {
    // Skip rate limiting for OPTIONS requests
    if (req.method === "OPTIONS") {
      return next?.();
    }

    const userId = req.user?.id || null;
    const key = getRateLimitKey(req, userId);
    const result = checkRateLimit(key, effectiveLimit);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", effectiveLimit.toString());
    res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

    if (!result.allowed) {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
      return;
    }

    return next?.();
  };
}

/**
 * CSRF protection middleware
 * @param {Object} [options] - Configuration options
 * @param {boolean} [options.validateToken] - Whether to validate CSRF token
 * @returns {Function} Middleware function
 */
export function csrfProtection(options = {}) {
  const { validateToken = false } = options;

  return (req, res, next) => {
    // Skip for safe methods
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next?.();
    }

    // Validate origin
    if (!validateOrigin(req)) {
      res.status(403).json({
        error: {
          code: "CSRF_ERROR",
          message: "Request origin not allowed",
        },
      });
      return;
    }

    // Validate CSRF token if required
    if (validateToken) {
      const token = req.headers?.["x-csrf-token"] || req.body?.csrfToken;
      const sessionId = req.headers?.["x-session-id"] || req.cookies?.sessionId;

      if (!token || !sessionId || !validateCsrfToken(token, sessionId)) {
        res.status(403).json({
          error: {
            code: "CSRF_TOKEN_INVALID",
            message: "Invalid or missing CSRF token",
          },
        });
        return;
      }
    }

    return next?.();
  };
}

/**
 * API key authentication middleware
 * @param {Object} [options] - Configuration options
 * @param {boolean} [options.required] - Whether authentication is required
 * @param {string} [options.envKey] - Environment variable name for API key
 * @returns {Function} Middleware function
 */
export function apiKeyAuth(options = {}) {
  const {
    required = false,
    envKey = "API_KEY",
  } = options;

  return (req, res, next) => {
    const expectedKey = process.env[envKey];

    // If no key configured, skip validation
    if (!expectedKey) {
      if (required) {
        console.warn(`[Security] ${envKey} not configured but auth required`);
      }
      return next?.();
    }

    const providedKey = extractApiKey(req);

    if (!providedKey) {
      if (required) {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "API key required",
          },
        });
        return;
      }
      return next?.();
    }

    if (!validateApiKey(providedKey, expectedKey)) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key",
        },
      });
      return;
    }

    // Mark request as authenticated
    req.authenticated = true;
    return next?.();
  };
}

/**
 * Apply security headers to response
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export function applySecurityHeaders(req, res) {
  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.openai.com wss://api.openai.com"
  );

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // XSS Protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Frame options
  res.setHeader("X-Frame-Options", "DENY");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Strict Transport Security (if HTTPS)
  if (req.headers?.["x-forwarded-proto"] === "https" || req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

/**
 * Combined security middleware for API endpoints
 * @param {Object} [options] - Configuration options
 * @param {boolean} [options.requireAuth] - Whether to require authentication
 * @param {boolean} [options.isOpenAI] - Whether this is an OpenAI-consuming endpoint
 * @param {number} [options.rateLimit] - Custom rate limit
 * @returns {Function} Combined middleware function
 */
export function securityMiddleware(options = {}) {
  const {
    requireAuth = false,
    isOpenAI = false,
    rateLimit = isOpenAI ? RATE_LIMIT_OPENAI : RATE_LIMIT_ANONYMOUS,
  } = options;

  const rateLimitMiddleware = rateLimiter({ limit: rateLimit, isOpenAI });
  const csrfMiddleware = csrfProtection({ validateToken: false });
  const authMiddleware = apiKeyAuth({ required: requireAuth });

  return async (req, res, next) => {
    // Apply security headers
    applySecurityHeaders(req, res);

    // Chain middleware
    const middlewares = [rateLimitMiddleware, csrfMiddleware, authMiddleware];

    for (const middleware of middlewares) {
      let called = false;
      const result = await new Promise((resolve) => {
        middleware(req, res, () => {
          called = true;
          resolve(true);
        });
        // If middleware didn't call next, it responded
        setTimeout(() => {
          if (!called) resolve(false);
        }, 0);
      });

      if (!result) {
        return; // Middleware already responded
      }
    }

    return next?.();
  };
}

/**
 * Wrap handler with security middleware (for Vercel serverless)
 * @param {Function} handler - Request handler
 * @param {Object} [options] - Security options
 * @returns {Function} Wrapped handler
 */
export function withSecurity(handler, options = {}) {
  const middleware = securityMiddleware(options);

  return async (req, res) => {
    await new Promise((resolve) => {
      middleware(req, res, resolve);
    });

    // Check if response was sent by middleware
    if (res.headersSent) {
      return;
    }

    return handler(req, res);
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

export {
  RATE_LIMIT_ANONYMOUS,
  RATE_LIMIT_AUTHENTICATED,
  RATE_LIMIT_OPENAI,
  RATE_LIMIT_WINDOW_MS,
  MAX_BODY_SIZE_BYTES,
  MAX_CHAT_BODY_SIZE_BYTES,
};

export default {
  timingSafeEqual,
  extractApiKey,
  validateApiKey,
  generateCsrfToken,
  validateCsrfToken,
  validateOrigin,
  rateLimiter,
  csrfProtection,
  apiKeyAuth,
  applySecurityHeaders,
  securityMiddleware,
  withSecurity,
};
