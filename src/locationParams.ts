import {topWindow, location} from './globals';

type Params = Record<string, string | string[]>;
const re = /([^&=]+)=?([^&]*)/g;
function decode(str) {
    return decodeURIComponent(str.replace(/\+/g, ' '));
}

/**
 * Parses a parameter string of the form key1=value1&key2=value2&...
 */
function parseParams(query: string | null | undefined): Params {
    const params: Params = {};
    if (query) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const e = re.exec(query);
            if (!e) {
                break;
            }
            const k = decode(e[1]);
            const v = decode(e[2]);
            const currentValue = params[k];
            if (currentValue !== undefined) {
                let arr: string[];
                if (!Array.isArray(currentValue)) {
                    arr = params[k] = [currentValue];
                } else {
                    arr = currentValue;
                }
                arr.push(v);
            } else {
                params[k] = v;
            }
        }
    }
    return params;
}

export function getLocationParams(): Params {
    let params: Params | null = null;

    if (topWindow) {
        try {
            params = parseParams(topWindow.location.search.substr(1));
        } catch (e) {
            // If we can't access the top window's location, fall back to the default
            // of using the current window's location.
        }
    }
    if (!params) {
        params = parseParams(location.search.substr(1));
    }
    return params;
}
