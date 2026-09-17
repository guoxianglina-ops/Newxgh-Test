/* ===== 仓储系统展示用演示数据（临时文件）=================================
 *
 * 目的：让访客打开演示站就看到一个「有业务在跑」的系统，而不是一排空表。
 *
 * 为什么必须写成代码里的初始种子、而不是在页面上手工录单：
 *   本系统在后端不可达时会降级成 localStorage 模式（见 wms-core.js 的 _wms_api_mode），
 *   数据只存在每个访客自己的浏览器里。所以在某一台浏览器里手工录的单，别人根本看不到。
 *   只有写进 initDB 的初始种子，每个访客打开才都能看到。
 *
 * 怎么撤掉：
 *   1) 把下面的 WMS_DEMO_SEED_ENABLED 改成 false
 *   2) 删掉 index.html / mobile.html 里那一行 <script src="demo-seed.js"></script>
 *   3) 删掉本文件
 *   就干净了，wms-core.js 里只留了一行 `if(typeof seedDemoData==='function')...` 的调用。
 *
 * 关于 WMS_DEMO_SEED_VERSION：
 *   版本号一变，会强制清掉旧的本地库（localStorage['wms_v2']）并按新种子重建一次。
 *   这样已经打开过站点的访客（包括你自己的浏览器）也能看到新数据，不用手动清缓存。
 * ====================================================================== */

var WMS_DEMO_SEED_ENABLED = true;
var WMS_DEMO_SEED_VERSION = '2026-09-17-b';

(function () {
  try {
    if (localStorage.getItem('wms_demo_seed') !== WMS_DEMO_SEED_VERSION) {
      localStorage.removeItem('wms_v2');
      localStorage.setItem('wms_demo_seed', WMS_DEMO_SEED_VERSION);
    }
  } catch (e) {}
})();

