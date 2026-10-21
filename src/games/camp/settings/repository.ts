import { CAMP_SETTINGS_CATALOG } from './catalog';
import { defaultSettings, parseSettings, validateSettings, type NpcSettings } from '../../../../packages/npc-settings/src';

const HISTORICAL_FIVE = ['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye'];
/** Only the complete published five-person catalog is an eligible historical document. */
export function parseCampStoredSettings(text: string): NpcSettings {
  try { return parseSettings(CAMP_SETTINGS_CATALOG, text); }
  catch {
    const historical = { ...CAMP_SETTINGS_CATALOG,
      characters: CAMP_SETTINGS_CATALOG.characters.filter(person => HISTORICAL_FIVE.includes(person.id)) };
    // parseSettings validates versions, exact roster, every field and value before expansion.
    const previous = parseSettings(historical, text);
    const expanded = defaultSettings(CAMP_SETTINGS_CATALOG);
    Object.assign(expanded.characters, previous.characters);
    return validateSettings(CAMP_SETTINGS_CATALOG, expanded);
  }
}
