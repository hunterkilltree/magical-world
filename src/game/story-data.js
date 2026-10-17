// The story as the browser port reads it: data/story/*.json, in the language the player has (R-094).
import en from '../../data/story/en.json';
import vi from '../../data/story/vi.json';
import { createStory, chooseLanguage } from './story.js';
import { browserStorage } from './profile.js';

export const STORY = createStory({ en, vi }, chooseLanguage({ storage: browserStorage(), languages: typeof navigator !== 'undefined' ? navigator.languages : [] }));
