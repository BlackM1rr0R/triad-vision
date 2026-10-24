import main from './main';
import details from './details';
import extra from './extra';
import ui from './ui';
import company from './company';
import visa from './visa';
import booking from './booking';
import jobs from './jobs';
import publicAi from './publicAi';
import growthPlus from './growthPlus';
import growth from './growth';
import tools from './tools';
import cities from './cities';
import a11yStatement from './a11yStatement';
import site from './site';
import legal from './legal';
import marketing from './marketing';
import legalDocs from './legalDocs';
import cookieConsent from './cookieConsent';
import siteNav from './siteNav';
import audience from './audience';
import discover from './discover';
import packages from './packages'; // service packages page (/packages)
import { deepMerge } from '../merge';

/** All uk copy of the public site in one resource object (loaded on demand by i18n/index.ts). */
export default deepMerge([main, details, extra, ui, company, visa, booking, jobs, publicAi, growthPlus, growth, tools, cities, a11yStatement, site, legal, marketing, legalDocs, cookieConsent, siteNav, audience, discover, packages]);
