// node --test worker/test/engine.test.js
import { test } from 'node:test';
import { tests } from './suite.js';
import { roomTests } from './room.suite.js';
import { tjTests } from './tajniacy.suite.js';

for (const t of [...tests, ...roomTests, ...tjTests]) test(t.name, t.fn);
