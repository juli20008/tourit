import * as dotenv from 'dotenv';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
// Load .env first, then .env.local (local values win)
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });
