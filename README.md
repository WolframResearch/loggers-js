# Logger.js

Just another simple JavaScript logging framework.

Supports different named loggers (which can be enabled or disabled individually) and different logging levels.

Loggers can be configured through a global variable `LOGGERS`, through a URL query parameter `?loggers={name}={loglevel}`, or programmaticaly.

## Installation

Assuming you are using a package manager such as [npm](https://www.npmjs.com/get-npm) or [Yarn](https://yarnpkg.com/en/), just install this package from the npm repository:

    npm install loggers-js

Then you can import `getLogger` in your JavaScript code:

    import {getLogger} from 'loggers-js';

## Example

    const logger = getLogger('mylogger');
    logger.enable();
    logger.setLevel('info');
    logger.info('Hello world!');

## Contributing

Everyone is welcome to contribute. Please read the [Contributing agreement](CONTRIBUTING.md) and the [Development guide](./docs/Development.md) for more information, including how to run the tests.

## Versioning

We use [semantic versioning](https://semver.org/) for this library and its API.

See the [changelog](CHANGELOG.md) for details about the changes in each release.
