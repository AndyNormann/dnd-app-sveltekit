import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'rm -f data/test.db data/test.db-wal data/test.db-shm && npm run build && npm run preview',
		port: 4173,
		env: { DM_PASSCODE: 'test-passcode', DB_PATH: 'data/test.db' }
	},
	testMatch: '**/*.e2e.{ts,js}'
});
