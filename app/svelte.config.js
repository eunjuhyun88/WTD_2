import adapter from '@sveltejs/adapter-vercel';

const trustedOrigins = (process.env.CSRF_TRUSTED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			regions: ['iad1'],
			memory: 1024,
			maxDuration: 60
		}),
		csrf: {
			trustedOrigins
		}
	}
};

export default config;
