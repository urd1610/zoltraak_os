#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const { createSwMenuService } = require('../src/swMenuService');
const { loadSwMenuEnv } = require('../src/envLoader');

loadSwMenuEnv({ baseDir: path.resolve(__dirname, '..') });

const run = async () => {
  const service = createSwMenuService();
  console.log('データベース接続をテストします...');
  
  try {
    // 接続テスト
    const status = await service.getStatus();
    console.log('接続状態:', status);
    
    if (!status.ready) {
      console.log('データベースが準備できていません。初期化を実行します...');
      const initResult = await service.ensureSchema();
      console.log('初期化結果:', initResult);
      
      if (!initResult?.ok) {
        throw new Error('初期化に失敗しました: ' + (initResult?.error || 'unknown error'));
      }
    }
    
    // PCB CPデータを検索
    const suggestions = await service.getComponentSuggestions();
    console.log('\n取得した候補データ:', suggestions);
    
    if (suggestions && suggestions.suggestions && suggestions.suggestions.names) {
      console.log('\n全名称候補:');
      console.log(suggestions.suggestions.names);
      
      // PCB CPが含まれているか確認
      const hasPcbCp = suggestions.suggestions.names.some(name => 
        name && (name.toLowerCase().includes('pcb') || name.toLowerCase().includes('cp'))
      );
      console.log('\nPCB CPを含む名称:', hasPcbCp ? 'あり' : 'なし');
      
      // 場所ごとの名称も確認
      if (suggestions.suggestions.namesByLocation) {
        console.log('\n場所ごとの名称:');
        Object.entries(suggestions.suggestions.namesByLocation).forEach(([location, names]) => {
          console.log(`場所: ${location}`);
          names.forEach(name => {
            if (name && (name.toLowerCase().includes('pcb') || name.toLowerCase().includes('cp'))) {
              console.log(`  - ${name} ← PCB/CP関連`);
            } else {
              console.log(`  - ${name}`);
            }
          });
        });
      }
    } else {
      console.log('候補データが取得できませんでした');
    }
    
  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await service.dispose();
  }
};

run().catch(async (error) => {
  console.error('テストで例外が発生しました', error);
  process.exit(1);
});
