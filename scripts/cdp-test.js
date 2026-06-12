// Minimal CDP test - reuse the http.request approach that worked
const http = require('http');
const crypto = require('crypto');

const TARGET_ID = '048BB5761C395FEAFAF109FAF5A50898';

process.stdout.write('Starting...\n');

function wsUpgrade(path) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9222,
      path: path,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });

    req.on('upgrade', (res, socket, head) => {
      process.stdout.write('Upgrade OK for ' + path + '\n');

      let msgId = 1;
      let callbacks = {};
      let buffer = Buffer.alloc(0);

      socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        // Parse all complete frames
        while (true) {
          if (buffer.length < 2) break;
          let pLen = buffer[1] & 0x7f;
          let hLen = 2;
          if (pLen === 126) {
            if (buffer.length < 4) break;
            pLen = buffer.readUInt16BE(2);
            hLen = 4;
          } else if (pLen === 127) {
            if (buffer.length < 10) break;
            pLen = Number(buffer.readBigUInt64BE(2));
            hLen = 10;
          }
          const masked = (buffer[1] & 0x80) !== 0;
          if (masked) hLen += 4;
          if (buffer.length < hLen + pLen) break;

          let payload = Buffer.from(buffer.slice(hLen, hLen + pLen));
          if (masked) {
            const mk = buffer.slice(hLen - 4, hLen);
            for (let i = 0; i < payload.length; i++) payload[i] ^= mk[i % 4];
          }
          buffer = buffer.slice(hLen + pLen);

          try {
            const json = JSON.parse(payload.toString());
            if (json.id && callbacks[json.id]) {
              callbacks[json.id](json);
              delete callbacks[json.id];
            }
          } catch(e) {}
        }
      });

      function send(method, params, sessionId) {
        return new Promise((resolve, reject) => {
          const id = msgId++;
          const obj = { id, method, params: params || {} };
          if (sessionId) obj.sessionId = sessionId;
          const data = Buffer.from(JSON.stringify(obj));
          const mask = crypto.randomBytes(4);
          let hdr;
          if (data.length < 126) {
            hdr = Buffer.from([0x81, 0x80 | data.length]);
          } else if (data.length < 65536) {
            hdr = Buffer.alloc(4);
            hdr[0] = 0x81;
            hdr[1] = 0x80 | 126;
            hdr.writeUInt16BE(data.length, 2);
          } else {
            hdr = Buffer.alloc(10);
            hdr[0] = 0x81;
            hdr[1] = 0x80 | 127;
            hdr.writeBigUInt64BE(BigInt(data.length), 2);
          }
          const m = Buffer.alloc(data.length);
          for (let i = 0; i < data.length; i++) m[i] = data[i] ^ mask[i % 4];
          socket.write(Buffer.concat([hdr, mask, m]));

          callbacks[id] = resolve;
          setTimeout(() => {
            if (callbacks[id]) {
              delete callbacks[id];
              reject(new Error('Timeout: ' + method));
            }
          }, 15000);
        });
      }

      resolve({ socket, send });
    });

    req.on('response', res => {
      reject(new Error('HTTP ' + res.statusCode + ' (expected upgrade)'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const ws = await wsUpgrade('/devtools/browser');

  // Step 1: Verify we can talk to Chrome
  const targets = await ws.send('Target.getTargets');
  const pages = targets.result.targetInfos.filter(t => t.type === 'page');
  process.stdout.write('Found ' + pages.length + ' pages\n');

  // Step 2: Attach to Substack
  const att = await ws.send('Target.attachToTarget', { targetId: TARGET_ID, flatten: true });
  const sid = att.result.sessionId;
  process.stdout.write('Session: ' + sid + '\n');

  // Step 3: Runtime.enable
  process.stdout.write('Sending Runtime.enable...\n');
  const rte = await ws.send('Runtime.enable', {}, sid);
  process.stdout.write('Runtime.enable done: ' + JSON.stringify(rte).substring(0, 100) + '\n');

  // Step 4: Simple eval
  process.stdout.write('Sending eval...\n');
  const ev = await ws.send('Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true
  }, sid);
  process.stdout.write('Eval result: ' + JSON.stringify(ev.result).substring(0, 200) + '\n');

  ws.socket.destroy();
  process.exit(0);
}

main().catch(e => {
  process.stderr.write('Error: ' + e.message + '\n' + e.stack + '\n');
  process.exit(1);
});
