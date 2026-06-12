// List Chrome tabs via CDP WebSocket
const http = require('http');
const crypto = require('crypto');

function connectWebSocket(path) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const options = {
      hostname: '127.0.0.1',
      port: 9222,
      path: path,
      method: 'GET',
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    };

    const req = http.request(options, res => {
      reject(new Error(`HTTP ${res.statusCode} - WebSocket upgrade failed`));
    });

    req.on('upgrade', (res, socket) => {
      let msgId = 1;

      function sendCommand(method, params = {}) {
        return new Promise((resolve, reject) => {
          const id = msgId++;
          const msg = JSON.stringify({ id, method, params });
          // WebSocket frame: text frame, no mask from server perspective
          // But as client we need to mask
          const payload = Buffer.from(msg);
          let header;
          if (payload.length < 126) {
            header = Buffer.alloc(6);
            header[0] = 0x81; // FIN + text
            header[1] = 0x80 | payload.length; // MASK + length
          } else if (payload.length < 65536) {
            header = Buffer.alloc(8);
            header[0] = 0x81;
            header[1] = 0x80 | 126;
            header.writeUInt16BE(payload.length, 2);
          } else {
            header = Buffer.alloc(14);
            header[0] = 0x81;
            header[1] = 0x80 | 127;
            header.writeBigUInt64BE(BigInt(payload.length), 2);
          }
          const mask = crypto.randomBytes(4);
          const maskOffset = header.length - 4;
          mask.copy(header, maskOffset);
          const masked = Buffer.alloc(payload.length);
          for (let i = 0; i < payload.length; i++) {
            masked[i] = payload[i] ^ mask[i % 4];
          }
          socket.write(Buffer.concat([header, masked]));

          let buffer = Buffer.alloc(0);
          function onData(chunk) {
            buffer = Buffer.concat([buffer, chunk]);
            // Try to parse WebSocket frames
            while (buffer.length >= 2) {
              let payloadLen = buffer[1] & 0x7f;
              let offset = 2;
              if (payloadLen === 126) {
                if (buffer.length < 4) return;
                payloadLen = buffer.readUInt16BE(2);
                offset = 4;
              } else if (payloadLen === 127) {
                if (buffer.length < 10) return;
                payloadLen = Number(buffer.readBigUInt64BE(2));
                offset = 10;
              }
              if (buffer.length < offset + payloadLen) return;
              const frameData = buffer.slice(offset, offset + payloadLen);
              buffer = buffer.slice(offset + payloadLen);
              try {
                const parsed = JSON.parse(frameData.toString());
                if (parsed.id === id) {
                  socket.removeListener('data', onData);
                  resolve(parsed);
                }
              } catch (e) { /* not our message */ }
            }
          }
          socket.on('data', onData);
          setTimeout(() => {
            socket.removeListener('data', onData);
            reject(new Error('Timeout waiting for response'));
          }, 5000);
        });
      }

      resolve({ socket, sendCommand });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const { socket, sendCommand } = await connectWebSocket('/devtools/browser');
    console.log('Connected to Chrome CDP');

    // Get list of targets (tabs)
    const result = await sendCommand('Target.getTargets');
    const targets = result.result.targetInfos || [];

    console.log(`\nFound ${targets.length} targets:\n`);
    targets
      .filter(t => t.type === 'page')
      .forEach((t, i) => {
        console.log(`[${i}] ${t.title}`);
        console.log(`    URL: ${t.url}`);
        console.log(`    ID: ${t.targetId}`);
        console.log();
      });

    socket.destroy();
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

main();
