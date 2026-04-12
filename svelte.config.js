import adapter from '@sveltejs/adapter-node';

const trustedOrigins = (process.env.CSRF_TRUSTED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			precompress: true
		}),
		csrf: {
			trustedOrigins
		}
	}
};

export default config;
