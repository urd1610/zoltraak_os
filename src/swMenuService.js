const mariadb = require('mariadb');
const { parse: parseCsv } = require('csv-parse/sync');

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeComponentCode = (code) => (code ?? '').toString().replace(/-/g, '').trim();

const DEFAULT_SW_DB_NAME = process.env.SW_DB_NAME || 'zoltraak';
const DEFAULT_DB_CONFIG = {
  host: process.env.MARIADB_HOST || '192.168.0.156',
  port: parseNumber(process.env.MARIADB_PORT, 3306),
  user: process.env.MARIADB_USER || 'alluser',
  password: process.env.MARIADB_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database: DEFAULT_SW_DB_NAME,
  connectTimeout: parseNumber(process.env.MARIADB_CONNECT_TIMEOUT, 8000),
  connectionLimit: parseNumber(process.env.MARIADB_POOL_SIZE, 5),
};

const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS sw_components (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(64) DEFAULT '',
    location VARCHAR(100) DEFAULT '',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_component_code (code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS sw_boms (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    parent_code VARCHAR(64) NOT NULL,
    child_code VARCHAR(64) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_parent_child (parent_code, child_code),
    KEY idx_child_code (child_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS sw_flow_counts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    component_code VARCHAR(64) NOT NULL,
    quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
    status ENUM('in-stock', 'wip', 'backlog') NOT NULL DEFAULT 'in-stock',
    updated_by VARCHAR(64) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_component_code (component_code),
    KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
];

const COMPONENT_OVERVIEW_LIMIT = 1000;
const BOM_OVERVIEW_LIMIT = 12;
const FLOW_OVERVIEW_LIMIT = 20;
const COMPONENT_SUGGESTION_LIMIT = 20;
const LOCATION_NAME_SUGGESTION_LIMIT = COMPONENT_SUGGESTION_LIMIT * 5;
const COMPONENT_INSERT_CHUNK_SIZE = 200;
const MAX_COMPONENT_IMPORT_ROWS = 5000;
const CSV_COMPONENT_FIELDS = {
  code: ['code', '部品コード', '品番', '品番コード', 'part_number', 'part number'],
  name: ['name', '名称', '品名', '部品名'],
  version: ['version', '版数', '版', 'rev', 'revision'],
  location: ['location', '場所', 'ライン', 'line', 'loc'],
  description: ['description', '説明', '備考', 'メモ', 'memo', 'remarks'],
};

const normalizeError = (error, context = 'unknown') => {
  const message = error?.message || '不明なエラーが発生しました';
  return {
    ok: false,
    context,
    error: message,
    code: error?.code ?? null,
    sqlState: error?.sqlState ?? null,
    sqlMessage: error?.sqlMessage ?? null,
  };
};

const normalizeComponentPayload = (payload = {}) => {
  const code = normalizeComponentCode(payload.code);
  const name = (payload.name ?? '').trim();
  if (!code || !name) {
    throw new Error('部品コードと名称は必須です');
  }
  return {
    code,
    name,
    version: (payload.version ?? '').trim(),
    location: (payload.location ?? '').trim(),
    description: (payload.description ?? '').trim(),
  };
};

const normalizeFlowPayload = (payload = {}) => {
  const componentCode = normalizeComponentCode(payload.componentCode ?? payload.code);
  if (!componentCode) {
    throw new Error('流動数を登録する部品コードを入力してください');
  }
  const quantity = Number(payload.quantity);
  return {
    componentCode,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    status: ['in-stock', 'wip', 'backlog'].includes(payload.status) ? payload.status : 'in-stock',
    updatedBy: (payload.updatedBy ?? 'operator').trim() || 'operator',
  };
};

const normalizeBomPayload = (payload = {}) => {
  const parentCode = normalizeComponentCode(payload.parentCode);
  const childCode = normalizeComponentCode(payload.childCode);
  if (!parentCode || !childCode) {
    throw new Error('親部品コードと子部品コードは必須です');
  }
  const quantity = Number(payload.quantity);
  return {
    parentCode,
    childCode,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    note: (payload.note ?? '').trim(),
  };
};

const normalizeCsvKey = (key) => (key ?? '').toString().trim().toLowerCase();

const pickCsvValue = (row, keys = []) => {
  if (!row || typeof row !== 'object') {
    return '';
  }
  const normalizedRow = Object.entries(row).reduce((acc, [field, value]) => {
    const normalizedKey = normalizeCsvKey(field);
    if (normalizedKey) {
      acc[normalizedKey] = value;
    }
    return acc;
  }, {});
  for (const key of keys) {
    const normalizedKey = normalizeCsvKey(key);
    if (normalizedKey && Object.prototype.hasOwnProperty.call(normalizedRow, normalizedKey)) {
      return normalizedRow[normalizedKey];
    }
  }
  return '';
};

const mapCsvRecordToComponent = (record) => ({
  code: pickCsvValue(record, CSV_COMPONENT_FIELDS.code),
  name: pickCsvValue(record, CSV_COMPONENT_FIELDS.name),
  version: pickCsvValue(record, CSV_COMPONENT_FIELDS.version),
  location: pickCsvValue(record, CSV_COMPONENT_FIELDS.location),
  description: pickCsvValue(record, CSV_COMPONENT_FIELDS.description),
});

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const dedupeComponentsByCode = (components = []) => {
  const map = new Map();
  const duplicates = new Set();
  components.forEach((component) => {
    const normalizedCode = normalizeComponentCode(component.code);
    if (!normalizedCode) {
      return;
    }
    const normalizedComponent = { ...component, code: normalizedCode };
    if (map.has(normalizedCode)) {
      duplicates.add(normalizedCode);
    }
    map.set(normalizedCode, normalizedComponent);
  });
  return { unique: Array.from(map.values()), duplicates: Array.from(duplicates) };
};

const normalizeComponentList = (components = []) => components.reduce((acc, component, index) => {
  try {
    acc.normalized.push(normalizeComponentPayload(component));
  } catch (error) {
    acc.errors.push({ index, error: error?.message || '入力が不足しています' });
  }
  return acc;
}, { normalized: [], errors: [] });

const parseComponentCsvRows = (csvText) => {
  const source = (csvText ?? '').toString();
  if (!source.trim()) {
    throw new Error('CSVが空です');
  }
  let records;
  try {
    records = parseCsv(source, {
      columns: true,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch (error) {
    throw new Error(`CSVの解析に失敗しました: ${error?.message || '不明なエラー'}`);
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('CSVにデータ行がありません');
  }
  if (records.length > MAX_COMPONENT_IMPORT_ROWS) {
    throw new Error(`CSVは最大${MAX_COMPONENT_IMPORT_ROWS}行までにしてください`);
  }
  const rowErrors = [];
  const components = [];
  records.forEach((record, index) => {
    const rowNumber = index + 2; // 1行目はヘッダー想定
    try {
      const mapped = mapCsvRecordToComponent(record);
      components.push(normalizeComponentPayload(mapped));
    } catch (error) {
      rowErrors.push({ row: rowNumber, error: error?.message || '入力が不足しています' });
    }
  });
  return { components, rowErrors, totalRows: records.length };
};

const createSwMenuService = (options = {}) => {
  const dbConfig = { ...DEFAULT_DB_CONFIG, ...(options.db ?? {}) };
  let pool = null;
  let schemaReady = false;
  let lastError = null;
  let lastInitializedAt = null;

  const getPool = () => {
    if (pool) {
      return pool;
    }
    pool = mariadb.createPool({
      ...dbConfig,
      dateStrings: true,
      multipleStatements: false,
    });
    return pool;
  };

  const ensureDatabase = async () => {
    let connection;
    try {
      connection = await mariadb.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        connectTimeout: dbConfig.connectTimeout,
      });
      const existing = await connection.query('SHOW DATABASES LIKE ?', [dbConfig.database]);
      const existed = Array.isArray(existing) && existing.length > 0;
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
      );
      return { ok: true, existed };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  };

  const ensureTables = async () => {
    let connection;
    try {
      connection = await mariadb.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        connectTimeout: dbConfig.connectTimeout,
        multipleStatements: false,
      });
      for (const ddl of TABLE_DEFINITIONS) {
        // eslint-disable-next-line no-await-in-loop
        await connection.query(ddl);
      }
      // マイグレーション: sw_components に location カラムがなければ追加
      const columns = await connection.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sw_components'",
        [dbConfig.database],
      );
      const columnNames = columns.map((c) => c.COLUMN_NAME);
      if (!columnNames.includes('location')) {
        await connection.query(
          "ALTER TABLE sw_components ADD COLUMN location VARCHAR(100) DEFAULT '' AFTER version",
        );
      }
      return { ok: true };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  };

  const ensureSchema = async () => {
    try {
      const dbResult = await ensureDatabase();
      if (!dbResult?.ok) {
        lastError = dbResult?.error ?? 'データベースの作成に失敗しました';
        schemaReady = false;
        return { ...dbResult, ready: false, database: dbConfig.database, host: dbConfig.host, port: dbConfig.port };
      }
      const tableResult = await ensureTables();
      if (!tableResult?.ok) {
        lastError = tableResult?.error ?? 'テーブル作成に失敗しました';
        schemaReady = false;
        return { ...tableResult, ready: false, database: dbConfig.database, host: dbConfig.host, port: dbConfig.port };
      }
      schemaReady = true;
      lastError = null;
      lastInitializedAt = new Date().toISOString();
      return {
        ok: true,
        ready: true,
        database: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        lastInitializedAt,
      };
    } catch (error) {
      lastError = error?.message ?? '初期化で不明なエラーが発生しました';
      schemaReady = false;
      return normalizeError(error, 'ensure-schema');
    }
  };

  const withConnection = async (handler) => {
    if (!schemaReady) {
      const ensured = await ensureSchema();
      if (!ensured?.ok) {
        throw new Error(ensured?.error || 'SWメニューの初期化に失敗しました');
      }
    }
    const targetPool = getPool();
    const connection = await targetPool.getConnection();
    try {
      return await handler(connection);
    } finally {
      connection.release();
    }
  };

  const withTransaction = async (handler) => withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await handler(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    }
  });

  const upsertComponentsBulk = async (components = [], options = {}) => {
    const { skipNormalization = false } = options || {};
    try {
      const { normalized, errors } = skipNormalization
        ? { normalized: components ?? [], errors: [] }
        : normalizeComponentList(components);
      const { unique, duplicates } = dedupeComponentsByCode(normalized);
      if (!unique.length) {
        const errorMessage = errors[0]?.error || '登録する品番がありません';
        lastError = errorMessage;
        return { ok: false, error: errorMessage, errors };
      }
      await withConnection(async (conn) => {
        const chunks = chunkArray(unique, COMPONENT_INSERT_CHUNK_SIZE);
        for (const chunk of chunks) {
          const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
          const values = chunk.flatMap((item) => [
            item.code,
            item.name,
            item.version,
            item.location,
            item.description,
          ]);
          // eslint-disable-next-line no-await-in-loop
          await conn.query(
            `INSERT INTO sw_components (code, name, version, location, description)
              VALUES ${placeholders}
              ON DUPLICATE KEY UPDATE name = VALUES(name), version = VALUES(version), location = VALUES(location), description = VALUES(description)`,
            values,
          );
        }
      });
      lastError = null;
      return { ok: true, imported: unique.length, duplicates: duplicates.slice(0, 200), errors };
    } catch (error) {
      lastError = error?.message ?? '品番の一括登録に失敗しました';
      return normalizeError(error, 'bulk-upsert-components');
    }
  };

  const importComponentsFromCsv = async (csvText) => {
    try {
      const { components, rowErrors, totalRows } = parseComponentCsvRows(csvText);
      if (!components.length) {
        const errorMessage = rowErrors.length ? '有効な行がありませんでした' : 'CSVにデータ行がありません';
        lastError = errorMessage;
        return { ok: false, error: errorMessage, rowErrors, totalRows };
      }
      const result = await upsertComponentsBulk(components, { skipNormalization: true });
      if (!result?.ok) {
        return { ...result, rowErrors, totalRows };
      }
      lastError = null;
      return {
        ok: true,
        imported: result.imported,
        totalRows,
        duplicateCodes: result.duplicates,
        rowErrors,
      };
    } catch (error) {
      lastError = error?.message ?? 'CSV取り込みに失敗しました';
      return normalizeError(error, 'import-components');
    }
  };

  const getOverview = async () => {
    try {
      const data = await withConnection(async (conn) => {
        const [components, boms, flows] = await Promise.all([
          conn.query(
            `SELECT code, name, version, location, description, updated_at
              FROM sw_components
              ORDER BY updated_at DESC
              LIMIT ${COMPONENT_OVERVIEW_LIMIT}`,
          ),
          conn.query(
            `SELECT parent_code, child_code, quantity, note, updated_at
              FROM sw_boms
              ORDER BY updated_at DESC
              LIMIT ${BOM_OVERVIEW_LIMIT}`,
          ),
          conn.query(
            `SELECT component_code, quantity, status, updated_at, updated_by
              FROM sw_flow_counts
              ORDER BY updated_at DESC
              LIMIT ${FLOW_OVERVIEW_LIMIT}`,
          ),
        ]);
        return { components, boms, flows };
      });
      return {
        ok: true,
        ready: schemaReady,
        database: dbConfig.database,
        ...data,
      };
    } catch (error) {
      lastError = error?.message ?? '最新の情報取得に失敗しました';
      return normalizeError(error, 'get-overview');
    }
  };

  const getComponentSuggestions = async () => {
    try {
      const suggestionData = await withConnection(async (conn) => {
        const [names, locations, namesByLocation] = await Promise.all([
          conn.query(
            `SELECT name, COUNT(*) AS cnt, MAX(updated_at) AS last_updated
              FROM sw_components
              WHERE name <> ''
              GROUP BY name
              ORDER BY last_updated DESC, cnt DESC
              LIMIT ${COMPONENT_SUGGESTION_LIMIT}`,
          ),
          conn.query(
            `SELECT location, COUNT(*) AS cnt, MAX(updated_at) AS last_updated
              FROM sw_components
              WHERE location <> ''
              GROUP BY location
              ORDER BY last_updated DESC, cnt DESC
              LIMIT ${COMPONENT_SUGGESTION_LIMIT}`,
          ),
          conn.query(
            `SELECT location, name, COUNT(*) AS cnt, MAX(updated_at) AS last_updated
              FROM sw_components
              WHERE location <> '' AND name <> ''
              GROUP BY location, name
              ORDER BY last_updated DESC, cnt DESC
              LIMIT ${LOCATION_NAME_SUGGESTION_LIMIT}`,
          ),
        ]);
        const normalize = (items, key) => items
          .map((item) => (item?.[key] ?? '').trim())
          .filter(Boolean);
        const namesByLocationMap = namesByLocation.reduce((acc, item) => {
          const location = (item?.location ?? '').trim();
          const name = (item?.name ?? '').trim();
          if (!location || !name) {
            return acc;
          }
          const current = acc[location] ?? [];
          if (current.includes(name) || current.length >= COMPONENT_SUGGESTION_LIMIT) {
            acc[location] = current;
            return acc;
          }
          acc[location] = [...current, name];
          return acc;
        }, {});
        return {
          names: normalize(names, 'name'),
          locations: normalize(locations, 'location'),
          namesByLocation: namesByLocationMap,
        };
      });
      return { ok: true, suggestions: suggestionData };
    } catch (error) {
      lastError = error?.message ?? '候補の取得に失敗しました';
      return normalizeError(error, 'get-component-suggestions');
    }
  };

  const upsertComponent = async (payload) => {
    try {
      const normalized = normalizeComponentPayload(payload);
      await withConnection(async (conn) => {
        await conn.query(
          `INSERT INTO sw_components (code, name, version, location, description)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name), version = VALUES(version), location = VALUES(location), description = VALUES(description)`,
          [normalized.code, normalized.name, normalized.version, normalized.location, normalized.description],
        );
      });
      return { ok: true, component: normalized };
    } catch (error) {
      lastError = error?.message ?? '部品登録に失敗しました';
      return normalizeError(error, 'upsert-component');
    }
  };

  const recordFlow = async (payload) => {
    try {
      const normalized = normalizeFlowPayload(payload);
      await withConnection(async (conn) => {
        await conn.query(
          `INSERT INTO sw_flow_counts (component_code, quantity, status, updated_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), status = VALUES(status), updated_by = VALUES(updated_by)`,
          [normalized.componentCode, normalized.quantity, normalized.status, normalized.updatedBy],
        );
      });
      return { ok: true, flow: normalized };
    } catch (error) {
      lastError = error?.message ?? '流動数の登録に失敗しました';
      return normalizeError(error, 'record-flow');
    }
  };

  const upsertBomLink = async (payload) => {
    try {
      const normalized = normalizeBomPayload(payload);
      await withConnection(async (conn) => {
        await conn.query(
          `INSERT INTO sw_boms (parent_code, child_code, quantity, note)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), note = VALUES(note)`,
          [normalized.parentCode, normalized.childCode, normalized.quantity, normalized.note],
        );
      });
      return { ok: true, bom: normalized };
    } catch (error) {
      lastError = error?.message ?? 'BOM登録に失敗しました';
      return normalizeError(error, 'upsert-bom');
    }
  };

  const getStatus = () => ({
    ok: schemaReady && !lastError,
    ready: schemaReady,
    database: dbConfig.database,
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    lastInitializedAt,
    lastError,
  });

  const dispose = async () => {
    if (pool) {
      const closing = pool.end();
      pool = null;
      return closing;
    }
    return null;
  };

  return {
    ensureSchema,
    getStatus,
    getOverview,
    getComponentSuggestions,
    upsertComponent,
    upsertComponentsBulk,
    importComponentsFromCsv,
    recordFlow,
    upsertBomLink,
    dispose,
    config: { ...dbConfig },
  };
};

module.exports = {
  createSwMenuService,
  DEFAULT_SW_DB_NAME,
};
