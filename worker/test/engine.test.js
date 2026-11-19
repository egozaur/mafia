// node --test worker/test/
import { test } from 'node:test';
import { tests } from './suite.js';
import { roomTests } from './room.suite.js';

for (const t of [...tests, ...roomTests]) test(t.name, t.fn);
