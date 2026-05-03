import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
  const res = await fetch(`/api/passport/${params.username}`);
  const stats = res.ok ? await res.json() : null;

  const username = params.username;
  const accuracy = stats?.accuracy != null ? (stats.accuracy * 100).toFixed(1) : '—';
  const count = stats?.verdict_count ?? 0;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0d1117"/>
    <text x="100" y="200" font-family="monospace" font-size="64" fill="#f5a623">@${username}</text>
    <text x="100" y="300" font-family="monospace" font-size="40" fill="#e5e7eb">정확도 ${accuracy}% · verdict ${count}개</text>
    <text x="100" y="400" font-family="monospace" font-size="32" fill="#6b7280">Cogochi 트레이더</text>
  </svg>`;

  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
  });
};
