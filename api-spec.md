# 象过河仓库管理系统 — 前后端接口文档 v1.0

> 本文档供后端开发使用，描述前端所需的数据结构和 API 接口。

---

## 一、数据结构定义

### 1. 基础信息模块

#### goods（商品） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键，自增 |
| code | string | ✓ | 商品编号，如 SP001 |
| name | string | ✓ | 商品名称 |
| spec | string | | 规格 |
| model | string | | 型号 |
| unit | string | | 单位，如"个"、"kg" |
| barcode | string | | 条码 |
| category | string | | 类别名称，如"成品" |
| purchPrice | number | | 采购价 |
| costPrice | number | | 成本价 |
| retailPrice | number | | 零售价 |
| industryType | string | | 行业类型：general(通用)/food(食品)/apparel(服装)/electronic(电子)/building(建材) |
| status | string | | 状态："正常" 或 "停用" |
| note | string | | 备注 |
| batchNo | string | | 批次号（食品行业） |
| prodDate | string | | 生产日期（食品行业） |
| expiryDate | string | | 保质期截止日（食品行业） |
| shelfLife | number | | 保质期天数（食品行业） |
| colorGroupId | number | | 颜色组ID（服装行业） |
| sizeGroupId | number | | 尺码组ID（服装行业） |
| hasSerial | boolean | | 是否序列号管理（电子行业） |

#### suppliers（供应商） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 编号，如 GYS001 |
| name | string | ✓ | 供应商名称 |
| contact | string | | 联系人 |
| tel | string | | 电话 |
| addr | string | | 地址 |
| bank | string | | 开户银行 |
| acct | string | | 银行账号 |
| note | string | | 备注 |

#### customers（客户） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 编号，如 KH001 |
| name | string | ✓ | 客户名称 |
| contact | string | | 联系人 |
| tel | string | | 电话 |
| addr | string | | 地址 |
| credit | number | | 信用额度 |
| note | string | | 备注 |

#### warehouses（仓库） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 编号，如 CK001 |
| name | string | ✓ | 仓库名称 |
| addr | string | | 地址 |
| mgr | string | | 负责人 |
| tel | string | | 电话 |

#### staff（员工） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 编号，如 YG001 |
| name | string | ✓ | 姓名 |
| dept | string | | 部门 |
| tel | string | | 电话 |
| note | string | | 备注 |

#### accounts（会计科目） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 科目编号 |
| name | string | ✓ | 科目名称 |
| type | string | | 类型：资产/收入/支出 |
| bal | number | | 余额 |

#### units（计量单位） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| name | string | 单位名称，如"个"、"kg" |

#### categories（商品类别） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| pid | number | 上级类别ID，0表示顶级 |
| name | string | 类别名称 |

#### colorGroups（颜色组） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| name | string | 组名，如"标准颜色" |
| colors | Array\<string\> | 颜色列表，如 ["红色","蓝色"] |

#### sizeGroups（尺码组） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| name | string | 组名，如"服装尺码" |
| sizes | Array\<string\> | 尺码列表，如 ["S","M","L"] |

---

### 2. 采购管理模块

#### purchaseOrders（采购订单） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号，如 CGDD-20260713-001 |
| date | string | ✓ | 日期，格式 YYYY-MM-DD |
| supplierId | number | ✓ | 供应商ID |
| staffId | number | ✓ | 制单人ID（员工） |
| note | string | | 备注 |
| details | Array\<OrderDetail\> | ✓ | 订单明细（见下方） |
| totalAmt | number | ✓ | 总金额 |
| status | string | | 状态：草稿/已审核/部分入库/已完成 |
| inQty | number | | 已入库总数量 |
| auditStatus | string | | 审核状态：草稿/待审核/已审核/已驳回/已取消 |
| auditReason | string | | 驳回原因 |
| rejectedBy | string | | 驳回人 |
| cancelledBy | string | | 取消人 |

