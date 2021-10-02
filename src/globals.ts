function emptyFunction() {}

let globalScope;
let hasWindow = false;
if (typeof window !== 'undefined') {
    globalScope = window;
    hasWindow = true;
} else { // @ts-ignore
    if (typeof global !== 'undefined') {
        // @ts-ignore
        globalScope = global;
    } else if (typeof self !== 'undefined') {
        globalScope = self;
    } else {
        // cf. http://www.2ality.com/2014/05/this.html
        // and http://speakingjs.com/es5/ch23.html#_indirect_eval_evaluates_in_global_scope
        globalScope = eval.call(null, 'this'); // eslint-disable-line no-eval
    }
}
// Assign to a constant to avoid exporting a mutable variable (which ESLint doesn't like).
const globalScopeConst = globalScope;

export default globalScopeConst;

export const topWindow = hasWindow ? window.top : null;

export const location = hasWindow
    ? window.location
    : {
        href: '',
        protocol: '',
        host: '',
        hostname: '',
        port: '',
        pathname: '',
        search: '',
        hash: '',
        username: '',
        password: '',
        origin: '',
        assign: emptyFunction,
        reload: emptyFunction,
        replace: emptyFunction,
        toString: () => ''
    };

export const now =
    globalScope && globalScope.performance && globalScope.performance.now ? () => performance.now() : () => Date.now();
