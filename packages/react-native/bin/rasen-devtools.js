#!/usr/bin/env node
/**
 * @rasenjs/react-native — devtools server CLI
 *
 * Usage:
 *   npx rasen-devtools            # start the devtools server (default 8099)
 *   PORT=9000 npx rasen-devtools  # custom port
 */
// bin sits one level above the package root: server.cjs lives in dist/devtools/.
require('../dist/devtools/server.cjs')
