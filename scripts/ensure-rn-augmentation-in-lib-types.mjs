import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const augmentationSrc = path.join(
  root,
  'types/signalFox/react-native-augmentation.d.ts'
);
const augmentationDest = path.join(
  root,
  'lib/typescript/src/signalFox/react-native-augmentation.d.ts'
);
const indexDts = path.join(root, 'lib/typescript/src/index.d.ts');

const ref =
  '/// <reference path="./signalFox/react-native-augmentation.d.ts" />\n';

fs.mkdirSync(path.dirname(augmentationDest), { recursive: true });
fs.copyFileSync(augmentationSrc, augmentationDest);

let index = fs.readFileSync(indexDts, 'utf8');
if (!index.includes('react-native-augmentation.d.ts')) {
  index = ref + index;
  fs.writeFileSync(indexDts, index);
}
