import { handleExamples } from '../server/http.js';

export default function handler(req, res) {
  return handleExamples(req, res);
}
