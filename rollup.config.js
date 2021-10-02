import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/loggers.ts',
    output: {
        format: 'cjs',
        dir: 'lib',
        exports: 'named',
        sourcemap: true,
        strict: true
    },
    external: ['process'],
    plugins: [
        typescript(),
        resolve(),
        commonjs()
    ]
};
