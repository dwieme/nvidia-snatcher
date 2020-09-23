import {Config} from './config';
import {Logger} from './logger';
import {Stores} from './store/model';
import {adBlocker} from './adblocker';
import {getSleepTime} from './util';
import puppeteer from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import {tryLookupAndLoop} from './store';

puppeteer.use(stealthPlugin());
puppeteer.use(adBlocker);

/**
 * Starts the bot.
 */
async function main() {
	if (Stores.length === 0) {
		Logger.error('No stores selected.');
		return;
	}

	const args: string[] = [];

	// Skip Chromium Linux Sandbox
	// https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
	if (Config.browser.isTrusted) {
		args.push('--no-sandbox');
		args.push('--disable-setuid-sandbox');
	}

	const browser = await puppeteer.launch({
		args,
		defaultViewport: {
			height: Config.page.height,
			width: Config.page.width
		},
		headless: Config.browser.isHeadless
	});

	/* eslint-disable no-await-in-loop */
	for (const store of Stores) {
		const page = await browser.newPage();
		page.setDefaultNavigationTimeout(Config.page.navigationTimeout);
		await page.setUserAgent(Config.page.userAgent);

		if (store.setupAction !== undefined) {
			store.setupAction(page);
		}

		void tryLookupAndLoop(page, store, getSleepTime(store.minSleep, store.maxSleep));
	}
	/* eslint-enable no-await-in-loop */
}

/**
 * Will continually run until user interferes.
 */
try {
	void main();
} catch (error) {
	// Ignoring errors; more than likely due to rate limits
	Logger.error(error);
	void main();
}
