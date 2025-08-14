export function GET(request: Request) {

  console.log(request.body)
  return new Response('Hello from Vercel!');
  
}