"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vite_1 = require("vite");
const plugin_react_1 = require("@vitejs/plugin-react");
const vite_2 = require("@tailwindcss/vite");
const node_globals_polyfill_1 = require("@esbuild-plugins/node-globals-polyfill");
// Vite config
exports.default = (0, vite_1.defineConfig)({
    server: {
        host: '0.0.0.0',
    },
    plugins: [
        //nodePolyfills({}),
        (0, plugin_react_1.default)(),
        (0, vite_2.default)()
    ],
    define: {
        global: 'globalThis', // make sure global is defined
        'process.env': {}, // Needed for many packages that access process.env.*
    },
    resolve: {
        alias: {
            process: 'process',
            buffer: 'buffer',
        },
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: 'globalThis',
            },
            plugins: [
                (0, node_globals_polyfill_1.NodeGlobalsPolyfillPlugin)({
                    process: true,
                    buffer: true,
                }),
            ],
        },
    },
});
