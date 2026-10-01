import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import en from './en.json';
import cn from './cn.json';
import jp from './jp.json';
import {getLang} from '../core/settings';

export const LANGUAGES = [
  {key: 'en', label: 'English'},
  {key: 'cn', label: '中文'},
  {key: 'jp', label: '日本語'}
] as const;

void i18n.use(initReactI18next).init({
  resources: {en: {translation: en}, cn: {translation: cn}, jp: {translation: jp}},
  lng: getLang(),
  fallbackLng: 'en',
  // Keys are flat, and messages from the network can be passed through t(), so '.' and ':'
  // must not be read as nesting or namespace separators.
  keySeparator: false,
  nsSeparator: false,
  // React escapes rendered text already.
  interpolation: {escapeValue: false},
  returnNull: false
});

export default i18n;