#### purchaseIn（采购入库） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号，如 CGRK-20260713-001 |
| date | string | ✓ | 日期 |
| supplierId | number | ✓ | 供应商ID |
| warehouseId | number | ✓ | 仓库ID |
| staffId | number | | 制单人ID |
| note | string | | 备注 |
| details | Array\<OrderDetail\> | ✓ | 入库明细 |
| totalAmt | number | ✓ | 总金额 |
| status | string | | 付款状态：未付款/部分付款/已付款 |
| paidAmt | number | | 已付金额 |
| auditStatus | string | | 审核状态 |
| purchaseOrderId | number\|null | | 关联采购订单ID |

#### purchaseReturn（采购退货） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号 |
| date | string | ✓ | 日期 |
| warehouseId | number | ✓ | 退货仓库ID |
| staffId | number | | 制单人ID |
| note | string | | 备注 |
| details | Array\<OrderDetail\> | ✓ | 退货明细 |
| totalAmt | number | ✓ | 总金额 |
| auditStatus | string | | 审核状态 |

#### purchasePayments（付款结算） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号 |
| date | string | ✓ | 日期 |
| supplierId | number | ✓ | 供应商ID |
| purchaseInCode | string | ✓ | 关联入库单号 |
| purchaseInId | number | ✓ | 关联入库单ID |
| amount | number | ✓ | 付款金额 |
| payMethod | string | | 支付方式：银行转账/现金/微信/支付宝 |
| note | string | | 备注 |
| attachment | string | | PDF附件（base64 data URL） |
| attachmentName | string | | 附件文件名 |
| auditStatus | string | | 审核状态 |

#### OrderDetail（明细行，多个模块共用）
| 字段 | 类型 | 说明 |
|------|------|------|
| goodsId | number | 商品ID |
| qty | number | 数量 |
| price | number | 单价 |
| amt | number | 金额（qty × price） |
| batchIdx | number\|null | 指定出库批次索引（仅销售出库使用） |

---

### 3. 销售管理模块

#### salesOrders（销售订单） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号，如 XSDD-20260713-001 |
| date | string | ✓ | 日期 |
| customerId | number | ✓ | 客户ID |
| staffId | number | | 业务员ID |
| note | string | | 备注 |
| details | Array\<OrderDetail\> | ✓ | 订单明细 |
| totalAmt | number | ✓ | 总金额 |
| status | string | | 状态：草稿/已审核/部分出库/已完成 |
| outQty | number | | 已出库总数量 |
| auditStatus | string | | 审核状态 |

#### salesOut（销售出库） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号，如 XSCK-20260713-001 |
| date | string | ✓ | 日期 |
| customerId | number | ✓ | 客户ID |
| warehouseId | number | ✓ | 仓库ID |
| staffId | number | | 业务员ID |
| note | string | | 备注 |
| details | Array\<OrderDetail\> | ✓ | 出库明细（含 batchIdx） |
| totalAmt | number | ✓ | 总金额 |
| status | string | | 收款状态：未收款/部分收款/已收款 |
| receivedAmt | number | | 已收金额 |
| auditStatus | string | | 审核状态 |
| salesOrderId | number\|null | | 关联销售订单ID |

#### salesReturn（销售退货） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号 |
| date | string | ✓ | 日期 |
| warehouseId | number | ✓ | 退货入库仓库ID |
| staffId | number | | 制单人ID |
| note | string | | 备注 |
| details | Array\<OrderDetail\> | ✓ | 退货明细 |
| totalAmt | number | ✓ | 总金额 |
| auditStatus | string | | 审核状态 |

#### salesReceipts（收款结算） `Array<Object>`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | ✓ | 主键 |
| code | string | ✓ | 单号 |
| date | string | ✓ | 日期 |
| customerId | number | ✓ | 客户ID |
| salesOutCode | string | ✓ | 关联出库单号 |
| salesOutId | number | ✓ | 关联出库单ID |
| amount | number | ✓ | 收款金额 |
| payMethod | string | | 收款方式 |
| note | string | | 备注 |
| auditStatus | string | | 审核状态 |

---

### 4. 仓库管理模块

#### inventory（库存） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| goodsId | number | 商品ID |
| warehouseId | number | 仓库ID |
| qty | number | 当前库存数量 |
| warnQty | number | 预警线 |
| batches | Array\<Batch\> | 批次列表 |

