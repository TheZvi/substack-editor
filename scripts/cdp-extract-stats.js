// Extract Substack blog metrics via CDP using ws package
const fs = require('fs');

// Inline minimal WebSocket client using Node.js net + crypto
const net = require('net');
const crypto = require('crypto');

class SimpleWebSocket {
  constructor(url) {
    this.callbacks = new Map();
    this.msgId = 1;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
    this.url = url;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const socket = net.createConnection({ host: '127.0.0.1', port: 9222 }, () => {
        const path = this.url.replace('ws://127.0.0.1:9222', '') || '/devtools/browser';
        socket.write(
          `GET ${path} HTTP/1.1\r\n` +
          `Host: 127.0.0.1:9222\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`
        );
      });

      let upgradeBuffer = Buffer.alloc(0);
      let upgraded = false;

      socket.on('data', (chunk) => {
        if (!upgraded) {
          upgradeBuffer = Buffer.concat([upgradeBuffer, chunk]);
          const str = upgradeBuffer.toString();
          const headerEnd = str.indexOf('\r\n\r\n');
          if (headerEnd >= 0) {
            if (str.includes('101')) {
              upgraded = true;
              this.connected = true;
              this.socket = socket;
              // Process any remaining data after headers
              const remaining = upgradeBuffer.slice(headerEnd + 4);
              if (remaining.length > 0) {
                this._processData(remaining);
              }
              resolve();
            } else {
              reject(new Error('WebSocket upgrade failed'));
            }
          }
          return;
        }
        this._processData(chunk);
      });

      socket.on('error', reject);
      socket.on('close', () => { this.connected = false; });
    });
  }

  _processData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this._parseFrames();
  }

  _parseFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        headerLen = 10;
      }

      if (isMasked) headerLen += 4;

      const totalLen = headerLen + payloadLen;
      if (this.buffer.length < totalLen) return;

      let payload = this.buffer.slice(headerLen, totalLen);
      if (isMasked) {
        const maskKey = this.buffer.slice(headerLen - 4, headerLen);
        for (let i = 0; i < payload.length; i++) {
          payload[i] = payload[i] ^ maskKey[i % 4];
        }
      }

      this.buffer = this.buffer.slice(totalLen);

      const opcode = firstByte & 0x0f;
      if (opcode === 1) { // text frame
        try {
          const data = JSON.parse(payload.toString());
          if (data.id !== undefined && this.callbacks.has(data.id)) {
            const cb = this.callbacks.get(data.id);
            this.callbacks.delete(data.id);
            clearTimeout(cb.timer);
            cb.resolve(data);
          }
        } catch (e) { /* not JSON */ }
      } else if (opcode === 9) { // ping
        this._sendPong(payload);
      }
    }
  }

  _sendPong(payload) {
    this._sendFrame(0x8a, payload); // pong
  }

  _sendFrame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[0] = opcode;
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      const payload = Buffer.from(JSON.stringify(msg));
      this._sendFrame(0x81, payload);

      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 60000);

      this.callbacks.set(id, { resolve, reject, timer });
    });
  }

  close() {
    if (this.socket) this.socket.destroy();
  }
}

