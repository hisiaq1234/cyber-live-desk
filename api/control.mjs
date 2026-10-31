// CYBER LIVE DESK — Vercel controller page.
// Serves the operator dashboard SPA at /api/control.

const CONTROL_PAGE = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">" +
  "<meta name=\"robots\" content=\"noindex\"><title>Live desk controller</title></head>" +
  "<body><script type=\"module\" src=\"/desk-assets/control.js\"></script></body></html>";

export const config = { runtime: "nodejs" };

export default async (req) => {
  if (req.method === "GET") {
    return new Response(CONTROL_PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  return new Response("Method not allowed.", { status: 405 });
};
