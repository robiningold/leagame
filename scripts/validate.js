// Prüft config.json. Wird vor jedem Build ausgeführt.
import { checkAll } from '../lib/content.js';

if (!checkAll()) process.exit(1);
