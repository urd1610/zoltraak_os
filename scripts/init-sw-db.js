#!/usr/bin/env node
/* eslint-disable no-console */
const { createSwMenuService } = require('../src/swMenuService');

const run = async () => {
  const service = createSwMenuService();
  console.log('SWメニュー用データベースを初期化します...');
  const result = await service.ensureSchema();

  if (!result?.ok) {
    console.error('初期化に失敗しました:', result?.error || 'unknown error');
    await service.dispose();
    process.exit(1);
    return;
  }

  console.log(
    `初期化完了 database=${result.database} host=${result.host}:${result.port} user=${result.user || 'unknown'}`,
  );
  if (result.lastInitializedAt) {
    console.log(`最終初期化: ${result.lastInitializedAt}`);
  }
  await service.dispose();
};

run().catch(async (error) => {
  console.error('初期化で例外が発生しました', error);
  try {
    const service = createSwMenuService();
    await service.dispose();
  } catch (disposeError) {
    console.error('接続クリーンアップに失敗しました', disposeError);
  }
  process.exit(1);
});
