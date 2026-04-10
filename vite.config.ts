import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		allowedHosts: ['localhost', '127.0.0.1', '.ngrok-free.app', '.ngrok.app'],
		fs: {
			allow: [
				// worktree 환경에서 메인 레포의 node_modules 접근 허용
				path.resolve(__dirname, '../../..'),
			]
		}
	}
});
