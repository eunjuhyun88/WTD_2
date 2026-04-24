import nodeAdapter from '@sveltejs/adapter-node';
import vercelAdapter from '@sveltejs/adapter-vercel';

const trustedOrigins = (process.env.CSRF_TRUSTED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);
const deployTarget = (process.env.APP_DEPLOY_TARGET ?? 'vercel').trim().toLowerCase();

function resolveAdapter() {
	if (deployTarget === 'cloudrun') {
		return nodeAdapter({
			out: 'build',
			precompress: false
		});
	}

	return vercelAdapter({
		runtime: 'nodejs22.x',
		regions: ['sin1'],
		memory: 1024,
		maxDuration: 60
	});
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: resolveAdapter(),
		csrf: {
			trustedOrigins
		}
	}
};

export default config;
