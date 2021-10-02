/**
 * A JavaScript logging framework.
 * Supports different named loggers (which can be enabled or disabled individually),
 * and different (global) logging levels.
 * @module logger
 * @author Jan Poeschko <jpoeschko@wolfram.com>
 *
 * @example
 * // Create a specific logger:
 * const logger = loggers.create("notebook")
 * // and use it:
 * logger.log("Message", 1, 2, 3)
 * // Enable it by default in your config.properties:
 * js.loggers=main,notebook
 *
 * @example
 * // Output a stack trace:
 * loggers.setLevel("trace")
 * logger.trace()
 *
 * @example
 * // Use query parameter to adjust individual logger level.
 * // For example, the following query adjusts the 'boxes' logger to 'debug' level.
 * // <notebookURL>?loggers=boxes=debug
 */

import {each, includes, map, toArray, without} from 'lodash';
import {contains as stringContains, trim} from 'underscore.string';
import process from 'process';
import globals, {now} from './globals';

import {getLocationParams} from './locationParams';

const IS_SERVER = process.env.IS_SERVER === 'true';
const TESTING = process.env.TESTING === 'true';
const DEBUG = process.env.NODE_ENV !== 'production';

const levelNames = ['off', 'log', 'error', 'warn', 'info', 'debug', 'trace'];

const LEVEL_TO_NUMBER = {};
each(levelNames, (name, index) => {
    LEVEL_TO_NUMBER[name] = index + 1;
});

const CONSOLE_METHODS_BY_LEVEL = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
    log: console.log
};

function logToStdOut(msg) {
    process.stdout.write(`${msg}\n`, 'utf8');
}

function logToStdErr(msg) {
    process.stderr.write(`${msg}\n`, 'utf8');
}

if (globals.IS_SERVER) {
    CONSOLE_METHODS_BY_LEVEL.error = logToStdErr;
    CONSOLE_METHODS_BY_LEVEL.warn = logToStdOut;
    CONSOLE_METHODS_BY_LEVEL.info = logToStdOut;
    CONSOLE_METHODS_BY_LEVEL.debug = logToStdOut;
    CONSOLE_METHODS_BY_LEVEL.log = logToStdOut;
}

export function setOutputFunction(log: (...args: any) => void) {
    CONSOLE_METHODS_BY_LEVEL.error = CONSOLE_METHODS_BY_LEVEL.warn = CONSOLE_METHODS_BY_LEVEL.info = CONSOLE_METHODS_BY_LEVEL.debug = CONSOLE_METHODS_BY_LEVEL.log = log;

    // Also change the actual console methods, so that e.g. React warnings don't write
    // to the console directly (which can mess up the StdInOutCommunication between Java and JS).
    // Keep the original methods as "original*" properties just in case.
    const consoleChanged = console as any;
    consoleChanged.originalError = consoleChanged.originalError || console.error;
    consoleChanged.originalWarn = consoleChanged.originalWarn || console.warn;
    consoleChanged.originalInfo = consoleChanged.originalInfo || console.info;
    consoleChanged.originalDebug = consoleChanged.originalDebug || console.debug;
    consoleChanged.originalLog = consoleChanged.originalLog || console.log;
    console.error = console.warn = console.info = console.debug = console.log = log;
}

const loggers = {};

/**
 * The global logging level, applied to all loggers.
 */
let logLevel;

function levelToNumber(value) {
    if (typeof value === 'string') {
        return LEVEL_TO_NUMBER[value];
    }
    return value;
}

function levelFromNumber(value) {
    return levelNames[value - 1];
}

if (includes(['LOCAL', 'LOCAL8080', 'DEVEL'], globals.serverCategory)) {
    // On devel and localhost, set the logging level to "info".
    // Individual loggers still have to be enabled for messages to actually show up.
    logLevel = levelToNumber('info');
} else {
    // Otherwise, set the global logging level to "off" by default.
    logLevel = levelToNumber('off');
}

/**
 * List of loggers which are enabled as soon as they are created.
 *
 * This can be configured in the deploy properties as js.loggers, from where it gets propagated as a global variable
 * jsLoggers in initData.jsp.
 *
 * Note that, currently, globals.jsLoggers is empty during server-side rendering. To enable loggers and set log levels
 * for server-side rendering, modify enableDebugLoggers in javascript/notebook/serverRendering.js.
 */
let enabledLoggers: string[] = map((globals.jsLoggers || '').split(','), s => {
    return trim(s);
});

const enabledLoggerLevels = {};

/**
 * Boolean to determine whether to include the timestamp when logging.
 *
 * This is set by the js.loggers.timestamp deploy property.
 *
 * The default/fallback value should be true.
 */
const timestampEnabled: boolean = (globals.jsLoggersTimestamp || 'true').trim().toLowerCase() !== 'false';