async function main() {
  const ws = new SimpleWebSocket('ws://127.0.0.1:9222/devtools/browser');
  await ws.connect();
  console.log('Connected to Chrome CDP');

  // Attach to Substack tab
  const attach = await ws.send('Target.attachToTarget', {
    targetId: TARGET_ID,
    flatten: true
  });
  const sessionId = attach.result.sessionId;
  console.log('Attached to Substack tab');

  // Enable Runtime
  await ws.send('Runtime.enable', {}, sessionId);
  console.log('Runtime enabled');

  // Helper to evaluate JS
  async function evaluate(code, timeout = 60000) {
    const oldTimeout = 60000;
    const result = await ws.send('Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);

    if (result.result?.result?.value) {
      return typeof result.result.result.value === 'string'
        ? JSON.parse(result.result.result.value)
        : result.result.result.value;
    }
    if (result.result?.exceptionDetails) {
      throw new Error('JS Error: ' + JSON.stringify(result.result.exceptionDetails.text || result.result.exceptionDetails));
    }
    return null;
  }

  // Step 1: Get all published posts
  console.log('\n=== Fetching all published posts ===');
  const postsData = await evaluate(`
    (async () => {
      let allPosts = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;
      while (hasMore) {
        const resp = await fetch('/api/v1/post/search?query=&offset=' + offset + '&limit=' + limit + '&orderBy=post_date&orderDirection=desc&postStatus=published');
        if (!resp.ok) return JSON.stringify({ error: 'Status ' + resp.status, count: 0, posts: [] });
        const data = await resp.json();
        if (data && data.length > 0) {
          allPosts = allPosts.concat(data.map(p => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            postDate: p.post_date,
            audience: p.audience,
            type: p.type,
            wordCount: p.wordcount || 0,
            likes: p.reaction_count || 0,
            comments: p.comment_count || 0
          })));
          offset += limit;
          if (data.length < limit) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      return JSON.stringify({ count: allPosts.length, posts: allPosts });
    })()
  `);

  if (postsData.error) {
    console.error('Error fetching posts:', postsData.error);
    ws.close();
    process.exit(1);
  }
  console.log('Found', postsData.count, 'published posts');

  // Step 2: Explore available stat endpoints
  console.log('\n=== Exploring stat endpoints ===');
  const endpoints = await evaluate(`
    (async () => {
      const results = {};
      const eps = [
        '/api/v1/stats/post/all',
        '/api/v1/stats/posts?limit=5',
        '/api/v1/stats/aggregate',
        '/api/v1/stats?group_by=total',
        '/api/v1/subscriber_stats',
        '/api/v1/publication/stats',
        '/api/v1/stats/views',
        '/api/v1/stats/post/' + ${postsData.posts[0]?.id || 0} + '?group_by=total',
        '/api/v1/post/' + ${postsData.posts[0]?.id || 0} + '/details'
      ];
      for (const ep of eps) {
        try {
          const r = await fetch(ep);
          const t = await r.text();
          results[ep] = { status: r.status, preview: t.substring(0, 300) };
        } catch(e) {
          results[ep] = { error: e.message };
        }
      }
      return JSON.stringify(results);
    })()
  `);

  fs.writeFileSync('C:/Users/Zvi Mowshowitz/substack-editor/scripts/endpoint-probe.json',
    JSON.stringify(endpoints, null, 2));
  console.log('Endpoint probe results saved');

  // Print which endpoints worked
  for (const [ep, res] of Object.entries(endpoints)) {
    console.log(`  ${ep}: ${res.status || res.error}`);
  }

  // Step 3: Fetch individual post details with views
  console.log('\n=== Fetching post details ===');

  // Find which endpoint works for individual posts
  const firstPostId = postsData.posts[0]?.id;
  let viewsEndpoint = null;

  if (endpoints['/api/v1/post/' + firstPostId + '/details']?.status === 200) {
    viewsEndpoint = 'details';
  } else if (endpoints['/api/v1/stats/post/' + firstPostId + '?group_by=total']?.status === 200) {
    viewsEndpoint = 'stats';
  }

  console.log('Using endpoint type:', viewsEndpoint || 'none found');

  let allPostsWithViews = [];

  if (viewsEndpoint) {
    // Fetch in batches
    for (let i = 0; i < postsData.posts.length; i += 10) {
      const batch = postsData.posts.slice(i, i + 10);
      const batchResult = await evaluate(`
        (async () => {
          const batch = ${JSON.stringify(batch)};
          const results = [];
          for (const p of batch) {
            try {
              ${viewsEndpoint === 'details' ? `
              const r = await fetch('/api/v1/post/' + p.id + '/details');
              if (r.ok) {
                const d = await r.json();
                const stats = d.post_audience_stats || {};
                results.push({
                  ...p,
                  views: stats.total_views || 0,
                  opens: stats.total_opens || stats.email_opens || 0,
                  webViews: stats.web_views || 0,
                  emailOpens: stats.email_opens || 0
                });
              } else {
                results.push({ ...p, views: 0 });
              }
              ` : `
              const r = await fetch('/api/v1/stats/post/' + p.id + '?group_by=total');
              if (r.ok) {
                const d = await r.json();
                results.push({
                  ...p,
                  views: d.total_views || d.views || 0
                });
              } else {
                results.push({ ...p, views: 0 });
              }
              `}
            } catch(e) {
              results.push({ ...p, views: 0 });
            }
          }
          return JSON.stringify(results);
        })()
      `);

      if (batchResult) {
        allPostsWithViews = allPostsWithViews.concat(batchResult);
      }
      console.log(`  ${Math.min(i+10, postsData.posts.length)}/${postsData.posts.length} posts`);
    }
  } else {
    // No views endpoint found - just use posts without views
    allPostsWithViews = postsData.posts.map(p => ({ ...p, views: 0 }));
    console.log('WARNING: Could not find working views endpoint');
  }

  // Add URLs
  allPostsWithViews.forEach(p => {
    p.url = 'https://thezvi.substack.com/p/' + p.slug;
  });

  // Step 4: Compile metrics
  console.log('\n=== Compiling metrics ===');

  // By year
  const byYear = {};
  allPostsWithViews.forEach(p => {
    const year = new Date(p.postDate).getFullYear();
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(p);
  });

  const yearStats = {};
  for (const [year, posts] of Object.entries(byYear)) {
    const sorted = [...posts].sort((a, b) => b.views - a.views);
    yearStats[year] = {
      totalPosts: posts.length,
      totalViews: posts.reduce((s, p) => s + (p.views || 0), 0),
      totalLikes: posts.reduce((s, p) => s + (p.likes || 0), 0),
      totalComments: posts.reduce((s, p) => s + (p.comments || 0), 0),
      topPosts: sorted.slice(0, 25).map(p => ({
        title: p.title,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        date: p.postDate?.split('T')[0],
        url: p.url
      }))
    };
  }

  // By month
  const byMonth = {};
  allPostsWithViews.forEach(p => {
    const d = new Date(p.postDate);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = { posts: 0, views: 0 };
    byMonth[key].posts += 1;
    byMonth[key].views += (p.views || 0);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    totalPosts: allPostsWithViews.length,
    totalViews: allPostsWithViews.reduce((s, p) => s + (p.views || 0), 0),
    byYear: yearStats,
    byMonth: Object.entries(byMonth).sort().map(([m, d]) => ({ month: m, ...d })),
    allPosts: allPostsWithViews
  };

  const outPath = 'C:/Users/Zvi Mowshowitz/substack-editor/scripts/substack-metrics.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\n=== RESULTS ===');
  console.log('Total posts:', output.totalPosts);
  console.log('Total views:', output.totalViews.toLocaleString());
  console.log('\nBy Year:');
  for (const [year, stats] of Object.entries(yearStats).sort()) {
    console.log(`  ${year}: ${stats.totalPosts} posts, ${stats.totalViews.toLocaleString()} views`);
  }

  console.log('\nData saved to:', outPath);

  ws.close();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message, e.stack);
  process.exit(1);
});
