import { config } from './config.js';
import { createApp } from './app.js';

createApp().listen(config.port, () => {
  console.log(`Triad Vision API listening on http://localhost:${config.port}`);
});