function seedDemoData(db) {
  if (!WMS_DEMO_SEED_ENABLED) return db;

  var WH = { 1: '总仓库', 2: '原材料仓' };

  // 拼一条溯源链上的节点（字段与 wms-core.js 的 appendLink 保持一致）
  function link(action, code, date, qty, price, whId) {
    return {
      action: action, code: code, date: date, qty: qty, price: price,
      warehouseId: whId || null, warehouseName: whId ? WH[whId] : ''
    };
  }

  // ---------- 1. 补充商品，让单据明细不至于只有 3 个 SKU ----------
  db.goods.push(
    { id: 4, code: 'SP004', name: '办公打印纸', spec: 'A4 500张/包', model: '', unit: '包', barcode: '6901234567893', category: '包装物', purchPrice: 18, costPrice: 16, retailPrice: 26, industryType: 'general', status: '正常', note: '' },
    { id: 5, code: 'SP005', name: '包装纸箱', spec: '中号 400x300x300', model: '', unit: '个', barcode: '6901234567894', category: '包装物', purchPrice: 3.2, costPrice: 2.8, retailPrice: 5, industryType: 'general', status: '正常', note: '' },
    { id: 6, code: 'SP006', name: '工业清洁剂', spec: '1L/桶', model: '', unit: '桶', barcode: '6901234567895', category: '原料', purchPrice: 22, costPrice: 19, retailPrice: 32, industryType: 'general', status: '正常', note: '' }
  );

  // ---------- 2. 库存（带批次，供「全链路批次溯源」展示）----------
  // 最后一条低于预警线，让「库存预警」页面有内容
  db.inventory = [
    {
      goodsId: 1, warehouseId: 1, qty: 110, warnQty: 20, batches: [
        {
          purchaseOrderCode: 'CGDD20260901001', purchaseInCode: 'CGRK20260903001',
          goodsId: 1, qty: 50, price: 10, date: '2026-09-03', remaining: 30, outRecords: [],
          batchCode: 'BTH-1-1-1', linkChain: [
            link('采购下单', 'CGDD20260901001', '2026-09-01', 50, 10, null),
            link('采购入库', 'CGRK20260903001', '2026-09-03', 50, 10, 1)
          ]
        }
      ]
    },
    {
      goodsId: 1, warehouseId: 2, qty: 20, warnQty: 10, batches: [
        {
          purchaseOrderCode: 'CGDD20260901001', purchaseInCode: 'CGRK20260903001',
          goodsId: 1, qty: 20, price: 10, date: '2026-09-07', remaining: 20, outRecords: [],
          batchCode: 'BTH-1-2-1', linkChain: [
            link('采购下单', 'CGDD20260901001', '2026-09-01', 50, 10, null),
            link('采购入库', 'CGRK20260903001', '2026-09-03', 50, 10, 1),
            link('调拨出', 'DB20260907001', '2026-09-07', 20, 0, 1),
            link('调拨入', 'DB20260907001', '2026-09-07', 20, 0, 2)
          ]
        }
      ]
    },
    {
      goodsId: 2, warehouseId: 1, qty: 115, warnQty: 10, batches: [
        {
          purchaseOrderCode: 'CGDD20260908002', purchaseInCode: 'CGRK20260910002',
          goodsId: 2, qty: 100, price: 25, date: '2026-09-10', remaining: 65, outRecords: [],
          batchCode: 'BTH-2-1-1', linkChain: [
            link('采购下单', 'CGDD20260908002', '2026-09-08', 100, 25, null),
            link('采购入库', 'CGRK20260910002', '2026-09-10', 100, 25, 1),
            link('销售出库', 'XSCK20260911002', '2026-09-11', 30, 35, 1),
            link('采购退货', 'CGTH20260912001', '2026-09-12', 5, 25, 1)
          ]
        }
      ]
    },
    { goodsId: 3, warehouseId: 1, qty: 15, warnQty: 5 },
    { goodsId: 4, warehouseId: 2, qty: 20, warnQty: 15 },
    { goodsId: 5, warehouseId: 2, qty: 400, warnQty: 100 },
    { goodsId: 6, warehouseId: 2, qty: 18, warnQty: 20 }
  ];

  // ---------- 3. 采购 ----------
  db.purchaseOrders = [
    {
      id: 1, code: 'CGDD20260901001', date: '2026-09-01', supplierId: 1, note: '9 月首批常规采购',
      details: [{ goodsId: 1, qty: 50, price: 10, amt: 500 }, { goodsId: 4, qty: 20, price: 18, amt: 360 }],
      totalAmt: 860, status: '已审核', inQty: 70, auditStatus: '已审核',
      attachments: [{ name: '采购合同扫描件.jpg', url: './demo-attachment.jpg' }],
      operatorId: '00', creatorId: '00'
    },
    {
      id: 2, code: 'CGDD20260908002', date: '2026-09-08', supplierId: 2, note: '食品原料补货',
      details: [{ goodsId: 2, qty: 100, price: 25, amt: 2500 }],
      totalAmt: 2500, status: '已审核', inQty: 100, auditStatus: '已审核', attachments: [],
      operatorId: '00', creatorId: '00'
    },
    {
      id: 3, code: 'CGDD20260915003', date: '2026-09-15', supplierId: 1, note: '包装物备料',
      details: [{ goodsId: 5, qty: 200, price: 3.2, amt: 640 }],
      totalAmt: 640, status: '草稿', inQty: 0, auditStatus: '待审核', attachments: [],
      operatorId: '00', creatorId: '00'
    }
  ];

  db.purchaseIn = [
    {
      id: 1, code: 'CGRK20260903001', date: '2026-09-03', supplierId: 1, warehouseId: 1, staffId: 3,
      note: '对应订单 CGDD20260901001',
      details: [{ goodsId: 1, qty: 50, price: 10, amt: 500 }, { goodsId: 4, qty: 20, price: 18, amt: 360 }],
      totalAmt: 860, status: '已付款', auditStatus: '已审核', purchaseOrderId: 1, paidAmt: 860,
      attachments: [], operatorId: '00', creatorId: '00'
    },
    {
      id: 2, code: 'CGRK20260910002', date: '2026-09-10', supplierId: 2, warehouseId: 1, staffId: 3,
      note: '对应订单 CGDD20260908002',
      details: [{ goodsId: 2, qty: 100, price: 25, amt: 2500 }],
      totalAmt: 2500, status: '部分付款', auditStatus: '已审核', purchaseOrderId: 2, paidAmt: 1500,
      attachments: [], operatorId: '00', creatorId: '00'
    },
    {
      id: 3, code: 'CGRK20260916003', date: '2026-09-16', supplierId: 1, warehouseId: 2, staffId: 3,
      note: '包装纸箱到货，待检验',
      details: [{ goodsId: 5, qty: 200, price: 3.2, amt: 640 }],
      totalAmt: 640, status: '未付款', auditStatus: '待审核', purchaseOrderId: null, paidAmt: 0,
      attachments: [], operatorId: '00', creatorId: '00'
    }
  ];

  db.purchaseReturn = [
    {
      id: 1, code: 'CGTH20260912001', date: '2026-09-12', warehouseId: 1, staffId: 3,
      note: '食品样品外包装破损，退回供应商',
      details: [{ goodsId: 2, qty: 5, price: 25, amt: 125 }],
      totalAmt: 125, auditStatus: '已审核', operatorId: '00', creatorId: '00'
    }
  ];

  db.purchasePayments = [
    {
      id: 1, code: 'FK20260904001', supplierId: 1, purchaseInCode: 'CGRK20260903001', purchaseInId: 1,
      date: '2026-09-04', amount: 860, payMethod: '银行转账', note: '全额结清',
      attachment: null, attachmentName: '', auditStatus: '已审核'
    },
    {
      id: 2, code: 'FK20260911002', supplierId: 2, purchaseInCode: 'CGRK20260910002', purchaseInId: 2,
      date: '2026-09-11', amount: 1500, payMethod: '银行转账', note: '先付 60%，余款月底结',
      attachment: null, attachmentName: '', auditStatus: '待审核'
    }
  ];

  // ---------- 4. 销售 ----------
  db.salesOrders = [
    {
      id: 1, code: 'XSDD20260902001', date: '2026-09-02', customerId: 1, note: '常规补货',
      details: [{ goodsId: 1, qty: 20, price: 15, amt: 300 }, { goodsId: 3, qty: 10, price: 80, amt: 800 }],
      totalAmt: 1100, status: '已审核', outQty: 30, auditStatus: '已审核', attachments: [],
      operatorId: '00', creatorId: '00'
    },
    {
      id: 2, code: 'XSDD20260909002', date: '2026-09-09', customerId: 2, note: '食品类走批发价',
      details: [{ goodsId: 2, qty: 30, price: 35, amt: 1050 }],
      totalAmt: 1050, status: '已审核', outQty: 30, auditStatus: '已审核', attachments: [],
      operatorId: '00', creatorId: '00'
    },
    {
      id: 3, code: 'XSDD20260914003', date: '2026-09-14', customerId: 1, note: '',
      details: [{ goodsId: 3, qty: 5, price: 80, amt: 400 }],
      totalAmt: 400, status: '草稿', outQty: 0, auditStatus: '待审核', attachments: [],
      operatorId: '00', creatorId: '00'
    }
  ];

  db.salesOut = [
    {
      id: 1, code: 'XSCK20260905001', date: '2026-09-05', customerId: 1, warehouseId: 1, staffId: 3,
      note: '对应订单 XSDD20260902001',
      details: [{ goodsId: 1, qty: 20, price: 15, amt: 300 }, { goodsId: 3, qty: 10, price: 80, amt: 800 }],
      totalAmt: 1100, status: '已收款', auditStatus: '已审核', salesOrderId: 1, receivedAmt: 1100,
      operatorId: '00', creatorId: '00'
    },
    {
      id: 2, code: 'XSCK20260911002', date: '2026-09-11', customerId: 2, warehouseId: 1, staffId: 3,
      note: '对应订单 XSDD20260909002',
      details: [{ goodsId: 2, qty: 30, price: 35, amt: 1050 }],
      totalAmt: 1050, status: '部分收款', auditStatus: '已审核', salesOrderId: 2, receivedAmt: 500,
      operatorId: '00', creatorId: '00'
    },
    {
      id: 3, code: 'XSCK20260916003', date: '2026-09-16', customerId: 1, warehouseId: 1, staffId: 3,
      note: '待审核，尚未出库',
      details: [{ goodsId: 3, qty: 5, price: 80, amt: 400 }],
      totalAmt: 400, status: '未收款', auditStatus: '待审核', salesOrderId: null, receivedAmt: 0,
      operatorId: '00', creatorId: '00'
    }
  ];

  db.salesReturn = [
    {
      id: 1, code: 'XSTH20260913001', date: '2026-09-13', warehouseId: 1, staffId: 3,
      note: '客户反馈色差，整批退回',
      details: [{ goodsId: 1, qty: 2, price: 15, amt: 30 }],
      totalAmt: 30, auditStatus: '已审核', operatorId: '00', creatorId: '00'
    }
  ];

  db.salesReceipts = [
    {
      id: 1, code: 'SK20260906001', customerId: 1, salesOutCode: 'XSCK20260905001', salesOutId: 1,
      date: '2026-09-06', amount: 1100, payMethod: '银行转账', note: '', auditStatus: '已审核'
    },
    {
      id: 2, code: 'SK20260912002', customerId: 2, salesOutCode: 'XSCK20260911002', salesOutId: 2,
      date: '2026-09-12', amount: 500, payMethod: '微信', note: '余款下周结', auditStatus: '待审核'
    }
  ];

  // ---------- 5. 仓库 ----------
  db.transfers = [
    {
      id: 1, code: 'DB20260907001', fromWhId: 1, toWhId: 2, goodsId: 1, qty: 20, date: '2026-09-07',
      note: '给原材料仓备料', staffId: 3,
      sourceBatch: { purchaseInCode: 'CGRK20260903001', purchaseOrderCode: 'CGDD20260901001' },
      auditStatus: '已审核', operatorId: '00', creatorId: '00'
    },
    {
      id: 2, code: 'DB20260915002', fromWhId: 1, toWhId: 2, goodsId: 3, qty: 5, date: '2026-09-15',
      note: '', staffId: 3, sourceBatch: null,
      auditStatus: '待审核', operatorId: '00', creatorId: '00'
    }
  ];

  db.stockFlows = [
    { type: '采购入库', code: 'CGRK20260903001', goodsId: 1, warehouseId: 1, qty: 50, date: '2026-09-03', time: '2026-09-03 10:12:00' },
    { type: '采购入库', code: 'CGRK20260903001', goodsId: 4, warehouseId: 1, qty: 20, date: '2026-09-03', time: '2026-09-03 10:12:00' },
    { type: '销售出库', code: 'XSCK20260905001', goodsId: 1, warehouseId: 1, qty: -20, date: '2026-09-05', time: '2026-09-05 15:40:00' },
    { type: '销售出库', code: 'XSCK20260905001', goodsId: 3, warehouseId: 1, qty: -10, date: '2026-09-05', time: '2026-09-05 15:40:00' },
    { type: '库存调拨(出)', code: 'DB20260907001', goodsId: 1, warehouseId: 1, qty: -20, date: '2026-09-07', time: '2026-09-07 16:00:00' },
    { type: '库存调拨(入)', code: 'DB20260907001', goodsId: 1, warehouseId: 2, qty: 20, date: '2026-09-07', time: '2026-09-07 16:00:00' },
    { type: '采购入库', code: 'CGRK20260910002', goodsId: 2, warehouseId: 1, qty: 100, date: '2026-09-10', time: '2026-09-10 09:30:00' },
    { type: '销售出库', code: 'XSCK20260911002', goodsId: 2, warehouseId: 1, qty: -30, date: '2026-09-11', time: '2026-09-11 14:05:00' },
    { type: '采购退货', code: 'CGTH20260912001', goodsId: 2, warehouseId: 1, qty: -5, date: '2026-09-12', time: '2026-09-12 11:20:00' },
    { type: '销售退货', code: 'XSTH20260913001', goodsId: 1, warehouseId: 1, qty: 2, date: '2026-09-13', time: '2026-09-13 17:10:00' }
  ];

  // ---------- 6. 报价 ----------
  db.quotations = [
    {
      id: 1, code: 'BJ20260908001', customerId: 1, date: '2026-09-08', expiryDate: '2026-10-08',
      note: '量大可再谈', details: [{ goodsId: 1, qty: 100, price: 13, amt: 1300 }],
      totalAmt: 1300, status: '有效'
    },
    {
      id: 2, code: 'BJ20260916002', customerId: 2, date: '2026-09-16', expiryDate: '2026-10-16',
      note: '', details: [{ goodsId: 3, qty: 50, price: 70, amt: 3500 }],
      totalAmt: 3500, status: '有效'
    }
  ];

  // ---------- 7. 计数器对齐，保证以后新增单据的 ID 不与上面冲突 ----------
  db.nextIds = {
    goods: 7, warehouse: 3, supplier: 3, customer: 3, staff: 4, account: 5,
    unit: 9, category: 5, colorGroup: 2, sizeGroup: 3, notification: 1,
    purchaseOrder: 4, purchaseIn: 4, purchaseReturn: 2, purchasePay: 3,
    salesOrder: 4, salesOut: 4, salesReturn: 2, salesReceive: 3,
    transfer: 3, checkOrder: 1
  };

  return db;
}
