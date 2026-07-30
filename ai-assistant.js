// ===== ai-assistant.js: 象过河仓库管理系统 AI 智能助手 =====
// 集成 DeepSeek API + RAG 知识库 + 浮动聊天窗口
// 版本: v1.0 (2026-07-28)

(function() {
  'use strict';

  // ===== 配置 =====
  var CONFIG = {
    // DeepSeek API 配置（面试演示：替换为你的 API Key）
    apiKey: 'sk-d24c216ea5d04ee8b70f872923ee5703',  // DeepSeek API Key
    apiEndpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',  // DeepSeek V3
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
    // 如果没有 API Key，返回空（触发降级模式）
    if (CONFIG.apiKey === '%%DEEPSEEK_API_KEY%%' || !CONFIG.apiKey) {
      callback(null, null);
      return;
    }

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CONFIG.apiEndpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + CONFIG.apiKey);
      xhr.timeout = 30000;

      xhr.onload = function() {
        if (xhr.status === 200) {
          try {
            var resp = JSON.parse(xhr.responseText);
            var answer = resp.choices && resp.choices[0] && resp.choices[0].message ?
              resp.choices[0].message.content : '[API返回格式异常]';
            callback(null, answer);
          } catch(e) { callback('解析响应失败: ' + e.message); }
        } else {
          callback('API 错误 (' + xhr.status + '): ' + (xhr.responseText || '').substring(0, 200));
        }
      };
      xhr.onerror = function() { callback('网络错误，无法连接 DeepSeek API'); };
      xhr.ontimeout = function() { callback('API 请求超时'); };

      xhr.send(JSON.stringify({
        model: CONFIG.model,
        messages: messages,
        max_tokens: CONFIG.maxTokens,
        temperature: CONFIG.temperature,
        stream: false
      }));
    } catch(e) {
      callback('调用失败: ' + e.message);
    }
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
    var systemPrompt = '你是象过河仓库管理系统(WMS)的AI助手。你的职责是帮用户了解系统功能、解决操作问题、查询业务数据。\n\n' +
      '系统背景：这是一款面向中小仓库的Web管理系统，覆盖采购、销售、库存、财务、审核等20+业务模块。\n' +
      '系统是纯前端SPA(无框架)+后端REST API架构。\n\n' +
      '回答规则：\n' +
      '1. 优先结合"当前系统实时业务数据"中的信息回答用户关于具体实体（商品/仓库/供应商/客户）的问题\n' +
      '2. 当用户问"XXX能不能入库"时：检查数据中是否匹配到该商品→如找到则说明该商品存在、可以入库（需走采购入库流程）→如未找到则说明系统中还没有该商品，需要先在"商品信息"中新增\n' +
      '3. 如果提供了业务数据，可结合实际数据给出建议\n' +
      '4. 回答应简洁、实用、面向操作者\n' +
      '5. 如果用户问"怎么操作"，给出具体步骤，不要只说概念\n' +
      '6. 用中文回答，不要编造数据库中不存在的商品名和数字';

    var userPrompt = '用户问题：' + query + '\n\n' +
      '相关知识库内容：\n' + context + '\n\n' +
      '请根据以上知识库内容和系统数据回答用户的问题。';

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
      '你好！我是象过河仓库管理系统的AI助理员。<br><br>你可以问我：<br>' +
      '📦 <b>操作类</b>："怎么创建采购订单？"<br>' +
      '📊 <b>数据类</b>："当前库存有什么预警？"<br>' +
      '🔍 <b>功能类</b>："二维码出入库怎么用？"<br><br>' +
      '<span style="font-size:11px;color:#888">💡 点击上方"切换搜索模式"可对比 RAG 向量检索 vs 关键词匹配 vs 仅查业务数据</span>' +
      '</div></div></div>' +

      // 输入区
      '<div style="padding:10px 12px;border-top:1px solid #f0f0f0;display:flex;gap:8px;flex-shrink:0;background:#fafafa">' +
      '<input id="ai-chat-input" type="text" placeholder="输入问题…" style="flex:1;padding:8px 12px;border:1px solid #e8e8e8;border-radius:20px;font-size:13px;outline:none" ' +
      'onkeydown="if(event.key===\'Enter\')window._aiSend()">' +
      '<button onclick="window._aiSend()" style="width:36px;height:36px;border-radius:50%;background:#1890ff;color:#fff;border:none;cursor:pointer;font-size:16px;flex-shrink:0">➤</button>' +
      '</div>' +
      '<div style="text-align:center;padding:4px 12px 8px;font-size:10px;color:#bbb;flex-shrink:0">' +
      '演示版 v1.0 · DeepSeek + RAG</div>' +
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
        _aiAddMsg('assistant', '⚠️ ' + err + '\n\n以下为本地检索结果：\n\n' + context);
      } else {
        // 显示最终答案
        var finalAnswer = answer;
        if (context) {
          finalAnswer += '\n\n---\n<span style="font-size:10px;color:#999">📎 检索来源: ' +
            (mode === 'rag' ? 'RAG向量检索' : mode === 'keyword' ? '关键词匹配' : '业务数据查询') +
            '</span>';
        }
        _aiAddMsg('assistant', finalAnswer);
        window._aiHistory.push({ role: 'assistant', content: answer });
      }
    });
  };

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
    knowledgeBase: KNOWLEDGE_BASE
  };

  console.log('[AI] 象过河智能助手已加载 ✓ 知识库:' + KNOWLEDGE_BASE.length + '条 搜索模式:双模式(RAG向量+关键词)');
})();
