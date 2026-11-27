import {behaviourNames} from './behaviour-schema.js';

export const serverUpdateMessage='The workshop server is running an older version. Restart the launcher, then refresh this page.';
export function serverSupportsEditor(config){
  return Array.isArray(config?.behaviourTypes)&&Object.keys(behaviourNames).every(type=>config.behaviourTypes.includes(type));
}
