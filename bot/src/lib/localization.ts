import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { LocalizationMap } from 'discord.js';

export type SupportedLocale = 'en' | 'es' | 'fr';

// Discord locale mapping to our supported locales
const DISCORD_LOCALE_MAP: Record<string, SupportedLocale> = {
  'en-US': 'en',
  'en-GB': 'en',
  'es-ES': 'es',
  'es-419': 'es', // Latin American Spanish
  'fr': 'fr',
};

interface TranslationData {
  [key: string]: any;
}

class LocalizationService {
  private translations: Map<SupportedLocale, TranslationData> = new Map();
  private defaultLocale: SupportedLocale = 'en';

  constructor() {
    this.loadTranslations();
  }

  /**
   * Load all translation files from the locales directory
   */
  private loadTranslations(): void {
    const locales: SupportedLocale[] = ['en', 'es', 'fr'];
    
    for (const locale of locales) {
      try {
        const filePath = join(__dirname, '..', 'locales', `${locale}.yml`);
        const fileContent = readFileSync(filePath, 'utf8');
        const translationData = yaml.load(fileContent) as TranslationData;
        this.translations.set(locale, translationData);
      } catch (error) {
        console.error(`Failed to load translation file for locale ${locale}:`, error);
      }
    }
  }

  /**
   * Get a translation for a given key and locale
   * @param key - The translation key (e.g., 'common.success')
   * @param locale - The locale to use (defaults to 'en')
   * @param variables - Variables to interpolate in the translation
   * @returns The translated string
   */
  public t(key: string, locale: SupportedLocale = this.defaultLocale, variables?: Record<string, any>): string {
    const translations = this.translations.get(locale) || this.translations.get(this.defaultLocale);
    
    if (!translations) {
      console.warn(`No translations found for locale ${locale}, falling back to key`);
      return key;
    }

    const translation = this.getNestedValue(translations, key);
    
    if (typeof translation !== 'string') {
      // Fallback to default locale if translation not found
      if (locale !== this.defaultLocale) {
        return this.t(key, this.defaultLocale, variables);
      }
      console.warn(`Translation not found for key: ${key}`);
      return key;
    }

    // Interpolate variables if provided
    if (variables) {
      return this.interpolate(translation, variables);
    }

    return translation;
  }

  /**
   * Get a nested value from an object using dot notation
   * @param obj - The object to search in
   * @param path - The dot-separated path (e.g., 'common.success')
   * @returns The value at the path or undefined
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Interpolate variables in a translation string
   * @param template - The template string with {variable} placeholders
   * @param variables - The variables to interpolate
   * @returns The interpolated string
   */
  private interpolate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  /**
   * Get the user's preferred locale from their Discord locale
   * @param discordLocale - The Discord locale string
   * @returns The supported locale or default locale
   */
  public getLocaleFromDiscord(discordLocale?: string): SupportedLocale {
    if (!discordLocale) return this.defaultLocale;

    const mappedLocale = DISCORD_LOCALE_MAP[discordLocale];
    if (mappedLocale && this.translations.has(mappedLocale)) {
      return mappedLocale;
    }

    // Try to match just the language part (e.g., 'es' from 'es-MX')
    const languageCode = discordLocale.split('-')[0] as SupportedLocale;
    if (this.translations.has(languageCode)) {
      return languageCode;
    }

    return this.defaultLocale;
  }

  /**
   * Create Discord localization map for a translation key
   * @param key - The translation key
   * @param variables - Variables to interpolate (optional)
   * @returns Discord LocalizationMap object
   */
  public createLocalizationMap(key: string, variables?: Record<string, any>): LocalizationMap {
    const localizationMap: LocalizationMap = {};

    // Map our supported locales to Discord locales
    const discordLocaleMapping: Record<SupportedLocale, string[]> = {
      'en': ['en-US', 'en-GB'],
      'es': ['es-ES', 'es-419'],
      'fr': ['fr']
    };

    for (const [locale, discordLocales] of Object.entries(discordLocaleMapping)) {
      const translation = this.t(key, locale as SupportedLocale, variables);
      
      // Only add if translation is different from the key (meaning it was found)
      if (translation !== key) {
        for (const discordLocale of discordLocales) {
          (localizationMap as any)[discordLocale] = translation;
        }
      }
    }

    return localizationMap;
  }

  /**
   * Get all available locales
   * @returns Array of supported locales
   */
  public getAvailableLocales(): SupportedLocale[] {
    return Array.from(this.translations.keys());
  }

  /**
   * Check if a locale is supported
   * @param locale - The locale to check
   * @returns True if the locale is supported
   */
  public isLocaleSupported(locale: string): locale is SupportedLocale {
    return this.translations.has(locale as SupportedLocale);
  }
}

// Create a singleton instance
export const localization = new LocalizationService();

/**
 * Convenience function for getting translations
 * @param key - The translation key
 * @param locale - The locale to use
 * @param variables - Variables to interpolate
 * @returns The translated string
 */
export function t(key: string, locale?: SupportedLocale, variables?: Record<string, any>): string {
  return localization.t(key, locale, variables);
}

/**
 * Get locale from Discord interaction
 * @param discordLocale - The Discord locale string
 * @returns The supported locale
 */
export function getLocale(discordLocale?: string): SupportedLocale {
  return localization.getLocaleFromDiscord(discordLocale);
}