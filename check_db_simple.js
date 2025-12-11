const mysql = require('mysql2/promise');
const envLoader = require('./src/envLoader.js');
const env = envLoader.loadEnv();

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: env.MARIADB_HOST,
      port: env.MARIADB_PORT,
      user: env.MARIADB_USER,
      password: env.MARIADB_PASSWORD,
      database: env.SW_DB_NAME
    });
    
    // PCB CPを含むデータを検索
    const [rows] = await conn.query('SELECT * FROM sw_components WHERE name LIKE ? OR name LIKE ? OR code LIKE ? OR code LIKE ?', ['%PCB%', '%CP%', '%PCB%', '%CP%']);
    
    console.log('PCB/CP関連のデータ:');
    console.log(JSON.stringify(rows, null, 2));
    
    // 全ての名称を表示
    const [names] = await conn.query('SELECT DISTINCT name FROM sw_components WHERE name <> ? ORDER BY name', ['']);
    console.log('\n全ての名称:');
    console.log(JSON.stringify(names.map(row => row.name), null, 2));
    
    await conn.end();
  } catch (error) {
    console.error('エラー:', error.message);
  }
})();