#### Batch（批次，inventory 内嵌）
| 字段 | 类型 | 说明 |
|------|------|------|
| purchaseOrderCode | string | 来源采购订单号 |
| purchaseInCode | string | 来源入库单号 |
| salesReturnCode | string | 来源销售退货单号 |
| type | string | 批次类型："销售退货" 或 undefined（普通入库） |
| goodsId | number | 商品ID |
| qty | number | 批次原始数量 |
| price | number | 单价 |
| date | string | 日期 |
| remaining | number | 剩余在库数量 |
| batchCode | string | 仓储批次号，如 BTH-1-1-1 |
| outRecords | Array\<OutRecord\> | 出库消耗记录 |
| linkChain | Array\<LinkNode\> | 全链路溯源节点 |

#### OutRecord（出库记录，批次内嵌）
| 字段 | 类型 | 说明 |
|------|------|------|
| salesOrderCode | string | 销售订单号（销售出库时） |
| salesOutCode | string | 销售出库单号（销售出库时） |
| type | string | "采购退货" 表示退货类型 |
| purchaseReturnCode | string | 采购退货单号（采购退货时） |
| qty | number | 消耗数量 |
| price | number | 单价 |
| date | string | 日期 |
| sourceLinkChain | Array\<LinkNode\> | 出库时刻的链路快照 |

#### LinkNode（链路节点）
| 字段 | 类型 | 说明 |
|------|------|------|
| action | string | 操作类型：采购下单/采购入库/采购退货/销售下单/销售出库/销售退货/调拨出/调拨入 |
| code | string | 单号 |
| date | string | 日期 |
| qty | number | 数量 |
| price | number | 单价 |
| warehouseId | number\|null | 仓库ID |
| warehouseName | string | 仓库名称 |

#### stockFlows（库存流水） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 类型：采购入库/销售出库/采购退货/销售退货/库存调拨(出)/库存调拨(入) |
| code | string | 单号 |
| goodsId | number | 商品ID |
| warehouseId | number | 仓库ID |
| qty | number | 变动数量（入为正，出为负） |
| date | string | 日期 |
| time | string | 时间戳 |
| linkChainSnapshot | Array\<LinkNode\> | 链路快照 |
| salesOrderCode | string | 销售订单号（销售出库时） |
| salesOutCode | string | 销售出库单号（销售出库时） |

#### checkOrders（仓库盘点） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| warehouseId | number | 仓库ID |
| date | string | 日期 |
| staffId | number | 盘点人ID |
| note | string | 备注 |
| details | Array\<{goodsId, sysQty, realQty, diff}\> | 盘点明细 |

#### checkProfit / checkLoss（盘盈/盘亏） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| warehouseId | number | 仓库ID |
| date | string | 日期 |
| staffId | number | 经手人ID |
| goodsId | number | 商品ID |
| qty | number | 差异数量 |

#### transfers（库存调拨） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| fromWhId | number | 调出仓库ID |
| toWhId | number | 调入仓库ID |
| goodsId | number | 商品ID |
| qty | number | 数量 |
| date | string | 日期 |
| note | string | 备注 |
| staffId | number | 制单人ID |
| sourceBatch | Object | 源批次信息 |
| auditStatus | string | 审核状态 |

#### completedBatches（已结算批次） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| goodsId | number | 商品ID |
| warehouseId | number | 仓库ID |
| warehouseName | string | 仓库名称 |
| purchaseInCode | string | 入库单号 |
| qty | number | 数量 |
| date | string | 结算日期 |
| linkChain | Array\<LinkNode\> | 全链路 |

---

### 5. 其他模块

#### quotations（报价管理） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号，如 BJ-20260713-001 |
| customerId | number | 客户ID |
| date | string | 日期 |
| expiryDate | string | 有效期 |
| note | string | 备注 |
| details | Array\<OrderDetail\> | 报价明细 |
| totalAmt | number | 总金额 |
| status | string | "有效" 或 "已转订单" |

#### members（会员） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| name | string | 姓名 |
| phone | string | 手机号 |
| level | string | 等级：普通/银卡/金卡/钻石 |
| points | number | 积分 |
| balance | number | 余额 |
| note | string | 备注 |

#### memberRecharges（会员充值记录） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| memberId | number | 会员ID |
| name | string | 会员姓名 |
| amount | number | 充值金额 |
| points | number | 赠送积分 |
| date | string | 日期 |
| note | string | 备注 |

