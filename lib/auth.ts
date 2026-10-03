export function authorize(request: Request) {
  const origin = request.headers.get('origin'),
    bearer = request.headers.get('authorization');
  if (process.env.APP_AUTH_TOKEN && bearer === `Bearer ${process.env.APP_AUTH_TOKEN}`) return;
  const host = request.headers.get('host') ?? new URL(request.url).host;
  const incoming = new URL(`http://${host}`);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(incoming.hostname);
  if (
    local &&
    origin &&
    new URL(origin).host === host &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  )
    return;
  throw Error('Unauthorized: use same-origin localhost or server APP_AUTH_TOKEN');
}
