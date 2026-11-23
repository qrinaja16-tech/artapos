import { handleHttpRequest } from '../src/index.js';

export default async function handler(req, res) {
  return await handleHttpRequest(req, res);
}
