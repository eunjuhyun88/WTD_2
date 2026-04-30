import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [
		sveltekit(),
	],
	server: {
		host: '0.0.0.0',
		allowedHosts: ['localhost', '127.0.0.1', '.ngrok-free.app', '.ngrok.app'],
		fs: {
			allow: [
				path.resolve(__dirname, '../../../..'),
			]
		}
	},
	ssr: {
		external: ['pg-native', 'cloudflare:sockets', 'lightweight-charts'],
	},
	build: {
		rollupOptions: {
			external: ['pg-native', 'cloudflare:sockets'],
		},
	},
});
