// ===== ai-assistant.js: 象过河仓库管理系统 AI 智能助手 =====
// 集成 DeepSeek API + RAG 知识库 + 浮动聊天窗口
// 版本: v2.0 (2026-07-30) — 新增操作型AI：采购/销售订单创建

(function() {
  'use strict';

  // ===== 配置 =====
  var CONFIG = {
    // 默认走同源代理 /api/chat（Cloudflare Pages Functions）。
    // API Key 保存在 Cloudflare 的环境变量 DEEPSEEK_API_KEY 里，只存在于服务端，
    // 永远不会下发到浏览器，也不会出现在仓库里。
    // 只有在本地直连调试时才把 useProxy 改成 false 并临时填 apiKey——
    // 切记不要把真实 Key 提交到仓库。
    useProxy: true,
    proxyEndpoint: '/api/chat',
    apiKey: '%%DEEPSEEK_API_KEY%%',
    apiEndpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-reasoner',  // DeepSeek R1 推理增强
    maxTokens: 1024,
    temperature: 0.7,

    // UI
    position: 'bottom-right',
    bubbleSize: 48,
    windowWidth: 380,
    windowHeight: 520,

    // 功能开关
    enableRAG: true,           // 向量检索模式
    enableKeywordMatch: true,  // 关键词匹配模式（对比 demo）
    enableBusinessData: true,   // 允许查询实时业务数据
    enableOperation: true,      // 允许 AI 执行操作（创建单据等）

    // 支持的操作类型注册表（扩展新的操作类型仅需在此新增条目）
    operationTypes: {
      purchaseOrder: {
        label: '采购订单', dbKey: 'purchaseOrder', dbArray: 'purchaseOrders',
        partnerField: 'supplierId', partnerList: 'suppliers', partnerNameFn: 'gSName',
        requiredFields: ['supplierId', 'details'],
        permKey: 'purchase-order', prefix: 'CGDD', statusField: 'inQty', statusDefault: 0
      },
      salesOrder: {
        label: '销售订单', dbKey: 'salesOrder', dbArray: 'salesOrders',
        partnerField: 'customerId', partnerList: 'customers', partnerNameFn: 'gCName',
        requiredFields: ['customerId', 'details'],
        permKey: 'sales-order', prefix: 'XSDD', statusField: 'outQty', statusDefault: 0
      }
    }
  };

  // ===== 任务状态机（操作型 AI） =====
  window._aiTask = {
    active: false,        // 是否有进行中的操作任务
    type: null,           // 'purchaseOrder' | 'salesOrder'
    fields: {},           // 已收集的字段 { supplierId/customerId, date, details:[{goodsId,qty,price}], note }
    missing: [],          // 缺失字段名列表
    stage: 'idle',        // 'idle' | 'collecting' | 'confirm' | 'execute'
    confirmId: null       // 确认卡片的 DOM ID
  };

  // ===== 系统操作知识库（文档化知识） =====
  var KNOWLEDGE_BASE = [
    {
      id: 'kb-001',
      title: '系统登录与账号',
      content: '系统支持三种角色登录：员工(staff)、审核员(auditor)、主管(supervisor)。默认账号为1(管理员)/2(审核员)/3(主管)，初始密码由系统自动生成。登录后可在右上角修改密码。手机端扫码自动打开mobile.html页面，通过扫码参数自动填充业务单据。',
      keywords: ['登录','账号','密码','角色','员工','审核员','主管','扫码','手机']
    },
    {
      id: 'kb-002',
      title: '商品管理',
      content: '商品信息支持5大行业类型：通用商品、食品/医药、服装/鞋帽、电子/数码、建材/钢材。每种行业有独立的专属字段。新增商品时需选择行业类型、填写编码、名称、规格、单位、采购价、零售价等。可设置库存预警数量。支持搜索、行业筛选。商品编码格式为SP+序号。',
      keywords: ['商品','行业','食品','服装','电子','建材','编码','新增','搜索','筛选','库存预警']
    },
    {
      id: 'kb-003',
      title: '二维码出入库（核心功能）',
      content: '二维码快速出入库是本系统的核心功能。操作流程：1)在"二维码快速出入库"页面设置全局参数(仓库、供应商、客户、数量、单价，并可对每个字段独立锁定)；2)选择商品或通过Excel批量导入生成二维码；3)打印二维码贴到商品上；4)仓库员工用手机相机扫码，自动打开mobile.html并填写出入库单；5)如果所有必填字段均已锁定且填写完整，扫码后自动创建单据无需手动确认。Excel导入支持动态表头识别(10+中文别名)、四级商品匹配(ID精确→名称精确→名称模糊→编号)、全字段未匹配报告(商品/仓库/供应商/客户分别报告)、行级编辑和去重。',
      keywords: ['二维码','扫码','出入库','打印','导入','Excel','批量','锁定','手机']
    },
    {
      id: 'kb-004',
      title: '采购管理流程',
      content: '采购管理模块包含：采购订单→采购入库→采购退货→付款结算。操作流程：1)创建采购订单(选择供应商、商品、数量、单价)，保存为草稿；2)提交审核；3)审核通过后生成采购入库单；4)入库单审核通过后自动更新库存，创建批次记录并生成全链路溯源信息；5)如需要可创建采购退货单，审核通过后自动扣减库存(FIFO批次消耗)；6)付款结算可关联入库单，支持PDF附件上传。',
      keywords: ['采购','订单','入库','退货','付款','供应商','审核','草稿','批次','FIFO']
    },
    {
      id: 'kb-005',
      title: '销售管理流程',
      content: '销售管理模块包含：销售订单→销售出库→销售退货→收款结算。操作流程：1)创建销售订单(选择客户、商品、数量、单价)；2)提交审核；3)审核通过后生成销售出库单；4)出库单审核通过后自动扣减库存(FIFO批次消耗+linkChain溯源追加+stockFlows流水记录)；5)销售退货可退回到仓库，创建新批次并继承原始链路；6)收款结算关联出库单。报价管理可创建报价单并转销售订单。',
      keywords: ['销售','订单','出库','退货','收款','客户','报价','审核','FIFO','链路']
    },
    {
      id: 'kb-006',
      title: '审核流程',
      content: '系统有完整的审核状态机：草稿→待审核→已审核。审核员可以批准或驳回。主管可以取消任何单据。被驳回的单据可以修改后重新提交。每次审核操作都会记录审核日志。审核通知通过红点提醒。审核员最多可按类型分配权限。',
      keywords: ['审核','草稿','待审核','驳回','取消','主管','日志','红点','通知']
    },
    {
      id: 'kb-007',
      title: '库存管理',
      content: '库存管理包含：库存查询(按商品/仓库/关键词过滤)、仓库盘点(系统数量vs实际数量，自动生成盘盈盘亏单)、库存调拨(跨仓库转移，源扣减+目标新增批次)、库存预警(低于安全线自动提醒)、库存流水(所有变动记录可查)、批次管理(每次入库创建批次，记录来源、数量、单价、剩余)。全链路溯源：每件商品从采购订单到销售出库的完整流转路径均可追溯。',
      keywords: ['库存','盘点','调拨','预警','流水','批次','溯源','批次号']
    },
    {
      id: 'kb-008',
      title: '财务管理',
      content: '财务管理模块包含：会计科目管理(资产/收入/支出)、其他收入登记、费用支出登记、应收款管理、应付款管理、往来对账、利润报表。支出和收入按科目分类统计。支持月度/年度汇总查看。',
      keywords: ['财务','科目','收入','支出','应收','应付','对账','利润','报表']
    },
    {
      id: 'kb-009',
      title: '基本信息管理',
      content: '基本信息模块包含：商品信息、供应商信息、客户信息、仓库信息、部门信息、员工信息、会计科目、计量单位、商品类别、颜色管理(服装)、尺码管理(服装)、快递物流、会员管理。供应商可记录联系人、银行账户；客户可设置信用额度；员工可关联账号和部门。',
      keywords: ['基本信息','供应商','客户','仓库','部门','员工','单位','类别','颜色','尺码','会员']
    },
    {
      id: 'kb-010',
      title: '系统架构与技术',
      content: '系统采用纯前端SPA架构(零框架依赖)，一个wms-core.js(约4700行)驱动整个系统。前后端通过REST API通信，支持混合模式(后端API+localStorage离线降级)。数据使用乐观锁+ID预分配池机制保证多设备并发安全。支持双端：桌面版(index.html)和手机版(mobile.html)。二维码中内嵌完整URL，扫码自动打开手机版。',
      keywords: ['架构','SPA','API','localStorage','离线','乐观锁','ID预分配','双端','手机版']
    },
    {
      id: 'kb-011',
      title: '报表中心',
      content: '报表中心提供：采购统计报表(按供应商/商品/时间段汇总)、销售统计报表(按客户/商品/时间段汇总)、库存统计报表(当前库存/出入库趋势)、财务报表(收入支出汇总/利润)。报表数据基于实时业务数据计算。',
      keywords: ['报表','统计','采购统计','销售统计','库存统计','财务报表','趋势']
    },
    {
      id: 'kb-012',
      title: '高级功能',
      content: '系统还支持：BOM物料清单(多级BOM，成品-子件关系)、生产管理(计划→加工→领料→入库→退料)、POS收银(购物车结算)、发票管理、工程项目(预算进度追踪)、租赁管理(租金+押金+到期提醒)、维修管理、返利提成(按销售额/毛利/回款计算)、会员管理(积分+余额+等级)、快递物流。',
      keywords: ['BOM','生产','POS','发票','工程','租赁','维修','返利','提成','会员','物流']
    }
  ];

  // ===== 关键词匹配引擎（Demo 2：对比方案） =====
  function keywordSearch(query) {
    var q = query.toLowerCase();
    var results = [];

    KNOWLEDGE_BASE.forEach(function(doc) {
      var score = 0;
      // 标题匹配
      if (doc.title.toLowerCase().indexOf(q) >= 0) score += 5;
      // 关键词匹配
      doc.keywords.forEach(function(kw) {
        if (q.indexOf(kw) >= 0 || kw.indexOf(q) >= 0) score += 3;
      });
      // 内容匹配 (简单子串)
      var contentLower = doc.content.toLowerCase();
      var words = q.split(/[\s,，。、；;]+/);
      words.forEach(function(w) {
        if (w.length > 0 && contentLower.indexOf(w) >= 0) score += 1;
      });

      if (score > 0) {
        results.push({ doc: doc, score: score, method: 'keyword' });
      }
    });

    results.sort(function(a, b) { return b.score - a.score; });
    return results.slice(0, 3);
  }

  // ===== 简易向量检索（Demo 1：TF-IDF 风格） =====
  // 用词频向量做余弦相似度（不需要外部向量数据库）
  function buildVocabulary(docs) {
    var vocab = {};
    var idx = 0;
    docs.forEach(function(doc) {
      var words = (doc.title + ' ' + doc.content).toLowerCase()
        .replace(/[，,。、；;：:！!？?（）()""''【】\[\]{}《》<>/\\|]/g, ' ')
        .split(/\s+/)
        .filter(function(w) { return w.length > 1; });
      words.forEach(function(w) {
        if (!(w in vocab)) vocab[w] = idx++;
      });
    });
    return vocab;
  }

  function textToVector(text, vocab) {
    var vec = new Array(Object.keys(vocab).length).fill(0);
    var words = text.toLowerCase()
      .replace(/[，,。、；;：:！!？?（）()""''【】\[\]{}《》<>/\\|]/g, ' ')
      .split(/\s+/)
      .filter(function(w) { return w.length > 1; });
    words.forEach(function(w) {
      if (w in vocab) vec[vocab[w]]++;
    });
    return vec;
  }

  function cosineSimilarity(a, b) {
    var dot = 0, normA = 0, normB = 0;
    for (var i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  var _vectorCache = null;
  function vectorSearch(query) {
    if (!_vectorCache) {
      _vectorCache = {
        vocab: buildVocabulary(KNOWLEDGE_BASE),
        vectors: KNOWLEDGE_BASE.map(function(doc) {
          return textToVector(doc.title + ' ' + doc.content, buildVocabulary(KNOWLEDGE_BASE));
        })
      };
      // 重整词汇表一致
      _vectorCache.vocab = buildVocabulary(KNOWLEDGE_BASE);
      _vectorCache.vectors = KNOWLEDGE_BASE.map(function(doc) {
        return textToVector(doc.title + ' ' + doc.content, _vectorCache.vocab);
      });
    }

    var qVec = textToVector(query, _vectorCache.vocab);
    var results = [];
    _vectorCache.vectors.forEach(function(vec, i) {
      var sim = cosineSimilarity(qVec, vec);
      if (sim > 0.02) {
        results.push({ doc: KNOWLEDGE_BASE[i], score: Math.round(sim * 1000) / 10, method: 'vector' });
      }
    });

    results.sort(function(a, b) { return b.score - a.score; });
    return results.slice(0, 3);
  }

  // ===== 业务数据查询 =====
  function queryBusinessData(query) {
    if (!window.GD) return null;

    var db = window.GD();
    var q = query.toLowerCase();
    var result = {};

    // === 始终提供：系统概览（轻量级上下文） ===
    result.goodsCount = (db.goods || []).length;
    result.supplierCount = (db.suppliers || []).length;
    result.customerCount = (db.customers || []).length;
    result.warehouseCount = (db.warehouses || []).length;

    // 待审核统计
    var auditLists = ['purchaseOrders','purchaseIn','purchaseReturn','purchasePayments',
      'salesOrders','salesOut','salesReturn','salesReceipts'];
    var totalPending = 0;
    auditLists.forEach(function(key) {
      if (db[key]) totalPending += db[key].filter(function(x) { return x.auditStatus === '待审核'; }).length;
    });
    result.totalPending = totalPending;

    // === 实体搜索：提取查询中的可能实体名（用分词片段匹配） ===
    // 把查询拆成 2~6 字的连续片段，逐一匹配商品/供应商/客户/仓库名
    var segments = [];
    for (var len = 6; len >= 2; len--) {
      for (var i = 0; i <= q.length - len; i++) {
        segments.push(q.substring(i, i + len));
      }
    }

    // 商品模糊匹配
    var matchedGoods = [];
    segments.forEach(function(seg) {
      (db.goods || []).forEach(function(g) {
        var name = (g.name || '').toLowerCase();
        var code = (g.code || '').toLowerCase();
        if ((name.indexOf(seg) >= 0 || code.indexOf(seg) >= 0) && !matchedGoods.find(function(m) { return m.id === g.id; })) {
          // 查找该商品的库存
          var inv = (db.inventory || []).filter(function(i) { return i.goodsId === g.id; });
          matchedGoods.push({
            id: g.id, name: g.name, code: g.code || '', industryType: g.industryType || '',
            inventory: inv.map(function(i) {
              var wh = (db.warehouses || []).find(function(w) { return w.id === i.warehouseId; });
              return { warehouse: wh ? wh.name : ('仓#'+i.warehouseId), qty: i.qty, warnQty: i.warnQty || 0 };
            })
          });
        }
      });
    });
    if (matchedGoods.length > 0) result.matchedGoods = matchedGoods;

    // 供应商模糊匹配
    var matchedSuppliers = [];
    segments.forEach(function(seg) {
      (db.suppliers || []).forEach(function(s) {
        var name = (s.name || '').toLowerCase();
        if (name.indexOf(seg) >= 0 && !matchedSuppliers.find(function(m) { return m.id === s.id; })) {
          matchedSuppliers.push({ id: s.id, name: s.name, contact: s.contact || '', phone: s.phone || '' });
        }
      });
    });
    if (matchedSuppliers.length > 0) result.matchedSuppliers = matchedSuppliers;

    // 客户模糊匹配
    var matchedCustomers = [];
    segments.forEach(function(seg) {
      (db.customers || []).forEach(function(c) {
        var name = (c.name || '').toLowerCase();
        if (name.indexOf(seg) >= 0 && !matchedCustomers.find(function(m) { return m.id === c.id; })) {
          matchedCustomers.push({ id: c.id, name: c.name, contact: c.contact || '', phone: c.phone || '' });
        }
      });
    });
    if (matchedCustomers.length > 0) result.matchedCustomers = matchedCustomers;

    // 仓库模糊匹配
    var matchedWarehouses = [];
    segments.forEach(function(seg) {
      (db.warehouses || []).forEach(function(w) {
        var name = (w.name || '').toLowerCase();
        if (name.indexOf(seg) >= 0 && !matchedWarehouses.find(function(m) { return m.id === w.id; })) {
          matchedWarehouses.push({ id: w.id, name: w.name });
        }
      });
    });
    if (matchedWarehouses.length > 0) result.matchedWarehouses = matchedWarehouses;

    // === 条件触发：扩展现有业务数据 ===
    // 库存预警
    if (q.indexOf('库存') >= 0 || q.indexOf('存货') >= 0 || q.indexOf('余量') >= 0 || q.indexOf('预警') >= 0) {
      var alerts = [];
      (db.inventory || []).forEach(function(i) {
        if (i.qty < i.warnQty) {
          var g = (db.goods || []).find(function(x) { return x.id === i.goodsId; });
          var wh = (db.warehouses || []).find(function(x) { return x.id === i.warehouseId; });
          if (g) alerts.push('⚠️ ' + g.name + '｜' + (wh ? wh.name : '仓#' + i.warehouseId) + '｜库存' + i.qty + '（低于预警线' + i.warnQty + '）');
        }
      });
      if (alerts.length > 0) result.inventoryAlerts = alerts;
    }

    // 订单统计（含具体匹配）
    if (q.indexOf('订单') >= 0 || q.indexOf('单据') >= 0 || q.indexOf('业务') >= 0 || q.indexOf('采购') >= 0 || q.indexOf('销售') >= 0) {
      result.purchaseOrders = (db.purchaseOrders || []).length;
      result.salesOrders = (db.salesOrders || []).length;
      var poPending = (db.purchaseOrders || []).filter(function(x) { return x.auditStatus === '待审核'; }).length;
      var soPending = (db.salesOrders || []).filter(function(x) { return x.auditStatus === '待审核'; }).length;
      result.pendingAudit = poPending + soPending;

      // 如果匹配到供应商，列出相关采购单
      if (matchedSuppliers.length > 0) {
        var relatedPOs = [];
        matchedSuppliers.forEach(function(sup) {
          (db.purchaseOrders || []).forEach(function(po) {
            if (po.supplierId === sup.id) relatedPOs.push(po);
          });
        });
        if (relatedPOs.length > 0) result.relatedPurchaseOrders = relatedPOs.slice(0, 5);
      }
    }

    // 盘点相关
    if (q.indexOf('盘点') >= 0) {
      result.checkOrders = (db.checkOrders || []).length;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  // ===== DeepSeek API 调用 =====
  function callDeepSeek(messages, callback) {
    // 两条路径：
    //   A. useProxy = true（线上默认）：POST /api/chat，由服务端注入 Key，前端不带任何密钥
    //   B. useProxy = false：直连 DeepSeek，需要自己填 apiKey（仅本地调试用）
    // 任何一条走不通都安静退回本地知识库检索，不会再出现「发消息没反应」。
    var hasKey = CONFIG.apiKey && CONFIG.apiKey !== '%%DEEPSEEK_API_KEY%%';
    if (!CONFIG.useProxy && !hasKey) {
      callback('__LOCAL_ONLY__', null);
      return;
    }

    function degrade(reason) {
      console.warn('[AI] 大模型不可用，退回本地检索：' + reason);
      callback('__LOCAL_ONLY__', null);
    }

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CONFIG.useProxy ? CONFIG.proxyEndpoint : CONFIG.apiEndpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (!CONFIG.useProxy) xhr.setRequestHeader('Authorization', 'Bearer ' + CONFIG.apiKey);
      xhr.timeout = 30000;

      xhr.onload = function() {
        // 代理未部署 / 未配环境变量：安静降级，不弹错误给用户看
        if (xhr.status === 503 || xhr.status === 404 || xhr.status === 405) { degrade('HTTP ' + xhr.status); return; }
        if (xhr.status !== 200) {
          callback('API 错误 (' + xhr.status + '): ' + (xhr.responseText || '').substring(0, 200));
          return;
        }
        var resp = null;
        try { resp = JSON.parse(xhr.responseText); } catch (e) { resp = null; }
        if (!resp || !resp.choices || !resp.choices[0] || !resp.choices[0].message) {
          degrade('响应不是预期的 JSON');
          return;
        }
        callback(null, resp.choices[0].message.content);
      };
      xhr.onerror = function() { degrade('网络错误'); };
      xhr.ontimeout = function() { degrade('请求超时'); };

      xhr.send(JSON.stringify({
        model: CONFIG.model,
        messages: messages,
        max_tokens: CONFIG.maxTokens,
        temperature: CONFIG.temperature,
        stream: false
      }));
    } catch(e) {
      degrade('调用失败: ' + e.message);
    }
  }

  // ===== 实体解析器（操作型AI用：名称→ID） =====
  function _resolvePartner(name, orderType) {
    var db = window.GD();
    var ot = CONFIG.operationTypes[orderType];
    var list = db[ot.partnerList] || [];
    var q = (name || '').trim().toLowerCase();
    if (!q) return { matched: false, candidates: [] };

    var exact = list.filter(function(s) { return (s.name || '').toLowerCase() === q; });
    if (exact.length === 1) return { matched: true, id: exact[0].id, name: exact[0].name };

    var partial = list.filter(function(s) { return (s.name || '').toLowerCase().indexOf(q) >= 0; });
    if (partial.length === 1) return { matched: true, id: partial[0].id, name: partial[0].name };
    if (partial.length > 1) return { matched: false, ambiguous: true, candidates: partial.map(function(s) { return { id: s.id, name: s.name }; }) };

    return { matched: false, candidates: [] };
  }

  function _resolveGoods(name) {
    var db = window.GD();
    var q = (name || '').trim().toLowerCase();
    if (!q) return { matched: false, candidates: [] };

    var list = db.goods || [];
    // 1) 编码精确匹配
    var codeMatch = list.filter(function(g) { return (g.code || '').toLowerCase() === q; });
    if (codeMatch.length === 1) return { matched: true, id: codeMatch[0].id, name: codeMatch[0].name, code: codeMatch[0].code };

    // 2) 名称精确匹配
    var nameExact = list.filter(function(g) { return (g.name || '').toLowerCase() === q; });
    if (nameExact.length === 1) return { matched: true, id: nameExact[0].id, name: nameExact[0].name, code: nameExact[0].code };

    // 3) 名称子串匹配
    var namePartial = list.filter(function(g) { return (g.name || '').toLowerCase().indexOf(q) >= 0; });
    if (namePartial.length === 1) return { matched: true, id: namePartial[0].id, name: namePartial[0].name, code: namePartial[0].code };
    if (namePartial.length > 1) return { matched: false, ambiguous: true, candidates: namePartial.map(function(g) { return { id: g.id, name: g.name, code: g.code || '' }; }) };

    // 4) 多字符子串模糊匹配
    if (q.length >= 2) {
      var fuzzy = list.filter(function(g) { return (g.name || '').toLowerCase().indexOf(q) >= 0 || (g.code || '').toLowerCase().indexOf(q) >= 0; });
      if (fuzzy.length === 1) return { matched: true, id: fuzzy[0].id, name: fuzzy[0].name, code: fuzzy[0].code };
      if (fuzzy.length > 1) return { matched: false, ambiguous: true, candidates: fuzzy.map(function(g) { return { id: g.id, name: g.name, code: g.code || '' }; }) };
    }

    return { matched: false, candidates: [] };
  }

  // ===== 构建订单数据对象 =====
  function _buildOrderObject(task) {
    var db = window.GD();
    var f = task.fields;
    var ot = CONFIG.operationTypes[task.type];

    // 日期
    var now = new Date();
    var dateStr = f.date || (now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0'));

    // 金额
    var details = (f.details || []).map(function(d) {
      var qty = parseFloat(d.qty) || 0;
      var price = parseFloat(d.price) || 0;
      return { goodsId: d.goodsId, qty: qty, price: price, amt: Math.round(qty * price * 100) / 100 };
    });
    var totalAmt = details.reduce(function(s, d) { return s + d.amt; }, 0);

    // 单号
    var code = f.code || (ot.prefix + '-' + dateStr.replace(/-/g,'') + '-' + String(f.id || '').padStart(4,'0'));

    // 账号 —— currentUser 是 wms-core.js 的 let 变量，不在 window 上，用 || '1' 兜底
    var accountId = (typeof currentUser !== 'undefined' && currentUser && currentUser.accountId) || '1';

    var order = {
      id: f.id,
      code: code,
      date: dateStr,
      note: f.note || '',
      details: details,
      totalAmt: Math.round(totalAmt * 100) / 100,
      status: '草稿',
      auditStatus: '草稿',
      attachments: [],
      operatorId: accountId,
      creatorId: accountId
    };
    order[ot.partnerField] = f[ot.partnerField];
    order[ot.statusField] = ot.statusDefault;

    return order;
  }

  // ===== 确认卡片 UI =====
  function _aiAddConfirmCard() {
    var task = window._aiTask;
    if (!task || task.stage !== 'confirm') return;

    var f = task.fields;
    var ot = CONFIG.operationTypes[task.type];
    var cardId = 'ai-card-' + Date.now();

    var partnerLabel = task.type === 'purchaseOrder' ? '供应商' : '客户';
    var partnerNameFn = window[ot.partnerNameFn];
    var partnerName = partnerNameFn ? partnerNameFn(f[ot.partnerField]) : ('#' + f[ot.partnerField]);

    // 明细行
    var itemsHtml = '';
    (f.details || []).forEach(function(d, i) {
      var gName = window.gGName ? window.gGName(d.goodsId) : ('商品#' + d.goodsId);
      var priceStr = d.price ? '¥' + d.price : '-';
      var amt = Math.round((d.qty || 0) * (d.price || 0) * 100) / 100;
      itemsHtml += '<tr>' +
        '<td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f0f0f0">' + (i+1) + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">' + gName + '</td>' +
        '<td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f0f0f0">' + (d.qty || '?') + '</td>' +
        '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f0f0f0">' + priceStr + '</td>' +
        '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f0f0f0">¥' + amt + '</td>' +
        '</tr>';
    });

    var totalAmt = (f.details || []).reduce(function(s, d) { return s + Math.round((d.qty||0)*(d.price||0)*100)/100; }, 0);

    var cardHTML =
      '<div id="' + cardId + '" style="margin:4px 0;background:#fff;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">' +
        '<div style="background:linear-gradient(135deg,#1890ff,#722ed1);color:#fff;padding:10px 14px;font-weight:600;font-size:13px">' +
          '📋 确认创建' + ot.label +
          '<span style="font-size:10px;opacity:.8;float:right">' + (f.date || _nowStr()) + '</span>' +
        '</div>' +
        '<div style="padding:12px 14px;font-size:12px">' +
          '<div style="display:flex;gap:20px;margin-bottom:10px;flex-wrap:wrap">' +
            '<div><span style="color:#999">' + partnerLabel + '：</span><b>' + partnerName + '</b></div>' +
            '<div><span style="color:#999">日期：</span><b>' + (f.date || _nowStr()) + '</b></div>' +
            (f.note ? '<div><span style="color:#999">备注：</span>' + f.note + '</div>' : '') +
          '</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px">' +
            '<thead><tr style="background:#fafafa">' +
              '<th style="padding:5px 8px;text-align:center;border-bottom:1px solid #f0f0f0">#</th>' +
              '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #f0f0f0">商品</th>' +
              '<th style="padding:5px 8px;text-align:center;border-bottom:1px solid #f0f0f0">数量</th>' +
              '<th style="padding:5px 8px;text-align:right;border-bottom:1px solid #f0f0f0">单价</th>' +
              '<th style="padding:5px 8px;text-align:right;border-bottom:1px solid #f0f0f0">金额</th>' +
            '</tr></thead>' +
            '<tbody>' + itemsHtml + '</tbody>' +
          '</table>' +
          '<div style="text-align:right;font-weight:700;font-size:13px;color:#1890ff;padding:6px 0;border-top:1px solid #f0f0f0">合计：¥' + totalAmt + '</div>' +
        '</div>' +
        '<div id="' + cardId + '-btns" style="display:flex;gap:8px;padding:10px 14px;background:#fafafa;border-top:1px solid #f0f0f0;justify-content:flex-end">' +
          '<button onclick="window._aiCancelTask()" style="padding:6px 16px;border:1px solid #d9d9d9;background:#fff;border-radius:6px;cursor:pointer;font-size:12px">取消</button>' +
          '<button onclick="window._aiConfirmTask()" style="padding:6px 20px;border:none;background:#1890ff;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">✅ 确认创建</button>' +
        '</div>' +
      '</div>';

    // 插入到消息区（作为 AI 消息的附件）
    var msgs = document.getElementById('ai-chat-messages');
    var div = document.createElement('div');
    div.id = 'ai-card-wrap-' + cardId;
    div.style.cssText = 'display:flex;gap:8px;align-items:flex-start';
    div.innerHTML =
      '<span style="width:28px;height:28px;border-radius:50%;background:#1890ff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🤖</span>' +
      '<div style="max-width:95%;min-width:280px">' + cardHTML + '</div>';

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;

    task.confirmId = cardId;
  }

  function _nowStr() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
  }

  // ===== 确认/取消操作 =====
  window._aiConfirmTask = function() {
    var task = window._aiTask;
    if (!task || task.stage !== 'confirm') return;

    task.stage = 'execute';

    // 禁用按钮
    var btns = document.querySelectorAll('#' + task.confirmId + '-btns button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;

    try {
      var db = window.GD();
      var ot = CONFIG.operationTypes[task.type];

      // 权限检查
      if (window.hasPerm && window.hasPerm(ot.permKey) === false) {
        _updateCardBtns(task.confirmId, 'red', '❌ 无权限');
        _aiAddMsg('assistant', '创建失败：您没有' + ot.label + '的操作权限。');
        return;
      }

      // 分配 ID
      var newId = window.nid(db, ot.dbKey);
      task.fields.id = newId;

      // 构建订单
      var order = _buildOrderObject(task);

      // 写入
      db[ot.dbArray].push(order);

      // 红点通知
      if (window.addRedDot) addRedDot(db, ot.dbKey, newId, 'staff');
      if (window.saveD) saveD(db);
      if (window.updateAuditBadge) updateAuditBadge();

      if (window.toast) toast('✅ 已创建：' + order.code);

      // 更新卡片为成功
      _updateCardBtns(task.confirmId, 'green', '✅ 已创建 ' + order.code);
      _aiAddMsg('assistant', ot.label + '已创建成功！单号：<b>' + order.code + '</b>。<br>可在"' + ot.label + '"页面查看和提交审核。');

    } catch(e) {
      _updateCardBtns(task.confirmId, 'red', '❌ 失败');
      _aiAddMsg('assistant', '创建失败：' + e.message + '。请重试或手动创建。');
      if (window.toast) toast('创建失败: ' + e.message);
    }

    // 3 秒后重置状态
    setTimeout(_aiResetTask, 3000);
  };

  window._aiCancelTask = function() {
    _updateCardBtns(window._aiTask.confirmId, 'gray', '已取消');
    _aiResetTask();
  };

  function _updateCardBtns(cardId, color, text) {
    var btnDiv = document.getElementById(cardId + '-btns');
    if (btnDiv) btnDiv.innerHTML = '<span style="color:' + (color === 'green' ? '#52c41a' : color === 'red' ? '#ff4d4f' : '#999') + ';font-size:12px;padding:4px">' + text + '</span>';
  }

  function _aiResetTask() {
    window._aiTask = {
      active: false, type: null, fields: {}, missing: [], stage: 'idle', confirmId: null
    };
  }

  // ===== 操作指令解析 =====
  // 从 DeepSeek 回复末尾提取 JSON 操作指令
  function _extractAction(answer) {
    if (!CONFIG.enableOperation) return null;
    var m = answer.match(/\n```json\s*\n([\s\S]*?)\n```\s*$/);
    if (!m) {
      // 尝试更宽松的格式：[ACTION:...] 或裸 JSON 块
      var m2 = answer.match(/^\[ACTION:(create):(purchaseOrder|salesOrder):(.+)\]$/m);
      if (m2) return { action: m2[1], type: m2[2], raw: m2[3] };
      return null;
    }
    try {
      var instr = JSON.parse(m[1]);
      return instr;
    } catch(e) {
      return null;
    }
  }

  // 去掉指令块的纯文本
  function _stripActionText(answer) {
    var idx = answer.lastIndexOf('\n```json');
    if (idx >= 0) return answer.substring(0, idx).trim();
    // 兼容 [ACTION:...] 格式
    var m = answer.match(/\n\[ACTION:/);
    if (m) return answer.substring(0, answer.lastIndexOf('\n[ACTION:')).trim();
    return answer;
  }

  // 处理操作指令
  function _handleAction(instr, cleanText, query) {
    var task = window._aiTask;
    var data = instr.data || {};

    if (instr.action === 'cancel') {
      _aiResetTask();
      if (cleanText) _aiAddMsg('assistant', cleanText || '已取消。');
      return;
    }

    if (instr.action === 'ask_missing') {
      // LLM 追问：重置 task 进入收集状态
      task.active = true;
      task.type = data.orderType || 'purchaseOrder';
      task.fields = data.fields || {};
      task.missing = data.missing || [];
      task.stage = 'collecting';
      _aiAddMsg('assistant', cleanText || data.message || '请补充以下信息：' + (task.missing.join('、')));
      return;
    }

    if (instr.action === 'create_order') {
      var f = data.fields || {};
      var orderType = data.orderType || 'purchaseOrder';
      var ot = CONFIG.operationTypes[orderType];

      // Step 1: 解析供应商/客户
      var partnerName = f.supplierName || f.customerName || '';
      var partnerRes = _resolvePartner(partnerName, orderType);
      if (!partnerRes.matched) {
        var hint = partnerRes.ambiguous
          ? ('"'+partnerName+'"匹配到多个结果：'+partnerRes.candidates.map(function(c){return c.name;}).join('、')+'，请明确。')
          : ('找不到"' + partnerName + '"，请检查名称是否正确。');
        _aiAddMsg('assistant', (cleanText || '') + '\n\n⚠️ ' + hint + '\n当前系统中' + (orderType==='purchaseOrder'?'供应商':'客户') + '共' + ((window.GD()||{})[ot.partnerList]||[]).length + '个。');
        return;
      }
      // 检查用户回答是否有权限执行此操作
      if (window.hasPerm && orderType === 'purchaseOrder' && !hasPerm('purchase-order')) {
        _aiAddMsg('assistant', cleanText + '\n\n⚠️ 注意：您没有购买管理权限，无法创建采购订单。');
        return;
      }
      if (window.hasPerm && orderType === 'salesOrder' && !hasPerm('sales-order')) {
        _aiAddMsg('assistant', cleanText + '\n\n⚠️ 注意：您没有销售管理权限，无法创建销售订单。');
        return;
      }

      // Step 2: 解析商品
      var items = (f.items || []).map(function(item) {
        var gName = item.goodsName || item.name || '';
        var gRes = _resolveGoods(gName);
        if (!gRes.matched) {
          return { goodsName: gName, goodsId: null, qty: item.qty || 0, price: item.price || 0, _unresolved: true, _hint: gRes.ambiguous ? gRes.candidates.slice(0,3).map(function(c){return c.name;}).join('、') : '' };
        }
        return { goodsName: gRes.name, goodsId: gRes.id, qty: parseFloat(item.qty) || 0, price: parseFloat(item.price) || 0 };
      });

      var unresolved = items.filter(function(it) { return it._unresolved; });
      if (unresolved.length > 0) {
        var errItems = unresolved.map(function(it) {
          return '"' + it.goodsName + '"' + (it._hint ? '（您是指：' + it._hint + '？）' : '未找到匹配商品');
        }).join('；');
        _aiAddMsg('assistant', (cleanText || '') + '\n\n⚠️ ' + errItems + '。当前系统共' + ((window.GD()||{}).goods||[]).length + '个商品。');
        return;
      }

      // Step 3: 组装 fields
      var orderFields = {
        supplierId: orderType === 'purchaseOrder' ? partnerRes.id : null,
        customerId: orderType === 'salesOrder' ? partnerRes.id : null,
        date: f.date || _nowStr(),
        note: f.note || '',
        details: items,
        code: f.code || ''
      };
      // 清理不需要的字段
      if (orderType === 'purchaseOrder') delete orderFields.customerId;
      if (orderType === 'salesOrder') delete orderFields.supplierId;

      // Step 4: 检查是否完整
      if (data.complete) {
        // 展示确认卡片
        task.active = true;
        task.type = orderType;
        task.fields = orderFields;
        task.stage = 'confirm';
        if (cleanText) _aiAddMsg('assistant', cleanText);
        _aiAddConfirmCard();
      } else {
        // 不完整，进入收集状态
        task.active = true;
        task.type = orderType;
        task.fields = orderFields;
        task.missing = data.missing || [];
        task.stage = 'collecting';
        _aiAddMsg('assistant', (cleanText || data.message || '还需要补充信息。'));
      }
      return;
    }

    // 未知 action，普通显示
    _aiAddMsg('assistant', cleanText);
  }

  // ===== 构建问答上下文 =====
  function buildContext(query) {
    // 获取 RAG 检索结果（两种方法）
    var keywordResults = keywordSearch(query);
    var vectorResults = vectorSearch(query);

    // 获取业务数据
    var bizData = queryBusinessData(query);

    var context = '';

    // 向量检索结果
    if (vectorResults.length > 0) {
      context += '【向量检索相关知识点】（方法一：TF-IDF 向量相似度）\n';
      vectorResults.forEach(function(r, i) {
        context += (i + 1) + '. [' + r.doc.title + '] (相似度: ' + r.score + '%) ' + r.doc.content + '\n';
      });
    }

    // 关键词匹配结果
    if (keywordResults.length > 0) {
      context += '\n【关键词匹配相关知识点】（方法二：关键词+子串匹配）\n';
      keywordResults.forEach(function(r, i) {
        context += (i + 1) + '. [' + r.doc.title + '] (得分: ' + r.score + ') ' + r.doc.content + '\n';
      });
    }

    // 业务数据
    if (bizData) {
      context += '\n【当前系统实时业务数据】\n';
      context += '- 商品总数: ' + bizData.goodsCount + ' 个, 供应商: ' + bizData.supplierCount + ' 个, 客户: ' + bizData.customerCount + ' 个, 仓库: ' + bizData.warehouseCount + ' 个\n';
      if (bizData.totalPending !== undefined && bizData.totalPending > 0) {
        context += '- 所有待审核单据: ' + bizData.totalPending + ' 笔\n';
      }
      // 匹配到的具体商品
      if (bizData.matchedGoods && bizData.matchedGoods.length > 0) {
        context += '- 匹配到的商品:\n';
        bizData.matchedGoods.forEach(function(g) {
          context += '  · ' + g.name + '（编码:' + g.code + ' 行业:' + (g.industryType || '通用') + '）';
          if (g.inventory && g.inventory.length > 0) {
            context += ' | 库存: ';
            g.inventory.forEach(function(inv, j) {
              context += inv.warehouse + ' ' + inv.qty + '件';
              if (inv.warnQty > 0 && inv.qty < inv.warnQty) context += '⚠️低于预警线(' + inv.warnQty + ')';
              if (j < g.inventory.length - 1) context += ', ';
            });
          } else {
            context += ' | 暂无库存记录';
          }
          context += '\n';
        });
      }
      // 匹配到的供应商
      if (bizData.matchedSuppliers && bizData.matchedSuppliers.length > 0) {
        context += '- 匹配到的供应商:\n';
        bizData.matchedSuppliers.forEach(function(s) {
          context += '  · ' + s.name + '（联系人:' + (s.contact || '无') + ' 电话:' + (s.phone || '无') + '）\n';
        });
      }
      // 匹配到的客户
      if (bizData.matchedCustomers && bizData.matchedCustomers.length > 0) {
        context += '- 匹配到的客户:\n';
        bizData.matchedCustomers.forEach(function(c) {
          context += '  · ' + c.name + '（联系人:' + (c.contact || '无') + ' 电话:' + (c.phone || '无') + '）\n';
        });
      }
      // 匹配到的仓库
      if (bizData.matchedWarehouses && bizData.matchedWarehouses.length > 0) {
        context += '- 匹配到的仓库: ' + bizData.matchedWarehouses.map(function(w) { return w.name; }).join('、') + '\n';
      }
      // 库存预警
      if (bizData.inventoryAlerts && bizData.inventoryAlerts.length > 0) {
        context += '- 库存预警:\n';
        bizData.inventoryAlerts.forEach(function(s) { context += '  ' + s + '\n'; });
      }
      // 采购/销售统计（仅在问相关问题时出现）
      if (bizData.purchaseOrders !== undefined) {
        context += '- 采购订单: ' + bizData.purchaseOrders + ' 笔, 销售订单: ' + bizData.salesOrders + ' 笔, 待审核: ' + bizData.pendingAudit + ' 笔\n';
      }
      if (bizData.relatedPurchaseOrders && bizData.relatedPurchaseOrders.length > 0) {
        context += '- 关联采购单:\n';
        bizData.relatedPurchaseOrders.forEach(function(po) {
          context += '  · #' + po.id + ' 审核状态:' + (po.auditStatus || '未设置') + '\n';
        });
      }
      if (bizData.checkOrders !== undefined) {
        context += '- 盘点单: ' + bizData.checkOrders + ' 笔\n';
      }
    }

    return context || '未检索到相关知识。';
  }

  // ===== 构建 Prompt =====
  function buildPrompt(query, context, history) {
    var systemPrompt = '你是象过河仓库管理系统(WMS)的AI助手。你的职责是帮用户了解系统功能、解决操作问题、查询业务数据，并**直接帮用户在系统中创建单据**。\n\n' +
      '系统背景：这是一款面向中小仓库的Web管理系统，覆盖采购、销售、库存、财务、审核等20+业务模块。\n' +
      '系统是纯前端SPA(无框架)+后端REST API架构。\n\n' +
      '回答规则：\n' +
      '1. 优先结合"当前系统实时业务数据"中的信息回答用户关于具体实体（商品/仓库/供应商/客户）的问题\n' +
      '2. 当用户问"XXX能不能入库"时：检查数据中是否匹配到该商品→如找到则说明该商品存在、可以入库（需走采购入库流程）→如未找到则说明系统中还没有该商品，需要先在"商品信息"中新增\n' +
      '3. 如果提供了业务数据，可结合实际数据给出建议\n' +
      '4. 回答应简洁、实用、面向操作者\n' +
      '5. 如果用户问"怎么操作"，给出具体步骤，不要只说概念\n' +
      '6. 用中文回答，不要编造数据库中不存在的商品名和数字\n' +
      '\n--- 操作指令模式（当用户明确要求创建订单时使用）---\n\n' +
      '你**可以直接帮用户创建订单**。当用户说"帮我建XX订单"、"创建一个XX单"时，在回答末尾附加一个 JSON 指令块（以 \\n```json 开头，以 \\n``` 结尾，放在最后一行）。\n\n' +
      '## 指令格式\n' +
      '在回答文本的最后附上：\n' +
      '```json\n{"action":"<动作>","data":{...}}\n```\n\n' +
      '## 支持的动作\n\n' +
      '1. **create_order** — 用户要求创建订单\n' +
      '   data: {"orderType":"purchaseOrder"|"salesOrder", "fields":{"supplierName/customerName":"xx", "items":[{"goodsName":"商品名","qty":数量,"price":单价}], "date":"2026-07-30", "note":""}, "complete":true|false, "message":"给用户看的摘要..."}\n' +
      '   - complete=true: 所有必填字段已收集完毕（至少：供应商/客户 + 至少1个明确商品 + 数量≥0）\n' +
      '   - complete=false: 还有缺失字段，同时用 ask_missing 追问\n\n' +
      '2. **ask_missing** — 字段不全，追问用户\n' +
      '   data: {"orderType":"purchaseOrder"|"salesOrder", "fields":{...已收集的字段}, "missing":["字段名"], "message":"追问文字..."}\n\n' +
      '3. **cancel** — 用户取消或变更注意\n' +
      '   data: {"message":"已取消"}\n\n' +
      '## 必填字段\n' +
      '- purchaseOrder: supplierName(供应商名称), items(每项含goodsName商品名/qty数量/price单价)\n' +
      '- salesOrder: customerName(客户名称), items(每项含goodsName商品名/qty数量/price单价)\n' +
      '- date 默认今天，note 可选\n\n' +
      '## 主动提议\n' +
      '当你回答问题后发现：库存低于预警线 → 可提议"需要我帮你创建补货采购订单吗？"→附 create_order 指令\n' +
      '提议以问句结尾，给用户拒绝的余地。\n\n' +
      '## 重要\n' +
      '- 普通问答（"怎么建采购订单？"）不输出 JSON 块，只回答步骤\n' +
      '- 创建操作（"帮我建！"）才输出 JSON 块\n' +
      '- JSON 必须放在 \\n```json ... \\n``` 中，放在回答的最后\n' +
      '- 每个回复最多一个 JSON 块';

    var userPrompt = '用户问题：' + query + '\n\n' +
      '相关知识库内容：\n' + context + '\n\n' +
      '请根据以上知识库内容和系统数据回答用户的问题。如果用户要求创建订单，在回答末尾附加JSON操作指令。';

    // 如果当前有进行中的操作任务，注入任务上下文
    var task = window._aiTask;
    if (task && task.active && task.stage === 'collecting') {
      userPrompt += '\n\n【当前操作用上下文】\n你正在帮用户创建' +
        (CONFIG.operationTypes[task.type] ? CONFIG.operationTypes[task.type].label : task.type) +
        '。已收集字段: ' + JSON.stringify(task.fields) +
        '。缺失字段: ' + JSON.stringify(task.missing || []) +
        '。用户本次回复可能补全了字段，请更新你的create_order指令。';
    }

    var messages = [{ role: 'system', content: systemPrompt }];

    // 添加历史消息（最近6条）
    if (history && history.length > 0) {
      var recent = history.slice(-6);
      recent.forEach(function(h) {
        messages.push({ role: h.role, content: h.content });
      });
    }

    messages.push({ role: 'user', content: userPrompt });
    return messages;
  }

  // ===== 浮动聊天窗口 UI =====
  function initChatUI() {
    // 检查是否已存在
    if (document.getElementById('ai-chat-container')) return;

    var container = document.createElement('div');
    container.id = 'ai-chat-container';
    container.innerHTML =
      '<!-- 浮动按钮 -->' +
      '<div id="ai-chat-bubble" style="position:fixed;' + CONFIG.position.split('-').reverse().join(':20px;') + ':20px;' +
      'width:' + CONFIG.bubbleSize + 'px;height:' + CONFIG.bubbleSize + 'px;' +
      'background:linear-gradient(135deg,#1890ff,#722ed1);border-radius:50%;' +
      'box-shadow:0 4px 16px rgba(24,144,255,.4);cursor:pointer;z-index:9998;' +
      'display:flex;align-items:center;justify-content:center;font-size:22px;' +
      'transition:transform .2s;user-select:none"' +
      'onmouseover="this.style.transform=\'scale(1.1)\'" onmouseout="this.style.transform=\'scale(1)\'">' +
      '🤖</div>' +

      // 对话窗口
      '<div id="ai-chat-window" style="display:none;position:fixed;' + CONFIG.position.split('-').reverse().join(':20px;') + ':78px;' +
      'width:' + CONFIG.windowWidth + 'px;height:' + CONFIG.windowHeight + 'px;' +
      'background:#fff;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:9998;' +
      'display:none;flex-direction:column;overflow:hidden;font-size:13px">' +

      // 头部
      '<div style="background:linear-gradient(135deg,#1890ff,#722ed1);color:#fff;padding:12px 16px;' +
      'display:flex;align-items:center;justify-content:space-between;flex-shrink:0">' +
      '<span style="font-weight:600">🤖 AI 仓库智能助手</span>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<span style="font-size:10px;opacity:.8;cursor:pointer;padding:2px 8px;background:rgba(255,255,255,.2);border-radius:10px" ' +
      'onclick="document.querySelector(\'#ai-chat-mode-indicator\').style.display=\'flex\'">切换搜索模式</span>' +
      '<span style="cursor:pointer;font-size:18px;line-height:1" onclick="document.getElementById(\'ai-chat-window\').style.display=\'none\'">×</span>' +
      '</div></div>' +

      // 搜索模式指示器
      '<div id="ai-chat-mode-indicator" style="display:none;flex;gap:6px;padding:8px 12px;background:#f0f5ff;border-bottom:1px solid #e8e8e8;font-size:11px;align-items:center;justify-content:center;flex-shrink:0">' +
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="ai-search-mode" value="rag" checked onchange="window._aiSearchMode=\'rag\'"> 📊 RAG向量检索</label>' +
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:12px"><input type="radio" name="ai-search-mode" value="keyword" onchange="window._aiSearchMode=\'keyword\'"> 🔑 关键词匹配</label>' +
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:12px"><input type="radio" name="ai-search-mode" value="business" onchange="window._aiSearchMode=\'business\'"> 📈 仅业务数据</label>' +
      '<button onclick="document.getElementById(\'ai-chat-mode-indicator\').style.display=\'none\'" style="margin-left:auto;border:none;background:none;cursor:pointer;font-size:14px">×</button>' +
      '</div>' +

      // 消息区域
      '<div id="ai-chat-messages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px">' +
      '<div style="display:flex;gap:8px;align-items:flex-start">' +
      '<span style="width:28px;height:28px;border-radius:50%;background:#1890ff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🤖</span>' +
      '<div style="background:#f0f5ff;padding:10px 14px;border-radius:12px 12px 12px 4px;max-width:80%;line-height:1.6">' +
      '你好！我是象过河仓库管理系统的AI助理。<br><br>你可以问我：<br>' +
      '📦 <b>操作类</b>：直接帮你创建采购订单/销售订单<br>' +
      '📊 <b>数据类</b>："当前库存有什么预警？"<br>' +
      '🔍 <b>功能类</b>："二维码出入库怎么用？"<br><br>' +
      '💬 试试说："<b>帮我建一个采购订单</b>"<br>' +
      '<span style="font-size:11px;color:#888">💡 点击上方"切换搜索模式"可对比 RAG 向量检索 vs 关键词匹配 vs 仅查业务数据</span>' +
      '</div></div></div>' +

      // 输入区
      '<div style="padding:10px 12px;border-top:1px solid #f0f0f0;display:flex;gap:8px;flex-shrink:0;background:#fafafa">' +
      '<input id="ai-chat-input" type="text" placeholder="输入问题…" style="flex:1;padding:8px 12px;border:1px solid #e8e8e8;border-radius:20px;font-size:13px;outline:none" ' +
      'onkeydown="if(event.key===\'Enter\')window._aiSend()">' +
      '<button onclick="window._aiSend()" style="width:36px;height:36px;border-radius:50%;background:#1890ff;color:#fff;border:none;cursor:pointer;font-size:16px;flex-shrink:0">➤</button>' +
      '</div>' +
      '<div style="text-align:center;padding:4px 12px 8px;font-size:10px;color:#bbb;flex-shrink:0">' +
      '演示版 v2.0 · DeepSeek + RAG · 可操作AI</div>' +
      '</div>';

    document.body.appendChild(container);

    // 初始化搜索模式
    window._aiSearchMode = window._aiSearchMode || 'rag';
    window._aiHistory = [];

    // 浮动按钮点击
    document.getElementById('ai-chat-bubble').onclick = function() {
      var win = document.getElementById('ai-chat-window');
      if (win.style.display === 'none' || win.style.display === '') {
        win.style.display = 'flex';
        document.getElementById('ai-chat-input').focus();
      } else {
        win.style.display = 'none';
      }
    };
  }

  // ===== 发送消息 =====
  window._aiSend = function() {
    var input = document.getElementById('ai-chat-input');
    var query = (input.value || '').trim();
    if (!query) return;

    input.value = '';

    // 显示用户消息
    _aiAddMsg('user', query);

    // === 检查是否有进行中的操作任务（用户正在回复字段补全）===
    var task = window._aiTask;
    if (task && task.active && task.stage === 'collecting') {
      // 检查取消
      if (/取消|算了|不要了|放弃|不了/.test(query)) {
        _aiAddMsg('assistant', '好的，已取消当前操作。');
        _aiResetTask();
        return;
      }
      // 任务中回复：带上任务上下文，让 LLM 重新解析
      // 仍然走正常的 send 流程，但 buildPrompt 会注入任务上下文
    } else {
      // 新对话：检查是否是纯取消
      if (task && task.active && /取消|算了|不要了|放弃/.test(query)) {
        _aiAddMsg('assistant', '好的，已取消当前操作。');
        _aiResetTask();
        window._aiHistory.push({ role: 'user', content: query });
        window._aiHistory.push({ role: 'assistant', content: '好的，已取消当前操作。' });
        return;
      }
    }

    // 显示加载状态
    var loadingId = _aiAddMsg('assistant', '🤔 正在检索知识库并调用 DeepSeek...');

    // 获取搜索模式
    var mode = window._aiSearchMode || 'rag';

    // 构建上下文（按所选模式）
    var context = '';
    if (mode === 'rag') {
      context = buildContext(query);
    } else if (mode === 'keyword') {
      var kwResults = keywordSearch(query);
      if (kwResults.length > 0) {
        context = '【关键词匹配结果】\n';
        kwResults.forEach(function(r, i) {
          context += (i+1) + '. [' + r.doc.title + '] (得分:' + r.score + ') ' + r.doc.content + '\n';
        });
      }
    } else if (mode === 'business') {
      var bizData = queryBusinessData(query);
      if (bizData) {
        context = JSON.stringify(bizData, null, 2);
      } else {
        context = '未找到匹配的业务数据。';
      }
    }

    // 构建消息并调用 LLM
    var messages = buildPrompt(query, context, window._aiHistory);

    // 记录用户问题到历史
    window._aiHistory.push({ role: 'user', content: query });

    callDeepSeek(messages, function(err, answer) {
      // 移除加载消息
      var msgContainer = document.getElementById(loadingId);
      if (msgContainer) msgContainer.remove();

      if (err) {
        // API 不可用时的降级方案
        if (err === '__LOCAL_ONLY__') {
          var _local = context || '本地知识库没有检索到相关内容，换个说法再试试。';
          _aiAddMsg('assistant', _local + '\n\n---\n<span style="font-size:10px;color:#999">📎 来自本地知识库检索</span>');
        } else {
          _aiAddMsg('assistant', '⚠️ ' + err + '\n\n以下为本地检索结果：\n\n' + context);
        }
      } else {
        // 尝试从回复末尾提取操作指令
        var action = _extractAction(answer);
        var cleanText = _stripActionText(answer);

        if (action && CONFIG.enableOperation && (action.action === 'create_order' || action.action === 'ask_missing' || action.action === 'cancel')) {
          // 操作模式：处理指令
          _handleAction(action, cleanText, query);
          // 仍然记录到历史
          window._aiHistory.push({ role: 'assistant', content: cleanText || (action.action + '指令已处理') });
        } else {
          // 普通问答流程
          var finalAnswer = answer;
          if (context) {
            finalAnswer += '\n\n---\n<span style="font-size:10px;color:#999">📎 检索来源: ' +
              (mode === 'rag' ? 'RAG向量检索' : mode === 'keyword' ? '关键词匹配' : '业务数据查询') +
              '</span>';
          }
          _aiAddMsg('assistant', finalAnswer);
          window._aiHistory.push({ role: 'assistant', content: answer });

          // 检查是否有主动提议标记 [SUGGEST:...]
          var suggestMatch = answer.match(/\[SUGGEST:(create):(purchaseOrder|salesOrder):(.+)\]/);
          if (suggestMatch) {
            _aiAddSuggestionBubble(suggestMatch[2], suggestMatch[3]);
          }
        }
      }
    });
  };

  // ===== 主动提议气泡 =====
  function _aiAddSuggestionBubble(orderType, hint) {
    var ot = CONFIG.operationTypes[orderType];
    if (!ot) return;
    var cardId = 'ai-suggest-' + Date.now();
    var msgs = document.getElementById('ai-chat-messages');
    var div = document.createElement('div');
    div.id = cardId;
    div.style.cssText = 'display:flex;gap:8px;align-items:flex-start';
    div.innerHTML =
      '<span style="width:28px;height:28px;border-radius:50%;background:#1890ff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🤖</span>' +
      '<div style="max-width:90%"><div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:10px;padding:10px 14px;font-size:12px;line-height:1.6;margin-bottom:8px">' +
      '💡 ' + (hint || ('需要我帮你创建' + ot.label + '吗？')) +
      '</div>' +
      '<button onclick="var d=document.getElementById(\'' + cardId + '\');if(d)d.remove();window._aiTask={active:true,type:\'' + orderType + '\',fields:{},missing:[],stage:\'idle\',confirmId:null};var inp=document.getElementById(\'ai-chat-input\');if(inp){inp.value=\'帮我创建' + ot.label + '\';inp.focus();}return false;" ' +
      'style="padding:5px 14px;border:1px solid #1890ff;background:#fff;color:#1890ff;border-radius:6px;cursor:pointer;font-size:11px;margin-right:6px">✅ 好的，帮我创建</button>' +
      '<button onclick="var d=document.getElementById(\'' + cardId + '\');if(d)d.remove();return false;" ' +
      'style="padding:5px 14px;border:1px solid #d9d9d9;background:#fff;color:#999;border-radius:6px;cursor:pointer;font-size:11px">✕ 不用了</button>' +
      '</div></div>';

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ===== 添加消息 =====
  function _aiAddMsg(role, text) {
    var msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return '';

    var msgId = 'ai-msg-' + Date.now();
    var div = document.createElement('div');
    div.id = msgId;
    div.style.cssText = 'display:flex;gap:8px;align-items:flex-start;' +
      (role === 'user' ? 'flex-direction:row-reverse' : '');

    var isUser = (role === 'user');
    var avatar = isUser ? '👤' : '🤖';
    var bgColor = isUser ? '#1890ff' : '#f0f5ff';
    var textColor = isUser ? '#fff' : '#333';
    var borderRadius = isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px';

    div.innerHTML =
      '<span style="width:28px;height:28px;border-radius:50%;background:' + (isUser ? '#52c41a' : '#1890ff') + ';' +
      'display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">' + avatar + '</span>' +
      '<div style="background:' + bgColor + ';color:' + textColor + ';padding:10px 14px;border-radius:' + borderRadius + ';' +
      'max-width:80%;line-height:1.7;font-size:13px;word-break:break-word">' +
      text.replace(/\n/g, '<br>') +
      '</div>';

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return msgId;
  }

  // ===== 导入 wms-core.js 中的数据函数 =====
  // GD() 和 saveD() 由 wms-core.js 全局定义，直接使用 window 作用域

  // ===== 初始化 =====
  function init() {
    // 只在 index.html 中显示（桌面版）
    // mobile.html 不需要浮动聊天窗口
    if (window.innerWidth < 768) return; // 手机端不显示

    // 等页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initChatUI);
    } else {
      initChatUI();
    }
  }

  init();

  // 导出供调试
  window.AIAssistant = {
    search: keywordSearch,
    vectorSearch: vectorSearch,
    queryBusinessData: queryBusinessData,
    knowledgeBase: KNOWLEDGE_BASE,
    task: function() { return window._aiTask; },
    resetTask: _aiResetTask,
    resolveSupplier: function(n) { return _resolvePartner(n, 'purchaseOrder'); },
    resolveCustomer: function(n) { return _resolvePartner(n, 'salesOrder'); },
    resolveGoods: _resolveGoods
  };

  console.log('[AI] 象过河智能助手 v2.0 ✓ 知识库:' + KNOWLEDGE_BASE.length + '条 | 操作型AI：采购/销售订单创建');
})();
