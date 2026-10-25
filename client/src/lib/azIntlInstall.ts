// Side-effect module, imported first by main.tsx: Azerbaijani dates must work before any module creates a formatter.
import { installAzIntl } from './azIntl';

installAzIntl();
