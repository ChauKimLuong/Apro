BEGIN;

CREATE TYPE form_preset_kind AS ENUM ('PALETTE', 'STARTER');

CREATE TABLE form_presets (
  code VARCHAR(51) PRIMARY KEY,
  kind form_preset_kind NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,

  CONSTRAINT ck_form_presets_code
    CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_form_presets_name
    CHECK (btrim(name) <> ''),
  CONSTRAINT ck_form_presets_sort_order
    CHECK (sort_order > 0),
  CONSTRAINT ck_form_presets_palette
    CHECK ((kind = 'PALETTE') = (code = 'COMPONENTS'))
);

CREATE TABLE form_preset_fields (
  preset_code VARCHAR(51) NOT NULL,
  key VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  type field_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  options VARCHAR(120)[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL,

  PRIMARY KEY (preset_code, key),
  CONSTRAINT fk_form_preset_fields_preset
    FOREIGN KEY (preset_code) REFERENCES form_presets (code)
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT ck_form_preset_fields_key
    CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_form_preset_fields_label
    CHECK (btrim(label) <> ''),
  CONSTRAINT ck_form_preset_fields_sort_order
    CHECK (sort_order BETWEEN 1 AND 50),
  CONSTRAINT ck_form_preset_fields_options
    CHECK (
      (type = 'SELECT' AND cardinality(options) BETWEEN 1 AND 50)
      OR (type <> 'SELECT' AND cardinality(options) = 0)
    )
);

CREATE UNIQUE INDEX form_preset_fields_preset_code_sort_order_key
  ON form_preset_fields (preset_code, sort_order);

INSERT INTO form_presets (code, kind, name, description, sort_order)
VALUES
  ('COMPONENTS', 'PALETTE', 'Thành phần', '', 1),
  ('PURCHASE_REQUEST', 'STARTER', 'Đề nghị mua sắm',
   'Thiết bị, nhà cung cấp, số lượng, chi phí và mục đích sử dụng.', 1),
  ('LEAVE_REQUEST', 'STARTER', 'Đơn xin nghỉ phép',
   'Loại nghỉ, thời gian và nội dung bàn giao.', 2);

INSERT INTO form_preset_fields
  (preset_code, key, label, type, is_required, options, sort_order)
VALUES
  ('COMPONENTS', 'short_text', 'Văn bản ngắn', 'TEXT', false, '{}', 1),
  ('COMPONENTS', 'details', 'Văn bản dài', 'TEXTAREA', false, '{}', 2),
  ('COMPONENTS', 'number', 'Số', 'NUMBER', false, '{}', 3),
  ('COMPONENTS', 'date', 'Ngày tháng', 'DATE', false, '{}', 4),
  ('COMPONENTS', 'choice', 'Danh sách chọn', 'SELECT', false,
   ARRAY['Lựa chọn 1', 'Lựa chọn 2']::VARCHAR(120)[], 5),
  ('COMPONENTS', 'confirmed', 'Ô xác nhận', 'CHECKBOX', false, '{}', 6),

  ('PURCHASE_REQUEST', 'item_name', 'Thiết bị / hàng hóa', 'TEXT', true, '{}', 1),
  ('PURCHASE_REQUEST', 'supplier', 'Nhà cung cấp', 'TEXT', true, '{}', 2),
  ('PURCHASE_REQUEST', 'quantity', 'Số lượng', 'NUMBER', true, '{}', 3),
  ('PURCHASE_REQUEST', 'amount', 'Tổng chi phí (VNĐ)', 'NUMBER', true, '{}', 4),
  ('PURCHASE_REQUEST', 'reason', 'Mục đích sử dụng', 'TEXTAREA', true, '{}', 5),

  ('LEAVE_REQUEST', 'leave_type', 'Loại nghỉ', 'SELECT', true,
   ARRAY['Nghỉ phép năm', 'Nghỉ việc riêng', 'Nghỉ ốm']::VARCHAR(120)[], 1),
  ('LEAVE_REQUEST', 'start_date', 'Từ ngày', 'DATE', true, '{}', 2),
  ('LEAVE_REQUEST', 'end_date', 'Đến ngày', 'DATE', true, '{}', 3),
  ('LEAVE_REQUEST', 'reason', 'Lý do và bàn giao', 'TEXTAREA', true, '{}', 4);

COMMIT;
