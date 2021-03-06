import {Link, Store} from './model';
import {Page, Response} from 'puppeteer';
import {delay, getSleepTime} from '../util';

import {Config} from '../config';
import {Logger} from '../logger';
import {includesLabels} from './includes-labels';
import open from 'open';
import {sendNotification} from '../notification';

const inStock: Record<string, boolean> = {};

/**
 * Returns true if the brand should be checked for stock
 *
 * @param brand The brand of the GPU
 */
function filterBrand(brand: string) {
	if (Config.store.showOnlyBrands.length === 0) {
		return true;
	}

	return Config.store.showOnlyBrands.includes(brand);
}

/**
 * Returns true if the series should be checked for stock
 *
 * @param series The series of the GPU
 */
function filterSeries(series: string) {
	if (Config.store.showOnlySeries.length === 0) {
		return true;
	}

	return Config.store.showOnlySeries.includes(series);
}

function filterModel(model: string) {
	if (Config.store.showOnlyModels.length === 0) {
		return true;
	}

	return Config.store.showOnlyModels.includes(model);
}

/**
 * Responsible for looking up information about a each product within
 * a `Store`. It's important that we ignore `no-await-in-loop` here
 * because we don't want to get rate limited within the same store.
 * @param browser Puppeteer browser.
 * @param store Vendor of graphics cards.
 */
async function lookup(page: Page, store: Store) {
	/* eslint-disable no-await-in-loop */
	for (const link of store.links) {
		if (!filterSeries(link.series)) {
			continue;
		}

		if (!filterBrand(link.brand)) {
			continue;
		}

		if (!filterModel(link.model)) {
			continue;
		}

		try {
			await lookupCard(page, store, link);
		} catch (error) {
			Logger.error(`✖ [${store.name}] ${link.brand} ${link.model} - ${error.message as string}`);
		}
	}
	/* eslint-enable no-await-in-loop */
}

async function lookupCard(page: Page, store: Store, link: Link) {
	const givenWaitFor = store.customWaitFor ? store.customWaitFor : 'networkidle0';
	const response: Response | null = await page.goto(link.url, {waitUntil: givenWaitFor});
	const graphicsCard = `${link.brand} ${link.model}`;

	if (await lookupCardInStock(store, page, graphicsCard)) {
		Logger.info(`🚀🚀🚀 [${store.name}] ${graphicsCard} IN STOCK 🚀🚀🚀`);
		Logger.info(link.url);
		if (Config.page.inStockWaitTime) {
			inStock[store.name] = true;
			setTimeout(() => {
				inStock[store.name] = false;
			}, 1000 * Config.page.inStockWaitTime);
		}

		if (Config.page.capture) {
			Logger.debug('ℹ saving screenshot');
			link.screenshot = `success-${Date.now()}.png`;
			await page.screenshot({path: link.screenshot});
		}

		let givenUrl = link.cartUrl ? link.cartUrl : link.url;

		if (Config.browser.open) {
			if (link.openCartAction === undefined) {
				await open(givenUrl);
			} else {
				givenUrl = await link.openCartAction(page);
			}
		}

		sendNotification(givenUrl, link);
		return;
	}

	if (await lookupPageHasCaptcha(store, page)) {
		Logger.warn(`✖ [${store.name}] CAPTCHA from: ${graphicsCard}. Waiting for a bit with this store...`);
		await delay(getSleepTime());
		return;
	}

	if (response && response.status() === 429) {
		Logger.warn(`✖ [${store.name}] Rate limit exceeded: ${graphicsCard}`);
		return;
	}

	Logger.info(`✖ [${store.name}] still out of stock: ${graphicsCard}`);
}

async function lookupCardInStock(store: Store, page: Page, graphicsCard: string) {
	const stockHandle = await page.$(store.labels.inStock.container);

	const visible = await page.evaluate(element => element && element.offsetWidth > 0 && element.offsetHeight > 0, stockHandle);
	if (!visible) {
		Logger.warn(`✖ [${store.name}] ${graphicsCard} not visible`);
		return false;
	}

	const stockContent = await page.evaluate(element => element.outerHTML, stockHandle);

	Logger.debug(stockContent);

	if (includesLabels(stockContent, store.labels.inStock.text)) {
		return true;
	}

	return false;
}

async function lookupPageHasCaptcha(store: Store, page: Page) {
	if (!store.labels.captcha) {
		return false;
	}

	const captchaHandle = await page.$(store.labels.captcha.container);
	const captchaContent = await page.evaluate(element => element.textContent, captchaHandle);

	if (includesLabels(captchaContent, store.labels.captcha.text)) {
		return true;
	}

	return false;
}

export async function tryLookupAndLoop(page: Page, store: Store, sleepTime: number) {
	Logger.debug(`[${store.name}] Starting lookup...`);
	try {
		if (Config.page.inStockWaitTime && inStock[store.name]) {
			Logger.info(`[${store.name}] Has stock, waiting before trying to lookup again...`);
		} else {
			await lookup(page, store);
		}
	} catch (error) {
		Logger.error(error);
	}

	Logger.debug(`[${store.name}] Lookup done, next one in ${sleepTime} ms`);
	setTimeout(tryLookupAndLoop, sleepTime, page, store, sleepTime);
}