#### invoices（发票管理） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 发票号 |
| type | string | 发票类型 |
| buyerName | string | 购买方名称 |
| buyerTax | string | 购买方税号 |
| sellerName | string | 销售方名称 |
| sellerTax | string | 销售方税号 |
| amount | number | 不含税金额 |
| taxRate | number | 税率 |
| taxAmt | number | 税额 |
| totalAmt | number | 价税合计 |
| totalCap | string | 价税合计大写 |
| date | string | 开票日期 |
| salesOutCode | string | 关联销售单号 |
| itemName | string | 项目名称 |
| spec | string | 规格型号 |
| unit | string | 单位 |
| qty | number | 数量 |
| price | number | 单价 |
| items | string | 货物明细文本 |
| note | string | 备注 |
| attachment | string | 附件（base64） |
| attachmentName | string | 附件名 |
| status | string | "已开" 或 "待开" |

#### projects（工程项目） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 编号 |
| name | string | 工程名称 |
| customerId | number | 客户ID |
| budget | number | 预算 |
| spent | number | 已花费 |
| progress | number | 进度百分比 |
| startDate | string | 开始日期 |
| endDate | string | 预计完成日期 |
| note | string | 备注 |
| status | string | 进行中/已完成/暂停 |

#### rentals（租赁管理） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| customerId | number | 客户ID |
| goodsId | number | 租赁商品ID |
| itemName | string | 物品名称 |
| qty | number | 数量 |
| dailyRate | number | 日租金 |
| deposit | number | 押金 |
| startDate | string | 开始日期 |
| endDate | string | 预计归还日期 |
| returnDate | string | 实际归还日期 |
| totalRent | number | 总租金 |
| note | string | 备注 |
| status | string | 租赁中/已归还/逾期 |

#### repairs（维修管理） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| goodsId | number | 商品ID |
| customerId | number\|null | 客户ID |
| customerName | string | 客户名称 |
| issue | string | 故障描述 |
| cost | number | 费用 |
| date | string | 日期 |
| note | string | 备注 |
| status | string | 待修/维修中/已修好/已取回 |

#### rebates（返利提成） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| type | string | "commission"(提成) 或 "rebate"(返利) |
| staffId | number | 业务员ID |
| baseType | string | 计算基数类型：销售额/毛利/回款 |
| baseAmt | number | 基数额 |
| rate | number | 比例(%) |
| rebateAmt | number | 提成/返利金额 |
| date | string | 日期 |
| note | string | 备注 |
| status | string | 待结算/已结算 |

#### boms（产品BOM） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 编号 |
| parentGoodsId | number | 成品ID |
| childGoodsId | number | 子件ID |
| qty | number | 用量 |
| unit | string | 单位 |

#### productionPlans（生产计划） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| goodsId | number | 产品ID |
| qty | number | 计划数量 |
| date | string | 日期 |
| note | string | 备注 |
| status | string | 待生产 |

#### productionOrders（加工单） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| goodsId | number | 产品ID |
| qty | number | 数量 |
| date | string | 日期 |
| note | string | 备注 |
| status | string | 进行中/已完成 |

#### productionPicks（生产领料） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| goodsId | number | 商品ID |
| qty | number | 数量 |
| warehouseId | number | 仓库ID |
| date | string | 日期 |
| auditStatus | string | 审核状态 |

#### productionIn / productionReturns（生产入库/生产退料） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| goodsId | number | 商品ID |
| qty | number | 数量 |
| date | string | 日期 |
| warehouseId | number | 仓库ID |

#### incomeRecords（其他收入） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| acctName | string | 科目名称 |
| amount | number | 金额 |
| date | string | 日期 |
| source | string | 来源 |
| note | string | 备注 |

#### expenseRecords（费用支出） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| acctName | string | 科目名称 |
| amount | number | 金额 |
| date | string | 日期 |
| type | string | 支出类型 |
| note | string | 备注 |

#### posOrders（POS订单） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| code | string | 单号 |
| date | string | 日期 |
| items | Array\<{goodsId, name, price, qty}\> | 购物车商品 |
| totalAmt | number | 总金额 |
| payMethod | string | 收款方式 |

