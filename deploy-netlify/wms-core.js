// ===== wms-core.js: 象过河仓库管理系统共享核心 =====
// 此文件被 index.html 和 mobile.html 共同加载
// 不要在末尾添加版本号或自举调用——它们由各页面自行处理
var pdfjsLib=window.pdfjsLib||{};
// pdf.js 按需加载：只在「发票识别」时才拉取，首屏不再请求境外 CDN（原来加载即请求，实测占约 1 秒）
var _pdfQueue=null;
function loadPdfJS(cb){
  if(window.pdfjsLib&&window.pdfjsLib.getDocument){cb(null);return}
  if(_pdfQueue){_pdfQueue.push(cb);return}
  _pdfQueue=[cb];
  var settled=false;
  function finish(err){
    if(settled)return;settled=true;
    var q=_pdfQueue;_pdfQueue=null;
    for(var i=0;i<q.length;i++)q[i](err);
  }
  function loadFrom(base,done){
    var s=document.createElement('script');
    s.src=base+'pdf.min.js';
    s.onload=function(){
      if(window.pdfjsLib&&window.pdfjsLib.GlobalWorkerOptions){
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=base+'pdf.worker.min.js';
      }
      done(null);
    };
    s.onerror=function(){done(new Error('load failed'))};
    document.head.appendChild(s);
  }
  loadFrom('',function(e1){
    if(!e1){finish(null);return}
    loadFrom('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/',function(e2){
      finish(e2?new Error('pdf.js 加载失败（本地与 CDN 均不可用）'):null);
    });
  });
}
// ============ 常量 ============
const INDUSTRIES = {
  general:{name:'通用商品',icon:'📦',fields:['code','name','spec','model','unit','barcode','category','costPrice','retailPrice']},
  food:{name:'食品/医药',icon:'🍔',fields:['code','name','spec','model','unit','barcode','category','costPrice','retailPrice','batchNo','prodDate','expiryDate','shelfLife']},
  apparel:{name:'服装/鞋帽',icon:'👕',fields:['code','name','spec','model','unit','barcode','category','costPrice','retailPrice','colorGroupId','sizeGroupId']},
  digital:{name:'电子/数码',icon:'📱',fields:['code','name','spec','model','unit','barcode','category','costPrice','retailPrice','serialNo','imei']},
  building:{name:'建材/钢材',icon:'🔩',fields:['code','name','spec','model','unit','barcode','category','costPrice','retailPrice','material','origin','weight','length']}
};
const BILL_PREFIX = {
  purchaseOrder:'CGDD',purchaseIn:'CGRK',purchaseReturn:'CGTH',purchasePay:'FKJS',
  salesOrder:'XSDD',salesOut:'XSCK',salesReturn:'XSTH',salesReceive:'SKJS',
  checkOrder:'PDD',checkProfit:'PY',checkLoss:'PK',transfer:'DB',
  income:'SR',expense:'ZC',bom:'BOM'
};

// ============ 账号系统（支持密码） ============
// 生成9位密码（必须含大小写英文+数字）
function genPwd(){
  var a='abcdefghijklmnopqrstuvwxyz',A='ABCDEFGHIJKLMNOPQRSTUVWXYZ',d='0123456789',all=a+A+d;
  var p='';
  p+=a[Math.floor(Math.random()*a.length)];
  p+=A[Math.floor(Math.random()*A.length)];
  p+=d[Math.floor(Math.random()*d.length)];
  while(p.length<9)p+=all[Math.floor(Math.random()*all.length)];
  return p.split('').sort(function(){return Math.random()-0.5}).join('');
}
// 生成6位纯数字账号
function genAcct(){return String(Math.floor(100000+Math.random()*900000));}
// 初始化默认密码（首次加载时给预置账号设置密码）
function ensureAccountPasswords(){
  if(!ACCOUNTS['00'].password) ACCOUNTS['00'].password='00';
  if(!ACCOUNTS['0'].password) ACCOUNTS['0'].password=genPwd();
  if(!ACCOUNTS['1'].password) ACCOUNTS['1'].password=genPwd();
  if(!ACCOUNTS['2'].password) ACCOUNTS['2'].password=genPwd();
  // 从数据库同步所有员工账号到 ACCOUNTS
  try{
    var db=GD();if(db&&db.staff){
      db.staff.forEach(function(s){
        if(s.account&&s.password){
          if(!ACCOUNTS[s.account]) ACCOUNTS[s.account]={name:s.name,role:s.role||'staff',password:s.password};
        }
      });
    }
  }catch(e){}
}
// 员工账号也同步到 ACCOUNTS
var _acctsSynced=false;
function syncStaffAccounts(){
  if(_acctsSynced)return;_acctsSynced=true;
  try{
    var db=GD();if(db&&db.staff){
      db.staff.forEach(function(s){
        if(s.account&&s.password){
          if(!ACCOUNTS[s.account]) ACCOUNTS[s.account]={name:s.name,role:s.role||'staff',password:s.password}
          // 即使已存在（预设账号如'1'/'2'），也确保 name 正确
          if(!ACCOUNTS[s.account].name||ACCOUNTS[s.account].name===ACCOUNTS[s.account].accountId) ACCOUNTS[s.account].name=s.name;
        }
      });
    }
  }catch(e){}
}
// 动态账户表 + 核心预置账户
const ACCOUNTS = {'00':{name:'高级主管',role:'supervisor',password:'00'},'0':{name:'审核员',role:'auditor'},'1':{name:'张三',role:'staff'},'2':{name:'李四',role:'staff'}};
let currentUser = null;
function initUser(){let s=sessionStorage.getItem('wms_user');if(s){currentUser=JSON.parse(s);syncStaffAccounts();$('userDisp').textContent='👤 '+currentUser.name;if(isAuditor()||isSupervisor()){document.body.classList.add('is-auditor');if(isSupervisor())document.body.classList.add('is-supervisor')}return true}else{ensureAccountPasswords();showLogin();return false}}
function showLogin(){
  var lp=document.getElementById('loginPage');
  if(lp){
    lp.innerHTML='<div style="text-align:center;margin-bottom:40px"><div style="font-size:60px">📦</div><h1 style="color:#fff;font-size:28px;margin:10px 0 4px">象过河仓库管理系统</h1><p style="color:rgba(255,255,255,.4);font-size:13px">XiangGuoHe WMS v2.13</p></div><div style="background:rgba(255,255,255,.95);border-radius:10px;padding:24px 20px;width:280px;margin:0 auto"><div class="fg" style="margin-bottom:12px"><input id="loginAcct" placeholder="账号" style="width:100%;font-size:16px;padding:10px;border-radius:6px;border:1px solid #e8e8e8"></div><div class="fg" style="margin-bottom:12px"><input id="loginPwd" type="password" placeholder="密码" style="width:100%;font-size:16px;padding:10px;border-radius:6px;border:1px solid #e8e8e8"></div><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-o" style="flex:1" onclick="showChangePwd()">修改密码</button><button class="btn btn-p" style="flex:1" onclick="doLogin()">登录</button></div></div>';
    lp.style.display='flex';
    setTimeout(function(){var el=$('loginAcct');if(el)el.focus();},100);
  }
}
function showChangePwd(){
  // 在 loginPage 里显示修改密码表单
  var lp=document.getElementById('loginPage');
  if(lp){
    lp.innerHTML='<div style="text-align:center;margin-bottom:40px"><div style="font-size:60px">📦</div><h1 style="color:#fff;font-size:28px;margin:10px 0 4px">修改密码</h1><p style="color:rgba(255,255,255,.4);font-size:13px">XiangGuoHe WMS v2.13</p></div><div style="background:rgba(255,255,255,.95);border-radius:10px;padding:24px 20px;width:280px;margin:0 auto"><div class="fg" style="margin-bottom:12px"><input id="cpAcct" placeholder="账号" style="width:100%;font-size:16px;padding:10px;border-radius:6px;border:1px solid #e8e8e8"></div><div class="fg" style="margin-bottom:12px"><input id="cpOldPwd" type="password" placeholder="原密码" style="width:100%;font-size:16px;padding:10px;border-radius:6px;border:1px solid #e8e8e8"></div><div class="fg" style="margin-bottom:12px"><input id="cpNewPwd" type="password" placeholder="新密码（6位以上，含大小写英文+数字）" style="width:100%;font-size:16px;padding:10px;border-radius:6px;border:1px solid #e8e8e8"></div><div class="fg" style="margin-bottom:12px"><input id="cpNewPwd2" type="password" placeholder="确认新密码" style="width:100%;font-size:16px;padding:10px;border-radius:6px;border:1px solid #e8e8e8"></div><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-o" style="flex:1" onclick="showLogin()">返回登录</button><button class="btn btn-p" style="flex:1" onclick="doChangePwd()">确认修改</button></div></div>';
    lp.style.display='flex';
  }
}
function doChangePwd(){
  var aid=$('cpAcct').value.trim();
  var oldPwd=$('cpOldPwd').value;
  var newPwd=$('cpNewPwd').value;
  var newPwd2=$('cpNewPwd2').value;
  if(!aid){toast('请输入账号');return}
  if(!oldPwd){toast('请输入原密码');return}
  if(!newPwd){toast('请输入新密码');return}
  if(newPwd.length<6){toast('新密码至少6位');return}
  if(!/[a-z]/.test(newPwd)||!/[A-Z]/.test(newPwd)||!/\d/.test(newPwd)){toast('新密码必须同时包含英文大小写和数字');return}
  if(newPwd!==newPwd2){toast('两次输入的密码不一致');return}
  ensureAccountPasswords();
  syncStaffAccounts();
  var acct=ACCOUNTS[aid];
  if(!acct){toast('账号不存在');return}
  if(acct.password!==oldPwd){toast('原密码错误');return}
  acct.password=newPwd;
  // 同步更新员工信息中的密码
  var db=GD();
  var s=db.staff.find(function(x){return x.account===aid});
  if(s) s.password=newPwd;
  saveD(db);
  toast('密码修改成功');clsModal();showLogin();
}
function doLogin(){
  var aid=$('loginAcct').value.trim();
  var pwd=$('loginPwd').value;
  if(!aid){toast('请输入账号');return}
  if(!pwd){toast('请输入密码');return}
  ensureAccountPasswords();
  syncStaffAccounts();
  var acct=ACCOUNTS[aid];
  if(!acct){toast('账号不存在');return}
  if(acct.password!==pwd){toast('密码错误');return}
  currentUser={accountId:aid,name:acct.name,role:acct.role};
  sessionStorage.setItem('wms_user',JSON.stringify(currentUser));
  $('userDisp').textContent='👤 '+currentUser.name;
  if(currentUser.role==='auditor'){$('userDisp').style.color='#ff4d4f'}
  else if(currentUser.role==='supervisor'){$('userDisp').style.color='#722ed1'}
  else{$('userDisp').style.color=''}
  if(isAuditor()||isSupervisor()){document.body.classList.add('is-auditor')}else{document.body.classList.remove('is-auditor')}
  if(isSupervisor()){document.body.classList.add('is-supervisor')}else{document.body.classList.remove('is-supervisor')}
  // 登录成功：显示主界面，隐藏登录页
  var main=document.getElementById('main');
  if(main) main.style.display='flex';
  var side=document.getElementById('side');
  if(side) side.style.display='block';
  var loginPage=document.getElementById('loginPage');
  if(loginPage) loginPage.style.display='none';
  clsModal();renderNav();nav('dashboard','首页仪表盘');updateAuditBadge();
}
function logout(){
  sessionStorage.removeItem('wms_user');
  currentUser=null;
  $('userDisp').textContent='👤 未登录';
  document.body.classList.remove('is-auditor');document.body.classList.remove('is-supervisor');
  // 隐藏主界面，显示登录页
  var main=document.getElementById('main');
  if(main) main.style.display='none';
  var side=document.getElementById('side');
  if(side) side.style.display='none';
  var loginPage=document.getElementById('loginPage');
  if(loginPage) loginPage.style.display='flex';
  // 清除旧弹窗
  $('mc').innerHTML='';
  // 弹出登录
  showLogin();
}
function confirmLogout(){
  modal('退出登录','<div style="text-align:center;padding:20px"><p>确认退出当前账号？</p></div>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-d" onclick="clsModal();logout()">确认退出</button>');
}
function isAuditor(){return currentUser&&(currentUser.role==='auditor'||currentUser.role==='supervisor')}
function isSupervisor(){return currentUser&&currentUser.role==='supervisor'}
function isStaff(){return currentUser&&currentUser.role==='staff'}
function hasAuditPerm(type){if(isSupervisor())return true;if(!isAuditor())return false;if(!currentUser)return false;var db=GD(),s=db.staff.find(function(x){return x.account===currentUser.accountId});if(!s)return false;if(!s.auditPerms||s.auditPerms.length===0)return false;return s.auditPerms.indexOf(type)>=0}
function canEditByRole(defaultStatus){return currentUser?isAuditor()?'已审核':'待审核':defaultStatus||'待审核'}

// ===== 操作员/审核员显示 =====
function acctName(aid){
  if(!aid)return '-';
  if(ACCOUNTS[aid])return ACCOUNTS[aid].name;
  // 回退：遍历 db.staff 查找匹配账户
  try{var db=GD();if(db&&db.staff){var s=db.staff.find(function(x){return x.account===aid});if(s)return s.name}}catch(e){}
  return '-';
}
function opTag(aid){
  if(!aid)return '<span style="color:#aaa">-</span>';
  return '<span style="font-size:11px;word-break:break-all;display:inline-block;max-width:90px">'+aid+'<br>'+acctName(aid)+'</span>';
}
// 操作员单行显示（新增/编辑弹窗用）
function opTagInline(aid){
  if(!aid)return '-';
  return aid+'-'+acctName(aid);
}

// ============ 审核配置（可扩展） ============
const AUDITABLE = {
  purchaseOrder:{list:'purchaseOrders',label:'采购订单',navPage:'purchase-order',editFn:'editPO'},
  purchaseIn:{list:'purchaseIn',label:'采购入库',navPage:'purchase-in',editFn:'editPI'},
  purchaseReturn:{list:'purchaseReturn',label:'采购退货',navPage:'purchase-return',editFn:'editPR'},
  purchasePay:{list:'purchasePayments',label:'采购付款',navPage:'purchase-pay',editFn:null},
  salesOrder:{list:'salesOrders',label:'销售订单',navPage:'sales-order',editFn:'editSO'},
  salesOut:{list:'salesOut',label:'销售出库',navPage:'sales-out',editFn:'editSO2'},
  salesReturn:{list:'salesReturn',label:'销售退货',navPage:'sales-return',editFn:'editSR'},
  salesReceive:{list:'salesReceipts',label:'销售收款',navPage:'sales-receive',editFn:null},
  checkOrder:{list:'checkOrders',label:'仓库盘点',navPage:'warehouse-check',editFn:'editCheck'},
  transfer:{list:'transfers',label:'库存调拨',navPage:'warehouse-transfer',editFn:'editTrans'},
};

// ============ 通用审核函数 ============
function auditBtns(type,record){
  let btns='',label=AUDITABLE[type]?AUDITABLE[type].label:'单据';
  if(!currentUser)return '';
  var navPage=AUDITABLE[type]?AUDITABLE[type].navPage:'';
  if(isStaff()&&hasPerm(navPage)){
    if(!record.auditStatus||record.auditStatus==='草稿')btns+='<button class="btn btn-xs btn-w" onclick="confirm(\'提交审核\',\'是否确认将此条'+label+'提交审核？\',\'submit|'+type+'|'+record.id+'\')">提交审核</button> ';
    if(record.auditStatus==='已驳回')btns+='<button class="btn btn-xs btn-o" onclick="resubmitAudit(\''+type+'\','+record.id+')">修改重提</button> ';
    if(record.auditStatus==='已取消')btns+='<span class="tag tag-gray" style="font-size:10px">已取消不可修改</span> ';
  }
  if(isAuditor()&&(record.auditStatus==='待审核')){
    // 审核通过/驳回 移到查看弹窗内
  }
  // 驳回按钮：审核员/主管对非草稿、非已取消、非已审核、非已驳回的单据可见
  if((isAuditor()||isSupervisor())&&record.auditStatus&&record.auditStatus!=='草稿'&&record.auditStatus!=='已取消'&&record.auditStatus!=='已审核'&&record.auditStatus!=='已驳回'){
    btns+='<button class="btn btn-xs btn-d" onclick="rejectAudit(\''+type+'\','+record.id+')">驳回</button> ';
  }
  // 取消按钮：仅高级主管对所有非草稿、非已取消的单据可见（包括已审核也可取消）
  if(isSupervisor()&&record.auditStatus&&record.auditStatus!=='草稿'&&record.auditStatus!=='已取消'){
    btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'取消确认\',\'取消订单后，订单不可以修改重提，是否确认将此条'+label+'取消？\',\'cancel|'+type+'|'+record.id+'\')">取消</button> ';
  }
  if(record.auditStatus==='已取消'){
    btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'是否确认删除此条已取消的'+label+'？\',\'delRecord|'+type+'|'+record.id+'\')">删除</button> ';
  }
  return btns;
}
// ===== 单号点击弹出详情（层叠弹窗） =====
function viewByCode(code){
  if(!code)return;
  var db=GD();var prefix=code.replace(/-.*/,'');var rec=null;
  var map={CGDD:{arr:'purchaseOrders',fn:'viewPO'},CGRK:{arr:'purchaseIn',fn:'viewPI'},CGTH:{arr:'purchaseReturn',fn:'viewPR'},
    XSDD:{arr:'salesOrders',fn:'viewSO'},XSCK:{arr:'salesOut',fn:'viewSOut'},XSTH:{arr:'salesReturn',fn:'viewSR'},
    FKJS:{arr:'purchasePayments',fn:'viewPPay'},SKJS:{arr:'salesReceipts',fn:'viewSRv'},DB:{arr:'transfers',fn:'viewTrans'}};
  var m=map[prefix];if(!m)return;
  var list=db[m.arr];if(!list)return;
  for(var i=0;i<list.length;i++){if(list[i].code===code){rec=list[i];break}}
  if(!rec){toast('未找到单据: '+code);return}
  // 层叠弹窗：直接调用对应的 view 函数
  var fn=window[m.fn];if(typeof fn==='function')fn(rec.id);else toast('暂不支持查看该类型单据');
}
// 审核状态标签
function auditStatusTag(record){
  if(!currentUser)return '';
  let s=record.auditStatus||'草稿';
  if(s==='已审核')return ' <span class="tag tag-green">已审核</span>';
  if(s==='待审核')return ' <span class="tag tag-orange">待审核</span>';
  if(s==='草稿')return ' <span class="tag tag-gray">草稿</span>';
  if(s==='已驳回'){
    let by=record.rejectedBy||'审核员';
    return ' <span class="tag tag-red">此订单被驳回<br>'+by+'<br>'+acctName(by)+'</span>';
  }
  if(s==='已取消'){
    let by=record.cancelledBy||'主管';
    return ' <span class="tag tag-gray">此订单被'+by+'取消</span>';
  }
  return ' <span class="tag tag-gray">草稿</span>';
}
function submitAudit(type,id){
  if(!isStaff()){toast('仅员工可提交审核');return}
  let db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  if(!hasPerm(cfg.navPage)){toast('无此页面操作权限');return}
  let rec=db[cfg.list].find(x=>x.id==id);if(!rec)return;
  rec.auditStatus='待审核';
  rec.operatorId=currentUser.accountId; // 记录操作员
  clearRedDot(db,type,id);
  addRedDot(db,type,id,'auditor');
  addNotification(db,type,id,'提交审核','待审核',rec.code,'auditor');
  addNotification(db,type,id,'提交审核','待审核',rec.code,'supervisor');
  saveD(db);nav(cfg.navPage,cfg.label);toast('已提交审核');
  updateAuditBadge();
}
function approveAudit(type,id){
  if(!isAuditor()){toast('仅审核员可操作');return}
  if(!hasAuditPerm(type)){toast('无此类型的审核权限');return}
  let db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  let rec=db[cfg.list].find(x=>x.id==id);if(!rec)return;
  rec.auditStatus='已审核';
  rec.auditorId=currentUser.accountId; // 记录审核员
  if(type!=='purchaseIn'&&type!=='salesOut')rec.status='已审核';
  else if(!rec.status)rec.status=(type==='purchaseIn'?'未付款':'未收款');
  clearRedDot(db,type,id);
  addRedDot(db,type,id,'staff');
  // 采购入库：审核通过时自动更新库存 + 记录批次溯源 + linkChain
  if(type==='purchaseIn'&&rec.details){
    var poCode=rec.purchaseOrderId?(function(){var po=db.purchaseOrders.find(function(x){return x.id===rec.purchaseOrderId});return po?po.code:null;})():null;
    var totalQtyForPO=0;
    rec.details.forEach(function(d){
      if(!d.qty||d.qty<=0)return;
      var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===rec.warehouseId});
      if(!inv){inv={goodsId:d.goodsId,warehouseId:rec.warehouseId,qty:0,warnQty:10,batches:[]};db.inventory.push(inv);}
      inv.qty=(inv.qty||0)+d.qty;
      totalQtyForPO+=d.qty;
      if(!inv.batches)inv.batches=[];
      var nb={purchaseOrderCode:poCode||'',purchaseInCode:rec.code,goodsId:d.goodsId,qty:d.qty,price:d.price,date:rec.date,remaining:d.qty,outRecords:[],linkChain:[],batchCode:'BTH-'+d.goodsId+'-'+rec.warehouseId+'-'+(inv.batches.length+1)};
      appendLink(nb,'采购下单',poCode||'',rec.date,d.qty,d.price,null);
      appendLink(nb,'采购入库',rec.code,rec.date,d.qty,d.price,rec.warehouseId);
      inv.batches.push(nb);
      db.stockFlows.push({type:'采购入库',code:rec.code,goodsId:d.goodsId,warehouseId:rec.warehouseId,qty:d.qty,date:rec.date,time:nowT(),linkChainSnapshot:JSON.parse(JSON.stringify(nb.linkChain))});
    });
    // 审核通过时更新关联采购订单的入库进度
    if(rec.purchaseOrderId){
      var po=db.purchaseOrders.find(function(x){return x.id===rec.purchaseOrderId});
      if(po){
        // 重新计算该采购订单所有已审核入库单的总入库量
        var allInQty=0;
        var piList=db.purchaseIn.filter(function(x){return x.purchaseOrderId===rec.purchaseOrderId&&x.auditStatus==='已审核'});
        piList.forEach(function(pi){pi.details.forEach(function(d){allInQty+=d.qty||0})});
        po.inQty=allInQty;
        var allQty=po.details?po.details.reduce(function(s,d){return s+d.qty},0):0;
        po.status=po.inQty>=allQty?'已完成':(po.inQty>0?'部分入库':'已审核');
        clearRedDot(db,'purchaseOrder',rec.purchaseOrderId);
      }
    }
  }
  // 销售出库：审核通过时扣减库存 + 标记批次已出库 + linkChain
  if(type==='salesOut'&&rec.details){
    var soCode2=rec.salesOrderId?(function(){var so=db.salesOrders.find(function(x){return x.id===rec.salesOrderId});return so?so.code:null;})():null;
    rec.details.forEach(function(d){
      if(!d.qty||d.qty<=0)return;
      var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===rec.warehouseId});
      if(inv)inv.qty=Math.max(0,(inv.qty||0)-d.qty);
      if(inv&&inv.batches&&inv.batches.length){
        var remaining=d.qty;
        // 如果指定了 batchIdx，优先从该批次出库
        var startIdx=0;
        if(d.batchIdx!=null&&d.batchIdx>=0&&d.batchIdx<inv.batches.length){
          var tb=inv.batches[d.batchIdx];var tavail=tb.remaining!=null?tb.remaining:tb.qty;
          if(tavail>0)startIdx=d.batchIdx;
        }
        for(var i=startIdx;i<inv.batches.length&&remaining>0;i++){
          var batch=inv.batches[i];
          migrateBatchLinkChain(batch);
          var used=Math.min(batch.remaining!=null?batch.remaining:batch.qty,remaining);
          if(batch.remaining==null)batch.remaining=batch.qty;
          batch.remaining-=used;
          if(!batch.outRecords)batch.outRecords=[];
          var srcChain=JSON.parse(JSON.stringify(batch.linkChain));
          batch.outRecords.push({salesOrderCode:soCode2||'',salesOutCode:rec.code,qty:used,date:rec.date,sourceLinkChain:srcChain});
          appendLink(batch,'销售下单',soCode2||'',rec.date,used,0,null);
          appendLink(batch,'销售出库',rec.code,rec.date,used,d.price||0,rec.warehouseId);
          remaining-=used;
        }
      }
      db.stockFlows.push({type:'销售出库',code:rec.code,goodsId:d.goodsId,warehouseId:rec.warehouseId,qty:-d.qty,date:rec.date,time:nowT(),linkChainSnapshot:soCode2?[{action:'销售下单',code:soCode2,date:rec.date},{action:'销售出库',code:rec.code,date:rec.date}]:null,salesOrderCode:soCode2||'',salesOutCode:rec.code});
    });
    // 审核通过时更新关联销售订单的出库进度
    if(rec.salesOrderId){
      var so=db.salesOrders.find(function(x){return x.id===rec.salesOrderId});
      if(so){
        var allOutQty=0;
        var soList=db.salesOut.filter(function(x){return x.salesOrderId===rec.salesOrderId&&x.auditStatus==='已审核'});
        soList.forEach(function(sx){sx.details.forEach(function(d){allOutQty+=d.qty||0})});
        so.outQty=allOutQty;
        var allQty=so.details?so.details.reduce(function(s,d){return s+d.qty},0):0;
        so.status=so.outQty>=allQty?'已完成':(so.outQty>0?'部分出库':'已审核');
        clearRedDot(db,'salesOrder',rec.salesOrderId);
      }
    }
  }
  // 采购退货：审核通过时扣减库存 + 记录到批次溯源 + linkChain
  if(type==='purchaseReturn'&&rec.details){
    rec.details.forEach(function(d){
      if(!d.qty||d.qty<=0)return;
      var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===rec.warehouseId});
      if(inv)inv.qty=Math.max(0,(inv.qty||0)-d.qty);
      if(inv&&inv.batches&&inv.batches.length){
        var remaining2=d.qty;
        for(var j=0;j<inv.batches.length&&remaining2>0;j++){
          var batch2=inv.batches[j];
          migrateBatchLinkChain(batch2);
          var used2=Math.min(batch2.remaining!=null?batch2.remaining:batch2.qty,remaining2);
          if(batch2.remaining==null)batch2.remaining=batch2.qty;
          batch2.remaining-=used2;
          if(!batch2.outRecords)batch2.outRecords=[];
          batch2.outRecords.push({type:'采购退货',purchaseReturnCode:rec.code,qty:used2,price:d.price,date:rec.date,sourceLinkChain:JSON.parse(JSON.stringify(batch2.linkChain))});
          appendLink(batch2,'采购退货',rec.code,rec.date,used2,d.price,rec.warehouseId);
          remaining2-=used2;
        }
      }
      db.stockFlows.push({type:'采购退货',code:rec.code,goodsId:d.goodsId,warehouseId:rec.warehouseId,qty:-d.qty,date:rec.date,time:nowT()});
    });
  }
  // 销售退货：审核通过时增加库存 + linkChain（继承源出库批次的全链路）
  if(type==='salesReturn'&&rec.details){
    rec.details.forEach(function(d){
      if(!d.qty||d.qty<=0)return;
      var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===rec.warehouseId});
      // 查找源出库记录的 linkChain 以继承完整历史
      var sourceLinks=[];
      if(d.sourceLinkChain&&d.sourceLinkChain.length){sourceLinks=d.sourceLinkChain;}
      else if(inv&&inv.batches){
        for(var bi=0;bi<inv.batches.length&&!sourceLinks.length;bi++){
          var b0=inv.batches[bi];
          if(b0.outRecords){
            for(var oi=0;oi<b0.outRecords.length;oi++){
              var o0=b0.outRecords[oi];
              if(o0.salesOutCode&&o0.sourceLinkChain&&o0.sourceLinkChain.length){sourceLinks=o0.sourceLinkChain;break;}
            }
          }
        }
        if(!sourceLinks.length&&inv.batches.length>0&&inv.batches[0].linkChain){sourceLinks=inv.batches[0].linkChain;}
      }
      if(inv){inv.qty=(inv.qty||0)+d.qty;}
      else {inv={goodsId:d.goodsId,warehouseId:rec.warehouseId,qty:0,warnQty:10,batches:[]};db.inventory.push(inv);}
      if(!inv.batches)inv.batches=[];
      var rnb={type:'销售退货',salesReturnCode:rec.code,goodsId:d.goodsId,qty:d.qty,price:d.price,date:rec.date,remaining:d.qty,outRecords:[],linkChain:sourceLinks.slice()};
      appendLink(rnb,'销售出库','',rec.date,d.qty,d.price||0,rec.warehouseId);
      appendLink(rnb,'销售退货',rec.code,rec.date,d.qty,d.price||0,rec.warehouseId);
      inv.batches.push(rnb);
      db.stockFlows.push({type:'销售退货',code:rec.code,goodsId:d.goodsId,warehouseId:rec.warehouseId,qty:d.qty,date:rec.date,time:nowT()});
    });
  }
  // 库存调拨：审核通过时执行调拨 + linkChain 追加调拨单号
  if(type==='transfer'&&rec){
    var fromInv=db.inventory.find(function(x){return x.goodsId===rec.goodsId&&x.warehouseId===rec.fromWhId});
    if(fromInv)fromInv.qty=Math.max(0,(fromInv.qty||0)-rec.qty);
    // 从源仓库 FIFO 消费批次，为目标仓库创建带完整链路的新批次
    var transRemaining=rec.qty;
    var toInv=db.inventory.find(function(x){return x.goodsId===rec.goodsId&&x.warehouseId===rec.toWhId});
    if(!toInv){toInv={goodsId:rec.goodsId,warehouseId:rec.toWhId,qty:0,warnQty:10,batches:[]};db.inventory.push(toInv);}
    toInv.qty=(toInv.qty||0)+rec.qty;
    if(!toInv.batches)toInv.batches=[];
    if(fromInv&&fromInv.batches&&fromInv.batches.length){
      for(var ti=0;ti<fromInv.batches.length&&transRemaining>0;ti++){
        var tb=fromInv.batches[ti];
        migrateBatchLinkChain(tb);
        var tused=Math.min(tb.remaining!=null?tb.remaining:tb.qty,transRemaining);
        if(tb.remaining==null)tb.remaining=tb.qty;
        tb.remaining-=tused;
        var newLinkChain=JSON.parse(JSON.stringify(tb.linkChain));
        var tnb={purchaseOrderCode:tb.purchaseOrderCode||'',purchaseInCode:tb.purchaseInCode||'',goodsId:rec.goodsId,qty:tused,price:tb.price||0,date:rec.date,remaining:tused,outRecords:[],linkChain:newLinkChain};
        appendLink(tnb,'调拨出',rec.code,rec.date,tused,0,rec.fromWhId);
        appendLink(tnb,'调拨入',rec.code,rec.date,tused,0,rec.toWhId);
        toInv.batches.push(tnb);
        transRemaining-=tused;
      }
    }
    db.stockFlows.push({type:'库存调拨(出)',code:rec.code,goodsId:rec.goodsId,warehouseId:rec.fromWhId,qty:-rec.qty,date:rec.date,time:nowT()});
    db.stockFlows.push({type:'库存调拨(入)',code:rec.code,goodsId:rec.goodsId,warehouseId:rec.toWhId,qty:rec.qty,date:rec.date,time:nowT()});
  }
  // 付款结算
  if(type==='purchasePay'&&rec){
    var pi=db.purchaseIn.find(function(x){return x.id===rec.purchaseInId});
    if(pi){pi.paidAmt=(pi.paidAmt||0)+rec.amount;pi.status=pi.paidAmt>=pi.totalAmt?'已付款':'部分付款'}
  }
  // 收款结算
  if(type==='salesReceive'&&rec){
    var so2=db.salesOut.find(function(x){return x.id===rec.salesOutId});
    if(so2){so2.receivedAmt=(so2.receivedAmt||0)+rec.amount;so2.status=so2.receivedAmt>=so2.totalAmt?'已收款':'部分收款'}
  }
  if(!db.auditLogs)db.auditLogs=[];
  db.auditLogs.push({id:nid(db,'auditLog'),type,recordId:id,recordCode:rec.code,action:'通过',userId:currentUser.accountId,userName:currentUser.name,time:nowT()});
  addNotification(db,type,id,'审核通过','已审核',rec.code,'staff');
  // 员工：采购订单关联入库单审核通过通知
  if(type==='purchaseIn'&&rec.purchaseOrderId){
    addNotification(db,'purchaseOrder',rec.purchaseOrderId,'关联入库已审核','可去付款',(function(){var po2=db.purchaseOrders.find(function(x){return x.id===rec.purchaseOrderId});return po2?po2.code:''})(),'staff');
  }
  // 员工：销售订单关联出库单审核通过通知
  if(type==='salesOut'&&rec.salesOrderId){
    addNotification(db,'salesOrder',rec.salesOrderId,'关联出库已审核','可去收款',(function(){var so3=db.salesOrders.find(function(x){return x.id===rec.salesOrderId});return so3?so3.code:''})(),'staff');
  }
  // 员工：付款单审核通过通知
  if(type==='purchasePay'){
    addNotification(db,type,id,'付款已审核','已付款',rec.code,'staff');
  }
  // 员工：收款单审核通过通知
  if(type==='salesReceive'){
    addNotification(db,type,id,'收款已审核','已收款',rec.code,'staff');
  }
  // 主管：单据审核通过通知
  addNotification(db,type,id,'审核通过','已审核',rec.code,'supervisor');
  saveD(db);nav(cfg.navPage,cfg.label);toast('已审核通过');updateAuditBadge();
}
function rejectAudit(type,id){
  var db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  var rec=db[cfg.list].find(function(x){return x.id===id});if(!rec)return;
  if(rec.auditStatus==='已审核'){toast('已审核的单据不能驳回');return}
  if(rec.auditStatus==='已驳回'){toast('已驳回的单据无需再次驳回');return}
  modal('驳回原因','<div class="frow c1"><div class="fg"><label>请输入驳回原因</label><textarea id="rejectReason" rows="3" style="width:100%"></textarea></div></div>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-d" onclick="doRejectAudit(\''+type+'\','+id+')">确认驳回</button>');
}
function doRejectAudit(type,id){
  if(!isAuditor()&&!isSupervisor())return;
  if(isAuditor()&&!isSupervisor()&&!hasAuditPerm(type)){toast("无此类型的审核权限");return}
  let db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  let rec=db[cfg.list].find(x=>x.id==id);if(!rec)return;
  if(rec.auditStatus==='已审核'){toast('已审核的单据不能驳回');return}
  if(rec.auditStatus==='已驳回'){toast('已驳回的单据无需再次驳回');return}
  let reason=$('rejectReason').value||'未填写原因';clsModal();
  rec.auditStatus='已驳回';rec.auditReason=reason;rec.rejectedBy=currentUser.accountId;
  addNote(rec, '驳回原因: '+reason, currentUser.accountId, currentUser.name);
  // 审核员/主管：驳回时给员工加红点
  addRedDot(db,type,id,'staff');
  clearRedDot(db,type,id); // 驳回操作后清除审核员的红点
  addNotification(db,type,id,'驳回','已驳回',rec.code,'staff');
  addNotification(db,type,id,'驳回','已驳回',rec.code,'supervisor');
  if(!db.auditLogs)db.auditLogs=[];
  db.auditLogs.push({id:nid(db,'auditLog'),type,recordId:id,recordCode:rec.code,action:'驳回',userId:currentUser.accountId,userName:currentUser.name,reason,time:nowT()});
  saveD(db);nav(cfg.navPage,cfg.label);toast('已驳回');updateAuditBadge();
}

// 取消订单（仅高级主管可操作）
function cancelRecord(type,id){
  if(!isSupervisor()){toast('仅高级主管可取消订单');return}
  let db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  let rec=db[cfg.list].find(x=>x.id==id);if(!rec)return;
  rec.auditStatus='已取消';rec.cancelledBy=currentUser.accountId;
  clearRedDot(db,type,id);
  addRedDot(db,type,id,'staff'); // 取消后给员工加红点
  if(!db.auditLogs)db.auditLogs=[];
  db.auditLogs.push({id:nid(db,'auditLog'),type,recordId:id,recordCode:rec.code,action:'取消',userId:currentUser.accountId,userName:currentUser.name,time:nowT()});
  addNotification(db,type,id,'取消','已取消',rec.code,'staff');
  addNotification(db,type,id,'取消','已取消',rec.code,'auditor');
  addNotification(db,type,id,'取消','已取消',rec.code,'supervisor');
  saveD(db);nav(cfg.navPage,cfg.label);toast('已取消');updateAuditBadge();
}

// 通用删除（已取消的废单据）
function delRecord(type,id){
  let db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  var code='';
  var rec2=db[cfg.list].find(function(x){return x.id===id});
  if(rec2)code=rec2.code;
  db[cfg.list]=db[cfg.list].filter(x=>x.id!=id);
  clearRedDot(db,type,id);
  addNotification(db,type,id,'删除','已删除',code,'supervisor');
  saveD(db);nav(cfg.navPage,cfg.label);toast('已删除');
}
function resubmitAudit(type,id){if(isAuditor()){toast("审核员无权修改单据");return}
  let db=GD(),cfg=AUDITABLE[type];if(!cfg)return;
  if(!hasPerm(cfg.navPage)){toast('无此页面操作权限');return}
  let rec=db[cfg.list].find(x=>x.id==id);if(!rec)return;
  if(rec.auditStatus==='已取消'){toast('已取消的订单不可修改重提');return}
  clearRedDot(db,type,id); // 修改重提后清除本角色红点
  addRedDot(db,type,id,'auditor'); // 修改重提后给审核员加红点
  // 打开编辑弹窗（草稿/已驳回状态）
  if(type==='purchaseOrder'){editPO(id)}
  else if(type==='purchaseIn'){editPI(id)}
  else if(type==='purchaseReturn'){editPR(id)}
  else if(type==='salesOrder'){editSO(id)}
  else if(type==='salesOut'){editSO2(id)}
  else if(type==='salesReturn'){editSR(id)}
  else if(type==='checkOrder'){editCheck(id)}
  else if(type==='transfer'){editTrans(id)}
  else if(type==='purchasePay'){toast('付款单不支持修改重提，请重新新增')}
}
function updateAuditBadge(){
  if(!isAuditor()&&!isSupervisor())return;
  let db=GD(),cnt=0;
  Object.values(AUDITABLE).forEach(cfg=>{(db[cfg.list]||[]).forEach(r=>{if(r.auditStatus==='待审核')cnt++})});
  if($('auditNavBadge'))$('auditNavBadge').textContent=cnt;
  updateTodoBadge();
}

// ============ 红点提醒系统 ============
function addRedDot(db,type,recordId,forRole){
  if(!db.redDots)db.redDots=[];
  if(!db.redDots.find(function(x){return x.type===type&&x.recordId===recordId&&x.forRole===forRole})){
    db.redDots.push({type:type,recordId:recordId,forRole:forRole});
  }
}
function clearRedDot(db,type,recordId){
  if(!db.redDots)return;
  db.redDots=db.redDots.filter(function(x){return !(x.type===type&&x.recordId===recordId)});
}
function hasRedDot(type,recordId){
  if(!currentUser)return false;
  let db=GD();if(!db.redDots)return false;
  var role=isAuditor()||isSupervisor()?'auditor':'staff';
  return db.redDots.some(function(x){return x.type===type&&x.recordId===recordId&&x.forRole===role});
}
function redDotHtml(type,recordId){
  return hasRedDot(type,recordId)?' <span class="red-dot" style="display:inline-block;width:8px;height:8px;background:#ff4d4f;border-radius:50%;vertical-align:middle" title="新提醒"></span>':'';
}

// ============ 备注系统 ============
function addNote(rec, text, userId, userName){
  if(!text||!text.trim())return;
  if(!rec.notes)rec.notes=[];
  // 兼容旧数据：如果 note 字段有值且 notes 为空，先迁移
  if(rec.notes.length===0&&rec.note&&typeof rec.note==='string'&&rec.note.trim()){
    rec.notes.push({text:rec.note.trim(),userId:'',userName:'',time:''});
    rec.note='__migrated__';
  }
  rec.notes.push({
    text: text.trim(),
    userId: userId||(currentUser?currentUser.accountId:''),
    userName: userName||(currentUser?currentUser.name:''),
    time: nowT()
  });
}
function noteHtml(rec){
  var notes=rec.notes||[];
  // 兼容旧 note 字段
  if(notes.length===0&&rec.note&&typeof rec.note==='string'&&rec.note.trim()&&rec.note!=='__migrated__'){
    notes=[{text:rec.note.trim(),userId:'',userName:'',time:''}];
  }
  if(notes.length===0)return '<span class="tag tag-gray" style="font-size:10px">无备注</span>';
  return '<span class="tag tag-green" style="cursor:pointer;font-size:10px" onclick="event.stopPropagation();viewNotesById(\''+rec.id+'\',\''+(rec._noteType||'')+'\')">'+notes.length+'条备注</span>';
}
function viewNotesById(recordId,type){
  var db=GD(),rec=null,cfg=null;
  if(type&&AUDITABLE[type]){
    cfg=AUDITABLE[type];
    rec=(db[cfg.list]||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});
  }
  if(!rec){
    // 搜索所有 AUDITABLE 列表
    Object.entries(AUDITABLE).forEach(function(_e){var t=_e[0],c=_e[1];
      if(!rec){var found=(db[c.list]||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(found){rec=found;cfg=c;type=t;}}
    });
  }
  // 搜索基础数据表
  if(!rec){rec=(db.suppliers||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='supplier';}
  if(!rec){rec=(db.customers||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='customer';}
  if(!rec){rec=(db.goods||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='goods';}
  if(!rec){rec=(db.depts||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='dept';}
  if(!rec){rec=(db.staff||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='staff';}
  if(!rec){rec=(db.members||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='member';}
  if(!rec){rec=(db.quotations||[]).find(function(x){return x.id===parseInt(recordId)||x.id===recordId});if(rec)type='quotation';}
  if(!rec)return;
  var notes=rec.notes||[];
  if(notes.length===0&&rec.note&&typeof rec.note==='string'&&rec.note.trim()&&rec.note!=='__migrated__'){
    notes=[{text:rec.note.trim(),userId:'',userName:'',time:''}];
  }
  var h='<table style="width:100%;font-size:12px"><thead><tr><th style="width:45%">备注内容</th><th style="width:25%">添加人</th><th style="width:30%">时间</th></tr></thead><tbody>';
  notes.forEach(function(n){
    h+='<tr><td style="word-break:break-all">'+n.text+'</td><td>'+(n.userName||n.userId||'-')+'</td><td>'+fdt(n.time||'')+'</td></tr>';
  });
  h+='</tbody></table>';
  modal('📝 备注记录',h,'<button class="btn btn-o" onclick="clsModal();showTodoModal()">关闭</button>');
  // 让右上角的叉点击后也回到待办事件
  setTimeout(function(){
    var ov=document.getElementById('modalOverlay');
    if(ov){
      var closeBtn=ov.querySelector('.modal-close');
      if(closeBtn)closeBtn.setAttribute('onclick','clsModal();showTodoModal()');
    }
  },50);
}

// ============ 消息通知系统 ============
// targetRole: 通知目标角色 'staff' | 'auditor' | 'supervisor' | 'all'
function addNotification(db,type,recordId,action,newStatus,recordCode,targetRole){
  if(!db.notifications)db.notifications=[];
  var cfg=AUDITABLE[type];if(!cfg)return;
  var rec=db[cfg.list].find(function(x){return x.id===recordId});if(!rec)return;
  var staffId=rec.staffId||rec.creatorId||0;
  var staffName=gStName(staffId)||'员工';
  db.notifications.push({
    id:nid(db,'notification'),type:type,recordId:recordId,recordCode:recordCode||rec.code,
    action:action,newStatus:newStatus,staffId:staffId,staffName:staffName,userId:currentUser.accountId,
    time:nowT(),read:false,targetRole:targetRole||'all'
  });
  updateTodoBadge();
}
function notificationsPage(c){
  var db=GD();if(!db.notifications)db.notifications=[];
  var myId=currentUser.accountId,myRole=isSupervisor()?'supervisor':(isAuditor()?'auditor':'staff');
  var list=db.notifications.filter(function(n){
    var tr=n.targetRole||'all';
    if(tr==='all')return true;
    return tr===myRole;
  }).filter(function(n){
    if(isSupervisor())return true;
    if(isStaff())return n.staffId===parseInt(myId)||n.staffName===currentUser.name||n.userId===myId;
    if(isAuditor())return n.targetRole==='auditor'||n.userId===myId;
    return false;
  }).reverse().slice(0,100);
  c.innerHTML='<div class="tbar"><strong>📬 消息通知</strong> <span class="spacer"></span><button class="btn btn-o" onclick="markAllNotifsRead()">全部已读</button></div>'+rTable(['时间','类型','单号','操作','状态','提单人'],list.map(function(n){
    return[n.time||'',(AUDITABLE[n.type]||{}).label||n.type,n.recordCode||'-',n.action||'',n.newStatus||'',n.staffName||'-'];
  }),6);
}
function markAllNotifsRead(){var db=GD();if(!db.notifications)return;var myRole=isSupervisor()?'supervisor':(isAuditor()?'auditor':'staff');db.notifications.forEach(function(n){var tr=n.targetRole||'all';if(tr==='all'||tr===myRole)n.read=true});saveD(db);updateTodoBadge();notificationsPage(document.getElementById('pg'));toast('已全部标记已读')}

// ============ 权限系统 ============
var PERMISSIONS={warnQtyEdit:{label:'修改预警线',defaultRoles:['supervisor','auditor']}};
function hasPerm(key){if(!currentUser)return false;var p=PERMISSIONS[key];if(!p)return true;var db=GD();if(!db.permissions)db.permissions={};var perm=db.permissions[key];if(!perm){perm={allowedRoles:p.defaultRoles?p.defaultRoles.slice():['supervisor']}}return perm.allowedRoles.indexOf(currentUser.role)>=0}
function permSettings(c){
  var db=GD();if(!db.permissions)db.permissions={};
  c.innerHTML='<div class="tbar"><strong>🔐 权限管理</strong></div>'+rTable(['权限','当前允许角色','操作'],Object.keys(PERMISSIONS).map(function(key){var p=PERMISSIONS[key];var perm=db.permissions[key];if(!perm){perm={allowedRoles:p.defaultRoles?p.defaultRoles.slice():['supervisor']};db.permissions[key]=perm}var curRoles=perm.allowedRoles.join(', ');return[p.label,curRoles,'<button class="btn btn-xs btn-o" onclick="editPerm(\''+key+'\')">编辑</button>']}),3);
}
function editPerm(key){var p=PERMISSIONS[key];var db=GD();if(!db.permissions)db.permissions={};var perm=db.permissions[key];if(!perm){perm={allowedRoles:(p.defaultRoles?p.defaultRoles.slice():['supervisor'])};db.permissions[key]=perm};modal('编辑权限 - '+p.label+'<br><small style=color:#999>当前key: '+key+'</small>','<div style=padding:10px id=permBox><label><input type=checkbox value=staff id=perm_staff></label> 员工<br><label><input type=checkbox value=auditor id=perm_auditor></label> 审核员<br><label><input type=checkbox value=supervisor id=perm_supervisor></label> 主管</div><input type=hidden id=permKey value='+key+'>','<button class=btn btn-o onclick=clsModal()>取消</button> <button class=btn btn-p onclick=savePerm3()>保存</button>');
  setTimeout(function(){
    var db2=GD();var perm2=db2.permissions[key];if(!perm2)return;
    document.getElementById('perm_staff').checked=perm2.allowedRoles.indexOf('staff')>=0;
    document.getElementById('perm_auditor').checked=perm2.allowedRoles.indexOf('auditor')>=0;
    document.getElementById('perm_supervisor').checked=perm2.allowedRoles.indexOf('supervisor')>=0;
  },100)}
function savePerm3(){var db=GD(),key=document.getElementById('permKey').value,perm=db.permissions[key]||{allowedRoles:[]};perm.allowedRoles=[];['staff','auditor','supervisor'].forEach(function(r){var cb=document.getElementById('perm_'+r);if(cb&&cb.checked)perm.allowedRoles.push(r)});db.permissions[key]=perm;saveD(db);clsModal();permSettings(document.getElementById('pg'));toast('权限已更新')}

// ============ 审核中心页面 ============
function auditCenter(c){
  let db=GD();let rows=[];
  Object.entries(AUDITABLE).forEach(([type,cfg])=>{if(isAuditor()&&!isSupervisor()&&!hasAuditPerm(type))return;
    (db[cfg.list]||[]).forEach(r=>{
      if(r.auditStatus==='待审核'){
        let label=cfg.label+' — '+r.code;let refName='';
        if(type.includes('purchase'))refName=gSName(r.supplierId||r.id);
        else if(type.includes('sales'))refName=gCName(r.customerId||r.id);
        else refName='-';
                var viewMap={purchaseOrder:'viewPO',purchaseIn:'viewPI',purchaseReturn:'viewPR',purchasePay:'viewPPay',salesOrder:'viewSO',salesOut:'viewSOut',salesReturn:'viewSR',salesReceive:'viewSRv',checkOrder:'viewCheck',transfer:'viewTrans'};
        var viewFn=viewMap[type]||'';
        var btnHtml=auditBtns(type,r);
        if(isAuditor()&&!isSupervisor()&&viewFn){
          btnHtml='<button class="btn btn-xs btn-o" onclick="'+viewFn+'('+r.id+')">查看</button> <button class="btn btn-xs btn-s" onclick="'+viewFn+'('+r.id+',true)">审核</button> '+btnHtml;
        }
        rows.push([`<b>${label}</b>`,refName,fd(r.date||r.date),auditStatusTag(r),btnHtml]);
      }
    });
  });
  if(isAuditor()||isSupervisor()){
    c.innerHTML=`<div class="tbar"><strong>📋 审核中心</strong> <span style="color:var(--dan);margin-left:8px">${rows.length}条待审核</span></div>
      ${rows.length?rTable(['单据','关联方','日期','状态','操作'],rows,5):'<div class="empty"><div class="ico">✅</div><h3>暂无需审核的单据</h3></div>'}`;
  }else{
    c.innerHTML=`<div class="empty"><div class="ico">🔒</div><h3>审核中心仅审核员和主管可访问</h3><p style="color:var(--tx2)">当前账号: ${currentUser?currentUser.name:'未登录'}</p></div>`;
  }
}

// ============ 工具函数 ============
const $=id=>document.getElementById(id);
const now=()=>new Date().toISOString().slice(0,10);
const nowT=()=>new Date().toISOString().slice(0,19).replace('T',' ');
const fmt=n=>n!=null?Number(n).toFixed(2):'0.00';
const fd=d=>d?d.slice(0,10):'';
const fdt=function(d){if(!d)return'-';var dt=new Date(d);var date=dt.toISOString().slice(0,10);var time=dt.toTimeString().slice(0,8);return date+'<br><span style="font-size:10px;color:#999">'+time+'</span>'};
const sn=function(s,max){max=max||20;if(!s)return'-';if(s.length>max)return s.slice(0,max)+'...';return s};
function gCode(prefix,dbKey){
  // 使用 ID 池的下一个值（与 nid 同步）
  var nextVal;
  if (_wms_api_mode === 'api' && WMS_API) {
    nextVal = WMS_API.peekId(dbKey);
  }
  if (!nextVal) {
    var db = GD();
    nextVal = (db.nextIds[dbKey] || 0) + 1;
  }
  return prefix + '-' + now().replace(/-/g,'') + '-' + String(nextVal).padStart(3,'0');
}
// ===== 数据层 =====
// HTTP 模式：后端 API 同步（ID预分配 + 乐观锁 + 冲突自动合并）
// file:// 模式：纯 localStorage
// ===== 后端 API 同步模块（纯 fetch，零外部依赖） =====
var WMS_API = (function() {
  if (window.location.protocol === 'file:') return null;

  var API_BASE_URL = 'https://dhxsymzypgmqcafabcbf.supabase.co/rest/v1';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeHN5bXp5cGdtcWNhZmFiY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTI3MTUsImV4cCI6MjA5OTYyODcxNX0.wDcLxGb7qm3OGpvZm35gjPmwfbR651zPUHcx7rE8NIE';
  var cache = null;
  var localVersion = 0;
  var initReady = false;
  var initCallbacks = [];
  var syncTimer = null;
  var saving = false;

  // Supabase 认证 headers
  var H = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  // POST JSON 返回 headers（RPC 用）
  var H2 = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // ===== 初始化 =====
  function init(cb) {
    console.log('[WMS] init()');
    var local = localStorage.getItem('wms_v2');
    if (local) { try { cache = JSON.parse(local); } catch(e) {} }
    if (cb) initCallbacks.push(cb);
    function _finish() { initReady = true; var cbs = initCallbacks.slice(); initCallbacks = []; for (var i = 0; i < cbs.length; i++) cbs[i](); }
    // 先用一个请求探测后端：不可达就直接走本地模式，跳过 37 个必然失败的 ID 池请求
    // （原来无论后端死活都会并行发 37 个请求，失败时会把首屏渲染一起拖住）
    _pull(function(reachable) {
      if (reachable === false) {
        _wms_api_mode = 'local';
        console.warn('[WMS] 后端不可达，已切换为本地存储模式（跳过 ID 池分配）');
        _finish();
        return;
      }
      _initIdPools(function() { _finish(); });
    });
  }

  // ===== 初始化 ID 池 =====
  var _idPoolKeys = [
    'goods','supplier','customer','warehouse','staff','account','unit','category',
    'colorGroup','sizeGroup','notification','auditLog',
    'purchaseOrder','purchaseIn','purchaseReturn','purchasePayment',
    'salesOrder','salesOut','salesReturn','salesReceipt',
    'checkOrder','checkProfit','checkLoss','transfer',
    'incomeRecord','expenseRecord',
    'quotation','member','memberRecharge','posOrder',
    'invoice','project','rental','repair','rebate',
    'stockFlow','completedBatch'
  ];

  function _initIdPools(cb) {
    var pending = _idPoolKeys.length;
    if (pending === 0) { if (cb) cb(); return; }
    var allDone = false;
    function _oneDone() { pending--; if (pending <= 0 && !allDone) { allDone = true; console.log('[WMS] all ID pools allocated'); if (cb) cb(); } }
    for (var k = 0; k < _idPoolKeys.length; k++) {
      (function(key) {
        fetch(API_BASE_URL + '/rpc/allocate_ids', {
          method: 'POST', headers: H,
          body: JSON.stringify({ p_key: key, p_count: ID_BLOCK })
        })
        .then(function(r) { return r.text(); })
        .then(function(txt) {
          var v = parseInt(txt);
          if (!isNaN(v) && v > 0) {
            _idPool[key] = { base: v, next: v };
            if (cache && cache.nextIds) {
              if (!cache.nextIds[key] || v + ID_BLOCK > cache.nextIds[key]) cache.nextIds[key] = v + ID_BLOCK;
            }
          }
          _oneDone();
        })
        .catch(function() { _oneDone(); });
      })(_idPoolKeys[k]);
    }
  }

  // ===== ID 池 =====
  var _idPool = {};
  var ID_BLOCK = 50;

  // 预取 ID（池耗尽时补充）
  function _prefetchIdBlock(key) {
    fetch(API_BASE_URL + '/rpc/allocate_ids', {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_key: key, p_count: ID_BLOCK })
    })
    .then(function(r) { return r.text(); })
    .then(function(txt) {
      var v = parseInt(txt);
      if (!isNaN(v) && v > 0) {
        if (!_idPool[key] || _idPool[key].base <= v) {
          _idPool[key] = { base: v, next: v };
        }
      }
    })
    .catch(function(e) { console.warn('[WMS] prefetch id err:', key, e); });
  }

  // 下一个 ID
  function nextId(key) {
    var pool = _idPool[key];
    if (!pool || pool.next >= pool.base + ID_BLOCK) {
      _prefetchIdBlock(key);
      if (!pool) { _idPool[key] = { base: 0, next: 0 }; pool = _idPool[key]; }
      var local = localStorage.getItem('wms_v2');
      if (local) {
        try { var d = JSON.parse(local); if (!d.nextIds) d.nextIds = {}; if (!d.nextIds[key]) d.nextIds[key] = 1; return d.nextIds[key]++; } catch(e) {}
      }
      return 1;
    }
    return pool.next++;
  }

  // 预览下一个 ID
  function peekId(key) {
    var pool = _idPool[key];
    if (pool && pool.next > 0) return pool.next;
    return null;
  }

  // ===== 拉取数据 =====
  function _pull(cb) {
    var settled = false;
    var timer = setTimeout(function() {
      if (settled) return; settled = true;
      console.warn('[WMS] 后端响应超时（3s），按不可达处理');
      if (!cache) cache = initDB();
      if (cb) cb(false);
    }, 3000);
    fetch(API_BASE_URL + '/app_data?id=eq.1&select=data,version', { headers: H })
      .then(function(r) { return r.json(); })
      .then(function(arr) {
        if (settled) return; settled = true; clearTimeout(timer);
        if (arr && arr.length > 0 && arr[0].data && typeof arr[0].data === 'object' && Array.isArray(arr[0].data.goods)) {
          var remote = arr[0].data;
          var remoteVer = arr[0].version || 0;
          if (cache && localVersion > 0) {
            cache = _mergeData(cache, remote);
          } else {
            cache = remote;
          }
          localVersion = remoteVer;
          localStorage.setItem('wms_v2', JSON.stringify(cache));
          console.log('[WMS] pulled v' + remoteVer);
        } else {
          if (!cache) cache = initDB();
        }
        if (cb) setTimeout(function() { cb(true); }, 0);
      })
      .catch(function(e) {
        if (settled) return; settled = true; clearTimeout(timer);
        console.error('[WMS] pull err:', e ? (e.message || e) : 'unknown');
        if (!cache) cache = initDB();
        if (cb) setTimeout(function() { cb(false); }, 0);
      });
  }

  // ===== 合并两个数据副本 =====
  function _mergeData(base, remote) {
    if (!remote) return base;
    var result = {};
    var allKeys = {};
    for (var k in base) { if (base.hasOwnProperty(k)) allKeys[k] = true; }
    for (var k in remote) { if (remote.hasOwnProperty(k)) allKeys[k] = true; }
    for (var key in allKeys) {
      if (key === 'nextIds') {
        result.nextIds = {};
        var bn = base.nextIds || {}, rn = remote.nextIds || {};
        for (var nk in bn) { result.nextIds[nk] = bn[nk]; }
        for (var nk in rn) { if (!result.nextIds[nk] || rn[nk] > result.nextIds[nk]) result.nextIds[nk] = rn[nk]; }
      } else if (Array.isArray(base[key]) || Array.isArray(remote[key])) {
        var bArr = Array.isArray(base[key]) ? base[key] : [];
        var rArr = Array.isArray(remote[key]) ? remote[key] : [];
        var merged = [], seen = {};
        for (var i = 0; i < rArr.length; i++) {
          var r = rArr[i];
          if (r && r.id != null) { seen[r.id] = true; merged.push(r); }
          else { merged.push(r); }
        }
        for (var j = 0; j < bArr.length; j++) {
          var b = bArr[j];
          if (b && b.id != null) { if (!seen[b.id]) { seen[b.id] = true; merged.push(b); } }
        }
        result[key] = merged;
      } else if (typeof base[key] === 'object' && base[key] !== null) {
        result[key] = base[key];
      } else {
        result[key] = base[key] != null ? base[key] : remote[key];
      }
    }
    return result;
  }

  // ===== 读取数据 =====
  function getData() {
    if (cache) return cache;
    var local = localStorage.getItem('wms_v2');
    if (local) { try { cache = JSON.parse(local); return cache; } catch(e) {} }
    cache = initDB(); return cache;
  }

  // ===== 保存数据（乐观锁 + 自动合并重试） =====
  function saveData(d) {
    cache = d;
    // 同步写 localStorage，确保保存前数据不丢
    localStorage.setItem('wms_v2', JSON.stringify(d));
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function() { _doSave(cache, localVersion); }, 800);
  }

  // 页面关闭/隐藏时立即同步
  window.addEventListener('beforeunload', function() { flushNow(); });
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { flushNow(); }
  });

  function flushNow() {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    if (cache) _doSave(cache, localVersion);
  }

  function _doSave(data, expectedVer) {
    if (saving) return;
    saving = true;
    fetch(API_BASE_URL + '/rpc/save_data_locked', {
      method: 'POST', headers: H2,
      body: JSON.stringify({ p_expected_version: expectedVer, p_data: data })
    })
    .then(function(r) { return r.json(); })
    .then(function(resp) {
      saving = false;
      if (resp && resp.success) {
        localVersion = resp.version;
        console.log('[WMS] saved v' + resp.version);
      } else if (resp && !resp.success) {
        console.warn('[WMS] conflict! local v' + expectedVer + ', remote v' + resp.version);
        if (resp.data) {
          var merged = _mergeData(data, resp.data);
          cache = merged;
          localStorage.setItem('wms_v2', JSON.stringify(merged));
          localVersion = resp.version;
          setTimeout(function() { _doSave(merged, resp.version); }, 100 + Math.random() * 200);
        }
      }
    })
    .catch(function(e) {
      saving = false;
      console.error('[WMS] save err:', e ? (e.message || e) : 'unknown');
    });
  }

  return { init: init, get: getData, save: saveData, peekId: peekId, nextId: nextId, flush: flushNow };
})();

// 全局 API 模式标记
var _wms_api_mode = (window.location.protocol !== 'file:') ? 'api' : 'local';

function GD(){
  if (_wms_api_mode === 'api' && WMS_API && WMS_API.get()) {
    return WMS_API.get();
  }
  // fallback: localStorage
  var d = localStorage.getItem('wms_v2');
  if (!d) { d = initDB(); saveD(d); }
  else {
    try { d = JSON.parse(d); } catch(e) { d = initDB(); }
  }
  if (!d.nextIds) d.nextIds = {};
  return d;
}
function saveD(d) {
  if (_wms_api_mode === 'api' && WMS_API) {
    WMS_API.save(d);
    // 也存到 localStorage 作为离线备份
    localStorage.setItem('wms_v2', JSON.stringify(d));
  } else {
    localStorage.setItem('wms_v2', JSON.stringify(d));
  }
}
// 页面关闭/隐藏时强制同步（避免数据丢失）
window.addEventListener('beforeunload', function() {
  if (_wms_api_mode === 'api' && WMS_API && WMS_API.flush) {
    WMS_API.flush();
  }
});
document.addEventListener('visibilitychange', function() {
  if (document.hidden && _wms_api_mode === 'api' && WMS_API && WMS_API.flush) {
    WMS_API.flush();
  }
});
function nid(db,key){
  // 优先用后端 API 预分配的 ID 池（保证多设备不冲突）
  if (_wms_api_mode === 'api' && WMS_API) {
    var poolId = WMS_API.nextId(key);
    if (poolId) {
      // 同步更新本地 nextIds，保持一致性
      if (!db.nextIds[key] || poolId > db.nextIds[key]) db.nextIds[key] = poolId + 1;
      return poolId;
    }
  }
  // 兜底：本地计数器
  if (!db.nextIds[key]) db.nextIds[key] = 1;
  return db.nextIds[key]++;
}
function gName(list,id,prop){let i=list.find(x=>x.id==id);return i?i[prop||'name']:'-';}
function gGName(id){return gName(GD().goods,id,'name')}
function gWName(id){return gName(GD().warehouses,id)}
function gSName(id){return gName(GD().suppliers,id)}
function gCName(id){return gName(GD().customers,id)}
function gStName(id){return gName(GD().staff,id)}

// ============ 全链路单号关联 ============
function appendLink(batch,action,code,date,qty,price,warehouseId){
  if(!batch.linkChain)batch.linkChain=[];
  batch.linkChain.push({action:action,code:code||'',date:date||'',qty:qty||0,price:price||0,warehouseId:warehouseId||null,warehouseName:warehouseId?gWName(warehouseId):''});
}
function renderLinkChain(linkChain){
  if(!linkChain||!linkChain.length)return '<span style="color:#aaa;font-size:11px">-</span>';
  var colorMap={'采购下单':'#1890ff','采购入库':'#52c41a','采购退货':'#faad14','销售下单':'#722ed1','销售出库':'#ff4d4f','销售退货':'#eb2f96','调拨出':'#13c2c2','调拨入':'#13c2c2','付款':'#fa8c16','收款':'#2f54eb'};
  var tags=linkChain.map(function(l){
    var c=colorMap[l.action]||'#999';
    var t=l.action+':'+l.code+(l.date?' ('+fd(l.date)+')':'')+(l.qty?' '+l.qty+'件':'');
    return '<span class="tag" style="background:'+c+'20;color:'+c+';margin:1px 2px;display:inline-block;cursor:default" title="'+t.replace(/"/g,'&quot;')+'">'+l.code+'</span>';
  });
  return '<div style="font-size:11px;line-height:1.8">'+tags.join(' ')+'</div>';
}
// 树形链路渲染（库存查询用）
function renderLinkChainTree(batch){
  var chain=batch.linkChain||[];
  if(!chain.length)return '<span style="color:#aaa;font-size:11px">-</span>';
  var h='';
  // 按采购对/出库对/退货对分组
  var groups=[],cur=null;
  for(var i=0;i<chain.length;i++){
    var l=chain[i];
    if(l.action==='采购下单'){
      cur={type:'in',po:l,pi:null,outFlows:[]};groups.push(cur);
    }else if(l.action==='采购入库'&&cur&&cur.type==='in'){
      cur.pi=l;
    }else if(l.action==='销售下单'){
      cur={type:'out',so:l,so2:null};groups.push(cur);
    }else if(l.action==='销售出库'){
      // 可能跟在销售下单后面，也可能是独立出库
      if(cur&&cur.type==='out'&&!cur.so2){cur.so2=l}
      else{groups.push({type:'out',so:null,so2:l})}
    }else if(l.action==='采购退货'){
      groups.push({type:'pr',pr:l});
    }else if(l.action==='调拨出'){
      cur={type:'trans',tOut:l,tIn:null};groups.push(cur);
    }else if(l.action==='调拨入'&&cur&&cur.type==='trans'){
      cur.tIn=l;
    }else if(l.action==='销售退货'){
      groups.push({type:'sr',sr:l});
    }
  }
  // 如果还有遗留的（如无配对的采购下单），追加为独立行
  // 渲染树形
  for(var g=0;g<groups.length;g++){
    var grp=groups[g];
    if(grp.type==='in'){
      // 采购入库行
      var piCode=grp.pi?grp.pi.code:'-';
      var piQty=grp.pi?grp.pi.qty:batch.qty;
      var piWh=grp.pi&&grp.pi.warehouseName?grp.pi.warehouseName:'';
      var poCode=grp.po&&grp.po.code?grp.po.code:'';
      var poQty=grp.po&&grp.po.qty?grp.po.qty:piQty;
      h+='<div style="margin:2px 0"><span class="tag" style="background:#52c41a20;color:#52c41a;cursor:pointer;text-decoration:underline" onclick="event.stopPropagation();viewByCode(\''+piCode+'\')">📥 '+piCode+'</span> ';
      h+='<span style="font-size:10px;color:#666">'+piQty+'件';
      if(piWh)h+=' → '+piWh;
      h+='</span>';
      if(poCode){
        h+='<br><span style="padding-left:12px;font-size:10px;color:#888">└ 📝 <span class="tag" style="background:#1890ff20;color:#1890ff;font-size:9px;cursor:pointer;text-decoration:underline" onclick="event.stopPropagation();viewByCode(\''+poCode+'\')">'+poCode+'</span> '+poQty+'件</span>';
      }else if(grp.po&&!grp.po.code){
        h+='<br><span style="padding-left:12px;font-size:10px;color:#888">└ (独立入库，无采购订单)</span>';
      }
    }else if(grp.type==='out'){
      var so2Code=grp.so2?grp.so2.code:'-';
      var so2Qty=grp.so2?grp.so2.qty:'?';
      var soCode=grp.so&&grp.so.code?grp.so.code:'';
      var soQty=grp.so&&grp.so.qty?grp.so.qty:so2Qty;
      h+='<div style="margin:2px 0"><span class="tag" style="background:#ff4d4f20;color:#ff4d4f;cursor:pointer;text-decoration:underline" onclick="event.stopPropagation();viewByCode(\''+so2Code+'\')">📤 '+so2Code+'</span> ';
      h+='<span style="font-size:10px;color:#666">'+so2Qty+'件</span>';
      if(soCode){
        h+='<br><span style="padding-left:12px;font-size:10px;color:#888">└ 📝 <span class="tag" style="background:#722ed120;color:#722ed1;font-size:9px">'+soCode+'</span> '+soQty+'件</span>';
      }else if(!grp.so&&!grp.so2.code){
        h+='<br><span style="padding-left:12px;font-size:10px;color:#888">└ (独立出库)</span>';
      }
    }else if(grp.type==='pr'){
      h+='<div style="margin:2px 0"><span class="tag" style="background:#faad1420;color:#faad14">🔙 '+grp.pr.code+'</span> ';
      h+='<span style="font-size:10px;color:#666">'+grp.pr.qty+'件 退货</span></div>';
    }else if(grp.type==='sr'){
      h+='<div style="margin:2px 0"><span class="tag" style="background:#eb2f9620;color:#eb2f96">🔙 '+grp.sr.code+'</span> ';
      h+='<span style="font-size:10px;color:#666">'+grp.sr.qty+'件 销售退货</span></div>';
    }else if(grp.type==='trans'){
      h+='<div style="margin:2px 0"><span class="tag" style="background:#13c2c220;color:#13c2c2">↔️ '+(grp.tOut?grp.tOut.code:'-')+'</span>';
      if(grp.tIn)h+=' <span style="font-size:10px;color:#666">→ '+grp.tIn.warehouseName+'</span>';
      h+='</div>';
    }
  }
  if(!h)h='<span style="color:#aaa;font-size:11px">-</span>';
  return '<div style="font-size:11px;line-height:1.6;max-width:280px">'+h+'</div>';
}
function migrateBatchLinkChain(batch){
  if(batch.linkChain&&batch.linkChain.length)return;
  batch.linkChain=[];
  if(batch.purchaseOrderCode){appendLink(batch,'采购下单',batch.purchaseOrderCode,batch.date,batch.qty,batch.price,null);}
  if(batch.purchaseInCode){var db=GD();var pi=db.purchaseIn.find(function(x){return x.code===batch.purchaseInCode});appendLink(batch,'采购入库',batch.purchaseInCode,batch.date,batch.qty,batch.price,pi?pi.warehouseId:null);}
  if(batch.type==='销售退货'&&batch.salesReturnCode){appendLink(batch,'销售退货',batch.salesReturnCode,batch.date,batch.qty,batch.price,null);}
  if(batch.outRecords&&batch.outRecords.length){
    batch.outRecords.forEach(function(o){
      if(o.salesOrderCode){appendLink(batch,'销售下单',o.salesOrderCode,o.date,o.qty,0,null);}
      if(o.salesOutCode){appendLink(batch,'销售出库',o.salesOutCode,o.date,o.qty,0,null);}
      if(o.type==='采购退货'&&o.purchaseReturnCode){appendLink(batch,'采购退货',o.purchaseReturnCode,o.date,o.qty,o.price||0,null);}
    });
  }
}
// 查找包含指定单号的批次链路，用于详情弹窗
function findBatchesByCode(code){
  var db=GD(),result=[];var seen=new Set();
  db.inventory.forEach(function(inv){
    (inv.batches||[]).forEach(function(b,idx){
      // 路径1：直接匹配
      if(b.purchaseInCode===code||b.salesReturnCode===code||b.purchaseOrderCode===code){result.push(b);seen.add(b);}
      // 路径2：通过 outRecord 匹配
      var hasOutMatch=false;
      (b.outRecords||[]).forEach(function(o){
        if(o.salesOutCode===code||o.purchaseReturnCode===code){
          var bb=JSON.parse(JSON.stringify(b));
          bb._matchedOut=o;bb._inv={warehouseId:inv.warehouseId,goodsId:inv.goodsId};
          result.push(bb);seen.add(b);hasOutMatch=true;
        }
      });
      // 路径3：通过 linkChain 匹配（跳过已在路径1/2中命中的）
      if(!seen.has(b)&&b.linkChain&&b.linkChain.some(function(l){return l.code===code})){result.push(b);seen.add(b);}
    });
  });
  return result;
}
// 按入库单分组展示关联批次
function renderBatchGroups(batches){
  if(!batches||!batches.length)return '';
  var groups={};
  batches.forEach(function(b){
    // 从linkChain提取入库单号
    var piCode='(独立入库)';
    var lc=b.linkChain||[];
    for(var i=0;i<lc.length;i++){
      if(lc[i].action==='采购入库'&&lc[i].code){piCode=lc[i].code;break;}
    }
    if(!piCode&&b.purchaseInCode)piCode=b.purchaseInCode;
    if(!groups[piCode])groups[piCode]=[];
    groups[piCode].push(b);
  });
  var h='';
  var gkeys=Object.keys(groups).sort();
  for(var gi=0;gi<gkeys.length;gi++){
    var gk=gkeys[gi],gbs=groups[gk];
    // 汇总
    var totalQty=0;
    gbs.forEach(function(b){totalQty+=b._matchedOut?b._matchedOut.qty:(b.qty||0)});
    h+='<div style="margin:4px 0;padding:4px 8px;background:#f0f5ff;border-radius:4px;font-weight:600;font-size:11px">📥 入库单: <span style="cursor:pointer;text-decoration:underline;color:#1890ff" onclick="event.stopPropagation();viewByCode(\''+gk+'\')">'+gk+'</span> (出库'+totalQty+'件)</div>';
    h+='<table style="width:100%;font-size:11px;margin:2px 0 8px 0"><thead><tr><th>仓储批次号</th><th>出库数量</th><th>剩余在库</th><th>全链路单号</th></tr></thead><tbody>';
    gbs.forEach(function(b){
      var batchCode=b.batchCode||'BTH-';
      var outQty=b._matchedOut?b._matchedOut.qty:(b.qty||0);
      var rem=b.remaining!=null?b.remaining:b.qty;
      h+='<tr><td><b>'+batchCode+'</b></td><td>'+outQty+'</td><td>'+rem+'</td><td>'+renderLinkChainTree(b)+'</td></tr>';
    });
    h+='</tbody></table>';
  }
  return h;
}

// ============ 初始化数据 ============
function initDB(){
  let db={
    goods:[],suppliers:[],customers:[],warehouses:[],staff:[],accounts:[],
    units:[],categories:[],colorGroups:[],sizeGroups:[],
    inventory:[],stockFlows:[],auditLogs:[],notifications:[],redDots:[],completedBatches:[],permissions:{},
    purchaseOrders:[],purchaseIn:[],purchaseReturn:[],purchasePayments:[],
    salesOrders:[],salesOut:[],salesReturn:[],salesReceipts:[],
    checkOrders:[],checkProfit:[],checkLoss:[],transfers:[],
    incomeRecords:[],expenseRecords:[],
    quotations:[],members:[],memberRecharges:[],posOrders:[],invoices:[],projects:[],rentals:[],repairs:[],rebates:[],
    nextIds:{}
  };
  // 基础单位
  db.units=[{id:1,name:'个'},{id:2,name:'箱'},{id:3,name:'kg'},{id:4,name:'件'},{id:5,name:'米'},{id:6,name:'桶'},{id:7,name:'台'},{id:8,name:'吨'}];
  // 商品类别（树形）
  db.categories=[{id:1,pid:0,name:'成品'},{id:2,pid:0,name:'原料'},{id:3,pid:0,name:'半成品'},{id:4,pid:0,name:'包装物'}];
  // 仓库
  db.warehouses=[{id:1,code:'CK001',name:'总仓库',addr:'公司总部',mgr:'张主管',tel:'13800001111'},{id:2,code:'CK002',name:'原材料仓',addr:'厂区A栋',mgr:'李主管',tel:'13800002222'}];
  // 供应商
  db.suppliers=[{id:1,code:'GYS001',name:'优质供应商公司',contact:'王经理',tel:'13900001111',addr:'北京市朝阳区',bank:'工商银行',acct:'6222021234567890',note:''},{id:2,code:'GYS002',name:'恒达贸易有限公司',contact:'赵经理',tel:'13900002222',addr:'上海市浦东新区',bank:'建设银行',acct:'6227001234567890',note:''}];
  // 客户
  db.customers=[{id:1,code:'KH001',name:'盛世商贸有限公司',contact:'陈老板',tel:'13700001111',addr:'广州市天河区',credit:50000,note:''},{id:2,code:'KH002',name:'鑫源批发市场',contact:'刘经理',tel:'13700002222',addr:'深圳市福田区',credit:30000,note:''}];
  // 员工
  db.staff=[{id:1,code:'YG001',name:'张三',dept:'采购部',tel:'13600001111',account:'',password:''},{id:2,code:'YG002',name:'李四',dept:'销售部',tel:'13600002222',account:'',password:''},{id:3,code:'YG003',name:'王五',dept:'仓管部',tel:'13600003333',account:'',password:''}];
  // 会计科目
  db.accounts=[{id:1,code:'1001',name:'库存现金',type:'资产',bal:0},{id:2,code:'1002',name:'银行存款',type:'资产',bal:0},{id:3,code:'5001',name:'主营业务收入',type:'收入',bal:0},{id:4,code:'5401',name:'主营业务成本',type:'支出',bal:0}];
  // 颜色组
  db.colorGroups=[{id:1,name:'标准颜色',colors:['红色','蓝色','绿色','黑色','白色','黄色']}];
  // 尺码组
  db.sizeGroups=[{id:1,name:'服装尺码',sizes:['S','M','L','XL','XXL']},{id:2,name:'鞋码',sizes:['36','37','38','39','40','41','42','43']}];
  // 商品
  db.goods=[
    {id:1,code:'SP001',name:'通用商品A',spec:'标准',model:'GA-001',unit:'个',barcode:'6901234567890',category:'成品',purchPrice:10,costPrice:9,retailPrice:15,industryType:'general',status:'正常',note:''},
    {id:2,code:'SP002',name:'食品样品B',spec:'500g',model:'',unit:'袋',barcode:'6901234567891',category:'成品',purchPrice:25,costPrice:20,retailPrice:35,industryType:'food',batchNo:'PC20260701',prodDate:'2026-06-15',expiryDate:'2027-06-15',shelfLife:365,status:'正常',note:''},
    {id:3,code:'SP003',name:'服装样品C',spec:'标准',model:'CL-001',unit:'件',barcode:'6901234567892',category:'成品',purchPrice:50,costPrice:40,retailPrice:80,industryType:'apparel',colorGroupId:1,sizeGroupId:1,status:'正常',note:''}
  ];
  // 库存
  db.inventory=[{goodsId:1,warehouseId:1,qty:100,warnQty:20},{goodsId:2,warehouseId:1,qty:50,warnQty:10},{goodsId:3,warehouseId:1,qty:30,warnQty:5}];
  db.nextIds={goods:4,warehouse:3,supplier:3,customer:3,staff:4,account:5,unit:9,category:5,colorGroup:2,sizeGroup:3,notification:1};
  return db;
}

// 重置所有业务数据(保留基础配置)
function resetAllData(){
  var db=GD();
  // 清空所有业务单据
  db.purchaseOrders=[]; db.purchaseIn=[]; db.purchaseReturn=[]; db.purchasePayments=[];
  db.salesOrders=[]; db.salesOut=[]; db.salesReturn=[]; db.salesReceipts=[];
  db.checkOrders=[]; db.checkProfit=[]; db.checkLoss=[]; db.transfers=[];
  db.incomeRecords=[]; db.expenseRecords=[];
  db.quotations=[]; db.members=[]; db.memberRecharges=[]; db.posOrders=[]; db.invoices=[]; db.projects=[]; db.rentals=[]; db.repairs=[]; db.rebates=[];
  // 清空库存
  db.inventory=[];
  db.stockFlows=[]; db.auditLogs=[]; db.notifications=[]; db.redDots=[]; db.completedBatches=[];
  db.permissions={};
  // 重置nextIds
  db.nextIds={goods:4,warehouse:3,supplier:3,customer:3,staff:4,account:5,unit:9,category:5,colorGroup:2,sizeGroup:3,notification:1};
  saveD(db);
  nav('dashboard','首页仪表盘');
  toast('✅ 所有业务数据已重置，基础配置保留');
}

// ============ 导航 ============
const NAV = [
  {page:'dashboard',label:'首页仪表盘',icon:'📊'},
  {page:'purchase',label:'采购管理',icon:'🛒',sub:[
    {page:'purchase-order',label:'采购订单'},{page:'purchase-in',label:'采购入库'},
    {page:'purchase-pay',label:'付款结算'},{page:'purchase-return',label:'采购退货'}
  ]},
  {page:'sales',label:'销售管理',icon:'💰',sub:[
    {page:'sales-order',label:'销售订单'},{page:'sales-out',label:'销售出库'},
    {page:'sales-receive',label:'收款结算'},{page:'sales-return',label:'销售退货'},
    {page:'sales-quotation',label:'报价管理'}
  ]},
  {page:'warehouse',label:'仓库管理',icon:'🏭',sub:[
    {page:'warehouse-query',label:'库存查询'},{page:'warehouse-check',label:'仓库盘点'},
    {page:'warehouse-transfer',label:'库存调拨'},{page:'warehouse-alert',label:'库存预警'},
    {page:'warehouse-flow',label:'库存流水'},{page:'warehouse-completed',label:'已结算货物'}
  ]},
  {page:'finance',label:'财务记账',icon:'📋',sub:[
    {page:'finance-receivable',label:'应收款管理'},{page:'finance-payable',label:'应付款管理'},
    {page:'finance-income',label:'其他收入'},{page:'finance-expense',label:'费用支出'},
    {page:'finance-reconciliation',label:'往来对账'},{page:'finance-profit',label:'利润报表'}
  ]},
  {page:'baseinfo',label:'基本信息',icon:'⚙️',sub:[{page:'baseinfo-qr-quick',label:'二维码快速出入库'},
    {page:'baseinfo-goods',label:'商品信息'},{page:'baseinfo-supplier',label:'供应商信息'},
    {page:'baseinfo-customer',label:'客户信息'},{page:'baseinfo-warehouse',label:'仓库信息'},
    {page:'baseinfo-dept',label:'部门信息'},{page:'baseinfo-staff',label:'员工信息'},{page:'baseinfo-account',label:'会计科目'},
    {page:'baseinfo-unit',label:'计量单位'},{page:'baseinfo-category',label:'商品类别'},
    {page:'baseinfo-color',label:'颜色管理'},{page:'baseinfo-size',label:'尺码管理'},
    {page:'baseinfo-logistics',label:'快递物流'},{page:'baseinfo-member',label:'会员管理'}
  ]},  {page:'reports',label:'报表中心',icon:'📈',sub:[
    {page:'reports-purchase-stats',label:'采购统计报表'},{page:'reports-sales-stats',label:'销售统计报表'},
    {page:'reports-inventory-stats',label:'库存统计报表'},{page:'reports-finance-stats',label:'财务报表'}
  ]}
];

function renderNav(){
  let h='';
  NAV.forEach(item=>{
    if(item.sub){
      h+=`<div class="nav-item" data-page="${item.page}" onclick="toggleSub(this,'${item.page}')"><span class="ico">${item.icon}</span>${item.label}</div>`;
      h+=`<div class="sub-nav" id="sub-${item.page}">`;
      item.sub.forEach(s=>{h+=`<div class="sub-item" data-page="${s.page}" onclick="nav('${s.page}','${s.label}')">${s.label}</div>`});
      h+=`</div>`;
    }else{
      h+=`<div class="nav-item" data-page="${item.page}" onclick="nav('${item.page}','${item.label}')"><span class="ico">${item.icon}</span>${item.label}</div>`;
    }
  });
  h+='<div class="nav-item" data-page="notifications" onclick="nav(\'notifications\',\'消息通知\')"><span class="ico">📬</span>消息通知</div>';
  $('nav').innerHTML=h;
}

let curPage='dashboard',expanded={purchase:true};
function toggleSub(el,page){
  expanded[page]=!expanded[page];
  let sub=$('sub-'+page);if(sub)sub.classList.toggle('open',expanded[page]);
  nav(page,el.textContent.replace(/[^一-龥]/g,''));
}
function tgSide(){$('side').classList.toggle('open')}
function navToRecord(page,title,recordId,highlightMs){
  // 跳转到指定页面并高亮对应行
  nav(page,title);
  highlightMs=highlightMs||4000;
  setTimeout(function(){
    var rows=document.querySelectorAll('#pg table tbody tr');
    for(var i=0;i<rows.length;i++){
      var td=rows[i].querySelector('td:first-child');
      if(td&&td.textContent.indexOf(String(recordId))>=0){
        rows[i].style.background='#fff7e6';
        rows[i].style.transition='background 0.3s';
        rows[i].scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(function(){rows[i].style.background=''},highlightMs);
        toast('📌 已定位到单据 '+recordId);
        return;
      }
    }
    toast('单据已跳转，可在列表中查看');
  },500);
}
function nav(page,title){
  curPage=page;$('bread').innerHTML='📍 <b>'+title+'</b>';
  document.querySelectorAll('.nav-item,.sub-item').forEach(e=>e.classList.remove('active'));
  let el=document.querySelector(`[data-page="${page}"]`);if(el)el.classList.add('active');
  Object.keys(expanded).forEach(k=>{let s=$('sub-'+k);if(s)s.classList.toggle('open',expanded[k])});
  sessionStorage.setItem('wms_curPage',page);
  sessionStorage.setItem('wms_curTitle',title);
  renderPage(page);updateAlert();updateAuditBadge();
}
function updateAlert(){
  let db=GD();let warns=0;
  db.inventory.forEach(inv=>{if(inv.qty<=inv.warnQty)warns++});
  updateTodoBadge();
}

function updateTodoBadge(){
  var db=GD(),cnt=0;
  var myRole=isSupervisor()?'supervisor':(isAuditor()?'auditor':'staff');
  // 待审核单据数（仅审核员和主管）
  if(isAuditor()||isSupervisor()){
    Object.values(AUDITABLE).forEach(function(cfg){
      if(myRole==='auditor'&&!hasAuditPerm(Object.keys(AUDITABLE).find(function(k){return AUDITABLE[k]===cfg})))return;
      (db[cfg.list]||[]).forEach(function(r){if(r.auditStatus==='待审核')cnt++});
    });
  }
  // 员工：草稿单据（需要提交审核）
  if(myRole==='staff'){
    Object.values(AUDITABLE).forEach(function(cfg){(db[cfg.list]||[]).forEach(function(r){
      if((!r.auditStatus||r.auditStatus==='草稿')&&(r.staffId===parseInt(currentUser.accountId)||r.creatorId===currentUser.accountId||r.operatorId===currentUser.accountId))cnt++;
    })});
  }
  // 员工：被驳回的单据
  if(myRole==='staff'){
    Object.values(AUDITABLE).forEach(function(cfg){(db[cfg.list]||[]).forEach(function(r){
      if(r.auditStatus==='已驳回'&&(r.staffId===parseInt(currentUser.accountId)||r.creatorId===currentUser.accountId||r.operatorId===currentUser.accountId))cnt++;
    })});
  }
  // 员工：关联单据可下一步操作
  if(myRole==='staff'){
    Object.values(AUDITABLE).forEach(function(cfg){(db[cfg.list]||[]).forEach(function(r){
      if(r.auditStatus==='已审核'&&(r.staffId===parseInt(currentUser.accountId)||r.creatorId===currentUser.accountId||r.operatorId===currentUser.accountId)){
        if(cfg.list==='purchaseIn'&&(r.status==='未付款'||r.status==='部分付款'))cnt++;
        if(cfg.list==='salesOut'&&(r.status==='未收款'||r.status==='部分收款'))cnt++;
      }
    })});
  }
  // 库存预警数（审核员和主管）
  if(isAuditor()||isSupervisor()){
    db.inventory.forEach(function(inv){if(inv.qty<=inv.warnQty)cnt++});
  }
  var b=$('alertBadge');
  b.textContent=cnt>0?'待办事项：'+cnt:'无待办事项';
  b.classList.remove('hidden');
  b.style.cursor='pointer';
  b.onclick=function(){showTodoModal()};
}
function showTodoModal(){
  var db=GD(),h='';
  var myRole=isSupervisor()?'supervisor':(isAuditor()?'auditor':'staff');
  var vm={purchaseOrder:'viewPO',purchaseIn:'viewPI',purchaseReturn:'viewPR',purchasePay:'viewPPay',salesOrder:'viewSO',salesOut:'viewSOut',salesReturn:'viewSR',salesReceive:'viewSRv',checkOrder:'viewCheck',transfer:'viewTrans'};

  // === 员工待办 ===
  if(myRole==='staff'){
    // 草稿单据（需要提交审核）
    var draftList=[];
    Object.entries(AUDITABLE).forEach(function(_e){var type=_e[0],cfg=_e[1];
      (db[cfg.list]||[]).forEach(function(r){
        if((!r.auditStatus||r.auditStatus==='草稿')&&(r.staffId===parseInt(currentUser.accountId)||r.creatorId===currentUser.accountId||r.operatorId===currentUser.accountId)){
          draftList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,navPage:cfg.navPage,note:r.note||''});
        }
      });
    });
    if(draftList.length>0){
      h+='<div style="margin-bottom:12px"><div style="font-weight:600;color:#fa8c16;margin-bottom:6px">📝 草稿单据，请提交审核 ('+draftList.length+')</div>';
      h+='<table style="width:100%;font-size:12px"><thead><tr><th>类型</th><th>单号</th><th>备注</th><th>日期</th><th>操作</th></tr></thead><tbody>';
      draftList.forEach(function(a){
        h+='<tr><td>'+a.label+'</td><td>'+a.code+'</td><td>'+noteHtml(a)+'</td><td>'+fd(a.date)+'</td><td><button class="btn btn-xs btn-o" onclick="clsModal();navToRecord(\''+a.navPage+'\',\''+a.label+'\','+a.id+')">查看</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    // 被驳回的单据
    var rejectedList=[];
    Object.entries(AUDITABLE).forEach(function(_e){var type=_e[0],cfg=_e[1];
      (db[cfg.list]||[]).forEach(function(r){
        if(r.auditStatus==='已驳回'&&(r.staffId===parseInt(currentUser.accountId)||r.creatorId===currentUser.accountId||r.operatorId===currentUser.accountId)){
          rejectedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,navPage:cfg.navPage,note:r.auditReason||r.note||''});
        }
      });
    });
    if(rejectedList.length>0){
      h+='<div style="margin-bottom:12px"><div style="font-weight:600;color:#ff4d4f;margin-bottom:6px">🔴 被驳回，请修改重提 ('+rejectedList.length+')</div>';
      h+='<table style="width:100%;font-size:12px"><thead><tr><th>类型</th><th>单号</th><th>备注</th><th>日期</th><th>操作</th></tr></thead><tbody>';
      rejectedList.forEach(function(a){
        h+='<tr><td>'+a.label+'</td><td>'+a.code+'</td><td>'+noteHtml(a)+'</td><td>'+fd(a.date)+'</td><td><button class="btn btn-xs btn-o" onclick="clsModal();navToRecord(\''+a.navPage+'\',\''+a.label+'\','+a.id+')">查看</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    // 关联单据变动（审核通过的可下一步操作）
    var relatedList=[];
    Object.entries(AUDITABLE).forEach(function(_e){var type=_e[0],cfg=_e[1];
      (db[cfg.list]||[]).forEach(function(r){
        if(r.auditStatus==='已审核'&&(r.staffId===parseInt(currentUser.accountId)||r.creatorId===currentUser.accountId||r.operatorId===currentUser.accountId)){
          // 采购入库→去付款
          if(type==='purchaseIn'&&(r.status==='未付款'||r.status==='部分付款')){
            relatedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,action:'已审核通过，可去付款',navPage:cfg.navPage});
          }
          // 销售出库→去收款
          if(type==='salesOut'&&(r.status==='未收款'||r.status==='部分收款')){
            relatedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,action:'已审核通过，可去收款',navPage:cfg.navPage});
          }
          // 采购订单审核通过→可转入库（不是付款结算类型）
          if(type==='purchaseOrder'&&(r.status==='已审核'||r.status==='部分入库')){
            relatedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,action:'已审核通过，可转入库单',navPage:'purchase-in'});
          }
          // 销售订单审核通过→可转出库
          if(type==='salesOrder'&&(r.status==='已审核'||r.status==='部分出库')){
            relatedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,action:'已审核通过，可转出库单',navPage:'sales-out'});
          }
          // 采购退货审核通过→可去付款（退款）
          if(type==='purchaseReturn'&&(r.status==='已审核')){
            relatedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,action:'已审核通过',navPage:cfg.navPage});
          }
          // 销售退货审核通过→可去收款（退款）
          if(type==='salesReturn'&&(r.status==='已审核')){
            relatedList.push({type:type,label:cfg.label,id:r.id,code:r.code,date:r.date,action:'已审核通过',navPage:cfg.navPage});
          }
        }
      });
    });
    if(relatedList.length>0){
      h+='<div style="margin-bottom:12px"><div style="font-weight:600;color:#1890ff;margin-bottom:6px">📋 可进行下一步操作 ('+relatedList.length+')</div>';
      h+='<table style="width:100%;font-size:12px"><thead><tr><th>类型</th><th>单号</th><th>提示</th><th>日期</th><th>操作</th></tr></thead><tbody>';
      relatedList.forEach(function(a){
        h+='<tr><td>'+a.label+'</td><td>'+a.code+'</td><td>'+a.action+'</td><td>'+fd(a.date)+'</td><td><button class="btn btn-xs btn-o" onclick="clsModal();navToRecord(\''+a.navPage+'\',\''+a.label+'\','+a.id+')">查看</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
  }

  // === 审核员/主管：待审核单据 ===
  if(myRole==='auditor'||myRole==='supervisor'){
    var auditList=[];
    Object.entries(AUDITABLE).forEach(function(_e){var type=_e[0],cfg=_e[1];
      if(myRole==='auditor'&&!hasAuditPerm(type))return;
      (db[cfg.list]||[]).forEach(function(r){
        if(r.auditStatus==='待审核'){
          var refName='';
          if(type.includes('purchase'))refName=gSName(r.supplierId||r.id);
          else if(type.includes('sales'))refName=gCName(r.customerId||r.id);
          else refName='-';
          auditList.push({type:type,label:cfg.label,id:r.id,code:r.code,refName:refName,date:r.date,navPage:cfg.navPage,viewFn:vm[type]});
        }
      });
    });
    if(auditList.length>0){
      h+='<div style="margin-bottom:12px"><div style="font-weight:600;color:#ff4d4f;margin-bottom:6px">🔴 待审核单据 ('+auditList.length+')</div>';
      h+='<table style="width:100%;font-size:12px"><thead><tr><th>类型</th><th>单号</th><th>关联方</th><th>日期</th><th>操作</th></tr></thead><tbody>';
      auditList.forEach(function(a){
        h+='<tr><td>'+a.label+'</td><td>'+a.code+'</td><td>'+a.refName+'</td><td>'+fd(a.date)+'</td><td><button class="btn btn-xs btn-o" onclick="clsModal();navToRecord(\''+a.navPage+'\',\''+a.label+'\','+a.id+')">查看</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
  }

  // === 审核员/主管：库存预警 ===
  if(myRole==='auditor'||myRole==='supervisor'){
    var warnList=db.inventory.filter(function(i){return i.qty<=i.warnQty});
    if(warnList.length>0){
      h+='<div style="margin-bottom:12px"><div style="font-weight:600;color:#fa8c16;margin-bottom:6px">⚠️ 库存预警 ('+warnList.length+')</div>';
      h+='<table style="width:100%;font-size:12px"><thead><tr><th>商品</th><th>仓库</th><th>当前库存</th><th>预警线</th><th>操作</th></tr></thead><tbody>';
      warnList.forEach(function(inv){
        var gname=gGName(inv.goodsId),wname=gWName(inv.warehouseId);
        h+='<tr><td>'+gname+'</td><td>'+wname+'</td><td style="color:#ff4d4f;font-weight:600">'+inv.qty+'</td><td>'+inv.warnQty+'</td><td><button class="btn btn-xs btn-o" onclick="clsModal();nav(\'warehouse-query\',\'库存查询\')">查看库存</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
  }

  if(!h)h='<div class="empty"><div class="ico">✅</div><h3>暂无待办事件</h3></div>';
  modal('📋 待办事件',h,
    '<button class="btn btn-p" onclick="clsModal()">关闭</button>');
}

// 快速操作处理（二维码扫码等）
function handleQuickActions(){
  var qs=window.location.search;
  if(!qs)return;
  var getParam=function(name){var m=qs.match(new RegExp('[?&]'+name+'=([^&]*)'));return m?decodeURIComponent(m[1]):null};
  var action=getParam('action');
  var goodsId=parseInt(getParam('goodsId'));
  if(!goodsId)return;
  if(action!=='quick-in'&&action!=='quick-out')return;
  // 清理 URL 参数，防止刷新重复弹窗
  if(window.history&&window.history.replaceState){
    var newUrl=window.location.pathname;
    window.history.replaceState({},document.title,newUrl);
  }
  // 暂存参数，等登录后处理
  window._qrParams={
    action:action,
    goodsId:goodsId,
    qty:getParam('qty'),
    qtyLock:getParam('qtyLock'),
    price:getParam('price'),
    priceLock:getParam('priceLock'),
    whId:getParam('whId'),
    whLock:getParam('whLock'),
    supId:getParam('supId'),
    supLock:getParam('supLock'),
    custId:getParam('custId'),
    custLock:getParam('custLock')
  };
  // 检查登录状态
  if(currentUser){
    execQR();
  }else{
    // 未登录，先登录
    showLogin();
    // 劫持 doLogin 在登录后执行
    var _origDoLogin2=doLogin;
    doLogin=function(){
      _origDoLogin2();
      setTimeout(execQR,400);
      doLogin=_origDoLogin2;
    };
  }
}

// 行扫码快速操作
function execQR(){
  var p=window._qrParams;
  if(!p)return;
  window._qrParams=null;
  // 重复扫码确认
  if(!qrCheckDup(p.goodsId)){
    return;
  }
  if(p.action==='quick-in'){
    nav('purchase-in','采购入库');
    setTimeout(function(){addPI_QR(null, p.goodsId, p.qty, p.qtyLock, p.price, p.priceLock, p.whId, p.whLock, p.supId, p.supLock)},400);
  }else{
    nav('sales-out','销售出库');
    setTimeout(function(){addSOut_QR(null, p.goodsId, p.qty, p.qtyLock, p.price, p.priceLock, p.whId, p.whLock, p.custId, p.custLock)},400);
  }
}

// ===== 重复扫码确认 =====
function qrLogKey(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function qrCheckDup(goodsId){
  var today=qrLogKey();
  var log;try{log=JSON.parse(localStorage.getItem('wms_qr_scan_log')||'{}')}catch(e){log={}}
  var todayLog=log[today]||{};
  var cnt=todayLog[goodsId]||0;
  if(cnt===0)return true;  // 今天第一次扫，放行
  // 检查"今日不再提醒"
  var noRemind=localStorage.getItem('wms_qr_noremind_'+goodsId+'_'+today);
  if(noRemind==='1')return true;
  // 弹确认窗
  confirm('重复扫码提醒','您今日已通过扫描该码创建了 <b>'+cnt+'</b> 条订单，是否继续？',
    'qrGo|'+goodsId+'|'+cnt,
    '今日不再提醒',
    function(){
      localStorage.setItem('wms_qr_noremind_'+goodsId+'_'+today,'1');
      qrLogScan(goodsId);
      execQR();
    }
  );
  return false;
}
function qrLogScan(goodsId){
  var today=qrLogKey();
  var log;try{log=JSON.parse(localStorage.getItem('wms_qr_scan_log')||'{}')}catch(e){log={}}
  if(!log[today])log[today]={};
  log[today][goodsId]=(log[today][goodsId]||0)+1;
  localStorage.setItem('wms_qr_scan_log',JSON.stringify(log));
}
// confirm 重载：支持"第三个按钮"
var _origConfirm3=confirm;
confirm=function(title,msg,act,btn2Text,btn2Fn){
  if(!btn2Text){_origConfirm3(title,msg,act);return}
  // 新的三按钮弹窗
  var btns='<button class="btn btn-o" onclick="clsModal()">取消</button>';
  btns+='<button class="btn btn-o" onclick="clsModal();('+btn2Fn.toString()+')()">'+btn2Text+'</button>';
  btns+='<button class="btn btn-p" onclick="clsModal();_doAction(\''+act+'\')">继续创建</button>';
  var h='<div style="text-align:center;padding:10px"><p style="font-size:14px;margin-bottom:16px">'+msg+'</p></div>';
  modal(title,h,btns);
};
// QR Go 动作
window._actHandlers=window._actHandlers||{};
window._actHandlers['qrGo']=function(goodsId,cnt){
  qrLogScan(goodsId);
  execQR();
};

// ===== 商品默认供应商 =====
function gGoodsDefaultSupplier(goodsId){
  var db=GD();
  var g=db.goods.find(function(x){return x.id===parseInt(goodsId)});
  if(g&&g.defaultSupplierId)return g.defaultSupplierId;
  // 查最近一次采购入库
  if(db.purchaseIn){
    var piList=db.purchaseIn.filter(function(x){return x.auditStatus==='已审核'}).reverse();
    for(var i=0;i<piList.length;i++){
      if(piList[i].details&&piList[i].details.some(function(d){return d.goodsId===parseInt(goodsId)})){
        return piList[i].supplierId;
      }
    }
  }
  return null;
}

// ===== 扫码专用入库 =====
function addPI_QR(orderId, goodsId, qty, qtyLock, price, priceLock, whId, whLock, supId, supLock){
  var db=GD();
  qty=qty||'';price=price||'';whId=whId||'';supId=supId||'';
  qtyLock=qtyLock==='1';priceLock=priceLock==='1';whLock=whLock==='1';supLock=supLock==='1';
  var allFilled=goodsId&&qty&&parseFloat(qty)>0&&price&&parseFloat(price)>0&&whId&&supId;
  // 默认供应商
  if(!supId){
    var defSup=gGoodsDefaultSupplier(goodsId);
    if(defSup){supId=String(defSup);allFilled=allFilled&&supId}
  }
  var suppOpts=db.suppliers.map(function(s){return'<option value="'+s.id+'"'+(s.id===parseInt(supId)?' selected':'')+'>'+s.name+'</option>'}).join('');
  var whOpts=db.warehouses.map(function(w){return'<option value="'+w.id+'"'+(w.id===parseInt(whId)?' selected':'')+'>'+w.name+'</option>'}).join('');
  var goodsOpts=db.goods.map(function(g){return'<option value="'+g.id+'"'+(g.id===parseInt(goodsId)?' selected':'')+'>'+g.name+'('+(g.spec||'')+')</option>'}).join('');
  var code=gCode(BILL_PREFIX.purchaseIn,'purchaseIn');
  modal('📷 扫码入库 — '+code,`
    <div class="frow"><div class="fg"><label><span class="req">*</span>单号</label><input id="pi2Code" value="${code}"></div><div class="fg"><label><span class="req">*</span>供应商</label><select id="pi2SupId"${supLock?' disabled style="background:#f5f5f5"':''}>${suppOpts}</select>${supLock?'<input type="hidden" id="pi2SupId_h" value="'+supId+'">':''}</div></div>
    <div class="frow"><div class="fg"><label><span class="req">*</span>仓库</label><select id="pi2WhId"${whLock?' disabled style="background:#f5f5f5"':''}>${whOpts}</select>${whLock?'<input type="hidden" id="pi2WhId_h" value="'+whId+'">':''}</div><div class="fg"><label>日期</label><input id="pi2Date" type="date" value="${now()}"></div></div>
    <div class="frow"><div class="fg"><label>制单人</label><select id="pi2StId">${db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')}</select></div><div class="fg"><label>备注</label><input id="pi2Note"></div></div>
    <h4 style="margin:8px 0">入库明细 — 📷 扫码自动填入</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">本次入库</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="pi2Detail"><tr><td><select>${goodsOpts}</select></td><td><span class="m-lbl">数量</span><input type="number" value="${qty||1}" min="1" style="width:55px"${qtyLock?' disabled':''}></td><td><span class="m-lbl">单价</span><input type="number" value="${price||0}" step="0.01" style="width:65px"${priceLock?' disabled':''}></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr></tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('pi2Detail');let r=t.insertRow();r.innerHTML=t.rows[0].innerHTML">+ 添加明细</button>
    <div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传附件(图片/PDF)</strong><br><input type="file" id="piFile" accept="image/*,.pdf" multiple style="margin-top:8px"></div>
    ${allFilled?'<div style="margin-top:8px;padding:8px;background:#e6f7ff;border-radius:6px;text-align:center;font-size:12px;color:#1890ff">⚡ 所有字段已预填，可直接一键创建</div>':''}`,
    '<button class="btn btn-o" onclick="clsModal()">取消</button>'
    + (allFilled?'<button class="btn btn-p" onclick="window._savePI_QR()">⚡ 一键创建</button>':'')
    + '<button class="btn btn-p'+(allFilled?' btn-o':'')+'" onclick="window._savePI()">保存</button>');
  window._savePI=savePI;
  window._savePI_QR=savePI_QR;
}

// 一键创建入库（跳过手动确认）
function savePI_QR(){
  if(!hasPerm("purchase-in")){toast("无此页面操作权限");return}
  // 处理锁定字段
  var supEl=$('pi2SupId_h');if(supEl){$('pi2SupId').value=supEl.value}
  var whEl=$('pi2WhId_h');if(whEl){$('pi2WhId').value=whEl.value}
  savePI();
  // 记录扫码日志
  if(window._qrScanGoodsId)qrLogScan(window._qrScanGoodsId);
}

// ===== 扫码专用出库 =====
function addSOut_QR(orderId, goodsId, qty, qtyLock, price, priceLock, whId, whLock, custId, custLock){
  var db=GD();
  qty=qty||'';price=price||'';whId=whId||'';custId=custId||'';
  qtyLock=qtyLock==='1';priceLock=priceLock==='1';whLock=whLock==='1';custLock=custLock==='1';
  var allFilled=goodsId&&qty&&parseFloat(qty)>0&&price&&parseFloat(price)>0&&whId&&custId;
  var custOpts=db.customers.map(function(c){return'<option value="'+c.id+'"'+(c.id===parseInt(custId)?' selected':'')+'>'+c.name+'</option>'}).join('');
  var whOpts=db.warehouses.map(function(w){return'<option value="'+w.id+'"'+(w.id===parseInt(whId)?' selected':'')+'>'+w.name+'</option>'}).join('');
  var goodsOpts=db.goods.map(function(g){return'<option value="'+g.id+'"'+(g.id===parseInt(goodsId)?' selected':'')+'>'+g.name+'('+(g.spec||'')+')</option>'}).join('');
  var code=gCode(BILL_PREFIX.salesOut,'salesOut');
  modal('📷 扫码出库 — '+code,`
    <div class="frow"><div class="fg"><label><span class="req">*</span>单号</label><input id="so2Code" value="${code}"></div><div class="fg"><label><span class="req">*</span>客户</label><select id="so2CustId"${custLock?' disabled style="background:#f5f5f5"':''}>${custOpts}</select>${custLock?'<input type="hidden" id="so2CustId_h" value="'+custId+'">':''}</div></div>
    <div class="frow"><div class="fg"><label><span class="req">*</span>仓库</label><select id="so2WhId" onchange="refreshSOutBatchOpts()"${whLock?' disabled style="background:#f5f5f5"':''}>${whOpts}</select>${whLock?'<input type="hidden" id="so2WhId_h" value="'+whId+'">':''}</div><div class="fg"><label>日期</label><input id="so2Date" type="date" value="${now()}"></div></div>
    <div class="frow"><div class="fg"><label>业务员</label><select id="so2StId">${db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')}</select></div><div class="fg"><label>备注</label><input id="so2Note"></div></div>
    <h4 style="margin:8px 0">出库明细 — 📷 扫码自动填入</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">本次出库</th><th style="width:90px">单价</th><th>仓储批次</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="so2Detail"><tr><td><select onchange="refreshSOutBatchOpts()">${goodsOpts}</select></td><td><span class="m-lbl">数量</span><input type="number" value="${qty||1}" min="1" style="width:55px"${qtyLock?' disabled':''}></td><td><span class="m-lbl">单价</span><input type="number" value="${price||0}" step="0.01" style="width:65px"${priceLock?' disabled':''}></td><td><select style="min-width:130px"><option value="">自动(FIFO)</option></select></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr></tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="var t=$('so2Detail');var fr=t.rows[0];var nr=t.insertRow();nr.innerHTML=fr.innerHTML;refreshSOutBatchOpts()">+ 添加明细</button>
    ${allFilled?'<div style="margin-top:8px;padding:8px;background:#e6f7ff;border-radius:6px;text-align:center;font-size:12px;color:#1890ff">⚡ 所有字段已预填，可直接一键创建</div>':''}`,
    '<button class="btn btn-o" onclick="clsModal()">取消</button>'
    + (allFilled?'<button class="btn btn-p" onclick="window._saveSOut_QR()">⚡ 一键创建</button>':'')
    + '<button class="btn btn-p'+(allFilled?' btn-o':'')+'" onclick="window._saveSOut()">保存</button>');
  window._saveSOut=saveSOut;
  window._saveSOut_QR=saveSOut_QR;
  refreshSOutBatchOpts();
}

// 一键创建出库
function saveSOut_QR(){
  if(!hasPerm("sales-out")){toast("无此页面操作权限");return}
  var custEl=$('so2CustId_h');if(custEl){$('so2CustId').value=custEl.value}
  var whEl=$('so2WhId_h');if(whEl){$('so2WhId').value=whEl.value}
  saveSOut();
}

// ===== 自举代码由各页面自行调用 =====

// ============ 弹窗系统 ============
function modal(title,body,footer,cls){
  let ov=document.createElement('div');ov.className='modal-overlay';ov.id='modalOverlay';
  ov.innerHTML=`<div class="modal ${cls||''}"><div class="modal-h"><h3>${title}</h3><span class="modal-close" onclick="clsModal()">&times;</span></div><div class="modal-b">${body}</div><div class="modal-f">${footer}</div></div>`;
  ov.onclick=e=>{if(e.target===ov)clsModal()};
  $('mc').appendChild(ov);
}
function clsModal(){$('mc').innerHTML=''}
// 全局动作调度器
window._act=null;
function _doAction(){
  if(!window._act)return;
  var s=window._act, parts=s.indexOf('|')>=0?s.split('|'):[''];
  var action=parts[0];
  window._act=null;
  // 审核类: action|type|id
  if(action==='submit')submitAudit(parts[1],parseInt(parts[2]));
  else if(action==='approve')approveAudit(parts[1],parseInt(parts[2]));
  else if(action==='cancel')cancelRecord(parts[1],parseInt(parts[2]));
  else if(action==='delRecord')delRecord(parts[1],parseInt(parts[2]));
  else if(action==='reject')doRejectAudit(parts[1],parseInt(parts[2]));
  // 删除类: action|id (只需id)
  else if(action==='delPO')_xDelPO(parseInt(parts[1]));
  else if(action==='delPI')_xDelPI(parseInt(parts[1]));
  else if(action==='delPR')_xDelPR(parseInt(parts[1]));
  else if(action==='delSO')_xDelSO(parseInt(parts[1]));
  else if(action==='delSO2')_xDelSOut(parseInt(parts[1]));
  else if(action==='delSR')_xDelSR(parseInt(parts[1]));
  else if(action==='delSRv')_xDelSRv(parseInt(parts[1]));
  else if(action==='delTrans')_xDelTrans(parseInt(parts[1]));
  else if(action==='delInc')_xDelInc(parseInt(parts[1]));
  else if(action==='delExp')_xDelExp(parseInt(parts[1]));
  else if(action==='delGoods')_xDelGoods(parseInt(parts[1]));
  else if(action==='delSup')_xDelSup(parseInt(parts[1]));
  else if(action==='delCust')_xDelCust(parseInt(parts[1]));
  else if(action==='qrClearAllConfirm')_doQrClearAll();
  else if(action==='delDept')_xDelDept(parseInt(parts[1]));
  else if(action==='resetData')resetAllData();
  else if(action==='delWh')_xDelWh(parseInt(parts[1]));
  else if(action==='delSt')_xDelSt(parseInt(parts[1]));
  else if(action==='delAcct')_xDelAcct(parseInt(parts[1]));
  else if(action==='qrImportClearConfirm')qrImportClearConfirm();
  else if(action==='qrImportDelConfirm')qrImportDelConfirm(parseInt(parts[1]));
  else if(action==='delPPay')_xDelPPay(parseInt(parts[1]));
}
function confirm(title,msg,actStr){
  window._act=actStr;
  modal(title,'<p>'+msg+'</p>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="var a=window._act;clsModal();window._act=a;_doAction()">确定</button>');
}
function toast(msg){
  let t=document.createElement('div');t.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 24px;border-radius:6px;z-index:999;font-size:13px;animation:fadeIn .3s';
  t.textContent=msg;document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300)},2000);
}

// ============ 通用表格 ============
function tHead(cols){return `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>`}
function tBody(rows,emptyCols,noteCols){
  noteCols=noteCols||[];
  if(!rows.length)return `<tbody><tr><td colspan="${emptyCols}" style="text-align:center;color:#ccc;padding:40px">暂无数据</td></tr></tbody>`;
  return `<tbody>${rows.map(function(r){return'<tr>'+r.map(function(c,i){var cls=noteCols.indexOf(i)>=0?' class="td-note"':'';return'<td'+cls+'>'+c+'</td>'}).join('')+'</tr>'}).join('')}</tbody>`;
}
function rTable(cols,rows,emptyCols,noteCols){
  return `<div class="twrap"><table>${tHead(cols)}${tBody(rows,emptyCols||cols.length,noteCols)}</table></div>`;
}

// ============ 快捷新增辅助 ============
function qAddGoods(cb){
  let db=GD();
  let indOptions=Object.entries(INDUSTRIES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.name}</option>`).join('');
  modal('快捷新增商品',`
    <div class="frow"><div class="fg"><label><span class="req">*</span>行业类型</label><select id="qgInd" onchange="qgToggleFields()">${indOptions}</select></div>
      <div class="fg"><label><span class="req">*</span>商品名称</label><input id="qgName"></div></div>
    <div class="frow"><div class="fg"><label>规格</label><input id="qgSpec"></div>
      <div class="fg"><label>型号</label><input id="qgModel"></div></div>
    <div class="frow"><div class="fg"><label>单位</label><select id="qgUnit">${db.units.map(u=>`<option value="${u.name}">${u.name}</option>`).join('')}</select></div>
      <div class="fg"><label>类别</label><select id="qgCat">${db.categories.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}</select></div></div>
    <div class="frow"><div class="fg"><label>条码</label><input id="qgBarcode"></div>
      <div class="fg"><label>仓库</label><select id="qgWh">${db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}</select></div></div>
    <div class="frow"><div class="fg"><label>成本价</label><input id="qgCost" type="number" step="0.01" value="0"></div>
      <div class="fg"><label>零售价</label><input id="qgRetail" type="number" step="0.01" value="0"></div></div>
    <div class="frow"><div class="fg"><label>采购价</label><input id="qgPurch" type="number" step="0.01" value="0"></div>
      <div class="fg"><label>预警线</label><input id="qgWarn" type="number" value="10"></div></div>
    <div id="qgExtra"></div>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveQGoods(${cb?1:0})">保存</button>`
  );
  window._qgCb=cb;
  qgToggleFields();
}
function qgToggleFields(){
  let it=$('qgInd').value;let fi=INDUSTRIES[it].fields;let h='';
  if(fi.includes('batchNo'))h+=`<div class="frow"><div class="fg"><label>批次批号</label><input id="qgBatchNo"></div><div class="fg"><label>生产日期</label><input id="qgProdDate" type="date"></div></div>`;
  if(fi.includes('expiryDate'))h+=`<div class="frow"><div class="fg"><label>有效期至</label><input id="qgExpiryDate" type="date"></div><div class="fg"><label>保质期(天)</label><input id="qgShelfLife" type="number"></div></div>`;
  if(fi.includes('serialNo'))h+=`<div class="frow"><div class="fg"><label>序列号管理</label><input id="qgSerialNo"></div></div>`;
  if(fi.includes('material'))h+=`<div class="frow"><div class="fg"><label>材质</label><input id="qgMaterial"></div><div class="fg"><label>产地</label><input id="qgOrigin"></div></div><div class="frow"><div class="fg"><label>重量</label><input id="qgWeight"></div><div class="fg"><label>长度</label><input id="qgLength"></div></div>`;
  if(fi.includes('colorGroupId')){
    let db=GD();h+=`<div class="frow"><div class="fg"><label>颜色组</label><select id="qgColorGroup">${db.colorGroups.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div><div class="fg"><label>尺码组</label><select id="qgSizeGroup">${db.sizeGroups.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div></div>`;
  }
  $('qgExtra').innerHTML=h;
}
function saveQGoods(hasCb){
  let db=GD();
  let it=$('qgInd').value;let fi=INDUSTRIES[it].fields;
  let id=nid(db,'goods');let code='SP'+String(id).padStart(3,'0');
  let g={id,code,industryType:it,status:'正常',
    name:$('qgName').value,spec:$('qgSpec').value,model:$('qgModel').value,
    unit:$('qgUnit').value,category:$('qgCat').value,barcode:$('qgBarcode').value,
    purchPrice:parseFloat($('qgPurch').value)||0,costPrice:parseFloat($('qgCost').value)||0,
    retailPrice:parseFloat($('qgRetail').value)||0,note:''};
  if(fi.includes('batchNo')){g.batchNo=$('qgBatchNo').value;g.prodDate=$('qgProdDate').value;g.expiryDate=$('qgExpiryDate').value;g.shelfLife=parseInt($('qgShelfLife').value)||0}
  if(fi.includes('serialNo'))g.serialNo=$('qgSerialNo').value;
  if(fi.includes('material')){g.material=$('qgMaterial').value;g.origin=$('qgOrigin').value;g.weight=$('qgWeight').value;g.length=$('qgLength').value}
  if(fi.includes('colorGroupId')){g.colorGroupId=parseInt($('qgColorGroup').value);g.sizeGroupId=parseInt($('qgSizeGroup').value)}
  if(!g.name){toast('请输入商品名称');return}
  db.goods.push(g);
  let wid=parseInt($('qgWh').value);let warnQty=parseInt($('qgWarn').value)||10;
  db.inventory.push({goodsId:id,warehouseId:wid,qty:0,warnQty});
  saveD(db);clsModal();
  if(hasCb&&window._qgCb)window._qgCb(id);
  toast('商品已添加');
}

function qAddSupplier(cb){
  modal('快捷新增供应商',`
    <div class="frow"><div class="fg"><label><span class="req">*</span>名称</label><input id="qsName"></div><div class="fg"><label>联系人</label><input id="qsContact"></div></div>
    <div class="frow"><div class="fg"><label>电话</label><input id="qsTel"></div><div class="fg"><label>地址</label><input id="qsAddr"></div></div>
    <div class="frow"><div class="fg"><label>开户银行</label><input id="qsBank"></div><div class="fg"><label>银行账号</label><input id="qsAcct"></div></div>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveQSupplier(${cb?1:0})">保存</button>`
  );
  window._qsCb=cb;
}
function saveQSupplier(hasCb){
  let db=GD();let id=nid(db,'supplier');let code='GYS'+String(id).padStart(3,'0');
  let s={id,code,name:$('qsName').value,contact:$('qsContact').value,tel:$('qsTel').value,addr:$('qsAddr').value,bank:$('qsBank').value,acct:$('qsAcct').value,note:''};
  if(!s.name){toast('请输入供应商名称');return}
  db.suppliers.push(s);saveD(db);clsModal();
  if(hasCb&&window._qsCb)window._qsCb(id);
  toast('供应商已添加');
}

// ============ 页面路由 ============
function renderPage(page){
  let c=$('pg');c.innerHTML='';
  switch(page){
    case 'dashboard':dash(c);break;
    case 'purchase':purchaseIndex(c);break;
    case 'purchase-order':purchaseOrders(c);break;
    case 'purchase-in':purchaseIn(c);break;
    case 'purchase-return':purchaseReturn(c);break;
    case 'purchase-pay':purchasePay(c);break;
    case 'sales':salesIndex(c);break;
    case 'sales-order':salesOrders(c);break;
    case 'sales-out':salesOut(c);break;
    case 'sales-return':salesReturn(c);break;
    case 'sales-receive':salesReceive(c);break;
    case 'warehouse':whIndex(c);break;
    case 'warehouse-query':whQuery(c);break;
    case 'warehouse-check':whCheck(c);break;
    case 'warehouse-transfer':whTransfer(c);break;
    case 'warehouse-alert':whAlert(c);break;
    case 'warehouse-flow':whFlow(c);break;
    case 'warehouse-completed':whCompleted(c);break;
    case 'finance':finIndex(c);break;
    case 'finance-receivable':receivable(c);break;
    case 'finance-payable':payable(c);break;
    case 'finance-income':income(c);break;
    case 'finance-expense':expense(c);break;
    case 'finance-reconciliation':reconciliation(c);break;
    case 'finance-profit':profit(c);break;
    case 'baseinfo':baseIndex(c);break;
    case 'baseinfo-qr-quick':qrQuickPage(c);break;
    case 'baseinfo-dept':deptPage(c);break;
    case 'baseinfo-goods':goodsPage(c);break;
    case 'baseinfo-supplier':supplierPage(c);break;
    case 'baseinfo-customer':customerPage(c);break;
    case 'baseinfo-warehouse':whPage(c);break;
    case 'baseinfo-staff':staffPage(c);break;
    case 'baseinfo-account':accountPage(c);break;
    case 'baseinfo-unit':unitPage(c);break;
    case 'baseinfo-category':catPage(c);break;
    case 'baseinfo-color':colorPage(c);break;
    case 'baseinfo-size':sizePage(c);break;
    case 'baseinfo-logistics':logisticsPage(c);break;
    case 'baseinfo-member':memberPage(c);break;
    case 'sales-quotation':quotationPage(c);break;
    case 'reports':reportsIndex(c);break;
    case 'reports-purchase-stats':purchStats(c);break;
    case 'reports-sales-stats':salesStats(c);break;
    case 'reports-inventory-stats':invStats(c);break;
    case 'reports-finance-stats':finStats(c);break;
    case 'audit':auditCenter(c);break;
    case 'notifications':notificationsPage(c);break;
    case 'permissions':permSettings(c);break;
    default:c.innerHTML='<div class="empty"><div class="ico">🚧</div><h3>页面开发中</h3></div>';
  }
}

// ==================== 二维码快速出入库（内置生成器） ====================
function qrQuickPage(c){
  var db=GD();
  // 构建下拉选项（每次渲染都从 GD() 取最新数据）
  var whOpts=db.warehouses.map(function(w){return'<option value="'+w.id+'">'+w.name+'</option>'}).join('');
  var supOpts=db.suppliers.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('');
  var custOpts=db.customers.map(function(c){return'<option value="'+c.id+'">'+c.name+'</option>'}).join('');
  var goodsOpts=db.goods.map(function(g){return'<option value="'+g.id+'">'+g.name+' ('+(g.spec||'')+') - #'+g.id+'</option>'}).join('');
  c.innerHTML=qrQuickHTML(whOpts,supOpts,custOpts,goodsOpts);
  // 填充下拉 + 恢复已有二维码
  fillQRSelect('cfgWhId', db.warehouses);
  fillQRSelect('cfgSupId', db.suppliers);
  fillQRSelect('cfgCustId', db.customers);
  fillQRSelect('singleWh', db.warehouses);
  fillQRSelect('singleSup', db.suppliers);
  fillQRSelect('singleCust', db.customers);
  fillQRSelect('singleGoods', db.goods, function(g){return g.name+' ('+(g.spec||'')+') - #'+g.id});
  qrItemsLoad();
  qrImportLoad();
  renderQRList();
  qrImportRenderTable();
  
  if(typeof qrInitDone==='undefined'){
    document.getElementById('cfgAction').addEventListener('change',function(){
      var isIn=document.getElementById('cfgAction').value==='quick-in';
      document.getElementById('cfgSupGroup').style.display=isIn?'':'none';
      document.getElementById('cfgCustGroup').style.display=isIn?'none':'';
      document.getElementById('singleSupGroup').style.display=isIn?'':'none';
      document.getElementById('singleCustGroup').style.display=isIn?'none':'';
    });
    window.qrInitDone=true;
  }
}
// ===== 二维码快速出入库（内置生成器，数据从 GD() 实时读取） =====
var qrItems=[];
var qrImportRows=[];
function qrItemsLoad(){
  try{var saved=localStorage.getItem('wms_qr_items');if(saved)qrItems=JSON.parse(saved)}catch(e){qrItems=[]}
}
function qrItemsSave(){
  try{localStorage.setItem('wms_qr_items',JSON.stringify(qrItems))}catch(e){}
}
function fillQRSelect(id, list, textFn){
  var sel=document.getElementById(id);
  if(!sel)return;
  var prefix=id.indexOf('single')>=0?'继承全局':'不预设';
  sel.innerHTML='<option value="">'+prefix+'</option>';
  list.forEach(function(item){
    var opt=document.createElement('option');
    opt.value=item.id;
    opt.textContent=typeof textFn==='function'?textFn(item):item.name;
    sel.appendChild(opt);
  });
}
function qrGetGName(goodsId){
  var db=GD();var g=db.goods.find(function(x){return x.id===parseInt(goodsId)});
  return g?g.name+' ('+(g.spec||'')+')':'商品#'+goodsId;
}
function qrGetWhName(whId){
  if(!whId)return'-';var db=GD();var w=db.warehouses.find(function(x){return x.id===parseInt(whId)});
  return w?w.name:'仓库#'+whId;
}
function qrGetSupName(supId){
  if(!supId)return'-';var db=GD();var s=db.suppliers.find(function(x){return x.id===parseInt(supId)});
  return s?s.name:'供应商#'+supId;
}
function qrGetCustName(custId){
  if(!custId)return'-';var db=GD();var c=db.customers.find(function(x){return x.id===parseInt(custId)});
  return c?c.name:'客户#'+custId;
}
function qrTodayKey(){var d=new Date();return d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2)}
function qrGetNextCode(){
  var key='qr_code_seq_'+qrTodayKey();var seq=parseInt(localStorage.getItem(key)||'0')||0;seq++;
  localStorage.setItem(key,seq);return'QR-'+qrTodayKey()+'-'+String(seq).padStart(3,'0');
}
// HTML 模板
function qrQuickHTML(whOpts,supOpts,custOpts,goodsOpts){
  return'<div style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:16px;margin-bottom:12px">'+
    '<h2 style="margin-bottom:4px">📦 扫码入库 / 出库 — 二维码生成器</h2>'+
    '<p style="color:#666;font-size:12px;margin-bottom:16px">生成商品专属二维码。手机相机扫码后自动进入手机版并创建入库/出库单。</p>'+
    '<div style="display:flex;gap:20px;margin-bottom:10px;flex-wrap:wrap;align-items:flex-start">'+
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'+
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">📋 类型</label><select id="cfgAction" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="quick-in">采购入库</option><option value="quick-out">销售出库</option></select></div>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'+
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">🏠 仓库</label><select id="cfgWhId" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="">不预设</option>'+whOpts+'</select></div>'+
        '<label style="font-size:11px;color:#666;display:flex;align-items:center;gap:3px"><input type="checkbox" id="cfgWhLock"> 锁定</label>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px" id="cfgSupGroup">'+
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">🏭 供应商</label><select id="cfgSupId" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="">不预设</option>'+supOpts+'</select></div>'+
        '<label style="font-size:11px;color:#666;display:flex;align-items:center;gap:3px"><input type="checkbox" id="cfgSupLock"> 锁定</label>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;display:none" id="cfgCustGroup">'+
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">👤 客户</label><select id="cfgCustId" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="">不预设</option>'+custOpts+'</select></div>'+
        '<label style="font-size:11px;color:#666;display:flex;align-items:center;gap:3px"><input type="checkbox" id="cfgCustLock"> 锁定</label>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'+
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">📦 数量</label><input id="cfgQty" type="number" min="1" value="1" style="width:70px;padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"></div>'+
        '<label style="font-size:11px;color:#666;display:flex;align-items:center;gap:3px"><input type="checkbox" id="cfgQtyLock"> 锁定</label>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:center;gap:4px">'+
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">💰 单价</label><input id="cfgPrice" type="number" step="0.01" value="0" placeholder="留空" style="width:80px;padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"></div>'+
        '<label style="font-size:11px;color:#666;display:flex;align-items:center;gap:3px"><input type="checkbox" id="cfgPriceLock"> 锁定</label>'+
      '</div>'+
    '</div>'+
    '<div style="font-size:14px;font-weight:600;margin:14px 0 8px;padding-bottom:6px;border-bottom:1px solid #e8e8e8">✏️ 逐条定制（覆盖全局配置）</div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">'+
      '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">🔍 商品</label><select id="singleGoods" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px;min-width:150px"><option value="">选择商品…</option>'+goodsOpts+'</select></div>'+
      '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">📦 数量</label><input id="singleQty" type="number" min="1" placeholder="继承全局" style="width:60px;padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"></div>'+
      '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">💰 单价</label><input id="singlePrice" type="number" step="0.01" placeholder="继承全局" style="width:70px;padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"></div>'+
      '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><label style="font-size:13px">🏠 仓库</label><select id="singleWh" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="">继承全局</option>'+whOpts+'</select></div>'+
      '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap" id="singleSupGroup"><label style="font-size:13px">🏭 供应商</label><select id="singleSup" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="">继承全局</option>'+supOpts+'</select></div>'+
      '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;display:none" id="singleCustGroup"><label style="font-size:13px">👤 客户</label><select id="singleCust" style="padding:5px 8px;border:1px solid #e8e8e8;border-radius:5px"><option value="">继承全局</option>'+custOpts+'</select></div>'+
      '<button class="btn btn-o" onclick="qrGenSingle()">➕ 添加</button>'+
    '</div>'+
  '</div>'+
  '<div style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:16px">'+
    '<div style="font-size:14px;font-weight:600;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e8e8e8">📋 已生成的二维码 <span style="font-weight:400;color:#666;font-size:12px" id="qrCount"></span>'+
    ' <button class="btn btn-s btn-xs" onclick="qrPrintAll()" id="btnBatchPrint" style="margin-left:10px;display:none">🖨 批量打印</button>'+
' <button class="btn btn-d btn-xs" onclick="qrClearAll()" id="btnClearAll2" style="margin-left:6px;display:none">🗑 清空</button>'+
' </div>'+
' <div id="qrcodes"><div class="empty-state">👆 使用上方批量生成或逐条定制来创建二维码</div></div>'+
    '<div style="padding:8px 12px;background:#fffbe6;border-radius:6px;font-size:12px;color:#ad6800;margin-top:12px;line-height:1.7">'+
      '💡 <b>使用方法</b>：生成二维码 → 点击🖨打印 → 贴到商品上 → 手机相机扫码 → 自动打开手机版并创建入库/出库单。<br>'+
      '💡 <b>锁定</b>：勾选对应字段旁的「锁定」后，手机端扫码时该字段不可修改。未勾选锁定的字段在手机端可自由编辑。<br>'+
      '💡 <b>一键创建</b>：二维码包含全部必填字段（数量/单价/仓库/供应商/客户）且均锁定时，扫码后自动创建单据，无需手动确认。<br>'+
      '💡 <b>编号规则</b>：每个二维码有独立编号（QR-YYYYMMDD-NNN），同一天内编号递增，次日重新从001开始。<br>'+
      '💡 <b>打印二维码</b>：打印内容与预览完全一致，包含编号、商品名称、数量、单价、仓库、供应商等全部信息。'+
    '</div>'+
  '</div>'+
    // === Excel批量导入区域 ===
    '<div style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:16px;margin-top:12px">'+
      '<div style="font-size:14px;font-weight:600;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e8e8e8">📋 已导入信息</div>'+
      '<p style="color:#666;font-size:12px;margin-bottom:10px">上传Excel文件，自动识别商品并匹配系统数据。导入的行数据会保留在此表中，刷新不丢失。</p>'+
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">'+
        '<label class="btn btn-o" style="cursor:pointer;margin:0">📁 上传Excel<input type="file" id="qrImportFile" accept=".xlsx,.xls,.csv" onchange="(function(){var f=document.getElementById(\'qrImportFile\').files[0];if(f)qrImportHandleFile(f)})()" style="display:none"></label>'+
        '<span style="font-size:12px;color:#666">共 <b id="qrImportCount">0</b> 行<span id="qrImportDupHint" style="display:none">，其中 <b id="qrImportDupCount" style="color:#ff4d4f">0</b> 行重复</span></span>'+
        '<span class="spacer"></span>'+
        '<button class="btn btn-s btn-sm" onclick="qrImportGenAll()" id="btnImportGenAll" disabled>📱 批量生成二维码</button>'+
        '<button class="btn btn-d btn-sm" onclick="qrImportClear()" id="btnImportClear" disabled>🗑 清空</button>'+
      '</div>'+
      '<div id="qrImportTable"><p style="color:#999;text-align:center;padding:20px">👆 上传Excel文件导入数据</p></div>'+
      '<div style="padding:8px 12px;background:#e6f7ff;border-radius:6px;font-size:12px;color:#096dd9;margin-top:12px;line-height:1.7">'+
        '💡 <b>匹配规则</b>：按商品名称/编号自动匹配系统商品，已匹配行可生成二维码。<br>'+
        '💡 <b>未匹配行</b>：可去商品信息新增对应商品后重新上传，未匹配行会自动覆盖更新。'+
      '</div>'+
    '</div>'+
  '</div>';    '</div>'+
  '</div>';
}
// ===== 二维码操作逻辑 =====
function qrGetCfg(){
  return{
    action:document.getElementById('cfgAction').value,
    whId:document.getElementById('cfgWhId').value||'', whLock:document.getElementById('cfgWhLock').checked,
    supId:(document.getElementById('cfgSupGroup').style.display!=='none')?(document.getElementById('cfgSupId').value||''):'',
    supLock:document.getElementById('cfgSupLock').checked,
    custId:(document.getElementById('cfgCustGroup').style.display!=='none')?(document.getElementById('cfgCustId').value||''):'',
    custLock:document.getElementById('cfgCustLock').checked,
    qty:document.getElementById('cfgQty').value||'', qtyLock:document.getElementById('cfgQtyLock').checked,
    price:document.getElementById('cfgPrice').value||'', priceLock:document.getElementById('cfgPriceLock').checked
  };
}
function qrGetDefaultSup(goodsId){
  var db=GD();var g=db.goods.find(function(x){return x.id===parseInt(goodsId)});
  if(g&&g.defaultSupplierId)return g.defaultSupplierId;
  if(db.purchaseIn){
    var piList=db.purchaseIn.filter(function(x){return x.auditStatus==='已审核'}).reverse();
    for(var i=0;i<piList.length;i++){
      if(piList[i].details&&piList[i].details.some(function(d){return d.goodsId===parseInt(goodsId)}))return piList[i].supplierId;
    }
  }
  return'';
}
function qrBuildURL(cfg,goodsId,overrides){
  var base='https://test-project-xgh.pages.dev';
  var act=overrides.action||cfg.action;
  var url=base+'/mobile.html?action='+act+'&goodsId='+goodsId;
  var q=overrides.qty!=null?overrides.qty:cfg.qty;
  var p=overrides.price!=null?overrides.price:cfg.price;
  var w=overrides.whId!=null?overrides.whId:cfg.whId;
  var sup=overrides.supId!=null?overrides.supId:(cfg.supId||qrGetDefaultSup(goodsId));
  var cust=overrides.custId!=null?overrides.custId:cfg.custId;
  var whLock=overrides.whLock!=null?overrides.whLock:cfg.whLock;
  var qtyLock=overrides.qtyLock!=null?overrides.qtyLock:cfg.qtyLock;
  var priceLock=overrides.priceLock!=null?overrides.priceLock:cfg.priceLock;
  var supLock=overrides.supLock!=null?overrides.supLock:cfg.supLock;
  var custLock=overrides.custLock!=null?overrides.custLock:cfg.custLock;
  if(q)url+='&qty='+q+(qtyLock?'&qtyLock=1':'');
  if(p)url+='&price='+p+(priceLock?'&priceLock=1':'');
  if(w)url+='&whId='+w+(whLock?'&whLock=1':'');
  if(sup)url+='&supId='+sup+(supLock?'&supLock=1':'');
  if(cust)url+='&custId='+cust+(custLock?'&custLock=1':'');
  return url;
}
function qrBuildItem(cfg,goodsId,overrides){
  var code=qrGetNextCode();
  var act=overrides.action||cfg.action;
  var q=overrides.qty!=null?overrides.qty:cfg.qty;
  var p=overrides.price!=null?overrides.price:cfg.price;
  var w=overrides.whId!=null?overrides.whId:cfg.whId;
  var sup=overrides.supId!=null?overrides.supId:(cfg.supId||qrGetDefaultSup(goodsId));
  var cust=overrides.custId!=null?overrides.custId:cfg.custId;
  return{
    url:qrBuildURL(cfg,goodsId,overrides),code:code,goodsId:goodsId,goodsName:qrGetGName(goodsId),
    action:act,qty:q||'-',price:p||'-',
    whId:w,whName:qrGetWhName(w),supId:sup,supName:qrGetSupName(sup),
    custId:cust,custName:qrGetCustName(cust),
    whLock:overrides.whLock!=null?overrides.whLock:cfg.whLock,
    qtyLock:overrides.qtyLock!=null?overrides.qtyLock:cfg.qtyLock,
    priceLock:overrides.priceLock!=null?overrides.priceLock:cfg.priceLock,
    supLock:overrides.supLock!=null?overrides.supLock:cfg.supLock,
    custLock:overrides.custLock!=null?overrides.custLock:cfg.custLock
  };
}
function qrAddItem(item){
  if(qrItems.some(function(x){return x.url===item.url}))return;
  qrItems.push(item);qrItemsSave();renderQRList();
}
function qrDelItem(idx){qrItems.splice(idx,1);qrItemsSave();renderQRList();}
function qrClearAll(){
  if(qrItems.length===0){toast('没有可删除的二维码');return}
  confirm('确认删除','确定要删除全部 '+qrItems.length+' 个二维码吗？此操作不可撤销。','qrClearAllConfirm|'+qrItems.length);
}
function _doQrClearAll(){qrItems=[];qrItemsSave();renderQRList();toast('已删除全部二维码');}
function qrGenSingle(){
  var cfg=qrGetCfg();
  var goodsId=document.getElementById('singleGoods').value;
  if(!goodsId){toast('⚠ 请选择商品');return}
  var overrides={};
  var qv=document.getElementById('singleQty').value;if(qv)overrides.qty=qv;
  var pv=document.getElementById('singlePrice').value;if(pv)overrides.price=pv;
  var wv=document.getElementById('singleWh').value;if(wv)overrides.whId=wv;
  var sv=document.getElementById('singleSup').value;if(sv)overrides.supId=sv;
  var cv=document.getElementById('singleCust').value;if(cv)overrides.custId=cv;
  var item=qrBuildItem(cfg,goodsId,overrides);
  if(qrItems.some(function(x){return x.url===item.url})){toast('⚠ 此二维码已存在');return}
  qrAddItem(item);
  document.getElementById('singleQty').value='';
  document.getElementById('singlePrice').value='';
  document.getElementById('singleWh').value='';
  document.getElementById('singleSup').value='';
  document.getElementById('singleCust').value='';
  toast('✅ 已添加');
}
function renderQRList(){
  var container=document.getElementById('qrcodes');
  var countEl=document.getElementById('qrCount');
  if(!container)return;
  var batchBtn=document.getElementById('btnBatchPrint');
  if(qrItems.length===0){
    container.innerHTML='<div class="empty-state">👆 使用上方批量生成或逐条定制来创建二维码</div>';
    if(countEl)countEl.textContent='';
    var clearBtn1=document.getElementById('btnClearAll2');if(clearBtn1)clearBtn1.style.display='none';
    if(batchBtn)batchBtn.style.display='none';
    return;
  }
  if(countEl)countEl.textContent='（共 '+qrItems.length+' 个）';
  if(batchBtn)batchBtn.style.display=qrItems.length>0?'':'none';
  var clearBtn2=document.getElementById('btnClearAll2');if(clearBtn2)clearBtn2.style.display=qrItems.length>0?'':'none';
  var h='';
  qrItems.forEach(function(item,idx){
    var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=png&data='+encodeURIComponent(item.url);
    var actLabel=item.action==='quick-in'?'采购入库':'销售出库';
    var lockLabel=function(v){return v?' 🔒':''};
    h+='<div style="text-align:center;border:1px solid #e8e8e8;padding:10px;border-radius:8px;background:#fafafa;position:relative;width:250px;display:inline-block;vertical-align:top;margin:6px">';
    h+='<div style="position:relative">';
    h+='<img src="'+qrSrc+'" width="180" height="180" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">';
    h+='<span style="display:none;color:#ff4d4f;font-size:12px">❌ 生成失败</span>';
    h+='<button style="position:absolute;top:0;right:0;width:22px;height:22px;border-radius:50%;background:#ff4d4f;color:#fff;border:none;cursor:pointer;font-size:12px;line-height:20px;text-align:center" onclick="qrDelItem('+idx+')" title="删除">✕</button>';
    h+='</div>';
    h+='<div style="font-size:14px;font-weight:700;color:#333;margin:4px 0">'+item.code+'</div>';
    h+='<div style="font-size:13px;font-weight:600;color:#333">'+item.goodsName+'</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;text-align:left;font-size:11px;color:#666;margin-top:4px">';
    h+='<span style="text-align:right">类型:</span><span>'+actLabel+'</span>';
    h+='<span style="text-align:right">数量:</span><span>'+item.qty+lockLabel(item.qtyLock)+'</span>';
    h+='<span style="text-align:right">单价:</span><span>¥'+item.price+lockLabel(item.priceLock)+'</span>';
    h+='<span style="text-align:right">仓库:</span><span>'+item.whName+lockLabel(item.whLock)+'</span>';
    if(item.action==='quick-in'){
      h+='<span style="text-align:right">供应商:</span><span>'+item.supName+lockLabel(item.supLock)+'</span>';
    }else{
      h+='<span style="text-align:right">客户:</span><span>'+item.custName+lockLabel(item.custLock)+'</span>';
    }
    h+='</div>';
    h+='<div style="margin-top:6px;display:flex;gap:4px;justify-content:center">';
    h+='<button class="btn btn-s btn-xs" onclick="qrPrintSingle('+idx+')">🖨 打印</button>';
    h+='</div>';
    h+='</div>';
  });
  container.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:0">'+h+'</div>';
}
function qrPrintSingle(idx){
  var item=qrItems[idx];if(!item)return;
  var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&data='+encodeURIComponent(item.url);
  var actLabel=item.action==='quick-in'?'采购入库':'销售出库';
  var lockLabel=function(v){return v?' 🔒':''};
  var supplierRow=item.action==='quick-in'?
    '<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">供应商</td><td style="padding:5px 10px">'+item.supName+lockLabel(item.supLock)+'</td></tr>':
    '<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">客户</td><td style="padding:5px 10px">'+item.custName+lockLabel(item.custLock)+'</td></tr>';
  var win=window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+item.code+' - '+item.goodsName+'</title></head>');
  win.document.write('<body style="text-align:center;padding:20px;font-family:\'Microsoft YaHei\',sans-serif">');
  win.document.write('<div style="max-width:380px;margin:0 auto;border:2px solid #333;border-radius:10px;padding:20px;text-align:center">');
  win.document.write('<div style="font-size:20px;font-weight:700;margin-bottom:2px">'+item.code+'</div>');
  win.document.write('<div style="font-size:15px;font-weight:600;margin-bottom:10px;color:#333">'+item.goodsName+'</div>');
  win.document.write('<img src="'+qrSrc+'" width="250" height="250">');
  win.document.write('<table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:13px;border:1px solid #ddd">');
  win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600;width:35%">类型</td><td style="padding:5px 10px">'+actLabel+'</td></tr>');
  win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">数量</td><td style="padding:5px 10px">'+item.qty+lockLabel(item.qtyLock)+'</td></tr>');
  win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">单价</td><td style="padding:5px 10px">¥'+item.price+lockLabel(item.priceLock)+'</td></tr>');
  win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">仓库</td><td style="padding:5px 10px">'+item.whName+lockLabel(item.whLock)+'</td></tr>');
  win.document.write(supplierRow);
  win.document.write('</table>');
  win.document.write('<p style="font-size:11px;color:#999;margin-top:8px">手机相机扫描二维码，自动创建入库/出库单</p>');
  win.document.write('</div></body></html>');
  win.document.close();
  setTimeout(function(){win.print()},600);
}
function qrPrintAll(){
  if(qrItems.length===0){toast('没有可打印的二维码');return}
  var h='<div style="max-height:50vh;overflow-y:auto">';
  h+='<table style="width:100%;font-size:12px"><thead><tr><th style="width:40px"><input type="checkbox" id="qrPrintSelectAll" onchange="(function(){var c=this.checked;var cbs=document.querySelectorAll(\'.qr-print-cb\');for(var i=0;i<cbs.length;i++)cbs[i].checked=c})()" checked></th><th>编号</th><th>商品</th><th>类型</th><th>数量</th><th>仓库</th></tr></thead><tbody>';
  qrItems.forEach(function(item,idx){
    var actLabel=item.action==='quick-in'?'采购入库':'销售出库';
    h+='<tr><td><input type="checkbox" class="qr-print-cb" value="'+idx+'" checked></td>';
    h+='<td>'+item.code+'</td><td>'+escHtml(item.goodsName)+'</td><td>'+actLabel+'</td>';
    h+='<td>'+item.qty+'</td><td>'+item.whName+'</td></tr>';
  });
  h+='</tbody></table></div>';
  modal('🖨 批量打印 <span style="font-size:13px;color:#666">（勾选要打印的二维码，每张一页）</span>',h,
    '<button class="btn btn-o" onclick="clsModal()">取消</button>'+
    '<button class="btn btn-p" onclick="qrPrintSelected()">🖨 打印选中</button>');
}

function escHtml(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function qrPrintSelected(){
  var cbs=document.querySelectorAll('.qr-print-cb');var selected=[];
  for(var i=0;i<cbs.length;i++){if(cbs[i].checked)selected.push(parseInt(cbs[i].value))}
  if(selected.length===0){toast('请至少勾选一个二维码');return}
  clsModal();
  if(selected.length===1){qrPrintSingle(selected[0]);return}
  // 多个二维码：单窗口多页打印
  var win=window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>批量打印二维码</title>');
  win.document.write('<style>@media print{@page{margin:10mm;size:auto}.page-break{page-break-after:always}.page-break:last-child{page-break-after:auto}}body{font-family:"Microsoft YaHei",sans-serif;text-align:center}</style></head><body>');
  for(var i=0;i<selected.length;i++){
    var item=qrItems[selected[i]];if(!item)continue;
    var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&data='+encodeURIComponent(item.url);
    var actLabel=item.action==='quick-in'?'采购入库':'销售出库';
    var supplierRow=item.action==='quick-in'?
      '<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">供应商</td><td style="padding:5px 10px">'+item.supName+'</td></tr>':
      '<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">客户</td><td style="padding:5px 10px">'+item.custName+'</td></tr>';
    win.document.write('<div class="page-break" style="max-width:380px;margin:0 auto;border:2px solid #333;border-radius:10px;padding:20px;text-align:center">');
    win.document.write('<div style="font-size:20px;font-weight:700;margin-bottom:2px">'+item.code+'</div>');
    win.document.write('<div style="font-size:15px;font-weight:600;margin-bottom:10px;color:#333">'+item.goodsName+'</div>');
    win.document.write('<img src="'+qrSrc+'" width="250" height="250">');
    win.document.write('<table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:13px;border:1px solid #ddd">');
    win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600;width:35%">类型</td><td style="padding:5px 10px">'+actLabel+'</td></tr>');
    win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">数量</td><td style="padding:5px 10px">'+item.qty+'</td></tr>');
    win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">单价</td><td style="padding:5px 10px">¥'+item.price+'</td></tr>');
    win.document.write('<tr><td style="padding:5px 10px;background:#f5f5f5;font-weight:600">仓库</td><td style="padding:5px 10px">'+item.whName+'</td></tr>');
    win.document.write(supplierRow);
    win.document.write('</table>');
    win.document.write('<p style="font-size:11px;color:#999;margin-top:8px">手机相机扫描二维码，自动创建入库/出库单</p>');
    win.document.write('</div>');
  }
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.print()},600);
}
// 持久化
function qrImportLoad(){try{var s=localStorage.getItem('wms_qr_import');if(s)qrImportRows=JSON.parse(s)}catch(e){qrImportRows=[]}}
function qrImportSave(){try{localStorage.setItem('wms_qr_import',JSON.stringify(qrImportRows))}catch(e){}}
// 按需加载 XLSX 库：首屏不再加载（省 835KB），第一次用 Excel 导入时才拉取
var _xlsxQueue=null;
function loadXLSX(cb){
  if(typeof XLSX!=='undefined'){cb(null);return}
  if(_xlsxQueue){_xlsxQueue.push(cb);return}
  _xlsxQueue=[cb];
  var s=document.createElement('script');
  s.src='xlsx.full.min.js';
  s.onload=function(){var q=_xlsxQueue;_xlsxQueue=null;for(var i=0;i<q.length;i++)q[i](null)};
  s.onerror=function(){var q=_xlsxQueue;_xlsxQueue=null;for(var i=0;i<q.length;i++)q[i](new Error('load failed'))};
  document.head.appendChild(s);
}
function qrImportHandleFile(file){
  if(!file){toast('请选择文件');return}
  if(!file.name.match(/\.(xlsx|xls|csv)$/i)){toast('仅支持 .xlsx / .xls / .csv 格式');return}
  if(typeof XLSX==='undefined') toast('首次使用，正在加载 Excel 解析库…');
  loadXLSX(function(loadErr){
    if(loadErr||typeof XLSX==='undefined'){toast('Excel 解析库加载失败，请检查网络后重试');return}
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var data=new Uint8Array(e.target.result);
        var wb=XLSX.read(data,{type:'array'});
        var sheetName=wb.SheetNames[0];
        if(!sheetName){toast('Excel文件中没有工作表');return}
        var sheet=wb.Sheets[sheetName];
        var rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
        if(!rows||rows.length===0){toast('工作表为空');return}
        qrImportParseRows(rows);
      }catch(err){toast('解析Excel失败: '+err.message);console.error('Excel解析错误:',err)}
    };
    reader.readAsArrayBuffer(file);
  });
}
function qrImportParseRows(rows){
  var headerMap={
    '商品名称':'goodsName','名称':'goodsName','货品名称':'goodsName',
    '商品编号':'goodsCode','编号':'goodsCode','商品编码':'goodsCode',
    '数量':'qty','件数':'qty',
    '单价':'price','价格':'price',
    '仓库':'whName','仓库名称':'whName','仓库名':'whName',
    '供应商':'supName','供应商名称':'supName','供应商名':'supName',
    '客户':'custName','客户名称':'custName','客户名':'custName',
    '类型':'action','出入库类型':'action','业务类型':'action'
  };
  var headerRowIdx=-1,headerIdxMap={};
  for(var i=0;i<Math.min(5,rows.length);i++){
    var row=rows[i];var matchCount=0;var tempMap={};
    for(var c=0;c<row.length;c++){
      var cell=String(row[c]||'').trim();
      for(var key in headerMap){if(cell===key){tempMap[c]=headerMap[key];matchCount++;break}}
    }
    if(matchCount>=2){headerRowIdx=i;headerIdxMap=tempMap;break}
  }
  if(headerRowIdx<0){toast('未识别到有效表头列，请确保Excel包含：商品名称、数量、单价等列');return}
  var db=GD();
  var goodsList=db.goods||[],whList=db.warehouses||[],supList=db.suppliers||[],custList=db.customers||[];
  var newRows=[],dupCount=0;
  for(var r=headerRowIdx+1;r<rows.length;r++){
    var row=rows[r];
    var entry={matched:true,unmatched:[],goodsId:null,goodsName:'',goodsDisplayName:'',
      qty:1,price:0,whId:'',whName:'',whNameOrig:'',supId:'',supName:'',supNameOrig:'',
      custId:'',custName:'',custNameOrig:'',action:'quick-in',idx:0};
    for(var c=0;c<row.length;c++){
      var field=headerIdxMap[c];if(!field)continue;
      var val=String(row[c]||'').trim();if(val==='')continue;
      if(field==='goodsName'||field==='goodsCode'){entry.goodsName=val}
      else if(field==='qty'){var n=parseFloat(val);entry.qty=(!isNaN(n)&&n>0)?n:1}
      else if(field==='price'){var p=parseFloat(val);entry.price=isNaN(p)?0:p}
      else if(field==='whName'){entry.whName=val;entry.whNameOrig=val}
      else if(field==='supName'){entry.supName=val;entry.supNameOrig=val}
      else if(field==='custName'){entry.custName=val;entry.custNameOrig=val}
      else if(field==='action'){var a=val.toLowerCase?val.toLowerCase():'';if(a.indexOf('出库')>=0||a.indexOf('销售')>=0||a.indexOf('out')>=0)entry.action='quick-out';else entry.action='quick-in'}
    }
    if(!entry.goodsName)continue;
    // 商品匹配
    var found=null;var goodsNameLower=entry.goodsName.toLowerCase();
    var byId=goodsList.find(function(g){return String(g.id)===entry.goodsName});
    if(byId){found=byId}
    if(!found){var byName=goodsList.find(function(g){return g.name===entry.goodsName});if(byName){found=byName}}
    if(!found){for(var gIdx=0;gIdx<goodsList.length;gIdx++){var g=goodsList[gIdx];var gn=g.name.toLowerCase();if(gn.indexOf(goodsNameLower)>=0||goodsNameLower.indexOf(gn)>=0){found=g;break}}}
    if(!found){var byCode=goodsList.find(function(g){return g.code&&g.code.toLowerCase().indexOf(goodsNameLower)>=0});if(byCode){found=byCode}}
    if(found){entry.goodsId=found.id;entry.goodsDisplayName=found.name+(found.spec?' ('+found.spec+')':'')}
    else{entry.matched=false;entry.unmatched.push('商品未匹配');entry.goodsDisplayName=entry.goodsName}
    // 仓库匹配
    if(entry.whName){
      var wh=whList.find(function(w){return w.name.indexOf(entry.whName)>=0});
      if(wh){entry.whId=String(wh.id);entry.whName=wh.name}
      else{entry.matched=false;entry.unmatched.push('仓库未匹配("'+entry.whName+'")')}
    }
    // 供应商匹配
    if(entry.supName){
      var sup=supList.find(function(s){return s.name.indexOf(entry.supName)>=0});
      if(sup){entry.supId=String(sup.id);entry.supName=sup.name}
      else{entry.matched=false;entry.unmatched.push('供应商未匹配("'+entry.supName+'")')}
    }
    // 客户匹配
    if(entry.custName){
      var cust=custList.find(function(c){return c.name.indexOf(entry.custName)>=0});
      if(cust){entry.custId=String(cust.id);entry.custName=cust.name}
      else{entry.matched=false;entry.unmatched.push('客户未匹配("'+entry.custName+'")')}
    }
    // 去重：全字段匹配，找到第一条相同行
    var dupIdx=-1;
    for(var di=0;di<qrImportRows.length;di++){
      var ex=qrImportRows[di];
      if(ex.goodsName===entry.goodsName&&ex.qty===entry.qty&&ex.price===entry.price
        &&(ex.whNameOrig||'')===(entry.whNameOrig||'')&&(ex.supNameOrig||'')===(entry.supNameOrig||'')
        &&(ex.custNameOrig||'')===(entry.custNameOrig||'')&&ex.action===entry.action){dupIdx=di;break}
    }
    if(dupIdx>=0){
      // 保留重复行，标记指向第一条相同行
      entry.dupOfIdx=dupIdx;dupCount++;
    }
    newRows.push(entry);
  }
  if(newRows.length===0&&dupCount===0){toast('未解析到有效数据行');return}
  for(var i=0;i<newRows.length;i++){newRows[i].idx=qrImportRows.length;qrImportRows.push(newRows[i])}
  qrImportSave();qrImportRenderTable();
  var msg='成功解析 '+newRows.length+' 行';if(dupCount>0)msg+='，'+dupCount+' 行重复';
  toast(msg);
}
function qrImportRenderTable(){
  var container=document.getElementById('qrImportTable');if(!container)return;
  if(qrImportRows.length===0){container.innerHTML='<p style="color:#999;text-align:center;padding:20px">暂无导入数据</p>';return}
  var countEl=document.getElementById('qrImportCount');if(countEl)countEl.textContent=qrImportRows.length;
  var dupCount=0;qrImportRows.forEach(function(r){if(r.dupOfIdx!==undefined)dupCount++});
  var dupHint=document.getElementById('qrImportDupHint');if(dupHint)dupHint.style.display=dupCount>0?'':'none';
  var dupCountEl=document.getElementById('qrImportDupCount');if(dupCountEl)dupCountEl.textContent=dupCount;
  var h='<div style="overflow-x:auto"><table style="min-width:900px">';
  h+='<thead><tr><th>#</th><th>商品</th><th>匹配结果</th><th>数量</th><th>单价</th><th>仓库</th><th>供应商</th><th>客户</th><th>类型</th><th>操作</th></tr></thead><tbody>';
  qrImportRows.forEach(function(row){
    var matchHtml;
    if(row.matched){
      matchHtml='<span class="tag tag-green">已匹配</span>';
    }else{
      var reasons=row.unmatched.join('；');
      matchHtml='<span class="tag tag-red" title="'+escHtml(reasons)+'">'+escHtml(reasons.length>30?reasons.substring(0,30)+'…':reasons)+'</span>';
    }
    if(row.dupOfIdx!==undefined){
      matchHtml+=' <span class="tag tag-orange" style="font-size:10px">与第'+(row.dupOfIdx+1)+'行重复</span>';
    }
    h+='<tr>';
    h+='<td>'+(row.idx+1)+'</td>';
    h+='<td>'+escHtml(row.goodsDisplayName)+'</td>';
    h+='<td>'+matchHtml+'</td>';
    h+='<td>'+row.qty+'</td>';
    h+='<td>'+(row.price?'¥'+fmt(row.price):'-')+'</td>';
    h+='<td>'+(row.whName||'-')+'</td>';
    h+='<td>'+(row.supName||'-')+'</td>';
    h+='<td>'+(row.custName||'-')+'</td>';
    h+='<td>'+(row.action==='quick-in'?'采购入库':'销售出库')+'</td>';
    h+='<td style="white-space:nowrap">';
    if(row.matched){h+='<button class="btn btn-s btn-xs" onclick="qrImportGenSingle('+row.idx+')">📱 生成</button> '}
    else{h+='<button class="btn btn-xs btn-o" disabled>无法生成</button> '}
    h+='<button class="btn btn-xs btn-o" onclick="qrImportEdit('+row.idx+')" title="编辑">✏️</button> ';
    h+='<button class="btn btn-xs btn-d" onclick="qrImportDel('+row.idx+')" title="删除">✕</button>';
    h+='</td></tr>';
  });
  h+='</tbody></table></div>';
  container.innerHTML=h;
  var genBtn=document.getElementById('btnImportGenAll'),clearBtn=document.getElementById('btnImportClear');
  var hasMatched=qrImportRows.some(function(r){return r.matched});
  if(genBtn){genBtn.disabled=!hasMatched;var genCount=qrImportRows.filter(function(r){return r.matched&&r.dupOfIdx===undefined}).length;genBtn.textContent='📱 批量生成'+(genCount>0?' ('+genCount+')':'')}
  if(clearBtn)clearBtn.disabled=(qrImportRows.length===0);
}
// 编辑行
function qrImportEdit(idx){
  var row=qrImportRows[idx];if(!row)return;
  var db=GD();
  var whOpts=db.warehouses.map(function(w){return'<option value="'+w.id+'"'+(String(w.id)===String(row.whId)?' selected':'')+'>'+w.name+'</option>'}).join('');
  var supOpts=db.suppliers.map(function(s){return'<option value="'+s.id+'"'+(String(s.id)===String(row.supId)?' selected':'')+'>'+s.name+'</option>'}).join('');
  var custOpts=db.customers.map(function(c){return'<option value="'+c.id+'"'+(String(c.id)===String(row.custId)?' selected':'')+'>'+c.name+'</option>'}).join('');
  var body='<div class="frow"><div class="fg"><label>商品名称</label><input value="'+escHtml(row.goodsDisplayName||row.goodsName)+'" readonly style="background:#f5f5f5"></div></div>'+
    '<div class="frow c2"><div class="fg"><label>数量</label><input id="qeQty" type="number" min="1" value="'+row.qty+'"></div><div class="fg"><label>单价</label><input id="qePrice" type="number" step="0.01" value="'+row.price+'"></div></div>'+
    '<div class="frow c2"><div class="fg"><label>仓库</label><select id="qeWh"><option value="">--</option>'+whOpts+'</select></div><div class="fg"><label>供应商</label><select id="qeSup"><option value="">--</option>'+supOpts+'</select></div></div>'+
    '<div class="frow c2"><div class="fg"><label>客户</label><select id="qeCust"><option value="">--</option>'+custOpts+'</select></div><div class="fg"><label>类型</label><select id="qeAction"><option value="quick-in"'+(row.action==='quick-in'?' selected':'')+'>采购入库</option><option value="quick-out"'+(row.action==='quick-out'?' selected':'')+'>销售出库</option></select></div></div>';
  modal('✏️ 编辑导入行',body,'<button class="btn btn-p" onclick="qrImportSaveEdit('+idx+')">💾 保存</button> <button class="btn btn-o" onclick="clsModal()">取消</button>');
}
function qrImportSaveEdit(idx){
  var row=qrImportRows[idx];if(!row)return;
  row.qty=parseFloat(document.getElementById('qeQty').value)||1;
  row.price=parseFloat(document.getElementById('qePrice').value)||0;
  var whVal=document.getElementById('qeWh').value;
  var supVal=document.getElementById('qeSup').value;
  var custVal=document.getElementById('qeCust').value;
  row.action=document.getElementById('qeAction').value;
  var db=GD();
  row.matched=true;row.unmatched=[];
  if(whVal){
    var wh=db.warehouses.find(function(w){return String(w.id)===whVal});
    if(wh){row.whId=whVal;row.whName=wh.name;row.whNameOrig=wh.name}
    else{row.matched=false;row.unmatched.push('仓库未匹配("'+whVal+'")')}
  }else{row.whId='';row.whName='';row.whNameOrig=''}
  if(supVal){
    var sup=db.suppliers.find(function(s){return String(s.id)===supVal});
    if(sup){row.supId=supVal;row.supName=sup.name;row.supNameOrig=sup.name}
    else{row.matched=false;row.unmatched.push('供应商未匹配')}
  }else{row.supId='';row.supName='';row.supNameOrig=''}
  if(custVal){
    var cust=db.customers.find(function(c){return String(c.id)===custVal});
    if(cust){row.custId=custVal;row.custName=cust.name;row.custNameOrig=cust.name}
    else{row.matched=false;row.unmatched.push('客户未匹配')}
  }else{row.custId='';row.custName='';row.custNameOrig=''}
  if(!row.goodsId){row.matched=false;row.unmatched.unshift('商品未匹配')}
  qrImportSave();qrImportRenderTable();clsModal();
  toast('✅ 已保存');
}
// 删除行
function qrImportDel(idx){
  var row=qrImportRows[idx];if(!row)return;
  confirm('确认删除','确定要删除 <b>'+escHtml(row.goodsDisplayName||row.goodsName)+'</b> 这条导入数据吗？','qrImportDelConfirm|'+idx);
}
function qrImportDelConfirm(idx){
  qrImportRows.splice(idx,1);
  for(var i=0;i<qrImportRows.length;i++)qrImportRows[i].idx=i;
  qrImportSave();qrImportRenderTable();
  toast('✅ 已删除');
}
// 生成单个二维码
function qrImportGenSingle(idx){
  var row=qrImportRows[idx];if(!row||!row.matched){toast('该行未匹配，无法生成');return}
  var cfg={
    action:row.action,whId:row.whId||'',whLock:false,
    supId:row.supId||'',supLock:false,custId:row.custId||'',custLock:false,
    qty:row.qty||'',qtyLock:false,price:row.price||'',priceLock:false
  };
  var overrides={};
  if(row.qty)overrides.qty=row.qty;
  if(row.price)overrides.price=row.price;
  if(row.whId)overrides.whId=row.whId;
  if(row.supId)overrides.supId=row.supId;
  if(row.custId)overrides.custId=row.custId;
  var item=qrBuildItem(cfg,row.goodsId,overrides);
  qrAddItem(item);
  toast('✅ 已生成二维码：'+row.goodsDisplayName);
}
// 批量生成
function qrImportGenAll(){
  var matched=qrImportRows.filter(function(r){return r.matched});
  if(matched.length===0){toast('没有可生成的行');return}
  for(var i=0;i<matched.length;i++)qrImportGenSingle(matched[i].idx);
  toast('✅ 已生成 '+matched.length+' 个二维码');
}
// 清空导入数据
function qrImportClear(){
  if(qrImportRows.length===0){toast('没有可清除的数据');return}
  confirm('确认清空','确定要清空全部 '+qrImportRows.length+' 条导入数据吗？','qrImportClearConfirm|'+qrImportRows.length);
}
function qrImportClearConfirm(){
  qrImportRows=[];qrImportSave();qrImportRenderTable();
  var countEl=document.getElementById('qrImportCount');if(countEl)countEl.textContent='0';
  var dupHint=document.getElementById('qrImportDupHint');if(dupHint)dupHint.style.display='none';
  var fileInput=document.getElementById('qrImportFile');if(fileInput)fileInput.value='';
  var genBtn=document.getElementById('btnImportGenAll');if(genBtn){genBtn.disabled=true;genBtn.textContent='📱 批量生成';}
  toast('✅ 已清除导入数据');
}

// ===== 二维码快速出入库页面入口 =====
function qrQuickPage(c){
  var db=GD();
  var whOpts=db.warehouses.map(function(w){return'<option value="'+w.id+'">'+w.name+'</option>'}).join('');
  var supOpts=db.suppliers.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('');
  var custOpts=db.customers.map(function(c){return'<option value="'+c.id+'">'+c.name+'</option>'}).join('');
  var goodsOpts=db.goods.map(function(g){return'<option value="'+g.id+'">'+g.name+' ('+(g.spec||'')+') - #'+g.id+'</option>'}).join('');
  c.innerHTML=qrQuickHTML(whOpts,supOpts,custOpts,goodsOpts);
  fillQRSelect('cfgWhId', db.warehouses);
  fillQRSelect('cfgSupId', db.suppliers);
  fillQRSelect('cfgCustId', db.customers);
  fillQRSelect('singleWh', db.warehouses);
  fillQRSelect('singleSup', db.suppliers);
  fillQRSelect('singleCust', db.customers);
  fillQRSelect('singleGoods', db.goods, function(g){return g.name+' ('+(g.spec||'')+') - #'+g.id});
  qrItemsLoad();
  qrImportLoad();
  renderQRList();
  qrImportRenderTable();
  
  // 类型切换（仅注册一次）
  if(!window._qrInitDone){
    document.getElementById('cfgAction').addEventListener('change',function(){
      var isIn=document.getElementById('cfgAction').value==='quick-in';
      document.getElementById('cfgSupGroup').style.display=isIn?'':'none';
      document.getElementById('cfgCustGroup').style.display=isIn?'none':'';
      document.getElementById('singleSupGroup').style.display=isIn?'':'none';
      document.getElementById('singleCustGroup').style.display=isIn?'none':'';
    });
    // 初始化时触发一次
    document.getElementById('cfgAction').dispatchEvent(new Event('change'));
    window._qrInitDone=true;
  }
  // 每次进入页面重新同步状态
  document.getElementById('cfgAction').dispatchEvent(new Event('change'));
}

// ==================== 仪表盘 ====================
function dash(c){
  let db=GD();
  let totalGoods=db.goods.length;
  let totalStock=db.inventory.reduce((s,i)=>s+(i.qty||0),0);
  let warns=db.inventory.filter(i=>i.qty<=i.warnQty).length;
  let todayIn=(db.purchaseIn||[]).filter(x=>x.date===now()).reduce((s,x)=>s+(x.totalAmt||0),0);
  let todayOut=(db.salesOut||[]).filter(x=>x.date===now()).reduce((s,x)=>s+(x.totalAmt||0),0);
  let receivable=(db.salesOut||[]).reduce((s,x)=>s+(x.totalAmt||0),0)-(db.salesReceipts||[]).reduce((s,x)=>s+(x.amount||0),0);
  let payable=(db.purchaseIn||[]).reduce((s,x)=>s+(x.totalAmt||0),0)-(db.purchasePayments||[]).reduce((s,x)=>s+(x.amount||0),0);
  c.innerHTML=`<div class="tbar"><strong>📊 系统概览</strong><span class="spacer"></span><button class="btn btn-xs btn-d" onclick="confirm('⚠️ 重置所有数据','这将清空所有订单、入库单、出库单、仓库流水、库存批次、通知等业务数据，<br>但保留商品、供应商、客户、仓库、员工等基础配置。<br><br><b style=color:#ff4d4f>此操作不可恢复！</b>','resetData|')">🗑️ 重置所有业务数据</button></div>
    <div class="stats">
    <div class="scard" onclick="nav('baseinfo-goods','商品信息')"><div class="si" style="background:#e6f7ff">📦</div><div class="sinfo"><h4>商品种类</h4><div class="n">${totalGoods}</div><div class="sub">库存总量: ${totalStock} — 点击查看</div></div></div>
    <div class="scard" onclick="nav('warehouse-alert','库存预警')"><div class="si" style="background:#fff7e6">⚠️</div><div class="sinfo"><h4>库存预警</h4><div class="n" style="color:${warns?'#ff4d4f':'#52c41a'}">${warns}</div><div class="sub">${warns?'需及时补货':'库存安全'}</div></div></div>
    <div class="scard"><div class="si" style="background:#f6ffed">📥</div><div class="sinfo"><h4>今日采购额</h4><div class="n">¥${fmt(todayIn)}</div><div class="sub">应付: ¥${fmt(payable)}</div></div></div>
    <div class="scard"><div class="si" style="background:#fff2f0">📤</div><div class="sinfo"><h4>今日销售额</h4><div class="n">¥${fmt(todayOut)}</div><div class="sub">应收: ¥${fmt(receivable)}</div></div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>📋 最近采购入库</strong><span class="spacer"></span><button class="btn btn-xs btn-p" onclick="nav('purchase-in','采购入库')">全部</button></div>
    <table class="edt-tbl"><thead><tr><th>单号</th><th>供应商</th><th>仓库</th><th>金额</th><th>日期</th></tr></thead>
    <tbody>${(db.purchaseIn||[]).slice(-5).reverse().map(x=>`<tr><td>${x.code}</td><td>${gSName(x.supplierId)}</td><td>${gWName(x.warehouseId)}</td><td>¥${fmt(x.totalAmt)}</td><td>${fd(x.date)}</td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#ccc">暂无记录</td></tr>'}</tbody></table></div>
    <div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>📋 最近销售出库</strong><span class="spacer"></span><button class="btn btn-xs btn-p" onclick="nav('sales-out','销售出库')">全部</button></div>
    <table class="edt-tbl"><thead><tr><th>单号</th><th>客户</th><th>金额</th><th>日期</th><th>状态</th></tr></thead>
    <tbody>${(db.salesOut||[]).slice(-5).reverse().map(x=>`<tr><td>${x.code}</td><td>${gCName(x.customerId)}</td><td>¥${fmt(x.totalAmt)}</td><td>${fd(x.date)}</td><td><span class="tag ${x.status==='已收款'?'tag-green':'tag-orange'}">${x.status||'未收款'}</span></td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#ccc">暂无记录</td></tr>'}</tbody></table></div>
  </div>`;
}

// ==================== 商品信息 ====================
function goodsPage(c){
  let db=GD();let kw=(window._gKw||'').toLowerCase();let ind=window._gInd||'';
  let list=db.goods.filter(g=>!kw||g.name.toLowerCase().includes(kw)||g.code.toLowerCase().includes(kw)||(g.barcode||'').includes(kw)).filter(g=>!ind||g.industryType===ind);
  c.innerHTML=`<div class="tbar"><strong>商品信息</strong> (<span id="gCount">${list.length}</span>件)
    <input placeholder="搜索名称/编号/条码..." id="goodsSearchInput" value="${window._gKw||''}" onkeydown="if(event.key==='Enter'){window._gKw=this.value;nav('baseinfo-goods','商品信息')}">
    <button class="btn btn-o btn-sm" onclick="var i=document.getElementById('goodsSearchInput');window._gKw=i?i.value:'';nav('baseinfo-goods','商品信息')">🔍 搜索</button>
    <select id="gFilterInd" onchange="window._gInd=this.value;nav('baseinfo-goods','商品信息')"><option value="">全部行业</option>${Object.entries(INDUSTRIES).map(([k,v])=>`<option value="${k}" ${ind==k?'selected':''}>${v.icon} ${v.name}</option>`).join('')}</select>
    <span class="spacer"></span>${hasPerm('baseinfo-goods')?`<button class="btn btn-p" onclick="addGoods()">+ 新增商品</button>`:''}</div>
    ${rTable(['编号','名称','行业','规格/型号','单位','类别','条码','成本价','零售价','库存(仓)','状态','备注','操作'],
      list.map(g=>{
        let invs=db.inventory.filter(i=>i.goodsId===g.id);let stockStr=invs.map(i=>`${gWName(i.warehouseId)}:${i.qty||0}`).join(', ')||'无库存';
        let indInfo=INDUSTRIES[g.industryType]||INDUSTRIES.general;
        return [g.code,`<b>${g.name}</b>`,`<span class="tag tag-gray">${indInfo.icon} ${indInfo.name}</span>`,
          `${g.spec||'-'} / ${g.model||'-'}`,g.unit||'-',g.category||'-',g.barcode||'-',
          '¥'+fmt(g.costPrice),'¥'+fmt(g.retailPrice),stockStr,
          g.status==='正常'?'<span class="tag tag-green">正常</span>':'<span class="tag tag-red">停用</span>',
          noteHtml(g),
          `${hasPerm('baseinfo-goods')?`<button class="btn btn-xs btn-o" onclick="editGoods(${g.id})">编辑</button> <button class="btn btn-xs btn-d" onclick="delGoods(${g.id})">删除</button>`:`<button class="btn btn-xs btn-o" onclick="editGoods(${g.id})">查看</button>`}`];
      }),13)
    }`;
}
function addGoods(){
  let db=GD();let indOptions=Object.entries(INDUSTRIES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.name}</option>`).join('');
  modal('新增商品',`<div class="frow"><div class="fg"><label><span class="req">*</span>行业类型</label><select id="gInd" onchange="gToggleFields()">${indOptions}</select></div><div class="fg"><label><span class="req">*</span>商品名称</label><input id="gName"></div></div>
    <div class="frow"><div class="fg"><label>规格</label><input id="gSpec"></div><div class="fg"><label>型号</label><input id="gModel"></div></div>
    <div class="frow c3"><div class="fg"><label>单位</label><select id="gUnit">${db.units.map(u=>`<option value="${u.name}">${u.name}</option>`).join('')}</select></div><div class="fg"><label>类别</label><select id="gCat">${db.categories.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}</select></div><div class="fg"><label>条码</label><input id="gBarcode"></div></div>
    <div class="frow c3"><div class="fg"><label>采购价</label><input id="gPP" type="number" step="0.01" value="0"></div><div class="fg"><label>成本价</label><input id="gCP" type="number" step="0.01" value="0"></div><div class="fg"><label>零售价</label><input id="gRP" type="number" step="0.01" value="0"></div></div>
    <div class="frow"><div class="fg"><label>默认仓库</label><select id="gWhId">${db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}</select></div><div class="fg"><label>预警线</label><input id="gWarn" type="number" value="10"></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="gNote"></div></div><div id="gExtra"></div>
    <div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传商品照片</strong><br><input type="file" id="gPhoto" accept="image/*" style="margin-top:8px"></div>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveGoods()">保存</button>`);gToggleFields();
}
function gToggleFields(){
  let it=$('gInd').value,fi=INDUSTRIES[it].fields,h='';
  if(fi.includes('batchNo'))h+=`<div class="frow"><div class="fg"><label>批次批号</label><input id="gBatchNo"></div><div class="fg"><label>生产日期</label><input id="gProdDate" type="date"></div></div><div class="frow"><div class="fg"><label>有效期至</label><input id="gExpiryDate" type="date"></div><div class="fg"><label>保质期(天)</label><input id="gShelfLife" type="number"></div></div>`;
  if(fi.includes('serialNo'))h+=`<div class="frow"><div class="fg"><label>支持序列号</label><select id="gSerial"><option value="0">否</option><option value="1">是</option></select></div></div>`;
  if(fi.includes('material'))h+=`<div class="frow"><div class="fg"><label>材质</label><input id="gMaterial"></div><div class="fg"><label>产地</label><input id="gOrigin"></div></div><div class="frow"><div class="fg"><label>理论重量</label><input id="gWeight"></div><div class="fg"><label>长度</label><input id="gLength"></div></div>`;
  if(fi.includes('colorGroupId')){let db=GD();h+=`<div class="frow"><div class="fg"><label>颜色组</label><select id="gColorGroup">${db.colorGroups.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div><div class="fg"><label>尺码组</label><select id="gSizeGroup">${db.sizeGroups.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div></div>`;}
  $('gExtra').innerHTML=h;
}
function saveGoods(){
  if(!hasPerm("baseinfo-goods")){toast("无此页面操作权限");return}
  let db=GD(),it=$('gInd').value,fi=INDUSTRIES[it].fields;
  let id=nid(db,'goods'),code='SP'+String(id).padStart(3,'0');
  let g={id,code,industryType:it,status:'正常',name:$('gName').value,spec:$('gSpec').value||'',model:$('gModel').value||'',unit:$('gUnit').value,category:$('gCat').value,barcode:$('gBarcode').value||'',purchPrice:parseFloat($('gPP').value)||0,costPrice:parseFloat($('gCP').value)||0,retailPrice:parseFloat($('gRP').value)||0,note:$('gNote').value||''};
  if(fi.includes('batchNo')){g.batchNo=$('gBatchNo').value;g.prodDate=$('gProdDate').value;g.expiryDate=$('gExpiryDate').value;g.shelfLife=parseInt($('gShelfLife').value)||0}
  if(fi.includes('serialNo'))g.hasSerial=$('gSerial').value==='1';
  if(fi.includes('material')){g.material=$('gMaterial').value;g.origin=$('gOrigin').value;g.weight=$('gWeight').value;g.length=$('gLength').value}
  if(fi.includes('colorGroupId')){g.colorGroupId=parseInt($('gColorGroup').value);g.sizeGroupId=parseInt($('gSizeGroup').value)}
  if(!g.name){toast('请输入商品名称');return}
  // 上传商品照片
  var photoFile=document.getElementById('gPhoto');if(photoFile&&photoFile.files&&photoFile.files[0]){g.photo=URL.createObjectURL(photoFile.files[0]);g.photoName=photoFile.files[0].name}
  db.goods.push(g);let wid=parseInt($('gWhId').value),warnQty=parseInt($('gWarn').value)||10;
  db.inventory.push({goodsId:id,warehouseId:wid,qty:0,warnQty});
  saveD(db);clsModal();nav('baseinfo-goods','商品信息');toast('商品已创建');
}
function editGoods(id){
  let db=GD(),g=db.goods.find(x=>x.id==id);if(!g)return;
  let indOptions=Object.entries(INDUSTRIES).map(([k,v])=>`<option value="${k}" ${g.industryType==k?'selected':''}>${v.icon} ${v.name}</option>`).join('');
  modal('编辑商品',`<div class="frow"><div class="fg"><label>行业类型</label><select id="egInd" onchange="egToggleFields(${id})">${indOptions}</select></div><div class="fg"><label><span class="req">*</span>名称</label><input id="egName" value="${g.name}"></div></div>
    <div class="frow"><div class="fg"><label>规格</label><input id="egSpec" value="${g.spec||''}"></div><div class="fg"><label>型号</label><input id="egModel" value="${g.model||''}"></div></div>
    <div class="frow c3"><div class="fg"><label>单位</label><select id="egUnit">${db.units.map(u=>`<option value="${u.name}" ${g.unit==u.name?'selected':''}>${u.name}</option>`).join('')}</select></div><div class="fg"><label>类别</label><select id="egCat">${db.categories.map(c=>`<option value="${c.name}" ${g.category==c.name?'selected':''}>${c.name}</option>`).join('')}</select></div><div class="fg"><label>条码</label><input id="egBarcode" value="${g.barcode||''}"></div></div>
    <div class="frow c3"><div class="fg"><label>采购价</label><input id="egPP" type="number" step="0.01" value="${g.purchPrice||0}"></div><div class="fg"><label>成本价</label><input id="egCP" type="number" step="0.01" value="${g.costPrice||0}"></div><div class="fg"><label>零售价</label><input id="egRP" type="number" step="0.01" value="${g.retailPrice||0}"></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="egNote" value="${g.note||''}"></div></div><div id="egExtra"></div>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateGoods(${id})">更新</button>`);egToggleFields(id);
}
function egToggleFields(id){
  let db=GD(),g=db.goods.find(x=>x.id==id),it=$('egInd')?$('egInd').value:g.industryType,fi=INDUSTRIES[it].fields,h='';
  if(fi.includes('batchNo'))h+=`<div class="frow"><div class="fg"><label>批次批号</label><input id="egBatchNo" value="${g.batchNo||''}"></div><div class="fg"><label>生产日期</label><input id="egProdDate" type="date" value="${g.prodDate||''}"></div></div><div class="frow"><div class="fg"><label>有效期至</label><input id="egExpiryDate" type="date" value="${g.expiryDate||''}"></div><div class="fg"><label>保质期(天)</label><input id="egShelfLife" type="number" value="${g.shelfLife||''}"></div></div>`;
  if(fi.includes('serialNo'))h+=`<div class="frow"><div class="fg"><label>支持序列号</label><select id="egSerial"><option value="0" ${!g.hasSerial?'selected':''}>否</option><option value="1" ${g.hasSerial?'selected':''}>是</option></select></div></div>`;
  if(fi.includes('material'))h+=`<div class="frow"><div class="fg"><label>材质</label><input id="egMaterial" value="${g.material||''}"></div><div class="fg"><label>产地</label><input id="egOrigin" value="${g.origin||''}"></div></div><div class="frow"><div class="fg"><label>重量</label><input id="egWeight" value="${g.weight||''}"></div><div class="fg"><label>长度</label><input id="egLength" value="${g.length||''}"></div></div>`;
  if(fi.includes('colorGroupId'))h+=`<div class="frow"><div class="fg"><label>颜色组</label><select id="egColorGroup">${db.colorGroups.map(c=>`<option value="${c.id}" ${g.colorGroupId==c.id?'selected':''}>${c.name}</option>`).join('')}</select></div><div class="fg"><label>尺码组</label><select id="egSizeGroup">${db.sizeGroups.map(s=>`<option value="${s.id}" ${g.sizeGroupId==s.id?'selected':''}>${s.name}</option>`).join('')}</select></div></div>`;
  $('egExtra').innerHTML=h;
}
function updateGoods(id){
  let db=GD(),g=db.goods.find(x=>x.id==id);if(!g)return;let it=$('egInd').value,fi=INDUSTRIES[it].fields;
  g.industryType=it;g.name=$('egName').value;g.spec=$('egSpec').value;g.model=$('egModel').value;g.unit=$('egUnit').value;g.category=$('egCat').value;g.barcode=$('egBarcode').value;g.purchPrice=parseFloat($('egPP').value)||0;g.costPrice=parseFloat($('egCP').value)||0;g.retailPrice=parseFloat($('egRP').value)||0;addNote(g,$('egNote').value);
  if(fi.includes('batchNo')){g.batchNo=$('egBatchNo').value;g.prodDate=$('egProdDate').value;g.expiryDate=$('egExpiryDate').value;g.shelfLife=parseInt($('egShelfLife').value)||0}
  if(fi.includes('serialNo'))g.hasSerial=$('egSerial').value==='1';
  if(fi.includes('material')){g.material=$('egMaterial').value;g.origin=$('egOrigin').value;g.weight=$('egWeight').value;g.length=$('egLength').value}
  if(fi.includes('colorGroupId')){g.colorGroupId=parseInt($('egColorGroup').value);g.sizeGroupId=parseInt($('egSizeGroup').value)}
  saveD(db);clsModal();nav('baseinfo-goods','商品信息');toast('已更新');
}
function delGoods(id){confirm('确认删除','删除此商品将同时删除关联库存，确定？','delGoods|'+id);}

// ==================== 供应商/客户/仓库/员工/科目/单位/类别/颜色/尺码 ====================
function supplierPage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>供应商信息</strong> (<span>${db.suppliers.length}</span>) <input placeholder="搜索名称/联系人..." id="supSearch" onkeydown="if(event.key==='Enter'){supplierPage(document.getElementById('pg'))}"><button class="btn btn-o btn-sm" onclick="supplierPage(document.getElementById('pg'))">🔍 搜索</button><span class="spacer"></span>${hasPerm('baseinfo-supplier')?`<button class="btn btn-p" onclick="addSupplier()">+ 新增供应商</button>`:''}</div>${rTable(['编号','名称','联系人','电话','地址','银行','账号','备注','操作'],(function(){var kw=(document.getElementById('supSearch')||{}).value||'';return kw?db.suppliers.filter(function(s){return s.name.indexOf(kw)>=0||(s.contact||'').indexOf(kw)>=0||s.code.indexOf(kw)>=0}):db.suppliers})().map(s=>[s.code,s.name,s.contact||'-',s.tel||'-',s.addr||'-',s.bank||'-',s.acct||'-',noteHtml(s),`${hasPerm('baseinfo-supplier')?`<button class="btn btn-xs btn-o" onclick="editSupplier(${s.id})">编辑</button> <button class="btn btn-xs btn-d" onclick="delSup(${s.id})">删除</button>`:`<button class="btn btn-xs btn-o" onclick="editSupplier(${s.id})">查看</button>`}`]),9)}`;}
function addSupplier(){modal('新增供应商',`<div class="frow"><div class="fg"><label><span class="req">*</span>名称</label><input id="sName"></div><div class="fg"><label>联系人</label><input id="sContact"></div></div><div class="frow"><div class="fg"><label>电话</label><input id="sTel"></div><div class="fg"><label>地址</label><input id="sAddr"></div></div><div class="frow"><div class="fg"><label>开户银行</label><input id="sBank"></div><div class="fg"><label>银行账号</label><input id="sAcct"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="sNote"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveSupplier()">保存</button>`);}
function saveSupplier(){
  if(!hasPerm("baseinfo-supplier")){toast("无此页面操作权限");return}let db=GD(),id=nid(db,'supplier'),code='GYS'+String(id).padStart(3,'0'),s={id,code,name:$('sName').value,contact:$('sContact').value,tel:$('sTel').value,addr:$('sAddr').value,bank:$('sBank').value,acct:$('sAcct').value,note:$('sNote').value||''};if(!s.name){toast('请输入名称');return}db.suppliers.push(s);saveD(db);clsModal();nav('baseinfo-supplier','供应商信息');toast('已添加');}
function editSupplier(id){let db=GD(),s=db.suppliers.find(x=>x.id==id);if(!s)return;modal('编辑供应商',`<div class="frow"><div class="fg"><label>名称</label><input id="esName" value="${s.name}"></div><div class="fg"><label>联系人</label><input id="esContact" value="${s.contact||''}"></div></div><div class="frow"><div class="fg"><label>电话</label><input id="esTel" value="${s.tel||''}"></div><div class="fg"><label>地址</label><input id="esAddr" value="${s.addr||''}"></div></div><div class="frow"><div class="fg"><label>开户银行</label><input id="esBank" value="${s.bank||''}"></div><div class="fg"><label>银行账号</label><input id="esAcct" value="${s.acct||''}"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="esNote" value="${s.note||''}"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateSupplier(${id})">更新</button>`);}
function updateSupplier(id){let db=GD(),s=db.suppliers.find(x=>x.id==id);if(!s)return;s.name=$('esName').value;s.contact=$('esContact').value;s.tel=$('esTel').value;s.addr=$('esAddr').value;s.bank=$('esBank').value;s.acct=$('esAcct').value;addNote(s,$('esNote').value);saveD(db);clsModal();nav('baseinfo-supplier','供应商信息');toast('已更新');}
function delSup(id){confirm('确认删除','确定删除？','delSup|'+id);}

function customerPage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>客户信息</strong> (<span>${db.customers.length}</span>) <input placeholder="搜索名称/联系人..." id="custSearch" onkeydown="if(event.key==='Enter'){customerPage(document.getElementById('pg'))}"><button class="btn btn-o btn-sm" onclick="customerPage(document.getElementById('pg'))">🔍 搜索</button><span class="spacer"></span>${hasPerm('baseinfo-customer')?`<button class="btn btn-p" onclick="addCustomer()">+ 新增客户</button>`:''}</div>${rTable(['编号','名称','联系人','电话','地址','信用额度','备注','操作'],(function(){var kw=(document.getElementById('custSearch')||{}).value||'';return kw?db.customers.filter(function(s){return s.name.indexOf(kw)>=0||(s.contact||'').indexOf(kw)>=0||s.code.indexOf(kw)>=0}):db.customers})().map(cu=>[cu.code,cu.name,cu.contact||'-',cu.tel||'-',cu.addr||'-','¥'+fmt(cu.credit||0),noteHtml(cu),`${hasPerm('baseinfo-customer')?`<button class="btn btn-xs btn-o" onclick="editCustomer(${cu.id})">编辑</button> <button class="btn btn-xs btn-d" onclick="delCust(${cu.id})">删除</button>`:`<button class="btn btn-xs btn-o" onclick="editCustomer(${cu.id})">查看</button>`}`]),8)}`;}
function addCustomer(){modal('新增客户',`<div class="frow"><div class="fg"><label><span class="req">*</span>名称</label><input id="cuName"></div><div class="fg"><label>联系人</label><input id="cuContact"></div></div><div class="frow"><div class="fg"><label>电话</label><input id="cuTel"></div><div class="fg"><label>地址</label><input id="cuAddr"></div></div><div class="frow"><div class="fg"><label>信用额度</label><input id="cuCredit" type="number" value="0"></div><div class="fg"><label>备注</label><input id="cuNote"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveCustomer()">保存</button>`);}
function saveCustomer(){
  if(!hasPerm("baseinfo-customer")){toast("无此页面操作权限");return}let db=GD(),id=nid(db,'customer');db.customers.push({id,code:'KH'+String(id).padStart(3,'0'),name:$('cuName').value,contact:$('cuContact').value,tel:$('cuTel').value,addr:$('cuAddr').value,credit:parseFloat($('cuCredit').value)||0,note:$('cuNote').value||''});saveD(db);clsModal();nav('baseinfo-customer','客户信息');toast('已添加');}
function editCustomer(id){let db=GD(),cu=db.customers.find(x=>x.id==id);if(!cu)return;modal('编辑客户',`<div class="frow"><div class="fg"><label>名称</label><input id="ecuName" value="${cu.name}"></div><div class="fg"><label>联系人</label><input id="ecuContact" value="${cu.contact||''}"></div></div><div class="frow"><div class="fg"><label>电话</label><input id="ecuTel" value="${cu.tel||''}"></div><div class="fg"><label>地址</label><input id="ecuAddr" value="${cu.addr||''}"></div></div><div class="frow"><div class="fg"><label>信用额度</label><input id="ecuCredit" type="number" value="${cu.credit||0}"></div><div class="fg"><label>备注</label><input id="ecuNote" value="${cu.note||''}"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateCustomer(${id})">更新</button>`);}
function updateCustomer(id){let db=GD(),cu=db.customers.find(x=>x.id==id);if(!cu)return;cu.name=$('ecuName').value;cu.contact=$('ecuContact').value;cu.tel=$('ecuTel').value;cu.addr=$('ecuAddr').value;cu.credit=parseFloat($('ecuCredit').value)||0;addNote(cu,$('ecuNote').value);saveD(db);clsModal();nav('baseinfo-customer','客户信息');toast('已更新');}
function delCust(id){confirm('确认删除','确定删除？','delCust|'+id);}

function whPage(c){let db=GD();var kw=(document.getElementById('whSearch')||{}).value||'';var list=db.warehouses;if(kw){kw=kw.toLowerCase();list=list.filter(function(w){return w.name.toLowerCase().indexOf(kw)>=0||w.code.toLowerCase().indexOf(kw)>=0||(w.mgr||'').indexOf(kw)>=0})}c.innerHTML=`<div class="tbar"><strong>仓库信息</strong> (<span>${list.length}</span>) <input placeholder="搜索名称/负责人/编号..." id="whSearch" onkeydown="if(event.key==='Enter'){var i=document.getElementById('whSearch');kw=i?i.value:'';nav('baseinfo-warehouse','仓库信息')}"><button class="btn btn-o btn-sm" onclick="var i=document.getElementById('whSearch');kw=i?i.value:'';nav('baseinfo-warehouse','仓库信息')">🔍 搜索</button><span class="spacer"></span>${hasPerm('baseinfo-warehouse')?`<button class="btn btn-p" onclick="addWh()">+ 新增仓库</button>`:''}</div>${rTable(['编号','名称','地址','负责人','电话','操作'],list.map(w=>[w.code,w.name,w.addr||'-',w.mgr||'-',w.tel||'-',`${hasPerm('baseinfo-warehouse')?`<button class="btn btn-xs btn-d" onclick="delWh(${w.id})">删除</button>`:''}`]),6)}`;}
function addWh(){modal('新增仓库',`<div class="frow"><div class="fg"><label><span class="req">*</span>名称</label><input id="wName"></div><div class="fg"><label>负责人</label><input id="wMgr"></div></div><div class="frow"><div class="fg"><label>电话</label><input id="wTel"></div><div class="fg"><label>地址</label><input id="wAddr"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveWh()">保存</button>`);}
function saveWh(){let db=GD(),id=nid(db,'warehouse');db.warehouses.push({id,code:'CK'+String(id).padStart(3,'0'),name:$('wName').value,mgr:$('wMgr').value,tel:$('wTel').value,addr:$('wAddr').value});saveD(db);clsModal();nav('baseinfo-warehouse','仓库信息');toast('已添加');}
function delWh(id){confirm('确认删除','确定删除？','delWh|'+id);}

// 获取部门下拉选项（从 db.depts 读取）
function getDeptSelectOptions(selected){
  var db=GD();if(!db.depts)db.depts=[];
  return db.depts.map(function(d){
    return'<option value="'+d.id+'"'+(selected===d.id||selected===d.name?' selected':'')+'>'+d.name+'</option>';
  }).join('');
}
// 根据部门名称查找部门ID
function getDeptIdByName(name){
  var db=GD();if(!db.depts)db.depts=[];
  var d=db.depts.find(function(x){return x.name===name});return d?d.id:null;
}

// ===== 部门信息页面 =====
function deptPage(c){
  var db=GD();if(!db.depts)db.depts=[];
  var isSup=isSupervisor();
  // 搜索过滤
  var kw=(document.getElementById('deptSearch')||{}).value||'';
  var list=db.depts.slice();if(kw){kw=kw.toLowerCase();list=list.filter(function(d){return d.name.toLowerCase().indexOf(kw)>=0||d.code.toLowerCase().indexOf(kw)>=0})}
  var subPages=getAllSubPages();
  var cols=['编号','名称','备注','操作'];
  var rows=list.sort(function(a,b){return(a.name||'').localeCompare(b.name||'','zh')}).map(function(d){
    var note=noteHtml(d);
    var btns='';
    if(isSup&&hasPerm("baseinfo-dept"))btns+='<button class="btn btn-xs btn-o" onclick="editDept('+d.id+')">编辑</button> ';
    if(isSup&&hasPerm("baseinfo-dept"))btns+='<button class="btn btn-xs btn-d" onclick="delDept('+d.id+')">删除</button> ';
    return[d.code,d.name,note,btns];
  });
  var addBtn=isSup?'<button class="btn btn-p" onclick="addDeptPage()">+ 新增部门</button>':'';
  c.innerHTML='<div class="tbar"><strong>部门信息</strong> <input placeholder="搜索部门名称/编号..." id="deptSearch" onkeydown="if(event.key===\'Enter\'){deptPage(document.getElementById(\'pg\'))}"><button class="btn btn-o btn-sm" onclick="deptPage(document.getElementById(\'pg\'))">🔍 搜索</button><span class="spacer"></span>'+addBtn+'</div>'
    +rTable(cols,rows,4);
}

// 获取侧边栏所有叶子页面（子栏目）
function getAllSubPages(){
  var pages=[];
  NAV.forEach(function(item){
    if(item.sub){
      item.sub.forEach(function(s){pages.push({page:s.page,label:s.label,group:item.label});});
    }
  });
  return pages;
}

// 新增部门弹窗
function addDeptPage(){
  var db=GD();if(!db.depts)db.depts=[];
  var code='BM'+String(nid(db,'dept')+1).padStart(3,'0');
  modal('新增部门',
    '<div class="frow"><div class="fg"><label>编号</label><input id="dCode" value="'+code+'"></div>'+
    '<div class="fg"><label><span class="req">*</span>部门名称</label><input id="dName"></div></div>'+
    '<div class="frow c1"><div class="fg"><label>备注</label><input id="dNote"></div></div>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveDept2()">保存</button>');
}

function saveDept2(){
  if(!hasPerm("baseinfo-dept")){toast("无此页面操作权限");return}
  var db=GD();if(!db.depts)db.depts=[];
  var name=$('dName').value.trim();
  if(!name){toast('请输入部门名称');return}
  var exists=db.depts.some(function(d){return d.name===name});
  if(exists){toast('该部门已存在');return}
  var id=nid(db,'dept');
  db.depts.push({id:id,code:$('dCode').value,name:name,note:$('dNote').value||'',perms:[],auditPerms:[]});
  saveD(db);clsModal();nav('baseinfo-dept','部门信息');toast('部门已创建');
}

// 编辑部门
function editDept(id){
  var db=GD(),d=db.depts.find(function(x){return x.id===id});if(!d)return;
  if(!d.perms)d.perms=[];if(!d.auditPerms)d.auditPerms=[];
  var subPages=getAllSubPages();
  var permH='<div style="max-height:300px;overflow-y:auto;margin-top:8px;padding-top:8px;border-top:2px solid #91d5ff"><div style="font-weight:600;color:var(--tx);margin-bottom:6px">📋 业务权限（页面访问控制）</div>';
  var currentGroup='',groupPages=[];
  subPages.forEach(function(sp){
    if(sp.group!==currentGroup){
      if(currentGroup){permH+='</div>';}
      groupPages=[];
      currentGroup=sp.group;
      var groupPagesAll=[];
      subPages.forEach(function(x){if(x.group===currentGroup)groupPagesAll.push(x.page)});
      var isAllChecked=groupPagesAll.every(function(p){return d.perms.indexOf(p)>=0});
      permH+='<div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;font-weight:600;color:var(--tx)">'+
        '<label style="cursor:pointer;font-size:12px;display:flex;align-items:center;gap:3px">'+
        '<input type="checkbox" '+(isAllChecked?'checked':'')+' onchange="toggleDeptGroup('+id+',\''+currentGroup+'\',this.checked)" style="transform:scale(1.1)">'+
        '📁 <b>'+sp.group+'</b></label></div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px;padding-left:8px">';
    }
    groupPages.push(sp.page);
    var checked=d.perms.indexOf(sp.page)>=0?' checked':'';
    permH+='<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid #e8e8e8;border-radius:4px;background:'+(checked?'#e6f7ff':'#fff')+'">'+
      '<input type="checkbox" value="'+sp.page+'"'+checked+' onchange="toggleDeptPerm('+id+',this)">'+sp.label+'</label>';
  });
  if(currentGroup){permH+='</div>';}
  permH+='</div>';
  permH+='<div style="margin-top:12px;padding-top:8px;border-top:2px solid #ffd591"><div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔍 审核权限（该部门审核员可审核的流程类型）</div><div style="display:flex;flex-wrap:wrap;gap:6px" id="deptAuditPerms_'+id+'">'+
    Object.keys(AUDITABLE).map(function(t){var ck=d.auditPerms.indexOf(t)>=0?' checked':'';return'<label style="font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid #e8e8e8;border-radius:4px;background:'+(ck?'#fff7e6':'#fff')+'"><input type="checkbox" value="'+t+'"'+ck+' onchange="toggleDeptAuditPerm('+id+',this)">'+AUDITABLE[t].label+'</label>'}).join('')+
  '</div><span style="font-size:10px;color:#999">勾选后方可审核对应流程</span></div>';
  modal('编辑部门 — '+d.name,
    '<div class="frow"><div class="fg"><label>编号</label><input id="edCode" value="'+(d.code||'')+'"></div>'+
    '<div class="fg"><label><span class="req">*</span>部门名称</label><input id="edName" value="'+d.name+'"></div></div>'+
    '<div class="frow c1"><div class="fg"><label>备注</label><input id="edNote" value="'+(d.note||'')+'"></div></div>'+
    permH,
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateDept('+id+')">更新</button>');
}
function updateDept(id){
  var db=GD(),d=db.depts.find(function(x){return x.id===id});if(!d)return;
  d.code=$('edCode').value;d.name=$('edName').value;addNote(d,$('edNote').value);
  // 读取业务权限
  var subPages=getAllSubPages();
  d.perms=[];
  subPages.forEach(function(sp){
    var cb=document.querySelector('#modalOverlay input[type="checkbox"][value="'+sp.page+'"]');
    if(cb&&cb.checked)d.perms.push(sp.page);
  });
  // 读取审核权限
  d.auditPerms=[];
  Object.keys(AUDITABLE).forEach(function(t){
    var cb=document.querySelector('#modalOverlay input[type="checkbox"][value="'+t+'"]');
    if(cb&&cb.checked)d.auditPerms.push(t);
  });
  saveD(db);syncStaffPerms(id);clsModal();nav('baseinfo-dept','部门信息');toast('已更新');
}

// 编辑部门权限
function editDeptPerms(id){
  var db=GD(),d=db.depts.find(function(x){return x.id===id});if(!d)return;
  if(!d.perms)d.perms=[];
  var subPages=getAllSubPages();
  var h='<div style="max-height:400px;overflow-y:auto">';
  var currentGroup='',groupPages=[],allGroupChecked=null;
  subPages.forEach(function(sp){
    if(sp.group!==currentGroup){
      if(currentGroup){
        var allChecked=groupPages.every(function(p){return d.perms.indexOf(p)>=0});
        h+='</div>';
      }
      groupPages=[];
      currentGroup=sp.group;
      // 计算该组是否已全选
      var groupPagesAll=[];
      subPages.forEach(function(x){if(x.group===currentGroup)groupPagesAll.push(x.page)});
      var isAllChecked=groupPagesAll.every(function(p){return d.perms.indexOf(p)>=0});
      h+='<div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;font-weight:600;color:var(--tx)">'+
        '<label style="cursor:pointer;font-size:12px;display:flex;align-items:center;gap:3px">'+
        '<input type="checkbox" '+(isAllChecked?'checked':'')+' onchange="toggleDeptGroup('+id+',\''+currentGroup+'\',this.checked)" style="transform:scale(1.1)">'+
        '📁 <b>'+sp.group+'</b></label></div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px;padding-left:8px">';
    }
    groupPages.push(sp.page);
    var checked=d.perms.indexOf(sp.page)>=0?' checked':'';
    h+='<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid #e8e8e8;border-radius:4px;background:'+(checked?'#e6f7ff':'#fff')+'">'+
      '<input type="checkbox" value="'+sp.page+'"'+checked+' onchange="toggleDeptPerm('+id+',this)">'+sp.label+'</label>';
  });
  if(currentGroup){h+='</div>';}
  // 审核权限配置区域
  if(!d.auditPerms)d.auditPerms=[];
  h+='<div style="margin-top:12px;padding-top:8px;border-top:2px solid #ffd591"><div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔍 审核权限（该部门审核员可审核的流程类型）</div><div style="display:flex;flex-wrap:wrap;gap:6px" id="deptAuditPerms_'+id+'">'+
    Object.keys(AUDITABLE).map(function(t){var ck=d.auditPerms.indexOf(t)>=0?' checked':'';return'<label style="font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid #e8e8e8;border-radius:4px;background:'+(ck?'#fff7e6':'#fff')+'"><input type="checkbox" value="'+t+'"'+ck+' onchange="toggleDeptAuditPerm('+id+',this)">'+AUDITABLE[t].label+'</label>'}).join('')+
  '</div><span style="font-size:10px;color:#999">勾选后方可审核对应流程</span></div>';
  h+='</div>';
  modal('编辑部门权限 — '+d.name,h,
    '<button class="btn btn-p" onclick="clsModal();nav(\'baseinfo-dept\',\'部门信息\')">关闭</button>');
}

function toggleDeptGroup(deptId,groupName,checked){
  var db=GD(),d=db.depts.find(function(x){return x.id===deptId});if(!d)return;
  if(!d.perms)d.perms=[];
  var subPages=getAllSubPages();
  subPages.forEach(function(sp){
    if(sp.group===groupName){
      if(checked){if(d.perms.indexOf(sp.page)<0)d.perms.push(sp.page)}
      else{d.perms=d.perms.filter(function(p){return p!==sp.page})}
    }
  });
  saveD(db);syncStaffPerms(deptId);
  // 原地更新子复选框，避免关闭重建导致闪烁
  subPages.forEach(function(sp){
    if(sp.group===groupName){
      var cb=document.querySelector('#modalOverlay input[type="checkbox"][value="'+sp.page+'"]');
      if(cb){cb.checked=checked;cb.parentElement.style.background=checked?'#e6f7ff':'#fff';}
    }
  });
}
function toggleStaffGroup(staffId,groupName,checked){
  var db=GD(),s=db.staff.find(function(x){return x.id===staffId});if(!s)return;
  if(!s.perms)s.perms=[];
  var subPages=getAllSubPages();
  subPages.forEach(function(sp){
    if(sp.group===groupName){
      if(checked){if(s.perms.indexOf(sp.page)<0)s.perms.push(sp.page)}
      else{s.perms=s.perms.filter(function(p){return p!==sp.page})}
    }
  });
  saveD(db);
  // 原地更新子复选框，避免关闭重建导致闪烁
  subPages.forEach(function(sp){
    if(sp.group===groupName){
      var cb=document.querySelector('#modalOverlay input[type="checkbox"][value="'+sp.page+'"]');
      if(cb){cb.checked=checked;cb.parentElement.style.background=checked?'#e6f7ff':'#fff';}
    }
  });
}
function toggleDeptPerm(deptId,cb){
  var db=GD(),d=db.depts.find(function(x){return x.id===deptId});if(!d)return;
  if(!d.perms)d.perms=[];
  if(cb.checked){if(d.perms.indexOf(cb.value)<0)d.perms.push(cb.value)}
  else{d.perms=d.perms.filter(function(p){return p!==cb.value})}
  // 标记权限变更，后续点关闭时保存（这里直接保存以生效）
  saveD(db);
  // 更新该部门所有员工的权限
  syncStaffPerms(deptId);
  // update checkbox styling
  cb.parentElement.style.background=cb.checked?'#e6f7ff':'#fff';
}

// 同步部门下所有员工权限
function syncStaffPerms(deptId){
  var db=GD(),d=db.depts.find(function(x){return x.id===deptId});if(!d)return;
  var deptName=d.name;
  db.staff.forEach(function(s){
    if(s.dept===deptName||s.deptId===deptId){
      s.perms=d.perms?d.perms.slice():[];
      if(s.role==='auditor'){s.auditPerms=d.auditPerms?d.auditPerms.slice():[];}
    }
  });
}

// 部门审核权限切换
function toggleDeptAuditPerm(deptId,cb){
  var db=GD(),d=db.depts.find(function(x){return x.id===deptId});if(!d)return;
  if(!d.auditPerms)d.auditPerms=[];
  if(cb.checked){if(d.auditPerms.indexOf(cb.value)<0)d.auditPerms.push(cb.value)}
  else{d.auditPerms=d.auditPerms.filter(function(p){return p!==cb.value})}
  saveD(db);
  // 同步到该部门下的审核员
  db.staff.forEach(function(s){
    if((s.dept===d.name||s.deptId===deptId)&&s.role==='auditor'){
      s.auditPerms=d.auditPerms?d.auditPerms.slice():[];
    }
  });
  cb.parentElement.style.background=cb.checked?'#fff7e6':'#fff';
}

// 删除部门
function delDept(id){confirm('确认删除','确定删除此部门？部门删除后，该部门员工的权限将保留最后状态。','delDept|'+id);}
function _xDelDept(id){
  var db=GD();db.depts=db.depts.filter(function(x){return x.id!==id});
  saveD(db);nav('baseinfo-dept','部门信息');toast('已删除');
}

// ===== 员工权限编辑 =====
function editStaffPerms(staffId){
  var db=GD(),s=db.staff.find(function(x){return x.id===staffId});if(!s)return;
  if(!s.perms)s.perms=[];
  var subPages=getAllSubPages();
  var h='<div style="max-height:400px;overflow-y:auto">';
  var currentGroup='',groupPages=[];
  subPages.forEach(function(sp){
    if(sp.group!==currentGroup){
      if(currentGroup){
        h+='</div>';
      }
      groupPages=[];
      currentGroup=sp.group;
      var groupPagesAll=[];
      subPages.forEach(function(x){if(x.group===currentGroup)groupPagesAll.push(x.page)});
      var isAllChecked=groupPagesAll.every(function(p){return s.perms.indexOf(p)>=0});
      h+='<div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;font-weight:600;color:var(--tx)">'+
        '<label style="cursor:pointer;font-size:12px;display:flex;align-items:center;gap:3px">'+
        '<input type="checkbox" '+(isAllChecked?'checked':'')+' onchange="toggleStaffGroup('+staffId+',\''+currentGroup+'\',this.checked)" style="transform:scale(1.1)">'+
        '📁 <b>'+sp.group+'</b></label></div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px;padding-left:8px">';
    }
    groupPages.push(sp.page);
    var checked=s.perms.indexOf(sp.page)>=0?' checked':'';
    h+='<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid #e8e8e8;border-radius:4px;background:'+(checked?'#e6f7ff':'#fff')+'">'+
      '<input type="checkbox" value="'+sp.page+'"'+checked+' onchange="toggleStaffPerm('+staffId+',this)">'+sp.label+'</label>';
  });
  if(currentGroup){h+='</div>';}
  h+='</div>';
  // 审核员额外显示审核权限配置
  if(s.role==='auditor'){
    if(!s.auditPerms)s.auditPerms=[];
    h+='<div style="margin-top:12px;padding-top:8px;border-top:2px solid #ffd591"><div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔍 审核权限（该审核员可审核的流程类型）</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+
      Object.keys(AUDITABLE).map(function(t){var ck=s.auditPerms.indexOf(t)>=0?' checked':'';return'<label style="font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid #e8e8e8;border-radius:4px;background:'+(ck?'#fff7e6':'#fff')+'"><input type="checkbox" value="'+t+'"'+ck+' onchange="toggleStaffAuditPerm('+staffId+',this)">'+AUDITABLE[t].label+'</label>'}).join('')+
    '</div><span style="font-size:10px;color:#999">勾选后方可审核对应流程</span></div>';
  }
  var title='编辑员工权限 — '+s.name;
  if(s.role==='auditor')title='编辑员工业务权限+审核权限 — '+s.name;
  modal(title,h,
    '<button class="btn btn-p" onclick="clsModal();nav(\'baseinfo-staff\',\'员工信息\')">关闭</button>');
}

function toggleStaffPerm(staffId,cb){
  var db=GD(),s=db.staff.find(function(x){return x.id===staffId});if(!s)return;
  if(!s.perms)s.perms=[];
  if(cb.checked){if(s.perms.indexOf(cb.value)<0)s.perms.push(cb.value)}
  else{s.perms=s.perms.filter(function(p){return p!==cb.value})}
  saveD(db);
  cb.parentElement.style.background=cb.checked?'#e6f7ff':'#fff';
}

// 员工审核权限切换
function toggleStaffAuditPerm(staffId,cb){
  var db=GD(),s=db.staff.find(function(x){return x.id===staffId});if(!s)return;
  if(!s.auditPerms)s.auditPerms=[];
  if(cb.checked){if(s.auditPerms.indexOf(cb.value)<0)s.auditPerms.push(cb.value)}
  else{s.auditPerms=s.auditPerms.filter(function(p){return p!==cb.value})}
  saveD(db);
  cb.parentElement.style.background=cb.checked?'#fff7e6':'#fff';
}

// 检查用户是否有某页面的编辑权限
function hasPerm(page){
  if(isSupervisor())return true;
  if(isAuditor())return false;
  if(!currentUser)return false;
  var db=GD(),s=db.staff.find(function(x){return x.account===currentUser.accountId});
  if(!s)return false;
  if(!s.perms || s.perms.length===0)return true;
  return s.perms.indexOf(page)>=0;
}

function staffPage(c){
  var db=GD();
  var isSup=isSupervisor();
  // 搜索过滤
  var kw=(document.getElementById('staffSearch')||{}).value||'';
  var list=db.staff.slice();if(kw){kw=kw.toLowerCase();list=list.filter(function(s){return s.name.toLowerCase().indexOf(kw)>=0||(s.dept||'').indexOf(kw)>=0||s.code.toLowerCase().indexOf(kw)>=0||(s.tel||'').indexOf(kw)>=0})}
  var cols=['编号','部门','姓名','电话','账号','密码','角色','备注','操作'];
  var rows=list.sort(function(a,b){return (a.dept||'').localeCompare(b.dept||'','zh')}).map(function(s){
    var showAcct=isSup||(currentUser&&s.account===currentUser.accountId);
    var acctCell=showAcct?s.account:'******';
    var pwdCell=showAcct?s.password:'******';
    var roleCell=(s.role==='auditor')?'<span class="tag tag-red">审核员</span>':'<span class="tag tag-blue">员工</span>';
    var btns='';
    var note=noteHtml(s);
    if(isSup&&hasPerm("baseinfo-staff")) btns+='<button class="btn btn-xs btn-o" onclick="editStaff('+s.id+')">编辑</button> ';
    if(isSup&&hasPerm("baseinfo-staff")) btns+='<button class="btn btn-xs btn-d" onclick="delSt('+s.id+')">删除</button> ';
    return[s.code,s.dept,s.name,s.tel||'-',acctCell,pwdCell,roleCell,note,btns];
  });
  var addBtn=(isSup&&hasPerm("baseinfo-staff"))?'<button class="btn btn-p" onclick="addStaff()">+ 新增员工</button>':'';
  c.innerHTML='<div class="tbar"><strong>员工信息</strong> <input placeholder="搜索姓名/部门/编号..." id="staffSearch" onkeydown="if(event.key===\'Enter\'){staffPage(document.getElementById(\'pg\'))}"><button class="btn btn-o btn-sm" onclick="staffPage(document.getElementById(\'pg\'))">🔍 搜索</button><span class="spacer"></span>'+addBtn+'<span style="font-size:11px;color:var(--tx2);margin-left:8px">（账号6位数字 / 密码6位以上含大小写英文+数字）</span></div>'+rTable(cols,rows,8);
}
function deptOptions(selected){
  var db=GD();var depts={};db.staff.forEach(function(s){if(s.dept)depts[s.dept]=true});
  ['采购部','销售部','仓管部','财务部','生产部','行政部','技术部'].forEach(function(d){depts[d]=true});
  return Object.keys(depts).sort(function(a,b){return a.localeCompare(b,'zh')}).map(function(d){
    return '<option value="'+d+'"'+(selected===d?' selected':'')+'>'+d+'</option>';
  }).join('');
}
function addDept(cb){
  modal('新增部门','<div class="frow c1"><div class="fg"><label>部门名称</label><input id="newDeptName"></div></div>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveDept()">保存</button>');
  window._deptCb=cb;
}
function saveDept(){
  var n=$('newDeptName').value.trim();
  if(!n){toast('请输入部门名称');return}
  // 保存新增部门到 localStorage 中的自定义部门列表
  var db=GD();var allDepts={};db.staff.forEach(function(s){if(s.dept)allDepts[s.dept]=true});
  ['采购部','销售部','仓管部','财务部','生产部','行政部','技术部'].forEach(function(d){allDepts[d]=true});
  if(allDepts[n]){toast('该部门已存在');return}
  clsModal();
  if(window._deptCb)window._deptCb(n);
}
function addStaff(){
  var acc=genAcct(),pwd=genPwd();
  modal('新增员工','<div class="frow"><div class="fg"><label><span class="req">*</span>姓名</label><input id="stName"></div><div class="fg"><label>部门</label><select id="stDept"><option value="">请选择部门</option>'+getDeptSelectOptions()+'</select></div></div><div class="frow"><div class="fg"><label>角色</label><select id="stRole" onchange="stRoleChange()"><option value="staff">员工</option><option value="auditor">审核员</option></select></div><div class="fg"><label>电话</label><input id="stTel" placeholder="8-11位纯数字"></div></div><div class="frow"><div class="fg"><label>备注</label><input id="stNote"></div></div><div id="stAuditPermsArea" style="display:none;margin-bottom:8px;padding:8px;background:#fff7e6;border:1px solid #ffd591;border-radius:6px"><label style="font-weight:600;font-size:12px;margin-bottom:4px;display:block">审核权限（可审核的流程类型）</label><div style="display:flex;flex-wrap:wrap;gap:4px" id="stAuditPerms">'+Object.keys(AUDITABLE).map(function(t){return'<label style="font-size:11px;cursor:pointer;padding:2px 6px;border:1px solid #e8e8e8;border-radius:4px;display:flex;align-items:center;gap:3px"><input type="checkbox" value="'+t+'">'+AUDITABLE[t].label+'</label>'}).join('')+'</div><span style="font-size:10px;color:#999">默认不勾选，勾选后方可审核对应流程</span></div><input type="hidden" id="stAccount" value="'+acc+'"><input type="hidden" id="stPassword" value="'+pwd+'"><div style="padding:8px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px;font-size:12px;color:#389e0d;margin-top:4px">系统已自动生成：<br>账号：<b>'+acc+'</b>（6位纯数字）<br>密码：<b>'+pwd+'</b>（9位，含大小写英文+数字）<br>请截图或复制保存，后续可在员工信息中修改</div>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveStaff()">保存</button>');}
function stRoleChange(){var role=document.getElementById("stRole").value;var area=document.getElementById("stAuditPermsArea");if(area)area.style.display=role==="auditor"?"block":"none"}
function saveStaff(){
  if(!hasPerm("baseinfo-staff")){toast("无此页面操作权限");return}
  var db=GD(),name=$('stName').value,dept=$('stDept').value,tel=$('stTel').value.trim(),note=$('stNote').value||'';
  var account=$('stAccount').value.trim(),password=$('stPassword').value;
  if(!name){toast('请输入姓名');return}
  if(!/^\d{6}$/.test(account)){toast('账号必须为6位纯数字');return}
  if(!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{9,}$/.test(password)){toast('密码格式不正确');return}
  if(tel&&!/^\d{8,11}$/.test(tel)){toast('电话号码格式有误，请输入8-11位纯数字');return}
  if(ACCOUNTS[account]){var ex=db.staff.find(function(x){return x.account===account});toast('此账号已被'+(ex?ex.dept+' '+ex.name:'其他页面')+'使用，请更换账号');return}
  var id=nid(db,'staff');
  var deptId=parseInt(dept)||null;var staffDept=dept;if(deptId){var d2=db.depts.find(function(x){return x.id===deptId});if(d2)staffDept=d2.name}
  var role=document.getElementById('stRole').value;var auditPerms=[];if(role==='auditor'){if(d2&&d2.auditPerms){auditPerms=d2.auditPerms.slice()}var cbs=document.querySelectorAll('#stAuditPerms input[type="checkbox"]');if(cbs.length>0){auditPerms=[];for(var i=0;i<cbs.length;i++){if(cbs[i].checked)auditPerms.push(cbs[i].value)}}}
  db.staff.push({id:id,code:'YG'+String(id).padStart(3,'0'),name:name,dept:staffDept,deptId:deptId,tel:tel,note:note,account:account,password:password,role:role,perms:deptId&&d2?d2.perms.slice():[],auditPerms:auditPerms});
  ACCOUNTS[account]={name:name,role:role,password:password};
  saveD(db);clsModal();nav('baseinfo-staff','员工信息');toast('已添加');}
function editStaff(id){
  var db=GD(),s=db.staff.find(function(x){return x.id===id});if(!s)return;
  var sRole=s.role||'staff';var sAuditPerms=s.auditPerms||[];if(!s.perms)s.perms=[];
  var subPages=getAllSubPages();
  // 业务权限HTML
  var permsH='<div style="max-height:250px;overflow-y:auto;margin-top:8px;padding:8px;border:1px solid #91d5ff;border-radius:6px;background:#fafafa"><div style="font-weight:600;font-size:12px;color:var(--tx);margin-bottom:6px">📋 业务权限（页面访问控制）</div>';
  var currentGroup='',groupPages=[];
  subPages.forEach(function(sp){
    if(sp.group!==currentGroup){
      if(currentGroup){permsH+='</div>';}
      groupPages=[];
      currentGroup=sp.group;
      var groupPagesAll=[];
      subPages.forEach(function(x){if(x.group===currentGroup)groupPagesAll.push(x.page)});
      var isAllChecked=groupPagesAll.every(function(p){return s.perms.indexOf(p)>=0});
      permsH+='<div style="display:flex;align-items:center;gap:8px;margin:6px 0 3px;font-weight:600;font-size:11px;color:var(--tx)">'+
        '<label style="cursor:pointer;font-size:11px;display:flex;align-items:center;gap:3px">'+
        '<input type="checkbox" '+(isAllChecked?'checked':'')+' onchange="toggleStaffGroup('+id+',\''+currentGroup+'\',this.checked)" style="transform:scale(1.0)">'+
        '📁 <b>'+sp.group+'</b></label></div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:4px;padding-left:6px">';
    }
    groupPages.push(sp.page);
    var checked=s.perms.indexOf(sp.page)>=0?' checked':'';
    permsH+='<label style="display:flex;align-items:center;gap:2px;font-size:10px;cursor:pointer;padding:2px 6px;border:1px solid #e8e8e8;border-radius:3px;background:'+(checked?'#e6f7ff':'#fff')+'">'+
      '<input type="checkbox" value="'+sp.page+'"'+checked+' onchange="toggleStaffPerm('+id+',this)">'+sp.label+'</label>';
  });
  if(currentGroup){permsH+='</div>';}
  permsH+='</div>';
  var auditPermsHTML='';if(sRole==='auditor'){auditPermsHTML='<div style="margin-bottom:8px;padding:8px;background:#fff7e6;border:1px solid #ffd591;border-radius:6px"><label style="font-weight:600;font-size:12px;margin-bottom:4px;display:block">&#x1F50D; 审核权限（可审核的流程类型）</label><div style="display:flex;flex-wrap:wrap;gap:4px" id="estAuditPerms">'+Object.keys(AUDITABLE).map(function(t){var ck=sAuditPerms.indexOf(t)>=0?' checked':'';return'<label style="font-size:11px;cursor:pointer;padding:2px 6px;border:1px solid #e8e8e8;border-radius:4px;display:flex;align-items:center;gap:3px"><input type="checkbox" value="'+t+'"'+ck+'>'+AUDITABLE[t].label+'</label>'}).join('')+'</div><span style="font-size:10px;color:#999">勾选后方可审核对应流程</span></div>';}
  modal('编辑员工 — '+s.name,'<div class="frow"><div class="fg"><label><span class="req">*</span>姓名</label><input id="estName" value="'+s.name+'"></div><div class="fg"><label>部门</label><select id="estDept"><option value="">请选择部门</option>'+getDeptSelectOptions(s.deptId||s.dept)+'</select></div></div><div class="frow"><div class="fg"><label>角色</label><select id="estRole" onchange="estRoleChange()"><option value="staff"'+(sRole==='staff'?' selected':'')+'>员工</option><option value="auditor"'+(sRole==='auditor'?' selected':'')+'>审核员</option></select></div><div class="fg"><label>电话</label><input id="estTel" value="'+(s.tel||'')+'" placeholder="8-11位纯数字"></div></div><div class="frow"><div class="fg"><label>备注</label><input id="estNote" value="'+(s.note||'')+'"></div></div>'+auditPermsHTML+permsH+'<div class="frow"><div class="fg"><label><span class="req">*</span>账号 <span style="font-size:10px;color:var(--tx2)">（6位纯数字）</span></label><input id="estAccount" value="'+(s.account||'')+'" maxlength="6"></div><div class="fg"><label><span class="req">*</span>密码 <span style="font-size:10px;color:var(--tx2)">（6位以上，含大小写英文+数字）</span></label><input id="estPassword" value="'+(s.password||'')+'"></div></div>',
    '<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateStaff('+id+')">更新</button>');}
function estRoleChange(){var role=document.getElementById("estRole").value;var area=document.getElementById("estAuditPerms");if(area){var wrapper=area.parentElement;wrapper.style.display=role==="auditor"?"block":"none"}}
function updateStaff(id){
  var db=GD(),s=db.staff.find(function(x){return x.id===id});if(!s)return;
  var oldAcct=s.account;
  var account=$('estAccount').value.trim(),password=$('estPassword').value,tel=$('estTel').value.trim(),dept=$('estDept').value;
  if(!/^\d{6}$/.test(account)){toast('账号必须为6位纯数字');return}
  if(password.length<6||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password)){toast('密码至少6位，需含大小写英文+数字');return}
  if(tel&&!/^\d{8,11}$/.test(tel)){toast('电话号码格式有误，请输入8-11位纯数字');return}
  if(account!==oldAcct&&ACCOUNTS[account]){var ex=db.staff.find(function(x){return x.id!==id&&x.account===account});toast('此账号已被'+(ex?ex.dept+' '+ex.name:'其他页面')+'使用，请更换账号');return}
  var oldDeptId=s.deptId;s.name=$('estName').value;var estDeptId=parseInt(dept)||null;if(estDeptId){var ed=db.depts.find(function(x){return x.id===estDeptId});s.dept=ed?ed.name:dept;s.deptId=estDeptId;if(estDeptId!==oldDeptId){s.perms=ed?ed.perms.slice():[]}}else{s.dept=dept;s.deptId=null}
  s.role=document.getElementById("estRole").value;s.auditPerms=[];if(s.role==="auditor"){var eCbs=document.querySelectorAll("#estAuditPerms input[type=checkbox]");for(var ei=0;ei<eCbs.length;ei++){if(eCbs[ei].checked)s.auditPerms.push(eCbs[ei].value)}}else{s.auditPerms=[]};addNote(s,$('estNote').value);var subPages=getAllSubPages();s.perms=[];subPages.forEach(function(sp){var cb=document.querySelector('#modalOverlay input[type="checkbox"][value="'+sp.page+'"]');if(cb&&cb.checked)s.perms.push(sp.page)})
  s.account=account;s.password=password;
  if(oldAcct&&oldAcct!==account) delete ACCOUNTS[oldAcct];
  ACCOUNTS[account]={name:s.name,role:s.role,password:password};
  saveD(db);clsModal();nav('baseinfo-staff','员工信息');toast('已更新');}
function delSt(id){confirm('确认删除','确定删除？','delSt|'+id);}
function _xDelSt(id){
  var db=GD(),s=db.staff.find(function(x){return x.id===id});
  if(s&&s.account) delete ACCOUNTS[s.account];
  db.staff=db.staff.filter(function(x){return x.id!==id});
  saveD(db);nav('baseinfo-staff','员工信息');toast('已删除');
}

function accountPage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>会计科目</strong> <span class="spacer"></span>${hasPerm('baseinfo-account')?`<button class="btn btn-p" onclick="addAcct()">+ 新增科目</button>`:''}</div>${rTable(['编号','名称','类型','余额','操作'],db.accounts.map(a=>[a.code,a.name,`<span class="tag tag-blue">${a.type}</span>`,'¥'+fmt(a.bal),`${hasPerm('baseinfo-account')?`<button class="btn btn-xs btn-d" onclick="delAcct(${a.id})">删除</button>`:''}`]),5)}`;}
function addAcct(){modal('新增会计科目',`<div class="frow"><div class="fg"><label>名称</label><input id="aName"></div><div class="fg"><label>类型</label><select id="aType"><option>资产</option><option>负债</option><option>权益</option><option>收入</option><option>支出</option></select></div></div><div class="frow"><div class="fg"><label>期初余额</label><input id="aBal" type="number" step="0.01" value="0"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveAcct()">保存</button>`);}
function saveAcct(){
  if(!hasPerm("baseinfo-account")){toast("无此页面操作权限");return}let db=GD(),id=nid(db,'account');db.accounts.push({id,code:'100'+(id+3),name:$('aName').value,type:$('aType').value,bal:parseFloat($('aBal').value)||0});saveD(db);clsModal();nav('baseinfo-account','会计科目');toast('已添加');}
function delAcct(id){confirm('确认删除','确定删除？','delAcct|'+id);}

function unitPage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>计量单位</strong> <span class="spacer"></span>${hasPerm('baseinfo-unit')?`<button class="btn btn-p" onclick="addUnit()">+ 新增单位</button>`:''}</div>${rTable(['名称','操作'],db.units.map(u=>[u.name,`${hasPerm('baseinfo-unit')?`<button class="btn btn-xs btn-d" onclick="delUnit(${u.id})">删除</button>`:''}`]),2)}`;}
function addUnit(){modal('新增单位',`<div class="frow c1"><div class="fg"><label>名称</label><input id="unName"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveUnit()">保存</button>`);}
function saveUnit(){let db=GD(),id=nid(db,'unit');db.units.push({id,name:$('unName').value});saveD(db);clsModal();nav('baseinfo-unit','计量单位');toast('已添加');}
function delUnit(id){let db=GD();db.units=db.units.filter(x=>x.id!=id);saveD(db);nav('baseinfo-unit','计量单位');}

function catPage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>商品类别</strong> <span class="spacer"></span>${hasPerm('baseinfo-category')?`<button class="btn btn-p" onclick="addCat()">+ 新增类别</button>`:''}</div>${rTable(['名称','上级类别','操作'],db.categories.map(ca=>[ca.name,ca.pid?gName(db.categories,ca.pid):'顶级',`${hasPerm('baseinfo-category')?`<button class="btn btn-xs btn-d" onclick="delCat(${ca.id})">删除</button>`:''}`]),3)}`;}
function addCat(){let db=GD(),opts='<option value="0">顶级</option>'+db.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');modal('新增类别',`<div class="frow"><div class="fg"><label>名称</label><input id="catName"></div><div class="fg"><label>上级</label><select id="catPid">${opts}</select></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveCat()">保存</button>`);}
function saveCat(){let db=GD(),id=nid(db,'category');db.categories.push({id,pid:parseInt($('catPid').value),name:$('catName').value});saveD(db);clsModal();nav('baseinfo-category','商品类别');toast('已添加');}
function delCat(id){let db=GD();db.categories=db.categories.filter(x=>x.id!=id);saveD(db);nav('baseinfo-category','商品类别');}

function colorPage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>颜色管理</strong> <span class="spacer"></span>${hasPerm('baseinfo-color')?`<button class="btn btn-p" onclick="addColorGroup()">+ 新增颜色组</button>`:''}</div>${rTable(['名称','颜色列表','操作'],db.colorGroups.map(cg=>[cg.name,cg.colors.join(', '),`${hasPerm('baseinfo-color')?`<button class="btn btn-xs btn-o" onclick="editColorGroup(${cg.id})">编辑</button> <button class="btn btn-xs btn-d" onclick="delColorGroup(${cg.id})">删除</button>`:''}`]),3)}`;}
function addColorGroup(){modal('新增颜色组',`<div class="frow c1"><div class="fg"><label>组名</label><input id="cgName"></div></div><div class="frow c1"><div class="fg"><label>颜色 (逗号分隔)</label><input id="cgColors" placeholder="红色,蓝色,绿色,黑色..."></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveColorGroup()">保存</button>`);}
function saveColorGroup(){let db=GD(),id=nid(db,'colorGroup');db.colorGroups.push({id,name:$('cgName').value,colors:$('cgColors').value.split(',').map(s=>s.trim()).filter(Boolean)});saveD(db);clsModal();nav('baseinfo-color','颜色管理');toast('已添加');}
function editColorGroup(id){let db=GD(),cg=db.colorGroups.find(x=>x.id==id);if(!cg)return;modal('编辑颜色组',`<div class="frow c1"><div class="fg"><label>组名</label><input id="ecgName" value="${cg.name}"></div></div><div class="frow c1"><div class="fg"><label>颜色 (逗号分隔)</label><input id="ecgColors" value="${cg.colors.join(', ')}"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateColorGroup(${id})">更新</button>`);}
function updateColorGroup(id){let db=GD(),cg=db.colorGroups.find(x=>x.id==id);if(!cg)return;cg.name=$('ecgName').value;cg.colors=$('ecgColors').value.split(',').map(s=>s.trim()).filter(Boolean);saveD(db);clsModal();nav('baseinfo-color','颜色管理');toast('已更新');}
function delColorGroup(id){let db=GD();db.colorGroups=db.colorGroups.filter(x=>x.id!=id);saveD(db);nav('baseinfo-color','颜色管理');}

function sizePage(c){let db=GD();c.innerHTML=`<div class="tbar"><strong>尺码管理</strong> <span class="spacer"></span>${hasPerm('baseinfo-size')?`<button class="btn btn-p" onclick="addSizeGroup()">+ 新增尺码组</button>`:''}</div>${rTable(['名称','尺码列表','操作'],db.sizeGroups.map(sg=>[sg.name,sg.sizes.join(', '),`${hasPerm('baseinfo-size')?`<button class="btn btn-xs btn-o" onclick="editSizeGroup(${sg.id})">编辑</button> <button class="btn btn-xs btn-d" onclick="delSizeGroup(${sg.id})">删除</button>`:''}`]),3)}`;}
function addSizeGroup(){modal('新增尺码组',`<div class="frow c1"><div class="fg"><label>组名</label><input id="sgName"></div></div><div class="frow c1"><div class="fg"><label>尺码 (逗号分隔)</label><input id="sgSizes" placeholder="S,M,L,XL,XXL"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveSizeGroup()">保存</button>`);}
function saveSizeGroup(){let db=GD(),id=nid(db,'sizeGroup');db.sizeGroups.push({id,name:$('sgName').value,sizes:$('sgSizes').value.split(',').map(s=>s.trim()).filter(Boolean)});saveD(db);clsModal();nav('baseinfo-size','尺码管理');toast('已添加');}
function editSizeGroup(id){let db=GD(),sg=db.sizeGroups.find(x=>x.id==id);if(!sg)return;modal('编辑尺码组',`<div class="frow c1"><div class="fg"><label>组名</label><input id="esgName" value="${sg.name}"></div></div><div class="frow c1"><div class="fg"><label>尺码 (逗号分隔)</label><input id="esgSizes" value="${sg.sizes.join(', ')}"></div></div>`,`<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateSizeGroup(${id})">更新</button>`);}
function updateSizeGroup(id){let db=GD(),sg=db.sizeGroups.find(x=>x.id==id);if(!sg)return;sg.name=$('esgName').value;sg.sizes=$('esgSizes').value.split(',').map(s=>s.trim()).filter(Boolean);saveD(db);clsModal();nav('baseinfo-size','尺码管理');toast('已更新');}
function delSizeGroup(id){let db=GD();db.sizeGroups=db.sizeGroups.filter(x=>x.id!=id);saveD(db);nav('baseinfo-size','尺码管理');}

// ==================== 采购订单 ====================
function purchaseOrders(c){
  var db=GD();if(!db.purchaseOrders)db.purchaseOrders=[];
  var list=db.purchaseOrders;
  var showBtn=!isAuditor()&&!isSupervisor()&&hasPerm("purchase-order");
  if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}
  var kw=(document.getElementById('poSearch')||{}).value||'';
  if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||gSName(x.supplierId).indexOf(kw)>=0||gStName(x.staffId).indexOf(kw)>=0})}
  var addBtn=showBtn?'<button class="btn btn-p" onclick="addPO()">+ 新增</button>':'';
  c.innerHTML='<div class="tbar"><strong>采购订单</strong> <input placeholder="搜索单号/供应商..." id="poSearch" onkeydown="if(event.key===\'Enter\')purchaseOrders(document.getElementById(\'pg\'))"><button class="btn btn-o btn-sm" onclick="purchaseOrders(document.getElementById(\'pg\'))">🔍</button><span class="spacer"></span>'+addBtn+'</div>'
    +rTable(['单号','供应商','日期','商品','数量','单价','金额','备注','附件<span style="font-size:9px;color:#999"><br>点击查看</span>','审核状态','入库','付款','操作员','审核员','操作'],list.map(function(x){
      var st=auditStatusTag(x);
      var allQty=x.details?x.details.reduce(function(s,d){return s+d.qty},0):0;
      var inProgress=(x.inQty||0)+'/'+allQty;
      // 附件
      var attHtml='<span class="tag tag-gray">无附件</span>';
      if(x.attachments&&x.attachments.length){
        attHtml='<span class="tag tag-green" style="cursor:pointer" onclick="viewPOAtts('+x.id+')">有附件('+x.attachments.length+')</span>';
      }
      // 商品/数量/单价摘要
      var goodsSummary='',qtySummary='',priceSummary='';
      if(x.details&&x.details.length){
        goodsSummary=x.details.map(function(d){return gGName(d.goodsId)}).join('<br>');
        qtySummary=x.details.map(function(d){return d.qty}).join('<br>');
        priceSummary=x.details.map(function(d){return '¥'+fmt(d.price)}).join('<br>');
      }else{goodsSummary='-';qtySummary='-';priceSummary='-'}
      // 查询关联入库单的付款情况
      var piList2=db.purchaseIn.filter(function(pi){return pi.purchaseOrderId===x.id});
      var totalPaid=0,totalPiAmt=0;
      piList2.forEach(function(pi){totalPaid+=(pi.paidAmt||0);totalPiAmt+=(pi.totalAmt||0)});
      var payProgress=totalPiAmt>0?(totalPaid+'/'+totalPiAmt):'-';
      var btns='<button class="btn btn-xs btn-o" onclick="viewPO('+x.id+')">查看</button> ';
      if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewPO('+x.id+',true)">审核</button> ';
      var atSt=x.auditStatus||'草稿';
      if(!isAuditor()&&!isSupervisor()&&hasPerm("purchase-order")){
        if(atSt==='草稿')btns+='<button class="btn btn-xs btn-o" onclick="editPO('+x.id+')">修改</button> ';
        if(atSt==='已审核'&&(x.status==='已审核'||x.status==='部分入库'||!x.status||x.status==='待审核'))btns+='<button class="btn btn-xs btn-p" onclick="nav(\'purchase-in\',\'采购入库\');setTimeout(function(){addPI('+x.id+')},300)">转入库</button> ';
        if(atSt!=='待审核'&&atSt!=='已审核')btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'是否确认将此条采购订单删除？\',\'delPO|'+x.id+'\')">删除</button> ';
      }
      btns+=auditBtns('purchaseOrder',x);
      return[x.code+redDotHtml('purchaseOrder',x.id),gSName(x.supplierId),fd(x.date),goodsSummary,qtySummary,priceSummary,'¥'+fmt(x.totalAmt),noteHtml(x),attHtml,st,inProgress,payProgress,opTag(x.creatorId||x.operatorId),opTag(x.auditorId),btns];
    }),15,[7])}

function addPO(){
  let db=GD();
  let suppOpts=db.suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  let goodsOpts=db.goods.map(g=>`<option value="${g.id}">${g.name}(${g.spec||''})</option>`).join('');
  let code=gCode(BILL_PREFIX.purchaseOrder,'purchaseOrder');
  modal('新增采购订单',`
    <div class="frow"><div class="fg"><label><span class="req">*</span>单号</label><input id="poCode" value="${code}"></div><div class="fg"><label><span class="req">*</span>供应商</label><select id="poSupId">${suppOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>日期</label><input id="poDate" type="date" value="${now()}"></div><div class="fg"><label>操作员</label><div style="padding:7px 10px;background:#f5f5f5;border:1px solid #e8e8e8;border-radius:6px;font-size:12px;color:#333;min-height:36px;display:flex;align-items:center">${currentUser?currentUser.accountId+'-'+currentUser.name:'未登录'}</div></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="poNote"></div></div>
    <h4 style="margin:8px 0">采购明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="poDetail"><tr><td><select>${goodsOpts}</select></td><td><input type="number" value="1" min="1" style="width:65px"></td><td><input type="number" value="0" step="0.01" style="width:85px"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr></tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('poDetail');let r=t.insertRow();r.innerHTML=t.rows[0].innerHTML">+ 添加明细</button>
    <div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传附件(图片/PDF)</strong><br><input type="file" id="poFile" accept="image/*,.pdf" multiple style="margin-top:8px"></div>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="savePO()">保存</button>`);
}
function savePO(){
  if(!hasPerm("purchase-order")){toast("无此页面操作权限");return}
  let db=GD(),supplierId=parseInt($('poSupId').value);
  let rows=$('poDetail').rows,details=[],total=0;
  for(let r of rows){
    let goodsId=parseInt(r.cells[0].querySelector('select').value);
    let qty=parseFloat(r.cells[1].querySelector('input').value)||0;
    let price=parseFloat(r.cells[2].querySelector('input').value)||0;
    let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt;
  }
  if(!supplierId||!details.length){toast('请填写必要信息');return}
  let id=nid(db,'purchaseOrder');
  // 上传附件
  var atts=[];var fileInput=document.getElementById('poFile');if(fileInput&&fileInput.files){for(var i=0;i<fileInput.files.length;i++){var f=fileInput.files[i];atts.push({name:f.name,url:URL.createObjectURL(f)})}}
  db.purchaseOrders.push({id,code:$('poCode').value,date:$('poDate').value,supplierId,note:$('poNote').value||'',details,totalAmt:total,status:'草稿',inQty:0,auditStatus:'草稿',attachments:atts,operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:''});
  addRedDot(db,'purchaseOrder',id,'staff');
  saveD(db);clsModal();nav('purchase-order','采购订单');toast('已创建(草稿)，请提交审核');updateAuditBadge();
}
function editPO(id){
  let db=GD(),o=db.purchaseOrders.find(x=>x.id==id);if(!o)return;
  let suppOpts=db.suppliers.map(s=>`<option value="${s.id}" ${s.id==o.supplierId?'selected':''}>${s.name}</option>`).join('');
  let stOpts=db.staff.map(function(s){return'<option value="'+s.id+'"'+(s.id===o.staffId?' selected':'')+'>'+s.name+'</option>'}).join('');
  modal('编辑采购订单 - '+o.code,`
    <div class="frow"><div class="fg"><label>单号</label><input id="epoCode" value="${o.code}"></div><div class="fg"><label>供应商</label><select id="epoSupId">${suppOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>日期</label><input id="epoDate" type="date" value="${o.date||now()}"></div><div class="fg"><label>操作员</label><div style="padding:7px 10px;background:#f5f5f5;border:1px solid #e8e8e8;border-radius:6px;font-size:12px;color:#333;min-height:36px;display:flex;align-items:center">${currentUser?currentUser.accountId+'-'+currentUser.name:'未登录'}</div></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="epoNote" value="${o.note||''}"></div></div>
    <h4 style="margin:8px 0">采购明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="epoDetail">${o.details.map(d=>{
      let gOpts=db.goods.map(g=>`<option value="${g.id}" ${g.id==d.goodsId?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
      return `<tr><td><select>${gOpts}</select></td><td><input type="number" value="${d.qty}" min="1" style="width:65px"></td><td><input type="number" value="${d.price}" step="0.01" style="width:85px"></td><td>¥${fmt(d.amt)}</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr>`;
    }).join('')}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('epoDetail');let r=t.insertRow();r.innerHTML='<td><select>${db.goods.map(g=>`<option value=\\'${g.id}\\'>${g.name}(${g.spec||''})</option>`).join('')}</select></td><td><input type=\\'number\\' value=\\'1\\' min=\\'1\\' style=\\'width:65px\\'></td><td><input type=\\'number\\' value=\\'0\\' step=\\'0.01\\' style=\\'width:85px\\'></td><td>-</td><td><button class=\\'btn btn-xs btn-d\\' onclick=\\'this.closest(\\\\'tr\\\\').remove()\\'>×</button></td>'">+ 添加明细</button>
    <div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传附件(图片/PDF)</strong><br><input type="file" id="epoFile" accept="image/*,.pdf" multiple style="margin-top:8px"></div>
    ${o.attachments&&o.attachments.length?'<div style="margin-top:6px;font-size:12px;color:#666">已有附件: '+o.attachments.map(function(a,i){return'<span style="display:inline-block;margin:2px;padding:2px 8px;background:#f0f0f0;border-radius:4px">'+a.name+' <span style="cursor:pointer;color:#ff4d4f" onclick="delPOAtt('+id+','+i+')">×</span></span>'}).join(' ')+'</div>':''}`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updatePO(${id})">保存</button>`);
}
function updatePO(id){
  let db=GD(),o=db.purchaseOrders.find(x=>x.id==id);if(!o)return;
  o.code=$('epoCode').value;o.supplierId=parseInt($('epoSupId').value);o.date=$('epoDate').value;addNote(o,$('epoNote').value);
  let rows=$('epoDetail').rows,details=[],total=0;
  for(let r of rows){let sel=r.cells[0].querySelector('select');if(!sel)continue;let goodsId=parseInt(sel.value),qty=parseFloat(r.cells[1].querySelector('input').value)||0,price=parseFloat(r.cells[2].querySelector('input').value)||0;if(!qty)continue;let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt}
  o.details=details;o.totalAmt=total;
  // 上传新附件（追加到已有附件）
  if(!o.attachments)o.attachments=[];
  var fileInput=document.getElementById('epoFile');if(fileInput&&fileInput.files){for(var i=0;i<fileInput.files.length;i++){var f=fileInput.files[i];o.attachments.push({name:f.name,url:URL.createObjectURL(f)})}}
  saveD(db);clsModal();nav('purchase-order','采购订单');toast('已修改(草稿)');
}
function delPOAtt(orderId,attIdx){
  var db=GD(),o=db.purchaseOrders.find(function(x){return x.id===orderId});if(!o||!o.attachments)return;
  o.attachments.splice(attIdx,1);saveD(db);
  // 重新打开编辑弹窗
  clsModal();editPO(orderId);
}
function viewPO(id){
  let db=GD(),o=db.purchaseOrders.find(x=>x.id==id);if(!o)return;
  if(isStaff()&&o.auditStatus==='已审核'){clearRedDot(db,'purchaseOrder',id);saveD(db)}
  // 计算每个明细行已转入库数量
  var piList=db.purchaseIn.filter(function(x){return x.purchaseOrderId===id&&x.auditStatus==='已审核'});
  var detailInQty={};
  piList.forEach(function(pi){pi.details.forEach(function(d){detailInQty[d.goodsId]=(detailInQty[d.goodsId]||0)+d.qty})});
  var auditFooter='';
  if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){
    auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认将此条采购订单审核通过？\',\'approve|purchaseOrder|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'purchaseOrder\','+id+')">驳回</button> ';
  }
  modal('采购订单详情 - '+o.code,`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div><strong>供应商:</strong> ${gSName(o.supplierId)}</div><div><strong>日期:</strong> ${fd(o.date)}</div><div><strong>状态:</strong> ${o.status||'待审核'}</div>
      <div><strong>操作员:</strong> ${opTag(o.creatorId||o.operatorId)}</div><div><strong>审核员:</strong> ${opTag(o.auditorId)}</div><div><strong>备注:</strong> ${noteHtml(o)}</div></div>
    <table><thead><tr><th>商品</th><th>订单数量</th><th>已入库</th><th>未入库</th><th>单价</th><th>金额</th></tr></thead>
    <tbody>${o.details.map(function(d){var inQ=detailInQty[d.goodsId]||0;var unIn=d.qty-inQ;return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td><span style="color:#52c41a">'+inQ+'</span></td><td><span style="color:'+(unIn>0?'#ff4d4f':'#999')+'">'+unIn+'</span></td><td>¥'+fmt(d.price)+'</td><td>¥'+fmt(d.amt)+'</td></tr>'}).join('')}</tbody></table>
    <p style="margin-top:8px"><strong>合计: ¥${fmt(o.totalAmt)} | 已入库: ${o.inQty||0}件 | 未入库: ${o.details.reduce(function(s,d){return s+d.qty},0)-(o.inQty||0)}件</strong></p>
    ${(function(){var piList2=db.purchaseIn.filter(function(pi){return pi.purchaseOrderId===id});var totalPaid=0,totalPiAmt=0;piList2.forEach(function(pi){totalPaid+=(pi.paidAmt||0);totalPiAmt+=(pi.totalAmt||0)});return totalPiAmt>0?'<p><strong>付款进度:</strong> ¥'+fmt(totalPaid)+' / ¥'+fmt(totalPiAmt)+'</p>':''})()}
    ${o.attachments&&o.attachments.length?'<p><strong>📎 附件:</strong> <span class="tag tag-green" style="cursor:pointer" onclick="viewPOAtts('+id+')">查看('+o.attachments.length+'个)</span></p>':''}
    ${piList.length>0?'<div style="margin-top:8px;padding:8px;background:#fafafa;border-radius:6px"><strong>📋 已审核入库单:</strong><table style="width:100%;font-size:11px"><thead><tr><th>入库单号</th><th>仓库</th><th>入库数量</th><th>日期</th></tr></thead><tbody>'+piList.map(function(pi){return'<tr><td>'+pi.code+'</td><td>'+gWName(pi.warehouseId)+'</td><td>'+pi.details.reduce(function(s,d){return s+d.qty},0)+'件</td><td>'+fd(pi.date)+'</td></tr>'}).join('')+'</tbody></table></div>':''}`,
    auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function viewPOAtts(id){
  var db=GD(),o=db.purchaseOrders.find(function(x){return x.id===id});if(!o||!o.attachments||!o.attachments.length)return;
  var h='';
  o.attachments.forEach(function(a,i){
    var isImg=/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.name||'');
    if(isImg){h+='<div style="margin-bottom:12px"><strong>📷 '+a.name+'</strong><br><img src="'+a.url+'" style="max-width:100%;max-height:400px;border:1px solid #ddd;border-radius:6px;margin-top:4px" onerror="this.style.display=\'none\'"></div>'}
    else{h+='<div style="margin-bottom:12px"><strong>📎 '+a.name+'</strong><br><iframe src="'+a.url+'" style="width:100%;height:400px;border:1px solid #ddd;margin-top:4px" onerror="this.style.display=\'none\'"></iframe></div>'}
  });
  modal('📎 采购订单附件 - '+o.code,h,'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function viewSOAtts(id){
  var db=GD(),o=db.salesOrders.find(function(x){return x.id===id});if(!o||!o.attachments||!o.attachments.length)return;
  var h='';
  o.attachments.forEach(function(a,i){
    var isImg=/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.name||'');
    if(isImg){h+='<div style="margin-bottom:12px"><strong>📷 '+a.name+'</strong><br><img src="'+a.url+'" style="max-width:100%;max-height:400px;border:1px solid #ddd;border-radius:6px;margin-top:4px" onerror="this.style.display=\'none\'"></div>'}
    else{h+='<div style="margin-bottom:12px"><strong>📎 '+a.name+'</strong><br><iframe src="'+a.url+'" style="width:100%;height:400px;border:1px solid #ddd;margin-top:4px" onerror="this.style.display=\'none\'"></iframe></div>'}
  });
  modal('📎 销售订单附件 - '+o.code,h,'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function _xDelPO(id){var db=GD();db.purchaseOrders=db.purchaseOrders.filter(function(x){return x.id!==id});clearRedDot(db,'purchaseOrder',id);saveD(db);nav('purchase-order','采购订单');toast('已删除')}
function delPO(id){confirm('确认删除','确定删除此订单？','delPO|'+id)}

// ==================== 采购入库 ====================
function purchaseIn(c){
  let db=GD();if(!db.purchaseIn)db.purchaseIn=[];
  let list=db.purchaseIn;
  if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}
  var kw=(document.getElementById('piSearch')||{}).value||'';
  if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||gSName(x.supplierId).indexOf(kw)>=0||gWName(x.warehouseId).indexOf(kw)>=0})}
  c.innerHTML=`<div class="tbar"><strong>采购入库</strong> <input placeholder="搜索单号/供应商/仓库..." id="piSearch" onkeydown="if(event.key==='Enter')purchaseIn(document.getElementById('pg'))"><button class="btn btn-o btn-sm" onclick="purchaseIn(document.getElementById('pg'))">🔍</button><span class="spacer"></span>${hasPerm('purchase-in')?`<button class="btn btn-p" onclick="addPI()">+ 新增入库</button>`:`<span style="color:#999;font-size:12px">无权限</span>`}</div>
    ${rTable(['单号','供应商','仓库','日期','金额','税率','运费','备注','入库进度','付款进度','审核状态','操作员','审核员','操作'],list.map(function(x){
      var allQty=x.details?x.details.reduce(function(s,d){return s+d.qty},0):0;
      var inProgress=(x.status==='未付款'||x.status==='部分付款'||x.status==='已付款')?allQty+'/'+allQty:'0/'+allQty;
      var paidAmt=x.paidAmt||0;
      var payProgress=(x.status==='已付款'||x.status==='部分付款')?paidAmt+'/'+(x.totalAmt||0):(x.auditStatus==='已审核'?'0/'+(x.totalAmt||0):'-');
      let st=auditStatusTag(x);
      let btns=`<button class="btn btn-xs btn-o" onclick="viewPI(${x.id})">查看</button> `;
      if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewPI('+x.id+',true)">审核</button> ';
      let atSt=x.auditStatus||'草稿';
        if(!isAuditor()&&!isSupervisor()&&hasPerm("purchase-in")){
        if(atSt==='草稿')btns+='<button class="btn btn-xs btn-o" onclick="editPI('+x.id+')">修改</button> ';
        if(atSt!=='待审核'&&atSt!=='已审核')btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'删除将回退库存，确定？\',\'delPI|'+x.id+'\')">删除</button> ';
        if(atSt==='已审核'&&(x.status==='未付款'||x.status==='部分付款')&&hasPerm("purchase-in"))btns+='<button class="btn btn-xs btn-pay" onclick="nav(\'purchase-pay\',\'付款结算\');setTimeout(function(){addPPay('+x.id+')},300)">去付款</button> ';
      }
      btns+=auditBtns('purchaseIn',x);
      return[x.code+redDotHtml('purchaseIn',x.id),gSName(x.supplierId),gWName(x.warehouseId),fd(x.date),'¥'+fmt(x.totalAmt),
        (x.taxRate||0)+'%','¥'+fmt(x.freight||0),noteHtml(x),inProgress,payProgress,st,opTag(x.creatorId||x.operatorId),opTag(x.auditorId),btns];
    }),13,[7])}`;
}
function addPI(orderId,prefillGoodsId){
  orderId=orderId||null;
  prefillGoodsId=prefillGoodsId||null;
  let db=GD();
  var o=orderId?db.purchaseOrders.find(function(x){return x.id===orderId}):null;
  let suppOpts=db.suppliers.map(s=>`<option value="${s.id}" ${o&&s.id===o.supplierId?'selected':''}>${s.name}</option>`).join('');
  let whOpts=db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  let goodsOpts=db.goods.map(g=>`<option value="${g.id}" ${prefillGoodsId===g.id?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
  let code=gCode(BILL_PREFIX.purchaseIn,'purchaseIn');
  // 关联采购订单时计算已转入数量
  var detailInQty={};
  if(o){var piList=db.purchaseIn.filter(function(x){return x.purchaseOrderId===orderId});piList.forEach(function(pi){pi.details.forEach(function(d){detailInQty[d.goodsId]=(detailInQty[d.goodsId]||0)+d.qty})})}
  var orderInfo=o?(' — 来自订单: '+o.code):'';
  modal('新增采购入库'+orderInfo,`
    <div class="frow"><div class="fg"><label><span class="req">*</span>单号</label><input id="pi2Code" value="${code}"></div><div class="fg"><label><span class="req">*</span>供应商</label><select id="pi2SupId">${suppOpts}</select>${o?'<input type="hidden" id="pi2OrderId" value="'+orderId+'">':''}</div></div>
    <div class="frow"><div class="fg"><label><span class="req">*</span>仓库</label><select id="pi2WhId">${whOpts}</select></div><div class="fg"><label>日期</label><input id="pi2Date" type="date" value="${now()}"></div></div>
    <div class="frow"><div class="fg"><label>制单人</label><select id="pi2StId">${db.staff.map(s=>`<option value="${s.id}" ${o&&s.id===o.staffId?'selected':''}>${s.name}</option>`).join('')}</select></div><div class="fg"><label>备注</label><input id="pi2Note" value="${o?o.note||'':''}"></div></div>
    <h4 style="margin:8px 0">入库明细${o?' (来自订单)':''}</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th>${o?'<th>订单数量</th><th>已转入</th><th>未转入</th>':''}<th style="width:70px">本次入库</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="pi2Detail">${o?o.details.map(function(d){var inQ=detailInQty[d.goodsId]||0;var unIn=d.qty-inQ;return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td>'+inQ+'</td><td><span style="color:'+(unIn>0?'#faad14':'#52c41a')+'">'+unIn+'</span></td><td><span class="m-lbl">数量</span><input type="number" value="'+(unIn>0?unIn:0)+'" min="0" max="'+unIn+'" style="width:55px" data-gid="'+d.goodsId+'"></td><td><span class="m-lbl">单价</span><input type="number" value="'+d.price+'" step="0.01" style="width:65px"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr>'}).join(''):'<tr><td><select>'+goodsOpts+'</select></td><td><span class="m-lbl">数量</span><input type="number" value="1" min="1" style="width:55px"></td><td><span class="m-lbl">单价</span><input type="number" value="0" step="0.01" style="width:65px"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr>'}</tbody></table>${/*采购入库独立模式*/''}
    ${o?'':'<button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$(\'pi2Detail\');let r=t.insertRow();r.innerHTML=t.rows[0].innerHTML">+ 添加明细</button>'}
    <div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传附件(图片/PDF)</strong><br><input type="file" id="piFile" accept="image/*,.pdf" multiple style="margin-top:8px"></div>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="window._savePI()">保存</button>`);
    window._savePI=savePI;
}
function savePI(){
  if(!hasPerm("purchase-in")){toast("无此页面操作权限");return}
  var db=GD(),supplierId=parseInt($('pi2SupId').value),warehouseId=parseInt($('pi2WhId').value),staffId=parseInt($('pi2StId').value);
  var orderIdEl=$('pi2OrderId');var orderId=orderIdEl?parseInt(orderIdEl.value):null;
  var o=orderId?db.purchaseOrders.find(function(x){return x.id===orderId}):null;
  var rows=$('pi2Detail').rows,details=[],total=0,totalQty=0;
  for(var r=0;r<rows.length;r++){
    var goodsId=0;
    if(o){
      var gidInput2=rows[r].cells[4]?rows[r].cells[4].querySelector('input'):null;
      goodsId=gidInput2?parseInt(gidInput2.dataset.gid):0;
    }else{
      var selA=rows[r].cells[0].querySelector('select');
      if(!selA)continue;goodsId=parseInt(selA.value);
    }
    var qty=0,price=0;
    if(o){
      qty=parseFloat(rows[r].cells[4].querySelector('input').value)||0;
      price=parseFloat(rows[r].cells[5].querySelector('input').value)||0;
    }else{
      qty=parseFloat(rows[r].cells[1].querySelector('input').value)||0;
      price=parseFloat(rows[r].cells[2].querySelector('input').value)||0;
    }
    if(!qty||!goodsId)continue;
    if(o){
      var od2=o.details.find(function(dd){return dd.goodsId===goodsId});
      if(od2){
        var alreadyIn2=0;
        var piAll2=db.purchaseIn.filter(function(x){return x.purchaseOrderId===orderId});
        piAll2.forEach(function(px){px.details.forEach(function(dx){if(dx.goodsId===goodsId)alreadyIn2+=dx.qty})});
        var maxIn2=od2.qty-alreadyIn2;
        if(qty>maxIn2){toast('商品'+gGName(goodsId)+'入库超限，订单'+od2.qty+'件，已转'+alreadyIn2+'件，最多'+maxIn2+'件');return}
      }
    }
    var amt=qty*price;details.push({goodsId:goodsId,qty:qty,price:price,amt:amt});total+=amt;totalQty+=qty;
  }
  if(!supplierId||!details.length){toast('请填写必要信息');return}
  var id=nid(db,'purchaseIn');
  // 上传附件
  var atts=[];var fileInput=document.getElementById('piFile');if(fileInput&&fileInput.files){for(var i=0;i<fileInput.files.length;i++){var f=fileInput.files[i];atts.push({name:f.name,url:URL.createObjectURL(f)})}}
  db.purchaseIn.push({id:id,code:$('pi2Code').value,date:$('pi2Date').value,supplierId:supplierId,warehouseId:warehouseId,staffId:staffId,note:$('pi2Note').value||'',details:details,totalAmt:total,status:'未付款',auditStatus:'草稿',purchaseOrderId:orderId||null,attachments:atts,operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:''});
  // 入库进度不再在保存时更新，统一在审核通过时更新
  addRedDot(db,'purchaseIn',id,'staff');
  saveD(db);clsModal();nav('purchase-in','采购入库');toast('已创建(草稿)，请提交审核');updateAuditBadge();
}
function viewPI(id){
  let db=GD(),o=db.purchaseIn.find(x=>x.id==id);if(!o)return;
  if(isStaff()&&o.auditStatus==='已审核'){clearRedDot(db,'purchaseIn',id);saveD(db)}
  var auditFooter='';
  if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){
    auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认将此条采购入库审核通过？\',\'approve|purchaseIn|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'purchaseIn\','+id+')">驳回</button> ';
  }
  modal('采购入库详情 - '+o.code,`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div><strong>供应商:</strong> ${gSName(o.supplierId)}</div><div><strong>仓库:</strong> ${gWName(o.warehouseId)}</div><div><strong>日期:</strong> ${fd(o.date)}</div>
      <div><strong>状态:</strong> ${o.status||'未付款'}</div><div><strong>税率:</strong> ${o.taxRate||0}%</div><div><strong>运费:</strong> ¥${fmt(o.freight||0)}</div>
      <div><strong>备注:</strong> ${noteHtml(o)}</div><div><strong>操作员:</strong> ${opTag(o.creatorId||o.operatorId)}</div><div><strong>审核员:</strong> ${opTag(o.auditorId)}</div></div>
    <table class="edt-tbl"><thead><tr><th>商品</th><th>数量</th><th>仓储批次</th><th>单价</th><th>金额</th></tr></thead>
    <tbody>${o.details.map(function(d){var batchInfo='-';if(o.auditStatus==='已审核'){var bt=findBatchesByCode(o.code);for(var bi=0;bi<bt.length;bi++){var b=bt[bi];if(b.purchaseInCode===o.code&&b.goodsId===d.goodsId){batchInfo=b.batchCode||'BTH-';break}}}return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td><b>'+batchInfo+'</b></td><td>¥'+fmt(d.price)+'</td><td>¥'+fmt(d.amt)+'</td></tr>'}).join('')}</tbody></table>
    <p style="margin-top:8px"><strong>合计: ¥${fmt(o.totalAmt)}</strong> | <strong>入库进度:</strong> ${o.auditStatus==='已审核'?o.details.reduce(function(s,d){return s+d.qty},0)+'/'+o.details.reduce(function(s,d){return s+d.qty},0):'0/'+o.details.reduce(function(s,d){return s+d.qty},0)} | <strong>付款进度:</strong> ${o.auditStatus==='已审核'?'¥'+fmt(o.paidAmt||0)+' / ¥'+fmt(o.totalAmt||0):'-'}</p>
    ${o.auditStatus==='已审核'?(function(){var bt=findBatchesByCode(o.code);return bt.length>0?'<div style="margin-top:12px;padding:8px;background:#fafafa;border-radius:6px"><strong>📋 关联批次 ('+bt.length+'批):</strong>'+renderBatchGroups(bt)+'</div>':'';})():'<p style="color:#aaa;font-size:11px">（审核通过后将显示批次链路）</p>'}`,
    auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function editPI(id){
  let db=GD(),o=db.purchaseIn.find(x=>x.id==id);if(!o)return;
  let suppOpts=db.suppliers.map(s=>`<option value="${s.id}" ${s.id==o.supplierId?'selected':''}>${s.name}</option>`).join('');
  let whOpts=db.warehouses.map(w=>`<option value="${w.id}" ${w.id==o.warehouseId?'selected':''}>${w.name}</option>`).join('');
  let stOpts=db.staff.map(function(s){return'<option value="'+s.id+'"'+(s.id===o.staffId?' selected':'')+'>'+s.name+'</option>'}).join('');
  modal('编辑采购入库 - '+o.code,`
    <div class="frow"><div class="fg"><label>单号</label><input id="epiCode" value="${o.code}"></div><div class="fg"><label>供应商</label><select id="epiSupId">${suppOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>仓库</label><select id="epiWhId">${whOpts}</select></div><div class="fg"><label>日期</label><input id="epiDate" type="date" value="${o.date||now()}"></div></div>
    <div class="frow"><div class="fg"><label>制单人</label><select id="epiStId">${stOpts}</select></div><div class="fg"><label>备注</label><input id="epiNote" value="${o.note||''}"></div></div>
    <h4 style="margin:8px 0">入库明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="epiDetail">${o.details.map(d=>{
      let gOpts=db.goods.map(g=>`<option value="${g.id}" ${g.id==d.goodsId?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
      return `<tr><td><select>${gOpts}</select></td><td><input type="number" value="${d.qty}" min="1" style="width:65px"></td><td><input type="number" value="${d.price}" step="0.01" style="width:85px"></td><td>¥${fmt(d.amt)}</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr>`;
    }).join('')}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('epiDetail');let r=t.insertRow();r.innerHTML='<td><select>${db.goods.map(g=>`<option value=\\'${g.id}\\'>${g.name}(${g.spec||''})</option>`).join('')}</select></td><td><input type=\\'number\\' value=\\'1\\' min=\\'1\\' style=\\'width:65px\\'></td><td><input type=\\'number\\' value=\\'0\\' step=\\'0.01\\' style=\\'width:85px\\'></td><td>-</td><td><button class=\\'btn btn-xs btn-d\\' onclick=\\'this.closest(\\\\'tr\\\\').remove()\\'>×</button></td>'">+ 添加明细</button>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updatePI(${id})">保存</button>`);
}
function updatePI(id){
  let db=GD(),o=db.purchaseIn.find(x=>x.id==id);if(!o)return;
  o.code=$('epiCode').value;o.supplierId=parseInt($('epiSupId').value);o.warehouseId=parseInt($('epiWhId').value);o.staffId=parseInt($('epiStId').value);o.date=$('epiDate').value;addNote(o,$('epiNote').value);
  let rows=$('epiDetail').rows,details=[],total=0;
  for(let r of rows){let sel=r.cells[0].querySelector('select');if(!sel)continue;let goodsId=parseInt(sel.value),qty=parseFloat(r.cells[1].querySelector('input').value)||0,price=parseFloat(r.cells[2].querySelector('input').value)||0;if(!qty)continue;let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt}
  o.details=details;o.totalAmt=total;
  saveD(db);clsModal();nav('purchase-in','采购入库');toast('已修改(草稿)');
}
function delPI(id){confirm('确认删除','删除将回退库存，确定？','delPI|'+id)}

function _xDelPI(id){var db=GD(),o=db.purchaseIn.find(function(x){return x.id===id});
  // 仅已审核的入库单删除时回退库存并清理批次（草稿/已驳回未入过库）
  if(o&&o.auditStatus==='已审核'){o.details.forEach(function(d){var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===o.warehouseId});if(inv){inv.qty=Math.max(0,(inv.qty||0)-d.qty);if(inv.batches)inv.batches=inv.batches.filter(function(b){return b.purchaseInCode!==o.code})}});
    if(o.purchaseOrderId){var po=db.purchaseOrders.find(function(x){return x.id===o.purchaseOrderId});if(po){po.inQty=Math.max(0,(po.inQty||0)-o.details.reduce(function(s,d){return s+d.qty},0));po.status=po.inQty<=0?'已审核':(po.inQty>=po.details.reduce(function(s,d){return s+d.qty},0)?'已完成':'部分入库')}}}
  db.purchaseIn=db.purchaseIn.filter(function(x){return x.id!==id});clearRedDot(db,'purchaseIn',id);saveD(db);nav('purchase-in','采购入库');toast('已删除');}

// ==================== 采购退货/付款/管理首页 ====================
// 采购退货：已入库商品退回给供应商 → 审核通过后扣减库存
function purchaseReturn(c){
  var db=GD();if(!db.purchaseReturn)db.purchaseReturn=[];
  var list=db.purchaseReturn;
  if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}
  var kw=(document.getElementById('prSearch')||{}).value||'';
  if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||opTag(x.operatorId).indexOf(kw)>=0})}
  var showAddBtn=!isAuditor()&&!isSupervisor()&&hasPerm("purchase-return");
  c.innerHTML='<div class="tbar"><strong>采购退货</strong> <input placeholder="搜索单号..." id="prSearch" onkeydown="if(event.key===\'Enter\')purchaseReturn(document.getElementById(\'pg\'))"><button class="btn btn-o btn-sm" onclick="purchaseReturn(document.getElementById(\'pg\'))">🔍</button><span class="spacer"></span>'+(showAddBtn?'<button class="btn btn-p" onclick="addPR()">+ 新增退货</button>':'')+'</div>'
    +rTable(['单号','仓库','日期','金额','制单人','备注','审核状态','操作员','审核员','操作'],list.map(function(x){
      var st=auditStatusTag(x);
      var btns='<button class="btn btn-xs btn-o" onclick="viewPR('+x.id+')">查看</button> ';
      if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewPR('+x.id+',true)">审核</button> ';
      var atSt=x.auditStatus||'草稿';
      if(!isAuditor()&&!isSupervisor()&&hasPerm("purchase-return")){
        if(atSt!=='待审核'&&atSt!=='已审核')btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'删除将回退库存，确定？\',\'delPR|'+x.id+'\')">删除</button> ';
      }
      btns+=auditBtns('purchaseReturn',x);
      return[x.code+redDotHtml('purchaseReturn',x.id),gWName(x.warehouseId),fd(x.date),'¥'+fmt(x.totalAmt),gStName(x.staffId),noteHtml(x),st,opTag(x.operatorId),opTag(x.auditorId),btns];
    }),10,[5]);}
function addPR(){
  var db=GD(),code=gCode(BILL_PREFIX.purchaseReturn,'purchaseReturn');
  var batchData={};
  db.inventory.forEach(function(inv){
    if(!inv.batches||!inv.batches.length)return;
    inv.batches.forEach(function(b){
      var avail=b.remaining!=null?b.remaining:b.qty;
      if(avail<=0)return;
      if(!batchData[inv.goodsId])batchData[inv.goodsId]=[];
      batchData[inv.goodsId].push({warehouseId:inv.warehouseId,warehouseName:gWName(inv.warehouseId),purchaseOrderCode:b.purchaseOrderCode||'',purchaseInCode:b.purchaseInCode||'独立入库',avail:avail,price:b.price||0,batch:b});
    });
  });
  var buildBatchOptions=function(gid){
    var arr=batchData[gid]||[];
    return arr.map(function(a,i){return'<option value="'+i+'" data-wh="'+a.warehouseId+'" data-price="'+a.price+'" data-max="'+a.avail+'">'+a.warehouseName+' | '+a.purchaseInCode+' | '+a.avail+'件</option>'}).join('');
  };
  var goodsOpts=Object.keys(batchData).map(function(gid){var g=db.goods.find(function(x){return x.id===parseInt(gid)});if(!g)return'';return'<option value="'+gid+'">'+g.name+'('+(g.spec||'')+')</option>'}).join('');
  modal('新增采购退货','<div class="frow"><div class="fg"><label><span class=req>*</span>单号</label><input id="prCode" value="'+code+'"></div><div class="fg"><label>日期</label><input id="prDate" type=date value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>制单人</label><select id="prStId">'+db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')+'</select></div><div class="fg"><label>备注</label><input id="prNote"></div></div><h4 style="margin:8px 0">退货明细（批次已含仓库信息）</h4><table class="edt-tbl"><thead><tr><th>商品</th><th>退货批次</th><th>可用量</th><th style="width:70px">退货数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead><tbody id="prDetail"><tr><td><select onchange="updatePRRowBatch(this)">'+goodsOpts+'</select></td><td><select id="prSel1" onchange="updatePRWhFromBatch(this)">'+buildBatchOptions(Object.keys(batchData)[0]||'')+'</select></td><td><span class=prAvail>—</span></td><td><input type=number value=0 min=1 style="width:65px" data-max="0" oninput="updatePRRowAmt(this)"></td><td><input type=number value=0 step=0.01 style="width:85px" data-price="0" oninput="updatePRRowAmt(this)"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr></tbody></table><button class="btn btn-xs btn-o" style="margin-top:6px" onclick="var t=document.getElementById(\'prDetail\');var nr=t.rows[0].cloneNode(true);updatePRRowIndexNew(nr,t.rows.length);t.appendChild(nr)">+ 添加明细</button>','<button class=btn btn-o onclick=clsModal()>取消</button><button class=btn btn-p onclick=savePR()>保存</button>');updatePRRowBatch(document.querySelector('#prDetail select'))}
function updatePRRowIndexNew(clonedRow,idx){
  clonedRow.cells[1].querySelector('select').id='prSel'+idx;
  clonedRow.cells[2].textContent='—';clonedRow.cells[3].querySelector('input').value=0;clonedRow.cells[4].querySelector('input').value=0;clonedRow.cells[5].textContent='-';
}
function updatePRRowBatch(sel){
  var r=sel.closest('tr');var gid=sel.value;var sel1=r.cells[1].querySelector('select');
  var g=GD().goods.find(function(x){return x.id===parseInt(gid)});
  var invs=GD().inventory;
  var opts='';var batchRef=[];invs.forEach(function(inv){if(inv.goodsId!==parseInt(gid)||!inv.batches)return;inv.batches.forEach(function(b){var avail=b.remaining!=null?b.remaining:b.qty;if(avail<=0)return;batchRef.push({wh:inv.warehouseId,whName:gWName(inv.warehouseId),code:b.purchaseInCode||'独立入库',avail:avail,price:b.price||0});opts+='<option value="'+(batchRef.length-1)+'" data-wh="'+inv.warehouseId+'" data-price="'+(b.price||0)+'" data-max="'+avail+'">'+gWName(inv.warehouseId)+' | '+(b.purchaseInCode||'独立入库')+' | '+avail+'件</option>'});});sel1.innerHTML=opts||'<option>无可退批次</option>';
  if(opts){var o0=sel1.options[0];r.cells[2].textContent=o0.getAttribute('data-max')||0;r.cells[3].querySelector('input').setAttribute('data-max',o0.getAttribute('data-max'));r.cells[4].querySelector('input').setAttribute('data-price',o0.getAttribute('data-price'))}else{r.cells[2].textContent='—'}
}
function updatePRWhFromBatch(sel1){var r=sel1.closest('tr');var opt=sel1.options[sel1.selectedIndex];var max=opt.getAttribute('data-max');r.cells[2].textContent=max||'—';r.cells[3].querySelector('input').setAttribute('data-max',max);r.cells[4].querySelector('input').setAttribute('data-price',opt.getAttribute('data-price'))}
function savePR(){
  if(!hasPerm("purchase-return")){toast("无此页面操作权限");return}
  var db=GD(),staffId=parseInt(document.querySelector('#prStId').value);
  var rows=document.querySelector('#prDetail').rows,details=[],total=0,warehouseId=null;
  for(var r=0;r<rows.length;r++){
    var selG=rows[r].cells[0].querySelector('select');if(!selG)continue;
    var goodsId=parseInt(selG.value);var qty=parseFloat(rows[r].cells[3].querySelector('input').value)||0;var price=parseFloat(rows[r].cells[4].querySelector('input').value)||0;if(!qty)continue;
    var max=parseInt(rows[r].cells[3].querySelector('input').getAttribute('data-max'))||0;if(qty>max){toast('商品退货数量超限，最大可退'+max+'件');return}
    var sel1=rows[r].cells[1].querySelector('select');
    var whId=parseInt(sel1.options[sel1.selectedIndex].getAttribute('data-wh'));
    if(!warehouseId)warehouseId=whId;
    var amt=qty*price;details.push({goodsId:goodsId,qty:qty,price:price,amt:amt});total+=amt
  }
  if(!details.length){toast('请填写明细');return}
  var id=nid(db,'purchaseReturn');
  db.purchaseReturn.push({id:id,code:document.querySelector('#prCode').value,date:document.querySelector('#prDate').value,warehouseId:warehouseId,staffId:staffId,note:document.querySelector('#prNote').value||'',details:details,totalAmt:total,auditStatus:'草稿',operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:''});
  addRedDot(db,'purchaseReturn',id,'staff');
  saveD(db);clsModal();nav('purchase-return','采购退货');toast('已创建(草稿)，请提交审核');updateAuditBadge();
}
function viewPR(id){
  let db=GD(),o=db.purchaseReturn.find(x=>x.id==id);if(!o)return;
  clearRedDot(db,'purchaseReturn',id);saveD(db) // 查看即消红点（不限状态）
  if(isStaff()&&o.auditStatus==='已审核'){saveD(db)} // 已审核时需先clearRedDot已改过db，按需再save
  var auditFooter='';
  if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){
    auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认将此条采购退货审核通过？\',\'approve|purchaseReturn|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'purchaseReturn\','+id+')">驳回</button> ';
  }
  modal('采购退货详情 - '+o.code,`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div><strong>仓库:</strong> ${gWName(o.warehouseId)}</div><div><strong>日期:</strong> ${fd(o.date)}</div>
      <div><strong>制单人:</strong> ${gStName(o.staffId)}</div><div><strong>备注:</strong> ${noteHtml(o)}</div></div>
    <table class="edt-tbl"><thead><tr><th>商品</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
    <tbody>${o.details.map(d=>`<tr><td>${gGName(d.goodsId)}</td><td>${d.qty}</td><td>¥${fmt(d.price)}</td><td>¥${fmt(d.amt)}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:8px"><strong>合计: ¥${fmt(o.totalAmt)}</strong></p>
    ${o.auditStatus==='已审核'?(function(){var bt=findBatchesByCode(o.code);return bt.length>0?'<div style="margin-top:12px;padding:8px;background:#fafafa;border-radius:6px"><strong>📋 关联批次 ('+bt.length+'批):</strong>'+renderBatchGroups(bt)+'</div>':'';})():'<p style="color:#aaa;font-size:11px">（审核通过后将显示批次链路）</p>'}`,
    auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function editPR(id){
  let db=GD(),o=db.purchaseReturn.find(x=>x.id==id);if(!o)return;
  let whOpts=db.warehouses.map(w=>`<option value="${w.id}" ${w.id==o.warehouseId?'selected':''}>${w.name}</option>`).join('');
  let stOpts=db.staff.map(function(s){return'<option value="'+s.id+'"'+(s.id===o.staffId?' selected':'')+'>'+s.name+'</option>'}).join('');
  modal('编辑采购退货 - '+o.code,`
    <div class="frow"><div class="fg"><label>单号</label><input id="eprCode" value="${o.code}"></div><div class="fg"><label>仓库</label><select id="eprWhId">${whOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>日期</label><input id="eprDate" type="date" value="${o.date||now()}"></div><div class="fg"><label>制单人</label><select id="eprStId">${stOpts}</select></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="eprNote" value="${o.note||''}"></div></div>
    <h4 style="margin:8px 0">退货明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="eprDetail">${o.details.map(d=>{
      let gOpts=db.goods.map(g=>`<option value="${g.id}" ${g.id==d.goodsId?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
      return `<tr><td><select>${gOpts}</select></td><td><input type="number" value="${d.qty}" min="1" style="width:65px"></td><td><input type="number" value="${d.price}" step="0.01" style="width:85px"></td><td>¥${fmt(d.amt)}</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr>`;
    }).join('')}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('eprDetail');let r=t.insertRow();r.innerHTML='<td><select>${db.goods.map(g=>`<option value=\\'${g.id}\\'>${g.name}(${g.spec||''})</option>`).join('')}</select></td><td><input type=\\'number\\' value=\\'1\\' min=\\'1\\' style=\\'width:65px\\'></td><td><input type=\\'number\\' value=\\'0\\' step=\\'0.01\\' style=\\'width:85px\\'></td><td>-</td><td><button class=\\'btn btn-xs btn-d\\' onclick=\\'this.closest(\\\\'tr\\\\').remove()\\'>×</button></td>'">+ 添加明细</button>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updatePR(${id})">保存</button>`);
}
function updatePR(id){
  let db=GD(),o=db.purchaseReturn.find(x=>x.id==id);if(!o)return;
  o.code=$('eprCode').value;o.warehouseId=parseInt($('eprWhId').value);o.staffId=parseInt($('eprStId').value);o.date=$('eprDate').value;addNote(o,$('eprNote').value);
  let rows=$('eprDetail').rows,details=[],total=0;
  for(let r of rows){let sel=r.cells[0].querySelector('select');if(!sel)continue;let goodsId=parseInt(sel.value),qty=parseFloat(r.cells[1].querySelector('input').value)||0,price=parseFloat(r.cells[2].querySelector('input').value)||0;if(!qty)continue;let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt}
  o.details=details;o.totalAmt=total;
  saveD(db);clsModal();nav('purchase-return','采购退货');toast('已修改(草稿)');
}
function delPR(id){confirm('确认删除','删除将回退库存，确定？','delPR|'+id)}
function _xDelPR(id){var db=GD(),o=db.purchaseReturn.find(function(x){return x.id===id});
  if(o&&o.auditStatus==='已审核'){o.details.forEach(function(d){var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===o.warehouseId});if(inv)inv.qty=(inv.qty||0)+d.qty})}
  db.purchaseReturn=db.purchaseReturn.filter(function(x){return x.id!==id});clearRedDot(db,'purchaseReturn',id);saveD(db);nav('purchase-return','采购退货');toast('已删除');}
function purchasePay(c){var db=GD();if(!db.purchasePayments)db.purchasePayments=[];var list=db.purchasePayments;if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}var showAddBtn=!isAuditor()&&!isSupervisor()&&hasPerm("purchase-pay");c.innerHTML='<div class="tbar"><strong>付款结算</strong> <span class="spacer"></span>'+(showAddBtn?'<button class="btn btn-p" onclick="addPPay()">+ 新增付款</button>':'')+'</div>'+rTable(['单号','供应商','关联入库单','日期','金额','附件<span style="font-size:9px;color:#999"><br>点击查看</span>','备注','审核状态','操作员','审核员','操作'],list.map(function(x){var attHtml=(x.attachment?'<span class="tag tag-green">有附件</span>':'<span class="tag tag-gray">无</span>');var st=auditStatusTag(x);var btns='<button class="btn btn-xs btn-o" onclick="viewPPay('+x.id+')">查看</button> ';if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewPPay('+x.id+',true)">审核</button> ';if(!isAuditor()&&!isSupervisor()&&hasPerm("purchase-pay")&&(!x.auditStatus||x.auditStatus==='草稿'||x.auditStatus==='已驳回'||x.auditStatus==='已取消'))btns+='<button class="btn btn-xs btn-d" onclick="delPPay('+x.id+')">删除</button> ';btns+=auditBtns('purchasePay',x);return[x.code+redDotHtml('purchasePay',x.id),gSName(x.supplierId),x.purchaseInCode||'-',fd(x.date),'¥'+fmt(x.amount),attHtml,noteHtml(x),st,opTag(x.operatorId),opTag(x.auditorId),btns]}),11,[6])}
function addPPay(orderId){var db=GD();orderId=orderId||null;var code=gCode(BILL_PREFIX.purchasePay,'purchasePay');var piOpts=db.purchaseIn.filter(function(x){return x.auditStatus==='已审核'&&(x.totalAmt||0)>(x.paidAmt||0)}).map(function(x){return'<option value="'+x.id+'"'+(orderId===x.id?' selected':'')+'>'+x.code+' — '+gSName(x.supplierId)+' — ¥'+fmt(x.totalAmt-(x.paidAmt||0))+' 待付</option>'}).join('');if(!piOpts)piOpts='<option value="">暂无待付款的入库单</option>';modal('新增付款结算','<div class="frow"><div class="fg"><label>单号</label><input id="ppCode" value="'+code+'"></div><div class="fg"><label><span class=req>*</span>关联入库单</label><select id="ppPiId" onchange="updatePPayAmt(this.value)">'+piOpts+'</select></div></div><div class="frow"><div class="fg"><label><span class=req>*</span>本次付款金额</label><input id="ppAmt" type=number value=0 step=0.01></div><div class="fg"><label>日期</label><input id="ppDate" type=date value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>支付方式</label><select id="ppMethod"><option>银行转账</option><option>现金</option><option>微信</option><option>支付宝</option></select></div><div class="fg"><label>备注</label><input id="ppNote"></div></div><div style="font-size:11px;color:#999;margin-top:4px" id="ppUnpaid">未付金额：—</div><div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传发票附件(PDF)</strong><br><input type="file" id="ppFile" accept=".pdf" style="margin-top:8px"></div>','<button class=btn btn-o onclick=clsModal()>取消</button><button class=btn btn-p onclick=savePPay()>保存付款(草稿)</button>');updatePPayAmt()}function updatePPayAmt(v){var db=GD();if(!v){var sel=document.querySelector('#ppPiId');if(sel)v=sel.value}var pi=db.purchaseIn.find(function(x){return x.id===parseInt(v)});if(pi){var unpaid=(pi.totalAmt||0)-(pi.paidAmt||0);document.querySelector('#ppUnpaid').innerHTML='未付金额：¥'+fmt(unpaid);var inp=document.querySelector('#ppAmt');if(inp)inp.value=unpaid}}
function viewPPay(id){var db=GD(),o=db.purchasePayments.find(function(x){return x.id===id});if(!o)return;clearRedDot(db,'purchasePay',id);saveD(db);var auditFooter='';if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认此付款单审核通过？\',\'approve|purchasePay|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'purchasePay\','+id+')">驳回</button> '}var attHtml=o.attachment?'<div style="margin-top:12px;padding:8px;background:#fafafa;border-radius:6px"><strong>📎 发票附件: '+o.attachmentName+'</strong><br><iframe src="'+o.attachment+'" style="width:100%;height:400px;border:1px solid #ddd;margin-top:8px"></iframe></div>':'';modal('付款详情 - '+o.code,'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div><strong>单号:</strong> '+o.code+'</div><div><strong>供应商:</strong> '+gSName(o.supplierId)+'</div><div><strong>关联入库单:</strong> '+(o.purchaseInCode||'-')+'</div><div><strong>日期:</strong> '+fd(o.date)+'</div><div><strong>金额:</strong> ¥'+fmt(o.amount)+'</div><div><strong>支付方式:</strong> '+(o.payMethod||'银行转账')+'</div><div><strong>备注:</strong> '+noteHtml(o)+'</div><div><strong>审核状态:</strong> '+auditStatusTag(o)+'</div></div>'+attHtml,auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>')}
function savePPay(){
  if(!hasPerm("purchase-pay")){toast("无此页面操作权限");return}var db=GD(),amt=parseFloat(document.querySelector('#ppAmt').value)||0;if(!amt){toast('请输入金额');return}var piId=parseInt(document.querySelector('#ppPiId').value);var pi=db.purchaseIn.find(function(x){return x.id===piId});if(!pi){toast('请选择入库单');return}var unpaid=(pi.totalAmt||0)-(pi.paidAmt||0);if(amt>unpaid){toast('付款金额不能超过未付金额 ¥'+fmt(unpaid));return}var id=nid(db,'purchasePay');var att=null,attName=null;var fileInput=document.querySelector('#ppFile');if(fileInput&&fileInput.files&&fileInput.files[0]){var f=fileInput.files[0];att=URL.createObjectURL(f);attName=f.name}db.purchasePayments.push({id:id,code:document.querySelector('#ppCode').value,supplierId:pi.supplierId,purchaseInCode:pi.code,purchaseInId:piId,date:document.querySelector('#ppDate').value,amount:amt,payMethod:document.querySelector('#ppMethod').value,note:document.querySelector('#ppNote').value||'',attachment:att,attachmentName:attName||'',auditStatus:'草稿'});addRedDot(db,'purchasePay',id,'staff');saveD(db);clsModal();nav('purchase-pay','付款结算');toast('已保存(草稿)，请提交审核');updateAuditBadge()}
function _xDelPPay(id){var db=GD();var p=db.purchasePayments.find(function(x){return x.id===id});if(p&&p.purchaseInId&&p.auditStatus==='已审核'){var pi=db.purchaseIn.find(function(x){return x.id===p.purchaseInId});if(pi){pi.paidAmt=Math.max(0,(pi.paidAmt||0)-p.amount);if(pi.paidAmt<=0){pi.status='未付款';pi.paidAmt=0}else{pi.status=pi.paidAmt>=pi.totalAmt?'已付款':'部分付款'}}}db.purchasePayments=db.purchasePayments.filter(function(x){return x.id!==id});saveD(db);nav('purchase-pay','付款结算');toast('已删除')}
function delPPay(id){confirm('确认删除','确定删除？','delPPay|'+id)}
function purchaseIndex(c){let db=GD();c.innerHTML=`<h2 style="margin-bottom:12px">🛒 采购管理</h2><div class="stats"><div class="scard" onclick="nav('purchase-order','采购订单')"><div class="si" style="background:#e6f7ff">📝</div><div class="sinfo"><h4>采购订单</h4><div class="n">${(db.purchaseOrders||[]).length}</div><div class="sub">${(db.purchaseOrders||[]).filter(x=>x.auditStatus==='待审核').length}笔待审核</div></div></div><div class="scard" onclick="nav('purchase-in','采购入库')"><div class="si" style="background:#f6ffed">📥</div><div class="sinfo"><h4>采购入库</h4><div class="n">${(db.purchaseIn||[]).length}</div><div class="sub">¥${fmt((db.purchaseIn||[]).reduce((s,x)=>s+(x.totalAmt||0),0))}</div></div></div><div class="scard" onclick="nav('purchase-pay','付款结算')"><div class="si" style="background:#fff7e6">💳</div><div class="sinfo"><h4>付款结算</h4><div class="n">¥${fmt((db.purchasePayments||[]).reduce((s,x)=>s+(x.amount||0),0))}</div></div></div><div class="scard" onclick="nav('purchase-return','采购退货')"><div class="si" style="background:#fff2f0">📤</div><div class="sinfo"><h4>采购退货</h4><div class="n">${(db.purchaseReturn||[]).length}</div></div></div></div>`;}

// ==================== 销售管理 ====================
function salesIndex(c){let db=GD();c.innerHTML=`<h2 style="margin-bottom:12px">💰 销售管理</h2><div class="stats"><div class="scard" onclick="nav('sales-order','销售订单')"><div class="si" style="background:#e6f7ff">📝</div><div class="sinfo"><h4>销售订单</h4><div class="n">${(db.salesOrders||[]).length}</div><div class="sub">${(db.salesOrders||[]).filter(x=>x.auditStatus==='待审核').length}笔待审核</div></div></div><div class="scard" onclick="nav('sales-out','销售出库')"><div class="si" style="background:#f6ffed">📤</div><div class="sinfo"><h4>销售出库</h4><div class="n">${(db.salesOut||[]).length}</div><div class="sub">¥${fmt((db.salesOut||[]).reduce((s,x)=>s+(x.totalAmt||0),0))}</div></div></div><div class="scard" onclick="nav('sales-receive','收款结算')"><div class="si" style="background:#fff7e6">💰</div><div class="sinfo"><h4>收款结算</h4><div class="n">¥${fmt((db.salesReceipts||[]).reduce((s,x)=>s+(x.amount||0),0))}</div></div></div><div class="scard" onclick="nav('sales-return','销售退货')"><div class="si" style="background:#fff2f0">📥</div><div class="sinfo"><h4>销售退货</h4><div class="n">${(db.salesReturn||[]).length}</div></div></div></div>`;}

// ==================== 销售订单（复刻采购订单逻辑） ====================
function salesOrders(c){
  let db=GD();if(!db.salesOrders)db.salesOrders=[];
  let list=db.salesOrders;
  if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}
  var kw=(document.getElementById('soSearch')||{}).value||'';
  if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||gCName(x.customerId).indexOf(kw)>=0||gStName(x.staffId).indexOf(kw)>=0})}
  c.innerHTML=`<div class="tbar"><strong>销售订单</strong> <input placeholder="搜索单号/客户..." id="soSearch" onkeydown="if(event.key==='Enter')salesOrders(document.getElementById('pg'))"><button class="btn btn-o btn-sm" onclick="salesOrders(document.getElementById('pg'))">🔍</button><span class="spacer"></span>${hasPerm('sales-order')?`<button class="btn btn-p" onclick="addSO()">+ 新增</button>`:`<span style="color:#999;font-size:12px">无权限</span>`}</div>
    ${rTable(['单号','客户','日期','商品','数量','单价','金额','备注','附件<span style="font-size:9px;color:#999"><br>点击查看</span>','审核状态','出库','收款','业务员','操作员','审核员','操作'],list.map(function(x){
      let st=auditStatusTag(x);
      var allQty2=x.details?x.details.reduce(function(s,d){return s+d.qty},0):0;
      var outProgress2=(x.outQty||0)+'/'+allQty2;
      // 附件
      var attHtml='<span class="tag tag-gray">无附件</span>';
      if(x.attachments&&x.attachments.length){
        attHtml='<span class="tag tag-green" style="cursor:pointer" onclick="viewSOAtts('+x.id+')">有附件('+x.attachments.length+')</span>';
      }
      // 商品/数量/单价摘要
      var goodsSummary='',qtySummary='',priceSummary='';
      if(x.details&&x.details.length){
        goodsSummary=x.details.map(function(d){return gGName(d.goodsId)}).join('<br>');
        qtySummary=x.details.map(function(d){return d.qty}).join('<br>');
        priceSummary=x.details.map(function(d){return '¥'+fmt(d.price)}).join('<br>');
      }else{goodsSummary='-';qtySummary='-';priceSummary='-'}
      // 查询关联出库单的收款情况
      var soList2=db.salesOut.filter(function(so){return so.salesOrderId===x.id});
      var totalRcvd=0,totalSoAmt=0;
      soList2.forEach(function(so){totalRcvd+=(so.receivedAmt||0);totalSoAmt+=(so.totalAmt||0)});
      var recvProgress2=totalSoAmt>0?(totalRcvd+'/'+totalSoAmt):'-';
      let btns=`<button class="btn btn-xs btn-o" onclick="viewSO(${x.id})">查看</button> `;
      if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewSO('+x.id+',true)">审核</button> ';
      let atSt=x.auditStatus||'草稿';
      if(!isAuditor()&&!isSupervisor()&&hasPerm("sales-order")){
        if(atSt==='草稿')btns+='<button class="btn btn-xs btn-o" onclick="editSO('+x.id+')">修改</button> ';
        if(atSt==='已审核'&&(x.status==='已审核'||x.status==='部分出库'||!x.status||x.status==='待审核'))btns+='<button class="btn btn-xs btn-p" onclick="nav(\'sales-out\',\'销售出库\');setTimeout(function(){addSOut('+x.id+')},300)">转出库</button> ';
        if(atSt!=='待审核'&&atSt!=='已审核')btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'是否确认将此条销售订单删除？\',\'delSO|'+x.id+'\')">删除</button> ';
      }
      btns+=auditBtns('salesOrder',x);
      return[x.code+redDotHtml('salesOrder',x.id),gCName(x.customerId),fd(x.date),goodsSummary,qtySummary,priceSummary,'¥'+fmt(x.totalAmt),noteHtml(x),attHtml,st,outProgress2,recvProgress2,gStName(x.staffId),opTag(x.creatorId||x.operatorId),opTag(x.auditorId),btns];
    }),16,[7])}`;
}
function addSO(){
  let db=GD();
  let custOpts=db.customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  let goodsOpts=db.goods.map(g=>`<option value="${g.id}">${g.name}(${g.spec||''})</option>`).join('');
  let code=gCode(BILL_PREFIX.salesOrder,'salesOrder');
  modal('新增销售订单',`
    <div class="frow"><div class="fg"><label><span class="req">*</span>单号</label><input id="soCode" value="${code}"></div><div class="fg"><label><span class="req">*</span>客户</label><select id="soCustId">${custOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>日期</label><input id="soDate" type="date" value="${now()}"></div><div class="fg"><label>操作员</label><div style="padding:7px 10px;background:#f5f5f5;border:1px solid #e8e8e8;border-radius:6px;font-size:12px;color:#333;min-height:36px;display:flex;align-items:center">${currentUser?currentUser.accountId+'-'+currentUser.name:'未登录'}</div></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="soNote"></div></div>
    <h4 style="margin:8px 0">销售明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="soDetail"><tr><td><select>${goodsOpts}</select></td><td><input type="number" value="1" min="1" style="width:65px"></td><td><input type="number" value="0" step="0.01" style="width:85px"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr></tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('soDetail');let r=t.insertRow();r.innerHTML=t.rows[0].innerHTML">+ 添加明细</button>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveSO()">保存</button>`);
}
function saveSO(){
  if(!hasPerm("sales-order")){toast("无此页面操作权限");return}
  let db=GD(),customerId=parseInt($('soCustId').value);
  let rows=$('soDetail').rows,details=[],total=0;
  for(let r of rows){
    let goodsId=parseInt(r.cells[0].querySelector('select').value);
    let qty=parseFloat(r.cells[1].querySelector('input').value)||0;
    let price=parseFloat(r.cells[2].querySelector('input').value)||0;
    let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt;
  }
  if(!customerId||!details.length){toast('请填写必要信息');return}
  let id=nid(db,'salesOrder');
  // 上传附件
  var atts=[];var fileInput=document.getElementById('soFile');if(fileInput&&fileInput.files){for(var i=0;i<fileInput.files.length;i++){var f=fileInput.files[i];atts.push({name:f.name,url:URL.createObjectURL(f)})}}
  db.salesOrders.push({id,code:$('soCode').value,date:$('soDate').value,customerId,note:$('soNote').value||'',details,totalAmt:total,status:'草稿',outQty:0,auditStatus:'草稿',operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:'',attachments:atts});
  addRedDot(db,'salesOrder',id,'staff');
  saveD(db);clsModal();nav('sales-order','销售订单');toast('已创建(草稿)，请提交审核');updateAuditBadge();
}
function editSO(id){
  let db=GD(),o=db.salesOrders.find(x=>x.id==id);if(!o)return;
  let custOpts=db.customers.map(c=>`<option value="${c.id}" ${c.id==o.customerId?'selected':''}>${c.name}</option>`).join('');
  let stOpts=db.staff.map(function(s){return'<option value="'+s.id+'"'+(s.id===o.staffId?' selected':'')+'>'+s.name+'</option>'}).join('');
  modal('编辑销售订单 - '+o.code,`
    <div class="frow"><div class="fg"><label>单号</label><input id="esoCode" value="${o.code}"></div><div class="fg"><label>客户</label><select id="esoCustId">${custOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>日期</label><input id="esoDate" type="date" value="${o.date||now()}"></div><div class="fg"><label>操作员</label><div style="padding:7px 10px;background:#f5f5f5;border:1px solid #e8e8e8;border-radius:6px;font-size:12px;color:#333;min-height:36px;display:flex;align-items:center">${currentUser?currentUser.accountId+'-'+currentUser.name:'未登录'}</div></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="esoNote" value="${o.note||''}"></div></div>
    <h4 style="margin:8px 0">销售明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="esoDetail">${o.details.map(d=>{
      let gOpts=db.goods.map(g=>`<option value="${g.id}" ${g.id==d.goodsId?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
      return `<tr><td><select>${gOpts}</select></td><td><input type="number" value="${d.qty}" min="1" style="width:65px"></td><td><input type="number" value="${d.price}" step="0.01" style="width:85px"></td><td>¥${fmt(d.amt)}</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr>`;
    }).join('')}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('esoDetail');let r=t.insertRow();r.innerHTML='<td><select>${db.goods.map(g=>`<option value=\\'${g.id}\\'>${g.name}(${g.spec||''})</option>`).join('')}</select></td><td><input type=\\'number\\' value=\\'1\\' min=\\'1\\' style=\\'width:65px\\'></td><td><input type=\\'number\\' value=\\'0\\' step=\\'0.01\\' style=\\'width:85px\\'></td><td>-</td><td><button class=\\'btn btn-xs btn-d\\' onclick=\\'this.closest(\\\\'tr\\\\').remove()\\'>×</button></td>'">+ 添加明细</button>
    <div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传附件(图片/PDF)</strong><br><input type="file" id="esoFile" accept="image/*,.pdf" multiple style="margin-top:8px"></div>
    ${o.attachments&&o.attachments.length?'<div style="margin-top:6px;font-size:12px;color:#666">已有附件: '+o.attachments.map(function(a,i){return'<span style="display:inline-block;margin:2px;padding:2px 8px;background:#f0f0f0;border-radius:4px">'+a.name+' <span style="cursor:pointer;color:#ff4d4f" onclick="delSOAtt('+id+','+i+')">×</span></span>'}).join(' ')+'</div>':''}`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateSO(${id})">保存</button>`);
}
function updateSO(id){
  let db=GD(),o=db.salesOrders.find(x=>x.id==id);if(!o)return;
  o.code=$('esoCode').value;o.customerId=parseInt($('esoCustId').value);o.date=$('esoDate').value;addNote(o,$('esoNote').value);
  let rows=$('esoDetail').rows,details=[],total=0;
  for(let r of rows){let sel=r.cells[0].querySelector('select');if(!sel)continue;let goodsId=parseInt(sel.value),qty=parseFloat(r.cells[1].querySelector('input').value)||0,price=parseFloat(r.cells[2].querySelector('input').value)||0;if(!qty)continue;let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt}
  o.details=details;o.totalAmt=total;
  // 上传新附件（追加到已有附件）
  if(!o.attachments)o.attachments=[];
  var fileInput=document.getElementById('esoFile');if(fileInput&&fileInput.files){for(var i=0;i<fileInput.files.length;i++){var f=fileInput.files[i];o.attachments.push({name:f.name,url:URL.createObjectURL(f)})}}
  saveD(db);clsModal();nav('sales-order','销售订单');toast('已修改(草稿)');
}
function delSOAtt(orderId,attIdx){
  var db=GD(),o=db.salesOrders.find(function(x){return x.id===orderId});if(!o||!o.attachments)return;
  o.attachments.splice(attIdx,1);saveD(db);
  clsModal();editSO(orderId);
}
function viewSO(id){
  let db=GD(),o=db.salesOrders.find(x=>x.id==id);if(!o)return;
  if(isStaff()&&o.auditStatus==='已审核'){clearRedDot(db,'salesOrder',id);saveD(db)}
  // 计算每个明细行已转出库数量
  var soList=db.salesOut.filter(function(x){return x.salesOrderId===id&&x.auditStatus==='已审核'});
  var detailOutQty={};
  soList.forEach(function(so){so.details.forEach(function(d){detailOutQty[d.goodsId]=(detailOutQty[d.goodsId]||0)+d.qty})});
  var auditFooter='';
  if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){
    auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认将此条销售订单审核通过？\',\'approve|salesOrder|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'salesOrder\','+id+')">驳回</button> ';
  }
  modal('销售订单详情 - '+o.code,`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div><strong>客户:</strong> ${gCName(o.customerId)}</div><div><strong>日期:</strong> ${fd(o.date)}</div><div><strong>状态:</strong> ${o.status||'待审核'}</div>
      <div><strong>业务员:</strong> ${gStName(o.staffId)}</div><div><strong>备注:</strong> ${noteHtml(o)}</div><div><strong>操作员:</strong> ${opTag(o.creatorId||o.operatorId)}</div><div><strong>审核员:</strong> ${opTag(o.auditorId)}</div></div>
    <table><thead><tr><th>商品</th><th>订单数量</th><th>已出库</th><th>未出库</th><th>单价</th><th>金额</th></tr></thead>
    <tbody>${o.details.map(function(d){var outQ=detailOutQty[d.goodsId]||0;var unOut=d.qty-outQ;return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td><span style="color:#52c41a">'+outQ+'</span></td><td><span style="color:'+(unOut>0?'#ff4d4f':'#999')+'">'+unOut+'</span></td><td>¥'+fmt(d.price)+'</td><td>¥'+fmt(d.amt)+'</td></tr>'}).join('')}</tbody></table>
    <p style="margin-top:8px"><strong>合计: ¥${fmt(o.totalAmt)} | 已出库: ${o.outQty||0}件 | 未出库: ${o.details.reduce(function(s,d){return s+d.qty},0)-(o.outQty||0)}件</strong></p>
    ${o.attachments&&o.attachments.length?'<p><strong>📎 附件:</strong> <span class="tag tag-green" style="cursor:pointer" onclick="viewSOAtts('+id+')">查看('+o.attachments.length+'个)</span></p>':''}
    ${soList.length>0?'<div style="margin-top:8px;padding:8px;background:#fafafa;border-radius:6px"><strong>📋 已审核出库单:</strong><table style="width:100%;font-size:11px"><thead><tr><th>出库单号</th><th>仓库</th><th>出库数量</th><th>日期</th></tr></thead><tbody>'+soList.map(function(so){return'<tr><td>'+so.code+'</td><td>'+gWName(so.warehouseId)+'</td><td>'+so.details.reduce(function(s,d){return s+d.qty},0)+'件</td><td>'+fd(so.date)+'</td></tr>'}).join('')+'</tbody></table></div>':''}`,
    auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
// ==================== 仓库管理 ====================
function salesOut(c){
  let db=GD();if(!db.salesOut)db.salesOut=[];
  let list=db.salesOut;
  if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}
  var kw=(document.getElementById('soSearch')||{}).value||'';
  if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||gCName(x.customerId).indexOf(kw)>=0||gWName(x.warehouseId).indexOf(kw)>=0})}
  c.innerHTML=`<div class="tbar"><strong>销售出库</strong> <input placeholder="搜索单号/客户/仓库..." id="soSearch" onkeydown="if(event.key==='Enter')salesOut(document.getElementById('pg'))"><button class="btn btn-o btn-sm" onclick="salesOut(document.getElementById('pg'))">🔍</button><span class="spacer"></span>${hasPerm('sales-out')?`<button class="btn btn-p" onclick="addSOut()">+ 新增出库</button>`:`<span style="color:#999;font-size:12px">无权限</span>`}</div>
    ${rTable(['单号','客户','仓库','日期','金额','出库进度','收款进度','审核状态','业务员','备注','操作员','审核员','操作'],list.map(function(x){
      var allQty=x.details?x.details.reduce(function(s,d){return s+d.qty},0):0;
      var outProgress=(x.status==='未收款'||x.status==='部分收款'||x.status==='已收款')?allQty+'/'+allQty:'0/'+allQty;
      var rcvdAmt=x.receivedAmt||0;
      var recvProgress=(x.status==='已收款'||x.status==='部分收款')?rcvdAmt+'/'+(x.totalAmt||0):(x.auditStatus==='已审核'?'0/'+(x.totalAmt||0):'-');
      let st=auditStatusTag(x);
      let btns=`<button class="btn btn-xs btn-o" onclick="viewSOut(${x.id})">查看</button> `;
      if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewSOut('+x.id+',true)">审核</button> ';
      let atSt=x.auditStatus||'草稿';
      if(!isAuditor()&&!isSupervisor()&&hasPerm("sales-out")){
        if(atSt!=='待审核'&&atSt!=='已审核')btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'删除将回退库存，确定？\',\'delSO2|'+x.id+'\')">删除</button> ';
        if(atSt==='已审核'&&(x.status==='未收款'||x.status==='部分收款'))btns+='<button class="btn btn-xs btn-pay" onclick="nav(\'sales-receive\',\'收款结算\');setTimeout(function(){addSRv('+x.id+')},300)">去收款</button> ';
      }
      btns+=auditBtns('salesOut',x);
      return[x.code+redDotHtml('salesOut',x.id),gCName(x.customerId),gWName(x.warehouseId),fd(x.date),'¥'+fmt(x.totalAmt),
        outProgress,recvProgress,st,gStName(x.staffId),noteHtml(x),opTag(x.operatorId),opTag(x.auditorId),btns];
    }),12,7)}`;
}
function addSOut(orderId){
  orderId=orderId||null;
  let db=GD();
  var o=orderId?db.salesOrders.find(function(x){return x.id===orderId}):null;
  let custOpts=db.customers.map(c=>`<option value="${c.id}" ${o&&c.id===o.customerId?'selected':''}>${c.name}</option>`).join('');
  let whOpts=db.warehouses.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  let goodsOpts=db.goods.map(g=>`<option value="${g.id}">${g.name}(${g.spec||''})</option>`).join('');
  let code=gCode(BILL_PREFIX.salesOut,'salesOut');
  // 关联销售订单时计算已出库量
  var detailOutQty2={};
  if(o){var soList=db.salesOut.filter(function(x){return x.salesOrderId===orderId});soList.forEach(function(so){so.details.forEach(function(d){detailOutQty2[d.goodsId]=(detailOutQty2[d.goodsId]||0)+d.qty})})}
  var orderInfo=o?(' — 来自订单: '+o.code):'';
  modal('新增销售出库'+orderInfo,`
    <div class="frow"><div class="fg"><label><span class="req">*</span>单号</label><input id="so2Code" value="${code}"></div><div class="fg"><label><span class="req">*</span>客户</label><select id="so2CustId">${custOpts}</select>${o?'<input type="hidden" id="so2OrderId" value="'+orderId+'">':''}</div></div>
    <div class="frow"><div class="fg"><label><span class="req">*</span>仓库</label><select id="so2WhId" onchange="refreshSOutBatchOpts()">${whOpts}</select></div><div class="fg"><label>日期</label><input id="so2Date" type="date" value="${now()}"></div></div>
    <div class="frow"><div class="fg"><label>业务员</label><select id="so2StId">${db.staff.map(s=>`<option value="${s.id}" ${o&&s.id===o.staffId?'selected':''}>${s.name}</option>`).join('')}</select></div><div class="fg"><label>备注</label><input id="so2Note" value="${o?o.note||'':''}"></div></div>
    <h4 style="margin:8px 0">出库明细${o?' (来自订单)':''}</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th>${o?'<th>订单数量</th><th>已出库</th><th>未出库</th>':''}<th style="width:70px">本次出库</th><th style="width:90px">单价</th><th>仓储批次</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="so2Detail">${o?o.details.map(function(d){var outQ=detailOutQty2[d.goodsId]||0;var unOut=d.qty-outQ;return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td>'+outQ+'</td><td><span style="color:'+(unOut>0?'#faad14':'#52c41a')+'">'+unOut+'</span></td><td><span class="m-lbl">数量</span><input type="number" value="'+(unOut>0?unOut:0)+'" min="0" max="'+unOut+'" style="width:55px" data-gid="'+d.goodsId+'"></td><td><span class="m-lbl">单价</span><input type="number" value="'+d.price+'" step="0.01" style="width:65px"></td><td><select style="min-width:130px"><option value="">自动(FIFO)</option></select></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr>'}).join(''):'<tr><td><select onchange="refreshSOutBatchOpts()">'+goodsOpts+'</select></td><td><span class="m-lbl">数量</span><input type="number" value="1" min="1" style="width:55px"></td><td><span class="m-lbl">单价</span><input type="number" value="0" step="0.01" style="width:65px"></td><td><select style="min-width:130px"><option value="">自动(FIFO)</option></select></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr>'}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="var t=$('so2Detail');var fr=t.rows[0];var nr=t.insertRow();nr.innerHTML=fr.innerHTML;refreshSOutBatchOpts()">+ 添加明细</button>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="window._saveSOut()">保存</button>`);
  window._saveSOut=saveSOut;
  refreshSOutBatchOpts();
}
function refreshSOutBatchOpts(){
  var db=GD();var whIdEl=$('so2WhId');var whId=whIdEl?parseInt(whIdEl.value):null;if(!whId)return;
  var rows=$('so2Detail').rows;
  for(var r=0;r<rows.length;r++){
    // 订单模式: goodsId 来自 data-gid 属性; 独立模式: goodsId 来自 select
    var gid=null;
    var firstCell=rows[r].cells[0];
    var sel=firstCell.querySelector('select');
    if(sel){gid=parseInt(sel.value)}
    else{
      var gidInput=rows[r].cells[4]?rows[r].cells[4].querySelector('input'):null;
      if(gidInput&&gidInput.dataset.gid)gid=parseInt(gidInput.dataset.gid);
    }
    if(!gid)continue;
    // 订单模式批次列在 cells[6], 独立模式在 cells[3]
    var isOrder=!!(rows[r].cells.length>6);
    var batchCol=isOrder?6:3;
    var batchSel=rows[r].cells[batchCol].querySelector('select');if(!batchSel)continue;
    var curVal=batchSel.value;
    var inv=db.inventory.find(function(x){return x.goodsId===gid&&x.warehouseId===whId});
    var opts='<option value="">自动(FIFO)</option>';
    if(inv&&inv.batches&&inv.batches.length>0){
      inv.batches.forEach(function(b,bi){
        var rem=b.remaining!=null?b.remaining:b.qty;
        if(rem<=0)return;
        if(!b.batchCode){b.batchCode='BTH-'+inv.goodsId+'-'+inv.warehouseId+'-'+(bi+1)}
        opts+='<option value="'+bi+'" data-rem="'+rem+'">'+b.batchCode+' | 余'+rem+'件</option>';
      });
    }
    batchSel.innerHTML=opts;
    if(curVal)batchSel.value=curVal;
  }
}
function saveSOut(){
  if(!hasPerm("sales-out")){toast("无此页面操作权限");return}
  var db=GD(),customerId=parseInt($('so2CustId').value),warehouseId=parseInt($('so2WhId').value),staffId=parseInt($('so2StId').value);
  var orderIdEl=$('so2OrderId');var orderId=orderIdEl?parseInt(orderIdEl.value):null;
  var o2=orderId?db.salesOrders.find(function(x){return x.id===orderId}):null;
  var rows=$('so2Detail').rows,details=[],total=0,totalQty=0;
  for(var r=0;r<rows.length;r++){
    var goodsId=0;
    // 读取当前行商品 ID
    if(o2){
      var gidInput=rows[r].cells[4]?rows[r].cells[4].querySelector('input'):null;
      goodsId=gidInput?parseInt(gidInput.dataset.gid):0;
    }else{
      var sel=rows[r].cells[0].querySelector('select');
      if(!sel)continue;goodsId=parseInt(sel.value);
    }
    var qty=0,price=0;
    if(o2){
      qty=parseFloat(rows[r].cells[4].querySelector('input').value)||0;
      price=parseFloat(rows[r].cells[5].querySelector('input').value)||0;
    }else{
      qty=parseFloat(rows[r].cells[1].querySelector('input').value)||0;
      price=parseFloat(rows[r].cells[2].querySelector('input').value)||0;
    }
    if(!qty||!goodsId)continue;
    // 库存校验
    var inv=db.inventory.find(function(x){return x.goodsId===goodsId&&x.warehouseId===warehouseId});
    var avail=(inv&&inv.qty)?inv.qty:0;
    if(qty>avail){toast(goodsId+'号商品库存不足，仓库现有'+avail+'件，出库'+qty+'件超限');return}
    // 关联订单时校验不超未转出量
    if(o2){
      var od2=o2.details.find(function(dd){return dd.goodsId===goodsId});
      if(od2){
        var alreadyOut=0;
        var soAll=db.salesOut.filter(function(x){return x.salesOrderId===orderId});
        soAll.forEach(function(sx){sx.details.forEach(function(dx){if(dx.goodsId===goodsId)alreadyOut+=dx.qty})});
        var maxOut=od2.qty-alreadyOut;
        if(qty>maxOut){toast('商品'+gGName(goodsId)+'出库数量超限，订单'+od2.qty+'件，已出库'+alreadyOut+'件，最多再出'+maxOut+'件');return}
      }
    }
    // 批次选择
    var batchIdx=null;
    var batchCol=o2?6:3;
    var batchSel=rows[r].cells[batchCol].querySelector('select');
    if(batchSel&&batchSel.value!==''){batchIdx=parseInt(batchSel.value)}
    // 校验：如果选择了指定批次，出库数量不能超过该批次剩余件数
    if(batchIdx!=null&&inv&&inv.batches&&inv.batches[batchIdx]){
      var batchRem=inv.batches[batchIdx].remaining!=null?inv.batches[batchIdx].remaining:inv.batches[batchIdx].qty;
      if(qty>batchRem){toast('仓储批次 '+inv.batches[batchIdx].batchCode+' 剩余仅'+batchRem+'件，出库'+qty+'件超限，请减少数量或选择其他批次');return}
    }
    var amt=qty*price;details.push({goodsId:goodsId,qty:qty,price:price,amt:amt,batchIdx:batchIdx});total+=amt;totalQty+=qty;
  }
  if(!customerId||!details.length){toast('请填写必要信息');return}
  var id=nid(db,'salesOut');
  db.salesOut.push({id:id,code:$('so2Code').value,date:$('so2Date').value,customerId:customerId,warehouseId:warehouseId,staffId:staffId,note:$('so2Note').value||'',details:details,totalAmt:total,status:'未收款',auditStatus:'草稿',salesOrderId:orderId||null,operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:''});
  // 出库进度不再在保存时更新，统一在审核通过时更新
  addRedDot(db,'salesOut',id,'staff');
  saveD(db);clsModal();nav('sales-out','销售出库');toast('已创建(草稿)，请提交审核');updateAuditBadge();
}
function viewSOut(id){
  let db=GD(),o=db.salesOut.find(x=>x.id==id);if(!o)return;
  if(isStaff()&&o.auditStatus==='已审核'){clearRedDot(db,'salesOut',id);saveD(db)}
  var auditFooter='';
  if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){
    auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认将此条销售出库审核通过？\',\'approve|salesOut|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'salesOut\','+id+')">驳回</button> ';
  }
  modal('销售出库详情 - '+o.code,`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div><strong>客户:</strong> ${gCName(o.customerId)}</div><div><strong>仓库:</strong> ${gWName(o.warehouseId)}</div><div><strong>日期:</strong> ${fd(o.date)}</div>
      <div><strong>状态:</strong> ${o.status||'未收款'}</div><div><strong>业务员:</strong> ${gStName(o.staffId)}</div><div><strong>备注:</strong> ${noteHtml(o)}</div>
      <div><strong>操作员:</strong> ${opTag(o.creatorId||o.operatorId)}</div><div><strong>审核员:</strong> ${opTag(o.auditorId)}</div></div>
    <table class="edt-tbl"><thead><tr><th>商品</th><th>数量</th><th>仓储批次</th><th>单价</th><th>金额</th></tr></thead>
    <tbody>${o.details.map(function(d,di){var batchInfo='-';if(o.auditStatus==='已审核'){var bt=findBatchesByCode(o.code);for(var bi=0;bi<bt.length;bi++){var b=bt[bi];var mo=b._matchedOut;if(mo&&mo.salesOutCode===o.code&&b.goodsId===d.goodsId){batchInfo=b.batchCode||'BTH-';break}}if(batchInfo==='-'&&d.batchIdx!=null){var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===o.warehouseId});if(inv&&inv.batches&&inv.batches[d.batchIdx]){batchInfo=inv.batches[d.batchIdx].batchCode||('BTH-'+d.goodsId+'-'+o.warehouseId+'-'+(d.batchIdx+1))}}}return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td><b>'+batchInfo+'</b></td><td>¥'+fmt(d.price)+'</td><td>¥'+fmt(d.amt)+'</td></tr>'}).join('')}</tbody></table>
    <p style="margin-top:8px"><strong>合计: ¥${fmt(o.totalAmt)}</strong></p>
    ${o.auditStatus==='已审核'?(function(){var bt=findBatchesByCode(o.code);return bt.length>0?'<div style="margin-top:12px;padding:8px;background:#fafafa;border-radius:6px"><strong>📋 关联批次 ('+bt.length+'批):</strong>'+renderBatchGroups(bt)+'</div>':'';})():'<p style="color:#aaa;font-size:11px">（审核通过后将显示批次链路）</p>'}`,
    auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function editSO2(id){
  let db=GD(),o=db.salesOut.find(x=>x.id==id);if(!o)return;
  let custOpts=db.customers.map(c=>`<option value="${c.id}" ${c.id==o.customerId?'selected':''}>${c.name}</option>`).join('');
  let whOpts=db.warehouses.map(w=>`<option value="${w.id}" ${w.id==o.warehouseId?'selected':''}>${w.name}</option>`).join('');
  let stOpts=db.staff.map(function(s){return'<option value="'+s.id+'"'+(s.id===o.staffId?' selected':'')+'>'+s.name+'</option>'}).join('');
  modal('编辑销售出库 - '+o.code,`
    <div class="frow"><div class="fg"><label>单号</label><input id="eso2Code" value="${o.code}"></div><div class="fg"><label>客户</label><select id="eso2CustId">${custOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>仓库</label><select id="eso2WhId">${whOpts}</select></div><div class="fg"><label>日期</label><input id="eso2Date" type="date" value="${o.date||now()}"></div></div>
    <div class="frow"><div class="fg"><label>业务员</label><select id="eso2StId">${stOpts}</select></div><div class="fg"><label>备注</label><input id="eso2Note" value="${o.note||''}"></div></div>
    <h4 style="margin:8px 0">出库明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="eso2Detail">${o.details.map(d=>{
      let gOpts=db.goods.map(g=>`<option value="${g.id}" ${g.id==d.goodsId?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
      return `<tr><td><select>${gOpts}</select></td><td><input type="number" value="${d.qty}" min="1" style="width:65px"></td><td><input type="number" value="${d.price}" step="0.01" style="width:85px"></td><td>¥${fmt(d.amt)}</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr>`;
    }).join('')}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('eso2Detail');let r=t.insertRow();r.innerHTML='<td><select>${db.goods.map(g=>`<option value=\\'${g.id}\\'>${g.name}(${g.spec||''})</option>`).join('')}</select></td><td><input type=\\'number\\' value=\\'1\\' min=\\'1\\' style=\\'width:65px\\'></td><td><input type=\\'number\\' value=\\'0\\' step=\\'0.01\\' style=\\'width:85px\\'></td><td>-</td><td><button class=\\'btn btn-xs btn-d\\' onclick=\\'this.closest(\\\\'tr\\\\').remove()\\'>×</button></td>'">+ 添加明细</button>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateSOut(${id})">保存</button>`);
}
function updateSOut(id){
  let db=GD(),o=db.salesOut.find(x=>x.id==id);if(!o)return;
  o.code=$('eso2Code').value;o.customerId=parseInt($('eso2CustId').value);o.warehouseId=parseInt($('eso2WhId').value);o.staffId=parseInt($('eso2StId').value);o.date=$('eso2Date').value;addNote(o,$('eso2Note').value);
  let rows=$('eso2Detail').rows,details=[],total=0;
  for(let r of rows){let sel=r.cells[0].querySelector('select');if(!sel)continue;let goodsId=parseInt(sel.value),qty=parseFloat(r.cells[1].querySelector('input').value)||0,price=parseFloat(r.cells[2].querySelector('input').value)||0;if(!qty)continue;let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt}
  o.details=details;o.totalAmt=total;
  saveD(db);clsModal();nav('sales-out','销售出库');toast('已修改(草稿)');
}
function delSO2(id){confirm('确认删除','删除将回退库存，确定？','delSO2|'+id)}
function _xDelSOut(id){var db=GD(),o=db.salesOut.find(function(x){return x.id===id});
  if(o&&o.auditStatus==='已审核'){o.details.forEach(function(d){var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===o.warehouseId});if(inv)inv.qty=(inv.qty||0)+d.qty});
    if(o.salesOrderId){var so=db.salesOrders.find(function(x){return x.id===o.salesOrderId});if(so){so.outQty=Math.max(0,(so.outQty||0)-o.details.reduce(function(s,d){return s+d.qty},0));so.status=so.outQty<=0?'已审核':(so.outQty>=so.details.reduce(function(s,d){return s+d.qty},0)?'已完成':'部分出库')}}}
  db.salesOut=db.salesOut.filter(function(x){return x.id!==id});clearRedDot(db,'salesOut',id);saveD(db);nav('sales-out','销售出库');toast('已删除');}
// ==================== 销售退货（复刻采购退货逻辑） ====================
// 销售退货：已出库商品退回入库 → 审核通过后增加库存
function salesReturn(c){
  let db=GD();if(!db.salesReturn)db.salesReturn=[];
  let list=db.salesReturn;
  if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}
  var kw=(document.getElementById('srSearch')||{}).value||'';
  if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0})}
  c.innerHTML=`<div class="tbar"><strong>销售退货</strong> <input placeholder="搜索单号..." id="srSearch" onkeydown="if(event.key==='Enter')salesReturn(document.getElementById('pg'))"><button class="btn btn-o btn-sm" onclick="salesReturn(document.getElementById('pg'))">🔍</button><span class="spacer"></span>${hasPerm('sales-return')?`<button class="btn btn-p" onclick="addSR()">+ 新增退货</button>`:`<span style="color:#999;font-size:12px">无权限</span>`}</div>
    ${rTable(['单号','仓库','日期','金额','审核状态','业务员','备注','操作员','审核员','操作'],list.map(function(x){
      let st=auditStatusTag(x);
      let btns=`<button class="btn btn-xs btn-o" onclick="viewSR(${x.id})">查看</button> `;
      if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewSR('+x.id+',true)">审核</button> ';
      let atSt=x.auditStatus||'草稿';
      if(!isAuditor()&&!isSupervisor()&&hasPerm("sales-return")){
        if(atSt!=='待审核'&&atSt!=='已审核')btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'删除将扣除退回库存，确定？\',\'delSR|'+x.id+'\')">删除</button> ';
      }
      btns+=auditBtns('salesReturn',x);
      return[x.code+redDotHtml('salesReturn',x.id),gWName(x.warehouseId),fd(x.date),'¥'+fmt(x.totalAmt),st,gStName(x.staffId),noteHtml(x),opTag(x.operatorId),opTag(x.auditorId),btns];
    }),10,[6])}`;;
}
function addSR(){
  var db=GD(),code=gCode(BILL_PREFIX.salesReturn,'salesReturn');
  // 构建所有仓库中有可退批次的数据（已出库且未被退完的批次）
  var batchData={};
  db.inventory.forEach(function(inv){
    if(!inv.batches||!inv.batches.length)return;
    inv.batches.forEach(function(b){
      (b.outRecords||[]).forEach(function(o){
        if(o.type==='采购退货'||o.type==='销售退货')return;
        var canReturn=o.qty;
        if(canReturn<=0)return;
        if(!batchData[inv.goodsId])batchData[inv.goodsId]=[];
        batchData[inv.goodsId].push({warehouseId:inv.warehouseId,warehouseName:gWName(inv.warehouseId),salesOutCode:o.salesOutCode||'出库单',salesOrderCode:o.salesOrderCode||'',avail:canReturn,price:b.price||0});
      });
    });
  });
  var buildBatchOptions=function(gid){
    var arr=batchData[gid]||[];
    return arr.map(function(a,i){return'<option value="'+i+'" data-wh="'+a.warehouseId+'" data-price="'+a.price+'" data-max="'+a.avail+'">'+a.warehouseName+' | '+a.salesOutCode+' | '+a.avail+'件</option>'}).join('');
  };
  var goodsOpts=Object.keys(batchData).map(function(gid){var g=db.goods.find(function(x){return x.id===parseInt(gid)});if(!g)return'';return'<option value="'+gid+'">'+g.name+'('+(g.spec||'')+')</option>'}).join('');
  modal('新增销售退货','<div class="frow"><div class="fg"><label><span class=req>*</span>单号</label><input id="srCode" value="'+code+'"></div><div class="fg"><label>日期</label><input id="srDate" type=date value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>业务员</label><select id="srStId">'+db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')+'</select></div><div class="fg"><label>备注</label><input id="srNote"></div></div><h4 style="margin:8px 0">退货明细</h4><table class="edt-tbl"><thead><tr><th>商品</th><th>退货批次(出库单)</th><th>仓库</th><th>可用量</th><th style="width:70px">退货数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead><tbody id="srDetail"><tr><td><select onchange="updateSRRowBatch(this)">'+goodsOpts+'</select></td><td><select id="sSel1" onchange="updateSRRowWh(this)">'+buildBatchOptions(Object.keys(batchData)[0]||'')+'</select></td><td><select id="sWh1">'+db.warehouses.map(function(w){return'<option value="'+w.id+'">'+w.name+'</option>'}).join('')+'</select></td><td><span class=srAvail>—</span></td><td><input type=number value=0 min=1 style="width:65px" data-max="0" oninput="updateSRRowAmt(this)"></td><td><input type=number value=0 step=0.01 style="width:85px" data-price="0" oninput="updateSRRowAmt(this)"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr></tbody></table><button class="btn btn-xs btn-o" style="margin-top:6px" onclick="var t=document.getElementById(\'srDetail\');var nr=t.rows[0].cloneNode(true);updateSRRowIndex(nr,t.rows.length);t.appendChild(nr)">+ 添加明细</button>','<button class=btn btn-o onclick=clsModal()>取消</button><button class=btn btn-p onclick=saveSR()>保存</button>');updateSRRowBatch(document.querySelector('#srDetail select'))}
function updateSRRowIndex(clonedRow,idx){
  var sel1=clonedRow.cells[1].querySelector('select');sel1.id='sSel'+idx;
  var sel2=clonedRow.cells[2].querySelector('select');sel2.id='sWh'+idx;
  clonedRow.cells[3].textContent='—';clonedRow.cells[4].querySelector('input').value=0;clonedRow.cells[5].querySelector('input').value=0;clonedRow.cells[6].textContent='-';
}
function updateSRRowBatch(sel){
  var r=sel.closest('tr');var gid=sel.value;var sel1=r.cells[1].querySelector('select');
  var invs=GD().inventory;
  var opts='';invs.forEach(function(inv){if(inv.goodsId!==parseInt(gid)||!inv.batches)return;inv.batches.forEach(function(b){(b.outRecords||[]).forEach(function(o){if(o.type==='采购退货'||o.type==='销售退货')return;opts+='<option value="" data-wh="'+inv.warehouseId+'" data-price="'+(b.price||0)+'" data-max="'+o.qty+'">'+gWName(inv.warehouseId)+' | '+(o.salesOutCode||'出库单')+' | '+o.qty+'件</option>'})})});sel1.innerHTML=opts||'<option>无可退批次</option>';
  if(opts){var o0=sel1.options[0];r.cells[3].textContent=o0.getAttribute('data-max')||0;r.cells[4].querySelector('input').setAttribute('data-max',o0.getAttribute('data-max'));r.cells[5].querySelector('input').setAttribute('data-price',o0.getAttribute('data-price'));updateSRRowWh(sel1)}else{r.cells[3].textContent='—'}
}
function updateSRRowWh(sel1){var r=sel1.closest('tr');var opt=sel1.options[sel1.selectedIndex];var wh=opt.getAttribute('data-wh');var max=opt.getAttribute('data-max');r.cells[3].textContent=max||'—';r.cells[4].querySelector('input').setAttribute('data-max',max);r.cells[5].querySelector('input').setAttribute('data-price',opt.getAttribute('data-price'));var whSel=r.cells[2].querySelector('select');var invs=GD().inventory;var gidSel=r.cells[0].querySelector('select');var gid=gidSel.value;var whSet={};invs.forEach(function(inv){if(inv.goodsId===parseInt(gid))whSet[inv.warehouseId]=gWName(inv.warehouseId)});whSel.innerHTML=Object.keys(whSet).map(function(wid){return'<option value="'+wid+'"'+(wid===wh?' selected':'')+'>'+whSet[wid]+'</option>'}).join('')}
function updateSRRowAmt(inp){var r=inp.closest('tr');var qty=parseFloat(r.cells[4].querySelector('input').value)||0;var max=parseInt(r.cells[4].querySelector('input').getAttribute('data-max'))||0;var price=parseFloat(r.cells[5].querySelector('input').value)||0;if(qty>max){r.cells[4].querySelector('input').value=max;qty=max}var amt=qty*price;r.cells[6].textContent=fmt(amt)}
function saveSR(){
  if(!hasPerm("sales-return")){toast("无此页面操作权限");return}
  var db=GD(),staffId=parseInt(document.querySelector('#srStId').value);
  var rows=document.querySelector('#srDetail').rows,details=[],total=0,warehouseId=null;
  for(var r=0;r<rows.length;r++){
    var selG=rows[r].cells[0].querySelector('select');if(!selG)continue;
    var goodsId=parseInt(selG.value);var qty=parseFloat(rows[r].cells[4].querySelector('input').value)||0;var price=parseFloat(rows[r].cells[5].querySelector('input').value)||0;if(!qty)continue;
    var max=parseInt(rows[r].cells[4].querySelector('input').getAttribute('data-max'))||0;if(qty>max){toast('商品退货数量超限，最大可退'+max+'件');return}
    var whId=parseInt(rows[r].cells[2].querySelector('select').value);
    if(!warehouseId)warehouseId=whId;
    var amt=qty*price;details.push({goodsId:goodsId,qty:qty,price:price,amt:amt});total+=amt
  }
  if(!details.length){toast('请填写明细');return}
  var id=nid(db,'salesReturn');
  db.salesReturn.push({id:id,code:document.querySelector('#srCode').value,date:document.querySelector('#srDate').value,warehouseId:warehouseId,staffId:staffId,note:document.querySelector('#srNote').value||'',details:details,totalAmt:total,auditStatus:'草稿',operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:''});
  addRedDot(db,'salesReturn',id,'staff');
  saveD(db);clsModal();nav('sales-return','销售退货');toast('已创建(草稿)，请提交审核');updateAuditBadge();
}
function viewSR(id){
  let db=GD(),o=db.salesReturn.find(x=>x.id==id);if(!o)return;
  clearRedDot(db,'salesReturn',id);saveD(db) // 查看即消红点
  if(isStaff()&&o.auditStatus==='已审核'){}
  var auditFooter='';
  if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){
    auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认将此条销售退货审核通过？\',\'approve|salesReturn|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'salesReturn\','+id+')">驳回</button> ';
  }
  modal('销售退货详情 - '+o.code,`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div><strong>仓库:</strong> ${gWName(o.warehouseId)}</div><div><strong>日期:</strong> ${fd(o.date)}</div>
      <div><strong>备注:</strong> ${noteHtml(o)}</div><div><strong>业务员:</strong> ${gStName(o.staffId)}</div>
      <div><strong>操作员:</strong> ${opTag(o.creatorId||o.operatorId)}</div><div><strong>审核员:</strong> ${opTag(o.auditorId)}</div></div>
    <table class="edt-tbl"><thead><tr><th>商品</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
    <tbody>${o.details.map(d=>`<tr><td>${gGName(d.goodsId)}</td><td>${d.qty}</td><td>¥${fmt(d.price)}</td><td>¥${fmt(d.amt)}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:8px"><strong>合计: ¥${fmt(o.totalAmt)}</strong></p>
    ${o.auditStatus==='已审核'?(function(){var bt=findBatchesByCode(o.code);return bt.length>0?'<div style="margin-top:12px;padding:8px;background:#fafafa;border-radius:6px"><strong>📋 关联批次 ('+bt.length+'批):</strong>'+renderBatchGroups(bt)+'</div>':'';})():'<p style="color:#aaa;font-size:11px">（审核通过后将显示批次链路）</p>'}`,
    auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>');
}
function editSR(id){
  let db=GD(),o=db.salesReturn.find(x=>x.id==id);if(!o)return;
  let whOpts=db.warehouses.map(w=>`<option value="${w.id}" ${w.id==o.warehouseId?'selected':''}>${w.name}</option>`).join('');
  let stOpts=db.staff.map(function(s){return'<option value="'+s.id+'"'+(s.id===o.staffId?' selected':'')+'>'+s.name+'</option>'}).join('');
  modal('编辑销售退货 - '+o.code,`
    <div class="frow"><div class="fg"><label>单号</label><input id="esrCode" value="${o.code}"></div><div class="fg"><label>仓库</label><select id="esrWhId">${whOpts}</select></div></div>
    <div class="frow"><div class="fg"><label>日期</label><input id="esrDate" type="date" value="${o.date||now()}"></div><div class="fg"><label>业务员</label><select id="esrStId">${stOpts}</select></div></div>
    <div class="frow c1"><div class="fg"><label>备注</label><input id="esrNote" value="${o.note||''}"></div></div>
    <h4 style="margin:8px 0">退货明细</h4>
    <table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead>
    <tbody id="esrDetail">${o.details.map(d=>{
      let gOpts=db.goods.map(g=>`<option value="${g.id}" ${g.id==d.goodsId?'selected':''}>${g.name}(${g.spec||''})</option>`).join('');
      return `<tr><td><select>${gOpts}</select></td><td><input type="number" value="${d.qty}" min="1" style="width:65px"></td><td><input type="number" value="${d.price}" step="0.01" style="width:85px"></td><td>¥${fmt(d.amt)}</td><td><button class="btn btn-xs btn-d" onclick="this.closest('tr').remove()">×</button></td></tr>`;
    }).join('')}</tbody></table>
    <button class="btn btn-xs btn-o" style="margin-top:6px" onclick="let t=$('esrDetail');let r=t.insertRow();r.innerHTML='<td><select>${db.goods.map(g=>`<option value=\\'${g.id}\\'>${g.name}(${g.spec||''})</option>`).join('')}</select></td><td><input type=\\'number\\' value=\\'1\\' min=\\'1\\' style=\\'width:65px\\'></td><td><input type=\\'number\\' value=\\'0\\' step=\\'0.01\\' style=\\'width:85px\\'></td><td>-</td><td><button class=\\'btn btn-xs btn-d\\' onclick=\\'this.closest(\\\\'tr\\\\').remove()\\'>×</button></td>'">+ 添加明细</button>`,
    `<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="updateSR(${id})">保存</button>`);
}
function updateSR(id){
  let db=GD(),o=db.salesReturn.find(x=>x.id==id);if(!o)return;
  o.code=$('esrCode').value;o.warehouseId=parseInt($('esrWhId').value);o.staffId=parseInt($('esrStId').value);o.date=$('esrDate').value;addNote(o,$('esrNote').value);
  let rows=$('esrDetail').rows,details=[],total=0;
  for(let r of rows){let sel=r.cells[0].querySelector('select');if(!sel)continue;let goodsId=parseInt(sel.value),qty=parseFloat(r.cells[1].querySelector('input').value)||0,price=parseFloat(r.cells[2].querySelector('input').value)||0;if(!qty)continue;let amt=qty*price;details.push({goodsId,qty,price,amt});total+=amt}
  o.details=details;o.totalAmt=total;
  saveD(db);clsModal();nav('sales-return','销售退货');toast('已修改(草稿)');
}
function delSR(id){confirm('确认删除','删除将扣除退回库存，确定？','delSR|'+id)}
function _xDelSR(id){var db=GD(),o=db.salesReturn.find(function(x){return x.id===id});
  if(o&&o.auditStatus==='已审核'){o.details.forEach(function(d){var inv=db.inventory.find(function(x){return x.goodsId===d.goodsId&&x.warehouseId===o.warehouseId});if(inv)inv.qty=Math.max(0,(inv.qty||0)-d.qty)})}
  db.salesReturn=db.salesReturn.filter(function(x){return x.id!==id});clearRedDot(db,'salesReturn',id);saveD(db);nav('sales-return','销售退货');toast('已删除');}
function salesReceive(c){var db=GD();if(!db.salesReceipts)db.salesReceipts=[];var list=db.salesReceipts;if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}var showAddBtn=!isAuditor()&&!isSupervisor()&&hasPerm("sales-receive");c.innerHTML='<div class="tbar"><strong>收款结算</strong> <span class="spacer"></span>'+(showAddBtn?'<button class="btn btn-p" onclick="addSRv()">+ 新增收款</button>':'')+'</div>'+rTable(['单号','客户','关联出库单','日期','金额','备注','审核状态','操作员','审核员','操作'],list.map(function(x){var st=auditStatusTag(x);var btns='<button class="btn btn-xs btn-o" onclick="viewSRv('+x.id+')">查看</button> ';if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewSRv('+x.id+',true)">审核</button> ';if(!isAuditor()&&!isSupervisor()&&hasPerm("sales-receive")&&(!x.auditStatus||x.auditStatus==='草稿'||x.auditStatus==='已驳回'||x.auditStatus==='已取消'))btns+='<button class="btn btn-xs btn-d" onclick="delSRv('+x.id+')">删除</button> ';btns+=auditBtns('salesReceive',x);return[x.code+redDotHtml('salesReceive',x.id),gCName(x.customerId),x.salesOutCode||'-',fd(x.date),'¥'+fmt(x.amount),noteHtml(x),st,opTag(x.operatorId),opTag(x.auditorId),btns]}),10,[5])}
function addSRv(orderId){var db=GD();orderId=orderId||null;var code=gCode(BILL_PREFIX.salesReceive,'salesReceive');var soOpts=db.salesOut.filter(function(x){return x.auditStatus==='已审核'&&(x.totalAmt||0)>(x.receivedAmt||0)}).map(function(x){return'<option value="'+x.id+'"'+(orderId===x.id?' selected':'')+'>'+x.code+' — '+gCName(x.customerId)+' — ¥'+fmt(x.totalAmt-(x.receivedAmt||0))+' 待收</option>'}).join('');if(!soOpts)soOpts='<option value="">暂无待收款的出库单</option>';modal('新增收款结算','<div class="frow"><div class="fg"><label>单号</label><input id="srvCode" value="'+code+'"></div><div class="fg"><label><span class=req>*</span>关联出库单</label><select id="srvSoId" onchange="updateSRvAmt(this.value)">'+soOpts+'</select></div></div><div class="frow"><div class="fg"><label><span class=req>*</span>本次收款金额</label><input id="srvAmt" type=number value=0 step=0.01></div><div class="fg"><label>日期</label><input id="srvDate" type=date value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>收款方式</label><select id="srvMethod"><option>银行转账</option><option>现金</option><option>微信</option><option>支付宝</option></select></div><div class="fg"><label>备注</label><input id="srvNote"></div></div><div style="font-size:11px;color:#999;margin-top:4px" id="srvUnpaid">未收金额：—</div>','<button class=btn btn-o onclick=clsModal()>取消</button><button class=btn btn-p onclick=saveSRv()>保存收款(草稿)</button>');updateSRvAmt()}function updateSRvAmt(v){var db=GD();if(!v){var sel=document.querySelector('#srvSoId');if(sel)v=sel.value}var so=db.salesOut.find(function(x){return x.id===parseInt(v)});if(so){var unreceived=(so.totalAmt||0)-(so.receivedAmt||0);document.querySelector('#srvUnpaid').innerHTML='未收金额：¥'+fmt(unreceived);var inp=document.querySelector('#srvAmt');if(inp)inp.value=unreceived}}
function saveSRv(){
  if(!hasPerm("sales-receive")){toast("无此页面操作权限");return}var db=GD(),amt=parseFloat(document.querySelector('#srvAmt').value)||0;if(!amt){toast('请输入金额');return}var soId=parseInt(document.querySelector('#srvSoId').value);var so=db.salesOut.find(function(x){return x.id===soId});if(!so){toast('请选择出库单');return}var unreceived=(so.totalAmt||0)-(so.receivedAmt||0);if(amt>unreceived){toast('收款金额不能超过未收金额 ¥'+fmt(unreceived));return}var id=nid(db,'salesReceive');db.salesReceipts.push({id:id,code:document.querySelector('#srvCode').value,customerId:so.customerId,salesOutCode:so.code,salesOutId:soId,date:document.querySelector('#srvDate').value,amount:amt,payMethod:document.querySelector('#srvMethod').value,note:document.querySelector('#srvNote').value||'',auditStatus:'草稿'});addRedDot(db,'salesReceive',id,'staff');saveD(db);clsModal();nav('sales-receive','收款结算');toast('已保存(草稿)，请提交审核');updateAuditBadge()}
function _xDelSRv(id){var db=GD();var r=db.salesReceipts.find(function(x){return x.id===id});if(r&&r.salesOutId&&r.auditStatus==='已审核'){var so=db.salesOut.find(function(x){return x.id===r.salesOutId});if(so){so.receivedAmt=Math.max(0,(so.receivedAmt||0)-r.amount);if(so.receivedAmt<=0){so.status='未收款';so.receivedAmt=0}else{so.status=so.receivedAmt>=so.totalAmt?'已收款':'部分收款'}}}db.salesReceipts=db.salesReceipts.filter(function(x){return x.id!==id});saveD(db);nav('sales-receive','收款结算');toast('已删除')}
function viewSRv(id){var db=GD(),o=db.salesReceipts.find(function(x){return x.id===id});if(!o)return;clearRedDot(db,'salesReceive',id);saveD(db);var auditFooter='';if(arguments.length>1&&arguments[1]&&isAuditor()&&o.auditStatus==='待审核'){auditFooter='<button class="btn btn-s" onclick="clsModal();confirm(\'审核通过\',\'是否确认此收款单审核通过？\',\'approve|salesReceive|'+id+'\')">审核通过</button> <button class="btn btn-d" onclick="clsModal();rejectAudit(\'salesReceive\','+id+')">驳回</button> '}modal('收款详情 - '+o.code,'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div><strong>单号:</strong> '+o.code+'</div><div><strong>客户:</strong> '+gCName(o.customerId)+'</div><div><strong>关联出库单:</strong> '+(o.salesOutCode||'-')+'</div><div><strong>日期:</strong> '+fd(o.date)+'</div><div><strong>金额:</strong> ¥'+fmt(o.amount)+'</div><div><strong>收款方式:</strong> '+(o.payMethod||'银行转账')+'</div><div><strong>备注:</strong> '+noteHtml(o)+'</div><div><strong>审核状态:</strong> '+auditStatusTag(o)+'</div></div>',auditFooter+'<button class="btn btn-o" onclick="clsModal()">关闭</button>')}
function delSRv(id){confirm('确认删除','确定删除？','delSRv|'+id)}

// ==================== 仓库管理 ====================
function whIndex(c){let db=GD();c.innerHTML=`<h2 style="margin-bottom:12px">🏭 仓库管理</h2><div class="stats"><div class="scard" onclick="nav('warehouse-query','库存查询')"><div class="si" style="background:#e6f7ff">🔍</div><div class="sinfo"><h4>库存查询</h4><div class="n">${db.goods.length}</div><div class="sub">${db.warehouses.length}个仓库</div></div></div><div class="scard" onclick="nav('warehouse-check','仓库盘点')"><div class="si" style="background:#f6ffed">📋</div><div class="sinfo"><h4>仓库盘点</h4><div class="n">${(db.checkOrders||[]).length}</div></div></div><div class="scard" onclick="nav('warehouse-transfer','库存调拨')"><div class="si" style="background:#fff7e6">↔️</div><div class="sinfo"><h4>库存调拨</h4><div class="n">${(db.transfers||[]).length}</div></div></div><div class="scard" onclick="nav('warehouse-alert','库存预警')"><div class="si" style="background:#fff2f0">⚠️</div><div class="sinfo"><h4>库存预警</h4><div class="n">${db.inventory.filter(i=>i.qty<=i.warnQty).length}</div></div></div></div>`;}
function whQuery(c){var db=GD(),whFilter=window._whFilter||'',kw=window._whKw||'';c.innerHTML='<div class="tbar"><strong>库存查询</strong> <input placeholder="搜索商品..." oninput="window._whKw=this.value;nav(\'warehouse-query\',\'库存查询\')"><select onchange="window._whFilter=this.value;nav(\'warehouse-query\',\'库存查询\')"><option value="">全部仓库</option>'+db.warehouses.map(function(w){return '<option value="'+w.id+'"'+(whFilter==w.id?' selected':'')+'>'+w.name+'</option>'}).join('')+'</select></div><div id="whQueryList"></div>';renderWhQuery();}
function renderWhQuery(){
var db=GD(),whFilter=window._whFilter||'',kw=window._whKw||'',srcFilter=window._whSrcFilter||'all';
var list=db.inventory.filter(function(i){
  if(whFilter&&i.warehouseId!==parseInt(whFilter))return false;
  var g=db.goods.find(function(x){return x.id===i.goodsId});
  if(!g)return false;
  if(kw&&g.name.indexOf(kw)===-1)return false;
  return true;
});
var h='';
if(!list.length){
  $('whQueryList').innerHTML='<div class="empty"><div class="ico">📭</div><h3>暂无库存数据</h3></div>';
  return;
}
h+='<table class="data-table"><thead><tr><th>商品</th><th>规格</th><th>仓库</th><th>库存</th><th>预警线</th><th>状态</th><th>溯源</th></tr></thead><tbody>';
list.forEach(function(inv){
  var g=db.goods.find(function(x){return x.id===inv.goodsId})||{};
  var gname=g.name||'-',spec=g.spec||'-',whname=gWName(inv.warehouseId);
  var qty=inv.qty||0,warn=inv.warnQty||10;
  var statusHtml=qty<=warn?'<span class="tag tag-red">低库存</span>':'<span class="tag tag-green">正常</span>';
  var batches=inv.batches||[];
  h+='<tr><td><b>'+gname+'</b></td><td>'+spec+'</td><td>'+whname+'</td><td>'+qty+'</td><td><input type="number" value="'+warn+'" style="width:60px" onchange="updateInvWarn('+inv.goodsId+','+inv.warehouseId+',this.value)"></td><td>'+statusHtml+'</td><td>';
  if(batches.length>0){
    var uid='bt'+inv.goodsId+'_'+inv.warehouseId;
    h+='<button class="btn btn-xs btn-o" onclick="toggleTraceRow(\''+uid+'\')">▶ 溯源 ('+batches.length+'批)</button>';
  }else{
    h+='<span style="color:#aaa;font-size:11px">—</span>';
  }
  h+='</td></tr>';
  if(batches.length>0){
    h+='<tr id="bt'+inv.goodsId+'_'+inv.warehouseId+'" style="display:none;background:#fafafa"><td colspan="7"><div style="padding:4px 12px;font-size:12px;color:#666"><strong>📋 批次溯源 (共'+qty+'件)：</strong> ';
    h+='<select style="margin-left:10px;font-size:10px;padding:2px 4px" onchange="window._whSrcFilter=this.value;renderWhQuery()"><option value="all"'+('all'===srcFilter?' selected':'')+'>全部</option><option value="byPO"'+('byPO'===srcFilter?' selected':'')+'>按采购单分组</option><option value="byPI"'+('byPI'===srcFilter?' selected':'')+'>按入库单分组</option><option value="instock"'+('instock'===srcFilter?' selected':'')+'>仅看有库存</option></select> ';
    h+='<table style="width:100%;font-size:11px;margin-top:4px"><thead><tr><th>来源类型</th><th>仓储批次号</th><th>数量</th><th>单价</th><th>总价</th><th>剩余</th><th>日期</th><th>全链路单号</th><th>操作</th></tr></thead><tbody>';
    var filteredBatches=batches;
    if(srcFilter==='instock'){filteredBatches=batches.filter(function(b){var rem=b.remaining!=null?b.remaining:b.qty;return rem>0;});}
    if(srcFilter==='byPO'||srcFilter==='byPI'){
      var groups={};
      filteredBatches.forEach(function(b,idx){
        migrateBatchLinkChain(b);
        var key;
        if(srcFilter==='byPO'){
          var lc=b.linkChain||[],poNode=null;
          for(var li=0;li<lc.length;li++){if(lc[li].action==='采购下单'&&lc[li].code){poNode=lc[li];break;}}
          key=poNode?poNode.code:'(无采购单)';
        }else{
          key=b.purchaseInCode||b.salesReturnCode||'(未知)';
        }
        if(!groups[key])groups[key]=[];
        groups[key].push({batch:b,idx:idx});
      });
      var gkeys=Object.keys(groups).sort();
      for(var gi=0;gi<gkeys.length;gi++){
        var gk=gkeys[gi],gbs=groups[gk];
        var totalQty=0,totalRem=0,totalAmt=0;
        gbs.forEach(function(gb){var b=gb.batch;totalQty+=b.qty;var rem=b.remaining!=null?b.remaining:b.qty;totalRem+=rem;totalAmt+=b.price*b.qty;});
        h+='<tr style="background:#fffbe6"><td colspan="9"><b>📝 '+gk+'</b> (共'+totalQty+'件，在库'+totalRem+'件，总额¥'+fmt(totalAmt)+')</td></tr>';
        gbs.forEach(function(gb){h+=renderBatchRowHTML(gb.batch,gb.idx,inv);});
      }
    }else{
      filteredBatches.forEach(function(b,idx){migrateBatchLinkChain(b);h+=renderBatchRowHTML(b,idx,inv);});
    }
    h+='</tbody></table></div></td></tr>';
  }
});
h+='</tbody></table>';
$('whQueryList').innerHTML=h;
}
function renderBatchRowHTML(b,idx,inv){
  migrateBatchLinkChain(b);
  var batchCode=b.batchCode||(b.purchaseInCode||b.salesReturnCode||'BATCH'+(inv.goodsId+'-'+inv.warehouseId+'-'+idx));
  if(!b.batchCode){b.batchCode='BTH-'+inv.goodsId+'-'+inv.warehouseId+'-'+(idx+1);}
  var rem=b.remaining!=null?b.remaining:b.qty;
  var price=b.price||0;
  var totalAmt=fmt(price*b.qty);
  var settleBtn='';
  if(rem<=0&&b.qty>0){settleBtn=' <button class="btn btn-xs btn-s" onclick="settleBatchById('+inv.goodsId+','+inv.warehouseId+','+idx+')">结算完成</button>';}
  var srcType='',lc=b.linkChain||[];
  var hasPO=lc.some(function(l){return l.action==='采购下单'&&l.code;});
  var hasPI=lc.some(function(l){return l.action==='采购入库'&&l.code;});
  var hasSR=lc.some(function(l){return l.action==='销售退货'&&l.code;});
  var hasTrans=lc.some(function(l){return l.action==='调拨入'&&l.code;});
  if(hasTrans)srcType='<span style="font-size:10px;color:#13c2c2">↔️ 调拨入</span>';
  else if(hasSR)srcType='<span style="font-size:10px;color:#eb2f96">🔙 销售退货</span>';
  else if(hasPI&&hasPO)srcType='<span style="font-size:10px;color:#52c41a">📥 采购入库</span>';
  else if(hasPI)srcType='<span style="font-size:10px;color:#52c41a">📥 独立入库</span>';
  else srcType='<span style="font-size:10px;color:#aaa">—</span>';
  return '<tr><td>'+srcType+'</td><td><b>'+batchCode+'</b></td><td>'+b.qty+'</td><td>¥'+fmt(price)+'</td><td>¥'+totalAmt+'</td><td>'+rem+'</td><td>'+fd(b.date)+'</td><td>'+renderLinkChainTree(b)+'</td><td>'+settleBtn+'</td></tr>';
}
function toggleTraceRow(id){var r=document.getElementById(id);if(r)r.style.display=r.style.display==='none'?'table-row':'none';}
function settleBatchById(gid,wid,idx){var db=GD();var inv=db.inventory.find(function(x){return x.goodsId===gid&&x.warehouseId===wid});if(!inv||!inv.batches||!inv.batches[idx])return;var b=inv.batches[idx];if(!db.completedBatches)db.completedBatches=[];db.completedBatches.push({goodsId:inv.goodsId,warehouseId:inv.warehouseId,warehouseName:gWName(inv.warehouseId),purchaseInCode:b.purchaseInCode,qty:b.qty,date:now(),linkChain:b.linkChain?JSON.parse(JSON.stringify(b.linkChain)):[]});inv.batches.splice(idx,1);saveD(db);nav('warehouse-query','库存查询');toast('批次已结算')}
function updateInvWarn(gid,wid,val){
  if(!hasPerm('warnQtyEdit')){toast('无权限修改预警线');return}
  var db=GD();var inv=db.inventory.find(function(x){return x.goodsId===gid&&x.warehouseId===wid});if(inv){inv.warnQty=parseInt(val)||10;saveD(db)};nav('warehouse-query','库存查询')
}
function whAlert(c){let db=GD(),alerts=db.inventory.filter(i=>i.qty<=i.warnQty);c.innerHTML=`<div class="tbar"><strong>库存预警</strong> <span style="color:var(--dan);margin-left:8px">${alerts.length}条预警</span></div>${alerts.length>0?'<div class="alert alert-warn">⚠️ 以下库存低于预警线，请及时补货！</div>':''}${rTable(['商品','仓库','当前库存','预警线','建议'],alerts.map(i=>{let g=db.goods.find(x=>x.id===i.goodsId)||{};return[g.name||'-',gWName(i.warehouseId),`<span style="color:#ff4d4f;font-weight:700">${i.qty}</span>`,i.warnQty,`${hasPerm('purchase-order')?`<button class="btn btn-xs btn-p" onclick="nav('purchase-order','采购订单');setTimeout(()=>addPO(),300)">立即采购</button>`:'<span style="color:#999;font-size:11px">无权限</span>'}`]}),5)}`;}
function whFlow(c){let db=GD();if(!db.stockFlows)db.stockFlows=[];var kw=(document.getElementById('flowSearch')||{}).value||'';var list=db.stockFlows.slice(-200).reverse();if(kw){kw=kw.toLowerCase();list=list.filter(function(f){return(f.code||'').toLowerCase().indexOf(kw)>=0||(f.type||'').indexOf(kw)>=0||gGName(f.goodsId).indexOf(kw)>=0||gWName(f.warehouseId).indexOf(kw)>=0})}c.innerHTML='<div class="tbar"><strong>库存流水</strong> <input placeholder="搜索单号/类型/商品/仓库..." id="flowSearch" onkeydown="if(event.key===\'Enter\')whFlow(document.getElementById(\'pg\'))"><button class="btn btn-o btn-sm" onclick="whFlow(document.getElementById(\'pg\'))">🔍</button></div>'+rTable(['时间','类型','单号','商品','仓库','数量','关联单据'],list.map(function(f){var linkInfo=f.linkChainSnapshot?renderLinkChain(f.linkChainSnapshot):'';if(!linkInfo&&f.salesOrderCode){linkInfo='<span style="display:inline-block;background:#e6f7ff;color:#1890ff;padding:1px 6px;border-radius:3px;font-size:10px;margin:1px">'+f.salesOrderCode+'</span> <span style="display:inline-block;background:#f6ffed;color:#52c41a;padding:1px 6px;border-radius:3px;font-size:10px;margin:1px">'+f.salesOutCode+'</span>'}if(!linkInfo||linkInfo==='-')linkInfo='<span style="color:#aaa;font-size:11px">-</span>';return[f.time||'',f.type||'',f.code||'',gGName(f.goodsId),gWName(f.warehouseId),(f.qty>0?'+':'')+f.qty,linkInfo]}),7);}
function whCheck(c){let db=GD();if(!db.checkOrders)db.checkOrders=[];var kw=(document.getElementById('chkSearch')||{}).value||'';var list=db.checkOrders;if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||gWName(x.warehouseId).indexOf(kw)>=0})}c.innerHTML='<div class="tbar"><strong>仓库盘点</strong> <input placeholder="搜索单号/仓库..." id="chkSearch" onkeydown="if(event.key===\'Enter\')whCheck(document.getElementById(\'pg\'))"><button class="btn btn-o btn-sm" onclick="whCheck(document.getElementById(\'pg\'))">🔍</button><span class="spacer"></span>'+(hasPerm('warehouse-check')?'<button class="btn btn-p" onclick="addCheck()">+ 新增盘点</button>':'')+'</div>'+rTable(['单号','仓库','日期','盘点人','操作'],list.map(function(x){var btns='<button class="btn btn-xs btn-o" onclick="viewCheck('+x.id+')">查看</button>';if(isAuditor()&&x.auditStatus==='待审核')btns+=' <button class="btn btn-xs btn-s" onclick="viewCheck('+x.id+',true)">审核</button>';return[x.code,gWName(x.warehouseId),fd(x.date),gStName(x.staffId),btns]}),5);}
function addCheck(){let db=GD();modal('新增盘点','<div class="frow"><div class="fg"><label>仓库</label><select id="ckWhId" onchange="ckLoadGoods()">'+db.warehouses.map(function(w){return'<option value="'+w.id+'">'+w.name+'</option>'}).join('')+'</select></div><div class="fg"><label>盘点人</label><select id="ckStId">'+db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')+'</select></div></div><div class="frow"><div class="fg"><label>日期</label><input id="ckDate" type="date" value="'+now()+'"></div><div class="fg"><label>备注</label><input id="ckNote"></div></div><h4 style="margin:8px 0">盘点明细</h4><table class="edt-tbl"><thead><tr><th>商品</th><th>系统库存</th><th>实盘数量</th><th>差异</th></tr></thead><tbody id="ckDetail"></tbody></table>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveCheck()">保存</button>');ckLoadGoods();}
function ckLoadGoods(){let db=GD(),whId=parseInt($('ckWhId').value),invs=db.inventory.filter(function(i){return i.warehouseId===whId}),h='';invs.forEach(function(inv){let g=db.goods.find(function(x){return x.id===inv.goodsId});if(g)h+='<tr><td>'+g.name+'('+(g.spec||'')+')</td><td>'+(inv.qty||0)+'</td><td><input type="number" value="'+(inv.qty||0)+'" style="width:80px" data-gid="'+inv.goodsId+'"></td><td>-</td></tr>'});$('ckDetail').innerHTML=h||'<tr><td colspan="4">该仓库暂无库存商品</td></tr>';}
function saveCheck(){
  if(!hasPerm("warehouse-check")){toast("无此页面操作权限");return}let db=GD(),whId=parseInt($('ckWhId').value),stId=parseInt($('ckStId').value),rows=$('ckDetail').rows,details=[],id=nid(db,'checkOrder'),code='PDD-'+String(id).padStart(3,'0');for(let r of rows){let inp=r.cells[2].querySelector('input');if(!inp)continue;let gid=parseInt(inp.dataset.gid),sysQty=parseFloat(r.cells[1].textContent)||0,realQty=parseFloat(inp.value)||0,diff=realQty-sysQty;details.push({goodsId:gid,sysQty,realQty,diff});let inv=db.inventory.find(x=>x.goodsId===gid&&x.warehouseId===whId);if(inv){inv.qty=realQty;if(diff>0){let pid=nid(db,'checkProfit');if(!db.checkProfit)db.checkProfit=[];db.checkProfit.push({id:pid,code:'PY-'+String(pid).padStart(3,'0'),warehouseId:whId,date:$('ckDate').value,staffId:stId,goodsId:gid,qty:diff})}else if(diff<0){let lid=nid(db,'checkLoss');if(!db.checkLoss)db.checkLoss=[];db.checkLoss.push({id:lid,code:'PK-'+String(lid).padStart(3,'0'),warehouseId:whId,date:$('ckDate').value,staffId:stId,goodsId:gid,qty:-diff})}}}db.checkOrders.push({id,code,warehouseId:whId,date:$('ckDate').value,staffId:stId,note:$('ckNote').value||'',details});saveD(db);clsModal();nav('warehouse-check','仓库盘点');toast('盘点完成');}
function viewCheck(id){let db=GD(),o=db.checkOrders.find(function(x){return x.id===id});if(!o)return;modal('盘点详情 - '+o.code,'<div><strong>仓库:</strong> '+gWName(o.warehouseId)+' | <strong>日期:</strong> '+fd(o.date)+'</div><table style="margin-top:8px"><thead><tr><th>商品</th><th>系统</th><th>实盘</th><th>差异</th></tr></thead><tbody>'+o.details.map(function(d){return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.sysQty+'</td><td>'+d.realQty+'</td><td style="color:'+(d.diff>0?'green':'red')+'">'+(d.diff>0?'+':'')+d.diff+'</td></tr>'}).join('')+'</tbody></table>','<button class="btn btn-o" onclick="clsModal()">关闭</button>');}
function whTransfer(c){let db=GD();if(!db.transfers)db.transfers=[];let list=db.transfers;if(isAuditor()||isSupervisor()){list=list.filter(function(x){return x.auditStatus!=='草稿'})}var kw=(document.getElementById('tfSearch')||{}).value||'';if(kw){kw=kw.toLowerCase();list=list.filter(function(x){return(x.code||'').toLowerCase().indexOf(kw)>=0||gWName(x.fromWhId).indexOf(kw)>=0||gWName(x.toWhId).indexOf(kw)>=0||gGName(x.goodsId).indexOf(kw)>=0})}c.innerHTML='<div class="tbar"><strong>库存调拨</strong> <input placeholder="搜索单号/仓库/商品..." id="tfSearch" onkeydown="if(event.key===\'Enter\')whTransfer(document.getElementById(\'pg\'))"><button class="btn btn-o btn-sm" onclick="whTransfer(document.getElementById(\'pg\'))">🔍</button><span class="spacer"></span>'+(hasPerm('warehouse-transfer')?'<button class="btn btn-p" onclick="addTrans()">+ 新增调拨</button>':'')+'</div>'+rTable(['单号','调出仓库','调入仓库','商品','数量','日期','备注','审核状态','操作员','审核员','操作'],list.map(function(x){var st=auditStatusTag(x);var btns='<button class="btn btn-xs btn-o" onclick="viewTrans('+x.id+')">查看</button> ';if(isAuditor()&&x.auditStatus==='待审核')btns+='<button class="btn btn-xs btn-s" onclick="viewTrans('+x.id+',true)">审核</button> ';if(!isAuditor()&&!isSupervisor()&&hasPerm("warehouse-transfer")&&(!x.auditStatus||x.auditStatus==='草稿'||x.auditStatus==='已取消'))btns+='<button class="btn btn-xs btn-d" onclick="confirm(\'删除确认\',\'确定删除？\',\'delTrans|'+x.id+'\')">删除</button> ';btns+=auditBtns('transfer',x);return[x.code+redDotHtml('transfer',x.id),gWName(x.fromWhId),gWName(x.toWhId),gGName(x.goodsId),x.qty,fd(x.date),noteHtml(x),st,opTag(x.operatorId),opTag(x.auditorId),btns]}),11,[6])}
function addTrans(){let db=GD(),code=gCode('DB','transfer');modal('新增调拨','<div class="frow"><div class="fg"><label>单号</label><input id="tfCode" value="'+code+'"></div><div class="fg"><label>制单人</label><select id="tfStId">'+db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')+'</select></div></div><div class="frow"><div class="fg"><label>调出仓库</label><select id="tfFrom">'+db.warehouses.map(w=>'<option value="'+w.id+'">'+w.name+'</option>').join('')+'</select></div><div class="fg"><label>调入仓库</label><select id="tfTo">'+db.warehouses.map(w=>'<option value="'+w.id+'">'+w.name+'</option>').join('')+'</select></div></div><div class="frow"><div class="fg"><label>商品</label><select id="tfGoods">'+db.goods.map(g=>'<option value="'+g.id+'">'+g.name+'</option>').join('')+'</select></div><div class="fg"><label>数量</label><input id="tfQty" type="number" min="1"></div></div><div class="frow"><div class="fg"><label>日期</label><input id="tfDate" type="date" value="'+now()+'"></div><div class="fg"><label>备注</label><input id="tfNote"></div></div>','<button class=btn btn-o onclick=clsModal()>取消</button><button class=btn btn-p onclick=saveTrans()>保存</button>')}
function saveTrans(){
  if(!hasPerm("warehouse-transfer")){toast("无此页面操作权限");return}let db=GD(),fromWh=parseInt(document.querySelector('#tfFrom').value),toWh=parseInt(document.querySelector('#tfTo').value),goodsId=parseInt(document.querySelector('#tfGoods').value),qty=parseFloat(document.querySelector('#tfQty').value)||0,staffId=parseInt(document.querySelector('#tfStId').value);if(fromWh===toWh){toast('仓库不能相同');return}if(!qty){toast('请输入数量');return}let fromInv=db.inventory.find(x=>x.goodsId===goodsId&&x.warehouseId===fromWh);if(!fromInv||fromInv.qty<qty){toast('调出仓库库存不足');return}let id=nid(db,'transfer');var sourceBatch=null;if(fromInv&&fromInv.batches&&fromInv.batches.length){sourceBatch={purchaseInCode:fromInv.batches[fromInv.batches.length-1].purchaseInCode||'',purchaseOrderCode:fromInv.batches[fromInv.batches.length-1].purchaseOrderCode||''}}db.transfers.push({id:id,code:document.querySelector('#tfCode').value,fromWhId:fromWh,toWhId:toWh,goodsId:goodsId,qty:qty,date:document.querySelector('#tfDate').value,note:document.querySelector('#tfNote').value||'',staffId:staffId,sourceBatch:sourceBatch,auditStatus:'草稿',operatorId:currentUser?currentUser.accountId:'',creatorId:currentUser?currentUser.accountId:''});addRedDot(db,'transfer',id,'staff');saveD(db);clsModal();nav('warehouse-transfer','库存调拨');toast('已创建(草稿)，请提交审核');updateAuditBadge()}
function _xDelTrans(id){var db=GD();db.transfers=db.transfers.filter(function(x){return x.id!==id});saveD(db);nav('warehouse-transfer','库存调拨');toast('已删除')}
function delTrans(id){confirm('确认删除','确定删除？','delTrans|'+id)}

// ====== 需求4: 已结算货物 ======
function whCompleted(c){var db=GD();if(!db.completedBatches)db.completedBatches=[];var list=db.completedBatches||[];c.innerHTML='<div class="tbar"><strong>📦 已结算货物</strong></div>'+rTable(['商品','仓库','数量','结算日期','全链路单号'],list.reverse().map(function(b){return[gGName(b.goodsId),b.warehouseName||'-',b.qty,fd(b.date),renderLinkChain(b.linkChain)]}),5)}
function settleBatch(inv,idx){var db=GD();var b=inv.batches[idx];if(!db.completedBatches)db.completedBatches=[];db.completedBatches.push({goodsId:inv.goodsId,warehouseId:inv.warehouseId,warehouseName:gWName(inv.warehouseId),purchaseInCode:b.purchaseInCode,qty:b.qty,date:now()});inv.batches.splice(idx,1);saveD(db);nav('warehouse-query','库存查询');toast('批次已结算')}
// ==================== 财务管理 ====================
function finIndex(c){let db=GD();c.innerHTML='<h2 style="margin-bottom:12px">📋 财务记账</h2><div class="stats"><div class="scard" onclick="nav(\'finance-receivable\',\'应收款管理\')"><div class="si" style="background:#e6f7ff">📥</div><div class="sinfo"><h4>应收款</h4><div class="n">¥'+fmt((db.salesOut||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0)-(db.salesReceipts||[]).reduce(function(s,x){return s+(x.amount||0)},0))+'</div></div></div><div class="scard" onclick="nav(\'finance-payable\',\'应付款管理\')"><div class="si" style="background:#fff7e6">📤</div><div class="sinfo"><h4>应付款</h4><div class="n">¥'+fmt((db.purchaseIn||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0)-(db.purchasePayments||[]).reduce(function(s,x){return s+(x.amount||0)},0))+'</div></div></div><div class="scard" onclick="nav(\'finance-income\',\'其他收入\')"><div class="si" style="background:#f6ffed">📈</div><div class="sinfo"><h4>其他收入</h4><div class="n">'+(db.incomeRecords||[]).length+'</div></div></div><div class="scard" onclick="nav(\'finance-reconciliation\',\'往来对账\')"><div class="si" style="background:#fff2f0">📊</div><div class="sinfo"><h4>往来对账</h4></div></div></div>';}
function receivable(c){let db=GD();c.innerHTML='<div class="tbar"><strong>应收款管理</strong></div>'+rTable(['单号','客户','日期','金额','已收','未收','状态'],(db.salesOut||[]).map(function(x){var rcvd=(db.salesReceipts||[]).filter(function(r){return r.customerId===x.customerId}).reduce(function(s,r){return s+r.amount},0),bal=Math.max(0,x.totalAmt-rcvd);return[x.code,gCName(x.customerId),fd(x.date),'¥'+fmt(x.totalAmt),'¥'+fmt(Math.min(rcvd,x.totalAmt)),'¥'+fmt(bal),bal<=0?'<span class="tag tag-green">已结清</span>':'<span class="tag tag-red">未结清</span>']}),7);}
function payable(c){let db=GD();c.innerHTML='<div class="tbar"><strong>应付款管理</strong></div>'+rTable(['单号','供应商','日期','金额','已付','未付','状态'],(db.purchaseIn||[]).map(function(x){var paid=(db.purchasePayments||[]).filter(function(r){return r.supplierId===x.supplierId}).reduce(function(s,r){return s+r.amount},0),bal=Math.max(0,x.totalAmt-paid);return[x.code,gSName(x.supplierId),fd(x.date),'¥'+fmt(x.totalAmt),'¥'+fmt(Math.min(paid,x.totalAmt)),'¥'+fmt(bal),bal<=0?'<span class="tag tag-green">已结清</span>':'<span class="tag tag-red">未结清</span>']}),7);}
function income(c){let db=GD();if(!db.incomeRecords)db.incomeRecords=[];c.innerHTML='<div class="tbar"><strong>其他收入</strong> <span class="spacer"></span>'+(hasPerm('finance-income')?'<button class="btn btn-p" onclick="addIncome()">+ 新增</button>':'<span style="color:#999;font-size:12px">无权限</span>')+'</div>'+rTable(['单号','日期','科目','金额','来源','操作'],db.incomeRecords.map(function(x){return[x.code,fd(x.date),x.acctName,'¥'+fmt(x.amount),x.source||'-',(hasPerm('finance-income')?'<button class="btn btn-xs btn-d" onclick="delInc('+x.id+')">删除</button>':'')]}),6);}
function addIncome(){let code=gCode(BILL_PREFIX.income,'income');modal('新增收入','<div class="frow"><div class="fg"><label>单号</label><input id="incCode" value="'+code+'"></div><div class="fg"><label>科目</label><select id="incAcct"><option>主营业务收入</option><option>其他业务收入</option><option>营业外收入</option></select></div></div><div class="frow"><div class="fg"><label><span class="req">*</span>金额</label><input id="incAmt" type="number" step="0.01"></div><div class="fg"><label>日期</label><input id="incDate" type="date" value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>来源</label><input id="incSrc"></div><div class="fg"><label>备注</label><input id="incNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveIncome()">保存</button>');}
function saveIncome(){
  if(!hasPerm("finance-income")){toast("无此页面操作权限");return}let db=GD(),amt=parseFloat($('incAmt').value)||0;if(!amt){toast('请输入金额');return}let id=nid(db,'incomeRecord');db.incomeRecords.push({id,code:$('incCode').value,acctName:$('incAcct').value,amount:amt,date:$('incDate').value,source:$('incSrc').value,note:$('incNote').value||''});saveD(db);clsModal();nav('finance-income','其他收入');toast('已保存');}
function delInc(id){confirm('确认删除','确定删除？','delInc|'+id);}
function expense(c){let db=GD();if(!db.expenseRecords)db.expenseRecords=[];c.innerHTML='<div class="tbar"><strong>费用支出</strong> <span class="spacer"></span>'+(hasPerm('finance-expense')?'<button class="btn btn-p" onclick="addExp()">+ 新增</button>':'<span style="color:#999;font-size:12px">无权限</span>')+'</div>'+rTable(['单号','日期','科目','金额','类型','操作'],db.expenseRecords.map(function(x){return[x.code,fd(x.date),x.acctName,'¥'+fmt(x.amount),x.type||'-',(hasPerm('finance-expense')?'<button class="btn btn-xs btn-d" onclick="delExp('+x.id+')">删除</button>':'')]}),6);}
function addExp(){let code=gCode(BILL_PREFIX.expense,'expense');modal('新增支出','<div class="frow"><div class="fg"><label>单号</label><input id="expCode" value="'+code+'"></div><div class="fg"><label>科目</label><select id="expAcct"><option>主营业务成本</option><option>管理费用</option><option>销售费用</option><option>财务费用</option></select></div></div><div class="frow"><div class="fg"><label><span class="req">*</span>金额</label><input id="expAmt" type="number" step="0.01"></div><div class="fg"><label>日期</label><input id="expDate" type="date" value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>支出类型</label><select id="expType2"><option>日常支出</option><option>工资</option><option>租金</option><option>水电费</option><option>运费</option><option>其他</option></select></div><div class="fg"><label>备注</label><input id="expNote2"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveExp()">保存</button>');}
function saveExp(){
  if(!hasPerm("finance-expense")){toast("无此页面操作权限");return}let db=GD(),amt=parseFloat($('expAmt').value)||0;if(!amt){toast('请输入金额');return}let id=nid(db,'expenseRecord');db.expenseRecords.push({id,code:$('expCode').value,acctName:$('expAcct').value,amount:amt,date:$('expDate').value,type:$('expType2').value,note:$('expNote2').value||''});saveD(db);clsModal();nav('finance-expense','费用支出');toast('已保存');}
function delExp(id){confirm('确认删除','确定删除？','delExp|'+id);}
function reconciliation(c){let db=GD();c.innerHTML='<h2 style="margin-bottom:12px">📊 往来对账</h2><div class="twrap" style="margin-bottom:12px"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>客户往来</strong></div><table class="edt-tbl"><thead><tr><th>客户</th><th>销售金额</th><th>已收</th><th>余额</th></tr></thead><tbody>'+db.customers.map(function(cu){var saleAmt=(db.salesOut||[]).filter(function(x){return x.customerId===cu.id}).reduce(function(s,x){return s+(x.totalAmt||0)},0),rcvd=(db.salesReceipts||[]).filter(function(x){return x.customerId===cu.id}).reduce(function(s,x){return s+(x.amount||0)},0),bal=saleAmt-rcvd;return'<tr><td>'+cu.name+'</td><td>¥'+fmt(saleAmt)+'</td><td>¥'+fmt(rcvd)+'</td><td style="color:'+(bal>0?'red':'green')+';font-weight:700">¥'+fmt(bal)+'</td></tr>'}).join('')+'</tbody></table></div><div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>供应商往来</strong></div><table class="edt-tbl"><thead><tr><th>供应商</th><th>采购金额</th><th>已付</th><th>余额</th></tr></thead><tbody>'+db.suppliers.map(function(s){var purAmt=(db.purchaseIn||[]).filter(function(x){return x.supplierId===s.id}).reduce(function(s2,x){return s2+(x.totalAmt||0)},0),paid=(db.purchasePayments||[]).filter(function(x){return x.supplierId===s.id}).reduce(function(s2,x){return s2+(x.amount||0)},0),bal=purAmt-paid;return'<tr><td>'+s.name+'</td><td>¥'+fmt(purAmt)+'</td><td>¥'+fmt(paid)+'</td><td style="color:'+(bal>0?'red':'green')+';font-weight:700">¥'+fmt(bal)+'</td></tr>'}).join('')+'</tbody></table></div>';}
function profit(c){let db=GD(),sales=(db.salesOut||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0),sReturn=(db.salesReturn||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0),purch=(db.purchaseIn||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0),inc=(db.incomeRecords||[]).reduce(function(s,x){return s+(x.amount||0)},0),exp=(db.expenseRecords||[]).reduce(function(s,x){return s+(x.amount||0)},0),gross=sales-sReturn-purch,net=gross+inc-exp;c.innerHTML='<h2 style="margin-bottom:12px">📈 利润报表</h2><div class="stats"><div class="scard"><div class="si" style="background:#e6f7ff">💰</div><div class="sinfo"><h4>销售收入</h4><div class="n">¥'+fmt(sales)+'</div></div></div><div class="scard"><div class="si" style="background:#fff2f0">📊</div><div class="sinfo"><h4>销售成本</h4><div class="n">¥'+fmt(purch)+'</div></div></div><div class="scard"><div class="si" style="background:#f6ffed">📈</div><div class="sinfo"><h4>毛利</h4><div class="n">¥'+fmt(gross)+'</div></div></div><div class="scard"><div class="si" style="background:#fff7e6">🎯</div><div class="sinfo"><h4>净利润</h4><div class="n">¥'+fmt(net)+'</div><div class="sub">收入:¥'+fmt(inc)+' 费用:¥'+fmt(exp)+'</div></div></div></div>';}


// ==================== 报表 ====================
function purchStats(c){let db=GD(),pis=db.purchaseIn||[],prs=db.purchaseReturn||[],totalIn=pis.reduce(function(s,x){return s+(x.totalAmt||0)},0),totalReturn=prs.reduce(function(s,x){return s+(x.totalAmt||0)},0),bySupp={};pis.forEach(function(x){var k=gSName(x.supplierId);bySupp[k]=(bySupp[k]||0)+(x.totalAmt||0)});var top=Object.entries(bySupp).sort(function(a,b){return b[1]-a[1]}).slice(0,5);c.innerHTML='<h2 style="margin-bottom:12px">📊 采购统计报表</h2><div class="stats"><div class="scard"><div class="si" style="background:#e6f7ff">📥</div><div class="sinfo"><h4>采购入库总额</h4><div class="n">¥'+fmt(totalIn)+'</div><div class="sub">'+pis.length+'笔</div></div></div><div class="scard"><div class="si" style="background:#fff2f0">📤</div><div class="sinfo"><h4>采购退货总额</h4><div class="n">¥'+fmt(totalReturn)+'</div><div class="sub">'+prs.length+'笔</div></div></div><div class="scard"><div class="si" style="background:#f6ffed">💳</div><div class="sinfo"><h4>已付款</h4><div class="n">¥'+fmt((db.purchasePayments||[]).reduce(function(s,x){return s+x.amount},0))+'</div></div></div><div class="scard"><div class="si" style="background:#fff7e6">📊</div><div class="sinfo"><h4>净采购额</h4><div class="n">¥'+fmt(totalIn-totalReturn)+'</div></div></div></div><div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>按供应商统计 (Top5)</strong></div><table class="edt-tbl"><thead><tr><th>供应商</th><th>采购金额</th></tr></thead><tbody>'+top.map(function(e){return'<tr><td>'+e[0]+'</td><td>¥'+fmt(e[1])+'</td></tr>'}).join('')+'</tbody></table></div>';}
function salesStats(c){let db=GD(),sos=db.salesOut||[],srs=db.salesReturn||[],totalOut=sos.reduce(function(s,x){return s+(x.totalAmt||0)},0),totalReturn=srs.reduce(function(s,x){return s+(x.totalAmt||0)},0),byCust={};sos.forEach(function(x){var k=gCName(x.customerId);byCust[k]=(byCust[k]||0)+(x.totalAmt||0)});var top=Object.entries(byCust).sort(function(a,b){return b[1]-a[1]}).slice(0,5);c.innerHTML='<h2 style="margin-bottom:12px">📈 销售统计报表</h2><div class="stats"><div class="scard"><div class="si" style="background:#e6f7ff">💰</div><div class="sinfo"><h4>销售出库总额</h4><div class="n">¥'+fmt(totalOut)+'</div><div class="sub">'+sos.length+'笔</div></div></div><div class="scard"><div class="si" style="background:#fff2f0">📥</div><div class="sinfo"><h4>销售退货总额</h4><div class="n">¥'+fmt(totalReturn)+'</div></div></div><div class="scard"><div class="si" style="background:#f6ffed">💰</div><div class="sinfo"><h4>已收款</h4><div class="n">¥'+fmt((db.salesReceipts||[]).reduce(function(s,x){return s+x.amount},0))+'</div></div></div><div class="scard"><div class="si" style="background:#fff7e6">📊</div><div class="sinfo"><h4>净销售额</h4><div class="n">¥'+fmt(totalOut-totalReturn)+'</div></div></div></div><div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>按客户统计 (Top5)</strong></div><table class="edt-tbl"><thead><tr><th>客户</th><th>销售金额</th></tr></thead><tbody>'+top.map(function(e){return'<tr><td>'+e[0]+'</td><td>¥'+fmt(e[1])+'</td></tr>'}).join('')+'</tbody></table></div>';}
function invStats(c){let db=GD(),totalQty=db.inventory.reduce(function(s,i){return s+(i.qty||0)},0),totalValue=db.inventory.reduce(function(s,i){var g=db.goods.find(function(x){return x.id===i.goodsId});return s+(i.qty||0)*(g?g.costPrice:0)},0),byCat={};db.goods.forEach(function(g){byCat[g.category||'未分类']=(byCat[g.category||'未分类']||0)+1});c.innerHTML='<h2 style="margin-bottom:12px">📦 库存统计报表</h2><div class="stats"><div class="scard"><div class="si" style="background:#e6f7ff">📦</div><div class="sinfo"><h4>商品种类</h4><div class="n">'+db.goods.length+'</div></div></div><div class="scard"><div class="si" style="background:#f6ffed">📋</div><div class="sinfo"><h4>库存总量</h4><div class="n">'+totalQty+'</div></div></div><div class="scard"><div class="si" style="background:#fff7e6">💎</div><div class="sinfo"><h4>库存总值</h4><div class="n">¥'+fmt(totalValue)+'</div></div></div><div class="scard"><div class="si" style="background:#fff2f0">⚠️</div><div class="sinfo"><h4>预警商品</h4><div class="n">'+db.inventory.filter(function(i){return i.qty<=i.warnQty}).length+'</div></div></div></div><div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>按类别统计</strong></div><table class="edt-tbl"><thead><tr><th>类别</th><th>商品数</th></tr></thead><tbody>'+Object.entries(byCat).map(function(e){return'<tr><td>'+e[0]+'</td><td>'+e[1]+'</td></tr>'}).join('')+'</tbody></table></div>';}
function finStats(c){let db=GD(),sales=(db.salesOut||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0),purch=(db.purchaseIn||[]).reduce(function(s,x){return s+(x.totalAmt||0)},0),inc=(db.incomeRecords||[]).reduce(function(s,x){return s+(x.amount||0)},0),exp=(db.expenseRecords||[]).reduce(function(s,x){return s+(x.amount||0)},0),rcvd=(db.salesReceipts||[]).reduce(function(s,x){return s+(x.amount||0)},0),paid=(db.purchasePayments||[]).reduce(function(s,x){return s+(x.amount||0)},0);c.innerHTML='<h2 style="margin-bottom:12px">💳 财务报表</h2><div class="stats"><div class="scard"><div class="si" style="background:#f6ffed">💰</div><div class="sinfo"><h4>销售总额</h4><div class="n">¥'+fmt(sales)+'</div></div></div><div class="scard"><div class="si" style="background:#fff2f0">📊</div><div class="sinfo"><h4>采购总额</h4><div class="n">¥'+fmt(purch)+'</div></div></div><div class="scard"><div class="si" style="background:#e6f7ff">📈</div><div class="sinfo"><h4>其他收入</h4><div class="n">¥'+fmt(inc)+'</div></div></div><div class="scard"><div class="si" style="background:#fff7e6">📉</div><div class="sinfo"><h4>费用支出</h4><div class="n">¥'+fmt(exp)+'</div></div></div></div><div class="stats"><div class="scard"><div class="si" style="background:#e6f7ff">💳</div><div class="sinfo"><h4>已收款</h4><div class="n">¥'+fmt(rcvd)+'</div></div></div><div class="scard"><div class="si" style="background:#fff7e6">💳</div><div class="sinfo"><h4>已付款</h4><div class="n">¥'+fmt(paid)+'</div></div></div><div class="scard"><div class="si" style="background:#f6ffed">🎯</div><div class="sinfo"><h4>毛利</h4><div class="n">¥'+fmt(sales-purch)+'</div></div></div><div class="scard"><div class="si" style="background:#fff2f0">🏆</div><div class="sinfo"><h4>净利润</h4><div class="n">¥'+fmt(sales-purch+inc-exp)+'</div></div></div></div>';}

// ==================== 报价管理 ====================
function quotationPage(c){var db=GD();if(!db.quotations)db.quotations=[];var showBtn=!isAuditor()&&!isSupervisor()&&hasPerm("sales-quotation");c.innerHTML='<div class="tbar"><strong>报价管理</strong> <span class="spacer"></span><button class="btn btn-p" onclick="addQuotation()">+ 新增报价</button></div>'+rTable(['单号','客户','日期','金额','有效期','备注','状态','操作'],db.quotations.map(function(x){var soBtn=showBtn&&x.status!=='已转订单'?'<button class="btn btn-xs btn-p" onclick="qToSO('+x.id+')">转销售订单</button> ':'';return[x.code,gCName(x.customerId),fd(x.date),'¥'+fmt(x.totalAmt),fd(x.expiryDate),noteHtml(x),x.status==='已转订单'?'<span class="tag tag-green">已转订单</span>':'<span class="tag tag-blue">有效</span>','<button class="btn btn-xs btn-o" onclick="viewQuotation('+x.id+')">查看</button> '+soBtn+(hasPerm("sales-quotation")?'<button class="btn btn-xs btn-d" onclick="delQuotation('+x.id+')">删除</button>':'')]}),8)}
function addQuotation(){var db=GD();var code='BJ-'+now().replace(/-/g,'')+'-'+String((db.quotations||[]).length+1).padStart(3,'0');modal('新增报价','<div class="frow"><div class="fg"><label>单号</label><input id="qCode" value="'+code+'"></div><div class="fg"><label>客户</label><select id="qCustId">'+db.customers.map(function(c){return'<option value="'+c.id+'">'+c.name+'</option>'}).join('')+'</select></div></div><div class="frow"><div class="fg"><label>日期</label><input id="qDate" type="date" value="'+now()+'"></div><div class="fg"><label>有效期</label><input id="qExpiry" type="date" value="'+now()+'"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="qNote"></div></div><h4 style="margin:8px 0">报价明细</h4><table class="edt-tbl"><thead><tr><th>商品</th><th style="width:70px">数量</th><th style="width:90px">单价</th><th style="width:90px">金额</th><th style="width:50px">操作</th></tr></thead><tbody id="qDetail"><tr><td><select>'+db.goods.map(function(g){return'<option value="'+g.id+'">'+g.name+'('+(g.spec||'')+')</option>'}).join('')+'</select></td><td><input type="number" value="1" min="1" style="width:65px"></td><td><input type="number" value="0" step="0.01" style="width:85px"></td><td>-</td><td><button class="btn btn-xs btn-d" onclick="this.closest(\'tr\').remove()">×</button></td></tr></tbody></table><button class="btn btn-xs btn-o" style="margin-top:6px" onclick="var t=document.getElementById(\'qDetail\');var r=t.insertRow();r.innerHTML=t.rows[0].innerHTML">+ 添加明细</button>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveQuotation()">保存</button>')}
function saveQuotation(){
  if(!hasPerm("sales-quotation")){toast("无此页面操作权限");return}var db=GD(),customerId=parseInt(document.getElementById('qCustId').value);var rows=document.getElementById('qDetail').rows,details=[],total=0;for(var r=0;r<rows.length;r++){var sel=rows[r].cells[0].querySelector('select');if(!sel)continue;var goodsId=parseInt(sel.value);var qty=parseFloat(rows[r].cells[1].querySelector('input').value)||0;var price=parseFloat(rows[r].cells[2].querySelector('input').value)||0;if(!qty)continue;var amt=qty*price;details.push({goodsId:goodsId,qty:qty,price:price,amt:amt});total+=amt}if(!details.length){toast('请填写明细');return}var id=(db.quotations||[]).length+1;if(!db.quotations)db.quotations=[];db.quotations.push({id:id,code:document.getElementById('qCode').value,customerId:customerId,date:document.getElementById('qDate').value,expiryDate:document.getElementById('qExpiry').value,note:document.getElementById('qNote').value||'',details:details,totalAmt:total,status:'有效'});saveD(db);clsModal();nav('sales-quotation','报价管理');toast('报价已保存')}
function viewQuotation(id){var db=GD(),o=db.quotations.find(function(x){return x.id===id});if(!o)return;modal('报价详情 - '+o.code,'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div><strong>客户:</strong> '+gCName(o.customerId)+'</div><div><strong>日期:</strong> '+fd(o.date)+'</div><div><strong>有效期:</strong> '+fd(o.expiryDate)+'</div><div><strong>状态:</strong> '+o.status+'</div></div><table class="edt-tbl"><thead><tr><th>商品</th><th>数量</th><th>单价</th><th>金额</th></tr></thead><tbody>'+o.details.map(function(d){return'<tr><td>'+gGName(d.goodsId)+'</td><td>'+d.qty+'</td><td>¥'+fmt(d.price)+'</td><td>¥'+fmt(d.amt)+'</td></tr>'}).join('')+'</tbody></table><p style="margin-top:8px"><strong>合计: ¥'+fmt(o.totalAmt)+'</strong></p>','<button class="btn btn-o" onclick="clsModal()">关闭</button>')}
function qToSO(id){var db=GD(),o=db.quotations.find(function(x){return x.id===id});if(!o)return;if(!db.salesOrders)db.salesOrders=[];var soId=nid(db,'salesOrder');var code=gCode('XSDD','salesOrder');db.salesOrders.push({id:soId,code:code,date:now(),customerId:o.customerId,staffId:1,note:'来自报价:'+o.code,details:o.details,totalAmt:o.totalAmt,status:'草稿',outQty:0,auditStatus:'草稿'});o.status='已转订单';addRedDot(db,'salesOrder',soId,'staff');saveD(db);nav('sales-order','销售订单');toast('已转为销售订单 '+code)}
function delQuotation(id){var db=GD();db.quotations=db.quotations.filter(function(x){return x.id!==id});saveD(db);nav('sales-quotation','报价管理');toast('已删除')}

// ==================== 会员管理 ====================
function memberPage(c){var db=GD();if(!db.members)db.members=[];c.innerHTML='<div class="tbar"><strong>会员管理</strong> <span class="spacer"></span>'+(hasPerm("baseinfo-member")?'<button class="btn btn-p" onclick="addMember()">+ 新增会员</button>':'')+'</div>'+rTable(['姓名','手机号','等级','积分','余额','备注','操作'],db.members.map(function(m){return[m.name,m.phone,m.level||'普通','<b>'+m.points+'</b>','¥'+fmt(m.balance),noteHtml(m),'<button class="btn btn-xs btn-o" onclick="editMember('+m.id+')">详情</button> '+(hasPerm("baseinfo-member")?'<button class="btn btn-xs btn-p" onclick="rechargeMember('+m.id+')">充值</button> <button class="btn btn-xs btn-d" onclick="delMember('+m.id+')">删除</button>':'')]}),6)}
function addMember(){modal('新增会员','<div class="frow"><div class="fg"><label>姓名</label><input id="mName"></div><div class="fg"><label>手机号</label><input id="mPhone"></div></div><div class="frow"><div class="fg"><label>等级</label><select id="mLevel"><option>普通</option><option>银卡</option><option>金卡</option><option>钻石</option></select></div><div class="fg"><label>备注</label><input id="mNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveMember()">保存</button>')}
function saveMember(){
  if(!hasPerm("baseinfo-member")){toast("无此页面操作权限");return}var db=GD();if(!db.members)db.members=[];var id=db.members.length+1;db.members.push({id:id,name:document.getElementById('mName').value,phone:document.getElementById('mPhone').value,level:document.getElementById('mLevel').value,points:0,balance:0,note:document.getElementById('mNote').value||''});saveD(db);clsModal();nav('baseinfo-member','会员管理');toast('会员已添加')}
function rechargeMember(id){var db=GD(),m=db.members.find(function(x){return x.id===id});if(!m)return;modal('会员充值 - '+m.name,'<div class="frow"><div class="fg"><label>当前余额: ¥'+fmt(m.balance)+'</label></div><div class="frow"><div class="fg"><label>充值金额</label><input id="rcAmt" type="number" step="0.01" min="0"></div><div class="fg"><label>赠送积分</label><input id="rcPts" type="number" min="0" value="0"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="rcNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveRecharge('+id+')">确认充值</button>')}
function saveRecharge(id){var db=GD(),m=db.members.find(function(x){return x.id===id});if(!m)return;var amt=parseFloat(document.getElementById('rcAmt').value)||0;var pts=parseInt(document.getElementById('rcPts').value)||0;if(!amt){toast('请输入充值金额');return}m.balance=(m.balance||0)+amt;m.points=(m.points||0)+pts;if(!db.memberRecharges)db.memberRecharges=[];db.memberRecharges.push({id:db.memberRecharges.length+1,memberId:id,name:m.name,amount:amt,points:pts,date:now(),note:document.getElementById('rcNote').value||''});saveD(db);clsModal();nav('baseinfo-member','会员管理');toast('充值成功 ¥'+fmt(amt))}
function editMember(id){var db=GD(),m=db.members.find(function(x){return x.id===id});if(!m)return;var rcList=(db.memberRecharges||[]).filter(function(x){return x.memberId===id});modal('会员详情 - '+m.name,'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div><strong>手机:</strong> '+m.phone+'</div><div><strong>等级:</strong> '+m.level+'</div><div><strong>积分:</strong> '+m.points+'</div><div><strong>余额:</strong> ¥'+fmt(m.balance)+'</div></div>'+(rcList.length>0?'<h4>充值记录</h4><table class="edt-tbl"><thead><tr><th>日期</th><th>金额</th><th>积分</th><th>备注</th></tr></thead><tbody>'+rcList.map(function(rc){return'<tr><td>'+fd(rc.date)+'</td><td>¥'+fmt(rc.amount)+'</td><td>+'+rc.points+'</td><td>'+rc.note+'</td></tr>'}).join('')+'</tbody></table>':'<p style="color:#aaa">暂无充值记录</p>'),'<button class="btn btn-o" onclick="clsModal()">关闭</button>')}
function delMember(id){var db=GD();db.members=db.members.filter(function(x){return x.id!==id});saveD(db);nav('baseinfo-member','会员管理');toast('已删除')}

// ==================== 快递物流 ====================
function logisticsPage(c){c.innerHTML='<div class="tbar"><strong>快递物流查询</strong></div><div style="text-align:center;padding:30px"><div class="frow"><div class="fg"><label>快递单号</label><input id="logNo" style="width:300px" placeholder="请输入快递单号"></div></div><div class="frow"><div class="fg"><label>快递公司</label><select id="logCompany" style="width:300px"><option value="shunfeng">顺丰速运</option><option value="yuantong">圆通速递</option><option value="zhongtong">中通快递</option><option value="yunda">韵达快递</option><option value="shentong">申通快递</option><option value="jd">京东物流</option><option value="post">邮政快递</option></select></div></div><button class="btn btn-p" style="margin-top:12px" onclick="var no=document.getElementById(\'logNo\').value;var co=document.getElementById(\'logCompany\').value;if(!no){toast(\'请输入快递单号\');return}window.open(\'https://www.kuaidi100.com/chaxun?com=\'+co+\'\\&nu=\'+no,\'_blank\')">查询物流</button><p style="color:#999;font-size:11px;margin-top:10px">将跳转到快递100查询页面</p></div>'}

// ==================== POS收银台 ====================
function posPage(c){var db=GD();c.innerHTML='<div class="tbar"><strong>POS收银台</strong></div><div style="display:grid;grid-template-columns:2fr 1fr;gap:12px"><div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>商品列表</strong><span class="spacer"></span><input placeholder="搜索商品..." id="posSearch" oninput="posRefresh()" style="width:200px"></div><table class="edt-tbl"><thead><tr><th>商品</th><th>单价</th><th>库存</th><th>操作</th></tr></thead><tbody id="posGoodsList">'+db.goods.map(function(g){var inv=db.inventory.find(function(i){return i.goodsId===g.id});var stock=inv?inv.qty:0;return'<tr><td><b>'+g.name+'</b><br><span style="font-size:10px;color:#999">'+(g.spec||'')+'</span></td><td>¥'+fmt(g.retailPrice||g.purchPrice||0)+'</td><td>'+stock+'</td><td><button class="btn btn-xs btn-p" onclick="posAddItem('+g.id+')">加入</button></td></tr>'}).join('')+'</tbody></table></div><div class="twrap"><div class="tbar" style="margin:0;border-radius:0;box-shadow:none"><strong>购物车</strong></div><table class="edt-tbl"><thead><tr><th>商品</th><th>数量</th><th>金额</th><th>操作</th></tr></thead><tbody id="posCart"><tr><td colspan="4" style="text-align:center;color:#ccc">购物车为空</td></tr></tbody></table><div style="padding:10px;border-top:1px solid #e8e8e8"><strong>合计: </strong><span id="posTotal" style="font-size:18px;color:#ff4d4f;font-weight:700">¥0.00</span></div><div style="padding:0 10px 10px"><strong>收款方式:</strong> <select id="posPayMethod"><option>现金</option><option>微信</option><option>支付宝</option><option>银行卡</option></select></div><button class="btn btn-p" style="margin:10px;width:calc(100% - 20px)" onclick="posCheckout()">结算收款</button></div></div>';window._posCart=[]}
function posAddItem(gid){var db=GD();var g=db.goods.find(function(x){return x.id===gid});if(!g)return;var cart=window._posCart||[];var existing=cart.find(function(c){return c.goodsId===gid});if(existing){existing.qty++}else{cart.push({goodsId:gid,name:g.name,price:g.retailPrice||g.purchPrice||0,qty:1})}window._posCart=cart;posRenderCart();toast('已加入购物车')}
function posRenderCart(){var cart=window._posCart||[];var tbody=document.getElementById('posCart');if(!tbody)return;if(!cart.length){tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:#ccc">购物车为空</td></tr>';document.getElementById('posTotal').textContent='¥0.00';return}var total=0;tbody.innerHTML=cart.map(function(c,idx){var amt=c.price*c.qty;total+=amt;return'<tr><td>'+c.name+'</td><td><input type="number" value="'+c.qty+'" min="1" style="width:50px" onchange="posUpdateQty('+idx+',this.value)"></td><td>¥'+fmt(amt)+'</td><td><button class="btn btn-xs btn-d" onclick="posRemoveItem('+idx+')">×</button></td></tr>'}).join('');document.getElementById('posTotal').textContent='¥'+fmt(total)}
function posUpdateQty(idx,val){var cart=window._posCart||[];cart[idx].qty=parseInt(val)||1;posRenderCart()}
function posRemoveItem(idx){var cart=window._posCart||[];cart.splice(idx,1);posRenderCart()}
function posCheckout(){var cart=window._posCart||[];if(!cart.length){toast('购物车为空');return}var db=GD();var total=cart.reduce(function(s,c){return s+c.price*c.qty},0);var payMethod=document.getElementById('posPayMethod').value;if(!db.posOrders)db.posOrders=[];var id=db.posOrders.length+1;db.posOrders.push({id:id,code:'POS-'+now().replace(/-/g,'')+'-'+String(id).padStart(3,'0'),date:now(),items:cart,totalAmt:total,payMethod:payMethod});cart.forEach(function(c){var inv=db.inventory.find(function(i){return i.goodsId===c.goodsId});if(inv)inv.qty=Math.max(0,(inv.qty||0)-c.qty)});window._posCart=[];saveD(db);posRenderCart();toast('收款成功 ¥'+fmt(total)+' ('+payMethod+')')}
function posRefresh(){var kw=(document.getElementById('posSearch').value||'').toLowerCase();var db=GD();var tbody=document.getElementById('posGoodsList');if(!tbody)return;tbody.innerHTML=db.goods.filter(function(g){return!kw||g.name.toLowerCase().indexOf(kw)>=0}).map(function(g){var inv=db.inventory.find(function(i){return i.goodsId===g.id});var stock=inv?inv.qty:0;return'<tr><td><b>'+g.name+'</b><br><span style="font-size:10px;color:#999">'+(g.spec||'')+'</span></td><td>¥'+fmt(g.retailPrice||g.purchPrice||0)+'</td><td>'+stock+'</td><td><button class="btn btn-xs btn-p" onclick="posAddItem('+g.id+')">加入</button></td></tr>'}).join('')}

// ==================== 发票管理 ====================
function invoicePage(c){var db=GD();if(!db.invoices)db.invoices=[];c.innerHTML='<div class="tbar"><strong>发票管理</strong> <span class="spacer"></span><button class="btn btn-p" onclick="addInvoice()">+ 新增发票</button></div>'+rTable(['发票号','类型','购买方','不含税','税额','价税合计','日期','附件','状态'],db.invoices.map(function(x){return[x.code,x.type,x.buyerName||'-','¥'+fmt(x.amount),'¥'+fmt(x.taxAmt||0),'¥'+fmt(x.totalAmt||0),fd(x.date),(x.attachment?'<span class="tag tag-green">有附件</span>':'<span class="tag tag-gray">无</span>')+' <button class="btn btn-xs btn-o" onclick="viewInvoice('+x.id+')">查看</button>',x.status==='已开'?'<span class="tag tag-green">已开</span>':'<span class="tag tag-orange">待开</span>']}),10)}
function addInvoice(){var db=GD();var code='FP-'+now().replace(/-/g,'')+'-'+String((db.invoices||[]).length+1).padStart(3,'0');if(!db.invoices)db.invoices=[];modal('新增发票','<div class="frow"><div class="fg"><label>发票号</label><input id="invCode" value="'+code+'"></div><div class="fg"><label>类型</label><select id="invType"><option>增值税普通发票</option><option>增值税专用发票</option><option>电子发票（普通发票）</option><option>电子发票（专用发票）</option><option>普通发票</option></select></div></div><div class="frow"><div class="fg"><label>关联销售单</label><select id="invSoId"><option value="">不关联</option>'+((db.salesOut||[]).filter(function(x){return x.auditStatus==='已审核'}).map(function(x){return'<option value="'+x.id+'">'+x.code+'</option>'}).join(''))+'</select></div><div class="fg"><label>开票日期</label><input id="invDate" type="date" value="'+now()+'"></div></div><div class="frow"><div class="fg"><label>购买方名称</label><input id="invBuyerName" readonly style="background:#f5f5f5"></div><div class="fg"><label>购买方税号</label><input id="invBuyerTax" readonly style="background:#f5f5f5"></div></div><div class="frow"><div class="fg"><label>销售方名称</label><input id="invSellerName" readonly style="background:#f5f5f5"></div><div class="fg"><label>销售方税号</label><input id="invSellerTax" readonly style="background:#f5f5f5"></div></div><h4 style="margin:8px 0;border-bottom:1px solid #eee;padding-bottom:4px">📋 货物/服务明细 (自动识别)</h4><div class="frow"><div class="fg"><label>项目名称</label><input id="invItemName" readonly style="background:#f5f5f5"></div><div class="fg"><label>规格型号</label><input id="invSpec" readonly style="background:#f5f5f5"></div></div><div class="frow"><div class="fg"><label>单位</label><input id="invUnit" readonly style="background:#f5f5f5"></div><div class="fg"><label>数量</label><input id="invQty" readonly style="background:#f5f5f5"></div></div><div class="frow"><div class="fg"><label>单价</label><input id="invPrice" readonly style="background:#f5f5f5"></div><div class="fg"><label>金额(不含税)</label><input id="invAmt" type="number" step="0.01" min="0"></div></div><div class="frow"><div class="fg"><label>税率(%)</label><input id="invTaxRate" type="number" value="13" min="0" max="100"></div><div class="fg"><label>税额</label><input id="invTaxAmt" type="number" step="0.01" min="0" readonly style="background:#f5f5f5"></div></div><div class="frow"><div class="fg"><label>价税合计(大写)</label><input id="invTotalCap" readonly style="background:#f5f5f5"></div><div class="fg"><label>价税合计(小写)</label><input id="invTotal" type="number" step="0.01" min="0"></div></div><div class="frow c1"><div class="fg"><label>货物明细文本</label><textarea id="invItems" rows="2" style="width:100%;font-size:11px" readonly></textarea></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="invNote"></div></div><div style="margin-top:10px;padding:10px;border:2px dashed #ccc;border-radius:8px;text-align:center"><strong style="color:#666">📎 上传发票PDF附件</strong><br><input type="file" id="invFile" accept=".pdf" style="margin-top:8px" onchange="parseInvoicePDF()"><div id="invParseStatus" style="font-size:11px;color:#999;margin-top:4px">支持增值税发票PDF自动识别</div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveInvoice()">保存</button>')}
function parseInvoicePDF(){
  var file=document.getElementById('invFile').files[0];
  if(!file)return;
  var statusEl=document.getElementById('invParseStatus');
  if(statusEl){statusEl.innerHTML='<span style="color:#1890ff">Step 1/3: 解析PDF文本...</span>'}
  var reader=new FileReader();
  reader.onload=function(e){
    var typedarray=new Uint8Array(e.target.result);
    function doParse(){
      if(typeof window.pdfjsLib==='undefined'||!window.pdfjsLib.getDocument){
        if(statusEl){statusEl.innerHTML='<span style="color:#1890ff">正在加载 PDF 解析库…</span>'}
        loadPdfJS(function(pdfErr){
          if(pdfErr){if(statusEl){statusEl.innerHTML='<span style="color:#f5222d">PDF 解析库加载失败，请检查网络后重试</span>'}return}
          doParse();
        });
        return;
      }
      window.pdfjsLib.getDocument({data:typedarray}).promise.then(function(pdf){
        var allPages=[];
        var doneP=0,totalP=Math.min(pdf.numPages,5);
        function onAllPages(){
          // Step 2: 生成结构化 Markdown
          if(statusEl){statusEl.innerHTML='<span style="color:#1890ff">Step 2/3: 生成Markdown...</span>'}
          var rawText=allPages.join('\n\n');
          console.log('=== PDF原始文本 ===\n'+rawText);
          var md=buildInvoiceMarkdown(rawText);
          console.log('=== 生成的Markdown ===\n'+md);

          // Step 3: 下载md并解析填表
          if(statusEl){statusEl.innerHTML='<span style="color:#1890ff">Step 3/3: 解析并填充字段...</span>'}
          // 触发下载
          downloadMdFile(md,'发票识别结果_'+file.name.replace(/\.pdf$/i,'')+'.md');
          // 从markdown提取字段填入表单
          parseMdAndFill(md);
          if(statusEl){statusEl.innerHTML='<span style="color:#52c41a">✅ 识别完成！Markdown文件已下载，字段已自动填入</span>'}
        }
        for(var pn=1;pn<=totalP;pn++){
          (function(n){
            pdf.getPage(n).then(function(page){
              return page.getTextContent();
            }).then(function(tc){
              var items=tc.items.slice().sort(function(a,b){
                var ya=Math.round(a.transform[5]),yb=Math.round(b.transform[5]);
                if(Math.abs(ya-yb)<=5)return Math.round(a.transform[4])-Math.round(b.transform[4]);
                return ya-yb;
              });
              var lines=[],cy=null,cl='';
              for(var k=0;k<items.length;k++){
                var it=items[k],y=Math.round(it.transform[5]);
                if(cy===null){cy=y;cl=it.str}
                else if(Math.abs(y-cy)<=5){cl+=' '+it.str}
                else{lines.push(cl);cy=y;cl=it.str}
              }
              if(cl)lines.push(cl);
              // 合并续行 — 不含数字且非标签的短行拼到上一行
              var merged=[];
              for(var m=0;m<lines.length;m++){
                var l=lines[m].trim();
                if(!l)continue;
                if(!/\d/.test(l)&&l.length<30&&merged.length>0&&
                   !/^(购|买|销|售|方|信|息|名称|统一|纳税人|识别号|项目|规格|单位|数量|单价|金额|税率|征收率|税额|备注|开票人|密码|机器|校验|接收|价税合计|合)/.test(l)){
                  merged[merged.length-1]+=l;
                }else{merged.push(l)}
              }
              allPages[n-1]=merged.join('\n');
              doneP++;if(doneP>=totalP)onAllPages();
            }).catch(function(err){
              allPages[n-1]='(page error: '+err.message+')';
              doneP++;if(doneP>=totalP)onAllPages();
            });
          })(pn);
        }
      }).catch(function(err){
        if(statusEl){statusEl.innerHTML='<span style="color:#ff4d4f">PDF无法打开：'+err.message+'</span>'}
      });
    }
    doParse();
  };
  reader.readAsArrayBuffer(file);
}

// ===== 构建结构化 Markdown =====
function buildInvoiceMarkdown(rawText){
  // 将 pdf.js 原始文本按间距缩窄（保留原始布局），转为 Markdown
  // 减少多余空格：超过2个空格压缩为1个，但保留换行
  var compact=rawText.replace(/[ ]{3,}/g,'  ').replace(/\n{3,}/g,'\n\n');
  var lines=compact.split('\n').filter(function(l){return l.trim().length>0});
  var text=compact;
  var md='# 发票识别结果\n\n';
  md+='> 自动识别，请核对\n\n---\n\n## 基本信息\n\n';

  // 发票类型
  var invType='';
  if(text.indexOf('专用发票')>=0){invType='增值税专用发票'}
  else if(text.indexOf('电子发票')>=0&&text.indexOf('普通发票')>=0){invType='电子发票（普通发票）'}
  else if(text.indexOf('电子发票')>=0&&text.indexOf('专用')>=0){invType='电子发票（专用发票）'}
  else if(text.indexOf('电子发票')>=0){invType='电子发票'}
  else if(text.indexOf('增值税')>=0&&text.indexOf('普通')>=0){invType='增值税普通发票'}
  else if(text.indexOf('增值税')>=0&&text.indexOf('专用')>=0){invType='增值税专用发票'}
  else if(text.indexOf('普通发票')>=0){invType='普通发票'}

  // 发票号码 — 在含"发票号码"的行中找
  var codeStr='';
  for(var i=0;i<lines.length;i++){
    if(lines[i].indexOf('发票号码')>=0){var cm=lines[i].match(/(\d{10,20})/);if(cm){codeStr=cm[1];break}}
  }

  // 开票日期
  var dateStr='';
  for(var i=0;i<lines.length;i++){
    if(lines[i].indexOf('开票日期')>=0||lines[i].indexOf('日期')>=0){
      var dm=lines[i].match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if(dm){dateStr=dm[1]+'-'+dm[2].padStart(2,'0')+'-'+dm[3].padStart(2,'0');break}
      dm=lines[i].match(/(20\d{2}-\d{2}-\d{2})/);
      if(dm){dateStr=dm[1];break}
    }
  }

  md+='| 字段 | 值 |\n|------|-----|\n';
  md+='| **发票类型** | '+invType+' |\n';
  md+='| **发票号码** | '+codeStr+' |\n';
  md+='| **开票日期** | '+dateStr+' |\n';

  // 购/销双方名称 — 找"名称"标签后连续的完整实体名称
  var buyerName='',sellerName='';
  for(var i=0;i<lines.length;i++){
    var l=lines[i];
    // 找所有"名称"出现的位置
    var idx=0;
    while(idx<l.length){
      var pos=l.indexOf('名称',idx);
      if(pos<0)break;
      // 确保后面紧跟 : 或 ：
      var ch=l.charAt(pos+2);
      if(ch!==':'&&ch!=='：'){idx=pos+2;continue}
      // 取": "后面的内容
      var start=pos+3;
      // 跳过冒号后面的空格
      while(start<l.length&&l[start]===' ')start++;
      // 找到下一个分界符（空格、汉字结束符或"信"方"等）
      var end=start;
      while(end<l.length&&l[end]!==' '&&l[end]!=='售'&&l[end]!=='购'&&l[end]!=='买'&&l[end]!=='信'&&l[end]!=='方')end++;
      var nameText=l.substring(start,end).trim();
      // 如果不是纯数字且长度>=4
      if(nameText.length>=4&&!/^\d+$/.test(nameText)){
        if(!buyerName){buyerName=nameText}
        else if(!sellerName&&nameText!==buyerName){sellerName=nameText}
      }
      idx=end;
    }
  }
  // 兜底：如果一方仍不够（pdf.js token拆分导致长度不够），从整行补全
  if(!buyerName||buyerName.length<4||!sellerName||sellerName.length<4){
    for(var i=0;i<lines.length;i++){
      var l=lines[i];
      if(l.indexOf('名称')>=0)continue; // 跳过含名称标签的行
      var clean=l.replace(/\s{2,}/g,' ').trim();
      // 长度4-60，含中文字符，不含数字（排除金额行），不含发票关键字
      if(clean.length>=4&&clean.length<60&&
         /[一-龥]/.test(clean)&&
         !/\d/.test(clean)&&
         !/发票|税号|代码|日期|统一|识别号|项目|规格|单位|数量|金额|税率|税额|合计|价税|备注|开票|密码|机器|校验|大写|小写/.test(clean)){
        if((!buyerName||buyerName.length<4)&&clean!==sellerName){buyerName=clean}
        else if((!sellerName||sellerName.length<4)&&clean!==buyerName){sellerName=clean}
      }
    }
  }

  // 信用代码 — 找15-20位数字/字母（排除发票号码前缀和金额）
  var invoiceCode='';
  for(var i=0;i<lines.length;i++){
    if(lines[i].indexOf('发票号码')>=0){var cm2=lines[i].match(/(\d{10,20})/);if(cm2)invoiceCode=cm2[1];break}
  }
  var allTax=[];
  for(var i=0;i<lines.length;i++){
    // 匹配15-20位的数字字母串（统一社会信用代码可含字母）
    var tgm=lines[i].match(/[A-Za-z0-9]{15,20}/g);
    if(tgm){
      for(var j=0;j<tgm.length;j++){
        var tid=tgm[j];
        // 跳过纯数字且与发票号码前若干位相同的
        if(invoiceCode&&/^\d+$/.test(tid)&&invoiceCode.indexOf(tid)===0)continue;
        // 跳过可能是金额的（含.或¥前缀）
        if(tid.indexOf('.')>=0)continue;
        // 确保至少含一个数字（不是纯字母）
        if(!/\d/.test(tid))continue;
        // 去重
        if(allTax.indexOf(tid)<0)allTax.push(tid);
      }
    }
  }
  var buyerTax=allTax.length>=1?allTax[0]:'';
  var sellerTax=allTax.length>=2?allTax[1]:'';

  md+='\n---\n\n## 购买方信息\n\n';
  md+='| 字段 | 值 |\n|------|-----|\n';
  md+='| **名称** | '+buyerName+' |\n';
  md+='| **统一社会信用代码/纳税人识别号** | '+buyerTax+' |\n';

  md+='\n---\n\n## 销售方信息\n\n';
  md+='| 字段 | 值 |\n|------|-----|\n';
  md+='| **名称** | '+sellerName+' |\n';
  md+='| **统一社会信用代码/纳税人识别号** | '+sellerTax+' |\n';

  // 货物明细 — 从含*的行提取
  var itemName='',itemSpec='',itemUnit='',itemQty='',itemPrice='',itemAmt='',itemRate='',itemTax='';
  for(var i=0;i<lines.length;i++){
    if(lines[i].indexOf('*')<0)continue;
    if(lines[i].indexOf('项目名称')>=0||lines[i].indexOf('规格型号')>=0||lines[i].indexOf('税率/征收率')>=0)continue;
    var parts=lines[i].split(/\s+/);
    var nums=[],texts=[];
    for(var p=0;p<parts.length;p++){
      if(/^[\d.]+$/.test(parts[p])||/^\d+%$/.test(parts[p])){nums.push(parts[p])}
      else if(parts[p].length>0){texts.push(parts[p])}
    }
    // 项目名称：收集 texts 中第一个*开头的 token 及后续 token，直到遇到单字量词
    var UNIT_LIST='个件台箱桶袋盒吨套瓶只支组部辆方米升卷包把根片块项场次张天';
    var nameParts=[];
    for(var t2=0;t2<texts.length;t2++){
      var tx=texts[t2];
      // 遇到单字量词 → 项目名称到此结束
      if(tx.length===1&&UNIT_LIST.indexOf(tx)>=0){itemUnit=tx;break}
      if(tx.indexOf('*')>=0||nameParts.length>0){
        nameParts.push(tx);
      }
    }
    itemName=nameParts.join('');
    // 规格型号：texts 中在项目名称 token 之后、量词之前的第一个短文本（如"无"）
    if(nameParts.length>0&&texts.length>nameParts.length){
      var specTx=texts[nameParts.length];
      if(specTx&&specTx.length<=4&&!/^[个件台箱桶袋盒吨套瓶只支组部辆方米升卷包把根片块项场次张天]$/.test(specTx)){
        itemSpec=specTx;
      }
    }
    if(nums.length>=5){
      itemQty=nums[0];itemPrice=nums[1];itemAmt=nums[2];itemRate=nums[3].replace('%','');itemTax=nums[4];
    }else if(nums.length>=4){
      if(nums[3].indexOf('%')>=0){itemQty=nums[0];itemPrice=nums[1];itemAmt=nums[2];itemRate=nums[3].replace('%','')}
      else{itemPrice=nums[0];itemAmt=nums[1];itemRate=nums[2].replace('%','');itemTax=nums[3]}
    }else if(nums.length>=3){
      itemPrice=nums[0];itemAmt=nums[1];itemTax=nums[2];
    }
    break;
  }

  md+='\n---\n\n## 货物/服务明细\n\n';
  md+='| 字段 | 值 |\n|------|-----|\n';
  md+='| **项目名称** | '+itemName+' |\n';
  md+='| **规格型号** | '+itemSpec+' |\n';
  md+='| **单位** | '+itemUnit+' |\n';
  md+='| **数量** | '+itemQty+' |\n';
  md+='| **单价** | '+itemPrice+' |\n';
  md+='| **金额（不含税）** | '+itemAmt+' |\n';
  md+='| **税率/征收率** | '+itemRate+'% |\n';
  md+='| **税额** | '+itemTax+' |\n';

  // 价税合计 — 从"价税合计"相关行提取
  var capAmt='',smallAmt='';
  for(var i=0;i<lines.length;i++){
    var capM=lines[i].match(/[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元整角分圆]{2,}/);
    if(capM&&!capAmt){capAmt=capM[0]}
    if(lines[i].indexOf('价税合计')>=0||lines[i].indexOf('小写')>=0){
      var sm=lines[i].match(/[¥￥]\s*([\d.]+)/);
      if(sm){smallAmt=sm[1]}
    }
  }
  if(!smallAmt){
    var mv=0;
    for(var i=0;i<lines.length;i++){
      var sm2=lines[i].match(/[¥￥]\s*([\d.]+)/);
      if(sm2){var v=parseFloat(sm2[1]);if(v>mv){mv=v;smallAmt=sm2[1]}}
    }
  }

  md+='\n---\n\n## 金额汇总\n\n';
  md+='| 字段 | 值 |\n|------|-----|\n';
  md+='| **合计金额** | ¥'+itemAmt+' |\n';
  md+='| **合计税额** | ¥'+itemTax+' |\n';
  md+='| **价税合计（大写）** | '+capAmt+' |\n';
  md+='| **价税合计（小写）** | ¥'+smallAmt+' |\n';

  // 备注/开票人
  var note='',drawer='';
  for(var i=0;i<lines.length;i++){
    if(lines[i].indexOf('备')>=0&&lines[i].indexOf('注')>=0&&i+1<lines.length&&lines[i+1].length>2&&!/^(购|买|销|售|开票)/.test(lines[i+1])){
      note=lines[i+1].trim();
    }
    if(lines[i].indexOf('开票人')>=0){
      drawer=lines[i].replace(/.*开票人[：:]\s*/,'').trim();
    }
  }
  if(note||drawer){
    md+='\n---\n\n## 备注\n\n';
    if(note)md+=note+'\n';
    if(drawer)md+='\n开票人：'+drawer+'\n';
  }

  return md;
}

// ===== 下载 Markdown 文件 =====
function downloadMdFile(mdContent,filename){
  var blob=new Blob(['﻿'+mdContent],{type:'text/markdown;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== 从 Markdown 解析字段并填入表单 =====
function parseMdAndFill(md){
  function extract(key){
    var escaped = '';
    for (var i = 0; i < key.length; i++) {
      var ch = key.charAt(i);
      if ('\\^$*+?.()|{}[]'.indexOf(ch) >= 0) escaped += '\\';
      escaped += ch;
    }
    var re = new RegExp('\\|\\s*\\*\\*' + escaped + '\\*\\*\\s*\\|\\s*(.+?)\\s*\\|');
    var m=md.match(re);
    return m?m[1].trim():'';
  }

  var invType=extract('发票类型');
  if(invType){var sel=document.getElementById('invType');if(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].value===invType){sel.selectedIndex=i;break}}}}

  var code=extract('发票号码'); if(code)setVal('invCode',code);
  var date=extract('开票日期'); if(date)setVal('invDate',date);

  var buyerSection=md.substring(md.indexOf('购买方信息'),md.indexOf('销售方信息')>0?md.indexOf('销售方信息'):md.length);
  var sellerSection=md.indexOf('销售方信息')>0?md.substring(md.indexOf('销售方信息'),md.indexOf('货物/服务明细')>0?md.indexOf('货物/服务明细'):md.length):'';

  var bName2=extractFromSection(buyerSection,'名称');
  var bTax=extractFromSection(buyerSection,'统一社会信用代码/纳税人识别号');
  var sName2=extractFromSection(sellerSection,'名称');
  var sTax=extractFromSection(sellerSection,'统一社会信用代码/纳税人识别号');

  if(bName2)setVal('invBuyerName',bName2);
  if(bTax)setVal('invBuyerTax',bTax);
  if(sName2)setVal('invSellerName',sName2);
  if(sTax)setVal('invSellerTax',sTax);

  var detailSection=md.indexOf('货物/服务明细')>0?md.substring(md.indexOf('货物/服务明细'),md.indexOf('金额汇总')>0?md.indexOf('金额汇总'):md.length):'';
  var itName=extractFromSection(detailSection,'项目名称');
  var itSpec=extractFromSection(detailSection,'规格型号');
  var itUnit=extractFromSection(detailSection,'单位');
  var itQty=extractFromSection(detailSection,'数量');
  var itPrice=extractFromSection(detailSection,'单价');
  var itAmt=extractFromSection(detailSection,'金额（不含税）');
  var itRate=extractFromSection(detailSection,'税率/征收率');
  var itTax=extractFromSection(detailSection,'税额');

  if(itName)setVal('invItemName',itName);
  if(itSpec)setVal('invSpec',itSpec);
  if(itUnit)setVal('invUnit',itUnit);
  if(itQty)setVal('invQty',itQty);
  if(itPrice)setVal('invPrice',itPrice);
  if(itAmt)setVal('invAmt',itAmt);
  if(itRate){setVal('invTaxRate',itRate.replace('%',''))}
  if(itTax)setVal('invTaxAmt',itTax);

  var summarySection=md.indexOf('金额汇总')>0?md.substring(md.indexOf('金额汇总'),md.indexOf('备注')>0?md.indexOf('备注'):md.length):'';
  var cap=extractFromSection(summarySection,'价税合计（大写）');
  var small=extractFromSection(summarySection,'价税合计（小写）');
  if(cap)setVal('invTotalCap',cap);
  if(small){setVal('invTotal',small.replace('¥','').trim())}

  var itParts=[];
  if(itName)itParts.push('项目:'+itName);
  if(itSpec)itParts.push('规格:'+itSpec);
  if(itUnit)itParts.push('单位:'+itUnit);
  if(itQty)itParts.push('数量:'+itQty);
  if(itPrice)itParts.push('单价:¥'+itPrice);
  if(itAmt)itParts.push('金额:¥'+itAmt);
  if(itRate)itParts.push('税率:'+itRate);
  if(itTax)itParts.push('税额:¥'+itTax);
  if(itParts.length)setVal('invItems',itParts.join(' | '));
}

function extractFromSection(section,key){
  if(!section)return '';
  var escaped = '';
  for (var i = 0; i < key.length; i++) {
    var ch = key.charAt(i);
    if ('\\^$*+?.()|{}[]'.indexOf(ch) >= 0) escaped += '\\';
    escaped += ch;
  }
  var re=new RegExp('\\|\\s*\\*\\*'+escaped+'\\*\\*\\s*\\|\\s*(.+?)\\s*\\|');
  var m=section.match(re);
  return m?m[1].trim():'';
}

function setVal(id,val){if(val&&document.getElementById(id))document.getElementById(id).value=val}
function saveInvoice(){var db=GD(),soId=parseInt(document.getElementById('invSoId').value)||null;var amount=parseFloat(document.getElementById('invAmt').value)||0,taxRate=parseFloat(document.getElementById('invTaxRate').value)||0,taxAmt2=parseFloat(document.getElementById('invTaxAmt').value)||0,total2=parseFloat(document.getElementById('invTotal').value)||(amount+taxAmt2);var buyerName=getF('invBuyerName');var buyerTax=getF('invBuyerTax');var sellerName=getF('invSellerName');var sellerTax=getF('invSellerTax');var items=getF('invItems');var itemName=getF('invItemName');var spec=getF('invSpec');var unit=getF('invUnit');var qty=getF('invQty');var price=getF('invPrice');var totalCap=getF('invTotalCap');if(!amount&&!total2){toast('请输入金额');return}var taxF=taxAmt2||(amount*taxRate/100);var totalF=total2||(amount+taxF);if(!db.invoices)db.invoices=[];var so=soId?db.salesOut.find(function(x){return x.id===soId}):null;var fileInput=document.getElementById('invFile');if(fileInput&&fileInput.files&&fileInput.files[0]){var f=fileInput.files[0];var reader=new FileReader();reader.readAsDataURL(f);reader.onload=function(ev){saveInv(db,soId,so,amount,taxRate,taxF,totalF,ev.target.result,f.name,buyerName,buyerTax,sellerName,sellerTax,items,itemName,spec,unit,qty,price,totalCap)};return}saveInv(db,soId,so,amount,taxRate,taxF,totalF,null,null,buyerName,buyerTax,sellerName,sellerTax,items,itemName,spec,unit,qty,price,totalCap)}
function saveInv(db,soId,so,amount,taxRate,taxAmt,total,att,attName,buyerName,buyerTax,sellerName,sellerTax,items,itemName,spec,unit,qty,price,totalCap){db.invoices.push({id:db.invoices.length+1,code:document.getElementById('invCode').value,type:document.getElementById('invType').value,salesOutId:soId,salesOutCode:so?so.code:null,amount:amount,taxRate:taxRate,taxAmt:taxAmt,totalAmt:total,totalCap:totalCap,date:document.getElementById('invDate').value,note:document.getElementById('invNote').value||'',status:'已开',attachment:att,attachmentName:attName||'',buyerName:buyerName,buyerTax:buyerTax,sellerName:sellerName,sellerTax:sellerTax,items:items,itemName:itemName,spec:spec,unit:unit,qty:qty,price:price});saveD(db);clsModal();nav('more-invoice','发票管理');toast('发票已保存')}
function getF(id){var el=document.getElementById(id);return el?el.value:''}
function delInvoice(id){var db=GD();db.invoices=db.invoices.filter(function(x){return x.id!==id});saveD(db);nav('more-invoice','发票管理');toast('已删除')}
function viewInvoice(id){var db=GD(),o=db.invoices.find(function(x){return x.id===id});if(!o)return;var attachHtml='';if(o.attachment){attachHtml='<div style="margin-top:12px;padding:8px;background:#fafafa;border-radius:6px"><strong>📎 发票附件: '+o.attachmentName+'</strong><br><iframe src="'+o.attachment+'" style="width:100%;height:500px;border:1px solid #ddd;margin-top:8px"></iframe></div>'}var itemsHtml='';if(o.itemName){itemsHtml='<tr><td colspan="2"><strong>📋 货物/服务明细</strong></td></tr><tr><td><strong>项目名称:</strong> '+(o.itemName||'-')+'</td><td><strong>规格型号:</strong> '+(o.spec||'-')+'</td></tr><tr><td><strong>单位:</strong> '+(o.unit||'-')+'</td><td><strong>数量:</strong> '+(o.qty||'-')+'</td></tr><tr><td><strong>单价:</strong> ¥'+(o.price||'-')+'</td><td><strong>金额(不含税):</strong> ¥'+fmt(o.amount||0)+'</td></tr><tr><td><strong>税率:</strong> '+(o.taxRate||'')+'%</td><td><strong>税额:</strong> ¥'+fmt(o.taxAmt||0)+'</td></tr>'}else if(o.items){itemsHtml='<tr><td colspan="2"><strong>货物明细:</strong><br><pre style="white-space:pre-wrap;font-size:11px;margin:4px 0;background:#f9f9f9;padding:8px">'+o.items+'</pre></td></tr>'}modal('发票详情 - '+o.code,'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div><strong>发票号:</strong> '+o.code+'</div><div><strong>类型:</strong> '+o.type+'</div><div><strong>开票日期:</strong> '+fd(o.date)+'</div><div><strong>价税合计:</strong> ¥'+fmt(o.totalAmt||0)+'</div><div><strong>价税合计(大写):</strong> '+(o.totalCap||'-')+'</div><div><strong>关联销售单:</strong> '+(o.salesOutCode||'-')+'</div></div><table style="width:100%;margin-top:8px"><thead><tr><th style="width:50%">购买方信息</th><th style="width:50%">销售方信息</th></tr></thead><tbody><tr><td><strong>名称:</strong> '+(o.buyerName||'-')+'</td><td><strong>名称:</strong> '+(o.sellerName||'-')+'</td></tr><tr><td><strong>税号:</strong> '+(o.buyerTax||'-')+'</td><td><strong>税号:</strong> '+(o.sellerTax||'-')+'</td></tr>'+itemsHtml+'<tr><td colspan="2"><strong>备注:</strong> '+noteHtml(o)+'</td></tr></tbody></table>'+attachHtml,'<button class="btn btn-o" onclick="clsModal()">关闭</button>')}

// ==================== 工程项目管理 ====================
function projectPage(c){var db=GD();if(!db.projects)db.projects=[];c.innerHTML='<div class="tbar"><strong>工程项目管理</strong> <span class="spacer"></span><button class="btn btn-p" onclick="addProject()">+ 新工程</button></div>'+rTable(['编号','工程名称','客户','预算','已花费','进度','开始日期','备注','状态'],db.projects.map(function(x){return[x.code,x.name,gCName(x.customerId),'¥'+fmt(x.budget),'¥'+fmt(x.spent||0),'<progress value="'+(x.progress||0)+'" max="100" style="width:60px"></progress> '+(x.progress||0)+'%',fd(x.startDate),noteHtml(x),x.status==='进行中'?'<span class="tag tag-blue">进行中</span>':(x.status==='已完成'?'<span class="tag tag-green">已完成</span>':'<span class="tag tag-gray">暂停</span>')]}),8)}
function addProject(){var db=GD();var code='GC-'+now().replace(/-/g,'')+'-'+String((db.projects||[]).length+1).padStart(3,'0');modal('新增工程项目','<div class="frow"><div class="fg"><label>工程编号</label><input id="pjCode" value="'+code+'"></div><div class="fg"><label>工程名称</label><input id="pjName"></div></div><div class="frow"><div class="fg"><label>客户</label><select id="pjCustId">'+db.customers.map(function(c){return'<option value="'+c.id+'">'+c.name+'</option>'}).join('')+'</select></div><div class="fg"><label>预算金额</label><input id="pjBudget" type="number" step="0.01" min="0"></div></div><div class="frow"><div class="fg"><label>开始日期</label><input id="pjStart" type="date" value="'+now()+'"></div><div class="fg"><label>预计完成</label><input id="pjEnd" type="date" value="'+now()+'"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="pjNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveProject()">保存</button>')}
function saveProject(){var db=GD();if(!db.projects)db.projects=[];var id=db.projects.length+1;db.projects.push({id:id,code:document.getElementById('pjCode').value,name:document.getElementById('pjName').value,customerId:parseInt(document.getElementById('pjCustId').value),budget:parseFloat(document.getElementById('pjBudget').value)||0,spent:0,progress:0,startDate:document.getElementById('pjStart').value,endDate:document.getElementById('pjEnd').value,note:document.getElementById('pjNote').value||'',status:'进行中'});saveD(db);clsModal();nav('more-project','工程项目');toast('工程项目已创建')}
function editProject(id){var db=GD(),o=db.projects.find(function(x){return x.id===id});if(!o)return;modal('工程进度 - '+o.name,'<div style="margin-bottom:12px"><strong>当前进度:</strong> '+o.progress+'% | <strong>预算:</strong> ¥'+fmt(o.budget)+' | <strong>已花费:</strong> ¥'+fmt(o.spent||0)+'</div><div class="frow"><div class="fg"><label>更新进度(%)</label><input id="epjProgress" type="number" min="0" max="100" value="'+(o.progress||0)+'"></div><div class="fg"><label>追加花费</label><input id="epjSpent" type="number" step="0.01" min="0" value="0"></div></div><div class="frow"><div class="fg"><label>状态</label><select id="epjStatus"><option value="进行中" '+(o.status==='进行中'?'selected':'')+'>进行中</option><option value="已完成" '+(o.status==='已完成'?'selected':'')+'>已完成</option><option value="暂停" '+(o.status==='暂停'?'selected':'')+'>暂停</option></select></div><div class="fg"><label>备注</label><input id="epjNote" value="'+(o.note||'')+'"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveEditProject('+id+')">保存</button>')}
function saveEditProject(id){var db=GD(),o=db.projects.find(function(x){return x.id===id});if(!o)return;o.progress=parseInt(document.getElementById('epjProgress').value)||0;o.spent=(o.spent||0)+(parseFloat(document.getElementById('epjSpent').value)||0);o.status=document.getElementById('epjStatus').value;o.note=document.getElementById('epjNote').value||'';saveD(db);clsModal();nav('more-project','工程项目');toast('工程已更新')}
function delProject(id){var db=GD();db.projects=db.projects.filter(function(x){return x.id!==id});saveD(db);nav('more-project','工程项目');toast('已删除')}

// ==================== 租赁管理 ====================
function rentalPage(c){var db=GD();if(!db.rentals)db.rentals=[];c.innerHTML='<div class="tbar"><strong>租赁管理</strong> <span class="spacer"></span><button class="btn btn-p" onclick="addRental()">+ 新增租赁</button></div>'+rTable(['单号','客户','租赁物品','数量','日租金','开始','预计结束','备注','状态','操作'],db.rentals.map(function(x){return[x.code,gCName(x.customerId),x.itemName,x.qty,'¥'+fmt(x.dailyRate),fd(x.startDate),fd(x.endDate),noteHtml(x),x.status==='租赁中'?'<span class="tag tag-blue">租赁中</span>':(x.status==='已归还'?'<span class="tag tag-green">已归还</span>':'<span class="tag tag-red">逾期</span>'),'<button class="btn btn-xs btn-o" onclick="returnRental('+x.id+')">归还</button> <button class="btn btn-xs btn-d" onclick="delRental('+x.id+')">删除</button>']}),9)}
function addRental(){var db=GD();var code='ZL-'+now().replace(/-/g,'')+'-'+String((db.rentals||[]).length+1).padStart(3,'0');modal('新增租赁','<div class="frow"><div class="fg"><label>单号</label><input id="rtCode" value="'+code+'"></div><div class="fg"><label>客户</label><select id="rtCustId">'+db.customers.map(function(c){return'<option value="'+c.id+'">'+c.name+'</option>'}).join('')+'</select></div></div><div class="frow"><div class="fg"><label>租赁物品</label><select id="rtItem">'+db.goods.map(function(g){return'<option value="'+g.id+'">'+g.name+'('+(g.spec||'')+')</option>'}).join('')+'</select></div><div class="fg"><label>数量</label><input id="rtQty" type="number" min="1" value="1"></div></div><div class="frow"><div class="fg"><label>日租金</label><input id="rtDaily" type="number" step="0.01" min="0"></div><div class="fg"><label>押金</label><input id="rtDeposit" type="number" step="0.01" min="0" value="0"></div></div><div class="frow"><div class="fg"><label>开始日期</label><input id="rtStart" type="date" value="'+now()+'"></div><div class="fg"><label>预计归还</label><input id="rtEnd" type="date" value="'+now()+'"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="rtNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveRental()">保存</button>')}
function saveRental(){var db=GD();if(!db.rentals)db.rentals=[];var gid=parseInt(document.getElementById('rtItem').value);var g=db.goods.find(function(x){return x.id===gid});var id=db.rentals.length+1;var qty=parseFloat(document.getElementById('rtQty').value)||0;var dailyRate=parseFloat(document.getElementById('rtDaily').value)||0;if(!qty||!dailyRate){toast('请填写数量和日租金');return}var inv=db.inventory.find(function(x){return x.goodsId===gid});if(inv){inv.qty=Math.max(0,(inv.qty||0)-qty)}db.rentals.push({id:id,code:document.getElementById('rtCode').value,customerId:parseInt(document.getElementById('rtCustId').value),goodsId:gid,itemName:g?g.name:'-',qty:qty,dailyRate:dailyRate,deposit:parseFloat(document.getElementById('rtDeposit').value)||0,startDate:document.getElementById('rtStart').value,endDate:document.getElementById('rtEnd').value,note:document.getElementById('rtNote').value||'',status:'租赁中'});saveD(db);clsModal();nav('more-rental','租赁管理');toast('租赁已登记')}
function returnRental(id){var db=GD(),o=db.rentals.find(function(x){return x.id===id});if(!o||o.status!=='租赁中')return;var days=Math.ceil((new Date(now())-new Date(o.startDate))/86400000)||1;var totalRent=o.dailyRate*days;o.status='已归还';o.returnDate=now();o.totalRent=totalRent;var inv=db.inventory.find(function(x){return x.goodsId===o.goodsId});if(inv){inv.qty=(inv.qty||0)+o.qty}saveD(db);nav('more-rental','租赁管理');toast('已归还，租'+days+'天，总租金¥'+fmt(totalRent))}
function delRental(id){var db=GD();db.rentals=db.rentals.filter(function(x){return x.id!==id});saveD(db);nav('more-rental','租赁管理');toast('已删除')}

// ==================== 维修管理 ====================
function repairPage(c){var db=GD();if(!db.repairs)db.repairs=[];c.innerHTML='<div class="tbar"><strong>维修管理</strong> <span class="spacer"></span><button class="btn btn-p" onclick="addRepair()">+ 新增维修</button></div>'+rTable(['单号','商品','客户','故障描述','维修状态','费用','日期','备注'],db.repairs.map(function(x){return[x.code,gGName(x.goodsId),x.customerName||'-',x.issue,x.status==='待修'?'<span class="tag tag-orange">待修</span>':(x.status==='维修中'?'<span class="tag tag-blue">维修中</span>':(x.status==='已修好'?'<span class="tag tag-green">已修好</span>':'<span class="tag tag-gray">已取回</span>')),'¥'+fmt(x.cost||0),fd(x.date),noteHtml()]}),7)}
function addRepair(){var db=GD();var code='WX-'+now().replace(/-/g,'')+'-'+String((db.repairs||[]).length+1).padStart(3,'0');modal('新增维修','<div class="frow"><div class="fg"><label>单号</label><input id="rpCode" value="'+code+'"></div><div class="fg"><label>客户</label><select id="rpCustId"><option value="">散客</option>'+db.customers.map(function(c){return'<option value="'+c.id+'">'+c.name+'</option>'}).join('')+'</select></div></div><div class="frow"><div class="fg"><label>维修商品</label><select id="rpGoods">'+db.goods.map(function(g){return'<option value="'+g.id+'">'+g.name+'('+(g.spec||'')+')</option>'}).join('')+'</select></div><div class="fg"><label>故障分类</label><select id="rpIssue"><option>硬件故障</option><option>软件问题</option><option>外观损坏</option><option>功能异常</option><option>定期保养</option><option>其他</option></select></div></div><div class="frow c1"><div class="fg"><label>故障描述</label><input id="rpDesc"></div></div><div class="frow"><div class="fg"><label>日期</label><input id="rpDate" type="date" value="'+now()+'"></div><div class="fg"><label>预估费用</label><input id="rpCost" type="number" step="0.01" min="0" value="0"></div></div><div class="frow c1"><div class="fg"><label>备注</label><input id="rpNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveRepair()">保存</button>')}
function saveRepair(){var db=GD();if(!db.repairs)db.repairs=[];var custId=parseInt(document.getElementById('rpCustId').value)||null;var id=db.repairs.length+1;db.repairs.push({id:id,code:document.getElementById('rpCode').value,goodsId:parseInt(document.getElementById('rpGoods').value),customerId:custId,customerName:custId?gCName(custId):'散客',issue:(document.getElementById('rpIssue').value)+' - '+(document.getElementById('rpDesc').value||''),cost:parseFloat(document.getElementById('rpCost').value)||0,date:document.getElementById('rpDate').value,note:document.getElementById('rpNote').value||'',status:'待修'});saveD(db);clsModal();nav('more-repair','维修管理');toast('维修登记成功')}
function updateRepair(id,status){var db=GD(),o=db.repairs.find(function(x){return x.id===id});if(!o)return;o.status=status;saveD(db);nav('more-repair','维修管理');toast('状态更新:'+status)}
function delRepair(id){var db=GD();db.repairs=db.repairs.filter(function(x){return x.id!==id});saveD(db);nav('more-repair','维修管理');toast('已删除')}

// ==================== 返利提成 ====================
function rebatePage(c){var db=GD();if(!db.rebates)db.rebates=[];
  if(!db.depts)db.depts=[];c.innerHTML='<div class="tbar"><strong>返利提成</strong> <span class="spacer"></span><button class="btn btn-p" onclick="addRebate()">+ 新增返利</button></div>'+rTable(['单号','业务员','类型','基数','比例%','金额','日期','备注','状态'],db.rebates.map(function(x){return[x.code,gStName(x.staffId),x.type==='commission'?'提成':'返利',x.baseType+' ¥'+fmt(x.baseAmt),x.rate+'%','¥'+fmt(x.rebateAmt),fd(x.date),noteHtml(x),x.status==='已结算'?'<span class="tag tag-green">已结算</span>':'<span class="tag tag-orange">待结算</span>']}),8)}
function addRebate(){var db=GD();var code='FL-'+now().replace(/-/g,'')+'-'+String((db.rebates||[]).length+1).padStart(3,'0');modal('新增返利/提成','<div class="frow"><div class="fg"><label>单号</label><input id="rbCode" value="'+code+'"></div><div class="fg"><label>类型</label><select id="rbType"><option value="commission">提成(内部)</option><option value="rebate">返利(外部)</option></select></div></div><div class="frow"><div class="fg"><label>业务员/客户</label><select id="rbStaff">'+db.staff.map(function(s){return'<option value="'+s.id+'">'+s.name+'</option>'}).join('')+'</select></div><div class="fg"><label>计算基数</label><select id="rbBase"><option value="销售额">按销售额</option><option value="毛利">按毛利</option><option value="回款">按回款</option></select></div></div><div class="frow"><div class="fg"><label>基数额</label><input id="rbBaseAmt" type="number" step="0.01" min="0"></div><div class="fg"><label>提成/返利比例(%)</label><input id="rbRate" type="number" step="0.01" min="0" max="100"></div></div><div class="frow"><div class="fg"><label>日期</label><input id="rbDate" type="date" value="'+now()+'"></div><div class="fg"><label>备注</label><input id="rbNote"></div></div>','<button class="btn btn-o" onclick="clsModal()">取消</button><button class="btn btn-p" onclick="saveRebate()">保存</button>')}
function saveRebate(){var db=GD();if(!db.rebates)db.rebates=[];var baseAmt=parseFloat(document.getElementById('rbBaseAmt').value)||0;var rate=parseFloat(document.getElementById('rbRate').value)||0;var rebateAmt=baseAmt*rate/100;if(!baseAmt||!rate){toast('请填写基数额和比例');return}var staffId=parseInt(document.getElementById('rbStaff').value);db.rebates.push({id:db.rebates.length+1,code:document.getElementById('rbCode').value,type:document.getElementById('rbType').value,staffId:staffId,baseType:document.getElementById('rbBase').value,baseAmt:baseAmt,rate:rate,rebateAmt:rebateAmt,date:document.getElementById('rbDate').value,note:document.getElementById('rbNote').value||'',status:'待结算'});saveD(db);clsModal();nav('more-rebate','返利提成');toast('返利/提成已保存 ¥'+fmt(rebateAmt))}
function settleRebate(id){var db=GD(),o=db.rebates.find(function(x){return x.id===id});if(!o)return;o.status='已结算';saveD(db);nav('more-rebate','返利提成');toast('已结算')}
function delRebate(id){var db=GD();db.rebates=db.rebates.filter(function(x){return x.id!==id});saveD(db);nav('more-rebate','返利提成');toast('已删除')}