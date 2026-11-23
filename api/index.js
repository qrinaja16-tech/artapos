import { handleHttpRequest } from '../src/index.js';

export default async function handler(req, res) {
  try {
    return await handleHttpRequest(req, res);
  } catch (err) {
    console.error('Vercel API Error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    }
  }
}
