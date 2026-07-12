import { readFileSync, writeFileSync } from 'node:fs';

const file = '.tap/report/coverage-final.json';

writeFileSync(file, readFileSync(file, 'utf8').replace(/"column":-1/g, '"column":0'));