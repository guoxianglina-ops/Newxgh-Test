// 象过河仓库管理系统 - 简易后端
// 启动: node server.js
// 数据存 server-data.json，手机和电脑共享同一份数据
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = 8899;
const STATIC_DIR = __dirname; // 当前目录作为静态目录
const DATA_FILE = path.join(__dirname, 'server-data.json');

// 确保数据文件存在
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8');
}

// 自动获取本机局域网 IP
function getLocalIP() {
  var interfaces = os.networkInterfaces();
  for (var name in interfaces) {
    var list = interfaces[name];
    for (var i = 0; i < list.length; i++) {
      var iface = list[i];
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: GET /api/data — 获取数据
  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      var data = fs.readFileSync(DATA_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch(e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: POST /api/data — 保存数据
  if (pathname === '/api/data' && req.method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        fs.writeFileSync(DATA_FILE, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 静态文件服务
  var filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
  var ext = path.extname(filePath).toLowerCase();
  var contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, function(err, content) {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', function() {
  var localIP = getLocalIP();
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  象过河仓库管理系统 — 后端已启动');
  console.log('══════════════════════════════════════════');
  console.log('  本机访问: http://localhost:' + PORT + '/');
  console.log('  手机访问: http://' + localIP + ':' + PORT + '/mobile.html');
  console.log('  二维码页: http://' + localIP + ':' + PORT + '/qrcode-quick-in.html');
  console.log('  数据文件: ' + DATA_FILE);
  console.log('──────────────────────────────────────────');
  console.log('  换到新网络时，只需重新运行 node server.js');
  console.log('  二维码页面会自动使用新的 IP 地址');
  console.log('══════════════════════════════════════════');
  console.log('');
});
