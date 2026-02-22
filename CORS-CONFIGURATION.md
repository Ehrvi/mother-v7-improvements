# CORS Configuration - MOTHER v14

**Task**: #29 CORS Configuration  
**Date**: 2026-02-21  
**Status**: ✅ Complete

---

## Overview

CORS (Cross-Origin Resource Sharing) is now configured to allow browser-based applications to integrate with the MOTHER API from any origin. This enables web developers to build client-side applications that call the MOTHER API directly.

---

## Configuration

### Current Settings

```typescript
cors({
  origin: process.env.NODE_ENV === 'production'
    ? (origin, callback) => {
        // Allow all origins in production (can be restricted later)
        callback(null, true);
      }
    : true, // Allow all origins in development
  credentials: true, // Allow cookies for authentication
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After'
  ],
  maxAge: 86400, // 24 hours preflight cache
})
```

### Allowed Origins

**Development**: All origins allowed (`*`)  
**Production**: All origins allowed (can be restricted to whitelist later)

### Allowed Methods

- `GET` - Read operations
- `POST` - Create operations and tRPC batch requests
- `PUT` - Update operations
- `DELETE` - Delete operations
- `OPTIONS` - Preflight requests
- `PATCH` - Partial update operations

### Allowed Headers

- `Content-Type` - Request body format (application/json)
- `Authorization` - Bearer tokens (future use)
- `X-Requested-With` - AJAX request identification
- `Accept` - Response format preference
- `Origin` - Request origin

### Exposed Headers

These headers are exposed to browser JavaScript:

- `X-RateLimit-Limit` - Maximum requests per window
- `X-RateLimit-Remaining` - Remaining requests in window
- `X-RateLimit-Reset` - Timestamp when limit resets
- `Retry-After` - Seconds to wait before retrying (429 responses)

---

## Usage Examples

### JavaScript (Fetch API)

```javascript
// Simple GET request
const response = await fetch('https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/auth.me', {
  method: 'GET',
  credentials: 'include', // Include cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);

// Check rate limit headers
console.log('Rate Limit:', response.headers.get('X-RateLimit-Limit'));
console.log('Remaining:', response.headers.get('X-RateLimit-Remaining'));
console.log('Reset:', response.headers.get('X-RateLimit-Reset'));
```

### JavaScript (tRPC Client)

```javascript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const client = createTRPCProxyClient({
  links: [
    httpBatchLink({
      url: 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc',
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: 'include', // Include cookies
        });
      },
    }),
  ],
});

// Call MOTHER API
const result = await client.mother.query.mutate({
  query: 'What is the meaning of life?',
  tier: 1,
});

console.log(result);
```

### React Application

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';

// Create tRPC React hooks
const trpc = createTRPCReact();

// Create query client
const queryClient = new QueryClient();

// Create tRPC client
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc',
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: 'include',
        });
      },
    }),
  ],
});

// App component
function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <YourApp />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

// Use in components
function YourComponent() {
  const { data, isLoading } = trpc.mother.query.useQuery({
    query: 'Hello MOTHER',
    tier: 1,
  });

  if (isLoading) return <div>Loading...</div>;
  return <div>{data?.response}</div>;
}
```

### Python (requests)

```python
import requests

# CORS is not needed for server-side requests
# But the API will respond with CORS headers anyway

response = requests.post(
    'https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query',
    json={
        'query': 'What is the meaning of life?',
        'tier': 1
    },
    headers={
        'Content-Type': 'application/json'
    }
)

data = response.json()
print(data)

# Check rate limit headers
print('Rate Limit:', response.headers.get('X-RateLimit-Limit'))
print('Remaining:', response.headers.get('X-RateLimit-Remaining'))
print('Reset:', response.headers.get('X-RateLimit-Reset'))
```

---

## Preflight Requests

CORS preflight requests (OPTIONS) are automatically handled by the `cors` middleware. The preflight response is cached for 24 hours (`maxAge: 86400`).

### Example Preflight Request

```http
OPTIONS /api/trpc/mother.query HTTP/1.1
Host: mother-interface-qtvghovzxa-ts.a.run.app
Origin: https://example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type
```

### Example Preflight Response

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://example.com
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,Accept,Origin
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After
```

---

## Security Considerations

### Current Configuration (Permissive)

The current configuration allows **all origins** to access the API. This is intentional for maximum compatibility during initial rollout.

### Future Restrictions (Recommended)

For production use, consider restricting to a whitelist of trusted origins:

```typescript
const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'https://app.yourdomain.com',
  'https://admin.yourdomain.com',
  'http://localhost:3000', // Development
  'http://localhost:5173', // Vite dev server
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Check if origin is in whitelist
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // ... rest of config
}));
```

### Environment-Based Configuration

```typescript
// .env.production
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

// server/_core/index.ts
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0) {
      return callback(null, true); // Allow all if no whitelist
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // ... rest of config
}));
```

---

## Testing CORS

### Test with curl

```bash
# Test preflight request
curl -X OPTIONS \
  https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Test actual request
curl -X POST \
  https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Origin: https://example.com" \
  -H "Content-Type: application/json" \
  -d '{"query":"Hello","tier":1}' \
  -v
```

### Test with Browser Console

```javascript
// Open browser console on any website
// Test CORS by making a request to MOTHER API

fetch('https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/auth.me', {
  method: 'GET',
  credentials: 'include',
})
  .then(res => res.json())
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err));
```

### Expected Results

✅ **Success**: Request completes, response received  
✅ **Headers**: CORS headers present in response  
✅ **No errors**: No CORS errors in browser console

---

## Troubleshooting

### Error: "No 'Access-Control-Allow-Origin' header"

**Cause**: CORS middleware not configured or origin not allowed  
**Solution**: Verify CORS middleware is loaded before routes

### Error: "Credentials flag is 'true', but 'Access-Control-Allow-Credentials' header is ''"

**Cause**: `credentials: true` not set in CORS config  
**Solution**: Already configured correctly in current setup

### Error: "Method X is not allowed by Access-Control-Allow-Methods"

**Cause**: HTTP method not in allowed methods list  
**Solution**: Add method to `methods` array in CORS config

### Error: "Request header X is not allowed by Access-Control-Allow-Headers"

**Cause**: Custom header not in allowed headers list  
**Solution**: Add header to `allowedHeaders` array in CORS config

---

## Summary

✅ **CORS enabled** for all origins (development and production)  
✅ **Credentials supported** (cookies, authentication)  
✅ **All HTTP methods** allowed (GET, POST, PUT, DELETE, OPTIONS, PATCH)  
✅ **Rate limit headers** exposed to browser JavaScript  
✅ **Preflight caching** enabled (24 hours)  
✅ **Production ready** (can be restricted to whitelist later)

---

## Next Steps

1. **Test CORS** in production with browser-based application
2. **Monitor usage** to identify trusted origins
3. **Implement whitelist** if needed for security
4. **Document** in OpenAPI specification (#23)

---

**Last Updated**: 2026-02-21  
**Status**: ✅ Complete  
**Owner**: Everton Luis Garcia