#### auditLogs（审核日志） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| type | string | 单据类型 |
| recordId | number | 记录ID |
| recordCode | string | 单号 |
| action | string | 操作：通过/驳回/取消 |
| userId | string | 操作人账号 |
| userName | string | 操作人姓名 |
| reason | string | 原因（驳回时） |
| time | string | 时间戳 |

#### notifications（消息通知） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| type | string | 单据类型 |
| recordId | number | 记录ID |
| recordCode | string | 单号 |
| action | string | 操作 |
| newStatus | string | 新状态 |
| staffId | number | 提单人ID |
| staffName | string | 提单人姓名 |
| userId | string | 操作人账号 |
| time | string | 时间 |
| read | boolean | 是否已读 |

#### redDots（红点提醒） `Array<Object>`
| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 单据类型 |
| recordId | number | 记录ID |
| forRole | string | 提醒目标：auditor / staff |

#### permissions（权限配置） `Object`
| 字段 | 类型 | 说明 |
|------|------|------|
| key | string | 权限项名称（如 warnQtyEdit） |
| value | Array\<string\> | 允许的角色列表（如 ["supervisor","auditor"]） |

#### nextIds（自增ID计数器） `Object`
| 字段 | 类型 | 说明 |
|------|------|------|
| key | string | 表名 |
| value | number | 下一个可用ID |

---

## 二、API 接口清单

### 接口规范说明

- **Base URL**：`http://{服务器IP}:{端口}/api`
- **请求/响应格式**：JSON（`Content-Type: application/json`）
- **认证方式**：请求头携带 `Authorization: Bearer {token}`（登录接口返回token）
- **通用返回值**：
  - 成功：`{ "success": true, "data": ... }`
  - 失败：`{ "success": false, "message": "错误描述" }`

---

### 1. 用户认证

#### POST /api/auth/login
登录验证

| | |
|------|------|
| **说明** | 验证账号并返回 token |
| **请求体** | `{ "accountId": "1" }` |
| **成功响应** | `{ "success": true, "data": { "token": "xxx...", "user": { "accountId":"1", "name":"张三", "role":"staff" } } }` |

#### GET /api/auth/me
获取当前登录用户信息

| | |
|------|------|
| **说明** | 通过 token 获取当前用户 |
| **成功响应** | `{ "success": true, "data": { "accountId":"1", "name":"张三", "role":"staff" } }` |

---

### 2. 基础数据（CRUD）

以下6张表接口模式相同，以 goods 为例，其余类推。

#### GET /api/goods
获取商品列表

| | |
|------|------|
| **说明** | 返回全部商品 |
| **成功响应** | `{ "success": true, "data": [ { "id":1, "code":"SP001", "name":"通用商品A", ... }, ... ] }` |

#### POST /api/goods
新增商品

| | |
|------|------|
| **说明** | 创建新商品 |
| **请求体** | `{ "code":"SP004", "name":"新商品", "spec":"标准", "unit":"个", ... }` |
| **成功响应** | `{ "success": true, "data": { "id": 4 } }` |

#### PUT /api/goods/:id
更新商品

| | |
|------|------|
| **说明** | 修改指定商品 |
| **请求体** | `{ "name":"修改后的名称", "retailPrice": 20 }` |
| **成功响应** | `{ "success": true }` |

#### DELETE /api/goods/:id
删除商品

| | |
|------|------|
| **说明** | 删除指定商品 |
| **成功响应** | `{ "success": true }` |

**同模式的基础表：**

| 接口路径 | 说明 |
|------|------|
| `GET/POST/PUT/DELETE /api/suppliers` | 供应商 |
| `GET/POST/PUT/DELETE /api/customers` | 客户 |
| `GET/POST/PUT/DELETE /api/warehouses` | 仓库 |
| `GET/POST/PUT/DELETE /api/staff` | 员工 |
| `GET/POST/PUT/DELETE /api/accounts` | 会计科目 |
| `GET/POST/PUT/DELETE /api/units` | 计量单位 |
| `GET/POST/PUT/DELETE /api/categories` | 商品类别 |
| `GET/POST/PUT/DELETE /api/colorGroups` | 颜色组 |
| `GET/POST/PUT/DELETE /api/sizeGroups` | 尺码组 |

