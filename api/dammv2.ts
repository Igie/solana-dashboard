export const config = {
  runtime: "nodejs"
};

import { VercelRequest, VercelResponse } from '@vercel/node';
 
export const handler = (req: VercelRequest, res: VercelResponse) => {
  const name = req.query.name ?? 'World';
  res.writeHead(200);
  res.write(`Hello ${name}!`);
  res.end();
}