import http from 'http';

const PORT = Number(process.env.PORT || 9797);
const PROWLARR_BASE = (process.env.PROWLARR_BASE || 'http://192.168.1.4:9696').replace(/\/$/, '');
const SAFE_FILE_NAME = process.env.SAFE_FILE_NAME || 'download.torrent';
const PROXY_BASE = (process.env.PROXY_BASE || 'http://192.168.1.4').replace(/\/$/, '');

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function rewriteDownloadUrl(urlStr) {
  try {
    const normalized = urlStr.replace(/&amp;/g, '&');
    const u = new URL(normalized);
    const isProwlarr = u.origin === PROWLARR_BASE;
    const isDownload = /^\/\d+\/download$/.test(u.pathname);
    if (!isProwlarr || !isDownload) return urlStr;

    // Keep apikey + link, but normalize file param to a safe value
    const apikey = u.searchParams.get('apikey');
    const link = u.searchParams.get('link');

    if (!apikey || !link) return urlStr;

    const id = u.pathname.split('/')[1];
    const out = new URL(`/dl/${id}`, PROXY_BASE);
    out.searchParams.set('apikey', apikey);
    out.searchParams.set('link', base64UrlEncode(link));
    out.searchParams.set('file', SAFE_FILE_NAME);

    return out.toString();
  } catch {
    return urlStr;
  }
}

function xmlEscape(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rewriteBody(body) {
  // Replace Prowlarr download URLs inside XML (link/enclosure)
  // Conservative regex: http(s)://<host>:<port>/<id>/download?... within quotes
  const escapedBase = PROWLARR_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escapedBase}\\/\\d+\\/download\\?[^"'<\\s]+`, 'g');
  return body.replace(re, (m) => xmlEscape(rewriteDownloadUrl(m)));
}

function rewriteUpstreamUrl(urlStr) {
  // Listenarr appends "/api" to torznab URLs. Prowlarr's newznab endpoint
  // does not include that suffix, so strip a trailing "/api" if present.
  if (urlStr.includes('/api/v1/indexer/') && urlStr.includes('/newznab/api')) {
    return urlStr.replace('/newznab/api', '/newznab/');
  }
  if (urlStr.endsWith('/api')) {
    return urlStr.slice(0, -4);
  }
  return urlStr;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/dl/')) {
      const reqUrl = new URL(req.url, PROXY_BASE);
      const id = reqUrl.pathname.split('/')[2];
      const apikey = reqUrl.searchParams.get('apikey');
      const link = reqUrl.searchParams.get('link');
      if (!id || !apikey || !link) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('missing parameters');
        return;
      }
      const upstream = new URL(`/${id}/download`, PROWLARR_BASE);
      upstream.searchParams.set('apikey', apikey);
      upstream.searchParams.set('link', base64UrlDecode(link));
      upstream.searchParams.set('file', SAFE_FILE_NAME);

      const upstreamRes = await fetch(upstream, { method: 'GET', redirect: 'manual' });
      if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
        const loc = upstreamRes.headers.get('location') || '';
        if (loc.startsWith('magnet:')) {
          const magnetBody = loc;
          res.writeHead(200, {
            'content-type': 'text/plain',
            'content-length': Buffer.byteLength(magnetBody).toString(),
            'content-disposition': `attachment; filename="${SAFE_FILE_NAME}"`,
          });
          res.end(magnetBody);
          return;
        }
      }
      res.writeHead(upstreamRes.status, Object.fromEntries(upstreamRes.headers));
      upstreamRes.body.pipeTo(new WritableStream({
        write(chunk) { res.write(chunk); },
        close() { res.end(); }
      }));
      return;
    }

    const upstream = new URL(rewriteUpstreamUrl(req.url), PROWLARR_BASE);
    const headers = new Headers(req.headers);
    headers.delete('host');
    // Avoid gzip so we can safely rewrite and set Content-Length
    headers.set('accept-encoding', 'identity');

    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
    });

    const contentType = upstreamRes.headers.get('content-type') || '';

    // Pass through non-XML content untouched
    if (!contentType.includes('xml') && !contentType.includes('rss')) {
      res.writeHead(upstreamRes.status, Object.fromEntries(upstreamRes.headers));
      upstreamRes.body.pipeTo(new WritableStream({
        write(chunk) { res.write(chunk); },
        close() { res.end(); }
      }));
      return;
    }

    const text = await upstreamRes.text();
    const rewritten = rewriteBody(text);

    const headersOut = Object.fromEntries(upstreamRes.headers);
    delete headersOut['content-encoding'];
    headersOut['content-length'] = Buffer.byteLength(rewritten).toString();
    res.writeHead(upstreamRes.status, headersOut);
    res.end(rewritten);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`proxy error: ${err?.message || err}`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`torznab-proxy listening on :${PORT}, upstream ${PROWLARR_BASE}`);
});
