import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';

const trustedOrigins = (process.env.CSRF_TRUSTED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

const buildTarget = (process.env.APP_BUILD_TARGET ?? 'vercel').trim().toLowerCase();
const useCloudRunAdapter = buildTarget === 'cloud-run';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: useCloudRunAdapter
			? adapterNode({
					out: 'build',
					precompress: false
				})
			: adapterVercel({
					runtime: 'nodejs22.x',
					regions: ['sin1'],
					memory: 1024,
					maxDuration: 60
				}),
		csrf: {
			trustedOrigins
		}
	}
};

export default config;