---

### 3. 采购管理

#### 采购订单 /api/purchaseOrders

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/purchaseOrders | 查询列表（支持 `?auditStatus=待审核` 过滤，审核员自动排除草稿） |
| POST | /api/purchaseOrders | 新建（保存时 `auditStatus: "草稿"`） |
| PUT | /api/purchaseOrders/:id | 更新（编辑重提时使用） |
| DELETE | /api/purchaseOrders/:id | 删除（仅草稿/已驳回/已取消可删） |
| POST | /api/purchaseOrders/:id/submit | 提交审核（草稿 → 待审核） |
| POST | /api/purchaseOrders/:id/approve | 审核通过（待审核 → 已审核，更新关联采购订单 inQty） |
| POST | /api/purchaseOrders/:id/reject | 驳回（需传 `{ "reason": "驳回原因" }`） |
| POST | /api/purchaseOrders/:id/cancel | 取消（主管操作） |

#### 采购入库 /api/purchaseIn

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/purchaseIn | 查询列表 |
| POST | /api/purchaseIn | 新建（支持 `purchaseOrderId` 关联采购订单） |
| PUT | /api/purchaseIn/:id | 更新（编辑重提） |
| DELETE | /api/purchaseIn/:id | 删除（需回退库存，仅已审核的需处理） |
| POST | /api/purchaseIn/:id/submit | 提交审核 |
| POST | /api/purchaseIn/:id/approve | **审核通过**（❖入库存+创建批次+生成linkChain+batchCode+写stockFlows+更新关联采购订单inQty） |
| POST | /api/purchaseIn/:id/reject | 驳回 |

#### 采购退货 /api/purchaseReturn

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/purchaseReturn | 查询列表 |
| POST | /api/purchaseReturn | 新建 |
| PUT | /api/purchaseReturn/:id | 更新 |
| DELETE | /api/purchaseReturn/:id | 删除（已审核的需恢复库存） |
| POST | /api/purchaseReturn/:id/submit | 提交审核 |
| POST | /api/purchaseReturn/:id/approve | **审核通过**（❖扣减库存+FIFO消耗批次+追加outRecord+追加linkChain+写stockFlows） |
| POST | /api/purchaseReturn/:id/reject | 驳回 |

#### 付款结算 /api/purchasePayments

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/purchasePayments | 查询列表 |
| POST | /api/purchasePayments | 新建（草稿，支持 `attachment` PDF附件 base64） |
| DELETE | /api/purchasePayments/:id | 删除（已审核的需回滚已付金额） |
| POST | /api/purchasePayments/:id/submit | 提交审核 |
| POST | /api/purchasePayments/:id/approve | **审核通过**（❖更新入库单 paidAmt + status） |
| POST | /api/purchasePayments/:id/reject | 驳回 |

---

### 4. 销售管理

#### 接口模式同采购管理

| 路径 | 说明 | 审核通过时特殊逻辑 |
|------|------|------|
| /api/salesOrders | 销售订单 | — |
| /api/salesOut | 销售出库 | ❖扣减库存+FIFO消耗批次+追加outRecord+追加linkChain+写stockFlows+更新关联销售订单outQty |
| /api/salesReturn | 销售退货 | ❖增加库存+创建新批次+继承linkChain+写stockFlows |
| /api/salesReceipts | 收款结算 | ❖更新出库单 receivedAmt + status |

每个路径均需支持：`GET`（列表）、`POST`（新建）、`PUT`（更新）、`DELETE`（删除）、`submit`、`approve`、`reject`。

---

### 5. 仓库管理

#### GET/POST /api/inventory
库存查询与维护

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/inventory | 查询（支持 `?warehouseId=X&keyword=商品名` 过滤） |
| PUT | /api/inventory/update | 直接更新库存（盘点用） |

#### POST /api/inventory/settleBatch
结算批次

| | |
|------|------|
| **说明** | 将指定批次移入 completedBatches |
| **请求体** | `{ "goodsId":1, "warehouseId":1, "batchIdx":0 }` |

#### GET/POST /api/checkOrders
仓库盘点

