import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MIME type mapping for common static assets
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

/**
 * Get the admin static files directory.
 * In production: dist/admin (relative to function app root)
 * __dirname in compiled JS will be dist/functions
 */
function getAdminDir(): string {
  return path.resolve(__dirname, '..', 'admin');
}

/**
 * Serve static files for the admin UI.
 * Handles SPA routing by falling back to index.html for non-file routes.
 */
app.http('adminUI', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/{*path}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const adminDir = getAdminDir();
    let requestedPath = request.params.path || '';

    // Security: prevent directory traversal attacks
    requestedPath = requestedPath.replace(/\.\./g, '');

    // Build full file path
    let filePath = path.join(adminDir, requestedPath);

    // Check if file exists and is not a directory
    let fileExists = false;
    try {
      const stat = fs.statSync(filePath);
      fileExists = stat.isFile();
    } catch {
      fileExists = false;
    }

    // SPA fallback: serve index.html for non-file routes
    if (!fileExists) {
      filePath = path.join(adminDir, 'index.html');

      try {
        fs.statSync(filePath);
      } catch {
        context.warn('Admin UI not found at', adminDir);
        return {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
          body: 'Admin UI not found. Ensure the admin UI is built and included in the deployment.',
        };
      }
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Read file
    let content: Buffer;
    try {
      content = fs.readFileSync(filePath);
    } catch (error) {
      context.error('Error reading file:', filePath, error);
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Error reading file',
      };
    }

    // Cache headers:
    // - HTML: no-cache (always fresh for SPA navigation)
    // - Assets with hash in filename: immutable (Vite adds content hash)
    const isHtml = ext === '.html';
    const cacheControl = isHtml
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
      body: content,
    };
  },
});
