-- ============================================================
-- 象过河 WMS v2 - Supabase 并发安全数据库升级
-- 请在 Supabase SQL Editor 中依次执行以下语句
-- ============================================================

-- 第1步：给 app_data 添加 version 列（乐观锁用）
ALTER TABLE app_data ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- 第2步：创建 ID 计数器表（原子分配，防止多设备 ID 冲突）
CREATE TABLE IF NOT EXISTS id_counters (
  key TEXT PRIMARY KEY,
  current_value BIGINT NOT NULL DEFAULT 0
);

-- 第3步：种子计数器值，匹配 initDB() 中预置的数据
INSERT INTO id_counters (key, current_value) VALUES
  ('goods', 4), ('supplier', 3), ('customer', 3), ('warehouse', 3),
  ('staff', 4), ('account', 5), ('unit', 9), ('category', 5),
  ('colorGroup', 2), ('sizeGroup', 3), ('notification', 1),
  ('auditLog', 1),
  ('purchaseOrder', 1), ('purchaseIn', 1), ('purchaseReturn', 1), ('purchasePayment', 1),
  ('salesOrder', 1), ('salesOut', 1), ('salesReturn', 1), ('salesReceipt', 1),
  ('checkOrder', 1), ('checkProfit', 1), ('checkLoss', 1), ('transfer', 1),
  ('incomeRecord', 1), ('expenseRecord', 1),
  ('bom', 1), ('productionPlan', 1), ('productionOrder', 1), ('productionPick', 1),
  ('productionIn', 1), ('productionReturn', 1),
  ('quotation', 1), ('member', 1), ('memberRecharge', 1), ('posOrder', 1),
  ('invoice', 1), ('project', 1), ('rental', 1), ('repair', 1), ('rebate', 1),
  ('stockFlow', 1), ('completedBatch', 1)
ON CONFLICT (key) DO NOTHING;

-- 第4步：原子分配 ID 函数（多设备同时调用，PG 行锁保证不重复）
CREATE OR REPLACE FUNCTION allocate_ids(p_key TEXT, p_count INTEGER)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_value BIGINT;
BEGIN
  INSERT INTO id_counters (key, current_value) VALUES (p_key, p_count)
  ON CONFLICT (key) DO UPDATE SET current_value = id_counters.current_value + p_count
  RETURNING current_value - p_count INTO v_value;
  RETURN v_value;
END;
$$;

-- 第5步：乐观锁保存函数
-- p_expected_version：客户端读到的版本号，-1=强制覆盖（合并重试时用）
-- p_data：完整数据
-- 返回：{success:bool, version:int, data?:jsonb}
CREATE OR REPLACE FUNCTION save_data_locked(p_expected_version INTEGER, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current_version INTEGER;
BEGIN
  SELECT version INTO v_current_version FROM app_data WHERE id = 1;

  IF v_current_version IS NULL THEN
    -- 首次保存
    INSERT INTO app_data (id, data, version, updated_at) VALUES (1, p_data, 1, NOW());
    RETURN jsonb_build_object('success', true, 'version', 1);
  ELSIF v_current_version = p_expected_version OR p_expected_version = -1 THEN
    -- 版本匹配（或强制写入），安全保存
    UPDATE app_data SET data = p_data, version = version + 1, updated_at = NOW() WHERE id = 1;
    RETURN jsonb_build_object('success', true, 'version', v_current_version + 1);
  ELSE
    -- 冲突！返回服务器最新数据供客户端合并
    RETURN jsonb_build_object('success', false, 'version', v_current_version, 'data', data);
  END IF;
END;
$$;

-- 第6步：id_counters 也需要公开访问
ALTER TABLE id_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_counters' AND tablename = 'id_counters') THEN
    CREATE POLICY "allow_all_counters" ON id_counters FOR ALL USING (true) WITH CHECK (true);
  END IF;
END;
$$;
