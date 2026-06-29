#!/usr/bin/env node
/**
 * 로컬 HTTPS 서버 - PWA 배포용
 * 
 * 사용법:
 *   node serve-https.js
 * 
 * 같은 WiFi에 연결된 핸드폰에서 표시되는 HTTPS 주소로 접속하면
 * PWA를 설치하고 오프라인에서 사용할 수 있습니다.
 * 
 * ⚠️ 자체 서명 인증서를 사용하므로 브라우저에서 "안전하지 않음" 경고가 나타납니다.
 *    "고급" → "안전하지 않은 페이지로 이동"을 눌러 진행하세요.
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const CERT_DIR = path.join(__dirname, '.certs');
const PORT_HTTPS = 8443;
const PORT_HTTP = 8080;

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Generate self-signed certificate using Node.js crypto
function generateSelfSignedCert() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
  }
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }

  console.log('🔑 자체 서명 인증서를 생성합니다...');
  
  try {
    // Use openssl to generate self-signed certificate
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:0.0.0.0" 2>/dev/null`, {
      stdio: 'pipe'
    });
    console.log('✅ 인증서 생성 완료');
  } catch {
    // Fallback: generate using Node.js crypto (requires Node 15+)
    console.log('⚠️ openssl을 사용할 수 없어 Node.js로 인증서를 생성합니다...');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    
    // Write private key
    fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    
    // For the certificate we need openssl, so fallback to HTTP only
    console.log('⚠️ 자체 서명 인증서 생성에 실패했습니다. HTTP 모드로 실행합니다.');
    return null;
  }
  
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

// Native HTTPS Proxy for Hyundai API
function proxyRequest(req, res, targetHost, targetPath) {
  const options = {
    hostname: targetHost,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers }
  };
  
  options.headers.host = targetHost;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });
  
  req.pipe(proxyReq);
}

// Serve static files
function handleRequest(req, res) {
  if (req.url.startsWith('/api/hyundai-auth')) {
    proxyRequest(req, res, 'dev.kr-ccapi.hyundai.com', req.url.replace('/api/hyundai-auth', ''));
    return;
  }
  if (req.url.startsWith('/api/hyundai')) {
    proxyRequest(req, res, 'dev.kr-ccapi.hyundai.com', req.url.replace('/api/hyundai', ''));
    return;
  }

  let filePath = req.url.split('?')[0];
  
  // Default to index.html
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }
  
  const fullPath = path.join(DIST_DIR, filePath);
  
  // Security check
  if (!fullPath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  // Check if file exists
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    // SPA fallback: serve index.html for any route
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(fs.readFileSync(indexPath));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  // Cache static assets aggressively, but not HTML/SW
  const isImmutable = filePath.startsWith('/assets/');
  const cacheControl = isImmutable
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
  });
  
  fs.createReadStream(fullPath).pipe(res);
}

// Get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Main
async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist 폴더가 없습니다. 먼저 `npm run build`를 실행하세요.');
    process.exit(1);
  }

  const localIPs = getLocalIPs();
  const certData = generateSelfSignedCert();

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('   🚗 차량 운행기록부 - 로컬 서버');
  console.log('═══════════════════════════════════════════════════');

  // Start HTTPS server
  if (certData) {
    const httpsServer = https.createServer(certData, handleRequest);
    httpsServer.listen(PORT_HTTPS, '0.0.0.0', () => {
      console.log('');
      console.log('   🔒 HTTPS 서버 (PWA 설치 가능):');
      console.log(`   ├─ 로컬:  https://localhost:${PORT_HTTPS}`);
      localIPs.forEach((ip, i) => {
        const prefix = i === localIPs.length - 1 ? '└─' : '├─';
        console.log(`   ${prefix} 네트워크: https://${ip}:${PORT_HTTPS}`);
      });
    });
  }

  // Start HTTP server (fallback)
  const httpServer = http.createServer(handleRequest);
  httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
    console.log('');
    console.log('   📡 HTTP 서버 (미리보기 전용):');
    console.log(`   ├─ 로컬:  http://localhost:${PORT_HTTP}`);
    localIPs.forEach((ip, i) => {
      const prefix = i === localIPs.length - 1 ? '└─' : '├─';
      console.log(`   ${prefix} 네트워크: http://${ip}:${PORT_HTTP}`);
    });
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('📱 핸드폰에서 설치하는 방법:');
    console.log('   1. 핸드폰과 이 컴퓨터가 같은 WiFi에 연결');
    console.log(`   2. 핸드폰 브라우저에서 HTTPS 주소 입력`);
    console.log('   3. "안전하지 않음" 경고가 나오면:');
    console.log('      → "고급" → "안전하지 않은 사이트로 이동" 클릭');
    console.log('   4. 앱이 로드되면:');
    console.log('      → Android: 브라우저 메뉴 → "홈 화면에 추가"');
    console.log('      → iPhone: 공유 버튼 → "홈 화면에 추가"');
    console.log('   5. 설치 후에는 인터넷 없이도 오프라인으로 사용 가능!');
    console.log('');
    console.log('   Ctrl+C로 서버를 종료합니다.');
    console.log('');
  });
}

main();
