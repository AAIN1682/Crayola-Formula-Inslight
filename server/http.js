import { AssessmentError, assessFormula, listExamples, listIngredientCatalog } from './assess.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    } catch {
      return Promise.reject(new AssessmentError('The assessment request was not valid JSON.', 400));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new AssessmentError('The assessment request was not valid JSON.', 400));
      }
    });
    req.on('error', () => reject(new AssessmentError('The assessment request could not be read.', 400)));
  });
}

export async function handleAssess(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { message: 'Use POST for an assessment.' });
    return;
  }
  try {
    const body = await readBody(req);
    const result = await assessFormula(body);
    send(res, 200, result);
  } catch (error) {
    const status = error instanceof AssessmentError ? error.statusCode : 500;
    const message = error instanceof AssessmentError ? error.publicMessage : 'The assessment could not be completed.';
    if (!(error instanceof AssessmentError)) console.error('assessment_failed');
    send(res, status, { message });
  }
}

export function handleExamples(_req, res) {
  send(res, 200, listExamples());
}

export function handleIngredients(_req, res) {
  send(res, 200, { ingredients: listIngredientCatalog() });
}

export async function handleApi(req, res) {
  const url = (req.url ?? '').split('?')[0];
  if (url === '/api/assess') return handleAssess(req, res);
  if (url === '/api/examples' && req.method === 'GET') return handleExamples(req, res);
  if (url === '/api/ingredients' && req.method === 'GET') return handleIngredients(req, res);
  send(res, 404, { message: 'That assessment route is not available.' });
}
