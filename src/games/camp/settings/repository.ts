import { createIndexedDbSettingsRepository } from '../../../integrations/storage/indexeddb-settings';
import { CAMP_SETTINGS_CATALOG } from './catalog';
/** 单一目录与单一存储入口供设置页和新开局共用；这里只创建适配器，不立即读库。 */
export const campSettingsRepository = createIndexedDbSettingsRepository(CAMP_SETTINGS_CATALOG);
