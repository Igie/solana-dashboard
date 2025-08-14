import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function dammv2Handler(req: VercelRequest, res: VercelResponse) {
  const name = req.query.name ?? 'World';
  
  console.log(req.body);

  res.writeHead(200);
  res.write(`Hello ${name}!`);
  res.end();
}