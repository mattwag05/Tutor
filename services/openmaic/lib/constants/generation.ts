/**
 * Constants for PDF content generation
 * Shared between client and server code
 */

// PDF content truncation limit (characters)
export const MAX_PDF_CONTENT_CHARS = 50000;

// Maximum number of images to send as vision content parts
export const MAX_VISION_IMAGES = 20;

// SSE heartbeat interval — keeps long-running streaming connections alive
// across proxies (Cloudflare/Nginx) that drop idle connections around 30s.
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

// Max retry attempts for LLM streaming endpoints (total attempts = this + 1).
export const MAX_STREAM_RETRIES = 2;