export function logRenderError(...args) {
    if (IS_SERVER) {
        const parts = args.map(arg => {
            if (arg) {
                if (arg.msg) {
                    return arg.msg;
                } else if (arg instanceof Error) {
                    return `${arg.toString()} @ ${arg.stack}`;
                } else {
                    return arg.toString();
                }
            } else {
                return JSON.stringify(arg);
            }
        });
        CONSOLE_METHODS_BY_LEVEL.warn.call(console, parts.join(' '));
    }
}

type Options = {level?: string | number};

class Logger {
    name: string;
    enabled: boolean;
    level: number;
    pendingAsyncCalls: any;
    logLevel: number | null;
    indentation: number;

    /**
     * Creates a new logger instance.
     * @param {string} name
     * @param {{level: number|string}} options Additional options for the level.
     * Can include a level which will be used for all logs of this logger ("debug" by default).
     * @constructor
     * @global
     */
    constructor(name, options: Options = {}) {
        this.name = name || '';
        this.enabled = includes(enabledLoggers, name);
        this.level = levelToNumber(options.level || 'log');
        this.pendingAsyncCalls = [];
        this.logLevel = enabledLoggerLevels[name] || null;
        this.indentation = 0;
    }

    /**
     * Enables this logger.
     * @memberof Logger#
     */
    enable(level = null) {
        this.enabled = true;
        if (level !== null) {
            this.setLogLevel(level);
        }
    }

    /**
     * Disables this logger.
     * @memberof Logger#
     */
    disable() {
        this.enabled = false;
    }

    isEnabled() {
        return this.enabled;
    }

    hasLevel(level) {
        const levelNumber = levelToNumber(level);
        const effectiveLogLevel = this.logLevel !== null ? this.logLevel : logLevel;
        return this.enabled && effectiveLogLevel >= levelNumber;
    }

    /**
     * Logs a message, if this logger is enabled and an appropriate logging level is set.
     * Works the same way as console.log.
     * @param {number|string} level Level at which to log the message.
     * It will only actually be printed if the global logging level is set to the same level or higher.
     * @param {...*} args Arbitrary number of arguments to log.
     * Can be strings or any other objects.
     * @memberof Logger#
     *
     * TODO: Make multiple args work correctly when server-side rendering. Currently, `logger.log('myObj:', {val: 1});`
     * produces `myObj:` in ServerRendering.log. When fixing that, make sure styling arguments (such as
     * `logger.log('%cfoo', 'color: red');`) are handled correctly.
     */
    logLeveled(level, ...args) {
        if (this.enabled) {
            const levelNumber = levelToNumber(level);
            const effectiveLogLevel = this.logLevel !== null ? this.logLevel : logLevel;
            if (effectiveLogLevel >= levelNumber) {
                // Determine the console method to use depending on the logging level.
                const method =
                    CONSOLE_METHODS_BY_LEVEL[levelFromNumber(levelNumber)] ||
                    CONSOLE_METHODS_BY_LEVEL.log ||
                    console.log;
                method.apply(console, this._transformArgs(args));
            }
        }
    }

    /**
     * Logs at the default level of this logger.
     * @param {...*} args Arbitrary number of arguments to log.
     * @memberof Logger#
     */
    log(...args) {
        if (DEBUG) {
            this.logLeveled(this.level, ...args);
        }
    }

    /**
     * Logs at the error level.
     * @param {...*} args Arbitrary number of arguments to log.
     * @memberof Logger#
     */
    error(...args) {
        if (DEBUG) {
            this.logLeveled('error', ...args);
        }
        if (IS_SERVER) {
            logRenderError(`Error logged [${this.name}]:`, ...args);
        }
    }
    /**
     * Logs at the warn level.
     * @param {...*} args Arbitrary number of arguments to log.
     * @memberof Logger#
     */
    warn(...args) {
        if (DEBUG) {
            this.logLeveled('warn', ...args);
        }
    }
    /**
     * Logs at the info level.
     * @param {...*} args Arbitrary number of arguments to log.
     * @memberof Logger#
     */
    info(...args) {
        if (DEBUG) {
            this.logLeveled('info', ...args);
        }
    }
    /**
     * Logs at the debug level.
     * @param {...*} args Arbitrary number of arguments to log.
     * @memberof Logger#
     */
    debug(...args) {
        if (DEBUG) {
            this.logLeveled('debug', ...args);
        }
    }

    /**
     * Outputs a stack trace, if the logging level is "trace".
     * @memberof Logger#
     */
    trace() {
        if (this.enabled && logLevel >= levelToNumber('trace')) {
            console.trace();
        }
    }

