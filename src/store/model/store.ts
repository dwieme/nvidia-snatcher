import {LoadEvent, Page} from 'puppeteer';

export interface Element {
	container: string;
	text: string[];
}

export interface Link {
	series: string;
	brand: string;
	model: string;
	url: string;
	cartUrl?: string;
	openCartAction?: (page: Page) => Promise<string>;
	screenshot?: string;
}

export interface Labels {
	captcha?: Element;
	inStock: Element;
}

export interface Store {
	links: Link[];
	labels: Labels;
	name: string;
	setupAction?: (page: Page) => void;
	customWaitFor?: LoadEvent;
}