#### GET/POST /api/transfers
库存调拨

| | |
|------|------|
| **审核通过** | ❖源仓库扣减+目标仓库创建新批次(含完整链路)+调拨出/入流水 |

#### GET /api/stockFlows
库存流水（只读）

#### GET /api/completedBatches
已结算货物（只读）

---

### 6. 财务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/DELETE | /api/incomeRecords | 其他收入 |
| GET/POST/DELETE | /api/expenseRecords | 费用支出 |

---

### 7. 辅助模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | /api/quotations | 报价管理 |
| POST | /api/quotations/:id/toSalesOrder | 报价转销售订单（创建草稿销售单+红点） |
| GET/POST/PUT/DELETE | /api/members | 会员管理 |
| POST | /api/members/:id/recharge | 会员充值 `{ "amount": 100, "points": 10 }` |
| GET/POST/PUT/DELETE | /api/invoices | 发票管理 |
| GET/POST/PUT/DELETE | /api/projects | 工程项目 |
| PUT | /api/projects/:id/progress | 更新工程进度 |
| GET/POST/PUT/DELETE | /api/rentals | 租赁管理 |
| POST | /api/rentals/:id/return | 归还 |
| GET/POST/PUT/DELETE | /api/repairs | 维修管理 |
| PUT | /api/repairs/:id/status | 更新维修状态 |
| GET/POST/PUT/DELETE | /api/rebates | 返利提成 |
| PUT | /api/rebates/:id/settle | 结算 |
| GET/POST/DELETE | /api/boms | 产品BOM |
| GET/POST/DELETE | /api/productionPlans | 生产计划 |
| GET/POST/PUT/DELETE | /api/productionOrders | 加工单 |
| POST | /api/productionOrders/:id/complete | 完成加工单（❖入库） |
| GET/POST/DELETE | /api/productionPicks | 生产领料（保存时扣库存） |
| GET/POST/DELETE | /api/productionReturns | 生产退料（保存时回库存） |
| GET/POST | /api/posOrders | POS订单（结算时扣库存） |

---

### 8. 通知与权限

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/notifications | 获取通知列表（按用户过滤） |
| PUT | /api/notifications/readAll | 全部已读 |
| GET | /api/auditLogs | 审核日志 |
| GET | /api/redDots | 获取红点列表（按角色过滤） |
| PUT | /api/redDots/clear | 清除红点 `{ "type":"purchaseOrder", "recordId":1 }` |
| GET | /api/permissions | 获取权限配置 |
| PUT | /api/permissions | 更新权限配置 |

---

### 9. 批量操作（可选，性能优化用）

#### POST /api/data/sync
全量数据同步（首次加载时使用）

| | |
|------|------|
| **说明** | 返回所有数据表的最新快照，替代逐个 GET 请求 |
| **成功响应** | `{ "success": true, "data": { "goods":[...], "suppliers":[...], ... } }` |

#### POST /api/data/getNextId
获取自增ID

| | |
|------|------|
| **请求体** | `{ "table": "goods" }` |
| **成功响应** | `{ "success": true, "data": { "nextId": 5 } }` |

---

## 三、特殊业务逻辑说明

### 审核流程
```
草稿 → (提交审核) → 待审核 → (审核通过) → 已审核
                           → (驳回) → 已驳回 → (修改重提) → 待审核
                           → (主管取消) → 已取消
```
- **审核员**（role=auditor）：只能审核，不能新增/修改/删除
- **主管**（role=supervisor）：可审核+可强制驳回/取消已审核单据
- **员工**（role=staff）：可新增/修改/删除自己的草稿单据

### 带 ❖ 标记的接口
这些是审核通过时有库存/批次/流水变更的接口，后端需用**数据库事务**确保原子性：
- purchaseIn/approve：入库+创建批次+链路+流水+更新订单进度
- purchaseReturn/approve：退库+FIFO消耗+链接+流水
- salesOut/approve：出库+扣减+链路+流水+更新订单进度
- salesReturn/approve：退入+新批次+链路+流水
- transfer/approve：源仓库扣减+目标仓库新批次+双流水

---

*文档版本：v1.0 | 生成日期：2026-07-14*
