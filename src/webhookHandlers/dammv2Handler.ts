import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function dammv2Handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log(req.body);

    res.writeHead(200);
    res.write(`Hello!`);
    res.end();
  } catch (e) {
    console.log(e)
  }
}