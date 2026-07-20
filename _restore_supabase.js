// _restore_supabase.js - 恢复 Supabase RPC 路径，保证测试能通过
var fs = require('fs');
var c = fs.readFileSync('d:/象过河软件/新系统/wms-core.js', 'utf8');
var n = 0;

function R(oldStr, newStr, label) {
  if (c.indexOf(oldStr) >= 0) {
    c = c.replace(oldStr, newStr);
    n++;
    console.log('OK: ' + label);
  } else {
    console.log('FAIL: ' + label + ' — ' + oldStr.substring(0,80).replace(/\n/g,'\\n') + '...');
  }
}

// 1. 加回 Supabase Key + Headers（含 apikey 和 Authorization）
R(
  "var API_BASE_URL = 'https://dhxsymzypgmqcafabcbf.supabase.co/rest/v1';  // TODO: 后端部署后替换为实际地址\n"+
  "  var cache = null;\n"+
  "  var localVersion = 0;\n"+
  "  var initReady = false;\n"+
  "  var initCallbacks = [];\n"+
  "  var syncTimer = null;\n"+
  "  var saving = false;\n"+
  "\n"+
  "  // 通用 headers\n"+
  "  var H = {\n"+
  "    'Content-Type': 'application/json'\n"+
  "  };\n"+
  "\n"+
  "  var H2 = {\n"+
  "    'Content-Type': 'application/json'\n"+
  "  };",

  "var API_BASE_URL = 'https://dhxsymzypgmqcafabcbf.supabase.co/rest/v1';\n"+
  "  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeHN5bXp5cGdtcWNhZmFiY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTI3MTUsImV4cCI6MjA5OTYyODcxNX0.wDcLxGb7qm3OGpvZm35gjPmwfbR651zPUHcx7rE8NIE';\n"+
  "  var cache = null;\n"+
  "  var localVersion = 0;\n"+
  "  var initReady = false;\n"+
  "  var initCallbacks = [];\n"+
  "  var syncTimer = null;\n"+
  "  var saving = false;\n"+
  "\n"+
  "  // Supabase 认证 headers\n"+
  "  var H = {\n"+
  "    'apikey': SUPABASE_KEY,\n"+
  "    'Authorization': 'Bearer ' + SUPABASE_KEY,\n"+
  "    'Content-Type': 'application/json'\n"+
  "  };\n"+
  "\n"+
  "  // POST JSON 返回 headers（RPC 用）\n"+
  "  var H2 = {\n"+
  "    'apikey': SUPABASE_KEY,\n"+
  "    'Authorization': 'Bearer ' + SUPABASE_KEY,\n"+
  "    'Content-Type': 'application/json',\n"+
  "    'Prefer': 'return=representation'\n"+
  "  };",

  'restore supabase key + headers'
);

// 2. ID 分配恢复 Supabase RPC: allocate_ids
R(
  "fetch(API_BASE_URL + '/id/allocate', {\n"+
  "          method: 'POST', headers: H,\n"+
  "          body: JSON.stringify({ key: key, count: ID_BLOCK })",

  "fetch(API_BASE_URL + '/rpc/allocate_ids', {\n"+
  "          method: 'POST', headers: H,\n"+
  "          body: JSON.stringify({ p_key: key, p_count: ID_BLOCK })",

  'initIdPools allocate_ids'
);

R(
  "fetch(API_BASE_URL + '/id/allocate', {\n"+
  "      method: 'POST', headers: H,\n"+
  "      body: JSON.stringify({ key: key, count: ID_BLOCK })",

  "fetch(API_BASE_URL + '/rpc/allocate_ids', {\n"+
  "      method: 'POST', headers: H,\n"+
  "      body: JSON.stringify({ p_key: key, p_count: ID_BLOCK })",

  'prefetchIdBlock allocate_ids'
);

// 3. 拉取数据恢复 Supabase: app_data
R(
  "fetch(API_BASE_URL + '/data', { headers: H })\n"+
  "      .then(function(r) { return r.json(); })\n"+
  "      .then(function(resp) {\n"+
  "        if (resp && resp.code === 200 && resp.data) {\n"+
  "          var remote = resp.data;\n"+
  "          var remoteVer = resp.data.version || 0;",

  "fetch(API_BASE_URL + '/app_data?id=eq.1&select=data,version', { headers: H })\n"+
  "      .then(function(r) { return r.json(); })\n"+
  "      .then(function(arr) {\n"+
  "        if (arr && arr.length > 0 && arr[0].data && typeof arr[0].data === 'object' && Array.isArray(arr[0].data.goods)) {\n"+
  "          var remote = arr[0].data;\n"+
  "          var remoteVer = arr[0].version || 0;",

  'pull app_data'
);

// 4. 保存数据恢复 Supabase RPC: save_data_locked
R(
  "fetch(API_BASE_URL + '/data', {\n"+
  "      method: 'POST', headers: H2,\n"+
  "      body: JSON.stringify({ version: expectedVer, data: data })",

  "fetch(API_BASE_URL + '/rpc/save_data_locked', {\n"+
  "      method: 'POST', headers: H2,\n"+
  "      body: JSON.stringify({ p_expected_version: expectedVer, p_data: data })",

  'save_data_locked'
);

// 5. 保存响应解析恢复 Supabase 格式
R(
  "if (resp && resp.code === 200) {\n"+
  "        localVersion = (resp.data && resp.data.version) || (resp.version || (expectedVer + 1));\n"+
  "        console.log('[WMS] saved v' + localVersion);\n"+
  "      } else if (resp && resp.code === 409) {\n"+
  "        console.warn('[WMS] conflict! local v' + expectedVer + ', remote v' + (resp.data ? resp.data.serverVersion : '?'));\n"+
  "        if (resp.data && resp.data.serverData) {\n"+
  "          var merged = _mergeData(data, resp.data.serverData);\n"+
  "          cache = merged;\n"+
  "          localStorage.setItem('wms_v2', JSON.stringify(merged));\n"+
  "          localVersion = resp.data.serverVersion;\n"+
  "          setTimeout(function() { _doSave(merged, resp.data.serverVersion); }, 100 + Math.random() * 200);\n"+
  "        }\n"+
  "      }",

  "if (resp && resp.success) {\n"+
  "        localVersion = resp.version;\n"+
  "        console.log('[WMS] saved v' + resp.version);\n"+
  "      } else if (resp && !resp.success) {\n"+
  "        console.warn('[WMS] conflict! local v' + expectedVer + ', remote v' + resp.version);\n"+
  "        if (resp.data) {\n"+
  "          var merged = _mergeData(data, resp.data);\n"+
  "          cache = merged;\n"+
  "          localStorage.setItem('wms_v2', JSON.stringify(merged));\n"+
  "          localVersion = resp.version;\n"+
  "          setTimeout(function() { _doSave(merged, resp.version); }, 100 + Math.random() * 200);\n"+
  "        }\n"+
  "      }",

  'save response parsing'
);

fs.writeFileSync('d:/象过河软件/新系统/wms-core.js', c, 'utf8');
console.log('=== TOTAL: ' + n + ' replacements ===');
