import { handleIngredients } from '../server/http.js';

export default function handler(req, res) {
  return handleIngredients(req, res);
}
