import rateLimit from 'express-rate-limit';

// Global rate limiter: 100 requests per 15 minutes per IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: res.getHeader('RateLimit-Reset') as number
    });
  }
});

// MOTHER API rate limiter: 10 requests per minute per IP
export const motherLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 MOTHER queries per minute
  message: 'Too many MOTHER queries, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  },
  handler: (req, res) => {
    console.warn(`MOTHER rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are sending too many queries. Please wait before trying again.',
      retryAfter: res.getHeader('RateLimit-Reset') as number,
      suggestion: 'Consider upgrading to a premium plan for higher rate limits.'
    });
  }
});
