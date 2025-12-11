const mysql = require('mysql2/promise');
const envLoader = require('./src/envLoader.js');
const env = envLoader.loadEnv();

async function checkDatabase() {
  try {
    const conn = await mysql.createConnection({
      host: env.MARIADB_HOST,
      port: env.MARIADB_PORT,
      user: env.MARIADB_USER,
      password: env.MARIADB_PASSWORD,
      database: env.SW_DB_NAME
    });
    
    console.log('データベースに接続しました');
    
    // PCB CPを含むデータを検索
    const [rows] = await conn.query(`
      SELECT * FROM sw_components 
      WHERE name LIKE '%PCB%' OR name LIKE '%CP%' OR code LIKE '%PCB%' OR code LIKE '%CP%'
    `);
    
    console.log('PCB/CP関連のデータ:');
    console.log(rows);
    
    // 全ての名称を表示
    const [names] = await conn.query('SELECT DISTINCT name FROM sw_components WHERE name <> \'\' ORDER BY name');
    console.log('\n全ての名称:');
    console.log(names.map(row => row.name));
    
    await conn.end();
  } catch (error) {
    console.error('エラー:', error);
  }
}

checkDatabase();
