// Minimal CDP debug test
const net = require('net');
const crypto = require('crypto');

const TARGET_ID = '048BB5761C395FEAFAF109FAF5A50898';
let msgId = 1;

function wsConnect() {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.createConnection({ host: '127.0.0.1', port: 9222 }, () => {
      sock.write(
        'GET /devtools/browser HTTP/1.1\r\n' +
        'Host: 127.0.0.1:9222\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });

    let headerBuf = '';
    let upgraded = false;
    let frameBuf = Buffer.alloc(0);

    sock.on('data', chunk => {
      if (!upgraded) {
        headerBuf += chunk.toString('binary');
        if (headerBuf.includes('\r\n\r\n')) {
          upgraded = true;
          console.log('WebSocket connected');
          // Get remaining data after headers
          const idx = Buffer.from(headerBuf, 'binary').indexOf(Buffer.from('\r\n\r\n'));
          const rem = Buffer.from(headerBuf, 'binary').slice(idx + 4);
          if (rem.length > 0) processFrames(rem);
          resolve(sock);
        }
        return;
      }
      processFrames(chunk);
    });

    function processFrames(data) {
      frameBuf = Buffer.concat([frameBuf, data]);
      while (frameBuf.length >= 2) {
        let pLen = frameBuf[1] & 0x7f;
        let hLen = 2;
        if (pLen === 126) {
          if (frameBuf.length < 4) return;
          pLen = frameBuf.readUInt16BE(2);
          hLen = 4;
        } else if (pLen === 127) {
          if (frameBuf.length < 10) return;
          pLen = Number(frameBuf.readBigUInt64BE(2));
          hLen = 10;
        }
        if ((frameBuf[1] & 0x80) !== 0) hLen += 4; // masked
        if (frameBuf.length < hLen + pLen) return;

        const payload = frameBuf.slice(hLen, hLen + pLen);
        frameBuf = frameBuf.slice(hLen + pLen);

        const opcode = frameBuf[0] & 0x0f;
        // Decode
        const text = payload.toString();
        try {
          const json = JSON.parse(text);
          console.log('RECV id=' + json.id + ' method=' + (json.method || '') +
            ' hasResult=' + !!json.result + ' hasError=' + !!json.error +
            ' sessionId=' + (json.sessionId || 'none'));
          if (json.id && pendingResolve[json.id]) {
            pendingResolve[json.id](json);
            delete pendingResolve[json.id];
          }
        } catch(e) {
          console.log('RECV non-JSON frame, len=' + text.length);
        }
      }
    }

    sock.on('error', e => { console.error('Socket error:', e.message); reject(e); });
  });
}

const pendingResolve = {};

function wsSend(sock, method, params = {}, sessionId = undefined) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const payload = Buffer.from(JSON.stringify(msg));
    const mask = crypto.randomBytes(4);

    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }

    sock.write(Buffer.concat([header, mask, masked]));
    console.log('SEND id=' + id + ' method=' + method + ' session=' + (sessionId || 'none'));

    pendingResolve[id] = resolve;
    setTimeout(() => {
      if (pendingResolve[id]) {
        delete pendingResolve[id];
        reject(new Error('Timeout: ' + method));
      }
    }, 10000);
  });
}

async function main() {
  const sock = await wsConnect();

  // Test 1: getTargets (no session)
  console.log('\n--- Test 1: Target.getTargets ---');
  const targets = await wsSend(sock, 'Target.getTargets');
  const pages = targets.result.targetInfos.filter(t => t.type === 'page');
  console.log('Pages found:', pages.length);

  // Test 2: Attach to target
  console.log('\n--- Test 2: Target.attachToTarget ---');
  const attach = await wsSend(sock, 'Target.attachToTarget', {
    targetId: TARGET_ID,
    flatten: true
  });
  console.log('Session ID:', attach.result?.sessionId);
  const sid = attach.result?.sessionId;

  // Test 3: Enable Runtime with session
  console.log('\n--- Test 3: Runtime.enable ---');
  const rtEnable = await wsSend(sock, 'Runtime.enable', {}, sid);
  console.log('Runtime.enable result:', JSON.stringify(rtEnable).substring(0, 200));

  // Test 4: Simple evaluate
  console.log('\n--- Test 4: Runtime.evaluate ---');
  const evalResult = await wsSend(sock, 'Runtime.evaluate', {
    expression: 'JSON.stringify({url: window.location.href, title: document.title})',
    returnByValue: true
  }, sid);
  console.log('Eval result:', JSON.stringify(evalResult).substring(0, 300));

  sock.destroy();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
