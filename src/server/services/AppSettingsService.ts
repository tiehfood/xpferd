import type { AppSettingsDto } from '../../shared/types';
import { AppSettingsModel } from '../models/AppSettings.js';
import { Database } from '../database/Database.js';

export class AppSettingsService {
  private get model(): AppSettingsModel {
    return new AppSettingsModel(Database.getInstance().getDb());
  }

  get(): AppSettingsDto {
    return this.model.get();
  }

  update(dto: AppSettingsDto): AppSettingsDto {
    return this.model.update(dto);
  }
}
