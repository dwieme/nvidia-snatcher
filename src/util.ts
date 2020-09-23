import {Config} from './config';

export function getSleepTime(min = Config.browser.minSleep, max = Config.browser.maxSleep) {
	return min + Math.floor(Math.random() * (max - min));
}

export async function delay(ms: number) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}
