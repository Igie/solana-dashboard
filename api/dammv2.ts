import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log(req);
  } finally {
    res.status(200).json({ message: "Hello from ESM!" });
  }
}