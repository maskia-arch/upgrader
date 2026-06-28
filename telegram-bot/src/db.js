const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Run DB init to automatically load the schema if tables don't exist
async function initializeDatabase() {
  try {
    const checkRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'packages', 'ltc_addresses', 'upgrader_keys', 'users', 
        'coupons', 'subscriptions', 'invoices', 'system_logs', 
        'broadcasts', 'feedback', 'bot_messages_cleanup', 'key_history'
      );
    `);
    
    if (checkRes.rows.length < 12) {
      console.log('[DATABASE] Some tables are missing. Running database schema initialization...');
      const paths = [
        path.join(__dirname, '../../database/schema.sql'),
        path.join(__dirname, '../database/schema.sql'),
        path.join(__dirname, 'database/schema.sql'),
      ];
      let schemaSql = '';
      for (const p of paths) {
        if (fs.existsSync(p)) {
          schemaSql = fs.readFileSync(p, 'utf8');
          break;
        }
      }
      if (schemaSql) {
        // Run SQL schema script
        await pool.query(schemaSql);
        console.log('[DATABASE] Database schema successfully initialized.');
      } else {
        console.error('[DATABASE ERROR] schema.sql file not found in search paths.');
      }
    }
  } catch (err) {
    console.error('[DATABASE ERROR] Auto-migration/initialization failed:', err.message);
    throw err;
  }
}

// Define relationships for subquery joins
const RELATIONS = {
  subscriptions: {
    packages: { table: 'packages', fkey: 'package_id', target: 'id' },
    upgrader_keys: { table: 'upgrader_keys', fkey: 'key_id', target: 'id' },
    users: { table: 'users', fkey: 'user_id', target: 'id' },
    coupons: { table: 'coupons', fkey: 'coupon_id', target: 'id' },
  },
  invoices: {
    ltc_addresses: { table: 'ltc_addresses', fkey: 'ltc_address_id', target: 'id' },
    subscriptions: { table: 'subscriptions', fkey: 'sub_id', target: 'id' },
  },
  feedback: {
    users: { table: 'users', fkey: 'user_id', target: 'id' },
    subscriptions: { table: 'subscriptions', fkey: 'subscription_id', target: 'id' },
  }
};

// Helper: Parse commas in select strings while keeping contents of parentheses together
function parseSelect(str) {
  const result = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

// Helper: Compile select tokens recursively to construct JSON queries
function compileField(parentTable, token, realTable = null) {
  const tableKey = (parentTable === 'affected') ? realTable : parentTable;

  if (!token.includes('(')) {
    if (token === '*') return `${parentTable}.*`;
    return `${parentTable}.${token}`;
  }
  
  const openParen = token.indexOf('(');
  const relationName = token.substring(0, openParen).trim();
  const subfieldsStr = token.substring(openParen + 1, token.length - 1).trim();
  
  const rel = RELATIONS[tableKey]?.[relationName];
  if (!rel) {
    const fkey = `${relationName}_id`;
    return `(SELECT row_to_json(r) FROM (SELECT * FROM ${relationName} WHERE ${relationName}.id = ${parentTable}.${fkey}) r) AS ${relationName}`;
  }
  
  const subfields = parseSelect(subfieldsStr);
  
  if (subfieldsStr === '*') {
    return `(SELECT row_to_json(r) FROM (SELECT * FROM ${rel.table} WHERE ${rel.table}.${rel.target} = ${parentTable}.${rel.fkey}) r) AS ${relationName}`;
  }
  
  const jsonBuildFields = subfields.map(f => {
    if (!f.includes('(')) {
      return `'${f}', ${rel.table}.${f}`;
    } else {
      const openParen = f.indexOf('(');
      const subRelName = f.substring(0, openParen).trim();
      const subQuery = compileField(rel.table, f);
      const queryWithoutAlias = subQuery.replace(new RegExp(`\\s+AS\\s+${subRelName}$`, 'i'), '');
      return `'${subRelName}', ${queryWithoutAlias}`;
    }
  }).join(', ');
  
  return `(SELECT json_build_object(${jsonBuildFields}) FROM ${rel.table} WHERE ${rel.table}.${rel.target} = ${parentTable}.${rel.fkey}) AS ${relationName}`;
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.selectFields = '*';
    this.insertData = null;
    this.updateData = null;
    this.filters = [];
    this.orders = [];
    this.limitCount = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.isHead = false;
    this.exactCount = false;
    this.params = [];
  }

  select(fields = '*', options = {}) {
    this.selectFields = fields;
    if (options.count === 'exact') this.exactCount = true;
    if (options.head === true) this.isHead = true;
    return this;
  }

  insert(data) {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  update(data) {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(col, val) {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }

  neq(col, val) {
    this.filters.push({ type: 'neq', col, val });
    return this;
  }

  gt(col, val) {
    this.filters.push({ type: 'gt', col, val });
    return this;
  }

  lt(col, val) {
    this.filters.push({ type: 'lt', col, val });
    return this;
  }

  gte(col, val) {
    this.filters.push({ type: 'gte', col, val });
    return this;
  }

  lte(col, val) {
    this.filters.push({ type: 'lte', col, val });
    return this;
  }

  like(col, val) {
    this.filters.push({ type: 'like', col, val });
    return this;
  }

  ilike(col, val) {
    this.filters.push({ type: 'ilike', col, val });
    return this;
  }

  in(col, val) {
    this.filters.push({ type: 'in', col, val });
    return this;
  }

  is(col, val) {
    this.filters.push({ type: 'is', col, val });
    return this;
  }

  or(val) {
    this.filters.push({ type: 'or', val });
    return this;
  }

  not(col, op, val) {
    this.filters.push({ type: 'not', col, op, val });
    return this;
  }

  order(col, options = {}) {
    this.orders.push({
      col,
      ascending: options.ascending !== false,
      nullsFirst: options.nullsFirst
    });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  // Compile filters to SQL WHERE clause
  compileFilters() {
    if (this.filters.length === 0) return { whereSql: '', params: [] };
    const params = [];
    const parts = this.filters.map(f => {
      if (f.type === 'or') {
        const orParts = f.val.split(',');
        const sqlOrParts = orParts.map(part => {
          const match = part.match(/^([^.]+)\.([^.]+)\.(.+)$/);
          if (!match) return 'TRUE';
          const [_, col, op, valStr] = match;
          if (op === 'eq') {
            if (valStr === 'false') return `${col} = false`;
            if (valStr === 'true') return `${col} = true`;
            if (valStr === 'null') return `${col} IS NULL`;
            params.push(valStr);
            return `${col} = $${params.length}`;
          } else if (op === 'lt') {
            if (valStr === 'now()') return `${col} < NOW()`;
            params.push(valStr);
            return `${col} < $${params.length}`;
          } else if (op === 'lte') {
            params.push(valStr);
            return `${col} <= $${params.length}`;
          } else if (op === 'is') {
            if (valStr === 'null') return `${col} IS NULL`;
            if (valStr === 'true') return `${col} IS TRUE`;
            if (valStr === 'false') return `${col} IS FALSE`;
          }
          return 'TRUE';
        });
        return `(${sqlOrParts.join(' OR ')})`;
      }

      if (f.val === null) {
        if (f.type === 'eq') return `${this.table}.${f.col} IS NULL`;
        if (f.type === 'neq') return `${this.table}.${f.col} IS NOT NULL`;
      }

      if (f.type === 'is') {
        if (f.val === null) return `${this.table}.${f.col} IS NULL`;
        if (f.val === true) return `${this.table}.${f.col} IS TRUE`;
        if (f.val === false) return `${this.table}.${f.col} IS FALSE`;
      }

      if (f.type === 'in') {
        params.push(f.val);
        return `${this.table}.${f.col} = ANY($${params.length})`;
      }

      if (f.type === 'not') {
        if (f.op === 'is' && f.val === null) {
          return `${this.table}.${f.col} IS NOT NULL`;
        }
        if (f.op === 'eq') {
          if (f.val === null) return `${this.table}.${f.col} IS NOT NULL`;
          params.push(f.val);
          return `${this.table}.${f.col} != $${params.length}`;
        }
        const opMap = {
          eq: '=',
          neq: '!=',
          gt: '>',
          lt: '<',
          gte: '>=',
          lte: '<=',
          like: 'LIKE',
          ilike: 'ILIKE'
        };
        const sqlOp = opMap[f.op] || '=';
        if (f.val === null) {
          return `NOT (${this.table}.${f.col} IS NULL)`;
        }
        params.push(f.val);
        return `NOT (${this.table}.${f.col} ${sqlOp} $${params.length})`;
      }

      params.push(f.val);
      const idx = params.length;
      const opMap = {
        eq: '=',
        neq: '!=',
        gt: '>',
        lt: '<',
        gte: '>=',
        lte: '<=',
        like: 'LIKE',
        ilike: 'ILIKE'
      };
      return `${this.table}.${f.col} ${opMap[f.type]} $${idx}`;
    });

    return {
      whereSql: ` WHERE ${parts.join(' AND ')}`,
      params
    };
  }

  async execute() {
    try {
      const { whereSql, params } = this.compileFilters();
      let queryText = '';
      let queryVals = [...params];

      // Handle COUNT head optimization
      if (this.exactCount && this.isHead) {
        queryText = `SELECT COUNT(*)::integer AS count FROM ${this.table} ${whereSql}`;
        const res = await pool.query(queryText, queryVals);
        return { data: null, error: null, count: res.rows[0].count };
      }

      // Compile select projection
      const projectionTable = (this.operation === 'select') ? this.table : 'affected';
      const parsedSelect = parseSelect(this.selectFields);
      const compiledProjection = parsedSelect.map(f => compileField(projectionTable, f, this.table)).join(', ');

      if (this.operation === 'select') {
        let orderSql = '';
        if (this.orders.length > 0) {
          const orderParts = this.orders.map(o => {
            const dir = o.ascending ? 'ASC' : 'DESC';
            const nulls = o.nullsFirst ? ' NULLS FIRST' : (o.nullsFirst === false ? ' NULLS LAST' : '');
            return `${this.table}.${o.col} ${dir}${nulls}`;
          });
          orderSql = ` ORDER BY ${orderParts.join(', ')}`;
        }

        let limitSql = '';
        if (this.limitCount !== null) {
          limitSql = ` LIMIT ${this.limitCount}`;
        }

        queryText = `SELECT ${compiledProjection} FROM ${this.table}${whereSql}${orderSql}${limitSql}`;
      } else if (this.operation === 'insert') {
        let insertSql = '';
        let insertVals = [];
        if (Array.isArray(this.insertData)) {
          if (this.insertData.length === 0) {
            return { data: [], error: null };
          }
          const allKeys = Object.keys(this.insertData[0]);
          const valueRows = [];
          this.insertData.forEach(row => {
            const rowVals = allKeys.map(k => row[k]);
            const rowPlaceholders = rowVals.map(() => {
              insertVals.push(rowVals[insertVals.length]);
              return `$${insertVals.length}`;
            });
            valueRows.push(`(${rowPlaceholders.join(', ')})`);
          });
          insertSql = `INSERT INTO ${this.table} (${allKeys.join(', ')}) VALUES ${valueRows.join(', ')}`;
        } else {
          const keys = Object.keys(this.insertData);
          const vals = Object.values(this.insertData);
          insertVals = vals;
          const placeholders = vals.map((_, i) => `$${i + 1}`);
          insertSql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`;
        }

        queryText = `WITH affected AS (${insertSql} RETURNING *) SELECT ${compiledProjection} FROM affected`;
        queryVals = insertVals;
      } else if (this.operation === 'update') {
        const keys = Object.keys(this.updateData);
        const vals = Object.values(this.updateData);
        const setClauses = keys.map((key, i) => {
          queryVals.push(vals[i]);
          return `${key} = $${queryVals.length}`;
        });
        const updateSql = `UPDATE ${this.table} SET ${setClauses.join(', ')}${whereSql}`;
        queryText = `WITH affected AS (${updateSql} RETURNING *) SELECT ${compiledProjection} FROM affected`;
      } else if (this.operation === 'delete') {
        const deleteSql = `DELETE FROM ${this.table}${whereSql}`;
        queryText = `WITH affected AS (${deleteSql} RETURNING *) SELECT ${compiledProjection} FROM affected`;
      }

      const res = await pool.query(queryText, queryVals);
      let rows = res.rows;
      let data = rows;
      let error = null;

      if (this.isSingle) {
        if (rows.length === 0) {
          data = null;
          error = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };
        } else {
          data = rows[0];
        }
      } else if (this.isMaybeSingle) {
        if (rows.length === 0) {
          data = null;
        } else {
          data = rows[0];
        }
      }

      return { data, error, count: rows.length };
    } catch (err) {
      console.error(`[DATABASE ERROR] Query failed:`, err.message);
      return { data: null, error: err, count: 0 };
    }
  }

  // To make the builder awaitable directly like Supabase
  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const supabase = {
  from(table) {
    return new QueryBuilder(table);
  },
  async rpc(funcName, params = {}) {
    try {
      const keys = Object.keys(params);
      const vals = Object.values(params);
      let sql = '';
      let res = null;
      if (keys.length === 0) {
        sql = `SELECT * FROM ${funcName}()`;
        res = await pool.query(sql);
      } else {
        const paramParts = keys.map((key, i) => `${key} := $${i + 1}`);
        sql = `SELECT * FROM ${funcName}(${paramParts.join(', ')})`;
        res = await pool.query(sql, vals);
      }
      
      let data = res.rows;
      if (res.rows.length > 0) {
        const firstRow = res.rows[0];
        const cols = Object.keys(firstRow);
        if (cols.length === 1 && (cols[0] === funcName || cols[0] === 'increment_coupon_uses' || cols[0] === 'decrement_coupon_uses')) {
          data = firstRow[cols[0]];
        }
      }
      
      return { data, error: null };
    } catch (err) {
      console.error(`[DATABASE ERROR] RPC ${funcName} failed:`, err.message);
      return { data: null, error: err };
    }
  }
};

module.exports = {
  supabase,
  pool,
  initializeDatabase,
};
