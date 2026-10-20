// The campaign as the browser port reads it: data/campaign.json, validated once at start-up (R-090). A malformed file
// throws a CampaignError that names every problem, so a bad edit fails loudly instead of playing wrong.
import data from '../../data/campaign.json';
import { loadCampaign } from './campaign.js';

export const CAMPAIGN = loadCampaign(data);