    traceAsyncCall(data) {
        const effectiveLogLevel = this.logLevel !== null ? this.logLevel : logLevel;
        if (this.enabled && effectiveLogLevel >= levelToNumber('trace')) {
            const token = {data, time: now()};
            this.pendingAsyncCalls.push(token);
            return token;
        }
        return null;
    }

    traceAsyncCallEnd(token) {
        if (token) {
            const a = this.pendingAsyncCalls;
            let i;
            for (i = a.length - 1; i >= 0; --i) {
                if (a[i] === token) {
                    a.splice(i, 1);
                    break;
                }
            }
        }
    }

    beginBlock() {
        ++this.indentation;
    }
    endBlock() {
        --this.indentation;
    }

    group(...args) {
        if (this.enabled) {
            console.group(...this._transformArgs(args));
        }
    }
    groupCollapsed(...args) {
        if (this.enabled) {
            console.groupCollapsed(...this._transformArgs(args));
        }
    }
    groupEnd() {
        if (this.enabled) {
            console.groupEnd();
        }
    }

    // TODO: Make time/timeEnd work with ServerRendering.log. (Currently, they just output `%s: %sms`.) It probably
    // doesn't make sense to just disable them, since they are still useful when using a remote debugger (such as
    // chrome://inspect).
    time(...args) {
        if (this.enabled) {
            console.time(...args);
        }
    }
    timeEnd(...args) {
        if (this.enabled) {
            console.timeEnd(...args);
        }
    }

    setLogLevel(level) {
        this.logLevel = levelToNumber(level);
    }

    _transformArgs(args) {
        if (!timestampEnabled) {
            return args;
        }

        const result = toArray(args);
        const date = new Date();
        let prefix = date.toISOString(); // 2011-10-05T14:48:00.000Z
        if (this.name) {
            prefix += ` [${this.name}]`;
        }
        for (let i = 0; i < this.indentation; ++i) {
            prefix += '  ';
        }
        if (result && result.length) {
            result[0] = `${prefix} ${result[0]}`;
        }

        return map(result, item => {
            if (item && item.isExpr) {
                return item.toString();
            } else {
                return item;
            }
        });
    }
}

const params = getLocationParams();
const loggersSetting = params.loggers || globals.LOGGERS;
if (loggersSetting) {
    each(loggersSetting.split(','), logger => {
        let level = null;
        let loggerName = logger;
        if (stringContains(logger, '=')) {
            const parts = logger.split('=');
            loggerName = parts[0];
            level = parts[1];
        }
        if (loggerName.startsWith('!')) {
            enabledLoggers = without(enabledLoggers, loggerName.substr(1));
        } else {
            enabledLoggers.push(loggerName);
            enabledLoggerLevels[loggerName] = levelToNumber(level);
        }
    });
}
if (params.loglevel) {
    logLevel = levelToNumber(params.loglevel);
}

/**
 * Initializes a logger.
 * @param {string} name
 * @param {?{level: number}} options
 * @returns {Logger}
 */
export function get(name: string, options: Options = {}) {
    let logger = loggers[name];
    if (!logger) {
        logger = loggers[name] = new Logger(name, options || {});
    }
    return logger;
}

/**
 * Alias for `get`. (Deprecated. Use `get` instead.)
 */
export function create(name: string, options: Options = {}) {
    return get(name, options);
}

export function getLogger(name: string, options: Options = {}) {
    return get(name, options);
}

/**
 * Set the logging level, which affects all loggers.
 * Possible values are "off", "log", "error", "warn", "info", "debug", "trace".
 * @param {number|string} value
 * @alias logger.setLevel
 */
export function setLevel(value) {
    logLevel = levelToNumber(value);
}

export function getLevel() {
    return logLevel;
}

/**
 * Overrides console.log with the input function. Returns a function that should be called to restore console.log to its
 * previous definition.
 *
 * Note that console.log actually can be used inside customLogFunc.
 *
 * This should rarely be used. One example use case: overriding the console.log statements in a compiled asm.js module.
 */
export function overrideConsoleLog(customLogFunc: (...args: any) => void): () => void {
    // Determine the object that contains console. An if-statement is used because IS_SERVER wasn't getting set when
    // using a ternary operator for some reason.
    let consoleParent;
    if (IS_SERVER || TESTING) {
        consoleParent = global;
    } else {
        consoleParent = window;
    }

    const originalConsoleLog = consoleParent.console.log;

    function restoreConsoleLog() {
        consoleParent.console.log = originalConsoleLog;
    }

    function newConsoleLog(...args: any) {
        restoreConsoleLog();
        customLogFunc(...args);
        consoleParent.console.log = newConsoleLog;
    }

    consoleParent.console.log = newConsoleLog;
    return restoreConsoleLog;
}

/**
 * Loggers interface exposed for debugging purposes.
 */
globals._loggers = loggers;
